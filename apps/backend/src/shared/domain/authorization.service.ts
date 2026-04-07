import type { AuthContext } from '@properfy/shared';
import type { ClUserPermission } from '@properfy/shared';
import { ForbiddenError } from './errors';

export class AuthorizationService {
  /**
   * Asserts that a CL_USER has a specific permission.
   * No-op for non-CL_USER roles (they are governed by role-level RBAC, not flags).
   */
  assertClUserPermission(
    authContext: AuthContext,
    permission: ClUserPermission,
  ): void {
    if (authContext.role !== 'CL_USER') return;

    const permissions = authContext.clUserPermissions ?? [];
    if (!permissions.includes(permission)) {
      throw new ForbiddenError(
        'FORBIDDEN',
        `CL_USER does not have ${permission} permission`,
      );
    }
  }
}
