import type { FastifyRequest } from 'fastify';
import type { UserRole } from '@properfy/shared';
import { ForbiddenError } from '../domain/errors';

/**
 * Fastify preHandler factory that rejects any role outside the allowlist.
 * Compose it after `authenticate` (which populates `request.authContext`):
 *
 *   preHandler: [authenticate, requireRoles(['AM', 'OP'])]
 *
 * The policy (which roles) stays at the call site; this only enforces it.
 * `ForbiddenError` (statusCode 403) is serialized by the global error handler
 * to `{ error: { code: 'FORBIDDEN', message } }`.
 */
export function requireRoles(roles: readonly UserRole[]) {
  return async function authorize(request: FastifyRequest): Promise<void> {
    const role = request.authContext?.role;
    if (!role || !roles.includes(role)) {
      throw new ForbiddenError('FORBIDDEN', 'Insufficient permissions');
    }
  };
}
