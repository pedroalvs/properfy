import type { PaymentSettings, ServiceTypeEntry, ClientEligibilityEntry, AvailabilityTemplate } from '@properfy/shared';
import type { InspectorEntity } from './inspector.entity';

export interface InspectorFilters {
  status?: string;
  search?: string;
  region?: string;
  serviceTypeId?: string;
  tenantId?: string;
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
      clientEligibilityJson: ClientEligibilityEntry[];
      fullName: string | null;
      deletedAt: Date | null;
      photoStorageKey: string | null;
      insuranceMetaJson: Record<string, unknown> | null;
      policeCheckMetaJson: Record<string, unknown> | null;
    }>,
  ): Promise<void>;
  findByRegionId(regionId: string): Promise<InspectorEntity[]>;
  getAvailabilityTemplate(inspectorId: string): Promise<AvailabilityTemplate>;
  updateAvailabilityTemplate(inspectorId: string, template: AvailabilityTemplate): Promise<void>;
}
