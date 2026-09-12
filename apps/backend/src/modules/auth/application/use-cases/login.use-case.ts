import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import type { IUserRepository } from '../../domain/user.repository';
import type { ISessionRepository } from '../../domain/session.repository';
import type { JwtService } from '../services/jwt.service';
import type { TotpService } from '../services/totp.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { ITotpEncryptionService } from '../ports/totp-encryption.port';
import type { SessionTrustService } from '../services/session-trust.service';
import type { LoginInput, LoginOutput } from '../dtos/login.dto';
import {
  InvalidCredentialsError,
  UserInactiveError,
  AccountLockedError,
  TotpRequiredError,
  TotpInvalidError,
} from '../../domain/auth.errors';

// Dummy hash for constant-time comparison when user is not found (prevents email enumeration)
const DUMMY_HASH = '$2a$12$LNqNXjZxQRf8R5k7uT2zReGXmHNK5BkV5T5f0a8WSAB8X5k7eTEKi';

const FAILED_LOGIN_LOCK_THRESHOLD = 5;
const FAILED_LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;

// Correlation token for the anonymous login-failure audit trail. A truncated
// SHA-256 of the normalized email lets ops group repeated attempts on the same
// address WITHOUT persisting the raw address (PII) in the audit log (#239).
function hashEmailForAudit(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
}

export class LoginUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly sessionRepo: ISessionRepository,
    private readonly jwtService: JwtService,
    private readonly totpService: TotpService,
    private readonly auditService: AuditService,
    private readonly inspectorRepo: IInspectorRepository,
    private readonly totpEncryptionService: ITotpEncryptionService,
    private readonly sessionTrustService?: SessionTrustService,
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
        metadata: { reason: 'INVALID_CREDENTIALS', emailHash: hashEmailForAudit(input.email) },
      });
      throw new InvalidCredentialsError();
    }

    // Auto-unlock if the lock has expired. Runs before the password check, but
    // it produces no caller-visible output — no status oracle.
    if (user.isLockExpired()) {
      await this.userRepo.resetFailedLogin(user.id);
      user.status = 'ACTIVE';
      user.failedLoginCount = 0;
      user.lockedUntil = null;
    }

    // Verify the password FIRST. The account-status branches (inactive / locked)
    // run only after a correct password, so a wrong password on an inactive or
    // locked account is byte-for-byte indistinguishable from a wrong password on
    // an active one (#250) — no account-status enumeration for an
    // unauthenticated caller.
    const passwordMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatch) {
      // Atomic increment-and-maybe-lock; the lock decision is the database's,
      // derived from the freshly-incremented value (#246). Increment happens
      // regardless of current status, matching prior behaviour.
      const lockState = await this.userRepo.incrementFailedLogin(
        user.id,
        FAILED_LOGIN_LOCK_THRESHOLD,
        FAILED_LOGIN_LOCK_DURATION_MS,
      );

      // Audit the lock only on the transition into LOCKED (the DB says LOCKED
      // and the account was not already locked when we loaded it).
      if (lockState.status === 'LOCKED' && user.status !== 'LOCKED') {
        this.auditService.log({
          action: 'auth.account_locked',
          actorType: 'SYSTEM',
          entityType: 'USER',
          entityId: user.id,
          ipAddress: input.ipAddress,
          metadata: { lockedUntil: lockState.lockedUntil?.toISOString() },
        });
      }

      this.auditService.log({
        action: 'auth.login_failed',
        actorType: 'ANONYMOUS',
        entityType: 'USER',
        entityId: user.id,
        ipAddress: input.ipAddress,
        metadata: { reason: 'INVALID_CREDENTIALS', failedCount: lockState.failedLoginCount },
      });

      throw new InvalidCredentialsError();
    }

    // Password is correct — only now enforce account status.
    if (user.isInactive() || user.isPendingInvite()) {
      throw new UserInactiveError();
    }

    if (user.isLocked()) {
      throw new AccountLockedError(
        Math.max(0, Math.ceil((user.lockedUntil!.getTime() - Date.now()) / 1000)),
      );
    }

    // Evaluate trust signals (when service is available)
    const trustSignal = this.sessionTrustService
      ? await this.sessionTrustService.evaluate(user.id, input.ipAddress, input.userAgent)
      : null;

    // TOTP checks for AM
    if (user.requiresTotpSetup()) {
      // Issue a limited session so the user can access 2FA setup endpoints
      await this.userRepo.updateLoginSuccess(user.id, new Date());

      const rawRefreshToken = randomBytes(48).toString('hex');
      const refreshTokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');

      const session = await this.sessionRepo.create({
        id: crypto.randomUUID(),
        userId: user.id,
        refreshTokenHash,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        countryCode: trustSignal?.countryCode ?? null,
        deviceFingerprint: trustSignal?.deviceFingerprint ?? null,
        authStage: 'totp_setup',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes for setup only
        revokedAt: null,
        createdAt: new Date(),
      });

      const accessToken = await this.jwtService.signAccessToken({
        sub: user.id,
        tenant_id: user.tenantId,
        role: user.role,
        branch_id: user.branchId,
        inspector_id: null,
        auth_stage: 'totp_setup',
      });

      this.auditService.log({
        action: 'auth.login_totp_setup',
        actorType: 'USER',
        actorId: user.id,
        entityType: 'USER',
        entityId: user.id,
        tenantId: user.tenantId ?? undefined,
        ipAddress: input.ipAddress,
        metadata: { sessionId: session.id, totpSetupRequired: true },
      });

      return {
        accessToken,
        refreshToken: rawRefreshToken,
        totpSetupRequired: true,
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

    // Step-up auth: require TOTP when trust signals detect anomaly AND user has TOTP enabled
    const needsStepUp = trustSignal?.requiresStepUp && user.totpEnabled;
    if (user.requiresTotpCode() || needsStepUp) {
      if (!input.totpCode) {
        throw new TotpRequiredError();
      }
      if (!user.totpSecret) {
        throw new TotpInvalidError();
      }
      const decryptedSecret = this.totpEncryptionService.decrypt(user.totpSecret);
      if (!this.totpService.verify(input.totpCode, decryptedSecret)) {
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
      countryCode: trustSignal?.countryCode ?? null,
      deviceFingerprint: trustSignal?.deviceFingerprint ?? null,
      authStage: null,
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      revokedAt: null,
      createdAt: new Date(),
    });

    // Audit anomalous login signals
    if (trustSignal && (trustSignal.isNewCountry || trustSignal.isNewDevice)) {
      this.auditService.log({
        action: 'auth.login_anomaly',
        actorType: 'SYSTEM',
        actorId: user.id,
        entityType: 'USER',
        entityId: user.id,
        tenantId: user.tenantId ?? undefined,
        ipAddress: input.ipAddress,
        metadata: {
          isNewCountry: trustSignal.isNewCountry,
          isNewDevice: trustSignal.isNewDevice,
          requiresStepUp: trustSignal.requiresStepUp,
          countryCode: trustSignal.countryCode,
          deviceFingerprint: trustSignal.deviceFingerprint,
          sessionId: session.id,
        },
      });
    }

    let inspectorId: string | null = null;
    if (user.role === 'INSP') {
      const inspector = await this.inspectorRepo.findByUserId(user.id);
      inspectorId = inspector?.id ?? null;
    }

    const accessToken = await this.jwtService.signAccessToken({
      sub: user.id,
      tenant_id: user.tenantId,
      role: user.role,
      branch_id: user.branchId,
      inspector_id: inspectorId,
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
