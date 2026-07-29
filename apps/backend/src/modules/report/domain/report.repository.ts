import type { ReportEntity } from './report.entity';
import type { ReportStatus, ReportType } from '@properfy/shared';

export interface ReportFilters {
  /** `null` narrows to cross-agency (platform-wide) runs; a uuid narrows to one agency. */
  tenantId?: string | null;
  /**
   * Narrows to agency runs (`true`) or operator runs (`false`). An agency listing
   * must set `true` alongside `tenantId`: an operator-run report carries the same
   * `tenant_id` but may contain platform-only columns the agency must not see.
   */
  agencyScoped?: boolean;
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
  findExpiredWithFileKey(): Promise<ReportEntity[]>;
  save(entity: ReportEntity): Promise<void>;
  update(entity: ReportEntity): Promise<void>;
}
