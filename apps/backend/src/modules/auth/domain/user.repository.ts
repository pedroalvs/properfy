import type { UserEntity } from './user.entity';

export interface IUserRepository {
  findByEmail(email: string): Promise<UserEntity | null>;
  findById(id: string): Promise<UserEntity | null>;
  save(user: UserEntity): Promise<void>;
  updateLoginSuccess(userId: string, lastLoginAt: Date): Promise<void>;
  updateFailedLogin(userId: string, failedLoginCount: number, lockedUntil: Date | null, status: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
}
