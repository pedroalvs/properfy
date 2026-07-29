import { AppointmentStatus } from '../enums';
import { PLATFORM_TIMEZONE } from '../constants/timezone';
import { todayInTzDateString } from './local-date';

/**
 * The only statuses that can be "overdue": still active, and still expecting the
 * inspection to happen. `DRAFT` is excluded — an unreleased appointment is not
 * late, it simply has not been released. Terminal statuses are settled.
 *
 * This is the single definition shared by `isAppointmentOverdue`, the repository's
 * `overdueOnly` list filter, and the daily auto-cancel sweep.
 */
export const OVERDUE_ELIGIBLE_STATUSES: readonly AppointmentStatus[] = [
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
  if (!(OVERDUE_ELIGIBLE_STATUSES as readonly string[]).includes(status)) return false;

  // Strings carry a civil date by contract (YYYY-MM-DD prefix). Date objects are
  // resolved to their Sydney civil date — identical for @db.Date values (pinned to
  // UTC midnight) and correct for real instants near the Sydney midnight boundary.
  const scheduledStr = typeof scheduledDate === 'string'
    ? scheduledDate.split('T')[0]!
    : new Intl.DateTimeFormat('en-CA', {
        timeZone: PLATFORM_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(scheduledDate);
  const todayStr = todayInTzDateString(PLATFORM_TIMEZONE);

  return scheduledStr < todayStr;
}
