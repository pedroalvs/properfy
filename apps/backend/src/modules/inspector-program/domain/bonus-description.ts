import type { BillingPeriodType } from '@properfy/shared';
import type { CivilDate } from './goal.entity';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/**
 * Format a civil date `YYYY-MM-DD` as `Mon 2 Nov`, using fixed label arrays rather than
 * `toLocaleDateString` so the frozen ledger/invoice text never drifts with the host ICU
 * version or timezone (memory project_icu_locale_default_date_format_node_version_drift).
 * The weekday is computed from UTC midnight of the civil date (no timezone shift).
 */
export function shortCivilDate(date: CivilDate): string {
  const parts = date.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${d} ${MONTHS[m - 1]}`;
}

/** Full month name (no year) for a civil date's month, e.g. `November` (ICU-stable). */
export function civilMonthLong(date: CivilDate): string {
  const m = Number(date.split('-')[1]);
  return MONTHS_LONG[m - 1]!;
}

/** Human label for the billing period the bonus rode (e.g. `Week of Mon 2 Nov`). */
export function bonusPeriodLabel(periodType: BillingPeriodType, periodStart: CivilDate): string {
  switch (periodType) {
    case 'WEEKLY':
      return `Week of ${shortCivilDate(periodStart)}`;
    case 'FORTNIGHTLY':
      return `Fortnight of ${shortCivilDate(periodStart)}`;
    case 'MONTHLY': {
      const parts = periodStart.split('-');
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      return `${MONTHS_LONG[m - 1]} ${y}`;
    }
  }
}

/** The frozen description stored on the original bonus ledger entry. */
export function bonusEntryDescription(
  goalTitle: string,
  periodType: BillingPeriodType,
  periodStart: CivilDate,
): string {
  return `Bonus: ${goalTitle} · ${bonusPeriodLabel(periodType, periodStart)}`;
}

/** The frozen description stored on a bonus reversal entry. */
export function bonusReversalDescription(
  goalTitle: string,
  periodType: BillingPeriodType,
  periodStart: CivilDate,
): string {
  return `Bonus reversal: ${goalTitle} · ${bonusPeriodLabel(periodType, periodStart)}`;
}
