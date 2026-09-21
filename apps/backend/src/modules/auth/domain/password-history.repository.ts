import type { Prisma } from '@prisma/client';

export interface IPasswordHistoryRepository {
  findRecentByUserId(userId: string, limit: number): Promise<{ passwordHash: string }[]>;
  save(userId: string, passwordHash: string, tx?: Prisma.TransactionClient): Promise<void>;
  pruneOldEntries(userId: string, keepCount: number, tx?: Prisma.TransactionClient): Promise<void>;
}
