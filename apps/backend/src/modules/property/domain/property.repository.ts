import type { PropertyEntity } from './property.entity';

export interface PropertyWithBranch {
  property: PropertyEntity;
  branchName: string | null;
}

export interface NearLocationFilter {
  lat: number;
  lng: number;
  radiusKm: number;
}

export interface PropertyFilters {
  tenantId?: string;
  branchId?: string;
  type?: string;
  search?: string;
  hasCoordinates?: boolean;
  nearLocation?: NearLocationFilter;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface IPropertyRepository {
  findById(id: string, tenantId?: string | null): Promise<PropertyEntity | null>;
  findByIdWithBranch(id: string, tenantId?: string | null): Promise<PropertyWithBranch | null>;
  findByPropertyCode(
    propertyCode: string,
    tenantId: string,
  ): Promise<PropertyEntity | null>;
  findAll(
    filters: PropertyFilters,
    pagination: PaginationParams,
  ): Promise<PropertyEntity[]>;
  findAllWithBranch(filters: PropertyFilters, pagination: PaginationParams): Promise<PropertyWithBranch[]>;
  count(filters: PropertyFilters): Promise<number>;
  /** Find properties with FAILED geocoding status that were last updated before the given date. */
  findFailedGeocoding(updatedBefore: Date): Promise<Array<{ id: string; tenantId: string }>>;
  /** Count properties currently in FAILED geocoding status. */
  countFailedGeocoding(): Promise<number>;
  save(property: PropertyEntity): Promise<void>;
  update(
    id: string,
    tenantId: string,
    data: Partial<{
      branchId: string | null;
      propertyCode: string;
      type: string;
      street: string;
      addressLine2: string | null;
      suburb: string;
      postcode: string;
      state: string;
      country: string;
      lat: number | null;
      lng: number | null;
      geocodingStatus: string;
      notes: string | null;
      rulesJson: Record<string, unknown>;
      deletedAt: Date | null;
    }>,
  ): Promise<void>;
}
