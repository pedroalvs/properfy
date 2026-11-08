import type { Prisma } from '@prisma/client';
import type { BillingPeriodType, GoalComparator, GoalMetric } from '@properfy/shared';
import type { CivilDate, Goal } from './goal.entity';

/** Current names of a goal's scope targets (null when the scope is unset). */
export interface GoalScopeNames {
  regionName: string | null;
  serviceTypeName: string | null;
  inspectorName: string | null;
}

/** A goal plus the current names of its scope targets, for response mapping. */
export type GoalWithScope = Goal & { scope: GoalScopeNames };

export interface CreateGoalData {
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
  createdByUserId: string;
}

export interface UpdateGoalData {
  title?: string;
  target?: number;
  rewardAmount?: number;
  endsAt?: CivilDate | null;
  active?: boolean;
  deactivatedAt?: Date | null;
  nextTarget?: number | null;
  nextRewardAmount?: number | null;
  nextEffectiveFrom?: CivilDate | null;
  updatedByUserId: string;
}

export interface GoalListFilter {
  active?: boolean;
  metric?: GoalMetric;
  period?: BillingPeriodType;
  page: number;
  pageSize: number;
  sortBy: 'createdAt' | 'title' | 'startsAt';
  sortOrder: 'asc' | 'desc';
}

export interface IGoalRepository {
  /** All active goals, with current scope names (for the daily closure job's `scope_label`). */
  findActive(tx?: Prisma.TransactionClient): Promise<GoalWithScope[]>;
  findById(id: string, tx?: Prisma.TransactionClient): Promise<GoalWithScope | null>;
  /** Goals by id (for the period summary); order is not guaranteed. */
  findByIds(ids: string[]): Promise<Goal[]>;
  create(data: CreateGoalData): Promise<GoalWithScope>;
  update(id: string, data: UpdateGoalData, tx?: Prisma.TransactionClient): Promise<GoalWithScope>;
  list(filter: GoalListFilter): Promise<{ data: GoalWithScope[]; total: number }>;
  /** Count of active goals that reference a region (region-delete guard). */
  countActiveByScopeRegionId(regionId: string): Promise<number>;
  /** Promote pending `next_*` terms into the live terms and clear them (system action). */
  promoteNextTerms(
    id: string,
    terms: { target: number; rewardAmount: number },
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}

/** Existence checks for goal scope targets (create-goal validation). */
export interface IGoalScopeReader {
  regionExists(id: string): Promise<boolean>;
  serviceTypeExists(id: string): Promise<boolean>;
  inspectorExists(id: string): Promise<boolean>;
}
