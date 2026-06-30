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
  findById(id: string): Promise<ServiceTypeEntity | null>;
  findByCode(code: string): Promise<ServiceTypeEntity | null>;
  findByName(name: string): Promise<ServiceTypeEntity | null>;
  findAll(
    filters: ServiceTypeFilters,
    pagination: PaginationParams,
  ): Promise<ServiceTypeEntity[]>;
  count(filters: ServiceTypeFilters): Promise<number>;
  save(serviceType: ServiceTypeEntity): Promise<void>;
  update(
    id: string,
    data: Partial<{
      name: string;
      flowType: string;
      requiresRentalTenantConfirmation: boolean;
      status: string;
    }>,
  ): Promise<void>;
}
