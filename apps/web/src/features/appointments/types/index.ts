import type {
  AppointmentStatus,
  PropertyType,
  RentalTenantConfirmationStatus,
  AppointmentContactRole,
  ContactType,
  ContactChannelType,
  AppointmentCustomField,
  AppointmentApp,
  AvailableSlot,
} from '@properfy/shared';
import { CUSTOM_FIELDS_MAX } from '@properfy/shared';

export type { AppointmentStatus } from '@properfy/shared';

export interface Appointment {
  id: string;
  appointmentNumber: number;
  code: string;
  tenantId: string;
  /**
   * Tenant (agency) display name. The API sends it as `clientName` — there is no
   * `tenantName` on the wire, and adding one here would silently read undefined:
   * Fastify strips any field absent from `appointmentResponseSchema`.
   */
  clientName?: string;
  branchId: string;
  branchName: string;
  propertyId: string;
  propertyAddress: string;
  serviceTypeId: string;
  serviceTypeName: string;
  /**
   * Service type flow (ROUTINE | INGOING | OUTGOING). Optional because older
   * cached payloads predate the field. INGOING/OUTGOING have no occupant, which
   * is why the occupant-facing actions are disabled for them.
   */
  flowType?: string | null;
  status: AppointmentStatus;
  rentalTenantConfirmationStatus: RentalTenantConfirmationStatus;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  inspectorId: string | null;
  inspectorName: string | null;
  scheduledDate: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  keyRequired: boolean;
  notes: string | null;
  doneCheckedByUserId?: string | null;
  doneCheckedAt?: string | null;
  serviceGroupId?: string | null;
  /** Service group code = String(group_number); null when ungrouped. */
  serviceGroupCode?: string | null;
  isOverdue: boolean;
  hasRentalTenantNote: boolean;
  /**
   * Note text the rental tenant left in the portal. The list endpoint returns it
   * alongside `hasRentalTenantNote` (declared in the shared response schema), so
   * the list and board can show the message without opening the detail.
   */
  rentalTenantNote?: string | null;
  /** Property total area in m²; null for legacy properties with no recorded area. */
  propertyTotalAreaM2?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentFiltersState {
  search: string;
  status: string;
  rentalTenantConfirmationStatus: string;
  tenantId: string;
  branchId: string;
  inspectorId: string;
  serviceTypeId: string;
  startDate: string;
  endDate: string;
  showCancelled: boolean;
  overdueOnly: boolean;
}

export interface AppointmentContactEntry {
  id?: string;
  contactId: string | null;
  role: AppointmentContactRole;
  isPrimary: boolean;
  snapshotName: string;
  snapshotEmail: string | null;
  snapshotPhone: string | null;
}

export interface AppointmentDetail extends Omit<Appointment, 'code'> {
  /** Formatted appointment code (tenant prefix + padded number, e.g. "INS-0042"). */
  appointmentCode: string;
  meetingLocation: string | null;
  keyLocation: string | null;
  cancellationReason: string | null;
  rentalTenantNote: string | null;
  /** Operational free-text note set on direct create/edit (distinct from rental-tenant-portal `notes`/`rentalTenantNote`). */
  observation: string | null;
  /** True when a tenant_portal_tokens row satisfies status='ACTIVE' AND expires_at > NOW. */
  hasActivePortalToken: boolean;
  /**
   * Owning agency's occupant-contact switch. False disables "Send Portal Link" (the
   * backend refuses it with 409 TENANT_NOTIFICATIONS_BLOCKED). Optional: absent means
   * enabled, matching the schema default and older cached payloads.
   */
  rentalTenantNotificationsEnabled?: boolean;
  /** Set when the appointment belongs to a service group — date/time is managed by the group. */
  serviceGroupId?: string | null;
  /** T-C5-5 — populated when status = REJECTED; surfaced in the map detail panel red banner. */
  rejectionReasonCode?: string | null;
  reason?: string | null;
  contacts?: AppointmentContactEntry[];
  /** Property detail attributes (nullable — legacy properties have no values). */
  propertyType?: PropertyType | null;
  propertyAddressLine2?: string | null;
  propertyPrivateAreaM2?: number | null;
  propertyTotalAreaM2?: number | null;
  propertyFurnished?: boolean | null;
  propertyLinenProvided?: boolean | null;
  propertyRentAmount?: number | null;
  /** Operator-defined custom fields (label/value pairs, max 4). */
  customFields?: AppointmentCustomField[];
  /** App credentials linked to this appointment (live reference). */
  apps?: AppointmentApp[];
  /** Weekly availability the rental tenant offered, flattened by the detail API. */
  rentalTenantAvailableSlots?: AvailableSlot[] | null;
  restrictions?: Array<{
    id: string;
    isHome: boolean;
    unavailableDaysJson: string[] | null;
    unavailableHoursJson: string[] | null;
    /** Weekly availability the rental tenant offered when declining in the portal. */
    availableSlotsJson?: AvailableSlot[] | null;
    notes: string | null;
    source: string;
  }>;
}

export interface AppointmentTransition {
  targetStatus: AppointmentStatus;
  label: string;
  icon: string;
  variant: 'primary' | 'outlined' | 'danger' | 'warning';
  requiresReason: boolean;
}

/**
 * Inline channel entry on the appointment-form contact (mirrors
 * `additionalChannelSchema` in @properfy/shared so the inline-create payload
 * is structurally identical to the dedicated /contacts/create payload —
 * 023 §FR-258, T-2-907).
 */
export interface InlineAdditionalChannel {
  channel: ContactChannelType;
  value: string;
  label?: string;
}

export interface ContactFormEntry {
  key: string;
  /**
   * Existing-contact link (snapshot path skips inline create). When set, the
   * inline-only fields below (contactType, company, additionalChannels,
   * notes) are ignored — the existing registry row is the source of truth.
   */
  contactId?: string;
  name: string;
  email: string;
  phone: string;
  role: AppointmentContactRole;
  isPrimary: boolean;
  /**
   * 023 §FR-251..255 — inline-create alignment with `/contacts`. These
   * fields populate the registry row when `contactId` is empty (inline
   * create path). When `contactId` is set they are ignored.
   *
   * `contactType` is REQUIRED on submit when inline (validate() blocks); the
   * fallback in `useAppointmentSave` to `ContactType.RENTAL_TENANT` exists only for
   * backward compatibility with payloads built by older callers and is
   * unreachable from the standard form path.
   */
  contactType?: ContactType;
  company?: string;
  additionalChannels?: InlineAdditionalChannel[];
  notes?: string;
}

/** A single operator-defined custom field row in the appointment form. */
export interface CustomFieldEntry {
  key: string;
  label: string;
  value: string;
}

/** Max number of custom fields allowed per appointment (single source: shared schema). */
export const MAX_CUSTOM_FIELDS = CUSTOM_FIELDS_MAX;

export interface AppointmentFormData {
  branchId: string;
  propertyId: string;
  serviceTypeId: string;
  scheduledDate: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  /** @deprecated Kept for backward compat with save hook during transition */
  contactName: string;
  /** @deprecated */
  contactPhone: string;
  /** @deprecated */
  contactEmail: string;
  contacts: ContactFormEntry[];
  /** Operator-defined custom fields (label/value pairs, max 4). */
  customFields: CustomFieldEntry[];
  /** App credential ids linked to this appointment (live reference, many-to-many). */
  appCredentialIds: string[];
  keyRequired: boolean;
  meetingLocation: string;
  keyLocation: string;
  notes: string;
  observation: string;
  hasRestriction: boolean;
  restrictionIsHome: boolean;
  restrictionNotes: string;
  restrictionTouched: boolean;
}

/**
 * Per-field error map for the appointment form. The `contacts` slot is its
 * own nested record (per-row error map keyed by index) — `Omit<…,'contacts'>`
 * stops the scalar string from colliding with the nested shape, which
 * surfaced as a type error after 023 added the inline-create validation.
 */
export type AppointmentFormErrors = Partial<Omit<Record<keyof AppointmentFormData, string>, 'contacts' | 'customFields'>> & {
  contacts?: Record<number, Partial<Record<keyof ContactFormEntry, string>>>;
  customFields?: Record<number, Partial<Record<'label' | 'value', string>>>;
};

export function createEmptyCustomField(): CustomFieldEntry {
  return {
    key: crypto.randomUUID(),
    label: '',
    value: '',
  };
}

export function createEmptyContact(): ContactFormEntry {
  return {
    key: crypto.randomUUID(),
    name: '',
    email: '',
    phone: '',
    role: 'RENTAL_TENANT' as AppointmentContactRole,
    isPrimary: false,
  };
}

export const EMPTY_FORM_DATA: AppointmentFormData = {
  branchId: '',
  propertyId: '',
  serviceTypeId: '',
  scheduledDate: '',
  timeSlotStart: '',
  timeSlotEnd: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  contacts: [{ ...createEmptyContact(), isPrimary: true }],
  customFields: [],
  appCredentialIds: [],
  keyRequired: false,
  meetingLocation: '',
  keyLocation: '',
  notes: '',
  observation: '',
  hasRestriction: false,
  restrictionIsHome: false,
  restrictionNotes: '',
  restrictionTouched: false,
};

export const DEFAULT_FILTERS: AppointmentFiltersState = {
  search: '',
  status: '',
  rentalTenantConfirmationStatus: '',
  tenantId: '',
  branchId: '',
  inspectorId: '',
  serviceTypeId: '',
  startDate: '',
  endDate: '',
  showCancelled: false,
  overdueOnly: false,
};
