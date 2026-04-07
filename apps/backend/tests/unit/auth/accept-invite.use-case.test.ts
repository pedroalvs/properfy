import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { AcceptInviteUseCase } from '../../../src/modules/auth/application/use-cases/accept-invite.use-case';
import type { IPasswordResetTokenRepository } from '../../../src/modules/auth/domain/password-reset-token.repository';
import type { IUserRepository } from '../../../src/modules/auth/domain/user.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { PasswordResetTokenEntity } from '../../../src/modules/auth/domain/password-reset-token.entity';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import {
  InvalidInviteTokenError,
  PasswordTooWeakError,
  PasswordTooCommonError,
} from '../../../src/modules/auth/domain/auth.errors';

const RAW_TOKEN = 'raw-invite-token-abc123';
const TOKEN_HASH = crypto.createHash('sha256').update(RAW_TOKEN).digest('hex');
const STRONG_PASSWORD = 'MyStr0ng!Pass';

function makeUser(overrides = {}): UserEntity {
  return new UserEntity({
    id: 'user-1',
    tenantId: 'tenant-1',
    branchId: null,
    role: 'CL_USER',
    name: 'Invited User',
    email: 'invited@agency.com',
    phone: null,
    status: 'PENDING_INVITE',
    passwordHash: '',
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

function makeTokenEntity(
  overrides: Partial<ConstructorParameters<typeof PasswordResetTokenEntity>[0]> = {},
): PasswordResetTokenEntity {
  return new PasswordResetTokenEntity({
    id: 'token-1',
    userId: 'user-1',
    tokenHash: TOKEN_HASH,
    expiresAt: new Date(Date.now() + 72 * 3600_000),
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  });
}

describe('AcceptInviteUseCase', () => {
  let passwordResetTokenRepo: IPasswordResetTokenRepository;
  let userRepo: IUserRepository;
  let auditService: AuditService;
  let useCase: AcceptInviteUseCase;

  beforeEach(() => {
    passwordResetTokenRepo = {
      save: vi.fn(),
      findByTokenHash: vi.fn().mockResolvedValue(makeTokenEntity()),
      markUsed: vi.fn(),
      countRecentByUserId: vi.fn(),
      deleteExpired: vi.fn(),
    };
    userRepo = {
      findByEmail: vi.fn(),
      findById: vi.fn().mockResolvedValue(makeUser()),
      save: vi.fn(),
      updateLoginSuccess: vi.fn(),
      updateFailedLogin: vi.fn(),
      updatePassword: vi.fn(),
      updateTotpSecret: vi.fn(),
      updateTotpEnabled: vi.fn(),
      activateUser: vi.fn(),
    };
    auditService = {
      log: vi.fn(),
    } as unknown as AuditService;

    useCase = new AcceptInviteUseCase(passwordResetTokenRepo, userRepo, auditService);
  });

  it('should activate user, set password, mark token used, and audit', async () => {
    await useCase.execute({ token: RAW_TOKEN, password: STRONG_PASSWORD });

    // User activated
    expect(userRepo.activateUser).toHaveBeenCalledTimes(1);
    const [userId, passwordHash] = (userRepo.activateUser as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(userId).toBe('user-1');
    expect(passwordHash).toBeTruthy();
    expect(passwordHash).not.toBe('');

    // Token marked as used
    expect(passwordResetTokenRepo.markUsed).toHaveBeenCalledWith('token-1');

    // Audit logged
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.invite_accepted',
        actorType: 'ANONYMOUS',
        entityType: 'User',
        entityId: 'user-1',
      }),
    );
  });

  it('should reject invalid token (not found)', async () => {
    vi.mocked(passwordResetTokenRepo.findByTokenHash).mockResolvedValue(null);

    await expect(
      useCase.execute({ token: 'bad-token', password: STRONG_PASSWORD }),
    ).rejects.toThrow(InvalidInviteTokenError);
  });

  it('should reject expired token', async () => {
    vi.mocked(passwordResetTokenRepo.findByTokenHash).mockResolvedValue(
      makeTokenEntity({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(
      useCase.execute({ token: RAW_TOKEN, password: STRONG_PASSWORD }),
    ).rejects.toThrow(InvalidInviteTokenError);
  });

  it('should reject already used token', async () => {
    vi.mocked(passwordResetTokenRepo.findByTokenHash).mockResolvedValue(
      makeTokenEntity({ usedAt: new Date() }),
    );

    await expect(
      useCase.execute({ token: RAW_TOKEN, password: STRONG_PASSWORD }),
    ).rejects.toThrow(InvalidInviteTokenError);
  });

  it('should reject when user not found', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ token: RAW_TOKEN, password: STRONG_PASSWORD }),
    ).rejects.toThrow(InvalidInviteTokenError);
  });

  it('should reject when user is not in PENDING_INVITE status', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ status: 'ACTIVE' }));

    await expect(
      useCase.execute({ token: RAW_TOKEN, password: STRONG_PASSWORD }),
    ).rejects.toThrow(InvalidInviteTokenError);
  });

  it('should reject weak password (too short)', async () => {
    await expect(
      useCase.execute({ token: RAW_TOKEN, password: 'Ab1!' }),
    ).rejects.toThrow(PasswordTooWeakError);
  });

  it('should reject weak password (no uppercase)', async () => {
    await expect(
      useCase.execute({ token: RAW_TOKEN, password: 'mystr0ng!pass' }),
    ).rejects.toThrow(PasswordTooWeakError);
  });

  it('should reject weak password (no special char)', async () => {
    await expect(
      useCase.execute({ token: RAW_TOKEN, password: 'MyStr0ngPass1' }),
    ).rejects.toThrow(PasswordTooWeakError);
  });

  it('should reject weak password (no digit)', async () => {
    await expect(
      useCase.execute({ token: RAW_TOKEN, password: 'MyStrong!Pass' }),
    ).rejects.toThrow(PasswordTooWeakError);
  });
});
