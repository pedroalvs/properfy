import type { UserRole } from '@properfy/shared';
import { can, getMatrixEntry, ROLE_ACTION_MATRIX } from '@properfy/shared';

/**
 * Check whether a role is permitted to perform an action.
 * Uses the shared ROLE_ACTION_MATRIX as single source of truth.
 *
 * NOTE: This only checks the base role permission. Conditional checks
 * (CL_USER flags, tenant settings) must be resolved at the API level.
 */
export function canPerform(role: string | undefined | null, action: string): boolean {
  if (!role) return false;
  return can(role as UserRole, action);
}

/**
 * Check whether an action requires a CL_USER permission flag.
 * Returns the flag key if so, undefined otherwise.
 */
export function getRequiredClUserFlag(action: string): string | undefined {
  const entry = getMatrixEntry(action);
  if (!entry) return undefined;
  if (entry.condition === 'cl_user_flag') return entry.conditionKey;
  return undefined;
}

/**
 * Human-readable list of the actions a role can perform, derived from the
 * shared ROLE_ACTION_MATRIX. There is no per-user permission store, so a
 * user's capabilities are entirely role-defined; this powers the read-only
 * "Capabilities" row in the user detail drawer. Conditional entries (CL_USER
 * flags / tenant settings) are included as capabilities the role is eligible
 * for. Labels are formatted as "Domain: verb" and returned sorted.
 */
export function getRoleCapabilities(role: string | undefined | null): string[] {
  if (!role) return [];
  return Object.entries(ROLE_ACTION_MATRIX)
    .filter(([, entry]) => entry.roles.includes(role as UserRole))
    .map(([action]) => formatActionLabel(action))
    .sort();
}

function formatActionLabel(action: string): string {
  const [domain = '', verb = ''] = action.split('.');
  const label = domain.charAt(0).toUpperCase() + domain.slice(1);
  return `${label}: ${verb.replace(/_/g, ' ')}`;
}
