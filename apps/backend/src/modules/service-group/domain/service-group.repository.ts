import type { ServiceGroupEntity } from './service-group.entity';

export interface ServiceGroupFilters {
  tenantId?: string;
  status?: string;
  serviceTypeId?: string;
  scheduledDateFrom?: string;
  scheduledDateTo?: string;
  priorityMode?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface ServiceGroupWithAppointments {
  group: ServiceGroupEntity;
  assignedInspectorName?: string | null;
  appointments: Array<{
    id: string;
    appointmentNumber: number;
    status: string;
    serviceTypeId: string;
    tenantId: string;
    propertyId: string;
    serviceGroupId: string | null;
  }>;
}

export interface MarketplaceOffer {
  groupId: string;
  tenantId: string;
  tenantName: string;
  serviceTypeName: string;
  groupSize: number;
  scheduledDate: Date;
  timeWindow: string;
  priorityMode: string;
  priorityExpiresAt: Date | null;
  suburbs: string[];
  payoutEstimate: number | null;
  addresses: string[];
  keyRequired: boolean;
}

export interface ServiceGroupListItem {
  group: ServiceGroupEntity;
  assignedInspectorName: string | null;
}

export interface IServiceGroupRepository {
  findById(id: string, tenantId: string | null): Promise<ServiceGroupWithAppointments | null>;
  findAll(
    filters: ServiceGroupFilters,
    pagination: PaginationParams,
  ): Promise<ServiceGroupListItem[]>;
  count(filters: ServiceGroupFilters): Promise<number>;
  save(group: ServiceGroupEntity): Promise<void>;
  update(
    id: string,
    data: Partial<{
      status: string;
      offeredCount: number;
      confirmedCount: number;
      assignedInspectorId: string | null;
      publishedAt: Date | null;
      assignedAt: Date | null;
      priorityExpiresAt: Date | null;
      name: string | null;
      regionName: string | null;
      description: string | null;
    }>,
  ): Promise<void>;
  /** Optimistic lock: updates status from PUBLISHED to ACCEPTED atomically. Returns count of updated rows (0 means race lost). */
  acceptOptimistic(id: string, inspectorId: string, assignedAt: Date): Promise<number>;
  findPublishedForInspector(
    inspectorId: string,
    inspectorServiceTypes: string[],
    inspectorClientEligibility: string[],
    pagination: PaginationParams,
  ): Promise<MarketplaceOffer[]>;
  countPublishedForInspector(
    inspectorId: string,
    inspectorServiceTypes: string[],
    inspectorClientEligibility: string[],
  ): Promise<number>;
  /** Set service_group_id on appointments */
  linkAppointments(appointmentIds: string[], groupId: string): Promise<void>;
  /** Clear service_group_id on appointments */
  unlinkAppointments(groupId: string): Promise<void>;
  /** Revert all SCHEDULED appointments in a group back to AWAITING_INSPECTOR and clear inspector_id */
  revertScheduledAppointments(groupId: string): Promise<number>;
  /** Atomically transition all group's appointments to SCHEDULED with inspector */
  scheduleAppointments(groupId: string, inspectorId: string): Promise<number>;
}
