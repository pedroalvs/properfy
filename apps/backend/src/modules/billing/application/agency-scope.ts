import type { AuthContext } from '@properfy/shared';
import { assertTenantScope } from '../../../shared/domain/require-tenant-scope';

/**
 * 031 — Fail-closed tenant scope for an Agency (CL_ADMIN / CL_USER) actor.
 *
 * Returns the actor's `tenantId`, or throws `TENANT_SCOPE_REQUIRED` when it is
 * missing — an agency financial read must never fall back to an unscoped
 * (cross-tenant) query. Call only inside a CL_ADMIN/CL_USER branch.
 *
 * Delegates to the shared `assertTenantScope`, which enforces the same
 * invariant for every other module. Two implementations of one security rule
 * is how the rule drifts; this stays as the billing-facing name so the 031
 * call sites keep reading in their own vocabulary.
 */
export function requireAgencyTenantScope(actor: AuthContext): string {
  return assertTenantScope(actor, 'agency financial access');
}
