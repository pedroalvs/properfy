import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { ISessionRepository } from '../../domain/session.repository';

export interface ListSessionsInput {
  actor: AuthContext;
}

export interface SessionListItem {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export class ListSessionsUseCase {
  constructor(private readonly sessionRepo: ISessionRepository) {}

  async execute(input: ListSessionsInput): Promise<SessionListItem[]> {
    const { actor } = input;

    if (!actor.userId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const sessions = await this.sessionRepo.findActiveByUserId(actor.userId);

    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      // Real activity: the last refresh-rotation time, falling back to creation
      // for a session that has never been refreshed (#261). No longer fabricated
      // from createdAt.
      lastActiveAt: (session.lastUsedAt ?? session.createdAt).toISOString(),
      createdAt: session.createdAt.toISOString(),
      // Identify the current session by the `sid` carried in the caller's token,
      // not by matching ip/user-agent (which collide behind NAT/shared UAs).
      isCurrent: session.id === actor.sessionId,
    }));
  }
}
