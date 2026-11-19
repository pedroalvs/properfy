import {
  addCivilDays,
  todayInTzDateString,
  PLATFORM_TIMEZONE,
  MAX_EXECUTION_DENSITY_PERIOD_DAYS,
} from '@properfy/shared';

/**
 * Period presets for the activity-density layer. These are **retrospective and
 * exact** — "Last N days" is N civil days ending today, inclusive — deliberately
 * unlike the F00 pin window ("Today + N days", forward-looking). The two counts
 * and their helpers must not be unified (L-F00-03).
 */
export type DensityPreset = '7d' | '30d' | '90d';

export interface DensityRange {
  fromDate: string;
  toDate: string;
}

const PRESET_DAYS: Record<DensityPreset, number> = { '7d': 7, '30d': 30, '90d': 90 };

/**
 * `{ fromDate: addCivilDays(today, -(N-1)), toDate: today }` in the platform
 * timezone (Sydney-only by design, matching the backend aggregation so
 * `toDate === today` includes the current day and passes the preset check).
 * Reads "today" at call time — callers capture the result in state so the
 * window does not silently advance across renders (L-F09-05).
 */
export function presetRange(preset: DensityPreset): DensityRange {
  const today = todayInTzDateString(PLATFORM_TIMEZONE);
  const days = PRESET_DAYS[preset];
  return { fromDate: addCivilDays(today, -(days - 1)), toDate: today };
}

const inclusiveDays = (fromDate: string, toDate: string): number =>
  (Date.parse(`${toDate}T00:00:00.000Z`) - Date.parse(`${fromDate}T00:00:00.000Z`)) / 86_400_000 + 1;

/**
 * Validates an AM/OP custom range. Returns `null` when valid, otherwise the
 * inline message to show (both dates chosen, end ≥ start, ≤ 366 days, end not
 * in the future). The backend rejects the same cases as defence.
 */
export function validateCustomRange(fromDate: string, toDate: string): string | null {
  if (!fromDate || !toDate) return 'Choose a start and end date.';
  if (toDate < fromDate) return 'End date must be on or after the start date.';
  const today = todayInTzDateString(PLATFORM_TIMEZONE);
  if (toDate > today) return 'End date can’t be in the future.';
  if (inclusiveDays(fromDate, toDate) > MAX_EXECUTION_DENSITY_PERIOD_DAYS) {
    return 'Period can’t be longer than 366 days.';
  }
  return null;
}
