import { BaseEntity } from '../../../shared/domain/entity';
import type { ReportType, ReportFormat, ScheduleDeliveryMode, ScheduleStatus } from '@properfy/shared';
import { SCHEDULE_AUTO_PAUSE_FAILURE_THRESHOLD } from './report.constants';

export interface ScheduledReportProps {
  id: string;
  tenantId: string;
  reportType: ReportType;
  filtersJson: Record<string, unknown>;
  format: ReportFormat;
  cronExpression: string;
  /** @deprecated — Feature 019 replaces this with `deliveryMode` + `recipientUserIds`. Kept for back-compat. */
  deliveryEmail: string;
  displayName: string | null;
  deliveryMode: ScheduleDeliveryMode;
  recipientUserIds: string[];
  skipDeliveryWhenEmpty: boolean;
  consecutiveFailureCount: number;
  status: ScheduleStatus;
  deletedAt: Date | null;
  /** @deprecated — Feature 019 replaces this with `status`. Kept for back-compat with the existing column. */
  isActive: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ScheduledReportEntity extends BaseEntity {
  readonly tenantId: string;
  reportType: ReportType;
  filtersJson: Record<string, unknown>;
  format: ReportFormat;
  cronExpression: string;
  readonly deliveryEmail: string;
  displayName: string | null;
  deliveryMode: ScheduleDeliveryMode;
  recipientUserIds: string[];
  skipDeliveryWhenEmpty: boolean;
  consecutiveFailureCount: number;
  status: ScheduleStatus;
  deletedAt: Date | null;
  isActive: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  /** Mutable to support AM ownership reassignment (Feature 019 FR-028a). */
  createdByUserId: string;

  constructor(props: ScheduledReportProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.tenantId = props.tenantId;
    this.reportType = props.reportType;
    this.filtersJson = props.filtersJson;
    this.format = props.format;
    this.cronExpression = props.cronExpression;
    this.deliveryEmail = props.deliveryEmail;
    this.displayName = props.displayName;
    this.deliveryMode = props.deliveryMode;
    this.recipientUserIds = props.recipientUserIds;
    this.skipDeliveryWhenEmpty = props.skipDeliveryWhenEmpty;
    this.consecutiveFailureCount = props.consecutiveFailureCount;
    this.status = props.status;
    this.deletedAt = props.deletedAt;
    this.isActive = props.isActive;
    this.lastRunAt = props.lastRunAt;
    this.nextRunAt = props.nextRunAt;
    this.createdByUserId = props.createdByUserId;
  }

  /** True when the schedule is active, not soft-deleted, and the next run is due. */
  isDue(now: Date): boolean {
    return (
      this.status === 'ACTIVE' &&
      this.deletedAt === null &&
      this.nextRunAt !== null &&
      this.nextRunAt <= now
    );
  }

  /**
   * Feature 019: transition to PAUSED. Idempotent when already paused.
   */
  pause(): void {
    this.status = 'PAUSED';
    this.isActive = false;
    this.updatedAt = new Date();
  }

  /**
   * Feature 019: transition to ACTIVE and reset the failure counter. The caller
   * is responsible for recomputing `nextRunAt` before persisting (typically via
   * `cron-parser.getNextRunTime`).
   */
  resume(nextRunAt: Date | null): void {
    this.status = 'ACTIVE';
    this.isActive = true;
    this.consecutiveFailureCount = 0;
    this.nextRunAt = nextRunAt;
    this.updatedAt = new Date();
  }

  /**
   * Feature 019: soft-delete. The row is preserved for audit and run-history
   * traceability; `findDueForProcessing` excludes soft-deleted rows.
   */
  softDelete(): void {
    this.deletedAt = new Date();
    this.status = 'PAUSED';
    this.isActive = false;
    this.updatedAt = new Date();
  }

  /**
   * Feature 019: record a successful run — reset the failure counter and advance
   * the run timestamps.
   */
  recordSuccess(now: Date, nextRunAt: Date | null): void {
    this.consecutiveFailureCount = 0;
    this.lastRunAt = now;
    this.nextRunAt = nextRunAt;
    this.updatedAt = now;
  }

  /**
   * Feature 019: record a failed run — increment the counter and auto-pause if
   * we hit the threshold. Returns `{ autoPaused }` so the caller can emit an
   * audit + owner notification on auto-pause.
   */
  recordFailure(now: Date): { autoPaused: boolean } {
    this.consecutiveFailureCount += 1;
    this.lastRunAt = now;
    this.updatedAt = now;
    if (this.consecutiveFailureCount >= SCHEDULE_AUTO_PAUSE_FAILURE_THRESHOLD) {
      this.status = 'PAUSED';
      this.isActive = false;
      return { autoPaused: true };
    }
    return { autoPaused: false };
  }

  /** @deprecated — use `pause()` instead. Kept for back-compat with the legacy code path. */
  deactivate(): void {
    this.pause();
  }

  /** @deprecated — use `recordSuccess(now, nextRunAt)` instead. */
  markRun(now: Date, nextRunAt: Date): void {
    this.recordSuccess(now, nextRunAt);
  }
}
