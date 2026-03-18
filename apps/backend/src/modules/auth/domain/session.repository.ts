import type { SessionEntity } from './session.entity';

export interface ISessionRepository {
  create(session: Omit<SessionEntity, 'isValid' | 'isRevoked' | 'isExpired' | 'updatedAt'>): Promise<SessionEntity>;
  findByRefreshTokenHash(hash: string): Promise<SessionEntity | null>;
  findById(id: string): Promise<SessionEntity | null>;
  findActiveByUserId(userId: string): Promise<SessionEntity[]>;
  updateRefreshToken(sessionId: string, newHash: string, expiresAt: Date): Promise<void>;
  revoke(sessionId: string, revokedAt: Date): Promise<void>;
  revokeAllForUser(userId: string, revokedAt: Date): Promise<void>;
  deleteExpiredBefore(date: Date): Promise<number>;
}
