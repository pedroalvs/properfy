/**
 * Timezone-aware civil-date helpers.
 *
 * Extracted from the (removed) generate-invoice use case so the billing-period service and the
 * invoice request/preview use cases share one implementation. All functions treat a date as a
 * civil calendar date (YYYY-MM-DD) resolved against an IANA timezone; DST is handled via
 * Intl.DateTimeFormat.
 */

/** The platform timezone used to evaluate whether an invoice period is "closed" (cross-tenant). */
export const PLATFORM_TIMEZONE = 'Australia/Sydney';

/**
 * Parse a YYYY-MM-DD date string as the start of that day (00:00:00) in the given IANA timezone,
 * returning a UTC Date.
 */
export function parseDateInTimezone(dateStr: string, timezone: string): Date {
  if (timezone === 'UTC') {
    return new Date(`${dateStr}T00:00:00.000Z`);
  }
  const offsetMinutes = getTimezoneOffsetMinutes(dateStr, timezone);
  const utcMs = new Date(`${dateStr}T00:00:00.000Z`).getTime() - offsetMinutes * 60_000;
  return new Date(utcMs);
}

/**
 * Returns the UTC offset in minutes for a given date string and timezone.
 * Positive means ahead of UTC (e.g. +600 for AEST).
 */
export function getTimezoneOffsetMinutes(dateStr: string, timezone: string): number {
  const refDate = new Date(`${dateStr}T12:00:00.000Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(refDate);

  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '0';

  const localYear = parseInt(get('year'), 10);
  const localMonth = parseInt(get('month'), 10) - 1;
  const localDay = parseInt(get('day'), 10);
  let localHour = parseInt(get('hour'), 10);
  if (localHour === 24) localHour = 0;
  const localMinute = parseInt(get('minute'), 10);
  const localSecond = parseInt(get('second'), 10);

  const localAsUtc = Date.UTC(localYear, localMonth, localDay, localHour, localMinute, localSecond);
  return Math.round((localAsUtc - refDate.getTime()) / 60_000);
}

/** Start-of-day UTC instant advanced to 23:59:59.999 of the same day. */
export function endOfDay(value: Date): Date {
  return new Date(value.getTime() + 23 * 3600_000 + 59 * 60_000 + 59 * 1000 + 999);
}

/** UTC-Date → YYYY-MM-DD. */
export function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
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
