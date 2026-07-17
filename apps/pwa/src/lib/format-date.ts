import { PLATFORM_TIMEZONE } from '@properfy/shared';

const LOCALE = 'en-AU';

/**
 * Formats a date-only value ('YYYY-MM-DD', tolerant of the legacy
 * 'YYYY-MM-DDT00:00:00.000Z' form) as a civil date. The Date object is built
 * from the date parts purely for locale formatting — no timezone shifting.
 */
export function formatCivilDate(dateStr: string): string {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(year, month - 1, day).toLocaleDateString(LOCALE);
}

/** Formats a real UTC instant as Sydney date + time. */
export function formatSydneyDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, { timeZone: PLATFORM_TIMEZONE });
}

/** Formats a real UTC instant as Sydney wall-clock time. */
export function formatSydneyTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PLATFORM_TIMEZONE,
  });
}
