import type { AuthContext, UserRole } from '@properfy/shared';
import { ForbiddenError } from './errors';

/**
 * How a role's reads are confined.
 *
 * - `cross-tenant` — legitimately sees every tenant; no `tenant_id` predicate.
 * - `tenant-pinned` — confined to `actor.tenantId`, which must be present.
 * - `other-key` — confined by something that is not the tenant: `INSP` by
 *   `inspectorId`, `TNT` by its portal token. Their JWTs carry
 *   `tenantId: null` **by design** (`create-inspector.use-case.ts` builds INSP
 *   users with `tenantId: null`, and `create-user` refuses to create them at
 *   all), so treating them as pinned would 403 every inspector, and treating
 *   them as cross-tenant would hand them every tenant's rows. Neither is
 *   right — a tenant-dispatching read path must not be reached by them.
 */
type TenantScopeKind = 'cross-tenant' | 'tenant-pinned' | 'other-key';

/**
 * Exhaustive by construction: `Record<UserRole, …>` will not compile until a
 * newly added role is classified here, so no role can slip through to a
 * default. That matters because the default this helper exists to prevent is
 * "no tenant predicate", i.e. maximum exposure.
 */
const ROLE_TENANT_SCOPE: Record<UserRole, TenantScopeKind> = {
  AM: 'cross-tenant',
  OP: 'cross-tenant',
  SYS: 'cross-tenant',
  CL_ADMIN: 'tenant-pinned',
  CL_USER: 'tenant-pinned',
  INSP: 'other-key',
  TNT: 'other-key',
};

/**
 * The tenant an actor is confined to, or a throw when it is missing.
 *
 * For callers that have **already branched on role** and know they are inside a
 * tenant-pinned path. Returns a non-optional `string` so the value cannot be
 * assigned into an optional filter field and silently become "unfiltered".
 *
 * @throws ForbiddenError when the actor has no tenant.
 */
export function assertTenantScope(actor: AuthContext, action: string): string {
  if (!actor.tenantId) {
    throw new ForbiddenError(
      'TENANT_SCOPE_REQUIRED',
      `Cannot perform ${action}: this account is not linked to an agency.`,
    );
  }
  return actor.tenantId;
}

/**
 * Resolves the tenant predicate for a read path that dispatches on role.
 *
 * Returns `undefined` for cross-tenant roles (meaning "no predicate", which is
 * correct for them) and the tenant for pinned roles, throwing when a pinned
 * actor has none.
 *
 * Why this cannot live in the repository: every `buildWhere` applies the
 * predicate behind a truthiness check — `if (filters.tenantId) …`,
 * `tenantId ? { tenant_id } : {}` — so "no tenant" means "no filter", and a
 * pinned actor arriving without one would receive the full cross-tenant set.
 * The repository sees only filters and cannot tell that apart from a
 * legitimately unscoped AM/OP listing; the role lives in the caller.
 *
 * @throws ForbiddenError when a tenant-pinned actor has no tenant.
 * @throws Error when called on a path an `other-key` role can reach — that is
 *   a wiring mistake, not an authorization outcome, and must not be papered
 *   over by returning `undefined` (a leak) or a 403 (a lie).
 */
export function requireTenantScope(actor: AuthContext, action: string): string | undefined {
  const kind = ROLE_TENANT_SCOPE[actor.role];

  if (kind === 'cross-tenant') return undefined;

  if (kind === 'other-key') {
    throw new Error(
      `requireTenantScope called for ${actor.role} on "${action}". ${actor.role} is not ` +
        'scoped by tenant — scope the query by its own key (inspectorId / portal token) ' +
        'instead of reaching for a tenant predicate.',
    );
  }

  return assertTenantScope(actor, action);
}
