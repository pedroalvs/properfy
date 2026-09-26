import type { PrismaClient, Prisma } from '@prisma/client';
import type { IPasswordHistoryRepository } from '../domain/password-history.repository';

type DbClient = PrismaClient | Prisma.TransactionClient;

export class PrismaPasswordHistoryRepository implements IPasswordHistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private db(tx?: Prisma.TransactionClient): DbClient {
    return tx ?? this.prisma;
  }

  async findRecentByUserId(userId: string, limit: number): Promise<{ passwordHash: string }[]> {
    const rows = await this.prisma.passwordHistory.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: { password_hash: true },
    });
    return rows.map((r) => ({ passwordHash: r.password_hash }));
  }

  async save(userId: string, passwordHash: string, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).passwordHistory.create({
      data: {
        user_id: userId,
        password_hash: passwordHash,
      },
    });
  }

  async pruneOldEntries(userId: string, keepCount: number, tx?: Prisma.TransactionClient): Promise<void> {
    const client = this.db(tx);
    const rows = await client.passwordHistory.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: { id: true },
    });

    if (rows.length <= keepCount) return;

    const idsToDelete = rows.slice(keepCount).map((r) => r.id);
    await client.passwordHistory.deleteMany({
      where: { id: { in: idsToDelete } },
    });
  }
}
