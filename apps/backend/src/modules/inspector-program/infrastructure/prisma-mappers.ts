import type { Prisma, InspectorGoal as PrismaGoal, RewardAward as PrismaAward } from '@prisma/client';
import type { InspectorLevel } from '@properfy/shared';
import type { Goal } from '../domain/goal.entity';
import type { GoalWithScope } from '../domain/goal.repository';
import type { RewardAward } from '../domain/reward-award.entity';

/** Civil date string (YYYY-MM-DD) → UTC-midnight Date for a `@db.Date` column. */
export function toDateOnly(civil: string): Date {
  return new Date(`${civil}T00:00:00.000Z`);
}

/** `@db.Date` value (UTC midnight) → its YYYY-MM-DD civil string. */
export function fromDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const num = (d: Prisma.Decimal): number => d.toNumber();
const numOrNull = (d: Prisma.Decimal | null): number | null => (d === null ? null : d.toNumber());

export function mapGoal(row: PrismaGoal): Goal {
  return {
    id: row.id,
    title: row.title,
    metric: row.metric,
    comparator: row.comparator,
    target: num(row.target),
    period: row.period,
    scopeRegionId: row.scope_region_id,
    scopeServiceTypeId: row.scope_service_type_id,
    scopeInspectorId: row.scope_inspector_id,
    rewardAmount: num(row.reward_amount),
    startsAt: fromDateOnly(row.starts_at),
    endsAt: row.ends_at ? fromDateOnly(row.ends_at) : null,
    active: row.active,
    deactivatedAt: row.deactivated_at,
    nextTarget: numOrNull(row.next_target),
    nextRewardAmount: numOrNull(row.next_reward_amount),
    nextEffectiveFrom: row.next_effective_from ? fromDateOnly(row.next_effective_from) : null,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type GoalScopeRelations = {
  scope_region: { name: string } | null;
  scope_service_type: { name: string } | null;
  scope_inspector: { name: string } | null;
};

export function mapGoalWithScope(row: PrismaGoal & GoalScopeRelations): GoalWithScope {
  return {
    ...mapGoal(row),
    scope: {
      regionName: row.scope_region?.name ?? null,
      serviceTypeName: row.scope_service_type?.name ?? null,
      inspectorName: row.scope_inspector?.name ?? null,
    },
  };
}

export function mapRewardAward(row: PrismaAward): RewardAward {
  return {
    id: row.id,
    goalId: row.goal_id,
    inspectorId: row.inspector_id,
    periodType: row.period_type,
    periodStart: fromDateOnly(row.period_start),
    periodEnd: fromDateOnly(row.period_end),
    goalTitle: row.goal_title,
    metric: row.metric,
    comparator: row.comparator,
    target: num(row.target),
    amount: num(row.amount),
    scopeLabel: row.scope_label,
    achievedValue: num(row.achieved_value),
    serviceCount: row.service_count,
    achievedOn: fromDateOnly(row.achieved_on),
    indexScoreAtClose: numOrNull(row.index_score_at_close),
    levelAtClose: (row.level_at_close as InspectorLevel | null) ?? null,
    indexSnapshotDate: row.index_snapshot_date ? fromDateOnly(row.index_snapshot_date) : null,
    status: row.status,
    approvedByUserId: row.approved_by_user_id,
    approvedAt: row.approved_at,
    paidAt: row.paid_at,
    voidedByUserId: row.voided_by_user_id,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    inspectorNote: row.inspector_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
