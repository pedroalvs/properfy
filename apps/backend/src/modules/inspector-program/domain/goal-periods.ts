import type { BillingPeriodType } from '@properfy/shared';
import { CLOSE_CATCH_UP_MAX_PERIODS } from '@properfy/shared';
import { getCanonicalPeriod, type BillingPeriod } from '../../billing/domain/billing-period.service';
import type { CivilDate } from './goal.entity';

/**
 * Pure period math for inspector-program goals (F08). Reuses the billing
 * `getCanonicalPeriod` (civil dates in `PLATFORM_TIMEZONE`) — never a copy — and
 * never touches the database. "today" is always a civil date supplied by the
 * caller (the job/use case resolves it in `PLATFORM_TIMEZONE`).
 */

const MS_PER_DAY = 86_400_000;

function addCivilDays(ymd: CivilDate, days: number): CivilDate {
  return new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** The schedule fields the period functions read from a goal. */
export interface GoalScheduleInput {
  period: BillingPeriodType;
  startsAt: CivilDate;
  endsAt: CivilDate | null;
}

/** The terms fields `goalTermsForPeriod` reads from a goal. */
export interface GoalTermsInput {
  target: number;
  rewardAmount: number;
  nextTarget: number | null;
  nextRewardAmount: number | null;
  nextEffectiveFrom: CivilDate | null;
}

/** True when the period lies within the goal's active span (`startsAt`..`endsAt`). */
function withinGoal(goal: GoalScheduleInput, period: BillingPeriod): boolean {
  if (period.periodStart < goal.startsAt) return false;
  if (goal.endsAt !== null && period.periodEnd > goal.endsAt) return false;
  return true;
}

/**
 * Periods of the goal that have already ended (`periodEnd < today`), lie within
 * the goal's span, and have no closure yet (`closedStarts` includes
 * `SKIPPED_INACTIVE` rows). Oldest first, capped at `CLOSE_CATCH_UP_MAX_PERIODS`.
 */
export function goalPeriodsToClose(
  goal: GoalScheduleInput,
  today: CivilDate,
  closedStarts: ReadonlySet<CivilDate> | CivilDate[],
): BillingPeriod[] {
  const closed = closedStarts instanceof Set ? closedStarts : new Set(closedStarts);
  const periods: BillingPeriod[] = [];
  let cursor = goal.startsAt;
  // Hard stop well above the cap so a far-future `today` cannot loop unbounded.
  for (let guard = 0; guard < 1000; guard += 1) {
    const period = getCanonicalPeriod(goal.period, cursor);
    if (goal.endsAt !== null && period.periodEnd > goal.endsAt) break;
    if (period.periodEnd >= today) break; // not ended yet
    if (!closed.has(period.periodStart)) periods.push(period);
    cursor = addCivilDays(period.periodEnd, 1);
  }
  return periods.slice(0, CLOSE_CATCH_UP_MAX_PERIODS);
}

/**
 * The periods `goalPeriodsToClose` would have returned without the cap — used by
 * the close use case to detect (and log) a catch-up that was capped.
 */
export function countPeriodsToClose(
  goal: GoalScheduleInput,
  today: CivilDate,
  closedStarts: ReadonlySet<CivilDate> | CivilDate[],
): number {
  const closed = closedStarts instanceof Set ? closedStarts : new Set(closedStarts);
  let count = 0;
  let cursor = goal.startsAt;
  for (let guard = 0; guard < 1000; guard += 1) {
    const period = getCanonicalPeriod(goal.period, cursor);
    if (goal.endsAt !== null && period.periodEnd > goal.endsAt) break;
    if (period.periodEnd >= today) break;
    if (!closed.has(period.periodStart)) count += 1;
    cursor = addCivilDays(period.periodEnd, 1);
  }
  return count;
}

/** The period containing `today`, or null before `startsAt` or after `endsAt`. */
export function currentGoalPeriod(goal: GoalScheduleInput, today: CivilDate): BillingPeriod | null {
  if (today < goal.startsAt) return null;
  if (goal.endsAt !== null && today > goal.endsAt) return null;
  return getCanonicalPeriod(goal.period, today);
}

/**
 * Periods to record as `SKIPPED_INACTIVE` on reactivation (L-F08-02): every
 * canonical period of the goal that has started on/before `today`, lies within
 * the goal's span, and has no closure yet — including the current one, so the
 * goal only counts again from the next period. No cap (no evaluation happens).
 */
export function periodsToSkipOnReactivation(
  goal: GoalScheduleInput,
  today: CivilDate,
  closedStarts: ReadonlySet<CivilDate> | CivilDate[],
): BillingPeriod[] {
  const closed = closedStarts instanceof Set ? closedStarts : new Set(closedStarts);
  const periods: BillingPeriod[] = [];
  let cursor = goal.startsAt;
  for (let guard = 0; guard < 2000; guard += 1) {
    const period = getCanonicalPeriod(goal.period, cursor);
    if (period.periodStart > today) break;
    if (goal.endsAt !== null && period.periodEnd > goal.endsAt) break;
    if (!closed.has(period.periodStart)) periods.push(period);
    cursor = addCivilDays(period.periodEnd, 1);
  }
  return periods;
}

/** The target/reward in force for a given period (current vs. pending `next_*`). */
export function goalTermsForPeriod(
  goal: GoalTermsInput,
  periodStart: CivilDate,
): { target: number; rewardAmount: number } {
  if (goal.nextEffectiveFrom !== null && periodStart >= goal.nextEffectiveFrom) {
    return {
      target: goal.nextTarget ?? goal.target,
      rewardAmount: goal.nextRewardAmount ?? goal.rewardAmount,
    };
  }
  return { target: goal.target, rewardAmount: goal.rewardAmount };
}

/**
 * Smallest `endsAt` a PATCH may set (L-F08-02): the end of the period in progress,
 * or the end of the first period when the goal has not started yet. To stop a goal
 * sooner than this, deactivate it.
 */
export function minEndsAt(goal: GoalScheduleInput, today: CivilDate): CivilDate {
  const anchor = today < goal.startsAt ? goal.startsAt : today;
  return getCanonicalPeriod(goal.period, anchor).periodEnd;
}

export { withinGoal };
