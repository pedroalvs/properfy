import type { AuthContext } from '@properfy/shared';
import { requireTenantScope } from '../../../shared/domain/require-tenant-scope';

/**
 * Roles allowed to read the appointments list and everything derived from it
 * (the list itself, its distinct suburbs, its XLSX export). INSP is excluded —
 * inspectors read their own schedule through `findVisibleForInspector`, which
 * applies the T-1 visibility rule.
 */
export const APPOINTMENT_LIST_ROLES = ['AM', 'OP', 'CL_ADMIN', 'CL_USER'] as const;

/**
 * Resolve which tenant a list-style appointment read is scoped to.
 *
 * Cross-tenant roles (AM/OP) get `requestedTenantId`, so `?tenantId=` narrows
 * their result set. Tenant-pinned roles get their JWT tenant and whatever they
 * passed is ignored — defense in depth, so a crafted `?tenantId=` can never
 * widen scope.
 *
 * Delegates the role classification to `requireTenantScope`, which **throws**
 * for a pinned actor carrying no tenant instead of returning `undefined`. That
 * distinction is the whole point: `buildWhere` applies `tenant_id` behind a
 * truthiness check, so `undefined` means "no predicate" — a pinned actor
 * arriving without a tenant would otherwise receive every agency's rows. It
 * also refuses roles scoped by something other than tenant (INSP/TNT), which
 * would be a wiring mistake on these paths.
 *
 * Shared by the list, suburbs and export use cases so the three can never drift
 * apart; a divergence here is a cross-tenant leak, not a cosmetic bug.
 */
export function resolveAppointmentListTenantScope(
  actor: AuthContext,
  requestedTenantId?: string,
): string | undefined {
  // undefined only for cross-tenant roles; pinned roles either return their own
  // tenant or throw, so the `??` can never widen a pinned actor's scope.
  return requireTenantScope(actor, 'appointment.list') ?? requestedTenantId;
}
