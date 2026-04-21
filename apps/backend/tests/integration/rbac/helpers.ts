import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';

// ── Auth context factories ────────────────────────────────────────────────────

export function makeAmContext(): AuthContext {
  return {
    userId: 'am-user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
  };
}

export function makeOpContext(): AuthContext {
  return {
    userId: 'op-user-1',
    tenantId: null,
    role: 'OP',
    branchId: null,
    inspectorId: null,
  };
}

export function makeClAdminContext(tenantId: string): AuthContext {
  return {
    userId: 'cl-admin-1',
    tenantId,
    role: 'CL_ADMIN',
    branchId: null,
    inspectorId: null,
  };
}

export function makeClUserContext(tenantId: string, permissions: string[] = []): AuthContext {
  return {
    userId: 'cl-user-1',
    tenantId,
    role: 'CL_USER',
    branchId: null,
    inspectorId: null,
    clUserPermissions: permissions,
  };
}

// ── Forbidden error factory ───────────────────────────────────────────────────

export function forbiddenFor(allowedRoles: string[]) {
  return (input: { actor?: AuthContext }): never => {
    const role = input?.actor?.role ?? 'UNKNOWN';
    if (!allowedRoles.includes(role)) {
      throw new ForbiddenError('FORBIDDEN', `Role ${role} is not permitted`);
    }
    throw new Error('Should not reach here — use mockResolvedValue for allowed paths');
  };
}

/**
 * Returns a mock implementation that throws ForbiddenError for the given actor.
 * Use this in mockImplementation when you want to simulate a denied call.
 */
export function throwForbidden(): never {
  throw new ForbiddenError('FORBIDDEN', 'Insufficient permissions');
}
