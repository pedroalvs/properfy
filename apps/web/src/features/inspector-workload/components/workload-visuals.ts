import type { InspectorWorkloadResponse, WorkloadLevel } from '@properfy/shared';
import { SEQUENTIAL_HUE } from '@/features/analytics/components/charts/theme';

export type Thresholds = InspectorWorkloadResponse['thresholds'];

/** Human label for a level. Colour never carries the meaning on its own. */
export const LEVEL_LABEL: Record<WorkloadLevel, string> = {
  normal: 'Normal',
  busy: 'Busy',
  overloaded: 'Overloaded',
};

/**
 * Classifies a single day's count against the daily thresholds echoed by the
 * API, rather than against a copy of the constants. One source, so the legend
 * and the cells cannot disagree.
 */
export function dayLevel(count: number, thresholds: Thresholds): WorkloadLevel {
  if (count >= thresholds.dailyOverloaded) return 'overloaded';
  if (count >= thresholds.dailyBusy) return 'busy';
  return 'normal';
}

/**
 * Matrix cells encode **magnitude**, so they use one hue at stepped alpha —
 * never the status palette, which is reserved for state. The printed count is
 * what actually carries the value; the wash only makes the shape of a heavy week
 * visible at a glance.
 *
 * Steps are keyed to the daily thresholds so the ramp and the legend describe
 * the same bands.
 */
export function cellStyle(count: number, thresholds: Thresholds): { backgroundColor: string } {
  if (count === 0) return { backgroundColor: 'transparent' };

  const level = dayLevel(count, thresholds);
  const alpha = level === 'overloaded' ? 0.55 : level === 'busy' ? 0.3 : 0.12;
  return { backgroundColor: withAlpha(SEQUENTIAL_HUE, alpha) };
}

/** `#21566E` + alpha → `rgba(...)`. Avoids the Tailwind `/opacity` scale, which
 *  does not cover the steps this ramp needs (see tailwind token memo). */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The weekly total is a *state*, not a magnitude, so it is the one place the
 * reserved status colours apply. Always rendered with the number and, in the
 * table view, the level word — never colour alone.
 */
export const TOTAL_LEVEL_CLASS: Record<WorkloadLevel, string> = {
  normal: 'bg-black/5 text-text-secondary',
  busy: 'bg-warning/15 text-warning',
  overloaded: 'bg-error/15 text-error',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * "Mon 27 Jul" — the matrix column header.
 *
 * Assembled from fixed parts rather than `toLocaleDateString`, which under
 * `en-AU` renders "Mon, 27 July": too wide for one of seven columns, and its
 * exact shape varies with the runtime's ICU data. The app is English-only
 * (apps/web/CLAUDE.md §13.7), so there is no localisation being given up.
 *
 * Read in UTC because a civil date is a calendar day with no instant to convert.
 */
export function formatDayHeader(civilDate: string): string {
  const date = new Date(`${civilDate}T00:00:00.000Z`);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** "Mon 27 Jul – Sun 2 Aug 2026" — the week chip. */
export function formatWeekRange(weekStart: string, weekEnd: string): string {
  return `${formatDayHeader(weekStart)} – ${formatDayHeader(weekEnd)} ${weekEnd.slice(0, 4)}`;
}

/** "July 2026" from a `YYYY-MM` label. */
export function formatMonthLabel(yearMonth: string): string {
  return new Date(`${yearMonth}-01T00:00:00.000Z`).toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Share of `total`, or `null` when there is no denominator to divide by. */
export function percentOf(value: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((value / total) * 100);
}
