import type { ServiceRegionEntity } from './service-region.entity';

export interface ServiceRegionFilters {
  country?: string;
  state?: string;
  status?: string;
  search?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface IServiceRegionRepository {
  findById(id: string): Promise<ServiceRegionEntity | null>;
  findAll(
    filters: ServiceRegionFilters,
    pagination: PaginationParams,
  ): Promise<ServiceRegionEntity[]>;
  count(filters: ServiceRegionFilters): Promise<number>;
  save(region: ServiceRegionEntity): Promise<void>;
  update(
    id: string,
    data: Partial<{
      name: string;
      status: string;
    }>,
  ): Promise<void>;
  addSuburbs(regionId: string, suburbIds: string[]): Promise<void>;
  removeSuburbs(regionId: string, suburbIds: string[]): Promise<void>;
}
