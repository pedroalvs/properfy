import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnlockUserUseCase } from '../../../src/modules/user/application/use-cases/unlock-user.use-case';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import {
  UserNotFoundError,
  UserNotLockedError,
} from '../../../src/modules/user/domain/user-management.errors';
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

function makeLockedUser(
  overrides: Partial<ConstructorParameters<typeof UserEntity>[0]> = {},
): UserEntity {
  const futureDate = new Date();
  futureDate.setMinutes(futureDate.getMinutes() + 15);
  return makeUser({
    status: 'LOCKED',
    failedLoginCount: 5,
    lockedUntil: futureDate,
    ...overrides,
  });
}

describe('UnlockUserUseCase', () => {
  let userManagementRepo: IUserManagementRepository;
  let auditService: AuditService;
  let authorizationService: AuthorizationService;
  let useCase: UnlockUserUseCase;

  const amActor: AuthContext = {
    userId: 'admin-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
  };

  const opActor: AuthContext = {
    userId: 'op-1',
    tenantId: 'tenant-1',
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

  beforeEach(() => {
    userManagementRepo = {
      findById: vi.fn(),
      findByIdAndTenantId: vi.fn(),
      findByEmail: vi.fn(),
      findByTenantId: vi.fn(),
      countByTenantId: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      unlock: vi.fn(),
      resetPassword: vi.fn(),
      revokeAllSessions: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    authorizationService = new AuthorizationService(auditService);
    useCase = new UnlockUserUseCase(userManagementRepo, auditService, authorizationService);
  });

  it('should allow AM to unlock a locked user', async () => {
    const lockedUser = makeLockedUser();
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(lockedUser);

    await useCase.execute({
      tenantId: 'tenant-1',
      userId: 'user-1',
      actor: amActor,
    });

    expect(userManagementRepo.unlock).toHaveBeenCalledWith('user-1', 'tenant-1');
  });

  it('should allow OP to unlock a locked user in own tenant', async () => {
    const lockedUser = makeLockedUser();
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(lockedUser);

    await useCase.execute({
      tenantId: 'tenant-1',
      userId: 'user-1',
      actor: opActor,
    });

    expect(userManagementRepo.unlock).toHaveBeenCalledWith('user-1', 'tenant-1');
  });

  it('should throw AUTH_FORBIDDEN when OP tries to unlock user in other tenant', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-2',
        userId: 'user-1',
        actor: opActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw AUTH_FORBIDDEN when CL_ADMIN tries to unlock', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        actor: clAdminActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw USER_NOT_LOCKED when user is not locked', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(
      makeUser({ status: 'ACTIVE' }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        actor: amActor,
      }),
    ).rejects.toThrow(UserNotLockedError);
  });

  it('should throw USER_NOT_FOUND when user does not exist', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'nonexistent',
        actor: amActor,
      }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('should write an audit log entry on unlock', async () => {
    const lockedUser = makeLockedUser();
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(lockedUser);

    await useCase.execute({
      tenantId: 'tenant-1',
      userId: 'user-1',
      actor: amActor,
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.unlocked',
        actorType: 'USER',
        actorId: 'admin-1',
        entityType: 'User',
        entityId: 'user-1',
        tenantId: 'tenant-1',
        before: {
          status: 'LOCKED',
          failedLoginCount: 5,
          lockedUntil: lockedUser.lockedUntil,
        },
        after: {
          status: 'ACTIVE',
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
    );
  });
});
