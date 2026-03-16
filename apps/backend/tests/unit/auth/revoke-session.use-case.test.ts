import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RevokeSessionUseCase } from '../../../src/modules/auth/application/use-cases/revoke-session.use-case';
import type { ISessionRepository } from '../../../src/modules/auth/domain/session.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { SessionEntity } from '../../../src/modules/auth/domain/session.entity';
import { SessionNotFoundError } from '../../../src/modules/auth/domain/auth.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makeSession(overrides = {}): SessionEntity {
  return new SessionEntity({
    id: 'session-1', userId: 'user-1', refreshTokenHash: 'hash',
    ipAddress: null, userAgent: null,
    expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    revokedAt: null, createdAt: new Date(),
    ...overrides,
  });
}

describe('RevokeSessionUseCase', () => {
  let sessionRepo: ISessionRepository;
  let auditService: AuditService;
  let useCase: RevokeSessionUseCase;

  beforeEach(() => {
    sessionRepo = { create: vi.fn(), findByRefreshTokenHash: vi.fn(), findById: vi.fn(), findActiveByUserId: vi.fn(), updateRefreshToken: vi.fn(), revoke: vi.fn(), revokeAllForUser: vi.fn() };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new RevokeSessionUseCase(sessionRepo, auditService);
  });

  it('should allow AM to revoke any session', async () => {
    vi.mocked(sessionRepo.findById).mockResolvedValue(makeSession({ userId: 'other-user' }));
    await useCase.execute({ sessionId: 'session-1', actorId: 'admin-user', actorRole: 'AM' });
    expect(sessionRepo.revoke).toHaveBeenCalledWith('session-1', expect.any(Date));
  });

  it('should allow user to revoke their own session', async () => {
    vi.mocked(sessionRepo.findById).mockResolvedValue(makeSession({ userId: 'user-1' }));
    await useCase.execute({ sessionId: 'session-1', actorId: 'user-1', actorRole: 'CL_ADMIN' });
    expect(sessionRepo.revoke).toHaveBeenCalledWith('session-1', expect.any(Date));
  });

  it('should return AUTH_FORBIDDEN if non-AM tries to revoke another user session', async () => {
    vi.mocked(sessionRepo.findById).mockResolvedValue(makeSession({ userId: 'other-user' }));
    await expect(
      useCase.execute({ sessionId: 'session-1', actorId: 'user-1', actorRole: 'CL_ADMIN' })
    ).rejects.toThrow(ForbiddenError);
  });

  it('should return SESSION_NOT_FOUND for non-existent sessionId', async () => {
    vi.mocked(sessionRepo.findById).mockResolvedValue(null);
    await expect(
      useCase.execute({ sessionId: 'none', actorId: 'user-1', actorRole: 'AM' })
    ).rejects.toThrow(SessionNotFoundError);
  });
});
