import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactivateUserUseCase } from '../../../src/modules/user/application/use-cases/reactivate-user.use-case';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import {
  UserNotFoundError,
  UserAlreadyActiveError,
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
    status: 'INACTIVE',
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

describe('ReactivateUserUseCase', () => {
  let userManagementRepo: IUserManagementRepository;
  let tenantRepo: ITenantRepository;
  let auditService: AuditService;
  let authorizationService: AuthorizationService;
  let useCase: ReactivateUserUseCase;

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

  const opActor: AuthContext = {
    userId: 'op-1',
    tenantId: null,
    role: 'OP',
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
    auditService = { log: vi.fn() } as unknown as AuditService;
    authorizationService = new AuthorizationService(auditService);
    useCase = new ReactivateUserUseCase(userManagementRepo, tenantRepo, auditService, authorizationService);
  });

  it('should allow AM to reactivate a tenant user', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(makeUser());

    await useCase.execute({ tenantId: 'tenant-1', userId: 'user-1', actor: amActor });

    expect(userManagementRepo.update).toHaveBeenCalledWith('user-1', 'tenant-1', {
      status: 'ACTIVE',
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.reactivated',
        entityId: 'user-1',
        after: { status: 'ACTIVE' },
      }),
    );
  });

  it('should allow AM to reactivate an internal user', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(
      makeUser({ tenantId: null, role: 'OP' }),
    );

    await useCase.execute({ tenantId: null, userId: 'user-1', actor: amActor });

    expect(userManagementRepo.update).toHaveBeenCalledWith('user-1', null, {
      status: 'ACTIVE',
    });
  });

  it('should throw AUTH_FORBIDDEN when OP reactivates an internal user', async () => {
    await expect(
      useCase.execute({ tenantId: null, userId: 'user-1', actor: opActor }),
    ).rejects.toThrow('You are not allowed to reactivate internal users');
    expect(userManagementRepo.update).not.toHaveBeenCalled();
  });

  it('should throw AUTH_FORBIDDEN when OP reactivates a tenant user', async () => {
    await expect(
      useCase.execute({ tenantId: 'tenant-1', userId: 'user-1', actor: opActor }),
    ).rejects.toThrow('You can only reactivate users from your own tenant');
    expect(userManagementRepo.update).not.toHaveBeenCalled();
  });

  it('should allow CL_ADMIN to reactivate own tenant user when management is enabled', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ settingsJson: { allowClientUserManagement: true } }),
    );
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(makeUser());

    await useCase.execute({ tenantId: 'tenant-1', userId: 'user-1', actor: clAdminActor });

    expect(userManagementRepo.update).toHaveBeenCalledWith('user-1', 'tenant-1', {
      status: 'ACTIVE',
    });
  });

  it('should throw when CL_ADMIN management is disabled', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ settingsJson: {} }));

    await expect(
      useCase.execute({ tenantId: 'tenant-1', userId: 'user-1', actor: clAdminActor }),
    ).rejects.toThrow('Client user management is not enabled for this agency');
  });

  it('should throw USER_NOT_FOUND when user does not exist', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(null);

    await expect(
      useCase.execute({ tenantId: 'tenant-1', userId: 'nope', actor: amActor }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('should throw USER_ALREADY_ACTIVE when user is already active', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(
      makeUser({ status: 'ACTIVE' }),
    );

    await expect(
      useCase.execute({ tenantId: 'tenant-1', userId: 'user-1', actor: amActor }),
    ).rejects.toThrow(UserAlreadyActiveError);
    expect(userManagementRepo.update).not.toHaveBeenCalled();
  });

  it('should not revoke sessions on reactivation', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(makeUser());

    await useCase.execute({ tenantId: 'tenant-1', userId: 'user-1', actor: amActor });

    expect(userManagementRepo.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('should reject roles outside AM/OP/CL_ADMIN', async () => {
    const inspActor: AuthContext = {
      userId: 'insp-1', tenantId: null, role: 'INSP', branchId: null, inspectorId: 'i1',
    };
    await expect(
      useCase.execute({ tenantId: 'tenant-1', userId: 'user-1', actor: inspActor }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
