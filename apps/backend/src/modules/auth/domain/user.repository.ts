import type { UserEntity } from './user.entity';

export interface IUserRepository {
  findByEmail(email: string): Promise<UserEntity | null>;
  findById(id: string): Promise<UserEntity | null>;
  save(user: UserEntity): Promise<void>;
  updateLoginSuccess(userId: string, lastLoginAt: Date): Promise<void>;
  updateFailedLogin(userId: string, failedLoginCount: number, lockedUntil: Date | null, status: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  /** Personal timezone for cross-tenant roles; null clears back to the platform default. */
  updateTimezone(userId: string, timezone: string | null): Promise<void>;
  updateTotpSecret(userId: string, totpSecret: string): Promise<void>;
  updateTotpEnabled(userId: string, totpEnabled: boolean): Promise<void>;
  activateUser(userId: string, passwordHash: string): Promise<void>;
}
