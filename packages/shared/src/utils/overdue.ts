import { AppointmentStatus } from '../enums';
import { PLATFORM_TIMEZONE } from '../constants/timezone';
import { addCivilDays, todayInTzDateString } from './local-date';

/**
 * How long an appointment may sit in an active status before it counts as overdue.
 *
 * The rule is age-of-record, not "the inspection day came and went": an appointment
 * is overdue once it has existed for more than this many days without reaching a
 * terminal status. Its `scheduled_date` is deliberately NOT part of the rule, so a
 * future date does not rescue a record that has been stalled for months.
 */
export const OVERDUE_AGE_DAYS = 45;

/**
 * Statuses that can carry the overdue badge and match the `overdueOnly` list filter.
 *
 * `DRAFT` is included: an unreleased appointment still represents work that has been
 * sitting untouched, and operators need it surfaced. Terminal statuses are settled
 * and never overdue, however old.
 */
export const OVERDUE_ELIGIBLE_STATUSES: readonly AppointmentStatus[] = [
  AppointmentStatus.DRAFT,
  AppointmentStatus.AWAITING_INSPECTOR,
  AppointmentStatus.SCHEDULED,
];

/**
 * The subset the daily auto-cancel sweep is allowed to cancel — a strict subset of
 * `OVERDUE_ELIGIBLE_STATUSES`.
 *
 * `DRAFT` is excluded on purpose: it is the operator's repair state, so a stale
 * `DRAFT` must be *shown* as overdue without being cancelled out from under them.
 * Callers in the sweep path must check this list; `isAppointmentOverdue` alone
 * returns true for a stale `DRAFT`.
 */
export const OVERDUE_AUTO_CANCEL_STATUSES: readonly AppointmentStatus[] = [
  AppointmentStatus.AWAITING_INSPECTOR,
  AppointmentStatus.SCHEDULED,
];

/**
 * The Sydney civil date a record must have been created *before* to count as overdue,
 * i.e. today minus `OVERDUE_AGE_DAYS`.
 *
 * Comparison against it is strict, so a record created exactly `OVERDUE_AGE_DAYS` ago
 * is not yet overdue — it becomes overdue at the next Sydney midnight. This mirrors
 * the convention the rest of the platform uses for civil-date boundaries.
 */
export function overdueCreatedBeforeCivilDate(): string {
  return addCivilDays(todayInTzDateString(PLATFORM_TIMEZONE), -OVERDUE_AGE_DAYS);
}

export interface AppointmentOverdueInput {
  status: string;
  /** The appointment's `created_at`: an instant, or a bare YYYY-MM-DD civil date. */
  createdAt: string | Date;
}

/**
 * Resolves a `created_at` value to its Sydney civil date.
 *
 * `created_at` is a real instant, NOT a `@db.Date` like `scheduled_date` — so an
 * instant must be converted through the platform timezone rather than having its UTC
 * date read off. The two disagree by a day for anything created while Sydney has
 * already rolled over, which is roughly half of every day.
 *
 * A bare `YYYY-MM-DD` string carries no time and no zone, so it is already a civil
 * date and is taken as-is.
 */
function createdAtCivilDate(createdAt: string | Date): string {
  if (typeof createdAt === 'string' && !createdAt.includes('T')) return createdAt;

  const instant = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PLATFORM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * Whether an appointment is overdue: still in an active status, and created more than
 * `OVERDUE_AGE_DAYS` days ago (Sydney civil-date comparison).
 *
 * This is the single definition shared by the `isOverdue` response flag, the
 * repository's `overdueOnly` list filter, and the daily auto-cancel sweep. The sweep
 * additionally narrows to `OVERDUE_AUTO_CANCEL_STATUSES`.
 *
 * Takes an object rather than positional arguments deliberately: the previous rule
 * keyed on `scheduled_date`, which has the same `string | Date` type as `createdAt`,
 * so positional arguments would let a call site keep compiling while silently reading
 * the wrong column.
 */
export function isAppointmentOverdue({ status, createdAt }: AppointmentOverdueInput): boolean {
  if (!(OVERDUE_ELIGIBLE_STATUSES as readonly string[]).includes(status)) return false;

  return createdAtCivilDate(createdAt) < overdueCreatedBeforeCivilDate();
}
