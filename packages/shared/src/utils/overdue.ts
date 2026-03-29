import { AppointmentStatus } from '../enums';

const OVERDUE_ELIGIBLE_STATUSES: string[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.AWAITING_INSPECTOR,
];

/**
 * Determines if an appointment is overdue based on its status and scheduled date.
 * An appointment is overdue when it is in SCHEDULED or AWAITING_INSPECTOR status
 * and its scheduled date is strictly before today (UTC date comparison).
 */
export function isAppointmentOverdue(
  status: string,
  scheduledDate: string | Date,
): boolean {
  if (!OVERDUE_ELIGIBLE_STATUSES.includes(status)) return false;

  const scheduled = typeof scheduledDate === 'string'
    ? new Date(scheduledDate)
    : scheduledDate;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const scheduledDay = new Date(scheduled);
  scheduledDay.setUTCHours(0, 0, 0, 0);

  return scheduledDay.getTime() < today.getTime();
}
