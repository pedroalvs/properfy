import type { Prisma } from '@prisma/client';
import type { BillingPeriodType } from '@properfy/shared';
import type { CivilDate } from './goal.entity';
import type { StreakParticipation } from './streak';

/** A closure row to insert (SCHEDULED/STARTUP at close, or SKIPPED_INACTIVE on reactivation). */
export interface GoalPeriodClosureInsert {
  goalId: string;
  periodType: BillingPeriodType;
  periodStart: CivilDate;
  periodEnd: CivilDate;
  participantIds: string[];
  participantsCount: number;
  achieversCount: number;
  promisedAmount: number;
  scopeLabel: string | null;
  indexSnapshotDate: CivilDate | null;
  trigger: 'SCHEDULED' | 'STARTUP' | 'SKIPPED_INACTIVE';
  closedAt: Date;
}

/** A closed period's aggregate line for the summary. */
export interface ClosurePeriodRow {
  goalId: string;
  periodType: BillingPeriodType;
  periodStart: CivilDate;
  periodEnd: CivilDate;
  participantsCount: number;
  achieversCount: number;
  promisedAmount: number;
  scopeLabel: string | null;
  trigger: string;
}

export interface IGoalPeriodClosureRepository {
  /** Existing closure period-starts per goal (including SKIPPED_INACTIVE), to skip already-closed periods. */
  findStartsByGoalIds(
    goalIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, Set<CivilDate>>>;
  /** Insert closures; duplicates (same goal + period) are ignored. Returns inserted count. */
  insertManySkipDuplicates(
    closures: GoalPeriodClosureInsert[],
    tx?: Prisma.TransactionClient,
  ): Promise<{ count: number }>;
  /** All closures for a period (summary). */
  findByPeriod(periodType: BillingPeriodType, periodStart: CivilDate): Promise<ClosurePeriodRow[]>;
  /** The most recent closed (non-skipped) period of a goal, for `lastClosedPeriod`. */
  lastClosedByGoalId(goalId: string): Promise<{ periodStart: CivilDate; periodEnd: CivilDate } | null>;
  /** Participations of an inspector (closures whose `participant_ids` contain them), for the streak. */
  findParticipations(inspectorId: string): Promise<StreakParticipation[]>;
}
