import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../shared/domain/timezone-date';

/** Formats a date as the Sydney-civil month key `YYYY-MM` used by earnings summaries. */
export function formatMonthKey(date: Date): string {
  return civilDateInTimezone(date, PLATFORM_TIMEZONE).slice(0, 7);
}
