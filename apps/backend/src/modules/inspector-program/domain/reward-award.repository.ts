import type { Prisma } from '@prisma/client';
import type { BillingPeriodType, GoalComparator, GoalMetric, InspectorLevel, RewardAwardStatus } from '@properfy/shared';
import type { CivilDate } from './goal.entity';
import type { RewardAward } from './reward-award.entity';

/** The immutable snapshot + result written when an award is created at close. */
export interface RewardAwardInsert {
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
}

export interface RewardAwardListFilter {
  status?: RewardAwardStatus;
  periodType?: BillingPeriodType;
  periodStart?: CivilDate;
  goalId?: string;
  inspectorId?: string;
  page: number;
  pageSize: number;
}

/** An award with the related names the AM/OP responses render. */
export interface RewardAwardWithRelations extends RewardAward {
  goal: { id: string; title: string };
  inspector: { id: string; name: string; email: string };
  approvedBy: { id: string; name: string } | null;
  voidedBy: { id: string; name: string } | null;
}

export interface IRewardAwardRepository {
  /** Insert achiever awards; duplicates (same goal/inspector/period) are ignored. */
  insertManySkipDuplicates(awards: RewardAwardInsert[], tx?: Prisma.TransactionClient): Promise<{ count: number }>;
  /** All awards for one goal + period (re-read after insert; audit + createdAwardIds). */
  findByGoalPeriod(goalId: string, periodStart: CivilDate, tx?: Prisma.TransactionClient): Promise<RewardAward[]>;
  findById(id: string): Promise<RewardAwardWithRelations | null>;
  list(filter: RewardAwardListFilter): Promise<{ data: RewardAwardWithRelations[]; total: number }>;
  /** Awards for a closed period (summary totals). */
  findByPeriod(periodType: BillingPeriodType, periodStart: CivilDate): Promise<RewardAward[]>;
  /** CAS `PENDING → APPROVED`; returns rows affected (0 = lost the race). */
  approvePending(id: string, approverId: string, at: Date, tx?: Prisma.TransactionClient): Promise<number>;
  /** CAS `PENDING|APPROVED → VOID`; returns rows affected (0 = lost the race). */
  voidPendingOrApproved(
    id: string,
    voiderId: string,
    at: Date,
    reason: string,
    inspectorNote: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;
}
