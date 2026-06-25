import type { ReportEntity } from './report.entity';
import type { ReportStatus, ReportType } from '@properfy/shared';

export interface ReportFilters {
  tenantId?: string | null;
  requestedByUserId?: string;
  reportType?: ReportType;
  status?: ReportStatus;
  fromDate?: string;
  toDate?: string;
}

export interface IReportRepository {
  findById(id: string): Promise<ReportEntity | null>;
  findAll(filters: ReportFilters, page: number, pageSize: number): Promise<ReportEntity[]>;
  count(filters: ReportFilters): Promise<number>;
  countByUserAndStatuses(userId: string, statuses: ReportStatus[]): Promise<number>;
  countByTenantAndStatuses(tenantId: string, statuses: ReportStatus[]): Promise<number>;
  findExpiredWithFileKey(): Promise<ReportEntity[]>;
  save(entity: ReportEntity): Promise<void>;
  update(entity: ReportEntity): Promise<void>;
}
