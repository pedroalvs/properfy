import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { ISessionRepository } from '../../domain/session.repository';

export interface ListSessionsInput {
  actor: AuthContext;
  currentIpAddress?: string | null;
  currentUserAgent?: string | null;
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
    const { actor, currentIpAddress, currentUserAgent } = input;

    if (!actor.userId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const sessions = await this.sessionRepo.findActiveByUserId(actor.userId);

    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      lastActiveAt: session.createdAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      isCurrent:
        session.ipAddress === (currentIpAddress ?? null)
        && session.userAgent === (currentUserAgent ?? null),
    }));
  }
}
