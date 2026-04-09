import type { UserRole } from '@properfy/shared';
import { can, getMatrixEntry } from '@properfy/shared';

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
