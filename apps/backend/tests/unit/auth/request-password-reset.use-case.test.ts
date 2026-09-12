import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { RequestPasswordResetUseCase } from '../../../src/modules/auth/application/use-cases/request-password-reset.use-case';
import type { IUserRepository } from '../../../src/modules/auth/domain/user.repository';
import type { IPasswordResetTokenRepository } from '../../../src/modules/auth/domain/password-reset-token.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { SlidingWindowRateLimiter } from '../../../src/shared/infrastructure/sliding-window-rate-limiter';

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
  let emailRateLimiter: SlidingWindowRateLimiter;
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
      consumeIfUnused: vi.fn(),
      countRecentByUserId: vi.fn().mockResolvedValue(0),
      deleteExpired: vi.fn(),
    };
    createNotificationUseCase = {
      execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }),
    } as unknown as CreateNotificationUseCase;
    auditService = { log: vi.fn() } as unknown as AuditService;
    emailRateLimiter = new SlidingWindowRateLimiter({
      maxRequests: 3,
      windowMs: 60 * 60 * 1000,
      cleanupIntervalMs: 0,
    });

    useCase = new RequestPasswordResetUseCase(
      userRepo,
      passwordResetTokenRepo,
      createNotificationUseCase,
      auditService,
      { webAppBaseUrl: 'https://app.example.com', pwaBaseUrl: 'https://pwa.example.com' },
      emailRateLimiter,
    );
  });

  afterEach(() => {
    emailRateLimiter.destroy();
  });

  it('should create token, enqueue notification and log audit for existing active user', async () => {
    const user = makeUser();
    vi.mocked(userRepo.findByEmail).mockResolvedValue(user);

    await useCase.execute({ email: 'test@example.com', requestId: 'req-1' });

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
        requestId: 'req-1',
      }),
    );
  });

  it('should send a stable, non-empty notificationId derived from the token', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser());

    await useCase.execute({ email: 'test@example.com', requestId: 'req-1' });

    const notificationCall = vi.mocked(createNotificationUseCase.execute).mock.calls[0][0];
    expect(typeof notificationCall.notificationId).toBe('string');
    expect(notificationCall.notificationId.length).toBeGreaterThan(0);

    const savedToken = vi.mocked(passwordResetTokenRepo.save).mock.calls[0][0];
    const expectedNotificationId = `pwreset-${createHash('sha256').update(savedToken.id).digest('hex').slice(0, 32)}`;
    expect(notificationCall.notificationId).toBe(expectedNotificationId);
  });

  it('should return silently when email is not found', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(null);

    await expect(
      useCase.execute({ email: 'unknown@example.com', requestId: 'req-1' }),
    ).resolves.toBeUndefined();

    expect(passwordResetTokenRepo.save).not.toHaveBeenCalled();
    expect(createNotificationUseCase.execute).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should return silently when user is inactive', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser({ status: 'INACTIVE' }));

    await expect(
      useCase.execute({ email: 'test@example.com', requestId: 'req-1' }),
    ).resolves.toBeUndefined();

    expect(passwordResetTokenRepo.save).not.toHaveBeenCalled();
    expect(createNotificationUseCase.execute).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should return silently, indistinguishably from an unknown email, once the in-memory limiter trips for a KNOWN email', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser());

    // Exhaust the limiter (maxRequests: 3) for this email.
    await useCase.execute({ email: 'test@example.com', requestId: 'req-1' });
    await useCase.execute({ email: 'test@example.com', requestId: 'req-2' });
    await useCase.execute({ email: 'test@example.com', requestId: 'req-3' });

    vi.mocked(createNotificationUseCase.execute).mockClear();
    vi.mocked(auditService.log).mockClear();
    vi.mocked(userRepo.findByEmail).mockClear();

    // 4th call trips the limiter — must NOT throw and must NOT send.
    await expect(
      useCase.execute({ email: 'test@example.com', requestId: 'req-4' }),
    ).resolves.toBeUndefined();

    expect(createNotificationUseCase.execute).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
    // Rate-limited before any user lookup — no account-existence oracle.
    expect(userRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('should return silently when the DB backstop reports 3+ recent tokens', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser());
    vi.mocked(passwordResetTokenRepo.countRecentByUserId).mockResolvedValue(3);

    await expect(
      useCase.execute({ email: 'test@example.com', requestId: 'req-1' }),
    ).resolves.toBeUndefined();

    expect(passwordResetTokenRepo.save).not.toHaveBeenCalled();
    expect(createNotificationUseCase.execute).not.toHaveBeenCalled();
  });

  it('should store SHA-256 hash of token, not the raw token', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser());

    await useCase.execute({ email: 'test@example.com', requestId: 'req-1' });

    const savedToken = vi.mocked(passwordResetTokenRepo.save).mock.calls[0][0];
    const notificationCall = vi.mocked(createNotificationUseCase.execute).mock.calls[0][0];
    const resetLink = new URL(notificationCall.payloadJson.resetLink);
    const rawToken = resetLink.searchParams.get('token')!;

    // The stored hash must be the SHA-256 of the raw token sent in the notification
    const expectedHash = createHash('sha256').update(rawToken).digest('hex');
    expect(savedToken.tokenHash).toBe(expectedHash);

    // The raw token must NOT be the same as the stored hash
    expect(savedToken.tokenHash).not.toBe(rawToken);
  });

  it('should build a web-app reset link for non-inspector users', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser({ role: 'CL_ADMIN' }));

    await useCase.execute({ email: 'test@example.com', requestId: 'req-1' });

    const { payloadJson } = vi.mocked(createNotificationUseCase.execute).mock.calls[0][0];
    expect(payloadJson.resetLink).toMatch(
      /^https:\/\/app\.example\.com\/reset-password\?token=[0-9a-f]{64}$/,
    );
    expect(payloadJson.userName).toBe('Test User');
    expect(payloadJson).not.toHaveProperty('resetToken');
  });

  it('should build a PWA reset link for inspectors (INSP role)', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser({ role: 'INSP' }));

    await useCase.execute({ email: 'test@example.com', requestId: 'req-1' });

    const { payloadJson } = vi.mocked(createNotificationUseCase.execute).mock.calls[0][0];
    expect(payloadJson.resetLink).toMatch(
      /^https:\/\/pwa\.example\.com\/reset-password\?token=[0-9a-f]{64}$/,
    );
  });

  it('should normalize base URLs with a trailing slash', async () => {
    const slashUseCase = new RequestPasswordResetUseCase(
      userRepo,
      passwordResetTokenRepo,
      createNotificationUseCase,
      auditService,
      { webAppBaseUrl: 'https://app.example.com/', pwaBaseUrl: 'https://pwa.example.com/' },
      emailRateLimiter,
    );
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser());

    await slashUseCase.execute({ email: 'test@example.com', requestId: 'req-1' });

    const { payloadJson } = vi.mocked(createNotificationUseCase.execute).mock.calls[0][0];
    expect(payloadJson.resetLink).toMatch(/^https:\/\/app\.example\.com\/reset-password\?token=/);
  });

  // AM, OP and INSP users have users.tenant_id NULL. This used to pass the
  // literal 'platform', which is not a tenants.id, so the insert failed
  // notifications_tenant_id_fkey and the endpoint 500'd for all three roles.
  it('should pass a null tenantId when the user has no tenant (platform-scoped)', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser({ tenantId: null }));

    await useCase.execute({ email: 'test@example.com', requestId: 'req-1' });

    expect(createNotificationUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: null }),
    );
  });

  it('should set token expiry to 1 hour from creation', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser());

    await useCase.execute({ email: 'test@example.com', requestId: 'req-1' });

    const savedToken = vi.mocked(passwordResetTokenRepo.save).mock.calls[0][0];
    const diffMs = savedToken.expiresAt.getTime() - savedToken.createdAt.getTime();
    expect(diffMs).toBe(60 * 60 * 1000);
  });
});
