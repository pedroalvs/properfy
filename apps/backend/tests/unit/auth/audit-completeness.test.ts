import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

// Auth use cases
import { LoginUseCase } from '../../../src/modules/auth/application/use-cases/login.use-case';
import { ChangePasswordUseCase } from '../../../src/modules/auth/application/use-cases/change-password.use-case';
import { RequestPasswordResetUseCase } from '../../../src/modules/auth/application/use-cases/request-password-reset.use-case';
import { ConsumePasswordResetUseCase } from '../../../src/modules/auth/application/use-cases/consume-password-reset.use-case';
import { AcceptInviteUseCase } from '../../../src/modules/auth/application/use-cases/accept-invite.use-case';
import { SetupTotpUseCase } from '../../../src/modules/auth/application/use-cases/setup-totp.use-case';
import { ConfirmTotpUseCase } from '../../../src/modules/auth/application/use-cases/confirm-totp.use-case';
import { LogoutUseCase } from '../../../src/modules/auth/application/use-cases/logout.use-case';
import { RevokeSessionUseCase } from '../../../src/modules/auth/application/use-cases/revoke-session.use-case';

// User management use cases
import { CreateUserUseCase } from '../../../src/modules/user/application/use-cases/create-user.use-case';
import { UpdateUserUseCase } from '../../../src/modules/user/application/use-cases/update-user.use-case';
import { DeactivateUserUseCase } from '../../../src/modules/user/application/use-cases/deactivate-user.use-case';
import { UnlockUserUseCase } from '../../../src/modules/user/application/use-cases/unlock-user.use-case';
import { ResetUserPasswordUseCase } from '../../../src/modules/user/application/use-cases/reset-user-password.use-case';
import { InviteUserUseCase } from '../../../src/modules/user/application/use-cases/invite-user.use-case';

// Domain entities
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { SessionEntity } from '../../../src/modules/auth/domain/session.entity';
import { PasswordResetTokenEntity } from '../../../src/modules/auth/domain/password-reset-token.entity';

// Types
import type { IUserRepository } from '../../../src/modules/auth/domain/user.repository';
import type { ISessionRepository } from '../../../src/modules/auth/domain/session.repository';
import type { IPasswordResetTokenRepository } from '../../../src/modules/auth/domain/password-reset-token.repository';
import type { IPasswordHistoryRepository } from '../../../src/modules/auth/domain/password-history.repository';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { JwtService } from '../../../src/modules/auth/application/services/jwt.service';
import type { TotpService } from '../../../src/modules/auth/application/services/totp.service';
import type { TotpEncryptionService } from '../../../src/modules/auth/infrastructure/totp-encryption.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import type { AuthContext } from '@properfy/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PASSWORD = 'ValidPass1!';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

function makeUser(overrides: Partial<ConstructorParameters<typeof UserEntity>[0]> = {}): UserEntity {
  return new UserEntity({
    id: 'user-1',
    tenantId: 'tenant-1',
    branchId: null,
    role: 'CL_ADMIN',
    name: 'Test User',
    email: 'test@example.com',
    phone: null,
    status: 'ACTIVE',
    passwordHash: PASSWORD_HASH,
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

function makeSession(overrides: Partial<ConstructorParameters<typeof SessionEntity>[0]> = {}): SessionEntity {
  return new SessionEntity({
    id: 'session-1',
    userId: 'user-1',
    refreshTokenHash: 'hash',
    ipAddress: null,
    userAgent: null,
    countryCode: null,
    deviceFingerprint: null,
    expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  });
}

function makePasswordResetToken(overrides: Partial<ConstructorParameters<typeof PasswordResetTokenEntity>[0]> = {}): PasswordResetTokenEntity {
  return new PasswordResetTokenEntity({
    id: 'token-1',
    userId: 'user-1',
    tokenHash: '', // will be overridden by test
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  });
}

const amActor: AuthContext = {
  userId: 'actor-am',
  tenantId: null,
  role: 'AM',
  branchId: null,
  inspectorId: null,
};

function makeAuditService() {
  return { log: vi.fn() } as unknown as AuditService;
}

function makeUserRepo(user: UserEntity | null = makeUser()): IUserRepository {
  return {
    findByEmail: vi.fn().mockResolvedValue(user),
    findById: vi.fn().mockResolvedValue(user),
    save: vi.fn(),
    updateLoginSuccess: vi.fn(),
    updateFailedLogin: vi.fn(),
    updatePassword: vi.fn(),
    updateTotpSecret: vi.fn(),
    updateTotpEnabled: vi.fn(),
    activateUser: vi.fn(),
  };
}

function makeSessionRepo(): ISessionRepository {
  return {
    create: vi.fn().mockResolvedValue(makeSession()),
    findByRefreshTokenHash: vi.fn(),
    findById: vi.fn().mockResolvedValue(makeSession()),
    findActiveByUserId: vi.fn().mockResolvedValue([]),
    updateRefreshToken: vi.fn(),
    revoke: vi.fn(),
    revokeAllForUser: vi.fn(),
    findRecentByUserId: vi.fn().mockResolvedValue([]),
    deleteExpiredBefore: vi.fn(),
  };
}

function makePasswordResetTokenRepo(): IPasswordResetTokenRepository {
  return {
    save: vi.fn(),
    findByTokenHash: vi.fn(),
    markUsed: vi.fn(),
    countRecentByUserId: vi.fn().mockResolvedValue(0),
    deleteExpired: vi.fn(),
  };
}

function makePasswordHistoryRepo(): IPasswordHistoryRepository {
  return {
    findRecentByUserId: vi.fn().mockResolvedValue([]),
    save: vi.fn(),
    pruneOldEntries: vi.fn(),
  };
}

function makeJwtService(): JwtService {
  return {
    signAccessToken: vi.fn().mockResolvedValue('access-token'),
    verify: vi.fn(),
  } as unknown as JwtService;
}

function makeTotpService(): TotpService {
  return {
    verify: vi.fn().mockReturnValue(true),
    generateSecret: vi.fn().mockReturnValue('totp-secret'),
    generateToken: vi.fn(),
    generateUri: vi.fn().mockReturnValue('otpauth://totp/...'),
  } as unknown as TotpService;
}

function makeTotpEncryptionService(): TotpEncryptionService {
  return {
    encrypt: vi.fn((s: string) => `encrypted:${s}`),
    decrypt: vi.fn((s: string) => s.replace('encrypted:', '')),
  } as unknown as TotpEncryptionService;
}

function makeInspectorRepo(): IInspectorRepository {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findByUserId: vi.fn().mockResolvedValue(null),
    linkUserId: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  } as unknown as IInspectorRepository;
}

function makeUserManagementRepo(user: UserEntity | null = makeUser()): IUserManagementRepository {
  return {
    findById: vi.fn().mockResolvedValue(user),
    findByIdAndTenantId: vi.fn().mockResolvedValue(user),
    findByEmail: vi.fn().mockResolvedValue(null),
    findByTenantId: vi.fn().mockResolvedValue([]),
    countByTenantId: vi.fn().mockResolvedValue(0),
    save: vi.fn(),
    update: vi.fn(),
    resetPassword: vi.fn(),
    unlock: vi.fn(),
    revokeAllSessions: vi.fn(),
  };
}

function makeTenantRepo(): ITenantRepository {
  return {
    findById: vi.fn().mockResolvedValue({ id: 'tenant-1', isActive: () => true }),
    findByLegalName: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  } as unknown as ITenantRepository;
}

function makeBranchRepo(): IBranchRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByName: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    countByTenantIds: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  } as unknown as IBranchRepository;
}

function makeCreateNotificationUseCase(): CreateNotificationUseCase {
  return {
    execute: vi.fn().mockResolvedValue({ id: 'notif-1' }),
  } as unknown as CreateNotificationUseCase;
}

// ---------------------------------------------------------------------------
// Audit assertion helper
// ---------------------------------------------------------------------------

function assertSingleAuditRecord(auditService: AuditService) {
  const log = vi.mocked((auditService as any).log);
  expect(log).toHaveBeenCalledTimes(1);
  const call = log.mock.calls[0]![0]!;
  expect(call.action).toBeTruthy();
  expect(typeof call.action).toBe('string');
  expect(call.entityType).toBeTruthy();
  expect(call.actorType).toBeTruthy();
  expect(['USER', 'SYSTEM', 'ANONYMOUS']).toContain(call.actorType);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Audit completeness: every identity write-path emits exactly one audit record', () => {
  // -------------------------------------------------------------------------
  // Auth module use cases
  // -------------------------------------------------------------------------

  describe('LoginUseCase', () => {
    it('emits exactly one audit record on success', async () => {
      const auditService = makeAuditService();
      const useCase = new LoginUseCase(
        makeUserRepo(),
        makeSessionRepo(),
        makeJwtService(),
        makeTotpService(),
        auditService,
        makeInspectorRepo(),
        makeTotpEncryptionService(),
      );

      await useCase.execute({ email: 'test@example.com', password: PASSWORD });

      assertSingleAuditRecord(auditService);
    });
  });

  describe('ChangePasswordUseCase', () => {
    it('emits exactly one audit record on success', async () => {
      const auditService = makeAuditService();
      const useCase = new ChangePasswordUseCase(
        makeUserRepo(),
        makeSessionRepo(),
        auditService,
        makePasswordHistoryRepo(),
      );

      await useCase.execute({ userId: 'user-1', currentPassword: PASSWORD, newPassword: 'NewPass2@' });

      assertSingleAuditRecord(auditService);
    });
  });

  describe('RequestPasswordResetUseCase', () => {
    it('emits exactly one audit record on success', async () => {
      const auditService = makeAuditService();
      const useCase = new RequestPasswordResetUseCase(
        makeUserRepo(),
        makePasswordResetTokenRepo(),
        makeCreateNotificationUseCase(),
        auditService,
      );

      await useCase.execute({ email: 'test@example.com' });

      assertSingleAuditRecord(auditService);
    });
  });

  describe('ConsumePasswordResetUseCase', () => {
    it('emits exactly one audit record on success', async () => {
      const auditService = makeAuditService();
      const tokenRepo = makePasswordResetTokenRepo();
      vi.mocked(tokenRepo.findByTokenHash).mockResolvedValue(makePasswordResetToken());

      const useCase = new ConsumePasswordResetUseCase(
        tokenRepo,
        makeUserRepo(),
        makeSessionRepo(),
        auditService,
        makePasswordHistoryRepo(),
      );

      await useCase.execute({ token: 'valid-token', newPassword: 'NewPass2@' });

      assertSingleAuditRecord(auditService);
    });
  });

  describe('AcceptInviteUseCase', () => {
    it('emits exactly one audit record on success', async () => {
      const auditService = makeAuditService();
      const tokenRepo = makePasswordResetTokenRepo();
      vi.mocked(tokenRepo.findByTokenHash).mockResolvedValue(makePasswordResetToken());
      const userRepo = makeUserRepo(makeUser({ status: 'PENDING_INVITE' }));

      const useCase = new AcceptInviteUseCase(tokenRepo, userRepo, auditService);

      await useCase.execute({ token: 'invite-token', password: 'NewPass2@' });

      assertSingleAuditRecord(auditService);
    });
  });

  describe('SetupTotpUseCase', () => {
    it('emits exactly one audit record on success', async () => {
      const auditService = makeAuditService();
      const useCase = new SetupTotpUseCase(
        makeUserRepo(),
        makeTotpService(),
        auditService,
        makeTotpEncryptionService(),
      );

      await useCase.execute({ userId: 'user-1' });

      assertSingleAuditRecord(auditService);
    });
  });

  describe('ConfirmTotpUseCase', () => {
    it('emits exactly one audit record on success', async () => {
      const auditService = makeAuditService();
      const useCase = new ConfirmTotpUseCase(
        makeUserRepo(makeUser({ totpSecret: 'encrypted:secret' })),
        makeTotpService(),
        auditService,
        makeTotpEncryptionService(),
      );

      await useCase.execute({ userId: 'user-1', totpCode: '123456' });

      assertSingleAuditRecord(auditService);
    });
  });

  describe('LogoutUseCase', () => {
    it('emits exactly one audit record on success', async () => {
      const auditService = makeAuditService();
      const useCase = new LogoutUseCase(makeSessionRepo(), auditService);

      await useCase.execute({ userId: 'user-1' });

      assertSingleAuditRecord(auditService);
    });
  });

  describe('RevokeSessionUseCase', () => {
    it('emits exactly one audit record on success', async () => {
      const auditService = makeAuditService();
      const useCase = new RevokeSessionUseCase(makeSessionRepo(), auditService);

      await useCase.execute({ sessionId: 'session-1', actorId: 'user-1', actorRole: 'AM' });

      assertSingleAuditRecord(auditService);
    });
  });

  // -------------------------------------------------------------------------
  // User management module use cases
  // -------------------------------------------------------------------------

  describe('CreateUserUseCase', () => {
    it('emits exactly one audit record on success', async () => {
      const auditService = makeAuditService();
      const useCase = new CreateUserUseCase(
        makeUserManagementRepo(),
        makeTenantRepo(),
        makeBranchRepo(),
        auditService,
        new AuthorizationService(auditService),
      );

      await useCase.execute({
        tenantId: 'tenant-1',
        name: 'New User',
        email: 'new@example.com',
        password: 'NewPass2@',
        role: 'CL_ADMIN',
        actor: amActor,
      });

      assertSingleAuditRecord(auditService);
    });
  });

  describe('UpdateUserUseCase', () => {
    it('emits exactly one audit record on success', async () => {
      const auditService = makeAuditService();
      const userMgmtRepo = makeUserManagementRepo();
      const useCase = new UpdateUserUseCase(
        userMgmtRepo,
        makeTenantRepo(),
        makeBranchRepo(),
        auditService,
      );

      await useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        data: { name: 'Updated Name' },
        actor: amActor,
      });

      assertSingleAuditRecord(auditService);
    });
  });

  describe('DeactivateUserUseCase', () => {
    it('emits exactly one audit record on success', async () => {
      const auditService = makeAuditService();
      const useCase = new DeactivateUserUseCase(
        makeUserManagementRepo(),
        makeTenantRepo(),
        auditService,
        new AuthorizationService(auditService),
      );

      await useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        reason: 'test deactivation',
        actor: amActor,
      });

      assertSingleAuditRecord(auditService);
    });
  });

  describe('UnlockUserUseCase', () => {
    it('emits exactly one audit record on success', async () => {
      const auditService = makeAuditService();
      const useCase = new UnlockUserUseCase(
        makeUserManagementRepo(makeUser({ status: 'LOCKED', lockedUntil: new Date(Date.now() + 60000), failedLoginCount: 5 })),
        auditService,
        new AuthorizationService(auditService),
      );

      await useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        actor: amActor,
      });

      assertSingleAuditRecord(auditService);
    });
  });

  describe('ResetUserPasswordUseCase', () => {
    it('emits exactly one audit record on success', async () => {
      const auditService = makeAuditService();
      const useCase = new ResetUserPasswordUseCase(
        makeUserManagementRepo(),
        auditService,
        makePasswordHistoryRepo(),
        new AuthorizationService(auditService),
      );

      await useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        newPassword: 'NewPass2@',
        actor: amActor,
      });

      assertSingleAuditRecord(auditService);
    });
  });

  describe('InviteUserUseCase', () => {
    it('emits exactly one audit record on success', async () => {
      const auditService = makeAuditService();
      const useCase = new InviteUserUseCase(
        makeUserManagementRepo(),
        makeTenantRepo(),
        makeBranchRepo(),
        makePasswordResetTokenRepo(),
        makeCreateNotificationUseCase(),
        auditService,
        new AuthorizationService(auditService),
      );

      await useCase.execute({
        tenantId: 'tenant-1',
        name: 'Invited User',
        email: 'invited@example.com',
        role: 'CL_ADMIN',
        actor: amActor,
      });

      assertSingleAuditRecord(auditService);
    });
  });
});
