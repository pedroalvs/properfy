import type { Prisma } from '@prisma/client';
import type { ServiceTypeEntity } from './service-type.entity';

export interface ServiceTypeFilters {
  status?: string;
  search?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface IServiceTypeRepository {
  findById(id: string, tx?: Prisma.TransactionClient): Promise<ServiceTypeEntity | null>;
  /** Read-path lookup — ACTIVE only. */
  findByCode(code: string): Promise<ServiceTypeEntity | null>;
  /**
   * Uniqueness lookup — any status. An INACTIVE service type still owns its
   * code, so creating a duplicate must be blocked even when the existing record
   * is inactive (#393).
   */
  findByCodeAnyStatus(code: string): Promise<ServiceTypeEntity | null>;
  findByName(name: string): Promise<ServiceTypeEntity | null>;
  findAll(
    filters: ServiceTypeFilters,
    pagination: PaginationParams,
  ): Promise<ServiceTypeEntity[]>;
  count(filters: ServiceTypeFilters): Promise<number>;
  save(serviceType: ServiceTypeEntity): Promise<void>;
  /** Returns the persisted entity so callers echo the real updated_at (#618). */
  update(
    id: string,
    data: Partial<{
      name: string;
      flowType: string;
      requiresRentalTenantConfirmation: boolean;
      status: string;
    }>,
  ): Promise<ServiceTypeEntity>;
}
