import type { Prisma } from '@prisma/client';
import type { PaymentSettings, ServiceTypeEntry, AvailabilityTemplate } from '@properfy/shared';
import type { InspectorEntity } from './inspector.entity';

export interface InspectorFilters {
  status?: string;
  search?: string;
  region?: string;
  serviceTypeId?: string;
  tenantId?: string;
  // F01-1: AM/OP-only filter to inspectors whose base address is not located
  // (base_lat IS NULL). The use case ignores it for CL_* actors.
  missingBaseAddress?: boolean;
}

/**
 * F01-1 app-state heartbeat input (contract 00.10). Applied in a single SQL
 * statement by the repository: last-seen and version always, push derived from
 * the browser permission, install stamped on the first `standalone` only.
 */
export interface RecordAppStateParams {
  id: string;
  now: Date;
  displayMode: 'standalone' | 'browser';
  appVersion: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface IInspectorRepository {
  findById(id: string): Promise<InspectorEntity | null>;
  findByEmail(email: string): Promise<InspectorEntity | null>;
  findByUserId(userId: string): Promise<InspectorEntity | null>;
  linkUserId(inspectorId: string, userId: string): Promise<void>;
  findAll(
    filters: InspectorFilters,
    pagination: PaginationParams,
  ): Promise<InspectorEntity[]>;
  count(filters: InspectorFilters): Promise<number>;
  save(inspector: InspectorEntity): Promise<void>;
  update(
    id: string,
    data: Partial<{
      name: string;
      email: string;
      phone: string | null;
      status: string;
      paymentSettingsJson: PaymentSettings;
      serviceTypesJson: ServiceTypeEntry[];
      fullName: string | null;
      address: Record<string, unknown> | null;
      // F01-1: base coordinates are written atomically with the address — both set
      // on a successful geocode, both cleared (with baseGeocodedAt) when it fails.
      baseLat: number | null;
      baseLng: number | null;
      baseGeocodedAt: Date | null;
      deletedAt: Date | null;
      photoStorageKey: string | null;
      insuranceMetaJson: Record<string, unknown> | null;
      policeCheckMetaJson: Record<string, unknown> | null;
    }>,
  ): Promise<void>;
  /**
   * F01-1 heartbeat. Performs the whole update in one SQL statement and returns
   * the number of rows affected (0 ⇒ the inspector is missing or soft-deleted).
   */
  recordAppState(params: RecordAppStateParams): Promise<number>;
  findByRegionId(regionId: string): Promise<InspectorEntity[]>;
  getAvailabilityTemplate(inspectorId: string): Promise<AvailabilityTemplate>;
  updateAvailabilityTemplate(
    inspectorId: string,
    template: AvailabilityTemplate,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}
