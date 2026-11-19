import {
  type GoalMetric,
  GOAL_METRIC_KIND,
  GOAL_METRIC_COMPARATOR,
  BillingPeriodType,
  civilDateInTz,
  formatInstantTime,
  PLATFORM_TIMEZONE,
} from '@properfy/shared';

/**
 * Display copy and date formatting for the Goals & rewards screens (F08-3).
 *
 * Like the F07 `format-metric.ts`, the **UI** metric labels live here, not in the
 * terse shared `GOAL_METRIC_LABELS` (those read "Inspections completed",
 * "Punctuality rate", …; the Goals filter/form want "Volume", "On-time arrival", …).
 * All dates are formatted deterministically from fixed month/weekday arrays —
 * never `toLocaleDateString`/Intl month names (ICU drift across Node versions,
 * memory `project_icu_locale_default_date_format_node_version_drift`). Civil
 * period dates arrive from the backend in `PLATFORM_TIMEZONE`; instants are shown
 * in `PLATFORM_TIMEZONE`.
 */

/** Short English metric labels for the Metric filter and the goal form (spec UI). */
export const GOAL_METRIC_UI_LABELS: Record<GoalMetric, string> = {
  VOLUME: 'Volume',
  REGION_VOLUME: 'Region volume',
  SERVICE_TYPE_VOLUME: 'Service type volume',
  INDEX_AT_LEAST: 'Reliability index',
  PUNCTUALITY: 'On-time arrival',
  GEOFENCE: 'On-site check-in',
  NO_STUCK: 'Finished without getting stuck',
  SATISFACTION: 'Tenant satisfaction',
  LATE_NOTICE: 'Late notice in advance',
  CANT_DO_MAX: "Can't-do rate",
};

export function goalMetricLabel(metric: GoalMetric): string {
  return GOAL_METRIC_UI_LABELS[metric];
}

/** The unit shown next to a goal's target: "%" for rate metrics, "points" for the index, none for volumes. */
export function metricTargetUnit(metric: GoalMetric): string {
  const kind = GOAL_METRIC_KIND[metric];
  if (kind === 'RATE') return '%';
  if (kind === 'INDEX') return 'points';
  return '';
}

/** "at least" for every metric except `CANT_DO_MAX` ("at most"). */
export function metricComparatorWord(metric: GoalMetric): 'at least' | 'at most' {
  return GOAL_METRIC_COMPARATOR[metric] === 'LTE' ? 'at most' : 'at least';
}

export const PERIOD_CYCLE_LABELS: Record<BillingPeriodType, string> = {
  WEEKLY: 'Weekly',
  FORTNIGHTLY: 'Fortnightly',
  MONTHLY: 'Monthly',
};

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

interface CivilParts {
  year: number;
  month: number;
  day: number;
}

function parseCivil(value: string): CivilParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Weekday from a civil date, computed with no timezone (UTC-anchored) — ICU-free. */
function weekdayOf(parts: CivilParts): string {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return WEEKDAYS[d.getUTCDay()] ?? '';
}

/** "2 Nov 2026" (no weekday). */
export function formatCivilDay(value: string | null | undefined): string {
  if (!value) return '';
  const parts = parseCivil(value);
  if (!parts) return value;
  return `${parts.day} ${MONTHS_SHORT[parts.month - 1]} ${parts.year}`;
}

/** "Mon 2 Nov 2026" (with weekday). */
export function formatCivilDayWithWeekday(value: string | null | undefined): string {
  if (!value) return '';
  const parts = parseCivil(value);
  if (!parts) return value;
  return `${weekdayOf(parts)} ${parts.day} ${MONTHS_SHORT[parts.month - 1]} ${parts.year}`;
}

/** "Mon 2 Nov – Sun 29 Nov 2026" (weekdays, year shown once when both ends share it). */
export function formatCivilRangeWithWeekday(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start || !end) return '';
  const a = parseCivil(start);
  const b = parseCivil(end);
  if (!a || !b) return `${formatCivilDayWithWeekday(start)} – ${formatCivilDayWithWeekday(end)}`;
  if (a.year === b.year) {
    return `${weekdayOf(a)} ${a.day} ${MONTHS_SHORT[a.month - 1]} – ${weekdayOf(b)} ${b.day} ${MONTHS_SHORT[b.month - 1]} ${b.year}`;
  }
  return `${formatCivilDayWithWeekday(start)} – ${formatCivilDayWithWeekday(end)}`;
}

/** "1 Nov 2026, 11:00 am" — a Sydney civil date plus the Sydney wall time of the instant. */
export function formatProgramInstant(value: string | null | undefined): string {
  if (!value) return '';
  const civil = civilDateInTz(new Date(value), PLATFORM_TIMEZONE);
  return `${formatCivilDay(civil)}, ${formatInstantTime(value, PLATFORM_TIMEZONE)}`;
}

/**
 * A period-selector option label built from the backend period's civil start/end:
 * "Week of Mon 2 Nov 2026" / "Fortnight of Mon 2 Nov 2026" / "November 2026".
 * The web never computes the period — only labels what the backend returns.
 */
export function formatPeriodOptionLabel(
  periodType: BillingPeriodType,
  start: string,
  _end?: string,
): string {
  if (periodType === BillingPeriodType.MONTHLY) {
    const parts = parseCivil(start);
    if (!parts) return start;
    return `${MONTHS_FULL[parts.month - 1]} ${parts.year}`;
  }
  const prefix = periodType === BillingPeriodType.FORTNIGHTLY ? 'Fortnight of' : 'Week of';
  return `${prefix} ${formatCivilDayWithWeekday(start)}`;
}
