import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SetupTotpUseCase } from '../../../src/modules/auth/application/use-cases/setup-totp.use-case';
import type { IUserRepository } from '../../../src/modules/auth/domain/user.repository';
import type { TotpService } from '../../../src/modules/auth/application/services/totp.service';
import type { TotpEncryptionService } from '../../../src/modules/auth/infrastructure/totp-encryption.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { NotFoundError } from '../../../src/shared/domain/errors';
import { TotpAlreadyEnabledError } from '../../../src/modules/auth/domain/auth.errors';

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

describe('SetupTotpUseCase', () => {
  let userRepo: IUserRepository;
  let totpService: TotpService;
  let auditService: AuditService;
  let encryptionService: TotpEncryptionService;
  let useCase: SetupTotpUseCase;

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
      generateSecret: vi.fn().mockReturnValue('TOTP_SECRET_ABC'),
      generateUri: vi.fn().mockReturnValue('otpauth://totp/Properfy:admin@example.com?secret=TOTP_SECRET_ABC'),
      verify: vi.fn(),
      generateToken: vi.fn(),
    } as unknown as TotpService;
    auditService = { log: vi.fn() } as unknown as AuditService;
    encryptionService = {
      encrypt: vi.fn().mockReturnValue('ENCRYPTED_SECRET'),
      decrypt: vi.fn(),
    } as unknown as TotpEncryptionService;

    useCase = new SetupTotpUseCase(userRepo, totpService, auditService, encryptionService);
  });

  it('should return secret and QR URI on successful setup', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result.secret).toBe('TOTP_SECRET_ABC');
    expect(result.qrUri).toBe('otpauth://totp/Properfy:admin@example.com?secret=TOTP_SECRET_ABC');
    expect(totpService.generateSecret).toHaveBeenCalled();
    expect(totpService.generateUri).toHaveBeenCalledWith('admin@example.com', 'TOTP_SECRET_ABC');
  });

  it('should throw NotFoundError when user not found', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute({ userId: 'nonexistent' })).rejects.toThrow(NotFoundError);
  });

  it('should throw TotpAlreadyEnabledError when TOTP is already enabled', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ totpEnabled: true, totpSecret: 'existing' }));

    await expect(useCase.execute({ userId: 'user-1' })).rejects.toThrow(TotpAlreadyEnabledError);
  });

  it('should create audit log on setup', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

    await useCase.execute({ userId: 'user-1' });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.totp_setup_initiated',
        actorType: 'USER',
        actorId: 'user-1',
        entityType: 'USER',
        entityId: 'user-1',
      }),
    );
  });

  it('should encrypt secret when encryption service is present', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

    await useCase.execute({ userId: 'user-1' });

    expect(encryptionService.encrypt).toHaveBeenCalledWith('TOTP_SECRET_ABC');
    expect(userRepo.updateTotpSecret).toHaveBeenCalledWith('user-1', 'ENCRYPTED_SECRET');
  });

  it('should allow OP user to set up TOTP', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ role: 'OP', tenantId: null }));

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result.secret).toBe('TOTP_SECRET_ABC');
    expect(result.qrUri).toBeDefined();
    expect(userRepo.updateTotpSecret).toHaveBeenCalledWith('user-1', 'ENCRYPTED_SECRET');
  });

  it('should allow CL_ADMIN user to set up TOTP', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ role: 'CL_ADMIN', tenantId: 'tenant-1' }));

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result.secret).toBe('TOTP_SECRET_ABC');
    expect(result.qrUri).toBeDefined();
    expect(userRepo.updateTotpSecret).toHaveBeenCalledWith('user-1', 'ENCRYPTED_SECRET');
  });

  it('should allow CL_USER user to set up TOTP', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ role: 'CL_USER', tenantId: 'tenant-1' }));

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result.secret).toBe('TOTP_SECRET_ABC');
    expect(result.qrUri).toBeDefined();
    expect(userRepo.updateTotpSecret).toHaveBeenCalledWith('user-1', 'ENCRYPTED_SECRET');
  });

  it('should always use encryption service to store secret', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

    await useCase.execute({ userId: 'user-1' });

    // The encrypted value (not raw) should be stored
    expect(userRepo.updateTotpSecret).toHaveBeenCalledWith('user-1', 'ENCRYPTED_SECRET');
    expect(encryptionService.encrypt).toHaveBeenCalledWith('TOTP_SECRET_ABC');
  });
});
