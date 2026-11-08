import type { PrismaClient } from '@prisma/client';
import type { RewardAward } from '../domain/reward-award.entity';
import type { IRecentRewardAwardReader } from '../domain/recent-awards.reader';
import { mapRewardAward } from './prisma-mappers';

/** Prisma adapter for {@link IRecentRewardAwardReader} (platform-scoped; no tenant predicate). */
export class PrismaRecentRewardAwardReader implements IRecentRewardAwardReader {
  constructor(private readonly prisma: PrismaClient) {}

  async findRecentByInspector(inspectorId: string, limit: number): Promise<RewardAward[]> {
    const rows = await this.prisma.rewardAward.findMany({
      where: { inspector_id: inspectorId },
      orderBy: [{ period_end: 'desc' }, { created_at: 'desc' }],
      take: limit,
    });
    return rows.map(mapRewardAward);
  }

  async findRecentNonVoidByCreatedAt(since: Date): Promise<RewardAward[]> {
    const rows = await this.prisma.rewardAward.findMany({
      where: { status: { not: 'VOID' }, created_at: { gte: since } },
      orderBy: [{ created_at: 'asc' }],
    });
    return rows.map(mapRewardAward);
  }
}
