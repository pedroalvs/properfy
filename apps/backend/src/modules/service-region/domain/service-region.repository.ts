import type { ServiceRegionEntity } from './service-region.entity';

export interface ServiceRegionFilters {
  status?: string;
  search?: string;
  /** Narrows the result set to a specific tenant. When undefined together
   *  with a null `tenantId` argument on findAll/count, the query is
   *  platform-wide (AM only). */
  tenantId?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface ResolvedRegion {
  regionId: string;
  regionName: string;
  color: string;
  matchedAppointmentIds: string[];
}

export interface IServiceRegionRepository {
  findById(id: string, tenantId: string | null): Promise<ServiceRegionEntity | null>;
  findByName(tenantId: string, name: string): Promise<ServiceRegionEntity | null>;
  /** Pass `tenantId: null` to query across all tenants (AM only). */
  findAll(
    tenantId: string | null,
    filters: ServiceRegionFilters,
    pagination: PaginationParams,
  ): Promise<ServiceRegionEntity[]>;
  count(tenantId: string | null, filters: ServiceRegionFilters): Promise<number>;
  save(region: ServiceRegionEntity): Promise<void>;
  update(
    id: string,
    tenantId: string,
    data: Partial<{
      name: string;
      geojson: Record<string, unknown>;
      color: string;
      status: string;
    }>,
  ): Promise<void>;
  findPropertyIdsInInspectorRegions(inspectorId: string): Promise<string[]>;
  resolveRegionsForAppointments(tenantId: string, appointmentIds: string[]): Promise<ResolvedRegion[]>;
  findContainingPoint(tenantId: string, lat: number, lng: number): Promise<ServiceRegionEntity[]>;
  countActiveInspectorsInRegion(regionId: string): Promise<number>;
  setInspectorRegions(inspectorId: string, regionIds: string[]): Promise<void>;
  getInspectorRegionIds(inspectorId: string): Promise<string[]>;
  getInspectorRegionIdsBatch(inspectorIds: string[]): Promise<Map<string, string[]>>;
  countPublishedGroupsByRegionId(regionId: string): Promise<number>;
  delete(id: string, tenantId: string): Promise<void>;
}
