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
import { ForbiddenError } from '../../../src/shared/domain/errors';
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

  it('should allow CL_ADMIN to create user for own tenant', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
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
