import type { AuthContext } from '@properfy/shared';

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
 * AM and OP are both cross-tenant (CLAUDE.md §6): their JWT carries
 * `tenantId: null`, and `requestedTenantId` narrows the result set when given.
 * Tenant-scoped roles are pinned to their JWT tenant and whatever they pass is
 * ignored — defense in depth, so a crafted `?tenantId=` can never widen scope.
 *
 * Shared by the list, suburbs and export use cases so the three can never drift
 * apart; a divergence here is a cross-tenant leak, not a cosmetic bug.
 */
export function resolveAppointmentListTenantScope(
  actor: AuthContext,
  requestedTenantId?: string,
): string | undefined {
  return actor.role === 'AM' || actor.role === 'OP'
    ? requestedTenantId
    : actor.tenantId ?? undefined;
}
