import type { Prisma, PrismaClient } from '@prisma/client';
import type { BillingPeriodType } from '@properfy/shared';
import type { CivilDate } from '../domain/goal.entity';
import { compareAwardsForRanking } from '../domain/ordering';
import type { RewardAward } from '../domain/reward-award.entity';
import type {
  IRewardAwardRepository,
  RewardAwardInsert,
  RewardAwardListFilter,
  RewardAwardWithRelations,
} from '../domain/reward-award.repository';
import { mapRewardAward, toDateOnly } from './prisma-mappers';

type DbClient = PrismaClient | Prisma.TransactionClient;

const RELATION_INCLUDE = {
  goal: { select: { id: true, title: true } },
  inspector: { select: { id: true, name: true, email: true } },
  approved_by: { select: { id: true, name: true } },
  voided_by: { select: { id: true, name: true } },
} as const;

type AwardWithRelationRows = Prisma.RewardAwardGetPayload<{ include: typeof RELATION_INCLUDE }>;

function mapWithRelations(row: AwardWithRelationRows): RewardAwardWithRelations {
  return {
    ...mapRewardAward(row),
    goal: { id: row.goal.id, title: row.goal.title },
    inspector: { id: row.inspector.id, name: row.inspector.name, email: row.inspector.email },
    approvedBy: row.approved_by ? { id: row.approved_by.id, name: row.approved_by.name } : null,
    voidedBy: row.voided_by ? { id: row.voided_by.id, name: row.voided_by.name } : null,
  };
}

export class PrismaRewardAwardRepository implements IRewardAwardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private db(tx?: Prisma.TransactionClient): DbClient {
    return tx ?? this.prisma;
  }

  async insertManySkipDuplicates(awards: RewardAwardInsert[], tx?: Prisma.TransactionClient): Promise<{ count: number }> {
    if (awards.length === 0) return { count: 0 };
    return this.db(tx).rewardAward.createMany({
      data: awards.map((a) => ({
        goal_id: a.goalId,
        inspector_id: a.inspectorId,
        period_type: a.periodType,
        period_start: toDateOnly(a.periodStart),
        period_end: toDateOnly(a.periodEnd),
        goal_title: a.goalTitle,
        metric: a.metric,
        comparator: a.comparator,
        target: a.target,
        amount: a.amount,
        scope_label: a.scopeLabel,
        achieved_value: a.achievedValue,
        service_count: a.serviceCount,
        achieved_on: toDateOnly(a.achievedOn),
        index_score_at_close: a.indexScoreAtClose,
        level_at_close: a.levelAtClose,
        index_snapshot_date: a.indexSnapshotDate ? toDateOnly(a.indexSnapshotDate) : null,
      })),
      skipDuplicates: true,
    });
  }

  async findByGoalPeriod(
    goalId: string,
    periodStart: CivilDate,
    tx?: Prisma.TransactionClient,
  ): Promise<RewardAward[]> {
    const rows = await this.db(tx).rewardAward.findMany({
      where: { goal_id: goalId, period_start: toDateOnly(periodStart) },
    });
    return rows.map(mapRewardAward);
  }

  async findById(id: string): Promise<RewardAwardWithRelations | null> {
    const row = await this.prisma.rewardAward.findUnique({ where: { id }, include: RELATION_INCLUDE });
    return row ? mapWithRelations(row) : null;
  }

  async list(filter: RewardAwardListFilter): Promise<{ data: RewardAwardWithRelations[]; total: number }> {
    const where: Prisma.RewardAwardWhereInput = {};
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.periodType !== undefined) where.period_type = filter.periodType;
    if (filter.periodStart !== undefined) where.period_start = toDateOnly(filter.periodStart);
    if (filter.goalId !== undefined) where.goal_id = filter.goalId;
    if (filter.inspectorId !== undefined) where.inspector_id = filter.inspectorId;

    const rankByValue = filter.goalId !== undefined && filter.periodStart !== undefined;
    if (rankByValue) {
      // One goal + period: a bounded set, ranked by value (P9) in memory, then paged.
      const rows = await this.prisma.rewardAward.findMany({ where, include: RELATION_INCLUDE });
      const ranked = rows.map(mapWithRelations).sort(compareAwardsForRanking);
      const start = (filter.page - 1) * filter.pageSize;
      return { data: ranked.slice(start, start + filter.pageSize), total: ranked.length };
    }

    const [rows, total] = await Promise.all([
      this.prisma.rewardAward.findMany({
        where,
        include: RELATION_INCLUDE,
        orderBy: [{ period_end: 'desc' }, { created_at: 'desc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.rewardAward.count({ where }),
    ]);
    return { data: rows.map(mapWithRelations), total };
  }

  async findByPeriod(periodType: BillingPeriodType, periodStart: CivilDate): Promise<RewardAward[]> {
    const rows = await this.prisma.rewardAward.findMany({
      where: { period_type: periodType, period_start: toDateOnly(periodStart) },
    });
    return rows.map(mapRewardAward);
  }

  async approvePending(
    id: string,
    approverId: string,
    at: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const result = await this.db(tx).rewardAward.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED', approved_by_user_id: approverId, approved_at: at },
    });
    return result.count;
  }

  async voidPendingOrApproved(
    id: string,
    voiderId: string,
    at: Date,
    reason: string,
    inspectorNote: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const result = await this.db(tx).rewardAward.updateMany({
      where: { id, status: { in: ['PENDING', 'APPROVED'] } },
      data: {
        status: 'VOID',
        voided_by_user_id: voiderId,
        voided_at: at,
        void_reason: reason,
        inspector_note: inspectorNote,
      },
    });
    return result.count;
  }
}
