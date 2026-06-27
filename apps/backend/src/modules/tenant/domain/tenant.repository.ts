import type { TenantEntity } from './tenant.entity';

export interface TenantFilters {
  status?: string;
  search?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface ITenantRepository {
  findById(id: string): Promise<TenantEntity | null>;
  findByLegalName(legalName: string): Promise<TenantEntity | null>;
  findByAppointmentCodePrefix(prefix: string): Promise<TenantEntity | null>;
  findAll(
    filters: TenantFilters,
    pagination: PaginationParams,
  ): Promise<TenantEntity[]>;
  count(filters: TenantFilters): Promise<number>;
  save(tenant: TenantEntity): Promise<void>;
  update(
    id: string,
    data: Partial<{
      name: string;
      legalName: string;
      timezone: string;
      currency: string;
      appointmentCodePrefix: string | null;
      settingsJson: Record<string, unknown>;
      status: string;
      deletedAt: Date | null;
    }>,
  ): Promise<void>;
}
