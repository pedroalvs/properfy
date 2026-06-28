import type { ScheduledReportEntity } from './scheduled-report.entity';
import type { ScheduleStatus } from '@properfy/shared';

export interface ScheduledReportFilters {
  tenantId?: string;
  status?: ScheduleStatus;
  includeDeleted?: boolean;
  createdByUserId?: string;
}

export interface IScheduledReportRepository {
  /** Returns a schedule by id if it exists AND is not soft-deleted. */
  findById(id: string): Promise<ScheduledReportEntity | null>;
  /** Returns a schedule by id including soft-deleted ones (for admin / history views). */
  findByIdIncludingDeleted(id: string): Promise<ScheduledReportEntity | null>;
  /**
   * Feature 019: canonical query for the worker tick.
   * Returns schedules where status = 'ACTIVE' AND deleted_at IS NULL AND next_run_at <= now.
   */
  findDueForProcessing(now: Date): Promise<ScheduledReportEntity[]>;
  /** @deprecated — use findDueForProcessing. Kept as a thin wrapper for back-compat. */
  findDueSchedules(now: Date): Promise<ScheduledReportEntity[]>;
  findAll(filters: ScheduledReportFilters, page: number, pageSize: number): Promise<ScheduledReportEntity[]>;
  count(filters: ScheduledReportFilters): Promise<number>;
  /** Feature 019: counts non-deleted, non-paused schedules owned by a user (for MAX_SCHEDULES_PER_USER). */
  countActiveByOwner(userId: string): Promise<number>;
  save(entity: ScheduledReportEntity): Promise<void>;
  update(entity: ScheduledReportEntity): Promise<void>;
}
