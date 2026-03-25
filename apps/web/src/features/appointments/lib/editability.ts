import { AppointmentStatus } from '@properfy/shared';

export function isAppointmentEditable(status: AppointmentStatus): boolean {
  return status === AppointmentStatus.DRAFT || status === AppointmentStatus.AWAITING_INSPECTOR;
}
