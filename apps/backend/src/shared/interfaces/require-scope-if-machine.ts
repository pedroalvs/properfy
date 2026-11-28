import type { FastifyReply, FastifyRequest } from 'fastify';

import { ForbiddenError } from '../domain/errors';

/** Machine principals get a synthetic `api-key:<id>` userId (see `createApiKeyAuthMiddleware`). */
const MACHINE_PRINCIPAL_PREFIX = 'api-key:';

/**
 * preHandler for routes that must accept BOTH a human JWT and a scoped machine
 * (X-API-Key) principal. Unlike {@link requireScope} — which is unconditional
 * and therefore machine-only — this gate enforces the scope ONLY for machine
 * principals, so a human JWT (which never carries scopes) passes through with
 * its existing RBAC unchanged. A machine key missing the scope is rejected with
 * 403 `AUTH_FORBIDDEN_SCOPE`.
 *
 * Compose it after the api-key-or-JWT middleware has populated
 * `request.authContext`.
 */
export function requireScopeIfMachine(
  scope: string,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function assertScopeIfMachine(request): Promise<void> {
    const ctx = request.authContext;
    const isMachine = ctx?.userId?.startsWith(MACHINE_PRINCIPAL_PREFIX) ?? false;
    if (isMachine && !ctx?.scopes?.includes(scope)) {
      throw new ForbiddenError('AUTH_FORBIDDEN_SCOPE', `This route requires the '${scope}' scope`);
    }
  };
}
