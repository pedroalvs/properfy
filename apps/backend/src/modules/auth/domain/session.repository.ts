import type { SessionEntity } from './session.entity';

export interface ISessionRepository {
  create(session: Omit<SessionEntity, 'isValid' | 'isRevoked' | 'isExpired' | 'updatedAt'>): Promise<SessionEntity>;
  findByRefreshTokenHash(hash: string): Promise<SessionEntity | null>;
  findById(id: string): Promise<SessionEntity | null>;
  findActiveByUserId(userId: string): Promise<SessionEntity[]>;
  /**
   * Atomically rotate a refresh token: swap `expectedHash` for `newHash` only
   * if the session still holds `expectedHash` and is not revoked. Returns true
   * on success, false if no row matched (already rotated/revoked = reuse).
   * Single-statement compare-and-swap so two concurrent refreshes of the same
   * token yield exactly one winner.
   */
  rotateRefreshToken(
    sessionId: string,
    expectedHash: string,
    newHash: string,
    expiresAt: Date,
  ): Promise<boolean>;
  revoke(sessionId: string, revokedAt: Date): Promise<void>;
  revokeAllForUser(userId: string, revokedAt: Date): Promise<void>;
  findRecentByUserId(userId: string, days: number): Promise<SessionEntity[]>;
  deleteExpiredBefore(date: Date): Promise<number>;
}
