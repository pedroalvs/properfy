import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { RequestPasswordResetUseCase } from '../../../src/modules/auth/application/use-cases/request-password-reset.use-case';
import type { IUserRepository } from '../../../src/modules/auth/domain/user.repository';
import type { IPasswordResetTokenRepository } from '../../../src/modules/auth/domain/password-reset-token.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { PasswordResetRateLimitError } from '../../../src/modules/auth/domain/auth.errors';

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
    passwordHash: 'hashed',
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

describe('RequestPasswordResetUseCase', () => {
  let userRepo: IUserRepository;
  let passwordResetTokenRepo: IPasswordResetTokenRepository;
  let createNotificationUseCase: CreateNotificationUseCase;
  let auditService: AuditService;
  let useCase: RequestPasswordResetUseCase;

  beforeEach(() => {
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
    passwordResetTokenRepo = {
      save: vi.fn(),
      findByTokenHash: vi.fn(),
      markUsed: vi.fn(),
      countRecentByUserId: vi.fn().mockResolvedValue(0),
      deleteExpired: vi.fn(),
    };
    createNotificationUseCase = {
      execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }),
    } as unknown as CreateNotificationUseCase;
    auditService = { log: vi.fn() } as unknown as AuditService;

    useCase = new RequestPasswordResetUseCase(
      userRepo,
      passwordResetTokenRepo,
      createNotificationUseCase,
      auditService,
    );
  });

  it('should create token, enqueue notification and log audit for existing active user', async () => {
    const user = makeUser();
    vi.mocked(userRepo.findByEmail).mockResolvedValue(user);

    await useCase.execute({ email: 'test@example.com' });

    expect(userRepo.findByEmail).toHaveBeenCalledWith('test@example.com');
    expect(passwordResetTokenRepo.countRecentByUserId).toHaveBeenCalledWith('user-1', 60);
    expect(passwordResetTokenRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        usedAt: null,
      }),
    );
    expect(createNotificationUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        recipient: 'test@example.com',
        channel: 'EMAIL',
        templateCode: 'PASSWORD_RESET',
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.password_reset_requested',
        actorType: 'ANONYMOUS',
        entityType: 'User',
        entityId: 'user-1',
      }),
    );
  });

  it('should return silently when email is not found', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(null);

    await expect(useCase.execute({ email: 'unknown@example.com' })).resolves.toBeUndefined();

    expect(passwordResetTokenRepo.save).not.toHaveBeenCalled();
    expect(createNotificationUseCase.execute).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should return silently when user is inactive', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser({ status: 'INACTIVE' }));

    await expect(useCase.execute({ email: 'test@example.com' })).resolves.toBeUndefined();

    expect(passwordResetTokenRepo.save).not.toHaveBeenCalled();
    expect(createNotificationUseCase.execute).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should throw PasswordResetRateLimitError when 3+ recent tokens exist', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser());
    vi.mocked(passwordResetTokenRepo.countRecentByUserId).mockResolvedValue(3);

    await expect(useCase.execute({ email: 'test@example.com' })).rejects.toThrow(
      PasswordResetRateLimitError,
    );

    expect(passwordResetTokenRepo.save).not.toHaveBeenCalled();
    expect(createNotificationUseCase.execute).not.toHaveBeenCalled();
  });

  it('should store SHA-256 hash of token, not the raw token', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser());

    await useCase.execute({ email: 'test@example.com' });

    const savedToken = vi.mocked(passwordResetTokenRepo.save).mock.calls[0][0];
    const notificationCall = vi.mocked(createNotificationUseCase.execute).mock.calls[0][0];
    const rawToken = notificationCall.payloadJson.resetToken;

    // The stored hash must be the SHA-256 of the raw token sent in the notification
    const expectedHash = createHash('sha256').update(rawToken).digest('hex');
    expect(savedToken.tokenHash).toBe(expectedHash);

    // The raw token must NOT be the same as the stored hash
    expect(savedToken.tokenHash).not.toBe(rawToken);
  });

  it('should use "platform" as tenantId when user has no tenantId', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser({ tenantId: null }));

    await useCase.execute({ email: 'test@example.com' });

    expect(createNotificationUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'platform' }),
    );
  });

  it('should set token expiry to 1 hour from creation', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser());

    await useCase.execute({ email: 'test@example.com' });

    const savedToken = vi.mocked(passwordResetTokenRepo.save).mock.calls[0][0];
    const diffMs = savedToken.expiresAt.getTime() - savedToken.createdAt.getTime();
    expect(diffMs).toBe(60 * 60 * 1000);
  });
});
