import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListUsersUseCase } from '../../../src/modules/user/application/use-cases/list-users.use-case';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
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

describe('ListUsersUseCase', () => {
  let userManagementRepo: IUserManagementRepository;
  let useCase: ListUsersUseCase;

  const amActor: AuthContext = {
    userId: 'admin-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
  };

  const opActor: AuthContext = {
    userId: 'op-1',
    tenantId: null,
    role: 'OP',
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

  const defaultPagination = {
    page: 1,
    pageSize: 10,
    sortOrder: 'asc' as const,
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
    useCase = new ListUsersUseCase(userManagementRepo);
  });

  it('should return paginated list for AM on any tenant', async () => {
    const users = [
      makeUser({ id: 'user-1', email: 'a@example.com' }),
      makeUser({ id: 'user-2', email: 'b@example.com' }),
    ];
    vi.mocked(userManagementRepo.findByTenantId).mockResolvedValue(users);
    vi.mocked(userManagementRepo.countByTenantId).mockResolvedValue(2);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      filters: {},
      pagination: defaultPagination,
      actor: amActor,
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
  });

  it('should return paginated list for OP on any tenant', async () => {
    vi.mocked(userManagementRepo.findByTenantId).mockResolvedValue([]);
    vi.mocked(userManagementRepo.countByTenantId).mockResolvedValue(0);

    const result = await useCase.execute({
      tenantId: 'tenant-2',
      filters: {},
      pagination: defaultPagination,
      actor: opActor,
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('should return paginated list for CL_ADMIN on own tenant', async () => {
    const users = [makeUser()];
    vi.mocked(userManagementRepo.findByTenantId).mockResolvedValue(users);
    vi.mocked(userManagementRepo.countByTenantId).mockResolvedValue(1);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      filters: {},
      pagination: defaultPagination,
      actor: clAdminActor,
    });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('should throw AUTH_FORBIDDEN when CL_ADMIN lists users from another tenant', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-2',
        filters: {},
        pagination: defaultPagination,
        actor: clAdminActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should not include passwordHash in output items', async () => {
    vi.mocked(userManagementRepo.findByTenantId).mockResolvedValue([
      makeUser(),
    ]);
    vi.mocked(userManagementRepo.countByTenantId).mockResolvedValue(1);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      filters: {},
      pagination: defaultPagination,
      actor: amActor,
    });

    expect(
      (result.data[0] as Record<string, unknown>)['passwordHash'],
    ).toBeUndefined();
  });

  it('should pass filters and pagination to repository', async () => {
    vi.mocked(userManagementRepo.findByTenantId).mockResolvedValue([]);
    vi.mocked(userManagementRepo.countByTenantId).mockResolvedValue(0);

    const filters = { status: 'ACTIVE', role: 'CL_USER', search: 'john' };
    const pagination = {
      page: 2,
      pageSize: 5,
      sortBy: 'name',
      sortOrder: 'desc' as const,
    };

    await useCase.execute({
      tenantId: 'tenant-1',
      filters,
      pagination,
      actor: amActor,
    });

    expect(userManagementRepo.findByTenantId).toHaveBeenCalledWith(
      'tenant-1',
      filters,
      pagination,
    );
    expect(userManagementRepo.countByTenantId).toHaveBeenCalledWith(
      'tenant-1',
      filters,
    );
  });

  it('should allow AM to list internal users', async () => {
    vi.mocked(userManagementRepo.findByTenantId).mockResolvedValue([
      makeUser({ tenantId: null, role: 'AM', email: 'internal@example.com' }),
    ]);
    vi.mocked(userManagementRepo.countByTenantId).mockResolvedValue(1);

    const result = await useCase.execute({
      tenantId: null,
      filters: {},
      pagination: defaultPagination,
      actor: amActor,
    });

    expect(result.data).toHaveLength(1);
    expect(userManagementRepo.findByTenantId).toHaveBeenCalledWith(null, {}, defaultPagination);
  });

  it('should reject CL_ADMIN when listing internal users', async () => {
    await expect(
      useCase.execute({
        tenantId: null,
        filters: {},
        pagination: defaultPagination,
        actor: clAdminActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
