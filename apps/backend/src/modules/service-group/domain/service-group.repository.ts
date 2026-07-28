import type { ServiceGroupEntity } from './service-group.entity';

export interface ServiceGroupFilters {
  tenantId?: string;
  status?: string[];
  serviceTypeId?: string;
  scheduledDateFrom?: string;
  scheduledDateTo?: string;
  /** Text search on group description; all-digit terms also match the group code (group_number). */
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
    /** Member's own slot, `HH:mm`. Needed to clamp members into a changed group window. */
    timeSlotStart: string;
    timeSlotEnd: string;
    /**
     * Denormalized confirmation state. Together with `activeConfirmationCycleId`
     * it answers "was the rental tenant already told about the OLD schedule?" —
     * the gate a schedule change uses to decide whether to re-notify.
     */
    rentalTenantConfirmationStatus: string;
    activeConfirmationCycleId: string | null;
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
  /**
   * Null when the property has not been geocoded. Rows are returned rather
   * than dropped so callers can distinguish "this group has appointments that
   * cannot be plotted" from "this group has no appointments at all" — the two
   * need different fixes and the map has to say which one it is.
   */
  latitude: number | null;
  longitude: number | null;
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
    /** Property street line (rua/avenida); '' when the property is missing. */
    street: string;
    /** Property lat/lng for the PWA map drill-down; null while geocoding is pending/failed. */
    coordinates: { lat: number; lng: number } | null;
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

/**
 * One appointment inside a portal-eligible group, on the day it is scheduled.
 *
 * Rows are per-member rather than pre-aggregated per time slot because a
 * window's capacity is an interval-packing computation over the whole group —
 * see `domain/portal-slot-capacity.ts`. Aggregating in SQL would throw away the
 * sibling windows the computation needs.
 */
export interface PortalEligibleGroupMember {
  groupId: string;
  scheduledDate: Date;
  timeSlotStart: string;
  timeSlotEnd: string;
  suburb: string;
  inspectorName: string;
  /**
   * Whether the appointment belongs to the agency asking for slots. Groups are
   * cross-agency: every member consumes the inspector's time, but only the
   * caller's own windows are offered back to the tenant.
   */
  isOwnAgency: boolean;
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

/**
 * Outcome of `reservePortalWindow`. `WINDOW_FULL` means the slot was taken
 * while the tenant was deciding; `APPOINTMENT_INACTIVE` means the appointment
 * itself was cancelled, finished or deleted after the caller last checked, so
 * there is nothing to move and no side effect should follow.
 */
export type PortalWindowReservation =
  | { ok: true }
  | { ok: false; reason: 'WINDOW_FULL' | 'APPOINTMENT_INACTIVE' };

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
   * Swap the inspector across every member in one transaction.
   *
   * Unlike `scheduleAppointments`, this also covers members that are already
   * SCHEDULED: they keep their status and only change hands. Reassigning an
   * accepted group is `SCHEDULED → SCHEDULED`, which the appointment state
   * machine rejects, so it cannot go through the transition use case.
   */
  assignInspectorToGroupAppointments(
    groupId: string,
    inspectorId: string,
  ): Promise<{ reassigned: number; scheduled: number }>;
  /**
   * Find the member appointments of ACCEPTED service groups a tenant may join
   * via the portal. Group eligibility: same agency + same service type,
   * scheduled_date >= today+1, and at least one appointment in the group has a
   * property within 2 km of `propertyId`. `excludeGroupId` drops the
   * appointment's current group from the results.
   *
   * Returns *every* active member of each eligible group, including other
   * agencies' — they occupy the inspector all the same, and leaving them out
   * would under-count capacity. `isOwnAgency` marks which ones may be offered.
   */
  findPortalEligibleSlots(params: {
    tenantId: string;
    serviceTypeId: string;
    propertyId: string;
    today: Date;
    excludeGroupId?: string | null;
  }): Promise<PortalEligibleGroupMember[]>;
  /**
   * Serialize the portal capacity decision with the write that consumes it.
   *
   * Locks the group row, recomputes the window's availability from the members
   * visible inside that transaction, and only then moves the appointment into
   * the window. Writes nothing unless it returns `{ ok: true }`.
   *
   * The check and the write must share one transaction: performed separately,
   * two portal tokens can both read the last free slot and both take it. The
   * single-use token guard does not help, because it only serializes retries of
   * the *same* token, not two different tenants racing for one opening.
   *
   * The two failure reasons are kept apart because they send the tenant
   * somewhere different: a full window means "pick another time", an inactive
   * appointment means there is nothing left to move.
   */
  reservePortalWindow(params: {
    groupId: string;
    appointmentId: string;
    tenantId: string;
    /** YYYY-MM-DD */
    scheduledDate: string;
    timeSlotStart: string;
    timeSlotEnd: string;
    inspectorId: string;
    rentalTenantNote?: string;
  }): Promise<PortalWindowReservation>;
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
   * Groups are tenant-agnostic, so addability is service-type/status/capacity
   * only (no tenant scoping; date and time window are not filters —
   * appointments are re-scheduled to the group's date on join).
   */
  findAddableForAppointments(params: {
    serviceTypeId: string;
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
