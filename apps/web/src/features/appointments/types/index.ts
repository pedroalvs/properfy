import type {
  AppointmentStatus,
  TenantConfirmationStatus,
  AppointmentContactRole,
  ContactType,
  ContactChannelType,
} from '@properfy/shared';

export type { AppointmentStatus } from '@properfy/shared';

export interface Appointment {
  id: string;
  appointmentNumber: number;
  code: string;
  tenantId: string;
  tenantName: string;
  branchId: string;
  branchName: string;
  propertyId: string;
  propertyAddress: string;
  serviceTypeId: string;
  serviceTypeName: string;
  status: AppointmentStatus;
  tenantConfirmationStatus: TenantConfirmationStatus;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  inspectorId: string | null;
  inspectorName: string | null;
  scheduledDate: string;
  timeSlot: string;
  keyRequired: boolean;
  notes: string | null;
  doneCheckedByUserId?: string | null;
  doneCheckedAt?: string | null;
  isOverdue: boolean;
  hasTenantNote: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentFiltersState {
  search: string;
  status: string;
  tenantConfirmationStatus: string;
  tenantId: string;
  branchId: string;
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

export interface AppointmentDetail extends Appointment {
  meetingLocation: string | null;
  keyLocation: string | null;
  cancellationReason: string | null;
  tenantNote: string | null;
  contacts?: AppointmentContactEntry[];
  restrictions?: Array<{
    id: string;
    isHome: boolean;
    unavailableDaysJson: string[] | null;
    unavailableHoursJson: string[] | null;
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
   * fallback in `useAppointmentSave` to `ContactType.TENANT` exists only for
   * backward compatibility with payloads built by older callers and is
   * unreachable from the standard form path.
   */
  contactType?: ContactType;
  company?: string;
  additionalChannels?: InlineAdditionalChannel[];
  notes?: string;
}

export interface AppointmentFormData {
  branchId: string;
  propertyId: string;
  serviceTypeId: string;
  scheduledDate: string;
  timeSlot: string;
  /** @deprecated Kept for backward compat with save hook during transition */
  contactName: string;
  /** @deprecated */
  contactPhone: string;
  /** @deprecated */
  contactEmail: string;
  contacts: ContactFormEntry[];
  keyRequired: boolean;
  meetingLocation: string;
  keyLocation: string;
  notes: string;
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
export type AppointmentFormErrors = Partial<Omit<Record<keyof AppointmentFormData, string>, 'contacts'>> & {
  contacts?: Record<number, Partial<Record<keyof ContactFormEntry, string>>>;
};

export function createEmptyContact(): ContactFormEntry {
  return {
    key: crypto.randomUUID(),
    name: '',
    email: '',
    phone: '',
    role: 'TENANT' as AppointmentContactRole,
    isPrimary: false,
  };
}

export const EMPTY_FORM_DATA: AppointmentFormData = {
  branchId: '',
  propertyId: '',
  serviceTypeId: '',
  scheduledDate: '',
  timeSlot: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  contacts: [{ ...createEmptyContact(), isPrimary: true }],
  keyRequired: false,
  meetingLocation: '',
  keyLocation: '',
  notes: '',
  hasRestriction: false,
  restrictionIsHome: false,
  restrictionNotes: '',
  restrictionTouched: false,
};

export const DEFAULT_FILTERS: AppointmentFiltersState = {
  search: '',
  status: '',
  tenantConfirmationStatus: '',
  tenantId: '',
  branchId: '',
  serviceTypeId: '',
  startDate: '',
  endDate: '',
  showCancelled: false,
  overdueOnly: false,
};
