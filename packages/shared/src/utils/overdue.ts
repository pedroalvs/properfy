import { AppointmentStatus } from '../enums';
import { PLATFORM_TIMEZONE } from '../constants/timezone';
import { todayInTzDateString } from './local-date';

const OVERDUE_ELIGIBLE_STATUSES: string[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.AWAITING_INSPECTOR,
];

/**
 * Determines if an appointment is overdue based on its status and scheduled date.
 * An appointment is overdue when it is in SCHEDULED or AWAITING_INSPECTOR status
 * and its scheduled date is strictly before today (Sydney civil-date comparison).
 */
export function isAppointmentOverdue(
  status: string,
  scheduledDate: string | Date,
): boolean {
  if (!OVERDUE_ELIGIBLE_STATUSES.includes(status)) return false;

  const scheduledStr = typeof scheduledDate === 'string'
    ? scheduledDate.split('T')[0]!
    : scheduledDate.toISOString().split('T')[0]!;
  const todayStr = todayInTzDateString(PLATFORM_TIMEZONE);

  return scheduledStr < todayStr;
}
