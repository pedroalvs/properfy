import { useMemo } from 'react';
import type { UserRole } from '@properfy/shared';
import { can } from '@properfy/shared';
import { useAuth } from '@/hooks/useAuth';

export interface UsePermissionsResult {
  /** The current user's role, or null if not authenticated */
  role: UserRole | null;
  /** Check if the user's role is in the given set */
  hasRole: (...roles: UserRole[]) => boolean;
  /** Check if the user can perform an action (per the shared role matrix) */
  canPerform: (action: string) => boolean;
  /**
   * Check whether the user holds a CL_USER permission flag (e.g. `view_financials`).
   * Non-CL_USER roles are unconditional (returns true) — the flag only gates CL_USER,
   * mirroring the server-side `assertClUserPermission`.
   */
  hasClUserFlag: (flag: string) => boolean;
}

/**
 * Hook that provides role-based permission checks using the shared ROLE_ACTION_MATRIX.
 *
 * Usage:
 *   const { canPerform, hasRole } = usePermissions();
 *   if (canPerform('appointment.create')) { ... }
 *   if (hasRole('AM', 'OP')) { ... }
 *
 * NOTE: This checks the base role permission only. CL_USER flag conditions
 * are enforced server-side — the UI uses this for visibility gating (hide, not disable).
 */
export function usePermissions(): UsePermissionsResult {
  const { user } = useAuth();

  const role = (user?.role as UserRole) ?? null;
  const clUserPermissions = user?.clUserPermissions;
  const flagsKey = (clUserPermissions ?? []).join(',');

  return useMemo(
    () => ({
      role,
      hasRole: (...roles: UserRole[]) => role !== null && roles.includes(role),
      canPerform: (action: string) => role !== null && can(role, action),
      hasClUserFlag: (flag: string) =>
        role !== 'CL_USER' ? role !== null : (clUserPermissions ?? []).includes(flag),
    }),
    // clUserPermissions is a stable array from useAuth; flagsKey tracks its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, flagsKey],
  );
}
