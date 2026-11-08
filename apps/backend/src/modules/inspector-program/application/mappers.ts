import type { GoalResponse, RewardAwardResponse } from '@properfy/shared';
import type { CivilDate } from '../domain/goal.entity';
import type { GoalWithScope } from '../domain/goal.repository';
import { currentGoalPeriod, minEndsAt } from '../domain/goal-periods';
import type { RewardAwardWithRelations } from '../domain/reward-award.repository';

/** A closed-period range used for `lastClosedPeriod`. */
export interface ClosedPeriodRange {
  periodStart: CivilDate;
  periodEnd: CivilDate;
}

export interface GoalResponseExtras {
  /** Today's civil date in `PLATFORM_TIMEZONE` (drives currentPeriod/minEndsAt). */
  today: CivilDate;
  /** The goal's most recent non-skipped closed period, or null (list omits it). */
  lastClosedPeriod: ClosedPeriodRange | null;
  /** First period a just-reactivated goal resumes on (update response only). */
  resumesOn?: CivilDate | null;
}

/** Map a goal + its scope names to the AM/OP goal response (FR-010). */
export function toGoalResponse(goal: GoalWithScope, extras: GoalResponseExtras): GoalResponse {
  const current = currentGoalPeriod(goal, extras.today);
  const pendingChange =
    goal.nextEffectiveFrom !== null
      ? {
          target: goal.nextTarget ?? goal.target,
          rewardAmount: goal.nextRewardAmount ?? goal.rewardAmount,
          effectiveFrom: goal.nextEffectiveFrom,
        }
      : null;

  return {
    id: goal.id,
    title: goal.title,
    metric: goal.metric,
    comparator: goal.comparator,
    target: goal.target,
    period: goal.period,
    scopeRegionId: goal.scopeRegionId,
    scopeServiceTypeId: goal.scopeServiceTypeId,
    scopeInspectorId: goal.scopeInspectorId,
    scopeRegionName: goal.scope.regionName,
    scopeServiceTypeName: goal.scope.serviceTypeName,
    scopeInspectorName: goal.scope.inspectorName,
    rewardAmount: goal.rewardAmount,
    startsAt: goal.startsAt,
    endsAt: goal.endsAt,
    active: goal.active,
    deactivatedAt: goal.deactivatedAt ? goal.deactivatedAt.toISOString() : null,
    pendingChange,
    resumesOn: extras.resumesOn ?? null,
    minEndsAt: minEndsAt(goal, extras.today),
    currentPeriod: current ? { start: current.periodStart, end: current.periodEnd } : null,
    lastClosedPeriod: extras.lastClosedPeriod
      ? { start: extras.lastClosedPeriod.periodStart, end: extras.lastClosedPeriod.periodEnd }
      : null,
    // A region-volume goal with no region means the region was hard-deleted (SetNull).
    scopeRegionDeleted: goal.metric === 'REGION_VOLUME' && goal.scopeRegionId === null,
    createdByUserId: goal.createdByUserId,
    updatedByUserId: goal.updatedByUserId,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  };
}

/** Map a reward award + its joined relations to the AM/OP award response (FR-010). */
export function toRewardAwardResponse(award: RewardAwardWithRelations): RewardAwardResponse {
  return {
    id: award.id,
    goalId: award.goalId,
    inspectorId: award.inspectorId,
    periodType: award.periodType,
    periodStart: award.periodStart,
    periodEnd: award.periodEnd,
    goalTitle: award.goalTitle,
    metric: award.metric,
    comparator: award.comparator,
    target: award.target,
    amount: award.amount,
    scopeLabel: award.scopeLabel,
    achievedValue: award.achievedValue,
    serviceCount: award.serviceCount,
    achievedOn: award.achievedOn,
    indexScoreAtClose: award.indexScoreAtClose,
    levelAtClose: award.levelAtClose,
    indexSnapshotDate: award.indexSnapshotDate,
    status: award.status,
    approvedByUserId: award.approvedByUserId,
    approvedByName: award.approvedBy?.name ?? null,
    approvedAt: award.approvedAt ? award.approvedAt.toISOString() : null,
    paidAt: award.paidAt ? award.paidAt.toISOString() : null,
    voidedByUserId: award.voidedByUserId,
    voidedByName: award.voidedBy?.name ?? null,
    voidedAt: award.voidedAt ? award.voidedAt.toISOString() : null,
    voidReason: award.voidReason,
    inspectorNote: award.inspectorNote,
    goal: { id: award.goal.id, title: award.goal.title },
    inspector: { id: award.inspector.id, name: award.inspector.name, email: award.inspector.email },
    // Q12 (F08-6): the bonus ledger entry, the invoice it rode, and whether a void happened
    // after invoicing (status VOID with an invoice link → a reversal was issued).
    financialEntryId: award.financialEntryId,
    invoice: award.invoice,
    voidedAfterInvoicing: award.status === 'VOID' && award.inspectorInvoiceId !== null,
    createdAt: award.createdAt.toISOString(),
    updatedAt: award.updatedAt.toISOString(),
  };
}
