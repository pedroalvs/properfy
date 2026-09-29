import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { ResetUserTotpUseCase } from '../../../src/modules/user/application/use-cases/reset-user-totp.use-case';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { UserNotFoundError } from '../../../src/modules/user/domain/user-management.errors';

function makeUser(overrides: Partial<ConstructorParameters<typeof UserEntity>[0]> = {}): UserEntity {
  return new UserEntity({
    id: 'user-1',
    tenantId: 'tenant-1',
    branchId: null,
    role: 'CL_USER',
    name: 'Test User',
    email: 'test@example.com',
    phone: null,
    status: 'ACTIVE',
    passwordHash: 'hashed',
    totpSecret: 'stored-secret',
    totpEnabled: true,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

describe('ResetUserTotpUseCase', () => {
  let userManagementRepo: IUserManagementRepository;
  let auditService: AuditService;
  let authorizationService: AuthorizationService;
  let useCase: ResetUserTotpUseCase;

  const amActor: AuthContext = {
    userId: 'admin-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
  };

  beforeEach(() => {
    userManagementRepo = {
      findById: vi.fn(),
      findByIdAndTenantId: vi.fn(),
      findByEmail: vi.fn(),
      findByPhone: vi.fn(),
      findActiveByRoles: vi.fn(),
      findByTenantId: vi.fn(),
      countByTenantId: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      resetPassword: vi.fn(),
      unlock: vi.fn(),
      resetTotp: vi.fn(),
      revokeAllSessions: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    authorizationService = new AuthorizationService(auditService);
    useCase = new ResetUserTotpUseCase(userManagementRepo, auditService, authorizationService);
  });

  it('allows AM to reset a tenant user 2FA and revoke sessions', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(makeUser());

    await useCase.execute({ tenantId: 'tenant-1', userId: 'user-1', actor: amActor });

    expect(userManagementRepo.resetTotp).toHaveBeenCalledWith('user-1', 'tenant-1', undefined);
    expect(userManagementRepo.revokeAllSessions).toHaveBeenCalledWith('user-1', undefined);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.totp_reset',
        actorId: 'admin-1',
        entityId: 'user-1',
        tenantId: 'tenant-1',
      }),
    );
  });

  it('allows OP to reset an internal user 2FA (null tenant)', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(
      makeUser({ id: 'op-target', tenantId: null, role: 'OP' }),
    );

    await useCase.execute({
      tenantId: null,
      userId: 'op-target',
      actor: { userId: 'op-1', tenantId: null, role: 'OP', branchId: null, inspectorId: null },
    });

    expect(userManagementRepo.resetTotp).toHaveBeenCalledWith('op-target', null, undefined);
  });

  it('blocks non-admin roles (CL_ADMIN)', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        actor: { userId: 'cl-admin-1', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null },
      }),
    ).rejects.toThrow(ForbiddenError);

    expect(userManagementRepo.resetTotp).not.toHaveBeenCalled();
  });

  it('blocks resetting your own 2FA via the admin action', async () => {
    await expect(
      useCase.execute({ tenantId: null, userId: 'admin-1', actor: amActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws when the target user does not exist in scope', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(null);

    await expect(
      useCase.execute({ tenantId: 'tenant-1', userId: 'user-1', actor: amActor }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('rolls back and never audits when a write mid-transaction fails', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(makeUser());
    vi.mocked(userManagementRepo.revokeAllSessions).mockRejectedValue(new Error('db down'));

    const txObject = {} as never;
    const fakePrisma = {
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(txObject)),
    } as never;

    const txUseCase = new ResetUserTotpUseCase(userManagementRepo, auditService, authorizationService, fakePrisma);

    await expect(
      txUseCase.execute({ tenantId: 'tenant-1', userId: 'user-1', actor: amActor }),
    ).rejects.toThrow('db down');

    expect(auditService.log).not.toHaveBeenCalled();
  });
});
