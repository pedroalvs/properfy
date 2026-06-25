import type { ISessionRepository } from '../../domain/session.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface LogoutInput {
  userId: string;
  sessionId?: string;
}

export class LogoutUseCase {
  constructor(
    private readonly sessionRepo: ISessionRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    const now = new Date();

    if (input.sessionId) {
      const session = await this.sessionRepo.findById(input.sessionId);
      if (session && !session.isRevoked()) {
        await this.sessionRepo.revoke(input.sessionId, now);
      }
    } else {
      await this.sessionRepo.revokeAllForUser(input.userId, now);
    }

    this.auditService.log({
      action: 'auth.logout',
      actorType: 'USER',
      actorId: input.userId,
      entityType: input.sessionId ? 'SESSION' : 'USER',
      entityId: input.sessionId ?? input.userId,
      metadata: { scope: input.sessionId ? 'single_session' : 'all_sessions' },
    });
  }
}
