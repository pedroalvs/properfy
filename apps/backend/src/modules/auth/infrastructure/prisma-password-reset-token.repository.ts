import type { PrismaClient } from '@prisma/client';
import type { IPasswordResetTokenRepository } from '../domain/password-reset-token.repository';
import { PasswordResetTokenEntity } from '../domain/password-reset-token.entity';

export class PrismaPasswordResetTokenRepository implements IPasswordResetTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

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

  async markUsed(id: string): Promise<void> {
    await this.prisma.passwordResetToken.update({
      where: { id },
      data: { used_at: new Date() },
    });
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
    const result = await this.prisma.passwordResetToken.deleteMany({
      where: {
        expires_at: { lt: new Date() },
        used_at: { not: null },
      },
    });
    return result.count;
  }
}
