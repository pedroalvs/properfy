import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InviteUserUseCase } from '../../../src/modules/user/application/use-cases/invite-user.use-case';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { IPasswordResetTokenRepository } from '../../../src/modules/auth/domain/password-reset-token.repository';
import type { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import { UserEmailConflictError } from '../../../src/modules/user/domain/user-management.errors';
import {
  TenantNotFoundError,
  TenantInactiveError,
  BranchNotFoundError,
} from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';
import type { AuthContext } from '@properfy/shared';

function makeTenant(
  overrides: Partial<ConstructorParameters<typeof TenantEntity>[0]> = {},
): TenantEntity {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Test Tenant',
    legalName: 'Test Tenant Ltda',
    status: 'ACTIVE',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    settingsJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeBranch(
  overrides: Partial<ConstructorParameters<typeof BranchEntity>[0]> = {},
): BranchEntity {
  return new BranchEntity({
    id: 'branch-1',
    tenantId: 'tenant-1',
    name: 'Main Branch',
    addressJson: null,
    contactEmail: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

const amActor: AuthContext = {
  userId: 'admin-1',
  role: 'AM',
  tenantId: null,
  email: 'admin@properfy.com',
  permissions: [],
};

const clAdminActor: AuthContext = {
  userId: 'cl-admin-1',
  role: 'CL_ADMIN',
  tenantId: 'tenant-1',
  email: 'cladmin@agency.com',
  permissions: [],
};

describe('InviteUserUseCase', () => {
  let userManagementRepo: IUserManagementRepository;
  let tenantRepo: ITenantRepository;
  let branchRepo: IBranchRepository;
  let passwordResetTokenRepo: IPasswordResetTokenRepository;
  let createNotificationUseCase: CreateNotificationUseCase;
  let auditService: AuditService;
  let useCase: InviteUserUseCase;

  beforeEach(() => {
    userManagementRepo = {
      findById: vi.fn(),
      findByIdAndTenantId: vi.fn(),
      findByEmail: vi.fn().mockResolvedValue(null),
      findByTenantId: vi.fn(),
      countByTenantId: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      resetPassword: vi.fn(),
      unlock: vi.fn(),
      revokeAllSessions: vi.fn(),
    };
    tenantRepo = {
      findById: vi.fn().mockResolvedValue(makeTenant()),
      findByLegalName: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
    } as unknown as ITenantRepository;
    branchRepo = {
      findById: vi.fn().mockResolvedValue(makeBranch()),
      findByTenantId: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      countByTenantId: vi.fn(),
      findByNameAndTenantId: vi.fn(),
    } as unknown as IBranchRepository;
    passwordResetTokenRepo = {
      save: vi.fn(),
      findByTokenHash: vi.fn(),
      markUsed: vi.fn(),
      countRecentByUserId: vi.fn(),
      deleteExpired: vi.fn(),
    };
    createNotificationUseCase = {
      execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }),
    } as unknown as CreateNotificationUseCase;
    auditService = {
      log: vi.fn(),
    } as unknown as AuditService;

    useCase = new InviteUserUseCase(
      userManagementRepo,
      tenantRepo,
      branchRepo,
      passwordResetTokenRepo,
      createNotificationUseCase,
      auditService,
    );
  });

  it('should create user with PENDING_INVITE, generate token, send email, and audit', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant-1',
      name: 'New User',
      email: 'new@agency.com',
      role: 'CL_USER',
      actor: amActor,
    });

    expect(result.status).toBe('PENDING_INVITE');
    expect(result.email).toBe('new@agency.com');
    expect(result.role).toBe('CL_USER');
    expect(result.tenantId).toBe('tenant-1');

    // User saved with empty password hash
    expect(userManagementRepo.save).toHaveBeenCalledTimes(1);
    const savedUser = (userManagementRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as UserEntity;
    expect(savedUser.passwordHash).toBe('');
    expect(savedUser.status).toBe('PENDING_INVITE');

    // Token saved
    expect(passwordResetTokenRepo.save).toHaveBeenCalledTimes(1);

    // Email sent
    expect(createNotificationUseCase.execute).toHaveBeenCalledTimes(1);
    const notifCall = (createNotificationUseCase.execute as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(notifCall.templateCode).toBe('USER_INVITE');
    expect(notifCall.channel).toBe('EMAIL');
    expect(notifCall.recipient).toBe('new@agency.com');
    expect(notifCall.payloadJson.userName).toBe('New User');
    expect(notifCall.payloadJson.inviteToken).toBeDefined();

    // Audit logged
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.invited',
        actorType: 'USER',
        actorId: 'admin-1',
        entityType: 'User',
      }),
    );
  });

  it('should allow CL_ADMIN to invite for own tenant', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ settingsJson: { allowClientUserManagement: true } }),
    );

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      name: 'New User',
      email: 'new@agency.com',
      role: 'CL_USER',
      actor: clAdminActor,
    });

    expect(result.status).toBe('PENDING_INVITE');
  });

  it('should reject CL_ADMIN invite when allowClientUserManagement is disabled', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New User',
        email: 'new@agency.com',
        role: 'CL_USER',
        actor: clAdminActor,
      }),
    ).rejects.toThrow('Client user management is not enabled for this agency');
  });

  it('should reject CL_ADMIN inviting for other tenant', async () => {
    await expect(
      useCase.execute({
        tenantId: 'other-tenant',
        name: 'New User',
        email: 'new@agency.com',
        role: 'CL_USER',
        actor: clAdminActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject inviting AM role', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New Admin',
        email: 'admin@agency.com',
        role: 'AM',
        actor: amActor,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should reject inviting OP role', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New Op',
        email: 'op@agency.com',
        role: 'OP',
        actor: amActor,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should reject inviting INSP role', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New Inspector',
        email: 'insp@agency.com',
        role: 'INSP',
        actor: amActor,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should reject duplicate email', async () => {
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(
      new UserEntity({
        id: 'existing-1',
        tenantId: 'tenant-1',
        branchId: null,
        role: 'CL_USER',
        name: 'Existing',
        email: 'new@agency.com',
        phone: null,
        status: 'ACTIVE',
        passwordHash: '$2a$12$dummy',
        totpSecret: null,
        totpEnabled: false,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New User',
        email: 'new@agency.com',
        role: 'CL_USER',
        actor: amActor,
      }),
    ).rejects.toThrow(UserEmailConflictError);
  });

  it('should reject when tenant not found', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'nonexistent',
        name: 'New User',
        email: 'new@agency.com',
        role: 'CL_USER',
        actor: amActor,
      }),
    ).rejects.toThrow(TenantNotFoundError);
  });

  it('should reject when tenant inactive', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ status: 'INACTIVE' }));

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New User',
        email: 'new@agency.com',
        role: 'CL_USER',
        actor: amActor,
      }),
    ).rejects.toThrow(TenantInactiveError);
  });

  it('should reject when branch not found', async () => {
    vi.mocked(branchRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New User',
        email: 'new@agency.com',
        role: 'CL_USER',
        branchId: 'nonexistent-branch',
        actor: amActor,
      }),
    ).rejects.toThrow(BranchNotFoundError);
  });

  it('should reject CL_USER actor', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New User',
        email: 'new@agency.com',
        role: 'CL_USER',
        actor: { userId: 'user-1', role: 'CL_USER', tenantId: 'tenant-1', email: 'user@agency.com', permissions: [] },
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should set 72-hour TTL on invite token', async () => {
    await useCase.execute({
      tenantId: 'tenant-1',
      name: 'New User',
      email: 'new@agency.com',
      role: 'CL_USER',
      actor: amActor,
    });

    const savedToken = (passwordResetTokenRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const ttlMs = savedToken.expiresAt.getTime() - savedToken.createdAt.getTime();
    // 72 hours = 259200000 ms, allow 1s tolerance
    expect(ttlMs).toBeGreaterThan(259199000);
    expect(ttlMs).toBeLessThan(259201000);
  });
});
