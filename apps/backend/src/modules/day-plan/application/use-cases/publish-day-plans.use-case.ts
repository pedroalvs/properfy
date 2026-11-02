import type { Clock } from '../../../../shared/domain/clock';
import type { AuditService } from '../../../../shared/domain/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { MetricsCollector } from '../../../../shared/infrastructure/metrics';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import type { PublishSystemInspectorNoticeUseCase } from '../../../inspector-notice/application/use-cases/publish-system-inspector-notice.use-case';
import type { IDayPlanInputReader } from '../../domain/day-plan-input.reader';
import type { DayPlanRecord } from '../../domain/day-plan.entity';
import type { IDayPlanRepository } from '../../domain/day-plan.repository';
import { RoutingDeferredError } from '../../domain/routing.service';
import { buildRoutePublishedNotice, routePublishedDedupeKey } from '../day-plan-notices';
import type { ComputeDayPlanUseCase } from './compute-day-plan.use-case';

const DEFAULT_BUDGET_MS = 25 * 60_000;

export interface PublishDayPlansInput {
  /** pg-boss continuation attempt (1-based). Attempts 1–2 are strict; attempt 3 publishes approximate. */
  attempt?: number;
  /** Sequential time budget before enqueuing a continuation (default 25 min). */
  budgetMs?: number;
  now?: Date;
}

export interface PublishDayPlansResult {
  due: number;
  published: number;
  notified: number;
  deferred: number;
  skipped: number;
  failed: number;
  approximate: number;
  infeasible: number;
  durationMs: number;
  /** True when the batch stopped early (deferral or budget) and must be resumed. */
  continuation: boolean;
}

/**
 * The 19:30 auto-publish batch (US2 / contract 00.A2). Over the due set (§6), each
 * inspector is processed sequentially within a time budget: compute + publish the
 * plan, freeze published ETAs, and send one critical `ROUTE_PUBLISHED` notice. A
 * provider deferral stops the whole batch (the shared limiter affects everyone) and
 * asks the worker for a continuation; attempts 1–2 defer rather than approximate,
 * attempt 3 publishes approximate with an explicit reason (L-F04-05/09).
 */
export class PublishDayPlansUseCase {
  constructor(
    private readonly reader: IDayPlanInputReader,
    private readonly repo: IDayPlanRepository,
    private readonly compute: ComputeDayPlanUseCase,
    private readonly notices: PublishSystemInspectorNoticeUseCase,
    private readonly audit: AuditService,
    private readonly metrics: MetricsCollector,
    private readonly logger: Logger,
    private readonly clock: Clock,
  ) {}

  async execute(input: PublishDayPlansInput = {}): Promise<PublishDayPlansResult> {
    const attempt = input.attempt ?? 1;
    const budgetMs = input.budgetMs ?? DEFAULT_BUDGET_MS;
    const computeNow = input.now ?? this.clock.now();
    const startMs = computeNow.getTime();

    const due = await this.repo.loadPublishDue();
    if (due.length === 0) {
      return { due: 0, published: 0, notified: 0, deferred: 0, skipped: 0, failed: 0, approximate: 0, infeasible: 0, durationMs: 0, continuation: false };
    }

    let published = 0;
    let notified = 0;
    let deferred = 0;
    let skipped = 0;
    let failed = 0;
    let infeasible = 0;
    let continuation = false;
    const approxReasons: string[] = [];

    for (let i = 0; i < due.length; i += 1) {
      if (this.clock.now().getTime() - startMs > budgetMs) {
        continuation = true;
        deferred += due.length - i;
        break;
      }
      const entry = due[i]!;
      try {
        const existing = await this.repo.findByInspectorAndDate(entry.inspectorId, entry.date);
        const newlyPublished = !existing || existing.publishedAt === null;
        const record = newlyPublished
          ? await this.compute.execute({
              inspectorId: entry.inspectorId,
              date: entry.date,
              trigger: 'SCHEDULED_PUBLISH',
              attempt,
              now: computeNow,
            })
          : existing;

        if (newlyPublished) {
          published += 1;
          this.audit.log({
            action: 'day_plan.published',
            actorType: 'SYSTEM',
            entityType: 'DayPlan',
            entityId: record.id,
            tenantId: null,
            metadata: {
              inspectorId: entry.inspectorId,
              date: entry.date,
              version: record.version,
              feasible: record.feasible,
              lateS: record.totalLateS,
              approximate: record.approximate,
              approximateReason: record.approximateReason,
            },
          });
          if (record.approximate && record.approximateReason) {
            approxReasons.push(record.approximateReason);
            this.metrics.incrementDayPlansApproximate(record.approximateReason);
          }
          if (!record.feasible) {
            infeasible += 1;
            this.logger.warn(
              {
                inspectorId: entry.inspectorId,
                date: entry.date,
                violations: record.stops.filter((s) => s.lateS > 0).map((s) => ({ appointmentId: s.appointmentId, lateS: s.lateS })),
              },
              'day_plan.published_infeasible',
            );
          }
        }

        if (record.notifiedAt === null) {
          const todayCivil = civilDateInTimezone(computeNow, record.timezone);
          const candidates = await this.reader.loadCandidates(entry.inspectorId, entry.date, todayCivil);
          const { title, body } = this.buildNotice(record, candidates);
          await this.notices.execute({
            type: 'ROUTE_PUBLISHED',
            inspectorIds: [entry.inspectorId],
            title,
            body,
            dedupeKey: routePublishedDedupeKey(entry.inspectorId, entry.date),
          });
          await this.repo.markNotified(record.id);
          notified += 1;
        } else if (!newlyPublished) {
          // Already published and notified before this run — nothing to do.
          skipped += 1;
        }
      } catch (err) {
        if (err instanceof RoutingDeferredError) {
          // The shared rate limiter / provider is unavailable for everyone: stop the
          // batch, leave this inspector and the rest for the continuation.
          continuation = true;
          deferred += due.length - i;
          this.logger.info(
            { inspectorId: entry.inspectorId, date: entry.date, reason: err.reason, attempt },
            'day_plan.publish_deferred',
          );
          break;
        }
        failed += 1;
        this.logger.error(
          { inspectorId: entry.inspectorId, date: entry.date, err: err instanceof Error ? err.message : String(err) },
          'day_plan.publish_failed',
        );
      }
    }

    const durationMs = this.clock.now().getTime() - startMs;
    const hasNonNoProviderApprox = approxReasons.some((r) => r !== 'NO_PROVIDER');
    const level: 'info' | 'error' =
      (approxReasons.length > 0 && hasNonNoProviderApprox) || (deferred > 0 && attempt >= 3) ? 'error' : 'info';
    const summary: PublishDayPlansResult = {
      due: due.length,
      published,
      notified,
      deferred,
      skipped,
      failed,
      approximate: approxReasons.length,
      infeasible,
      durationMs,
      continuation,
    };
    this.logger[level](summary, 'day_plan.publish_completed');
    return summary;
  }

  private buildNotice(
    record: DayPlanRecord,
    candidates: Awaited<ReturnType<IDayPlanInputReader['loadCandidates']>>,
  ): { title: string; body: string } {
    const suburbByAppointment = new Map(candidates.map((c) => [c.appointmentId, c.suburb] as const));
    const first = [...record.stops].sort((a, b) => a.sequence - b.sequence).find((s) => !s.executed) ?? null;
    const lateCount = record.stops.filter((s) => s.lateS > 0).length;
    return buildRoutePublishedNotice({
      planDate: new Date(`${record.planDate}T00:00:00.000Z`),
      timezone: record.timezone,
      count: record.stops.length,
      firstStop: first ? { serviceStartAt: first.serviceStartAt, suburb: suburbByAppointment.get(first.appointmentId) ?? '' } : null,
      finishEta: record.finishEta,
      feasible: record.feasible,
      lateCount,
      approximate: record.approximate,
    });
  }
}
