import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginUseCase } from '../../../src/modules/auth/application/use-cases/login.use-case';
import type { IUserRepository } from '../../../src/modules/auth/domain/user.repository';
import type { ISessionRepository } from '../../../src/modules/auth/domain/session.repository';
import type { JwtService } from '../../../src/modules/auth/application/services/jwt.service';
import type { TotpService } from '../../../src/modules/auth/application/services/totp.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { SessionEntity } from '../../../src/modules/auth/domain/session.entity';
import {
  InvalidCredentialsError,
  AccountLockedError,
  UserInactiveError,
  TotpRequiredError,
  TotpInvalidError,
  TotpSetupRequiredError,
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

function makeSession(): SessionEntity {
  return new SessionEntity({
    id: 'session-1',
    userId: 'user-1',
    refreshTokenHash: 'hash',
    ipAddress: null,
    userAgent: null,
    expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    createdAt: new Date(),
  });
}

describe('LoginUseCase', () => {
  let userRepo: IUserRepository;
  let sessionRepo: ISessionRepository;
  let jwtService: JwtService;
  let totpService: TotpService;
  let auditService: AuditService;
  let inspectorRepo: IInspectorRepository;
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
    useCase = new LoginUseCase(userRepo, sessionRepo, jwtService, totpService, auditService, inspectorRepo);
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

  it('should return AUTH_TOTP_SETUP_REQUIRED for AM user with totp_enabled=false', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(
      makeUser({ role: 'AM', totpEnabled: false, tenantId: null })
    );
    await expect(
      useCase.execute({ email: 'test@example.com', password: 'ValidPass1!' })
    ).rejects.toThrow(TotpSetupRequiredError);
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
});
