import type { FastifyReply, FastifyRequest } from 'fastify';

import { ForbiddenError } from '../domain/errors';

/**
 * preHandler that gates a route on an API-key scope. Scopes exist only on
 * machine principals (X-API-Key auth); JWT principals never carry them, so
 * scoped routes are machine-only by construction. Runs after an auth
 * preHandler has populated request.authContext.
 */
export function requireScope(
  scope: string,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function assertScope(request): Promise<void> {
    const scopes = request.authContext?.scopes;
    if (!scopes?.includes(scope)) {
      throw new ForbiddenError('AUTH_FORBIDDEN_SCOPE', `This route requires the '${scope}' scope`);
    }
  };
}
