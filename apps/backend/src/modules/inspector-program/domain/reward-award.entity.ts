import type { BillingPeriodType, GoalComparator, GoalMetric, InspectorLevel, RewardAwardStatus } from '@properfy/shared';
import type { CivilDate } from './goal.entity';

/**
 * Reward award (F08). Platform-scoped (no `tenant_id`, D12). Carries an immutable
 * snapshot of the goal at close plus the result and the review lifecycle. In this
 * slice the status moves `PENDING → APPROVED` and `PENDING|APPROVED → VOID`; `PAID`
 * and void-after-invoicing arrive in TASK-F08-6 (Q12).
 */
export interface RewardAward {
  id: string;
  goalId: string;
  inspectorId: string;
  periodType: BillingPeriodType;
  periodStart: CivilDate;
  periodEnd: CivilDate;
  goalTitle: string;
  metric: GoalMetric;
  comparator: GoalComparator;
  target: number;
  amount: number;
  scopeLabel: string | null;
  achievedValue: number;
  serviceCount: number;
  achievedOn: CivilDate;
  indexScoreAtClose: number | null;
  levelAtClose: InspectorLevel | null;
  indexSnapshotDate: CivilDate | null;
  status: RewardAwardStatus;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  voidedByUserId: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  inspectorNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Only a `PENDING` award can be approved in this slice. */
export function canApprove(status: RewardAwardStatus): boolean {
  return status === 'PENDING';
}

/** `PENDING` and `APPROVED` awards can be voided here; `PAID`/`VOID` cannot (F08-6 owns paid void). */
export function canVoid(status: RewardAwardStatus): boolean {
  return status === 'PENDING' || status === 'APPROVED';
}

const STATUS_WORD: Record<RewardAwardStatus, string> = {
  PENDING: 'pending',
  APPROVED: 'approved',
  PAID: 'paid',
  VOID: 'voided',
};

/** The human word for the "This reward is already {word}" conflict message. */
export function rewardStatusWord(status: RewardAwardStatus): string {
  return STATUS_WORD[status];
}
