import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetUserUseCase } from '../../../src/modules/user/application/use-cases/get-user.use-case';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { UserNotFoundError } from '../../../src/modules/user/domain/user-management.errors';
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
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    ...overrides,
  });
}

describe('GetUserUseCase', () => {
  let userManagementRepo: IUserManagementRepository;
  let useCase: GetUserUseCase;

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
    useCase = new GetUserUseCase(userManagementRepo);
  });

  it('should return user for AM actor (cross-tenant)', async () => {
    const user = makeUser();
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(user);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      userId: 'user-1',
      actor: amActor,
    });

    expect(userManagementRepo.findByIdAndTenantId).toHaveBeenCalledWith(
      'user-1',
      'tenant-1',
    );
    expect(result).toEqual({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      role: 'CL_ADMIN',
      tenantId: 'tenant-1',
      branchId: null,
      phone: null,
      status: 'ACTIVE',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    });
  });

  it('should return user for CL_ADMIN actor (own tenant)', async () => {
    const user = makeUser();
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(user);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      userId: 'user-1',
      actor: clAdminActor,
    });

    expect(result.id).toBe('user-1');
  });

  it('should throw ForbiddenError for CL_ADMIN accessing different tenant', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-other',
        userId: 'user-1',
        actor: clAdminActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw UserNotFoundError when user not found', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'non-existent',
        actor: amActor,
      }),
    ).rejects.toThrow(UserNotFoundError);
  });
});
