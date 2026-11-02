import type { AuthContext, DayPlanResponse } from '@properfy/shared';
import type { Clock } from '../../../../shared/domain/clock';
import type { AuditService } from '../../../../shared/domain/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import type { PublishSystemInspectorNoticeUseCase } from '../../../inspector-notice/application/use-cases/publish-system-inspector-notice.use-case';
import type { IDayPlanInputReader } from '../../domain/day-plan-input.reader';
import type { DayPlanRecord } from '../../domain/day-plan.entity';
import type { IDayPlanRepository } from '../../domain/day-plan.repository';
import { dayPlanDateInPast, dayPlanNotFound, inspectorNotFound } from '../../domain/day-plan.errors';
import { buildRouteChangedNotice, routeChangedDedupeKey } from '../day-plan-notices';
import { buildDayPlanResponse } from '../day-plan-response.builder';
import type { ComputeDayPlanUseCase } from './compute-day-plan.use-case';

export interface RecalculateDayPlanInput {
  actor: AuthContext;
  inspectorId: string;
  date: string;
  now?: Date;
}

const EFFECTIVE_CHANGE_SECONDS = 300;

/** Reorderable order changed, or any stop's serviceStartAt moved > 5 min (L-F04-06). */
export function hasEffectiveChange(prev: DayPlanRecord, next: DayPlanRecord): boolean {
  const order = (r: DayPlanRecord): string[] =>
    r.stops.filter((s) => !s.executed).sort((a, b) => a.sequence - b.sequence).map((s) => s.appointmentId);
  const prevOrder = order(prev);
  const nextOrder = order(next);
  if (prevOrder.length !== nextOrder.length || prevOrder.some((id, i) => id !== nextOrder[i])) return true;

  const prevStart = new Map(prev.stops.map((s) => [s.appointmentId, s.serviceStartAt?.getTime() ?? null] as const));
  const nextStart = new Map(next.stops.map((s) => [s.appointmentId, s.serviceStartAt?.getTime() ?? null] as const));
  if (prevStart.size !== nextStart.size) return true;
  for (const [id, t] of nextStart) {
    if (!prevStart.has(id)) return true;
    const p = prevStart.get(id)!;
    if (p === null || t === null) {
      if (p !== t) return true;
      continue;
    }
    if (Math.abs(t - p) > EFFECTIVE_CHANGE_SECONDS * 1000) return true;
  }
  return false;
}

/** Shared by the inspector ("reset to suggested") and AM/OP (with ROUTE_CHANGED on an effective change). */
export class RecalculateDayPlanUseCase {
  constructor(
    private readonly reader: IDayPlanInputReader,
    private readonly repo: IDayPlanRepository,
    private readonly compute: ComputeDayPlanUseCase,
    private readonly authorization: AuthorizationService,
    private readonly notices: PublishSystemInspectorNoticeUseCase,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async execute(input: RecalculateDayPlanInput): Promise<DayPlanResponse> {
    const now = input.now ?? this.clock.now();
    const isOperator = input.actor.role !== 'INSP';
    if (isOperator) {
      this.authorization.assertRoles(input.actor, ['AM', 'OP'], {
        action: 'day_plan.recalculate',
        entityType: 'DayPlan',
      });
    } else if (input.actor.inspectorId !== input.inspectorId) {
      // An inspector may only recalculate their OWN plan — never another inspector's
      // (the AM/OP route takes inspectorId from the URL; this closes cross-inspector IDOR).
      throw new ForbiddenError('FORBIDDEN', 'You can only recalculate your own day plan');
    }

    const inspector = await this.reader.loadInspectorContext(input.inspectorId);
    if (!inspector || (!isOperator && !inspector.active)) {
      throw isOperator ? inspectorNotFound() : dayPlanNotFound();
    }

    const todayCivil = civilDateInTimezone(now, inspector.timezone);
    if (input.date < todayCivil) throw dayPlanDateInPast();

    const prev = await this.repo.findByInspectorAndDate(input.inspectorId, input.date);
    if (!prev && !isOperator) throw dayPlanNotFound();

    const record = await this.compute.execute({
      inspectorId: input.inspectorId,
      date: input.date,
      trigger: 'MANUAL_RECALC',
      actorUserId: input.actor.userId,
      now,
    });

    this.audit.log({
      action: 'day_plan.recalculated',
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'DayPlan',
      entityId: record.id,
      tenantId: null,
      metadata: { trigger: 'MANUAL_RECALC', inspectorId: input.inspectorId, date: input.date, previousVersion: prev?.version ?? null, version: record.version },
    });

    const candidates = await this.reader.loadCandidates(input.inspectorId, input.date, todayCivil);

    // AM/OP recalc of an already-published plan notifies only on an effective change (≤1/10 min).
    if (isOperator && prev?.publishedAt && hasEffectiveChange(prev, record)) {
      const firstNotStarted = record.stops
        .filter((s) => !s.executed)
        .sort((a, b) => a.sequence - b.sequence)[0];
      const firstCandidate = firstNotStarted
        ? candidates.find((c) => c.appointmentId === firstNotStarted.appointmentId)
        : undefined;
      const remaining = candidates.filter((c) => c.appointmentStatus !== 'DONE').length;
      const { title, body } = buildRouteChangedNotice({
        planDate: new Date(`${input.date}T00:00:00.000Z`),
        timezone: record.timezone,
        remaining,
        firstStop:
          firstNotStarted && firstCandidate
            ? { serviceStartAt: firstNotStarted.serviceStartAt, suburb: firstCandidate.suburb }
            : null,
      });
      await this.notices.execute({
        type: 'ROUTE_CHANGED',
        inspectorIds: [input.inspectorId],
        title,
        body,
        dedupeKey: routeChangedDedupeKey(record.id, now),
        targetPath: '/today',
      });
    }

    return buildDayPlanResponse(record, candidates, inspector, now, input.date === todayCivil);
  }
}
