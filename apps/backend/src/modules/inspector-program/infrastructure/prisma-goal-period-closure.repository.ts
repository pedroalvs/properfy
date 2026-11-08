import type { Prisma, PrismaClient } from '@prisma/client';
import type { BillingPeriodType } from '@properfy/shared';
import type { CivilDate } from '../domain/goal.entity';
import type {
  ClosurePeriodRow,
  GoalPeriodClosureInsert,
  IGoalPeriodClosureRepository,
} from '../domain/goal-period-closure.repository';
import type { StreakParticipation } from '../domain/streak';
import { fromDateOnly, toDateOnly } from './prisma-mappers';

type DbClient = PrismaClient | Prisma.TransactionClient;

export class PrismaGoalPeriodClosureRepository implements IGoalPeriodClosureRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private db(tx?: Prisma.TransactionClient): DbClient {
    return tx ?? this.prisma;
  }

  async findStartsByGoalIds(
    goalIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, Set<CivilDate>>> {
    const map = new Map<string, Set<CivilDate>>();
    if (goalIds.length === 0) return map;
    const rows = await this.db(tx).goalPeriodClosure.findMany({
      where: { goal_id: { in: goalIds } },
      select: { goal_id: true, period_start: true },
    });
    for (const row of rows) {
      const set = map.get(row.goal_id) ?? new Set<CivilDate>();
      set.add(fromDateOnly(row.period_start));
      map.set(row.goal_id, set);
    }
    return map;
  }

  async insertManySkipDuplicates(
    closures: GoalPeriodClosureInsert[],
    tx?: Prisma.TransactionClient,
  ): Promise<{ count: number }> {
    if (closures.length === 0) return { count: 0 };
    return this.db(tx).goalPeriodClosure.createMany({
      data: closures.map((c) => ({
        goal_id: c.goalId,
        period_type: c.periodType,
        period_start: toDateOnly(c.periodStart),
        period_end: toDateOnly(c.periodEnd),
        participant_ids: c.participantIds,
        participants_count: c.participantsCount,
        achievers_count: c.achieversCount,
        promised_amount: c.promisedAmount,
        scope_label: c.scopeLabel,
        index_snapshot_date: c.indexSnapshotDate ? toDateOnly(c.indexSnapshotDate) : null,
        trigger: c.trigger,
        closed_at: c.closedAt,
      })),
      skipDuplicates: true,
    });
  }

  async findByPeriod(periodType: BillingPeriodType, periodStart: CivilDate): Promise<ClosurePeriodRow[]> {
    const rows = await this.prisma.goalPeriodClosure.findMany({
      where: { period_type: periodType, period_start: toDateOnly(periodStart) },
    });
    return rows.map((row) => ({
      goalId: row.goal_id,
      periodType: row.period_type,
      periodStart: fromDateOnly(row.period_start),
      periodEnd: fromDateOnly(row.period_end),
      participantsCount: row.participants_count,
      achieversCount: row.achievers_count,
      promisedAmount: row.promised_amount.toNumber(),
      scopeLabel: row.scope_label,
      trigger: row.trigger,
    }));
  }

  async lastClosedByGoalId(goalId: string): Promise<{ periodStart: CivilDate; periodEnd: CivilDate } | null> {
    const row = await this.prisma.goalPeriodClosure.findFirst({
      where: { goal_id: goalId, trigger: { not: 'SKIPPED_INACTIVE' } },
      orderBy: { period_start: 'desc' },
      select: { period_start: true, period_end: true },
    });
    return row ? { periodStart: fromDateOnly(row.period_start), periodEnd: fromDateOnly(row.period_end) } : null;
  }

  async findParticipations(inspectorId: string): Promise<StreakParticipation[]> {
    const [closures, awards] = await Promise.all([
      this.prisma.goalPeriodClosure.findMany({
        where: { participant_ids: { has: inspectorId }, trigger: { not: 'SKIPPED_INACTIVE' } },
        select: { goal_id: true, period_type: true, period_start: true },
      }),
      this.prisma.rewardAward.findMany({
        where: { inspector_id: inspectorId, status: { not: 'VOID' } },
        select: { goal_id: true, period_start: true },
      }),
    ]);
    const awardedKeys = new Set(awards.map((a) => `${a.goal_id}|${fromDateOnly(a.period_start)}`));
    return closures.map((c) => {
      const periodStart = fromDateOnly(c.period_start);
      return {
        goalPeriodType: c.period_type,
        periodStart,
        awarded: awardedKeys.has(`${c.goal_id}|${periodStart}`),
      };
    });
  }
}
