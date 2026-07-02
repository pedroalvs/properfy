import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../shared/domain/errors';

/**
 * 031 — Fail-closed tenant scope for an Agency (CL_ADMIN / CL_USER) actor.
 *
 * Returns the actor's `tenantId`, or throws `TENANT_SCOPE_REQUIRED` when it is
 * missing — an agency financial read must never fall back to an unscoped
 * (cross-tenant) query. Call only inside a CL_ADMIN/CL_USER branch.
 *
 * Single source of truth so this security invariant can't drift between the
 * extrato, summary and export use cases.
 */
export function requireAgencyTenantScope(actor: AuthContext): string {
  if (!actor.tenantId) {
    throw new ForbiddenError('TENANT_SCOPE_REQUIRED', 'Agency financial access requires a tenant scope');
  }
  return actor.tenantId;
}
