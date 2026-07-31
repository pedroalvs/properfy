/**
 * Timezone-aware civil-date helpers.
 *
 * Extracted from the (removed) generate-invoice use case so the billing-period service and the
 * invoice request/preview use cases share one implementation. All functions treat a date as a
 * civil calendar date (YYYY-MM-DD) resolved against an IANA timezone; DST is handled via
 * Intl.DateTimeFormat.
 */

import { addCivilDays, OVERDUE_AGE_DAYS, PLATFORM_TIMEZONE } from '@properfy/shared';

/** The platform timezone every business rule is anchored to (re-exported from shared). */
export { PLATFORM_TIMEZONE };

/**
 * Parse a YYYY-MM-DD date string as the start of that day (00:00:00) in the given IANA timezone,
 * returning a UTC Date.
 *
 * Wall-clock → UTC uses the offset actually in effect at *local midnight*, resolved with two passes:
 * the first guess can land on the wrong side of a DST change, and the second pass corrects it. This
 * keeps civil-day boundaries exact on the 23h/25h DST-transition days (a single noon-offset guess
 * would shift midnight by an hour).
 */
export function parseDateInTimezone(dateStr: string, timezone: string): Date {
  if (timezone === 'UTC') {
    return new Date(`${dateStr}T00:00:00.000Z`);
  }
  const wallMs = new Date(`${dateStr}T00:00:00.000Z`).getTime();
  const guess = offsetMinutesAtInstant(new Date(wallMs), timezone);
  const refined = offsetMinutesAtInstant(new Date(wallMs - guess * 60_000), timezone);
  return new Date(wallMs - refined * 60_000);
}

/** UTC offset in minutes (+ = ahead of UTC) actually in effect at the given INSTANT in the timezone. */
function offsetMinutesAtInstant(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant);

  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '0';

  let localHour = parseInt(get('hour'), 10);
  if (localHour === 24) localHour = 0;
  const localAsUtc = Date.UTC(
    parseInt(get('year'), 10),
    parseInt(get('month'), 10) - 1,
    parseInt(get('day'), 10),
    localHour,
    parseInt(get('minute'), 10),
    parseInt(get('second'), 10),
  );
  return Math.round((localAsUtc - instant.getTime()) / 60_000);
}

/**
 * UTC offset in minutes (+ = ahead of UTC) for local noon on the given date/timezone. Retained for
 * backward compatibility; period boundaries use the instant-accurate path in parseDateInTimezone.
 */
export function getTimezoneOffsetMinutes(dateStr: string, timezone: string): number {
  return offsetMinutesAtInstant(new Date(`${dateStr}T12:00:00.000Z`), timezone);
}

/** Advance a YYYY-MM-DD civil date by one calendar day (UTC string math, no timezone). */
export function nextCivilDay(dateStr: string): string {
  const next = new Date(`${dateStr}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * The last instant of the given civil day in the timezone: 1ms before the NEXT civil midnight.
 * Derived from the next midnight (rather than adding a fixed 23:59:59.999) so it stays correct on
 * DST-transition days, where the civil day is 23h or 25h long — e.g. a weekly period ending on a
 * Sydney transition Sunday would otherwise mis-bucket payouts within an hour of midnight.
 */
export function endOfCivilDayInTimezone(dateStr: string, timezone: string): Date {
  return new Date(parseDateInTimezone(nextCivilDay(dateStr), timezone).getTime() - 1);
}

/** UTC-Date → YYYY-MM-DD. */
export function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * UTC midnight of *today's* civil date in the platform timezone — the canonical
 * lower bound for "is this scheduled_date in the past?".
 *
 * `scheduled_date` is a `@db.Date` pinned to UTC midnight of a Sydney civil date.
 * Deriving the cutoff from UTC midnight of the server clock instead (`new Date()`
 * + `setUTCHours(0,0,0,0)`) is off by a day for the ~10 hours each day where
 * Sydney has already rolled over but UTC has not.
 */
export function startOfPlatformToday(now: Date = new Date()): Date {
  return new Date(`${civilDateInTimezone(now, PLATFORM_TIMEZONE)}T00:00:00.000Z`);
}

/**
 * The instant a record must have been created *before* to count as overdue: Sydney
 * midnight of today minus `OVERDUE_AGE_DAYS`.
 *
 * Note this is a genuine INSTANT, unlike `startOfPlatformToday()` above. That one
 * returns UTC midnight of a civil date because it is compared against `scheduled_date`,
 * a `@db.Date` pinned to UTC midnight. `created_at` is a real timestamp, so its cutoff
 * must be the real instant of Sydney midnight — 10–11h earlier. Reusing
 * `startOfPlatformToday`'s convention here would misclassify every record created
 * inside that window, which is roughly half of each day's records.
 *
 * Built with `parseDateInTimezone` so the offset used is the one in effect *at the
 * cutoff date*, not at `now` — 45 days can straddle a DST transition.
 *
 * `created_at < startOfOverdueAgeCutoff()` is exactly equivalent to the shared
 * predicate's `sydneyCivilDate(createdAt) < overdueCreatedBeforeCivilDate()`, which is
 * what keeps the SQL filter and `isAppointmentOverdue` agreeing row for row.
 */
export function startOfOverdueAgeCutoff(now: Date = new Date()): Date {
  const cutoffCivilDate = addCivilDays(
    civilDateInTimezone(now, PLATFORM_TIMEZONE),
    -OVERDUE_AGE_DAYS,
  );
  return parseDateInTimezone(cutoffCivilDate, PLATFORM_TIMEZONE);
}

/** The current civil date (YYYY-MM-DD) in the given timezone. */
export function civilDateInTimezone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
