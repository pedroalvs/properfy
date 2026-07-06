import {
  PLATFORM_TIMEZONE,
  civilDateInTimezone,
  nextCivilDay,
} from '../../../../shared/domain/timezone-date';

/**
 * Horizon helpers for availability-slot regeneration and the override map.
 *
 * "Tomorrow" is the civil day after the CURRENT civil date in the platform
 * timezone (Australia/Sydney), materialized as a UTC-midnight Date so it can be
 * compared/keyed against the UTC-midnight dates stored in
 * inspector_availability_slots.date. All subsequent day arithmetic is pure UTC
 * (calendar-day steps, immune to server timezone and DST).
 */
export function startOfTomorrowUtc(now: Date = new Date()): Date {
  const todayCivil = civilDateInTimezone(now, PLATFORM_TIMEZONE);
  return new Date(`${nextCivilDay(todayCivil)}T00:00:00.000Z`);
}

/** Add calendar days to a UTC-midnight date (UTC arithmetic). */
export function addDaysUtc(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** All UTC-midnight days in [from, to], inclusive. */
export function eachDayInRangeUtc(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  let cur = new Date(from);
  while (cur <= to) {
    days.push(cur);
    cur = addDaysUtc(cur, 1);
  }
  return days;
}
