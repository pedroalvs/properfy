import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmTotpUseCase } from '../../../src/modules/auth/application/use-cases/confirm-totp.use-case';
import type { IUserRepository } from '../../../src/modules/auth/domain/user.repository';
import type { TotpService } from '../../../src/modules/auth/application/services/totp.service';
import type { TotpEncryptionService } from '../../../src/modules/auth/infrastructure/totp-encryption.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { NotFoundError } from '../../../src/shared/domain/errors';
import { TotpInvalidError, TotpNotConfiguredError } from '../../../src/modules/auth/domain/auth.errors';

function makeUser(overrides: Partial<ConstructorParameters<typeof UserEntity>[0]> = {}): UserEntity {
  return new UserEntity({
    id: 'user-1',
    tenantId: 'tenant-1',
    branchId: null,
    role: 'AM',
    name: 'Admin User',
    email: 'admin@example.com',
    phone: null,
    status: 'ACTIVE',
    passwordHash: 'hashed',
    totpSecret: 'stored-secret',
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

describe('ConfirmTotpUseCase', () => {
  let userRepo: IUserRepository;
  let totpService: TotpService;
  let auditService: AuditService;
  let encryptionService: TotpEncryptionService;
  let useCase: ConfirmTotpUseCase;

  beforeEach(() => {
    userRepo = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      save: vi.fn(),
      updateLoginSuccess: vi.fn(),
      updateFailedLogin: vi.fn(),
      updatePassword: vi.fn(),
      updateTotpSecret: vi.fn(),
      updateTotpEnabled: vi.fn(),
    };
    totpService = {
      verify: vi.fn().mockReturnValue(true),
      generateSecret: vi.fn(),
      generateToken: vi.fn(),
      generateUri: vi.fn(),
    } as unknown as TotpService;
    auditService = { log: vi.fn() } as unknown as AuditService;
    encryptionService = {
      encrypt: vi.fn(),
      decrypt: vi.fn().mockReturnValue('decrypted-secret'),
    } as unknown as TotpEncryptionService;

    useCase = new ConfirmTotpUseCase(userRepo, totpService, auditService, encryptionService);
  });

  it('should enable 2FA on valid TOTP code', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

    await useCase.execute({ userId: 'user-1', totpCode: '123456' });

    expect(userRepo.updateTotpEnabled).toHaveBeenCalledWith('user-1', true);
    expect(totpService.verify).toHaveBeenCalledWith('123456', 'decrypted-secret');
  });

  it('should throw TotpInvalidError for invalid TOTP code', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());
    vi.mocked(totpService.verify).mockReturnValue(false);

    await expect(
      useCase.execute({ userId: 'user-1', totpCode: '000000' }),
    ).rejects.toThrow(TotpInvalidError);

    expect(userRepo.updateTotpEnabled).not.toHaveBeenCalled();
  });

  it('should throw TotpNotConfiguredError when no secret is set', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ totpSecret: null }));

    await expect(
      useCase.execute({ userId: 'user-1', totpCode: '123456' }),
    ).rejects.toThrow(TotpNotConfiguredError);
  });

  it('should throw NotFoundError when user not found', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ userId: 'nonexistent', totpCode: '123456' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('should create audit log on enable', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

    await useCase.execute({ userId: 'user-1', totpCode: '123456' });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.totp_enabled',
        actorType: 'USER',
        actorId: 'user-1',
        entityType: 'USER',
        entityId: 'user-1',
      }),
    );
  });

  it('should always decrypt secret via encryption service', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ totpSecret: 'encrypted-value' }));

    await useCase.execute({ userId: 'user-1', totpCode: '123456' });

    expect(encryptionService.decrypt).toHaveBeenCalledWith('encrypted-value');
    expect(totpService.verify).toHaveBeenCalledWith('123456', 'decrypted-secret');
  });
});
