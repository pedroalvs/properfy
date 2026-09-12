import { randomBytes, createHash, randomUUID } from 'node:crypto';
import type { IUserRepository } from '../../domain/user.repository';
import type { IPasswordResetTokenRepository } from '../../domain/password-reset-token.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { CreateNotificationUseCase } from '../../../notification/application/use-cases/create-notification.use-case';
import { PasswordResetTokenEntity } from '../../domain/password-reset-token.entity';
import { SlidingWindowRateLimiter } from '../../../../shared/infrastructure/sliding-window-rate-limiter';

const RATE_LIMIT_WINDOW_MINUTES = 60;
const RATE_LIMIT_MAX_REQUESTS = 3;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Keyed by NORMALIZED email and checked BEFORE any user lookup, so a
// rate-limited request is byte-identical to the unknown-email path — no
// account-existence or throttle oracle (#228).
const EMAIL_RESET_RATE_LIMITER = new SlidingWindowRateLimiter({
  maxRequests: RATE_LIMIT_MAX_REQUESTS,
  windowMs: RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
});

/**
 * Deterministic notification id derived from the reset token id. A duplicate
 * enqueue of the SAME token dedups (saveIfAbsent), but a retried request that
 * minted a NEW token still sends — the idempotency key tracks the token, not
 * the request (#255).
 */
function resetNotificationId(tokenId: string): string {
  return `pwreset-${createHash('sha256').update(tokenId).digest('hex').slice(0, 32)}`;
}

export interface RequestPasswordResetInput {
  email: string;
  /** Correlates the request across notification + audit; threaded from the route. */
  requestId: string;
}

export interface ResetLinkConfig {
  webAppBaseUrl: string;
  pwaBaseUrl: string;
}

export class RequestPasswordResetUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly passwordResetTokenRepo: IPasswordResetTokenRepository,
    private readonly createNotificationUseCase: CreateNotificationUseCase,
    private readonly auditService: AuditService,
    private readonly resetLinkConfig: ResetLinkConfig,
    private readonly emailRateLimiter: SlidingWindowRateLimiter = EMAIL_RESET_RATE_LIMITER,
  ) {}

  async execute(input: RequestPasswordResetInput): Promise<void> {
    // #228: throttle BEFORE any user lookup, keyed by the normalized email, so a
    // rate-limited request is byte-identical to the unknown-email path — no
    // account-existence or throttle oracle. On trip we return the same silent
    // void as every other non-send path (the route always answers 204).
    const normalizedEmail = input.email.trim().toLowerCase();
    if (!this.emailRateLimiter.check(normalizedEmail).allowed) {
      return;
    }

    const user = await this.userRepo.findByEmail(input.email);

    if (!user || !user.isActive()) {
      return;
    }

    // DB-backed backstop for the in-memory limiter (survives process restarts).
    // Its trip is ALSO silent — never a distinguishable throw (#228).
    const recentCount = await this.passwordResetTokenRepo.countRecentByUserId(
      user.id,
      RATE_LIMIT_WINDOW_MINUTES,
    );
    if (recentCount >= RATE_LIMIT_MAX_REQUESTS) {
      return;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

    const tokenEntity = new PasswordResetTokenEntity({
      id: randomUUID(),
      userId: user.id,
      tokenHash,
      expiresAt,
      usedAt: null,
      createdAt: now,
    });

    await this.passwordResetTokenRepo.save(tokenEntity);

    // Inspectors only have access to the PWA; everyone else uses the web app.
    const baseUrl =
      user.role === 'INSP' ? this.resetLinkConfig.pwaBaseUrl : this.resetLinkConfig.webAppBaseUrl;
    const resetLink = new URL('/reset-password', baseUrl);
    resetLink.searchParams.set('token', rawToken);

    await this.createNotificationUseCase.execute({
      // Deterministic idempotency key derived from the token id: a duplicate
      // enqueue of the same token dedups, but a retried request that minted a
      // NEW token still sends (#255).
      notificationId: resetNotificationId(tokenEntity.id),
      // AM, OP and INSP users belong to no agency: the notification is
      // platform-scoped (tenant_id NULL), not owned by some placeholder tenant.
      tenantId: user.tenantId,
      recipient: user.email,
      channel: 'EMAIL',
      templateCode: 'PASSWORD_RESET',
      payloadJson: {
        userName: user.name,
        resetLink: resetLink.toString(),
      },
    });

    this.auditService.log({
      action: 'auth.password_reset_requested',
      actorType: 'ANONYMOUS',
      entityType: 'User',
      entityId: user.id,
      requestId: input.requestId,
    });
  }
}
