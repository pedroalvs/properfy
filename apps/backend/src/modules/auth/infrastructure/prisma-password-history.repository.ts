import type { PrismaClient } from '@prisma/client';
import type { IPasswordHistoryRepository } from '../domain/password-history.repository';

export class PrismaPasswordHistoryRepository implements IPasswordHistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findRecentByUserId(userId: string, limit: number): Promise<{ passwordHash: string }[]> {
    const rows = await this.prisma.passwordHistory.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: { password_hash: true },
    });
    return rows.map((r) => ({ passwordHash: r.password_hash }));
  }

  async save(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.passwordHistory.create({
      data: {
        user_id: userId,
        password_hash: passwordHash,
      },
    });
  }

  async pruneOldEntries(userId: string, keepCount: number): Promise<void> {
    const rows = await this.prisma.passwordHistory.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: { id: true },
    });

    if (rows.length <= keepCount) return;

    const idsToDelete = rows.slice(keepCount).map((r) => r.id);
    await this.prisma.passwordHistory.deleteMany({
      where: { id: { in: idsToDelete } },
    });
  }
}
