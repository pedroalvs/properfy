import type { PrismaClient, Prisma } from '@prisma/client';
import type { IPasswordResetTokenRepository } from '../domain/password-reset-token.repository';
import { PasswordResetTokenEntity } from '../domain/password-reset-token.entity';

type DbClient = PrismaClient | Prisma.TransactionClient;

export class PrismaPasswordResetTokenRepository implements IPasswordResetTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private db(tx?: Prisma.TransactionClient): DbClient {
    return tx ?? this.prisma;
  }

  async save(token: PasswordResetTokenEntity): Promise<void> {
    await this.prisma.passwordResetToken.create({
      data: {
        id: token.id,
        user_id: token.userId,
        token_hash: token.tokenHash,
        expires_at: token.expiresAt,
        used_at: token.usedAt,
        created_at: token.createdAt,
      },
    });
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetTokenEntity | null> {
    const row = await this.prisma.passwordResetToken.findFirst({
      where: { token_hash: tokenHash },
    });
    if (!row) return null;
    return new PasswordResetTokenEntity({
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      createdAt: row.created_at,
    });
  }

  async markUsed(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).passwordResetToken.update({
      where: { id },
      data: { used_at: new Date() },
    });
  }

  async consumeIfUnused(id: string, tx?: Prisma.TransactionClient): Promise<boolean> {
    // Atomic consume: flip used_at only while it is still null. The affected-row
    // count tells us whether THIS call consumed the token, so two concurrent
    // resets with the same token yield exactly one winner and the loser is
    // rejected — closing the double-use window (#249).
    const result = await this.db(tx).passwordResetToken.updateMany({
      where: { id, used_at: null },
      data: { used_at: new Date() },
    });
    return result.count === 1;
  }

  async countRecentByUserId(userId: string, sinceMinutes: number): Promise<number> {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
    return this.prisma.passwordResetToken.count({
      where: {
        user_id: userId,
        created_at: { gte: since },
      },
    });
  }

  async deleteExpired(): Promise<number> {
    // Purge expired tokens whether or not they were ever used — the whole point
    // of the sweep is to drop dead rows. The prior `used_at: { not: null }`
    // conjunct meant expired-but-unused tokens accumulated forever (#561).
    const result = await this.prisma.passwordResetToken.deleteMany({
      where: {
        expires_at: { lt: new Date() },
      },
    });
    return result.count;
  }
}
