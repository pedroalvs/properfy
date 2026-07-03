import { AppointmentStatus } from '@properfy/shared';

export function isAppointmentEditable(status: AppointmentStatus): boolean {
  return status === AppointmentStatus.DRAFT || status === AppointmentStatus.AWAITING_INSPECTOR;
}

/**
 * Editable via PATCH (including date/time) in any non-terminal status.
 * Mirrors the backend `isScheduleEditable()` guard: only CANCELLED and DONE block edits.
 */
export function isAppointmentScheduleEditable(status: AppointmentStatus): boolean {
  return status !== AppointmentStatus.CANCELLED && status !== AppointmentStatus.DONE;
}
