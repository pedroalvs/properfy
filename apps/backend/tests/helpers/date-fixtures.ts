/**
 * Date helpers for tests.
 *
 * Why this exists
 * ---------------
 * Several business rules compare user-supplied dates to the wall clock:
 *
 *   - CL roles cannot pass `scheduledDate` in the past
 *     (create/update-appointment use cases).
 *   - Tenant-portal reschedule cannot submit `newDate` before today.
 *   - Invoice payments cannot be in the future beyond a grace window.
 *
 * Hard-coding a "future" date literal like `'2026-12-01'` in a test
 * fixture is a ticking time bomb — the moment the real clock crosses
 * that date, the use case starts rejecting it and the test flips from
 * green to red with no code change. We had three separate incidents
 * (2026-04-15, 2026-04-20, 2026-04-21) caused by exactly this pattern.
 *
 * Rule of thumb: any test that feeds a date into a use case which
 * compares it to `new Date()` / the Sydney civil today MUST use one of
 * the helpers below instead of a literal.
 *
 * A literal like `'2020-01-01'` is fine for "always past" tests — it
 * will never drift into the future.
 */

import { PLATFORM_TIMEZONE, todayInTzDateString } from '@properfy/shared';

/** UTC-midnight Date for today's SYDNEY civil date — the anchor every fixture offsets from. */
function sydneyTodayUtcMidnight(): Date {
  return new Date(`${todayInTzDateString(PLATFORM_TIMEZONE)}T00:00:00.000Z`);
}

/** `YYYY-MM-DD` string N days ahead of today's Sydney civil date (default 30). */
export function futureDateStr(daysAhead = 30): string {
  const d = sydneyTodayUtcMidnight();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().split('T')[0]!;
}

/** `YYYY-MM-DD` string N days before today's Sydney civil date (default 30). */
export function pastDateStr(daysAgo = 30): string {
  const d = sydneyTodayUtcMidnight();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().split('T')[0]!;
}

/** Full ISO datetime N days ahead of the Sydney civil today, e.g. for appointment scheduled timestamps. */
export function futureIsoDateTime(daysAhead = 30, hour = 10, minute = 0): string {
  const d = sydneyTodayUtcMidnight();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}
