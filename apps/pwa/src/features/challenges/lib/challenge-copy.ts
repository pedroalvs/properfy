import {
  GOAL_METRIC_KIND,
  formatShortDayLabel,
  type BillingPeriodType,
  type GoalMetric,
  type RewardAwardStatus,
} from '@properfy/shared';

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Footer shown on Active and My results (L-F08-14, Q12). */
export const BONUS_FOOTER =
  "Bonuses are reviewed by the Properfy team. Once approved, they're added to your next invoice and show in Earnings.";

/** Footer shown on Ranking (L-F08-07). */
export const RANKING_FOOTER =
  'Ranked against all active inspectors on the platform. Other inspectors are shown without names. Updated daily.';

/** AUD amount with no cents when whole: `$60`, `$60.50`. */
export function formatBonus(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/** A civil date (`YYYY-MM-DD`) as `Mon 2 Nov`, Sydney-pinned (never the device timezone). */
export function formatCivilShort(civilDate: string): string {
  return formatShortDayLabel(civilDate);
}

/** A reward's period label: `Week of Mon 2 Nov`, `Fortnight of Mon 2 Nov`, `November 2026`. */
export function periodLabel(periodType: BillingPeriodType, periodStart: string): string {
  if (periodType === 'MONTHLY') {
    const [year = '', month = ''] = periodStart.split('-');
    return `${MONTHS_LONG[Number(month) - 1] ?? ''} ${year}`.trim();
  }
  const prefix = periodType === 'WEEKLY' ? 'Week of' : 'Fortnight of';
  return `${prefix} ${formatCivilShort(periodStart)}`;
}

export interface GoalProgressView {
  metric: GoalMetric;
  value: number | null;
  target: number;
  serviceCount: number;
  minimumServices: number | null;
  state: 'MET_SO_FAR' | 'IN_PROGRESS' | 'BELOW_TARGET' | 'NOT_ENOUGH_SERVICES' | 'NO_DATA' | 'UPCOMING';
}

/** Whether a goal renders a progress bar (volume metrics only). */
export function hasProgressBar(metric: GoalMetric): boolean {
  return GOAL_METRIC_KIND[metric] === 'VOLUME';
}

/** The progress line under a goal's description. */
export function goalProgressText(goal: GoalProgressView): string {
  if (goal.state === 'NO_DATA') return 'No data yet';
  if (goal.state === 'NOT_ENOUGH_SERVICES') {
    return `${goal.serviceCount} of ${goal.minimumServices ?? 10} jobs to qualify`;
  }
  const kind = GOAL_METRIC_KIND[goal.metric];
  if (kind === 'VOLUME') return `${goal.value ?? 0} of ${goal.target}`;
  if (kind === 'INDEX') return `Index ${goal.value ?? 0} so far`;
  // Rate metrics.
  if (goal.metric === 'LATE_NOTICE' && goal.value === 100) return 'No late arrivals so far';
  return `${goal.value ?? 0}% so far`;
}

/** The deadline/status line. */
export function goalStatusLine(goal: {
  metric: GoalMetric;
  state: GoalProgressView['state'];
  daysLeft: number;
  target: number;
}): string {
  if (goal.state === 'MET_SO_FAR') {
    return GOAL_METRIC_KIND[goal.metric] === 'VOLUME' ? 'Target reached' : 'On track';
  }
  const deadline = goal.daysLeft <= 0 ? 'Last day' : goal.daysLeft === 1 ? '1 day left' : `${goal.daysLeft} days left`;
  if (goal.state === 'BELOW_TARGET' && GOAL_METRIC_KIND[goal.metric] !== 'VOLUME') {
    return `${deadline} · Target ${goal.target}%`;
  }
  return deadline;
}

const REWARD_CHIP_LABELS: Record<RewardAwardStatus, string> = {
  PENDING: 'Pending review',
  APPROVED: 'Approved – on your next invoice',
  PAID: 'Paid',
  VOID: 'Voided',
};

/** Inspector-facing chip label for a reward status (DL14 copy; the shared enum stays the identity source). */
export function rewardChipLabel(status: RewardAwardStatus): string {
  return REWARD_CHIP_LABELS[status];
}

type ChipTone = 'default' | 'good' | 'warning' | 'danger';
const REWARD_CHIP_TONES: Record<RewardAwardStatus, ChipTone> = {
  PENDING: 'warning',
  APPROVED: 'default',
  PAID: 'good',
  VOID: 'danger',
};

export function rewardChipTone(status: RewardAwardStatus): ChipTone {
  return REWARD_CHIP_TONES[status];
}
