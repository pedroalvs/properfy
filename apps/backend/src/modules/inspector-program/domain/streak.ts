import { addCivilDays, type BillingPeriodType } from '@properfy/shared';
import { getCanonicalPeriod } from '../../billing/domain/billing-period.service';
import type { CivilDate } from './goal.entity';

/** One closed period the inspector participated in, with whether they were awarded (P11). */
export interface StreakParticipation {
  goalPeriodType: BillingPeriodType;
  periodStart: CivilDate;
  /** True iff the inspector has a non-void award for at least one goal of this period. */
  awarded: boolean;
}

const CYCLE_ORDER: Record<BillingPeriodType, number> = { WEEKLY: 0, FORTNIGHTLY: 1, MONTHLY: 2 };
const STREAK_LOOKBACK_MAX = 104;

/**
 * The inspector's streak (P11/D4): consecutive closed periods, in their smallest
 * participated cycle, each with at least one non-void award. Walking back from the
 * last closed period: an awarded period counts, a participated-but-unawarded period
 * stops the streak, a period the inspector did not participate in is skipped.
 */
export function computeStreak(input: {
  today: CivilDate;
  participations: StreakParticipation[];
}): { cycle: BillingPeriodType | null; count: number } {
  const { today, participations } = input;
  if (participations.length === 0) return { cycle: null, count: 0 };

  const cycle = participations.reduce<BillingPeriodType>(
    (smallest, p) => (CYCLE_ORDER[p.goalPeriodType] < CYCLE_ORDER[smallest] ? p.goalPeriodType : smallest),
    participations[0]!.goalPeriodType,
  );

  const awardedByStart = new Map<CivilDate, boolean>();
  for (const p of participations) {
    if (p.goalPeriodType !== cycle) continue;
    awardedByStart.set(p.periodStart, (awardedByStart.get(p.periodStart) ?? false) || p.awarded);
  }

  let count = 0;
  let cursor = addCivilDays(getCanonicalPeriod(cycle, today).periodStart, -1);
  for (let i = 0; i < STREAK_LOOKBACK_MAX; i += 1) {
    const period = getCanonicalPeriod(cycle, cursor);
    if (awardedByStart.has(period.periodStart)) {
      if (awardedByStart.get(period.periodStart)) count += 1;
      else break; // participated without an award → streak ends
    }
    cursor = addCivilDays(period.periodStart, -1);
  }
  return { cycle, count };
}

/**
 * A streak is "at risk" (D10 message trigger) when the inspector has an active
 * streak, today is the last day of the current cycle period, they participate in a
 * goal of that cycle, and nothing has been achieved yet this period.
 */
export function isStreakAtRisk(input: {
  streak: number;
  today: CivilDate;
  currentPeriodEnd: CivilDate;
  participatesInCycleGoal: boolean;
  achievedSoFar: boolean;
}): boolean {
  return (
    input.streak >= 1 &&
    input.today === input.currentPeriodEnd &&
    input.participatesInCycleGoal &&
    !input.achievedSoFar
  );
}
