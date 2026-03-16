import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RefreshTokenUseCase } from '../../../src/modules/auth/application/use-cases/refresh-token.use-case';
import type { IUserRepository } from '../../../src/modules/auth/domain/user.repository';
import type { ISessionRepository } from '../../../src/modules/auth/domain/session.repository';
import type { JwtService } from '../../../src/modules/auth/application/services/jwt.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { SessionEntity } from '../../../src/modules/auth/domain/session.entity';
import { InvalidRefreshTokenError, SessionInvalidError } from '../../../src/modules/auth/domain/auth.errors';
import { createHash } from 'crypto';

function makeUser(overrides = {}): UserEntity {
  return new UserEntity({
    id: 'user-1', tenantId: 'tenant-1', branchId: null, role: 'CL_ADMIN',
    name: 'Test', email: 'test@example.com', phone: null, status: 'ACTIVE',
    passwordHash: 'hash', totpSecret: null, totpEnabled: false,
    failedLoginCount: 0, lockedUntil: null, lastLoginAt: null,
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    ...overrides,
  });
}

function makeSession(overrides = {}): SessionEntity {
  return new SessionEntity({
    id: 'session-1', userId: 'user-1',
    refreshTokenHash: createHash('sha256').update('valid-token').digest('hex'),
    ipAddress: null, userAgent: null,
    expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    revokedAt: null, createdAt: new Date(),
    ...overrides,
  });
}

describe('RefreshTokenUseCase', () => {
  let userRepo: IUserRepository;
  let sessionRepo: ISessionRepository;
  let jwtService: JwtService;
  let auditService: AuditService;
  let useCase: RefreshTokenUseCase;

  beforeEach(() => {
    userRepo = { findByEmail: vi.fn(), findById: vi.fn(), save: vi.fn(), updateLoginSuccess: vi.fn(), updateFailedLogin: vi.fn(), updatePassword: vi.fn() };
    sessionRepo = { create: vi.fn(), findByRefreshTokenHash: vi.fn(), findById: vi.fn(), findActiveByUserId: vi.fn(), updateRefreshToken: vi.fn(), revoke: vi.fn(), revokeAllForUser: vi.fn() };
    jwtService = { signAccessToken: vi.fn().mockResolvedValue('new-access-token'), verify: vi.fn() } as unknown as JwtService;
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new RefreshTokenUseCase(userRepo, sessionRepo, jwtService, auditService);
  });

  it('should return new token pair for valid refresh token', async () => {
    vi.mocked(sessionRepo.findByRefreshTokenHash).mockResolvedValue(makeSession());
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());
    const result = await useCase.execute({ refreshToken: 'valid-token' });
    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBeDefined();
  });

  it('should rotate refresh token', async () => {
    vi.mocked(sessionRepo.findByRefreshTokenHash).mockResolvedValue(makeSession());
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());
    const result = await useCase.execute({ refreshToken: 'valid-token' });
    expect(result.refreshToken).not.toBe('valid-token');
    expect(sessionRepo.updateRefreshToken).toHaveBeenCalled();
  });

  it('should return AUTH_INVALID_REFRESH_TOKEN for unknown token', async () => {
    vi.mocked(sessionRepo.findByRefreshTokenHash).mockResolvedValue(null);
    await expect(useCase.execute({ refreshToken: 'unknown' })).rejects.toThrow(InvalidRefreshTokenError);
  });

  it('should return AUTH_INVALID_REFRESH_TOKEN for revoked session', async () => {
    vi.mocked(sessionRepo.findByRefreshTokenHash).mockResolvedValue(
      makeSession({ revokedAt: new Date() })
    );
    await expect(useCase.execute({ refreshToken: 'valid-token' })).rejects.toThrow(InvalidRefreshTokenError);
  });

  it('should return AUTH_INVALID_REFRESH_TOKEN for expired session', async () => {
    vi.mocked(sessionRepo.findByRefreshTokenHash).mockResolvedValue(
      makeSession({ expiresAt: new Date(Date.now() - 1000) })
    );
    await expect(useCase.execute({ refreshToken: 'valid-token' })).rejects.toThrow(InvalidRefreshTokenError);
  });

  it('should return AUTH_SESSION_INVALID if user is INACTIVE', async () => {
    vi.mocked(sessionRepo.findByRefreshTokenHash).mockResolvedValue(makeSession());
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ status: 'INACTIVE' }));
    await expect(useCase.execute({ refreshToken: 'valid-token' })).rejects.toThrow(SessionInvalidError);
  });

  it('should return AUTH_SESSION_INVALID if user is soft-deleted', async () => {
    vi.mocked(sessionRepo.findByRefreshTokenHash).mockResolvedValue(makeSession());
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ deletedAt: new Date() }));
    await expect(useCase.execute({ refreshToken: 'valid-token' })).rejects.toThrow(SessionInvalidError);
  });
});
