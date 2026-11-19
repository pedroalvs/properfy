import type { Prisma, PrismaClient } from '@prisma/client';
import type { Goal } from '../domain/goal.entity';
import type {
  CreateGoalData,
  GoalListFilter,
  GoalWithScope,
  IGoalRepository,
  IGoalScopeReader,
  UpdateGoalData,
} from '../domain/goal.repository';
import { mapGoal, mapGoalWithScope, toDateOnly } from './prisma-mappers';

type DbClient = PrismaClient | Prisma.TransactionClient;

const SCOPE_INCLUDE = {
  scope_region: { select: { name: true } },
  scope_service_type: { select: { name: true } },
  scope_inspector: { select: { name: true } },
} as const;

const SORT_COLUMN: Record<GoalListFilter['sortBy'], 'created_at' | 'title' | 'starts_at'> = {
  createdAt: 'created_at',
  title: 'title',
  startsAt: 'starts_at',
};

export class PrismaGoalRepository implements IGoalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private db(tx?: Prisma.TransactionClient): DbClient {
    return tx ?? this.prisma;
  }

  async findActive(tx?: Prisma.TransactionClient): Promise<GoalWithScope[]> {
    const rows = await this.db(tx).inspectorGoal.findMany({ where: { active: true }, include: SCOPE_INCLUDE });
    return rows.map(mapGoalWithScope);
  }

  async findById(id: string, tx?: Prisma.TransactionClient): Promise<GoalWithScope | null> {
    const row = await this.db(tx).inspectorGoal.findUnique({ where: { id }, include: SCOPE_INCLUDE });
    return row ? mapGoalWithScope(row) : null;
  }

  async findByIds(ids: string[]): Promise<Goal[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.inspectorGoal.findMany({ where: { id: { in: ids } } });
    return rows.map(mapGoal);
  }

  async create(data: CreateGoalData): Promise<GoalWithScope> {
    const row = await this.prisma.inspectorGoal.create({
      data: {
        title: data.title,
        metric: data.metric,
        comparator: data.comparator,
        target: data.target,
        period: data.period,
        scope_region_id: data.scopeRegionId,
        scope_service_type_id: data.scopeServiceTypeId,
        scope_inspector_id: data.scopeInspectorId,
        reward_amount: data.rewardAmount,
        starts_at: toDateOnly(data.startsAt),
        ends_at: data.endsAt ? toDateOnly(data.endsAt) : null,
        created_by_user_id: data.createdByUserId,
      },
      include: SCOPE_INCLUDE,
    });
    return mapGoalWithScope(row);
  }

  async update(id: string, data: UpdateGoalData, tx?: Prisma.TransactionClient): Promise<GoalWithScope> {
    const update: Prisma.InspectorGoalUncheckedUpdateInput = { updated_by_user_id: data.updatedByUserId };
    if (data.title !== undefined) update.title = data.title;
    if (data.target !== undefined) update.target = data.target;
    if (data.rewardAmount !== undefined) update.reward_amount = data.rewardAmount;
    if (data.endsAt !== undefined) update.ends_at = data.endsAt ? toDateOnly(data.endsAt) : null;
    if (data.active !== undefined) update.active = data.active;
    if (data.deactivatedAt !== undefined) update.deactivated_at = data.deactivatedAt;
    if (data.nextTarget !== undefined) update.next_target = data.nextTarget;
    if (data.nextRewardAmount !== undefined) update.next_reward_amount = data.nextRewardAmount;
    if (data.nextEffectiveFrom !== undefined) {
      update.next_effective_from = data.nextEffectiveFrom ? toDateOnly(data.nextEffectiveFrom) : null;
    }
    const row = await this.db(tx).inspectorGoal.update({ where: { id }, data: update, include: SCOPE_INCLUDE });
    return mapGoalWithScope(row);
  }

  async list(filter: GoalListFilter): Promise<{ data: GoalWithScope[]; total: number }> {
    const where: Prisma.InspectorGoalWhereInput = {};
    if (filter.active !== undefined) where.active = filter.active;
    if (filter.metric !== undefined) where.metric = filter.metric;
    if (filter.period !== undefined) where.period = filter.period;
    const [rows, total] = await Promise.all([
      this.prisma.inspectorGoal.findMany({
        where,
        include: SCOPE_INCLUDE,
        orderBy: { [SORT_COLUMN[filter.sortBy]]: filter.sortOrder },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.inspectorGoal.count({ where }),
    ]);
    return { data: rows.map(mapGoalWithScope), total };
  }

  async countActiveByScopeRegionId(regionId: string): Promise<number> {
    return this.prisma.inspectorGoal.count({ where: { scope_region_id: regionId, active: true } });
  }

  async promoteNextTerms(
    id: string,
    terms: { target: number; rewardAmount: number },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.db(tx).inspectorGoal.update({
      where: { id },
      data: {
        target: terms.target,
        reward_amount: terms.rewardAmount,
        next_target: null,
        next_reward_amount: null,
        next_effective_from: null,
      },
    });
  }
}

export class PrismaGoalScopeReader implements IGoalScopeReader {
  constructor(private readonly prisma: PrismaClient) {}

  async regionExists(id: string): Promise<boolean> {
    return (await this.prisma.serviceRegion.count({ where: { id } })) > 0;
  }

  async serviceTypeExists(id: string): Promise<boolean> {
    return (await this.prisma.serviceType.count({ where: { id } })) > 0;
  }

  async inspectorExists(id: string): Promise<boolean> {
    return (await this.prisma.inspector.count({ where: { id, deleted_at: null } })) > 0;
  }
}
