import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import type { AuthContext } from '@properfy/shared';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { ResetUserPasswordUseCase } from '../../../src/modules/user/application/use-cases/reset-user-password.use-case';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { IPasswordHistoryRepository } from '../../../src/modules/auth/domain/password-history.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { UserNotFoundError } from '../../../src/modules/user/domain/user-management.errors';
import {
  PasswordSameAsCurrentError,
  PasswordTooWeakError,
  PasswordRecentlyUsedError,
} from '../../../src/modules/auth/domain/auth.errors';

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
    status: 'LOCKED',
    passwordHash: bcrypt.hashSync('StrongPass1!', 4),
    totpSecret: null,
    totpEnabled: false,
    failedLoginCount: 3,
    lockedUntil: new Date(Date.now() + 60_000),
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

describe('ResetUserPasswordUseCase', () => {
  let userManagementRepo: IUserManagementRepository;
  let auditService: AuditService;
  let authorizationService: AuthorizationService;
  let passwordHistoryRepo: IPasswordHistoryRepository;
  let useCase: ResetUserPasswordUseCase;

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
      findByTenantId: vi.fn(),
      countByTenantId: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      resetPassword: vi.fn(),
      revokeAllSessions: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    authorizationService = new AuthorizationService(auditService);
    passwordHistoryRepo = { findRecentByUserId: vi.fn().mockResolvedValue([]), save: vi.fn(), pruneOldEntries: vi.fn() };
    useCase = new ResetUserPasswordUseCase(userManagementRepo, auditService, passwordHistoryRepo, authorizationService);
  });

  it('allows AM to reset password, unlock account and revoke sessions', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(makeUser());

    await useCase.execute({
      tenantId: 'tenant-1',
      userId: 'user-1',
      newPassword: 'NewStrong1!',
      actor: amActor,
    });

    expect(userManagementRepo.resetPassword).toHaveBeenCalledWith(
      'user-1',
      'tenant-1',
      expect.any(String),
    );
    expect(userManagementRepo.revokeAllSessions).toHaveBeenCalledWith('user-1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.password_reset',
        entityId: 'user-1',
        tenantId: 'tenant-1',
      }),
    );
  });

  it('blocks non-admin roles', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        newPassword: 'NewStrong1!',
        actor: {
          userId: 'cl-admin-1',
          tenantId: 'tenant-1',
          role: 'CL_ADMIN',
          branchId: null,
          inspectorId: null,
        },
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('blocks self reset via admin action', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'admin-1',
        newPassword: 'NewStrong1!',
        actor: amActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws when user does not exist', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        newPassword: 'NewStrong1!',
        actor: amActor,
      }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('rejects weak passwords', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(makeUser());

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        newPassword: 'weak',
        actor: amActor,
      }),
    ).rejects.toThrow(PasswordTooWeakError);
  });

  it('rejects common passwords', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(makeUser());

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        newPassword: 'P@ssw0rd',
        actor: amActor,
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_PASSWORD_TOO_COMMON',
    });
  });

  it('rejects recently used password from history', async () => {
    const reusedHash = bcrypt.hashSync('NewStrong1!', 4);
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(makeUser());
    vi.mocked(passwordHistoryRepo.findRecentByUserId).mockResolvedValue([{ passwordHash: reusedHash }]);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        newPassword: 'NewStrong1!',
        actor: amActor,
      }),
    ).rejects.toThrow(PasswordRecentlyUsedError);

    expect(userManagementRepo.resetPassword).not.toHaveBeenCalled();
  });

  it('saves old hash to history after successful reset', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(makeUser());

    await useCase.execute({
      tenantId: 'tenant-1',
      userId: 'user-1',
      newPassword: 'NewStrong1!',
      actor: amActor,
    });

    expect(passwordHistoryRepo.save).toHaveBeenCalledWith('user-1', expect.any(String));
    expect(passwordHistoryRepo.pruneOldEntries).toHaveBeenCalledWith('user-1', 5);
  });

  it('rejects resetting to the same password', async () => {
    vi.mocked(userManagementRepo.findByIdAndTenantId).mockResolvedValue(makeUser());

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        userId: 'user-1',
        newPassword: 'StrongPass1!',
        actor: amActor,
      }),
    ).rejects.toThrow(PasswordSameAsCurrentError);
  });
});
