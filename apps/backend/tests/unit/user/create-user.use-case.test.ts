import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { CreateUserUseCase } from '../../../src/modules/user/application/use-cases/create-user.use-case';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
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
import { PasswordTooCommonError } from '../../../src/modules/auth/domain/auth.errors';
import type { AuthContext } from '@properfy/shared';

function makeUser(
  overrides: Partial<ConstructorParameters<typeof UserEntity>[0]> = {},
): UserEntity {
  return new UserEntity({
    id: 'user-1',
    tenantId: 'tenant-1',
    branchId: null,
    role: 'CL_ADMIN',
    name: 'Test User',
    email: 'test@example.com',
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
    ...overrides,
  });
}

function makeTenant(
  overrides: Partial<ConstructorParameters<typeof TenantEntity>[0]> = {},
): TenantEntity {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Test Tenant',
    legalName: 'Test Tenant Ltda',
    status: 'ACTIVE',
    timezone: 'America/Sao_Paulo',
    currency: 'BRL',
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

describe('CreateUserUseCase', () => {
  let userManagementRepo: IUserManagementRepository;
  let tenantRepo: ITenantRepository;
  let branchRepo: IBranchRepository;
  let auditService: AuditService;
  let useCase: CreateUserUseCase;

  const amActor: AuthContext = {
    userId: 'admin-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
  };

  const clAdminActor: AuthContext = {
    userId: 'cl-admin-1',
    tenantId: 'tenant-1',
    role: 'CL_ADMIN',
    branchId: null,
    inspectorId: null,
  };

  beforeEach(() => {
    userManagementRepo = {
      findById: vi.fn(),
      findByIdAndTenantId: vi.fn(),
      findByEmail: vi.fn(),
      findByTenantId: vi.fn(),
      countByTenantId: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      resetPassword: vi.fn(),
      revokeAllSessions: vi.fn(),
    };
    tenantRepo = {
      findById: vi.fn(),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    branchRepo = {
      findById: vi.fn(),
      findByName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new CreateUserUseCase(
      userManagementRepo,
      tenantRepo,
      branchRepo,
      auditService,
    );
  });

  it('should allow AM to create user for any tenant', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      name: 'New User',
      email: 'new@example.com',
      password: 'StrongPass1!',
      role: 'CL_USER',
      actor: amActor,
    });

    expect(result.email).toBe('new@example.com');
    expect(result.role).toBe('CL_USER');
    expect(result.status).toBe('ACTIVE');
    expect(result.tenantId).toBe('tenant-1');
    expect(userManagementRepo.save).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.created' }),
    );
  });

  it('should allow CL_ADMIN to create user for own tenant when allowClientUserManagement is enabled', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ settingsJson: { allowClientUserManagement: true } }),
    );
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      name: 'New User',
      email: 'new@example.com',
      password: 'StrongPass1!',
      role: 'CL_USER',
      actor: clAdminActor,
    });

    expect(result.email).toBe('new@example.com');
    expect(result.role).toBe('CL_USER');
  });

  it('should throw AUTH_FORBIDDEN when CL_ADMIN creates user but allowClientUserManagement is disabled', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ settingsJson: {} }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New User',
        email: 'new@example.com',
        password: 'StrongPass1!',
        role: 'CL_USER',
        actor: clAdminActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw AUTH_FORBIDDEN when CL_ADMIN creates user and allowClientUserManagement defaults to false', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New User',
        email: 'new@example.com',
        password: 'StrongPass1!',
        role: 'CL_USER',
        actor: clAdminActor,
      }),
    ).rejects.toThrow('Client user management is not enabled for this agency');
  });

  it('should throw AUTH_FORBIDDEN when CL_ADMIN creates for other tenant', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-2',
        name: 'New User',
        email: 'new@example.com',
        password: 'StrongPass1!',
        role: 'CL_USER',
        actor: clAdminActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw AUTH_FORBIDDEN when CL_ADMIN tries to create AM role', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New Admin',
        email: 'admin@example.com',
        password: 'StrongPass1!',
        role: 'AM',
        actor: clAdminActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw AUTH_FORBIDDEN when CL_ADMIN tries to create OP role', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New Operator',
        email: 'op@example.com',
        password: 'StrongPass1!',
        role: 'OP',
        actor: clAdminActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw USER_EMAIL_CONFLICT when email already exists', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(makeUser());

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New User',
        email: 'test@example.com',
        password: 'StrongPass1!',
        role: 'CL_USER',
        actor: amActor,
      }),
    ).rejects.toThrow(UserEmailConflictError);
  });

  it('should throw TENANT_INACTIVE when tenant is not active', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ status: 'INACTIVE' }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New User',
        email: 'new@example.com',
        password: 'StrongPass1!',
        role: 'CL_USER',
        actor: amActor,
      }),
    ).rejects.toThrow(TenantInactiveError);
  });

  it('should throw TENANT_NOT_FOUND when tenant does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New User',
        email: 'new@example.com',
        password: 'StrongPass1!',
        role: 'CL_USER',
        actor: amActor,
      }),
    ).rejects.toThrow(TenantNotFoundError);
  });

  it('should allow AM to create internal OP without tenant', async () => {
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: null,
      name: 'Internal Operator',
      email: 'internal-op@example.com',
      password: 'StrongPass1!',
      role: 'OP',
      actor: amActor,
    });

    expect(result.role).toBe('OP');
    expect(result.tenantId).toBeNull();
  });

  it('should reject internal user creation with tenant assignment', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'Internal Operator',
        email: 'internal-op@example.com',
        password: 'StrongPass1!',
        role: 'OP',
        actor: amActor,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should hash the password with bcrypt', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(null);

    await useCase.execute({
      tenantId: 'tenant-1',
      name: 'New User',
      email: 'new@example.com',
      password: 'StrongPass1!',
      role: 'CL_USER',
      actor: amActor,
    });

    const savedUser = vi.mocked(userManagementRepo.save).mock.calls[0]![0]!;
    expect(savedUser.passwordHash).not.toBe('StrongPass1!');
    const isMatch = await bcrypt.compare('StrongPass1!', savedUser.passwordHash);
    expect(isMatch).toBe(true);
  });

  it('should throw BRANCH_NOT_FOUND when branchId is provided but branch does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(null);
    vi.mocked(branchRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New User',
        email: 'new@example.com',
        password: 'StrongPass1!',
        role: 'CL_USER',
        branchId: 'branch-999',
        actor: amActor,
      }),
    ).rejects.toThrow(BranchNotFoundError);
  });

  it('should assign branchId when branch exists', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(null);
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      name: 'New User',
      email: 'new@example.com',
      password: 'StrongPass1!',
      role: 'CL_USER',
      branchId: 'branch-1',
      actor: amActor,
    });

    expect(result.branchId).toBe('branch-1');
  });

  it('should reject common blacklisted password on create', async () => {
    // Common passwords like 'password123' fail strength first (no uppercase/special).
    // This test verifies that the password is rejected — the blacklist check acts as
    // a second defense layer after strength validation.
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New User',
        email: 'new@example.com',
        password: 'password123',
        role: 'CL_USER',
        actor: amActor,
      }),
    ).rejects.toThrow('Password does not meet strength requirements');
  });

  it('should check blacklist after strength validation passes', async () => {
    // Directly verify the blacklist code path by importing and checking
    // that COMMON_PASSWORDS is used in the use case. We mock it to include
    // a strong password to isolate the blacklist check.
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(null);

    const { COMMON_PASSWORDS } = await import(
      '../../../src/modules/auth/application/constants/common-passwords'
    );
    // Temporarily add a strong password to the blacklist
    COMMON_PASSWORDS.add('blacklisted1!strong');

    try {
      await expect(
        useCase.execute({
          tenantId: 'tenant-1',
          name: 'New User',
          email: 'new@example.com',
          password: 'Blacklisted1!Strong',
          role: 'CL_USER',
          actor: amActor,
        }),
      ).rejects.toThrow(PasswordTooCommonError);
    } finally {
      COMMON_PASSWORDS.delete('blacklisted1!strong');
    }
  });

  it('should allow creating a user with an email that belongs to a soft-deleted user', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    // findByEmail returns null because the existing user is soft-deleted
    // (repository filters deleted_at: null)
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      name: 'Reusing Email User',
      email: 'deleted-user@example.com',
      password: 'StrongPass1!',
      role: 'CL_USER',
      actor: amActor,
    });

    expect(result.email).toBe('deleted-user@example.com');
    expect(result.status).toBe('ACTIVE');
    expect(userManagementRepo.save).toHaveBeenCalled();
  });

  it('should still throw USER_EMAIL_CONFLICT when email belongs to an active user', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    // findByEmail returns a non-deleted user (active)
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(
      makeUser({ email: 'active@example.com', deletedAt: null }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'Duplicate Email User',
        email: 'active@example.com',
        password: 'StrongPass1!',
        role: 'CL_USER',
        actor: amActor,
      }),
    ).rejects.toThrow(UserEmailConflictError);
  });

  it('should never return passwordHash in the output', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      name: 'New User',
      email: 'new@example.com',
      password: 'StrongPass1!',
      role: 'CL_USER',
      actor: amActor,
    });

    expect(
      (result as Record<string, unknown>)['passwordHash'],
    ).toBeUndefined();
    expect(
      (result as Record<string, unknown>)['totpSecret'],
    ).toBeUndefined();
  });
});
