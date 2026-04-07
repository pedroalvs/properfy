import { randomBytes, createHash, randomUUID } from 'node:crypto';
import type { IUserRepository } from '../../domain/user.repository';
import type { IPasswordResetTokenRepository } from '../../domain/password-reset-token.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { CreateNotificationUseCase } from '../../../notification/application/use-cases/create-notification.use-case';
import { PasswordResetTokenEntity } from '../../domain/password-reset-token.entity';
import { PasswordResetRateLimitError } from '../../domain/auth.errors';

const RATE_LIMIT_WINDOW_MINUTES = 60;
const RATE_LIMIT_MAX_REQUESTS = 3;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface RequestPasswordResetInput {
  email: string;
}

export class RequestPasswordResetUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly passwordResetTokenRepo: IPasswordResetTokenRepository,
    private readonly createNotificationUseCase: CreateNotificationUseCase,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: RequestPasswordResetInput): Promise<void> {
    const user = await this.userRepo.findByEmail(input.email);

    if (!user || !user.isActive()) {
      return;
    }

    const recentCount = await this.passwordResetTokenRepo.countRecentByUserId(
      user.id,
      RATE_LIMIT_WINDOW_MINUTES,
    );
    if (recentCount >= RATE_LIMIT_MAX_REQUESTS) {
      throw new PasswordResetRateLimitError();
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

    await this.createNotificationUseCase.execute({
      tenantId: user.tenantId ?? 'platform',
      recipient: user.email,
      channel: 'EMAIL',
      templateCode: 'PASSWORD_RESET',
      payloadJson: {
        userName: user.name,
        resetToken: rawToken,
      },
    });

    this.auditService.log({
      action: 'auth.password_reset_requested',
      actorType: 'ANONYMOUS',
      entityType: 'User',
      entityId: user.id,
    });
  }
}
