import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginUseCase } from '../../../src/modules/auth/application/use-cases/login.use-case';
import type { IUserRepository } from '../../../src/modules/auth/domain/user.repository';
import type { ISessionRepository } from '../../../src/modules/auth/domain/session.repository';
import type { JwtService } from '../../../src/modules/auth/application/services/jwt.service';
import type { TotpService } from '../../../src/modules/auth/application/services/totp.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { TotpEncryptionService } from '../../../src/modules/auth/infrastructure/totp-encryption.service';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { SessionEntity } from '../../../src/modules/auth/domain/session.entity';
import { SessionTrustService } from '../../../src/modules/auth/application/services/session-trust.service';
import type { IGeoIpService } from '../../../src/shared/infrastructure/geoip.service';
import {
  InvalidCredentialsError,
  AccountLockedError,
  UserInactiveError,
  TotpRequiredError,
  TotpInvalidError,
} from '../../../src/modules/auth/domain/auth.errors';
import bcrypt from 'bcryptjs';

function makeUser(overrides: Partial<ConstructorParameters<typeof UserEntity>[0]> = {}): UserEntity {
  return new UserEntity({
    id: 'user-1',
    tenantId: 'tenant-1',
    branchId: null,
    role: 'CL_ADMIN',
    name: 'Test User',
    email: 'test@example.com',
    phone: null,
    status: 'ACTIVE',
    passwordHash: bcrypt.hashSync('ValidPass1!', 10),
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

function makeSession(overrides: Partial<ConstructorParameters<typeof SessionEntity>[0]> = {}): SessionEntity {
  return new SessionEntity({
    id: 'session-1',
    userId: 'user-1',
    refreshTokenHash: 'hash',
    ipAddress: null,
    userAgent: null,
    countryCode: null,
    deviceFingerprint: null,
    expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  });
}

describe('LoginUseCase', () => {
  let userRepo: IUserRepository;
  let sessionRepo: ISessionRepository;
  let jwtService: JwtService;
  let totpService: TotpService;
  let auditService: AuditService;
  let inspectorRepo: IInspectorRepository;
  let totpEncryptionService: TotpEncryptionService;
  let useCase: LoginUseCase;

  beforeEach(() => {
    userRepo = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      save: vi.fn(),
      updateLoginSuccess: vi.fn(),
      updateFailedLogin: vi.fn(),
      updatePassword: vi.fn(),
    };
    sessionRepo = {
      create: vi.fn().mockResolvedValue(makeSession()),
      findByRefreshTokenHash: vi.fn(),
      findById: vi.fn(),
      findActiveByUserId: vi.fn(),
      updateRefreshToken: vi.fn(),
      revoke: vi.fn(),
      revokeAllForUser: vi.fn(),
      findRecentByUserId: vi.fn().mockResolvedValue([]),
      deleteExpiredBefore: vi.fn(),
    };
    jwtService = {
      signAccessToken: vi.fn().mockResolvedValue('access-token'),
      verify: vi.fn(),
    } as unknown as JwtService;
    totpService = {
      verify: vi.fn().mockReturnValue(true),
      generateSecret: vi.fn(),
      generateToken: vi.fn(),
      generateUri: vi.fn(),
    } as unknown as TotpService;
    auditService = {
      log: vi.fn(),
    } as unknown as AuditService;
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByUserId: vi.fn(),
      linkUserId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    } as unknown as IInspectorRepository;
    totpEncryptionService = {
      encrypt: vi.fn((s: string) => `encrypted:${s}`),
      decrypt: vi.fn((s: string) => s.replace('encrypted:', '')),
    } as unknown as TotpEncryptionService;
    useCase = new LoginUseCase(userRepo, sessionRepo, jwtService, totpService, auditService, inspectorRepo, totpEncryptionService);
  });

  it('should return tokens and user profile on valid credentials', async () => {
    const user = makeUser();
    vi.mocked(userRepo.findByEmail).mockResolvedValue(user);

    const result = await useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' });

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBeDefined();
    expect(result.user.id).toBe('user-1');
    expect(result.user.email).toBe('test@example.com');
    expect((result.user as Record<string, unknown>)['passwordHash']).toBeUndefined();
  });

  it('should return AUTH_INVALID_CREDENTIALS when email not found', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(null);
    await expect(
      useCase.execute({ email: 'unknown@example.com', password: 'ValidPass1!' })
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('should return AUTH_INVALID_CREDENTIALS when password is wrong', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser());
    await expect(
      useCase.execute({ email: 'test@example.com', password: 'WrongPass1!' })
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('should increment failed_login_count on each failed attempt', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser({ failedLoginCount: 2 }));
    await expect(
      useCase.execute({ email: 'test@example.com', password: 'WrongPass1!' })
    ).rejects.toThrow(InvalidCredentialsError);
    expect(userRepo.updateFailedLogin).toHaveBeenCalledWith('user-1', 3, null, 'ACTIVE');
  });

  it('should lock account after 5 failed attempts', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser({ failedLoginCount: 4 }));
    await expect(
      useCase.execute({ email: 'test@example.com', password: 'WrongPass1!' })
    ).rejects.toThrow(InvalidCredentialsError);
    expect(userRepo.updateFailedLogin).toHaveBeenCalledWith(
      'user-1',
      5,
      expect.any(Date),
      'LOCKED',
    );
  });

  it('should return AUTH_ACCOUNT_LOCKED when account is locked', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(
      makeUser({ status: 'LOCKED', lockedUntil: new Date(Date.now() + 15 * 60 * 1000) })
    );
    await expect(
      useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' })
    ).rejects.toThrow(AccountLockedError);
  });

  it('should auto-unlock account when locked_until has passed', async () => {
    const user = makeUser({ status: 'LOCKED', lockedUntil: new Date(Date.now() - 1000) });
    vi.mocked(userRepo.findByEmail).mockResolvedValue(user);
    vi.mocked(sessionRepo.create).mockResolvedValue(makeSession());

    const result = await useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' });
    expect(result.accessToken).toBeDefined();
    expect(userRepo.updateFailedLogin).toHaveBeenCalledWith('user-1', 0, null, 'ACTIVE');
  });

  it('should return AUTH_USER_INACTIVE for INACTIVE users', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser({ status: 'INACTIVE' }));
    await expect(
      useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' })
    ).rejects.toThrow(UserInactiveError);
  });

  it('should return AUTH_TOTP_REQUIRED for AM user with totp_enabled=true and no totpCode', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(
      makeUser({ role: 'AM', totpEnabled: true, totpSecret: 'secret', tenantId: null })
    );
    await expect(
      useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' })
    ).rejects.toThrow(TotpRequiredError);
  });

  it('should return AUTH_TOTP_INVALID for AM user with invalid totpCode', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(
      makeUser({ role: 'AM', totpEnabled: true, totpSecret: 'secret', tenantId: null })
    );
    vi.mocked(totpService.verify).mockReturnValue(false);
    await expect(
      useCase.execute({ email: 'test@example.com', password: 'ValidPass1!', totpCode: '000000' })
    ).rejects.toThrow(TotpInvalidError);
  });

  it('should return limited session with totpSetupRequired=true for AM user with totp_enabled=false', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(
      makeUser({ role: 'AM', totpEnabled: false, tenantId: null })
    );
    const result = await useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' });
    expect(result.totpSetupRequired).toBe(true);
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user.role).toBe('AM');
  });

  it('should return AUTH_TOTP_REQUIRED for CL_ADMIN user with totp_enabled=true and no totpCode', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(
      makeUser({ role: 'CL_ADMIN', totpEnabled: true, totpSecret: 'encrypted:secret' })
    );
    await expect(
      useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' })
    ).rejects.toThrow(TotpRequiredError);
  });

  it('should return AUTH_TOTP_REQUIRED for OP user with totp_enabled=true and no totpCode', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(
      makeUser({ role: 'OP', totpEnabled: true, totpSecret: 'encrypted:secret', tenantId: null })
    );
    await expect(
      useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' })
    ).rejects.toThrow(TotpRequiredError);
  });

  it('should return AUTH_TOTP_INVALID for CL_ADMIN user with invalid totpCode', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(
      makeUser({ role: 'CL_ADMIN', totpEnabled: true, totpSecret: 'encrypted:secret' })
    );
    vi.mocked(totpService.verify).mockReturnValue(false);
    await expect(
      useCase.execute({ email: 'test@example.com', password: 'ValidPass1!', totpCode: '000000' })
    ).rejects.toThrow(TotpInvalidError);
  });

  it('should login successfully for CL_ADMIN user with valid totpCode', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(
      makeUser({ role: 'CL_ADMIN', totpEnabled: true, totpSecret: 'encrypted:secret' })
    );
    vi.mocked(totpService.verify).mockReturnValue(true);

    const result = await useCase.execute({ email: 'test@example.com', password: 'ValidPass1!', totpCode: '123456' });

    expect(result.accessToken).toBeDefined();
    expect(result.user.role).toBe('CL_ADMIN');
    expect(result.totpSetupRequired).toBeUndefined();
  });

  it('should not require TOTP setup for non-AM user with totp_enabled=false', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(
      makeUser({ role: 'CL_ADMIN', totpEnabled: false })
    );

    const result = await useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' });

    expect(result.accessToken).toBeDefined();
    expect(result.totpSetupRequired).toBeUndefined();
  });

  it('should reset failed_login_count on successful login', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser({ failedLoginCount: 2 }));
    await useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' });
    expect(userRepo.updateLoginSuccess).toHaveBeenCalled();
  });

  it('should update last_login_at on successful login', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser());
    await useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' });
    expect(userRepo.updateLoginSuccess).toHaveBeenCalledWith('user-1', expect.any(Date));
  });

  it('should create a new Session record on successful login', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser());
    await useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' });
    expect(sessionRepo.create).toHaveBeenCalled();
  });

  it('should hash refresh token before storing (SHA-256)', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser());
    await useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' });
    const createCall = vi.mocked(sessionRepo.create).mock.calls[0]![0]!;
    expect(createCall.refreshTokenHash).not.toBeUndefined();
    expect(createCall.refreshTokenHash.length).toBe(64); // SHA-256 hex is 64 chars
  });

  it('should not return password_hash in response', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser());
    const result = await useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' });
    expect((result.user as Record<string, unknown>)['passwordHash']).toBeUndefined();
    expect((result.user as Record<string, unknown>)['password_hash']).toBeUndefined();
  });

  it('should resolve inspector_id for INSP user with linked inspector', async () => {
    const user = makeUser({ role: 'INSP' });
    vi.mocked(userRepo.findByEmail).mockResolvedValue(user);
    vi.mocked(inspectorRepo.findByUserId).mockResolvedValue({ id: 'insp-1' } as any);

    await useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' });

    expect(jwtService.signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ inspector_id: 'insp-1' }),
    );
  });

  it('should pass null inspector_id for INSP user without linked inspector', async () => {
    const user = makeUser({ role: 'INSP' });
    vi.mocked(userRepo.findByEmail).mockResolvedValue(user);
    vi.mocked(inspectorRepo.findByUserId).mockResolvedValue(null);

    await useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' });

    expect(jwtService.signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ inspector_id: null }),
    );
  });

  describe('trust signals', () => {
    let geoIpService: IGeoIpService;
    let sessionTrustService: SessionTrustService;
    let useCaseWithTrust: LoginUseCase;

    beforeEach(() => {
      geoIpService = {
        resolveCountry: vi.fn().mockResolvedValue('AU'),
      };
      sessionTrustService = new SessionTrustService(sessionRepo, geoIpService);
      useCaseWithTrust = new LoginUseCase(
        userRepo, sessionRepo, jwtService, totpService, auditService,
        inspectorRepo, totpEncryptionService, sessionTrustService,
      );
    });

    it('should require step-up TOTP when new country + new device and TOTP enabled', async () => {
      vi.mocked(userRepo.findByEmail).mockResolvedValue(
        makeUser({ totpEnabled: true, totpSecret: 'encrypted:secret' }),
      );
      vi.mocked(geoIpService.resolveCountry).mockResolvedValue('BR');
      vi.mocked(sessionRepo.findRecentByUserId).mockResolvedValue([
        makeSession({ countryCode: 'AU', deviceFingerprint: 'known-fingerprint' }),
      ]);

      await expect(
        useCaseWithTrust.execute({
          email: 'test@example.com',
          password: 'ValidPass1!',
          ipAddress: '200.100.50.1',
          userAgent: 'Completely Different Agent',
        }),
      ).rejects.toThrow(TotpRequiredError);
    });

    it('should audit anomaly when login from new country', async () => {
      vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser());
      vi.mocked(geoIpService.resolveCountry).mockResolvedValue('BR');
      const { computeDeviceFingerprint } = await import('../../../src/shared/infrastructure/device-fingerprint.service');
      const knownFingerprint = computeDeviceFingerprint('Mozilla/5.0 Chrome/125');
      vi.mocked(sessionRepo.findRecentByUserId).mockResolvedValue([
        makeSession({ countryCode: 'AU', deviceFingerprint: knownFingerprint }),
      ]);

      await useCaseWithTrust.execute({
        email: 'test@example.com',
        password: 'ValidPass1!',
        ipAddress: '200.100.50.1',
        userAgent: 'Mozilla/5.0 Chrome/125',
      });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.login_anomaly',
          metadata: expect.objectContaining({
            isNewCountry: true,
          }),
        }),
      );
    });

    it('should store countryCode and deviceFingerprint on session', async () => {
      vi.mocked(userRepo.findByEmail).mockResolvedValue(makeUser());
      vi.mocked(geoIpService.resolveCountry).mockResolvedValue('AU');
      vi.mocked(sessionRepo.findRecentByUserId).mockResolvedValue([]);

      await useCaseWithTrust.execute({
        email: 'test@example.com',
        password: 'ValidPass1!',
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
      });

      const createCall = vi.mocked(sessionRepo.create).mock.calls[0]![0]!;
      expect(createCall.countryCode).toBe('AU');
      expect(createCall.deviceFingerprint).toBeDefined();
      expect(createCall.deviceFingerprint).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should not require step-up TOTP when user has no TOTP enabled even with anomaly', async () => {
      vi.mocked(userRepo.findByEmail).mockResolvedValue(
        makeUser({ totpEnabled: false }),
      );
      vi.mocked(geoIpService.resolveCountry).mockResolvedValue('BR');
      vi.mocked(sessionRepo.findRecentByUserId).mockResolvedValue([
        makeSession({ countryCode: 'AU', deviceFingerprint: 'known-fingerprint' }),
      ]);

      const result = await useCaseWithTrust.execute({
        email: 'test@example.com',
        password: 'ValidPass1!',
        ipAddress: '200.100.50.1',
        userAgent: 'Completely Different Agent',
      });

      expect(result.accessToken).toBeDefined();
    });
  });
});
