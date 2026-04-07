import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RefreshTokenUseCase } from '../../../src/modules/auth/application/use-cases/refresh-token.use-case';
import type { IUserRepository } from '../../../src/modules/auth/domain/user.repository';
import type { ISessionRepository } from '../../../src/modules/auth/domain/session.repository';
import type { JwtService } from '../../../src/modules/auth/application/services/jwt.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { SessionEntity } from '../../../src/modules/auth/domain/session.entity';
import { InvalidRefreshTokenError, SessionInvalidError, SessionRefreshRateLimitError } from '../../../src/modules/auth/domain/auth.errors';
import { SlidingWindowRateLimiter } from '../../../src/shared/infrastructure/sliding-window-rate-limiter';
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
  let inspectorRepo: IInspectorRepository;
  let sessionRateLimiter: SlidingWindowRateLimiter;
  let useCase: RefreshTokenUseCase;

  beforeEach(() => {
    userRepo = { findByEmail: vi.fn(), findById: vi.fn(), save: vi.fn(), updateLoginSuccess: vi.fn(), updateFailedLogin: vi.fn(), updatePassword: vi.fn() };
    sessionRepo = { create: vi.fn(), findByRefreshTokenHash: vi.fn(), findById: vi.fn(), findActiveByUserId: vi.fn(), updateRefreshToken: vi.fn(), revoke: vi.fn(), revokeAllForUser: vi.fn() };
    jwtService = { signAccessToken: vi.fn().mockResolvedValue('new-access-token'), verify: vi.fn() } as unknown as JwtService;
    auditService = { log: vi.fn() } as unknown as AuditService;
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByUserId: vi.fn(),
      linkUserId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      findByRegionId: vi.fn(),
    } as unknown as IInspectorRepository;
    sessionRateLimiter = new SlidingWindowRateLimiter({ maxRequests: 10, windowMs: 5 * 60 * 1000, cleanupIntervalMs: 0 });
    useCase = new RefreshTokenUseCase(userRepo, sessionRepo, jwtService, auditService, inspectorRepo, sessionRateLimiter);
  });

  afterEach(() => {
    sessionRateLimiter.destroy();
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

  it('should resolve inspector_id for INSP user with linked inspector', async () => {
    vi.mocked(sessionRepo.findByRefreshTokenHash).mockResolvedValue(makeSession());
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ role: 'INSP' }));
    vi.mocked(inspectorRepo.findByUserId).mockResolvedValue({ id: 'insp-1' } as any);

    await useCase.execute({ refreshToken: 'valid-token' });

    expect(jwtService.signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ inspector_id: 'insp-1' }),
    );
  });

  it('should pass null inspector_id for INSP user without linked inspector', async () => {
    vi.mocked(sessionRepo.findByRefreshTokenHash).mockResolvedValue(makeSession());
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ role: 'INSP' }));
    vi.mocked(inspectorRepo.findByUserId).mockResolvedValue(null);

    await useCase.execute({ refreshToken: 'valid-token' });

    expect(jwtService.signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ inspector_id: null }),
    );
  });

  describe('per-session refresh rate limit', () => {
    it('should allow up to 10 refresh requests for the same session', async () => {
      vi.mocked(sessionRepo.findByRefreshTokenHash).mockResolvedValue(makeSession());
      vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

      for (let i = 0; i < 10; i++) {
        const result = await useCase.execute({ refreshToken: 'valid-token' });
        expect(result.accessToken).toBe('new-access-token');
      }
    });

    it('should reject the 11th refresh request within 5 minutes for the same session', async () => {
      vi.mocked(sessionRepo.findByRefreshTokenHash).mockResolvedValue(makeSession());
      vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

      for (let i = 0; i < 10; i++) {
        await useCase.execute({ refreshToken: 'valid-token' });
      }

      await expect(useCase.execute({ refreshToken: 'valid-token' })).rejects.toThrow(SessionRefreshRateLimitError);
    });

    it('should not block a different session when one session hits the limit', async () => {
      const sessionA = makeSession({ id: 'session-a' });
      const sessionB = makeSession({ id: 'session-b' });
      vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

      // Exhaust session A
      vi.mocked(sessionRepo.findByRefreshTokenHash).mockResolvedValue(sessionA);
      for (let i = 0; i < 10; i++) {
        await useCase.execute({ refreshToken: 'valid-token' });
      }
      await expect(useCase.execute({ refreshToken: 'valid-token' })).rejects.toThrow(SessionRefreshRateLimitError);

      // Session B should still work
      vi.mocked(sessionRepo.findByRefreshTokenHash).mockResolvedValue(sessionB);
      const result = await useCase.execute({ refreshToken: 'valid-token' });
      expect(result.accessToken).toBe('new-access-token');
    });

    it('should return 429 status code in the rate limit error', async () => {
      vi.mocked(sessionRepo.findByRefreshTokenHash).mockResolvedValue(makeSession());
      vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

      for (let i = 0; i < 10; i++) {
        await useCase.execute({ refreshToken: 'valid-token' });
      }

      try {
        await useCase.execute({ refreshToken: 'valid-token' });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SessionRefreshRateLimitError);
        expect((error as SessionRefreshRateLimitError).statusCode).toBe(429);
        expect((error as SessionRefreshRateLimitError).code).toBe('AUTH_SESSION_REFRESH_RATE_LIMIT');
      }
    });
  });
});
