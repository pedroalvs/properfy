import type { ScheduledReportRunEntity } from './scheduled-report-run.entity';

export interface IScheduledReportRunRepository {
  save(entity: ScheduledReportRunEntity): Promise<void>;
  update(entity: ScheduledReportRunEntity): Promise<void>;
  findById(id: string): Promise<ScheduledReportRunEntity | null>;
  findByReportId(reportId: string): Promise<ScheduledReportRunEntity | null>;
  findByScheduleAndScheduledFor(
    scheduleId: string,
    scheduledFor: Date,
  ): Promise<ScheduledReportRunEntity | null>;
  findByScheduleId(
    scheduleId: string,
    page: number,
    pageSize: number,
  ): Promise<ScheduledReportRunEntity[]>;
  countByScheduleId(scheduleId: string): Promise<number>;
  findLatestForSchedule(scheduleId: string): Promise<ScheduledReportRunEntity | null>;
  findLatestForSchedules(scheduleIds: string[]): Promise<Map<string, ScheduledReportRunEntity>>;
}
