import type { BillingPeriodType } from '@properfy/shared';
import {
  PLATFORM_TIMEZONE,
  civilDateInTimezone,
  parseDateInTimezone,
  endOfDay,
} from '../../../shared/domain/timezone-date';

/**
 * Closed billing-period computation for Inspector Property Invoices (spec 032).
 *
 * Pure civil-date logic. A period is a range of inclusive calendar dates (YYYY-MM-DD). Periods are
 * system-defined by the inspector's billing cycle, so the same closed period is offered regardless
 * of when it is requested:
 *   - WEEKLY:      Monday–Sunday weeks
 *   - FORTNIGHTLY: 14-day blocks anchored to the epoch Monday 2024-01-01
 *   - MONTHLY:     calendar months
 *
 * "Closed" (period fully in the past) is the only timezone-dependent question and is evaluated
 * against the current civil date in the platform timezone (Australia/Sydney).
 */

export interface BillingPeriod {
  periodType: BillingPeriodType;
  periodStart: string; // YYYY-MM-DD inclusive
  periodEnd: string; // YYYY-MM-DD inclusive
}

const MS_PER_DAY = 86_400_000;
/** Epoch Monday used to anchor fortnightly blocks. 2024-01-01 was a Monday. */
const FORTNIGHT_EPOCH = '2024-01-01';

function ymdToUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function utcToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(ymd: string, days: number): string {
  return utcToYmd(new Date(ymdToUtc(ymd).getTime() + days * MS_PER_DAY));
}

/** Days between two civil dates (b - a). */
function daysBetween(a: string, b: string): number {
  return Math.round((ymdToUtc(b).getTime() - ymdToUtc(a).getTime()) / MS_PER_DAY);
}

/** Monday (ISO) of the week containing ymd. */
function mondayOf(ymd: string): string {
  const dow = ymdToUtc(ymd).getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  return addDays(ymd, -daysSinceMonday);
}

function firstOfMonth(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

function lastOfMonth(ymd: string): string {
  const year = parseInt(ymd.slice(0, 4), 10);
  const month = parseInt(ymd.slice(5, 7), 10); // 1-based
  // Date.UTC(year, month, 0) is day 0 of the following month = last day of `month`.
  const last = new Date(Date.UTC(year, month, 0));
  return utcToYmd(last);
}

/** The canonical cycle period containing the given civil date. */
export function getCanonicalPeriod(cycle: BillingPeriodType, ymd: string): BillingPeriod {
  switch (cycle) {
    case 'WEEKLY': {
      const start = mondayOf(ymd);
      return { periodType: cycle, periodStart: start, periodEnd: addDays(start, 6) };
    }
    case 'FORTNIGHTLY': {
      const blockIndex = Math.floor(daysBetween(FORTNIGHT_EPOCH, ymd) / 14);
      const start = addDays(FORTNIGHT_EPOCH, blockIndex * 14);
      return { periodType: cycle, periodStart: start, periodEnd: addDays(start, 13) };
    }
    case 'MONTHLY':
    default:
      return { periodType: cycle, periodStart: firstOfMonth(ymd), periodEnd: lastOfMonth(ymd) };
  }
}

/** True when (start, end) exactly matches a canonical period boundary for the cycle. */
export function isCycleAligned(cycle: BillingPeriodType, periodStart: string, periodEnd: string): boolean {
  const canonical = getCanonicalPeriod(cycle, periodStart);
  return canonical.periodStart === periodStart && canonical.periodEnd === periodEnd;
}

/** True when the period end is strictly before today's civil date in the platform timezone. */
export function isPeriodClosed(periodEnd: string, now: Date): boolean {
  const today = civilDateInTimezone(now, PLATFORM_TIMEZONE);
  return periodEnd < today; // lexicographic compare is valid for YYYY-MM-DD
}

/**
 * UTC-midnight Date values for the invoice `period_start` / `period_end` columns (`@db.Date`).
 * Date-only columns must carry the civil date at UTC midnight so Prisma persists the correct day.
 */
export function periodDateColumns(periodStart: string, periodEnd: string): { start: Date; end: Date } {
  return {
    start: parseDateInTimezone(periodStart, 'UTC'),
    end: parseDateInTimezone(periodEnd, 'UTC'),
  };
}

/**
 * The `effective_at` timestamp range that selects payouts belonging to a period, using platform
 * (Sydney) civil-day boundaries — a payout done at 8am on the last day belongs to that Sydney day.
 */
export function periodEffectiveRange(periodStart: string, periodEnd: string): { from: Date; to: Date } {
  return {
    from: parseDateInTimezone(periodStart, PLATFORM_TIMEZONE),
    to: endOfDay(parseDateInTimezone(periodEnd, PLATFORM_TIMEZONE)),
  };
}

/** The most recent `count` closed periods for the cycle, newest first. */
export function computeClosedPeriods(cycle: BillingPeriodType, now: Date, count: number): BillingPeriod[] {
  const today = civilDateInTimezone(now, PLATFORM_TIMEZONE);
  const current = getCanonicalPeriod(cycle, today);
  const periods: BillingPeriod[] = [];
  // Step back one period at a time from the day before the current period starts.
  let cursorDate = addDays(current.periodStart, -1);
  for (let i = 0; i < count; i++) {
    const period = getCanonicalPeriod(cycle, cursorDate);
    periods.push(period);
    cursorDate = addDays(period.periodStart, -1);
  }
  return periods;
}
