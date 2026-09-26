import type { Prisma } from '@prisma/client';
import type { PasswordResetTokenEntity } from './password-reset-token.entity';

export interface IPasswordResetTokenRepository {
  save(token: PasswordResetTokenEntity): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetTokenEntity | null>;
  markUsed(id: string, tx?: Prisma.TransactionClient): Promise<void>;
  /**
   * Atomically mark the token used only if it is still unused. Returns true iff
   * this call performed the consumption; false means it was already used (or
   * gone), which the caller treats as an invalid token.
   */
  consumeIfUnused(id: string, tx?: Prisma.TransactionClient): Promise<boolean>;
  countRecentByUserId(userId: string, sinceMinutes: number): Promise<number>;
  deleteExpired(): Promise<number>;
}
