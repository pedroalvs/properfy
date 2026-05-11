import type { CancellationReasonCode, RejectionReasonCode } from '@properfy/shared';
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
  tenantConfirmationStatus?: string;
  showCancelled?: boolean;
  overdueOnly?: boolean;
  ungroupedOnly?: boolean;
  /** Exact match on the appointment's time_slot field (e.g. "09:00-10:00"). */
  timeSlot?: string;
  /** Search in appointment_contacts snapshot fields (name, email, phone). */
  contactSearch?: string;
  /** When true, only appointments with non-empty tenant_note; when false, only those without. */
  hasTenantNote?: boolean;
  /** Filter by tenant_confirmation_status enum value. */
  confirmationStatus?: string;
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
  branchName?: string;
  serviceTypeName?: string;
  inspectorName?: string | null;
  /** Tenant's appointment code prefix (e.g. "INS"), used to format appointment codes. */
  tenantAppointmentCodePrefix?: string | null;
}

export interface AppointmentListItem {
  appointment: AppointmentEntity;
  contact: AppointmentContactEntity | null;
  propertyCode: string;
  propertyAddress: string;
  propertyLatitude: number | null;
  propertyLongitude: number | null;
  tenantName: string;
  /** Tenant's appointment code prefix (e.g. "INS"), used to format appointment codes. */
  tenantAppointmentCodePrefix: string | null;
  branchName: string;
  serviceTypeName: string;
  inspectorName: string | null;
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
  today: Date;
}

export interface IAppointmentRepository {
  findById(id: string, tenantId: string | null): Promise<AppointmentWithRelations | null>;
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
  isAppointmentVisibleForInspector(appointmentId: string, today: Date): Promise<boolean>;
  count(filters: AppointmentFilters): Promise<number>;
  save(appointment: AppointmentEntity): Promise<void>;
  update(
    id: string,
    tenantId: string,
    data: Partial<{
      status: string;
      inspectorId: string | null;
      scheduledDate: Date;
      timeSlot: string;
      keyRequired: boolean;
      meetingLocation: string | null;
      keyLocation: string | null;
      tenantConfirmationStatus: string;
      notes: string | null;
      tenantNote: string | null;
      customFieldsJson: Record<string, unknown> | null;
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
  ): Promise<void>;
  saveContact(contact: AppointmentContactEntity): Promise<void>;
  /** @deprecated Use updateContactSnapshot for junction-aware writes. Kept during expand phase. */
  updateContact(
    appointmentId: string,
    data: Partial<{
      tenantName: string;
      primaryEmail: string | null;
      secondaryEmail: string | null;
      primaryPhone: string | null;
      secondaryPhone: string | null;
    }>,
  ): Promise<void>;
  /** Update snapshot fields on a specific junction row. Used by portal dual-write (feature 007 FR-053). */
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
  saveRestriction(restriction: AppointmentRestrictionEntity): Promise<void>;
  deleteRestrictionsByAppointmentId(appointmentId: string): Promise<void>;
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
   *  - tenantConfirmationStatus != 'CONFIRMED'
   *  - status NOT IN ('DONE', 'CANCELLED', 'REJECTED')
   *  - deletedAt IS NULL
   */
  findUnconfirmedForDate(date: Date): Promise<AppointmentEntity[]>;
}
