import type { BillingPeriodType, GoalComparator, GoalMetric } from '@properfy/shared';

/** Civil date string, `YYYY-MM-DD`. */
export type CivilDate = string;

/**
 * Inspector program goal (F08). Platform-scoped domain entity (no `tenant_id`,
 * D12). The repository maps the Prisma row (snake_case, Decimal) to this
 * camelCase, `number`-typed shape. Pure domain functions read only the fields
 * they need; the whole entity is assignable to each function's input subset.
 */
export interface Goal {
  id: string;
  title: string;
  metric: GoalMetric;
  comparator: GoalComparator;
  target: number;
  period: BillingPeriodType;
  scopeRegionId: string | null;
  scopeServiceTypeId: string | null;
  scopeInspectorId: string | null;
  rewardAmount: number;
  startsAt: CivilDate;
  endsAt: CivilDate | null;
  active: boolean;
  deactivatedAt: Date | null;
  nextTarget: number | null;
  nextRewardAmount: number | null;
  nextEffectiveFrom: CivilDate | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
