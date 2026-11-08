import type { RewardAwardStatus } from '@properfy/shared';

/** One goal's promised line for a period (P10): its reward × its participant count. */
export interface PromisedGoalInput {
  rewardAmount: number;
  participants: number;
}

/** One award's contribution to the achieved totals. */
export interface SummaryAwardInput {
  status: RewardAwardStatus;
  amount: number;
}

export interface PeriodTotals {
  promised: number;
  achieved: number;
  approved: number;
  paid: number;
  pending: number;
  voided: number;
}

/**
 * Promised-vs-achieved totals for a period (P10). `promised` is the sum of each
 * goal's `rewardAmount × participants`; `achieved` is the sum of non-void awards;
 * the four status buckets are tracked separately. An open period passes the
 * current participant counts and no awards (achieved 0).
 */
export function summarizePeriod(goals: PromisedGoalInput[], awards: SummaryAwardInput[]): PeriodTotals {
  const promised = goals.reduce((sum, g) => sum + g.rewardAmount * g.participants, 0);
  const totals: PeriodTotals = { promised, achieved: 0, approved: 0, paid: 0, pending: 0, voided: 0 };
  for (const award of awards) {
    switch (award.status) {
      case 'APPROVED':
        totals.approved += award.amount;
        totals.achieved += award.amount;
        break;
      case 'PAID':
        totals.paid += award.amount;
        totals.achieved += award.amount;
        break;
      case 'PENDING':
        totals.pending += award.amount;
        totals.achieved += award.amount;
        break;
      case 'VOID':
        totals.voided += award.amount;
        break;
    }
  }
  return totals;
}
