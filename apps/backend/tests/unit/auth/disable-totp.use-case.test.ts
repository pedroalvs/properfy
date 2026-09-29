import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { DisableTotpUseCase } from '../../../src/modules/auth/application/use-cases/disable-totp.use-case';
import type { IUserRepository } from '../../../src/modules/auth/domain/user.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { UnauthorizedError } from '../../../src/shared/domain/errors';
import { InvalidCurrentPasswordError, TotpNotConfiguredError } from '../../../src/modules/auth/domain/auth.errors';

function makeUser(overrides: Partial<ConstructorParameters<typeof UserEntity>[0]> = {}): UserEntity {
  return new UserEntity({
    id: 'user-1',
    tenantId: 'tenant-1',
    branchId: null,
    role: 'CL_USER',
    name: 'Test User',
    email: 'user@example.com',
    phone: null,
    status: 'ACTIVE',
    passwordHash: bcrypt.hashSync('CurrentPass1!', 4),
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

describe('DisableTotpUseCase', () => {
  let userRepo: IUserRepository;
  let auditService: AuditService;
  let useCase: DisableTotpUseCase;

  beforeEach(() => {
    userRepo = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      save: vi.fn(),
      updateLoginSuccess: vi.fn(),
      incrementFailedLogin: vi.fn(),
      resetFailedLogin: vi.fn(),
      updatePassword: vi.fn(),
      updateTimezone: vi.fn(),
      updateTotpSecret: vi.fn(),
      updateTotpEnabled: vi.fn(),
      disableTotp: vi.fn(),
      activateUser: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new DisableTotpUseCase(userRepo, auditService);
  });

  it('disables 2FA and clears the secret in one write on a correct password', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

    await useCase.execute({ userId: 'user-1', currentPassword: 'CurrentPass1!' });

    expect(userRepo.disableTotp).toHaveBeenCalledWith('user-1');
  });

  it('audits the disable', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

    await useCase.execute({ userId: 'user-1', currentPassword: 'CurrentPass1!' });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.totp_disabled',
        actorType: 'USER',
        actorId: 'user-1',
        entityType: 'USER',
        entityId: 'user-1',
      }),
    );
  });

  it('throws InvalidCurrentPasswordError and mutates nothing on a wrong password', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

    await expect(
      useCase.execute({ userId: 'user-1', currentPassword: 'WrongPass!' }),
    ).rejects.toThrow(InvalidCurrentPasswordError);

    expect(userRepo.disableTotp).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('throws TotpNotConfiguredError when 2FA is not enabled', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ totpEnabled: false, totpSecret: null }));

    await expect(
      useCase.execute({ userId: 'user-1', currentPassword: 'CurrentPass1!' }),
    ).rejects.toThrow(TotpNotConfiguredError);

    expect(userRepo.disableTotp).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedError when the user is missing', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ userId: 'ghost', currentPassword: 'CurrentPass1!' }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError when the user is soft-deleted', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ deletedAt: new Date() }));

    await expect(
      useCase.execute({ userId: 'user-1', currentPassword: 'CurrentPass1!' }),
    ).rejects.toThrow(UnauthorizedError);
  });
});
