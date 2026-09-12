import type { Prisma } from '@prisma/client';
import type { UserStatus } from '@properfy/shared';
import type { UserEntity } from './user.entity';

export interface IUserRepository {
  findByEmail(email: string): Promise<UserEntity | null>;
  findById(id: string): Promise<UserEntity | null>;
  save(user: UserEntity): Promise<void>;
  updateLoginSuccess(userId: string, lastLoginAt: Date): Promise<void>;
  /**
   * Atomically increment failed_login_count and, when it reaches
   * `lockThreshold`, flip status to LOCKED with `locked_until = now +
   * lockDurationMs`. Returns the post-update state so the caller derives the
   * lock audit from what the database actually decided — no read-modify-write
   * race between concurrent failed attempts.
   */
  incrementFailedLogin(
    userId: string,
    lockThreshold: number,
    lockDurationMs: number,
  ): Promise<{ failedLoginCount: number; status: UserStatus; lockedUntil: Date | null }>;
  /** Clear an expired lock: reset count to 0 and status to ACTIVE. No-op unless currently LOCKED. */
  resetFailedLogin(userId: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string, tx?: Prisma.TransactionClient): Promise<void>;
  /** Personal timezone for cross-tenant roles; null clears back to the platform default. */
  updateTimezone(userId: string, timezone: string | null): Promise<void>;
  updateTotpSecret(userId: string, totpSecret: string): Promise<void>;
  updateTotpEnabled(userId: string, totpEnabled: boolean): Promise<void>;
  activateUser(userId: string, passwordHash: string): Promise<void>;
}
