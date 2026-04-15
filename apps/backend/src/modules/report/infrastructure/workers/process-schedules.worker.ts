import { randomUUID } from 'node:crypto';
import type { IScheduledReportRepository } from '../../domain/scheduled-report.repository';
import type { IScheduledReportRunRepository } from '../../domain/scheduled-report-run.repository';
import type { RequestReportUseCase } from '../../application/use-cases/request-report.use-case';
import type { IUserManagementRepository } from '../../../user/domain/user-management.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { getNextRunTime, getPreviousRunTime } from '../../domain/cron-parser';
import { ScheduledReportRunEntity } from '../../domain/scheduled-report-run.entity';
import { ScheduledReportEntity } from '../../domain/scheduled-report.entity';
import {
  SCHEDULE_CATCHUP_MAX,
  SCHEDULE_RETRY_BACKOFF_ON_LIMIT_MINUTES,
  REPORT_COLUMNS,
} from '../../domain/report.constants';
import {
  ReportConcurrentLimitExceededError,
  ReportTenantConcurrentLimitExceededError,
} from '../../domain/report.errors';
import type { AuthContext, ReportType, ReportFormat } from '@properfy/shared';

/**
 * Feature 019 US5: reshaped schedule worker.
 *
 * Key behaviors:
 *   1. Auth rehydration: loads the creator from the user repository and builds
 *      a real `AuthContext`. No more `role: 'AM'` synthetic impersonation.
 *   2. Catch-up policy: if multiple cron ticks were missed, inserts up to
 *      `SCHEDULE_CATCHUP_MAX` `skipped_catchup` run rows and executes only the
 *      most recent tick.
 *   3. Idempotency: every run row is keyed by `(schedule_id, scheduled_for)` so
 *      concurrent worker ticks do not produce duplicate reports.
 *   4. Error taxonomy: concurrent-limit errors leave the run queued and bump
 *      next-run by 5 min; permanent errors count toward the auto-pause threshold.
 *   5. Auto-pause: at 3 consecutive failures, the schedule is paused and the
 *      owner is notified (audit only in this wave; owner notification TBD).
 *   6. Report type removed: if `REPORT_COLUMNS[reportType]` is undefined, the
 *      schedule is auto-paused with reason `report_type_removed`.
 */
export class ProcessSchedulesWorker {
  constructor(
    private readonly scheduledReportRepo: IScheduledReportRepository,
    private readonly scheduledReportRunRepo: IScheduledReportRunRepository,
    private readonly requestReportUseCase: RequestReportUseCase,
    private readonly userManagementRepo: IUserManagementRepository,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<{
    processedCount: number;
    failedCount: number;
    skippedCount: number;
    autoPausedCount: number;
  }> {
    const now = new Date();
    const dueSchedules = await this.scheduledReportRepo.findDueForProcessing(now);

    let processedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let autoPausedCount = 0;

    for (const schedule of dueSchedules) {
      try {
        const outcome = await this.processSchedule(schedule, now);
        processedCount += outcome.processed;
        failedCount += outcome.failed;
        skippedCount += outcome.skipped;
        autoPausedCount += outcome.autoPaused;
      } catch (err) {
        failedCount++;
        this.logger.error(
          { scheduleId: schedule.id, error: err },
          'unhandled error processing scheduled report',
        );
      }
    }

    this.logger.info(
      { processedCount, failedCount, skippedCount, autoPausedCount, total: dueSchedules.length },
      'scheduled report processing completed',
    );

    return { processedCount, failedCount, skippedCount, autoPausedCount };
  }

  // ─── Per-schedule processing ─────────────────────────────────────────────

  private async processSchedule(
    schedule: ScheduledReportEntity,
    now: Date,
  ): Promise<{ processed: number; failed: number; skipped: number; autoPaused: number }> {
    // 1. Guard: report type still exists?
    if (!REPORT_COLUMNS[schedule.reportType]) {
      await this.autoPause(schedule, 'report_type_removed');
      return { processed: 0, failed: 0, skipped: 0, autoPaused: 1 };
    }

    // 2. Rehydrate creator's AuthContext
    const creator = await this.userManagementRepo.findById(schedule.createdByUserId);
    if (!creator || !creator.isActive()) {
      await this.autoPause(schedule, 'owner_deactivated');
      return { processed: 0, failed: 0, skipped: 0, autoPaused: 1 };
    }

    const auth: AuthContext = {
      userId: creator.id,
      tenantId: creator.tenantId,
      role: creator.role,
      branchId: null,
      inspectorId: null,
      clUserPermissions: [],
    };

    // 3. Catch-up: compute the target scheduled_for (the most recent cron tick <= now)
    const scheduledFor = getPreviousRunTime(schedule.cronExpression, now);
    if (!scheduledFor) {
      this.logger.warn(
        { scheduleId: schedule.id, cronExpression: schedule.cronExpression },
        'could not compute previous run time from cron expression',
      );
      return { processed: 0, failed: 0, skipped: 0, autoPaused: 0 };
    }

    // 4. Insert `skipped_catchup` rows for intermediate missed periods
    const skippedCatchupCount = await this.insertCatchupRows(schedule, scheduledFor);

    // 5. Idempotent upsert of the real run row
    const existing = await this.scheduledReportRunRepo.findByScheduleAndScheduledFor(
      schedule.id,
      scheduledFor,
    );
    if (existing && existing.status !== 'queued') {
      // Already processed (or being processed). Advance the next_run_at to avoid re-picking.
      const nextRunAt = getNextRunTime(schedule.cronExpression, now);
      schedule.nextRunAt = nextRunAt;
      schedule.updatedAt = now;
      await this.scheduledReportRepo.update(schedule);
      return { processed: 0, failed: 0, skipped: skippedCatchupCount, autoPaused: 0 };
    }

    const run =
      existing ??
      new ScheduledReportRunEntity({
        id: randomUUID(),
        scheduleId: schedule.id,
        reportId: null,
        status: 'queued',
        scheduledFor,
        startedAt: null,
        completedAt: null,
        errorMessage: null,
        recipientCount: null,
        deliveryStatusJson: null,
        createdAt: now,
        updatedAt: now,
      });

    if (!existing) {
      try {
        await this.scheduledReportRunRepo.save(run);
      } catch (err) {
        // Unique-constraint collision = another worker created the run first.
        this.logger.warn(
          { scheduleId: schedule.id, scheduledFor, error: err },
          'race on scheduled_report_runs(schedule_id, scheduled_for) — skipping',
        );
        return { processed: 0, failed: 0, skipped: skippedCatchupCount, autoPaused: 0 };
      }
    }

    // 6. Dispatch the report request
    try {
      const filters = this.buildFiltersForSchedule(schedule.filtersJson, now);
      const result = await this.requestReportUseCase.execute(
        {
          reportType: schedule.reportType as ReportType,
          filters: {
            fromDate: filters.fromDate,
            toDate: filters.toDate,
            tenantId: schedule.tenantId,
            ...this.extractOptionalFilters(schedule.filtersJson),
          },
          format: (schedule.format as ReportFormat) ?? 'XLSX',
          scheduledReportId: schedule.id,
        },
        auth,
      );

      run.reportId = result.reportId;
      run.markRunning(now);
      await this.scheduledReportRunRepo.update(run);

      const nextRunAt = getNextRunTime(schedule.cronExpression, now);
      schedule.recordSuccess(now, nextRunAt);
      await this.scheduledReportRepo.update(schedule);

      return { processed: 1, failed: 0, skipped: skippedCatchupCount, autoPaused: 0 };
    } catch (err) {
      if (
        err instanceof ReportConcurrentLimitExceededError ||
        err instanceof ReportTenantConcurrentLimitExceededError
      ) {
        // Transient: leave run queued, bump next_run_at by 5 minutes, DO NOT
        // increment the failure counter.
        const retryAt = new Date(now.getTime() + SCHEDULE_RETRY_BACKOFF_ON_LIMIT_MINUTES * 60_000);
        schedule.nextRunAt = retryAt;
        schedule.updatedAt = now;
        await this.scheduledReportRepo.update(schedule);
        this.logger.info(
          { scheduleId: schedule.id, retryAt },
          'scheduled run deferred due to concurrent limit',
        );
        return { processed: 0, failed: 0, skipped: skippedCatchupCount + 1, autoPaused: 0 };
      }

      // Permanent error
      const message = err instanceof Error ? err.message : 'Unknown scheduler error';
      run.markFailed(now, message);
      await this.scheduledReportRunRepo.update(run);

      const { autoPaused } = schedule.recordFailure(now);
      if (autoPaused) {
        this.auditService.log({
          tenantId: schedule.tenantId,
          actorType: 'SYSTEM',
          entityType: 'ScheduledReport',
          entityId: schedule.id,
          action: 'scheduledReportAutoPaused',
          reason: 'consecutive_failures',
          metadata: { consecutiveFailures: schedule.consecutiveFailureCount, lastError: message },
        });
      } else {
        // Advance next run for the next tick
        schedule.nextRunAt = getNextRunTime(schedule.cronExpression, now);
      }
      await this.scheduledReportRepo.update(schedule);

      this.logger.error(
        { scheduleId: schedule.id, error: err, autoPaused },
        'scheduled run failed',
      );

      return {
        processed: 0,
        failed: 1,
        skipped: skippedCatchupCount,
        autoPaused: autoPaused ? 1 : 0,
      };
    }
  }

  // ─── Catch-up helper ─────────────────────────────────────────────────────

  private async insertCatchupRows(
    schedule: ScheduledReportEntity,
    scheduledFor: Date,
  ): Promise<number> {
    const lastRun = schedule.lastRunAt;
    if (!lastRun) return 0;

    // Walk backward from `scheduledFor` one tick at a time, stopping at lastRun.
    // Each intermediate tick gets a `skipped_catchup` run row. Capped at
    // SCHEDULE_CATCHUP_MAX to prevent runaway inserts on long outages.
    const ticks: Date[] = [];
    let cursor = getPreviousRunTime(schedule.cronExpression, new Date(scheduledFor.getTime() - 60_000));
    while (cursor && cursor > lastRun && ticks.length < SCHEDULE_CATCHUP_MAX) {
      ticks.push(cursor);
      cursor = getPreviousRunTime(schedule.cronExpression, new Date(cursor.getTime() - 60_000));
    }

    for (const tick of ticks) {
      const existing = await this.scheduledReportRunRepo.findByScheduleAndScheduledFor(
        schedule.id,
        tick,
      );
      if (existing) continue;

      const run = new ScheduledReportRunEntity({
        id: randomUUID(),
        scheduleId: schedule.id,
        reportId: null,
        status: 'skipped_catchup',
        scheduledFor: tick,
        startedAt: null,
        completedAt: new Date(),
        errorMessage: null,
        recipientCount: null,
        deliveryStatusJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      try {
        await this.scheduledReportRunRepo.save(run);
      } catch {
        // race — another worker inserted first
      }
    }
    return ticks.length;
  }

  // ─── Auto-pause helper ───────────────────────────────────────────────────

  private async autoPause(schedule: ScheduledReportEntity, reason: string): Promise<void> {
    schedule.pause();
    schedule.updatedAt = new Date();
    await this.scheduledReportRepo.update(schedule);

    this.auditService.log({
      tenantId: schedule.tenantId,
      actorType: 'SYSTEM',
      entityType: 'ScheduledReport',
      entityId: schedule.id,
      action: 'scheduledReportAutoPaused',
      reason,
      metadata: { scheduleId: schedule.id },
    });

    this.logger.warn(
      { scheduleId: schedule.id, reason },
      'scheduled report auto-paused',
    );
  }

  // ─── Filter builders (preserved from the legacy worker) ──────────────────

  private buildFiltersForSchedule(
    filtersJson: Record<string, unknown>,
    now: Date,
  ): { fromDate: string; toDate: string } {
    if (typeof filtersJson.rangeDays === 'number') {
      const fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - (filtersJson.rangeDays as number));
      return {
        fromDate: this.formatDate(fromDate),
        toDate: this.formatDate(now),
      };
    }

    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - 30);
    return {
      fromDate: this.formatDate(fromDate),
      toDate: this.formatDate(now),
    };
  }

  private extractOptionalFilters(filtersJson: Record<string, unknown>): Record<string, string | undefined> {
    const optional: Record<string, string | undefined> = {};
    if (typeof filtersJson.serviceTypeId === 'string') optional.serviceTypeId = filtersJson.serviceTypeId;
    if (typeof filtersJson.branchId === 'string') optional.branchId = filtersJson.branchId;
    if (typeof filtersJson.inspectorId === 'string') optional.inspectorId = filtersJson.inspectorId;
    if (typeof filtersJson.status === 'string') optional.status = filtersJson.status;
    return optional;
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
