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
  /**
   * Whether a property with this id exists in the database at all — ignoring tenant
   * scope AND soft-delete. Used to tell "soft-deleted" apart from "absent entirely"
   * (e.g. a job processed by a worker connected to the wrong database).
   */
  existsById(id: string): Promise<boolean>;
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
  /**
   * Find properties stuck in PENDING geocoding with no coordinates, last updated before the
   * given date — these are "lost enqueue" cases (the geocode job never landed in the queue).
   */
  findStalePendingGeocoding(updatedBefore: Date): Promise<Array<{ id: string; tenantId: string }>>;
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
