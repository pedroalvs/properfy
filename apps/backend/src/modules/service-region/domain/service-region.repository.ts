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

export interface ResolvedRegion {
  regionId: string;
  regionName: string;
  color: string;
  matchedAppointmentIds: string[];
}

export interface IServiceRegionRepository {
  findById(id: string, tenantId: string): Promise<ServiceRegionEntity | null>;
  findByName(tenantId: string, name: string): Promise<ServiceRegionEntity | null>;
  findAll(
    tenantId: string,
    filters: ServiceRegionFilters,
    pagination: PaginationParams,
  ): Promise<ServiceRegionEntity[]>;
  count(tenantId: string, filters: ServiceRegionFilters): Promise<number>;
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
  delete(id: string, tenantId: string): Promise<void>;
}
