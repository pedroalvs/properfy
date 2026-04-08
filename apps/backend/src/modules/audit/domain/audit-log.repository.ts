import type { AuditLogEntity } from './audit-log.entity';

export interface AuditLogFilters {
  tenantId?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  fromDate?: string;
  toDate?: string;
  q?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface IAuditLogRepository {
  save(entry: AuditLogEntity): Promise<void>;
  saveMany(entries: AuditLogEntity[]): Promise<void>;
  findAll(filters: AuditLogFilters, pagination: PaginationParams): Promise<AuditLogEntity[]>;
  count(filters: AuditLogFilters): Promise<number>;
}
