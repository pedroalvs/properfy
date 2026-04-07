import type { PasswordResetTokenEntity } from './password-reset-token.entity';

export interface IPasswordResetTokenRepository {
  save(token: PasswordResetTokenEntity): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetTokenEntity | null>;
  markUsed(id: string): Promise<void>;
  countRecentByUserId(userId: string, sinceMinutes: number): Promise<number>;
  deleteExpired(): Promise<number>;
}
