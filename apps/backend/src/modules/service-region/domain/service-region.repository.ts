import type { ServiceRegionEntity } from './service-region.entity';

export interface ServiceRegionFilters {
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
      geojson: Record<string, unknown>;
      color: string;
      status: string;
    }>,
  ): Promise<void>;
  findPropertyIdsInInspectorRegions(inspectorId: string): Promise<string[]>;
  setInspectorRegions(inspectorId: string, regionIds: string[]): Promise<void>;
  getInspectorRegionIds(inspectorId: string): Promise<string[]>;
  getInspectorRegionIdsBatch(inspectorIds: string[]): Promise<Map<string, string[]>>;
}
