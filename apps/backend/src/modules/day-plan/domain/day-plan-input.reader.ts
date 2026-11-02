import type { AppointmentContactRole, InspectorBaseAddress } from '@properfy/shared';

/** A contact candidate for a stop (reduced to one by `selectPrimaryContact`). */
export interface DayPlanCandidateContact {
  name: string;
  phone: string | null;
  isPrimary: boolean;
  role: AppointmentContactRole;
  createdAt: Date;
}

/**
 * A SCHEDULED/DONE appointment that may belong to the plan. The window comes from
 * the appointment's `time_slot_start/end` (never the group's `time_window`,
 * L-F04-11); SCHEDULED rows have already passed T-1 visibility in the loader.
 */
export interface DayPlanCandidate {
  appointmentId: string;
  appointmentCode: string;
  appointmentStatus: 'SCHEDULED' | 'DONE';
  agencyName: string;
  tenantTimezone: string;
  /** Civil date `YYYY-MM-DD` (agency wall clock). */
  scheduledDate: string;
  /** Agency wall-clock window, e.g. `08:00`. */
  timeSlotStart: string;
  timeSlotEnd: string;
  /** The window converted to instants in the agency timezone. */
  windowStartAt: Date;
  windowEndAt: Date;
  durationMinutes: number;
  serviceTypeName: string;
  lat: number | null;
  lng: number | null;
  propertyAddress: string;
  suburb: string;
  keyRequired: boolean;
  meetingLocation: string | null;
  rentalTenantConfirmationStatus: string;
  contacts: DayPlanCandidateContact[];
  startedAt: Date | null;
  finishedAt: Date | null;
  abandonedAt: Date | null;
}

/** The inspector's identity + configured origin for a plan. */
export interface InspectorDayPlanContext {
  inspectorId: string;
  name: string;
  /** Effective timezone (`users.timezone ?? PLATFORM_TIMEZONE`). */
  timezone: string;
  /** InspectorStatus; the publish job skips non-ACTIVE. */
  active: boolean;
  baseLat: number | null;
  baseLng: number | null;
  baseAddress: InspectorBaseAddress | null;
  /** The base address is present but could not be geocoded (`BASE_NOT_LOCATED`). */
  baseGeocodeFailed: boolean;
}

export interface IDayPlanInputReader {
  /** SCHEDULED (T-1-visible for `todayCivil`) + DONE appointments of the inspector on `planDate`. */
  loadCandidates(
    inspectorId: string,
    planDate: string,
    todayCivil: string,
  ): Promise<DayPlanCandidate[]>;

  /** The inspector's identity + configured origin, or `null` when the inspector does not exist. */
  loadInspectorContext(inspectorId: string): Promise<InspectorDayPlanContext | null>;

  /**
   * The current inspector + civil date of a live (SCHEDULED/DONE, not deleted)
   * appointment, for the F06 fresh-stop read. `null` when the appointment is
   * absent, unassigned, deleted, or out of SCHEDULED/DONE.
   */
  loadAppointmentPlanKey(appointmentId: string): Promise<{ inspectorId: string; date: string } | null>;
}
