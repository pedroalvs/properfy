import { createHash, randomBytes } from 'crypto';
import type { IUserRepository } from '../../domain/user.repository';
import type { ISessionRepository } from '../../domain/session.repository';
import type { JwtService } from '../services/jwt.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { RefreshInput, RefreshOutput } from '../dtos/refresh.dto';
import { InvalidRefreshTokenError, SessionInvalidError, SessionRefreshRateLimitError } from '../../domain/auth.errors';
import { SlidingWindowRateLimiter } from '../../../../shared/infrastructure/sliding-window-rate-limiter';

const SESSION_REFRESH_RATE_LIMITER = new SlidingWindowRateLimiter({
  maxRequests: 10,
  windowMs: 5 * 60 * 1000, // 5 minutes
});

export class RefreshTokenUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly sessionRepo: ISessionRepository,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly inspectorRepo: IInspectorRepository,
    private readonly sessionRateLimiter: SlidingWindowRateLimiter = SESSION_REFRESH_RATE_LIMITER,
  ) {}

  async execute(input: RefreshInput): Promise<RefreshOutput> {
    const hash = createHash('sha256').update(input.refreshToken).digest('hex');
    const session = await this.sessionRepo.findByRefreshTokenHash(hash);

    if (!session || !session.isValid()) {
      throw new InvalidRefreshTokenError();
    }

    // Per-session refresh rate limit: 10 requests per 5 minutes
    const rateLimitResult = this.sessionRateLimiter.check(session.id);
    if (!rateLimitResult.allowed) {
      throw new SessionRefreshRateLimitError(rateLimitResult.retryAfterMs!);
    }

    const user = await this.userRepo.findById(session.userId);
    if (!user || user.isDeleted() || user.isInactive() || user.isLocked()) {
      await this.sessionRepo.revoke(session.id, new Date());
      throw new SessionInvalidError();
    }

    const newRawToken = randomBytes(48).toString('hex');
    const newHash = createHash('sha256').update(newRawToken).digest('hex');
    const newExpiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    await this.sessionRepo.updateRefreshToken(session.id, newHash, newExpiresAt);

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
      action: 'auth.refresh',
      actorType: 'USER',
      actorId: user.id,
      entityType: 'SESSION',
      entityId: session.id,
      tenantId: user.tenantId ?? undefined,
    });

    return { accessToken, refreshToken: newRawToken };
  }
}
