import type { ServiceGroupEntity } from './service-group.entity';

export interface ServiceGroupFilters {
  tenantId?: string;
  status?: string[];
  serviceTypeId?: string;
  scheduledDateFrom?: string;
  scheduledDateTo?: string;
  priorityMode?: string;
  /** Text search on group name and description. */
  search?: string;
  /** Filter by branch ID of linked appointments. */
  branchId?: string;
  /** Search in linked appointments' contact snapshots (name, email, phone). */
  contactSearch?: string;
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
    scheduledDate: Date;
    propertyAddress: string | null;
    propertyCode: string | null;
  }>;
}

/**
 * Lightweight appointment shape used by the service-groups map page.
 * Joins property coordinates and the assigned inspector's name. Carries
 * `serviceGroupId` so the use case can group results by parent group id.
 */
export interface ServiceGroupMapAppointment {
  id: string;
  serviceGroupId: string;
  code: string;
  status: string;
  address: string;
  latitude: number;
  longitude: number;
  scheduledDate: Date;
  inspectorName: string | null;
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
  appointmentCount: number;
  centroid: { lat: number; lng: number } | null;
}

export interface MarketplaceOfferDetail extends MarketplaceOffer {
  addresses: string[];
  keyRequired: boolean;
  notes: string | null;
  appointments: Array<{
    id: string;
    appointmentNumber: number;
    suburb: string;
    keyRequired: boolean;
    notes: string | null;
    payoutAmount: number | null;
  }>;
}

export interface ServiceGroupListItem {
  group: ServiceGroupEntity;
  assignedInspectorName: string | null;
}

export interface PortalEligibleGroup {
  id: string;
  scheduledDate: Date;
  timeWindow: string;
  suburb: string;
  inspectorName: string;
  confirmedCount: number;
  capacityMax: 10;
}

export interface IServiceGroupRepository {
  findById(id: string, tenantId: string | null): Promise<ServiceGroupWithAppointments | null>;
  findAll(
    filters: ServiceGroupFilters,
    pagination: PaginationParams,
  ): Promise<ServiceGroupListItem[]>;
  /**
   * Batch-fetch the appointments belonging to the given groups together with
   * property coordinates + inspector name. Used by the map page; returns a
   * flat list — caller groups by `serviceGroupId`.
   */
  findAppointmentsForMapByGroupIds(
    groupIds: string[],
  ): Promise<ServiceGroupMapAppointment[]>;
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
      serviceRegionId: string | null;
      scheduledDate: Date;
      timeWindow: string;
      priorityMode: string;
      exceptionType: string | null;
      exceptionReason: string | null;
    }>,
  ): Promise<void>;
  /** Optimistic lock: updates status from PUBLISHED to ACCEPTED atomically. Returns count of updated rows (0 means race lost). */
  acceptOptimistic(id: string, inspectorId: string, assignedAt: Date): Promise<number>;
  /**
   * `inspectorBlockedClients` is the list of tenant IDs the inspector is blocked
   * from. Empty list means eligible for all tenants. Mirrors the denylist model
   * enforced by `AcceptOfferUseCase` via `Inspector.isEligibleForTenant`.
   */
  findPublishedForInspector(
    inspectorId: string,
    inspectorServiceTypes: string[],
    inspectorBlockedClients: string[],
    pagination: PaginationParams,
  ): Promise<MarketplaceOffer[]>;
  countPublishedForInspector(
    inspectorId: string,
    inspectorServiceTypes: string[],
    inspectorBlockedClients: string[],
  ): Promise<number>;
  findPublishedOfferDetail(
    groupId: string,
    inspectorId: string,
    inspectorServiceTypes: string[],
    inspectorBlockedClients: string[],
  ): Promise<MarketplaceOfferDetail | null>;
  /** Atomic decrement of confirmed_count (for detach flows). */
  decrementConfirmedCount(groupId: string): Promise<void>;
  /** Atomic increment of confirmed_count (for join flows). */
  incrementConfirmedCount(groupId: string): Promise<void>;
  /** Set service_group_id on appointments */
  linkAppointments(appointmentIds: string[], groupId: string): Promise<void>;
  /** Clear service_group_id on appointments */
  unlinkAppointments(groupId: string): Promise<void>;
  /** Revert all SCHEDULED appointments in a group back to AWAITING_INSPECTOR and clear inspector_id */
  revertScheduledAppointments(groupId: string): Promise<number>;
  /** Atomically transition all group's appointments to SCHEDULED with inspector */
  scheduleAppointments(groupId: string, inspectorId: string): Promise<number>;
  /** Find PUBLISHED groups whose priority window has expired */
  findExpiredPublished(): Promise<ServiceGroupEntity[]>;
  /**
   * Find ACCEPTED service groups eligible for a tenant to join via the portal.
   * Criteria: same tenant + same service type, confirmed_count < 10, scheduled_date >= today+1,
   * and at least one appointment in the group has a property within 2 km of `propertyId`.
   */
  findPortalEligibleGroups(params: {
    tenantId: string;
    serviceTypeId: string;
    propertyId: string;
    today: Date;
  }): Promise<PortalEligibleGroup[]>;
  /** 026 B1 — find DRAFT/PUBLISHED groups that can absorb a batch of same-property appointments. */
  findAddableForAppointments(params: {
    tenantId: string;
    serviceTypeId: string;
    scheduledDate: Date;
    timeSlot: string;
    batchSize: number;
  }): Promise<Array<{
    id: string;
    name: string | null;
    status: string;
    scheduledDate: Date;
    timeWindow: string;
    currentSize: number;
    serviceTypeName: string | null;
  }>>;
}
