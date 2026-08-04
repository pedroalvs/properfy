import type { AuthContext, UserRole } from '@properfy/shared';
import { ForbiddenError } from './errors';

/**
 * Roles whose every query must be confined to one agency. AM and OP are
 * deliberately absent: they are cross-tenant per CLAUDE.md §6 and their JWTs
 * carry `tenantId: null` by design, so "no tenant" is a legitimate state for
 * them and means "all tenants".
 */
const TENANT_PINNED_ROLES: ReadonlyArray<UserRole> = ['CL_ADMIN', 'CL_USER', 'INSP'];

/**
 * Resolves the tenant a pinned actor is confined to, and refuses to proceed
 * when there is none.
 *
 * The repositories all apply the tenant predicate behind a truthiness check —
 * `if (filters.tenantId) where.tenant_id = …`, `tenantId ? { tenant_id } : {}`.
 * That makes "no tenant" mean **no filter at all**, so a pinned actor arriving
 * without one silently receives the full cross-tenant result set: the failure
 * mode of a missing scope is maximum exposure, not zero. Callers used to write
 * `actor.tenantId ?? undefined` (or `actor.tenantId!`) and hand that straight
 * to the repository, which is exactly the shape that unscopes.
 *
 * This cannot be enforced in the repository, because `buildWhere` sees only
 * filters: it has no way to tell a legitimately unscoped AM/OP listing from a
 * pinned actor whose tenant went missing. The role lives in the caller, so the
 * guard belongs here.
 *
 * No API path can currently produce a pinned actor without a tenant —
 * `create-user` rejects an agency user with no agency, `update-user` never
 * writes `tenant_id`, and API keys are restricted to AM/OP — so this is
 * defence in depth against a future path that forgets, or against a row
 * altered outside the application. It fails closed by design: a 403 is a
 * visible bug report, whereas an unscoped list is a silent leak.
 *
 * @throws ForbiddenError when a tenant-pinned role has no tenant.
 */
export function requireTenantScope(actor: AuthContext, action: string): string | undefined {
  if (!TENANT_PINNED_ROLES.includes(actor.role)) return undefined;

  if (!actor.tenantId) {
    throw new ForbiddenError(
      'AUTH_TENANT_SCOPE_MISSING',
      `Cannot perform ${action}: this account is not linked to an agency.`,
    );
  }

  return actor.tenantId;
}
