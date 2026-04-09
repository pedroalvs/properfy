import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeactivateUserUseCase } from '../../../src/modules/user/application/use-cases/deactivate-user.use-case';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import {
  UserNotFoundError,
  UserAlreadyInactiveError,
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

describe('DeactivateUserUseCase', () => {
  let userManagementRepo: IUserManagementRepository;
  let tenantRepo: ITenantRepository;
  let auditService: AuditService;
  let authorizationService: AuthorizationService;
  let useCase: DeactivateUserUseCase;

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
    auditService = { log: vi.fn() } as unknown as AuditService;
    authorizationService = new AuthorizationService(auditService);
    useCase = new DeactivateUserUseCase(userManagementRepo, tenantRepo, auditService, authorizationService);
  });

  it('should allow AM to deactivate a user', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(
      makeUser(),
    );

    await useCase.execute({
      tenantId: 'tenant-1',
      userId: 'user-1',
      reason: 'No longer needed',
      actor: amActor,
    });

    expect(userManagementRepo.update).toHaveBeenCalledWith('user-1', 'tenant-1', {
      status: 'INACTIVE',
      deletedAt: expect.any(Date),
    });
    expect(userManagementRepo.revokeAllSessions).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('should allow CL_ADMIN to deactivate own tenant user when allowClientUserManagement is enabled', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ settingsJson: { allowClientUserManagement: true } }),
    );
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(
      makeUser(),
    );

    await useCase.execute({
      tenantId: 'tenant-1',
      userId: 'user-1',
      reason: 'No longer needed',
      actor: clAdminActor,
    });

    expect(userManagementRepo.update).toHaveBeenCalledWith('user-1', 'tenant-1', {
      status: 'INACTIVE',
      deletedAt: expect.any(Date),
    });
  });

  it('should throw AUTH_FORBIDDEN when CL_ADMIN deactivates user but allowClientUserManagement is disabled', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ settingsJson: {} }));

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        reason: 'No longer needed',
        actor: clAdminActor,
      }),
    ).rejects.toThrow('Client user management is not enabled for this agency');
  });

  it('should throw AUTH_FORBIDDEN when CL_ADMIN deactivates user from another tenant', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-2',
        userId: 'user-1',
        reason: 'No longer needed',
        actor: clAdminActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw AUTH_FORBIDDEN when trying to deactivate self', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'cl-admin-1',
        reason: 'Self deactivation',
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
        reason: 'No longer needed',
        actor: amActor,
      }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('should throw USER_ALREADY_INACTIVE when user is already inactive', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(
      makeUser({ status: 'INACTIVE' }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        reason: 'No longer needed',
        actor: amActor,
      }),
    ).rejects.toThrow(UserAlreadyInactiveError);
  });

  it('should revoke all sessions on deactivation', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(
      makeUser(),
    );

    await useCase.execute({
      tenantId: 'tenant-1',
      userId: 'user-1',
      reason: 'No longer needed',
      actor: amActor,
    });

    expect(userManagementRepo.revokeAllSessions).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('should include reason in audit log', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(
      makeUser(),
    );

    await useCase.execute({
      tenantId: 'tenant-1',
      userId: 'user-1',
      reason: 'Employee left the company',
      actor: amActor,
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.deactivated',
        actorType: 'USER',
        actorId: 'admin-1',
        entityType: 'User',
        entityId: 'user-1',
        tenantId: 'tenant-1',
        reason: 'Employee left the company',
        before: { status: 'ACTIVE' },
        after: expect.objectContaining({ status: 'INACTIVE' }),
      }),
    );
  });
});
