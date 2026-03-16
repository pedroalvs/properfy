import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import type { IUserRepository } from '../../domain/user.repository';
import type { ISessionRepository } from '../../domain/session.repository';
import type { JwtService } from '../services/jwt.service';
import type { TotpService } from '../services/totp.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { LoginInput, LoginOutput } from '../dtos/login.dto';
import {
  InvalidCredentialsError,
  UserInactiveError,
  AccountLockedError,
  TotpRequiredError,
  TotpInvalidError,
  TotpSetupRequiredError,
} from '../../domain/auth.errors';

// Dummy hash for constant-time comparison when user is not found (prevents email enumeration)
const DUMMY_HASH = '$2a$12$LNqNXjZxQRf8R5k7uT2zReGXmHNK5BkV5T5f0a8WSAB8X5k7eTEKi';

export class LoginUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly sessionRepo: ISessionRepository,
    private readonly jwtService: JwtService,
    private readonly totpService: TotpService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const user = await this.userRepo.findByEmail(input.email);

    if (!user || user.isDeleted()) {
      // Constant-time comparison to prevent email enumeration timing attacks
      await bcrypt.compare(input.password, DUMMY_HASH);
      this.auditService.log({
        action: 'auth.login_failed',
        actorType: 'ANONYMOUS',
        entityType: 'USER',
        ipAddress: input.ipAddress,
        metadata: { reason: 'INVALID_CREDENTIALS', email: input.email },
      });
      throw new InvalidCredentialsError();
    }

    // Auto-unlock if lock has expired
    if (user.isLockExpired()) {
      await this.userRepo.updateFailedLogin(user.id, 0, null, 'ACTIVE');
      user.status = 'ACTIVE';
      user.failedLoginCount = 0;
      user.lockedUntil = null;
    }

    if (user.isInactive()) {
      throw new UserInactiveError();
    }

    if (user.isLocked()) {
      throw new AccountLockedError(user.lockedUntil!.toISOString());
    }

    const passwordMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatch) {
      const newCount = user.failedLoginCount + 1;
      let newStatus = user.status;
      let newLockedUntil: Date | null = null;

      if (newCount >= 5) {
        newStatus = 'LOCKED';
        newLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        this.auditService.log({
          action: 'auth.account_locked',
          actorType: 'SYSTEM',
          entityType: 'USER',
          entityId: user.id,
          ipAddress: input.ipAddress,
          metadata: { lockedUntil: newLockedUntil.toISOString() },
        });
      }

      await this.userRepo.updateFailedLogin(user.id, newCount, newLockedUntil, newStatus);

      this.auditService.log({
        action: 'auth.login_failed',
        actorType: 'ANONYMOUS',
        entityType: 'USER',
        entityId: user.id,
        ipAddress: input.ipAddress,
        metadata: { reason: 'INVALID_CREDENTIALS', failedCount: newCount },
      });

      throw new InvalidCredentialsError();
    }

    // TOTP checks for AM
    if (user.requiresTotpSetup()) {
      throw new TotpSetupRequiredError();
    }

    if (user.requiresTotpCode()) {
      if (!input.totpCode) {
        throw new TotpRequiredError();
      }
      if (!user.totpSecret || !this.totpService.verify(input.totpCode, user.totpSecret)) {
        throw new TotpInvalidError();
      }
    }

    // Successful login
    await this.userRepo.updateLoginSuccess(user.id, new Date());

    const rawRefreshToken = randomBytes(48).toString('hex');
    const refreshTokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');

    const session = await this.sessionRepo.create({
      id: crypto.randomUUID(),
      userId: user.id,
      refreshTokenHash,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      revokedAt: null,
      createdAt: new Date(),
    });

    const accessToken = await this.jwtService.signAccessToken({
      sub: user.id,
      tenant_id: user.tenantId,
      role: user.role,
      branch_id: user.branchId,
    });

    this.auditService.log({
      action: 'auth.login',
      actorType: 'USER',
      actorId: user.id,
      entityType: 'USER',
      entityId: user.id,
      tenantId: user.tenantId ?? undefined,
      ipAddress: input.ipAddress,
      metadata: { sessionId: session.id },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId,
        totpEnabled: user.totpEnabled,
      },
    };
  }
}
