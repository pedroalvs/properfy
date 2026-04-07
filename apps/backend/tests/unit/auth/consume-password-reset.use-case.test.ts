import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ConsumePasswordResetUseCase } from '../../../src/modules/auth/application/use-cases/consume-password-reset.use-case';
import type { IPasswordResetTokenRepository } from '../../../src/modules/auth/domain/password-reset-token.repository';
import type { IUserRepository } from '../../../src/modules/auth/domain/user.repository';
import type { ISessionRepository } from '../../../src/modules/auth/domain/session.repository';
import type { IPasswordHistoryRepository } from '../../../src/modules/auth/domain/password-history.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { PasswordResetTokenEntity } from '../../../src/modules/auth/domain/password-reset-token.entity';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import {
  InvalidPasswordResetTokenError,
  PasswordTooWeakError,
  PasswordTooCommonError,
  PasswordRecentlyUsedError,
} from '../../../src/modules/auth/domain/auth.errors';

const RAW_TOKEN = 'raw-reset-token-abc123';
const TOKEN_HASH = crypto.createHash('sha256').update(RAW_TOKEN).digest('hex');

function makeUser(overrides = {}): UserEntity {
  return new UserEntity({
    id: 'user-1',
    tenantId: 'tenant-1',
    branchId: null,
    role: 'CL_ADMIN',
    name: 'Test User',
    email: 'test@example.com',
    phone: null,
    status: 'ACTIVE',
    passwordHash: '$2a$10$fakehashfakehashfakehashfakehashfakehashfakehashfak',
    totpSecret: null,
    totpEnabled: false,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeTokenEntity(overrides: Partial<ConstructorParameters<typeof PasswordResetTokenEntity>[0]> = {}): PasswordResetTokenEntity {
  return new PasswordResetTokenEntity({
    id: 'token-1',
    userId: 'user-1',
    tokenHash: TOKEN_HASH,
    expiresAt: new Date(Date.now() + 3600_000), // 1 hour from now
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  });
}

describe('ConsumePasswordResetUseCase', () => {
  let passwordResetTokenRepo: IPasswordResetTokenRepository;
  let userRepo: IUserRepository;
  let sessionRepo: ISessionRepository;
  let auditService: AuditService;
  let passwordHistoryRepo: IPasswordHistoryRepository;
  let useCase: ConsumePasswordResetUseCase;

  beforeEach(() => {
    passwordResetTokenRepo = {
      save: vi.fn(),
      findByTokenHash: vi.fn(),
      markUsed: vi.fn(),
      countRecentByUserId: vi.fn(),
      deleteExpired: vi.fn(),
    };
    userRepo = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      save: vi.fn(),
      updateLoginSuccess: vi.fn(),
      updateFailedLogin: vi.fn(),
      updatePassword: vi.fn(),
      updateTotpSecret: vi.fn(),
      updateTotpEnabled: vi.fn(),
    };
    sessionRepo = {
      create: vi.fn(),
      findByRefreshTokenHash: vi.fn(),
      findById: vi.fn(),
      findActiveByUserId: vi.fn().mockResolvedValue([]),
      updateRefreshToken: vi.fn(),
      revoke: vi.fn(),
      revokeAllForUser: vi.fn(),
      deleteExpiredBefore: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    passwordHistoryRepo = { findRecentByUserId: vi.fn().mockResolvedValue([]), save: vi.fn(), pruneOldEntries: vi.fn() };
    useCase = new ConsumePasswordResetUseCase(passwordResetTokenRepo, userRepo, sessionRepo, auditService, passwordHistoryRepo);
  });

  it('should reset password, revoke sessions, mark token used and log audit on valid input', async () => {
    vi.mocked(passwordResetTokenRepo.findByTokenHash).mockResolvedValue(makeTokenEntity());
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

    await useCase.execute({ token: RAW_TOKEN, newPassword: 'NewStr0ng!Pass' });

    expect(passwordResetTokenRepo.findByTokenHash).toHaveBeenCalledWith(TOKEN_HASH);
    expect(userRepo.findById).toHaveBeenCalledWith('user-1');
    expect(userRepo.updatePassword).toHaveBeenCalledWith('user-1', expect.any(String));
    expect(sessionRepo.revokeAllForUser).toHaveBeenCalledWith('user-1', expect.any(Date));
    expect(passwordResetTokenRepo.markUsed).toHaveBeenCalledWith('token-1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.password_reset_consumed',
        actorType: 'ANONYMOUS',
        entityType: 'User',
        entityId: 'user-1',
      }),
    );
  });

  it('should throw InvalidPasswordResetTokenError when token is not found', async () => {
    vi.mocked(passwordResetTokenRepo.findByTokenHash).mockResolvedValue(null);

    await expect(
      useCase.execute({ token: RAW_TOKEN, newPassword: 'NewStr0ng!Pass' }),
    ).rejects.toThrow(InvalidPasswordResetTokenError);

    expect(userRepo.findById).not.toHaveBeenCalled();
  });

  it('should throw InvalidPasswordResetTokenError when token is expired', async () => {
    vi.mocked(passwordResetTokenRepo.findByTokenHash).mockResolvedValue(
      makeTokenEntity({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(
      useCase.execute({ token: RAW_TOKEN, newPassword: 'NewStr0ng!Pass' }),
    ).rejects.toThrow(InvalidPasswordResetTokenError);

    expect(userRepo.findById).not.toHaveBeenCalled();
  });

  it('should throw InvalidPasswordResetTokenError when token is already used', async () => {
    vi.mocked(passwordResetTokenRepo.findByTokenHash).mockResolvedValue(
      makeTokenEntity({ usedAt: new Date() }),
    );

    await expect(
      useCase.execute({ token: RAW_TOKEN, newPassword: 'NewStr0ng!Pass' }),
    ).rejects.toThrow(InvalidPasswordResetTokenError);

    expect(userRepo.findById).not.toHaveBeenCalled();
  });

  it('should throw PasswordTooWeakError when password does not meet strength requirements', async () => {
    vi.mocked(passwordResetTokenRepo.findByTokenHash).mockResolvedValue(makeTokenEntity());
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

    await expect(
      useCase.execute({ token: RAW_TOKEN, newPassword: 'weak' }),
    ).rejects.toThrow(PasswordTooWeakError);

    expect(userRepo.updatePassword).not.toHaveBeenCalled();
  });

  it('should throw PasswordTooCommonError when password is in the blacklist', async () => {
    // Use a password that passes strength validation but is in the blacklist
    // 'P@ssw0rd' passes strength (uppercase, lowercase, digit, special, 8+ chars)
    // and 'p@ssw0rd' is in the common passwords list
    vi.mocked(passwordResetTokenRepo.findByTokenHash).mockResolvedValue(makeTokenEntity());
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

    await expect(
      useCase.execute({ token: RAW_TOKEN, newPassword: 'P@ssw0rd' }),
    ).rejects.toThrow(PasswordTooCommonError);

    expect(userRepo.updatePassword).not.toHaveBeenCalled();
  });

  it('should throw PasswordRecentlyUsedError when password is in history', async () => {
    const reusedHash = bcrypt.hashSync('NewStr0ng!Pass', 4);
    vi.mocked(passwordResetTokenRepo.findByTokenHash).mockResolvedValue(makeTokenEntity());
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());
    vi.mocked(passwordHistoryRepo.findRecentByUserId).mockResolvedValue([{ passwordHash: reusedHash }]);

    await expect(
      useCase.execute({ token: RAW_TOKEN, newPassword: 'NewStr0ng!Pass' }),
    ).rejects.toThrow(PasswordRecentlyUsedError);

    expect(userRepo.updatePassword).not.toHaveBeenCalled();
  });

  it('should save old hash to history after successful reset', async () => {
    vi.mocked(passwordResetTokenRepo.findByTokenHash).mockResolvedValue(makeTokenEntity());
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

    await useCase.execute({ token: RAW_TOKEN, newPassword: 'NewStr0ng!Pass' });

    expect(passwordHistoryRepo.save).toHaveBeenCalledWith('user-1', expect.any(String));
    expect(passwordHistoryRepo.pruneOldEntries).toHaveBeenCalledWith('user-1', 5);
  });

  it('should throw InvalidPasswordResetTokenError when user is not found', async () => {
    vi.mocked(passwordResetTokenRepo.findByTokenHash).mockResolvedValue(makeTokenEntity());
    vi.mocked(userRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ token: RAW_TOKEN, newPassword: 'NewStr0ng!Pass' }),
    ).rejects.toThrow(InvalidPasswordResetTokenError);

    expect(userRepo.updatePassword).not.toHaveBeenCalled();
  });
});
