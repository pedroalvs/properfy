import type { ScheduledReportEntity } from './scheduled-report.entity';

export interface ScheduledReportFilters {
  tenantId?: string;
  isActive?: boolean;
}

export interface IScheduledReportRepository {
  findById(id: string): Promise<ScheduledReportEntity | null>;
  findDueSchedules(now: Date): Promise<ScheduledReportEntity[]>;
  findAll(filters: ScheduledReportFilters, page: number, pageSize: number): Promise<ScheduledReportEntity[]>;
  count(filters: ScheduledReportFilters): Promise<number>;
  save(entity: ScheduledReportEntity): Promise<void>;
  update(entity: ScheduledReportEntity): Promise<void>;
}
