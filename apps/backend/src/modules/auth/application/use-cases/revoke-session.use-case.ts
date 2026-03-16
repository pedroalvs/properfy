import type { ISessionRepository } from '../../domain/session.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { SessionNotFoundError } from '../../domain/auth.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface RevokeSessionInput {
  sessionId: string;
  actorId: string;
  actorRole: string;
}

export class RevokeSessionUseCase {
  constructor(
    private readonly sessionRepo: ISessionRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: RevokeSessionInput): Promise<void> {
    const session = await this.sessionRepo.findById(input.sessionId);
    if (!session) {
      throw new SessionNotFoundError();
    }

    if (input.actorRole !== 'AM' && session.userId !== input.actorId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    await this.sessionRepo.revoke(input.sessionId, new Date());

    this.auditService.log({
      action: 'auth.session_revoked',
      actorType: 'USER',
      actorId: input.actorId,
      entityType: 'SESSION',
      entityId: input.sessionId,
      metadata: {
        targetUserId: session.userId,
        reason: 'MANUAL_REVOKE',
      },
    });
  }
}
