import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../shared/domain/errors';

/**
 * Resolve the tenant scope for property queries — AM and OP are both
 * cross-tenant (their JWT carries tenantId: null, and the request's tenantId
 * filter narrows). CL roles are pinned to their JWT tenantId. Mirrors the
 * appointment use case's fix for the same bug class (Bug C-B2): coercing a
 * null actor.tenantId via `!` for OP silently dropped the tenant filter and
 * returned the full cross-tenant set.
 *
 * CL roles fail closed on a missing tenantId rather than falling back to an
 * unscoped query: a CL JWT without a tenantId indicates an auth bug, and an
 * unscoped fallback would turn that bug into a cross-tenant leak
 * (CLAUDE.md §7: "no business query without tenant scope").
 */
export function resolveTenantScope(
  actor: AuthContext,
  requestedTenantId: string | undefined,
): string | undefined {
  if (actor.role === 'AM' || actor.role === 'OP') {
    return requestedTenantId;
  }
  if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
    if (!actor.tenantId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }
    return actor.tenantId;
  }
  throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
}
