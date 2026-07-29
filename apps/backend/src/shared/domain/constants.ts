import type { AuthContext } from '@properfy/shared';

export const SYSTEM_USER_ID = 'SYSTEM';

/**
 * The actor automated flows (scheduled sweeps, jobs) present when they go through
 * a use case that requires an `AuthContext`. Spread it and set `tenantId` to the
 * record's own tenant — `SYS` is not tenant-global the way `AM` is.
 *
 * Typed as `AuthContext` so it cannot drift out of shape again: it was previously
 * unused and had grown to be missing two required fields.
 */
export const SYSTEM_ACTOR: AuthContext = {
  userId: SYSTEM_USER_ID,
  role: 'SYS',
  tenantId: null,
  branchId: null,
  inspectorId: null,
};
