import type { ServiceGroupEntity } from './service-group.entity';

export interface ServiceGroupFilters {
  tenantId?: string;
  status?: string[];
  serviceTypeId?: string;
  scheduledDateFrom?: string;
  scheduledDateTo?: string;
  /** Text search on group description. */
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

export interface AgencyRef {
  id: string;
  name: string;
}

export interface ServiceGroupWithAppointments {
  group: ServiceGroupEntity;
  assignedInspectorName?: string | null;
  /** Distinct tenant IDs of the linked appointments. A group is "mixed" when length > 1. */
  tenantIds: string[];
  /** The single tenant id when all appointments share one agency, else null (mixed/cross-agency group). */
  primaryTenantId: string | null;
  /** Distinct agencies (id + name) of the linked appointments — exposed to the UI. */
  agencies: AgencyRef[];
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
  /** Sequential human-friendly group code (pure numeric). */
  groupNumber: number;
  code: string;
  /** Single agency id when the group is single-agency, else null (mixed/cross-agency group). */
  tenantId: string | null;
  /** Agency display name; "Multiple agencies" when the group spans more than one tenant. */
  tenantName: string;
  serviceTypeName: string;
  groupSize: number;
  scheduledDate: Date;
  timeWindow: string;
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
    /** Agency (tenant) name of this appointment — shown per-job in the offer detail. */
    tenantName: string;
    /** Appointment's own slot (bare HH:mm) — preferred over the group timeWindow in the UI. */
    timeSlotStart: string;
    timeSlotEnd: string;
  }>;
}

export interface ServiceGroupListItem {
  group: ServiceGroupEntity;
  assignedInspectorName: string | null;
  /** Derived from linked appointments: single agency id, or null when mixed. */
  primaryTenantId: string | null;
  /** Distinct agencies (id + name) of the linked appointments — exposed to the UI. */
  agencies: AgencyRef[];
}

export interface PortalEligibleSlot {
  groupId: string;
  scheduledDate: Date;
  timeSlotStart: string;
  timeSlotEnd: string;
  suburb: string;
  inspectorName: string;
  confirmedCount: number;
  capacityMax: 10;
}

/**
 * Per-appointment row used by the group "Send portal link" preview + send.
 * Carries the appointment's current schedule and its denormalized tenant
 * confirmation status alongside the active confirmation cycle's date/time, so
 * `classifyPortalLinkAction` can detect a stale (date/time-changed) confirmation.
 * Cross-tenant by design (groups are tenant-agnostic); the per-row `tenantId`
 * lets the use cases scope an OP actor to their own tenant.
 */
export interface GroupAppointmentConfirmationRow {
  id: string;
  appointmentNumber: number;
  tenantId: string;
  status: string;
  scheduledDate: Date;
  timeSlot: string;
  rentalTenantConfirmationStatus: string;
  activeCycle: { scheduledDate: Date; timeSlot: string | null; status: string } | null;
  propertyCode: string | null;
  propertyAddress: string | null;
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
  /**
   * Load the group's appointments with their confirmation state for the
   * "Send portal link" preview + send. Returns all tenants' appointments
   * (cross-tenant group); callers scope by `tenantId` for OP actors.
   */
  findGroupAppointmentsWithConfirmation(
    groupId: string,
  ): Promise<GroupAppointmentConfirmationRow[]>;
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
      regionName: string | null;
      description: string | null;
      serviceRegionId: string | null;
      scheduledDate: Date;
      timeWindow: string;
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
  /**
   * Find member appointment slots in ACCEPTED service groups eligible for a tenant to join via the portal.
   * Criteria: same tenant + same service type, confirmed_count < 10, scheduled_date >= today+1,
   * and at least one appointment in the group has a property within 2 km of `propertyId`.
   */
  findPortalEligibleSlots(params: {
    tenantId: string;
    serviceTypeId: string;
    propertyId: string;
    today: Date;
  }): Promise<PortalEligibleSlot[]>;
  /** Re-check that the selected portal slot still exists on a future member appointment. */
  hasPortalMemberSlot(params: {
    groupId: string;
    scheduledDate: string;
    timeSlotStart: string;
    timeSlotEnd: string;
    today: Date;
  }): Promise<boolean>;
  /**
   * 026 B1 — find DRAFT/PUBLISHED groups that can absorb a batch of appointments.
   * Groups are tenant-agnostic, so addability is service-type/date/status/
   * capacity only (no tenant scoping, and the time window is not a filter).
   */
  findAddableForAppointments(params: {
    serviceTypeId: string;
    scheduledDate: Date;
    batchSize: number;
  }): Promise<Array<{
    id: string;
    groupNumber: number;
    code: string;
    status: string;
    scheduledDate: Date;
    timeWindow: string;
    currentSize: number;
    serviceTypeName: string | null;
  }>>;
}
