import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateUserUseCase } from '../../../src/modules/user/application/use-cases/update-user.use-case';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import { UserNotFoundError } from '../../../src/modules/user/domain/user-management.errors';
import { BranchNotFoundError } from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import type { AuthContext } from '@properfy/shared';

function makeUser(
  overrides: Partial<ConstructorParameters<typeof UserEntity>[0]> = {},
): UserEntity {
  return new UserEntity({
    id: 'user-1',
    tenantId: 'tenant-1',
    branchId: null,
    role: 'CL_USER',
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

describe('UpdateUserUseCase', () => {
  let userManagementRepo: IUserManagementRepository;
  let branchRepo: IBranchRepository;
  let auditService: AuditService;
  let useCase: UpdateUserUseCase;

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
    branchRepo = {
      findById: vi.fn(),
      findByName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new UpdateUserUseCase(
      userManagementRepo,
      branchRepo,
      auditService,
    );
  });

  it('should allow AM to update all fields including role', async () => {
    const user = makeUser();
    const updatedUser = makeUser({ name: 'Updated Name', role: 'CL_ADMIN' });
    vi.mocked(userManagementRepo.findByIdAndTenantId)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(updatedUser);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      userId: 'user-1',
      data: { name: 'Updated Name', role: 'CL_ADMIN' },
      actor: amActor,
    });

    expect(result.name).toBe('Updated Name');
    expect(result.role).toBe('CL_ADMIN');
    expect(userManagementRepo.update).toHaveBeenCalledWith('user-1', 'tenant-1', {
      name: 'Updated Name',
      role: 'CL_ADMIN',
    });
  });

  it('should allow CL_ADMIN to update own tenant users (name, phone, branchId only, role stripped)', async () => {
    const user = makeUser();
    const updatedUser = makeUser({
      name: 'Updated Name',
      phone: '+5511999999999',
    });
    vi.mocked(userManagementRepo.findByIdAndTenantId)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(updatedUser);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      userId: 'user-1',
      data: { name: 'Updated Name', phone: '+5511999999999' },
      actor: clAdminActor,
    });

    expect(result.name).toBe('Updated Name');
    // CL_ADMIN update should not include role in the repo call
    expect(userManagementRepo.update).toHaveBeenCalledWith('user-1', 'tenant-1', {
      name: 'Updated Name',
      phone: '+5511999999999',
    });
  });

  it('should throw AUTH_FORBIDDEN when CL_ADMIN tries to assign AM role', async () => {
    const user = makeUser();
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(user);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        data: { role: 'AM' },
        actor: clAdminActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw AUTH_FORBIDDEN when CL_ADMIN tries to assign OP role', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        data: { role: 'OP' },
        actor: clAdminActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw AUTH_FORBIDDEN when CL_ADMIN updates user from another tenant', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-2',
        userId: 'user-1',
        data: { name: 'Updated' },
        actor: clAdminActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw USER_NOT_FOUND when user does not exist', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'nonexistent',
        data: { name: 'Updated' },
        actor: amActor,
      }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('should throw BRANCH_NOT_FOUND when branchId is invalid', async () => {
    const user = makeUser();
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(user);
    vi.mocked(branchRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        data: { branchId: 'branch-999' },
        actor: amActor,
      }),
    ).rejects.toThrow(BranchNotFoundError);
  });

  it('should validate branch exists when branchId is provided', async () => {
    const user = makeUser();
    const updatedUser = makeUser({ branchId: 'branch-1' });
    vi.mocked(userManagementRepo.findByIdAndTenantId)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(updatedUser);
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      userId: 'user-1',
      data: { branchId: 'branch-1' },
      actor: amActor,
    });

    expect(result.branchId).toBe('branch-1');
    expect(branchRepo.findById).toHaveBeenCalledWith('branch-1', 'tenant-1');
  });

  it('should capture before/after in audit log', async () => {
    const user = makeUser({ name: 'Old Name', phone: null });
    const updatedUser = makeUser({ name: 'New Name', phone: '+5511999999999' });
    vi.mocked(userManagementRepo.findByIdAndTenantId)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(updatedUser);

    await useCase.execute({
      tenantId: 'tenant-1',
      userId: 'user-1',
      data: { name: 'New Name', phone: '+5511999999999' },
      actor: amActor,
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.updated',
        entityType: 'User',
        entityId: 'user-1',
        tenantId: 'tenant-1',
        before: expect.objectContaining({ name: 'Old Name' }),
        after: expect.objectContaining({ name: 'New Name' }),
      }),
    );
  });

  it('should not include passwordHash in output', async () => {
    const user = makeUser();
    vi.mocked(userManagementRepo.findByIdAndTenantId)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(user);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      userId: 'user-1',
      data: { name: 'Updated' },
      actor: amActor,
    });

    expect(
      (result as Record<string, unknown>)['passwordHash'],
    ).toBeUndefined();
  });
});
