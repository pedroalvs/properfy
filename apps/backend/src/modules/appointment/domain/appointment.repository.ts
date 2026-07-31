import type { Prisma } from '@prisma/client';
import type {
  AppointmentCustomField,
  PropertyType,
  CancellationReasonCode,
  RejectionReasonCode,
  ServiceTypeFlowType,
} from '@properfy/shared';
import type { AppointmentEntity } from './appointment.entity';
import type { AppointmentContactEntity } from './appointment-contact.entity';
import type { AppointmentRestrictionEntity } from './appointment-restriction.entity';

export interface AppointmentFilters {
  tenantId?: string;
  status?: string[];
  serviceTypeId?: string;
  branchId?: string;
  inspectorId?: string;
  propertyId?: string;
  search?: string;
  /** When set, adds an OR condition for appointment_number = N to the search clause. */
  searchAppointmentNumber?: number;
  fromDate?: string;
  toDate?: string;
  rentalTenantConfirmationStatus?: string[];
  showCancelled?: boolean;
  overdueOnly?: boolean;
  ungroupedOnly?: boolean;
  /** Free time-range filter: match appointments whose start time falls within [timeFrom, timeTo] (HH:mm). */
  timeFrom?: string;
  timeTo?: string;
  /** Search in appointment_contacts snapshot fields (name, email, phone). */
  contactSearch?: string;
  /** When true, only appointments with non-empty rental_tenant_note; when false, only those without. */
  hasRentalTenantNote?: boolean;
  /** Filter by rental_tenant_confirmation_status enum value. */
  confirmationStatus?: string;
  /**
   * Positive membership filter: only appointments belonging to this service
   * group. When set, the default active-status exclusion is bypassed so the
   * group's full membership (incl. CANCELLED/REJECTED) is returned.
   */
  serviceGroupId?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface AppointmentWithRelations {
  appointment: AppointmentEntity;
  /** Primary contact (first in the contacts array). Backward compat. */
  contact: AppointmentContactEntity | null;
  /** All contacts (junction rows). Primary first, then insertion order. */
  contacts: AppointmentContactEntity[];
  restrictions: AppointmentRestrictionEntity[];
  // Enriched join fields (populated by findById)
  propertyCode?: string;
  propertyAddress?: string;
  propertySuburb?: string;
  propertyLatitude?: number | null;
  propertyLongitude?: number | null;
  propertyType?: PropertyType | null;
  propertyAddressLine2?: string | null;
  propertyPrivateAreaM2?: number | null;
  propertyTotalAreaM2?: number | null;
  propertyFurnished?: boolean | null;
  propertyLinenProvided?: boolean | null;
  propertyRentAmount?: number | null;
  branchName?: string;
  serviceTypeName?: string;
  inspectorName?: string | null;
  /** Tenant (agency) name — the "client" surfaced in the map detail panel (025 §FR-451). */
  tenantName?: string;
  /** Tenant's appointment code prefix (e.g. "INS"), used to format appointment codes. */
  tenantAppointmentCodePrefix?: string | null;
  /**
   * True when at least one tenant_portal_token row satisfies:
   * status = 'ACTIVE' AND expires_at > NOW (Node-clock).
   * Populated by PrismaAppointmentRepository via a filtered include.
   * Used by GetAppointmentUseCase to surface the "Copy Portal Link" button state.
   */
  hasActivePortalToken: boolean;
  /** Service group's sequential number (group_number); null/absent when ungrouped. */
  serviceGroupNumber?: number | null;
}

export interface AppointmentListItem {
  appointment: AppointmentEntity;
  contact: AppointmentContactEntity | null;
  propertyCode: string;
  propertyAddress: string;
  propertySuburb?: string;
  propertyLatitude: number | null;
  propertyLongitude: number | null;
  /**
   * Property total area in m²; null when the property has no recorded area.
   *
   * `findAll` is the sole producer and always populates it (so does
   * `findVisibleForInspector`, which delegates to it). It stays optional only so
   * the pre-existing test fixtures that build this type need not enumerate it —
   * `ListAppointmentsUseCase` normalises a missing value to null. Do not read an
   * omission here as "this row has no area".
   */
  propertyTotalAreaM2?: number | null;
  tenantName: string;
  /** Tenant's appointment code prefix (e.g. "INS"), used to format appointment codes. */
  tenantAppointmentCodePrefix: string | null;
  branchName: string;
  serviceTypeName: string;
  serviceTypeFlowType?: ServiceTypeFlowType;
  inspectorName: string | null;
  /** Service group's sequential number (group_number); null when ungrouped. */
  serviceGroupNumber: number | null;
}

// `ContactFilters`, `ContactListItem`, and `ContactDetail` were retired
// alongside the /v1/appointment-contacts routes — the legacy tenant-wide
// contacts board UI was retired in 023 and the AppointmentContactsListTab
// in the chore/ux-baseline-cleanup pass. The contact module owns the
// canonical Contact CRUD; this module no longer exposes a contact list.

export interface VisibleForInspectorParams {
  inspectorId: string;
  fromDate: string;
  toDate: string;
  /** Today's civil date (YYYY-MM-DD) in the platform timezone (Sydney). */
  todayCivil: string;
}

export interface IAppointmentRepository {
  /**
   * `tx` is not optional decoration: a caller that has already written to this
   * appointment inside its own transaction MUST pass it, or this read lands on
   * the global client and returns pre-write values. The portal join depends on
   * seeing its own uncommitted `serviceGroupId`, `inspectorId` and
   * `rentalTenantConfirmationStatus`.
   */
  findById(
    id: string,
    tenantId: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<AppointmentWithRelations | null>;
  findAll(filters: AppointmentFilters, pagination: PaginationParams): Promise<AppointmentListItem[]>;
  /**
   * Returns SCHEDULED appointments for the inspector within the date range,
   * filtered by the T-1 visibility rule internally.
   * This centralizes the T-1 logic so multiple consumers don't re-implement it.
   */
  findVisibleForInspector(params: VisibleForInspectorParams): Promise<AppointmentListItem[]>;
  /**
   * Checks whether a single appointment is visible to the inspector under the T-1 rule.
   * Uses the same centralized T-1 logic as findVisibleForInspector.
   */
  isAppointmentVisibleForInspector(appointmentId: string, todayCivil: string): Promise<boolean>;
  count(filters: AppointmentFilters): Promise<number>;
  save(appointment: AppointmentEntity): Promise<void>;
  update(
    id: string,
    tenantId: string,
    data: Partial<{
      status: string;
      inspectorId: string | null;
      scheduledDate: Date;
      timeSlotStart: string;
      timeSlotEnd: string;
      keyRequired: boolean;
      meetingLocation: string | null;
      keyLocation: string | null;
      rentalTenantConfirmationStatus: string;
      activeConfirmationCycleId: string | null;
      notes: string | null;
      rentalTenantNote: string | null;
      observation: string | null;
      customFieldsJson: AppointmentCustomField[] | null;
      reason: string | null;
      cancellationReasonCode: CancellationReasonCode | null;
      rejectionReasonCode: RejectionReasonCode | null;
      doneMarkedByUserId: string | null;
      doneCheckedByUserId: string | null;
      doneCheckedAt: Date | null;
      serviceGroupId: string | null;
      deletedAt: Date | null;
      branchId: string | null;
      serviceTypeId: string;
      priceAmount: number;
      payoutAmount: number;
      pricingRuleSnapshotJson: Record<string, unknown> | null;
    }>,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
  saveContact(contact: AppointmentContactEntity): Promise<void>;
  /** Update snapshot fields on a specific junction row. Used by portal contact edits and legacy single-contact updates. */
  updateContactSnapshot(
    appointmentId: string,
    contactJunctionId: string,
    data: Partial<{
      snapshotName: string;
      snapshotEmail: string | null;
      snapshotPhone: string | null;
    }>,
  ): Promise<void>;
  /** Delete all contact junction rows for an appointment (used by contact replacement flow). */
  deleteContactsByAppointmentId(appointmentId: string): Promise<void>;
  /** Insert a restriction for an appointment that has none yet (create flow). */
  saveRestriction(restriction: AppointmentRestrictionEntity): Promise<void>;
  /**
   * @deprecated No production callers remain — every upsert path moved to
   * `replaceRestrictions`, which does the delete and the create in one transaction.
   * Kept only so removing it (and the ~31 test doubles that declare it) can be its own
   * change; drop it on the next touch of this port.
   */
  deleteRestrictionsByAppointmentId(appointmentId: string): Promise<void>;
  /**
   * Atomically swap an appointment's restrictions for `restriction` (or none when null).
   * Restriction upserts are delete-then-create; done as two calls, a failure between them
   * leaves zero rows and permanently loses the availability a rental tenant submitted.
   */
  replaceRestrictions(
    appointmentId: string,
    restriction: AppointmentRestrictionEntity | null,
  ): Promise<void>;
  findScheduledOnDate(date: Date): Promise<AppointmentWithRelations[]>;
  findDuplicateForImport(
    propertyId: string,
    serviceTypeId: string,
    tenantId: string,
    sinceDate: Date,
  ): Promise<AppointmentEntity | null>;

  /**
   * Find active appointments scheduled on the given date that have not been confirmed by the tenant.
   * Returns appointments where:
   *  - scheduledDate falls on the given date
   *  - rentalTenantConfirmationStatus != 'CONFIRMED'
   *  - status NOT IN ('DONE', 'CANCELLED', 'REJECTED')
   *  - deletedAt IS NULL
   */
  findUnconfirmedForDate(date: Date): Promise<AppointmentEntity[]>;

  /**
   * Find appointments still awaiting execution that have been stalled longer than
   * OVERDUE_AGE_DAYS — the input to the daily auto-cancel sweep. Returns appointments
   * where:
   *  - createdAt < createdBefore (pass the Sydney-midnight INSTANT of the cutoff civil
   *    date, i.e. `startOfOverdueAgeCutoff()` — `created_at` is a real timestamp, so
   *    UTC midnight of a civil date would be off by the Sydney offset)
   *  - status IN OVERDUE_AUTO_CANCEL_STATUSES (AWAITING_INSPECTOR, SCHEDULED)
   *  - deletedAt IS NULL
   *
   * Note the status list is narrower than OVERDUE_ELIGIBLE_STATUSES: a stale DRAFT is
   * shown as overdue but must never be auto-cancelled.
   *
   * Capped by `limit` so a large historical backlog drains over several runs
   * instead of holding one job open.
   */
  findOverdueForAutoCancel(createdBefore: Date, limit: number): Promise<AppointmentEntity[]>;
}
