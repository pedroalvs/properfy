import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogoutUseCase } from '../../../src/modules/auth/application/use-cases/logout.use-case';
import type { ISessionRepository } from '../../../src/modules/auth/domain/session.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { SessionEntity } from '../../../src/modules/auth/domain/session.entity';

describe('LogoutUseCase', () => {
  let sessionRepo: ISessionRepository;
  let auditService: AuditService;
  let useCase: LogoutUseCase;

  beforeEach(() => {
    sessionRepo = {
      create: vi.fn(), findByRefreshTokenHash: vi.fn(),
      findById: vi.fn(), findActiveByUserId: vi.fn(),
      updateRefreshToken: vi.fn(), revoke: vi.fn(), revokeAllForUser: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new LogoutUseCase(sessionRepo, auditService);
  });

  it('should revoke specific session when sessionId is provided', async () => {
    const session = new SessionEntity({
      id: 'session-1', userId: 'user-1', refreshTokenHash: 'hash',
      ipAddress: null, userAgent: null,
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      revokedAt: null, createdAt: new Date(),
    });
    vi.mocked(sessionRepo.findById).mockResolvedValue(session);

    await useCase.execute({ userId: 'user-1', sessionId: 'session-1' });

    expect(sessionRepo.revoke).toHaveBeenCalledWith('session-1', expect.any(Date));
  });

  it('should revoke all sessions when no sessionId provided', async () => {
    await useCase.execute({ userId: 'user-1' });
    expect(sessionRepo.revokeAllForUser).toHaveBeenCalledWith('user-1', expect.any(Date));
  });

  it('should emit audit event', async () => {
    await useCase.execute({ userId: 'user-1' });
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.logout' }));
  });
});
