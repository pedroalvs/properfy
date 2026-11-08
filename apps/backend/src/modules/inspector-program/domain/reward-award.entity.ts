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
  /**
   * Q12 (F08-6): set when the invoice carrying the bonus closes. "Invoiced" = not null.
   * A reward may only be voided after invoicing by an AM (with a reversal, DL3).
   */
  inspectorInvoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A reward is "invoiced" once its bonus line is on a closed/paid invoice (Q12). */
export function isAwardInvoiced(award: Pick<RewardAward, 'inspectorInvoiceId'>): boolean {
  return award.inspectorInvoiceId !== null;
}

/** Only a `PENDING` award can be approved in this slice. */
export function canApprove(status: RewardAwardStatus): boolean {
  return status === 'PENDING';
}

/**
 * Any non-`VOID` award can be voided (Q12). `PENDING`/`APPROVED` not-yet-invoiced is AM/OP
 * (voids the ledger entry); an invoiced `APPROVED` or a `PAID` award is AM-only and produces a
 * reversal (DL3) — the role split is enforced in `VoidRewardAwardUseCase`, not here.
 */
export function canVoid(status: RewardAwardStatus): boolean {
  return status !== 'VOID';
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
