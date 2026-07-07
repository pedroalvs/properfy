import type { PropertyEntity } from './property.entity';

export interface PropertyWithBranch {
  property: PropertyEntity;
  branchName: string | null;
  tenantName: string | null;
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
  /**
   * "Perfect match" lookup for the appointment-import property-reuse rule —
   * exact match (via the normalized-address key, see
   * `shared/domain/normalize-address.ts`) within the tenant, excluding
   * soft-deleted rows. Backed by the `properties_normalized_address_active_unique`
   * partial unique index, so this is an indexed equality lookup, not a scan.
   */
  findByNormalizedAddress(
    tenantId: string,
    addr: { street: string; addressLine2: string | null; suburb: string; state: string; postcode: string },
  ): Promise<PropertyEntity | null>;
  /**
   * Batched counterpart of `findByNormalizedAddress` — one indexed `IN` query
   * for many keys instead of many round-trips, for callers (e.g. the
   * appointment-import row resolver) that need to match hundreds/thousands
   * of rows against existing properties in a single pass.
   */
  findManyByNormalizedAddressKeys(tenantId: string, keys: string[]): Promise<PropertyEntity[]>;
  findAll(
    filters: PropertyFilters,
    pagination: PaginationParams,
  ): Promise<PropertyEntity[]>;
  findAllWithBranch(filters: PropertyFilters, pagination: PaginationParams): Promise<PropertyWithBranch[]>;
  count(filters: PropertyFilters): Promise<number>;
  /**
   * Count non-deleted properties grouped by type. `type` is excluded from the
   * filters on purpose — callers (the summary endpoint) need per-type counts
   * that ignore any type filter applied to the list. The accepted filters are
   * narrowed to what the implementation actually applies (no spatial branch),
   * so an unsupported filter is a compile error rather than silently dropped.
   */
  countByType(
    filters: Pick<PropertyFilters, 'tenantId' | 'branchId' | 'search'>,
  ): Promise<Record<string, number>>;
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
      privateAreaM2: number | null;
      totalAreaM2: number | null;
      furnished: boolean | null;
      linenProvided: boolean | null;
      rentAmount: number | null;
      notes: string | null;
      rulesJson: Record<string, unknown>;
      deletedAt: Date | null;
    }>,
  ): Promise<void>;
}
