import type { ServiceGroupStatus, Agency } from '@properfy/shared';

// Re-exported so feature-local imports keep a single path; shape lives in @properfy/shared.
export type { Agency } from '@properfy/shared';

export interface ServiceGroup {
  id: string;
  /** Sequential human-friendly code (pure numeric). */
  groupNumber?: number;
  code?: string;
  /** Null when the group spans multiple agencies (cross-agency group). */
  tenantId: string | null;
  /** Distinct agencies of the group's appointments (populated by the list/detail hooks). */
  agencies?: Agency[];
  serviceRegionId: string | null;
  regionName: string | null;
  inspectorId: string | null;
  inspectorName: string | null;
  status: ServiceGroupStatus;
  appointmentsCount: number;
  /**
   * The group's own day, `YYYY-MM-DD` (or a full ISO datetime). Members follow it.
   * Nullable rather than optional: the detail hook normalises a missing value to
   * `null`, so an absent field reads as "unknown" and never as a valid date.
   */
  scheduledDate: string | null;
  /** The group's shared window, `HH:mm-HH:mm`. Members are clamped into it. */
  timeWindow: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceGroupAppointment {
  id: string;
  appointmentNumber: number;
  status: string;
  scheduledDate: string | null;
  /** The member's own slot, `HH:mm`. Drives the reschedule impact preview. */
  timeSlotStart: string | null;
  timeSlotEnd: string | null;
  /** Lets the modal name the tenants who already confirmed the schedule being changed. */
  rentalTenantConfirmationStatus: string | null;
  propertyAddress: string | null;
  propertyCode: string | null;
}

export interface ServiceGroupDetail extends ServiceGroup {
  appointments: ServiceGroupAppointment[];
  description: string | null;
}

export interface ServiceGroupFiltersState {
  /** Free text; the backend matches group description and numeric group code. */
  search: string;
  status: string;
}

export const DEFAULT_FILTERS: ServiceGroupFiltersState = {
  search: '',
  status: '',
};
