import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../src/shared/domain/errors';

// ── Auth context factories ────────────────────────────────────────────────────

export function makeAmContext(userId = 'am-user-1'): AuthContext {
  return {
    userId,
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
  };
}

export function makeOpContext(userId = 'op-user-1'): AuthContext {
  return {
    userId,
    tenantId: null,
    role: 'OP',
    branchId: null,
    inspectorId: null,
  };
}

export function makeClAdminContext(tenantId: string, userId = 'cl-admin-1'): AuthContext {
  return {
    userId,
    tenantId,
    role: 'CL_ADMIN',
    branchId: null,
    inspectorId: null,
  };
}

export function makeClUserContext(
  tenantId: string,
  permissions: string[] = [],
  userId = 'cl-user-1',
): AuthContext {
  return {
    userId,
    tenantId,
    role: 'CL_USER',
    branchId: null,
    inspectorId: null,
    clUserPermissions: permissions,
  };
}

export function makeInspContext(inspectorId = 'insp-profile-1', userId = 'insp-user-1'): AuthContext {
  return {
    userId,
    tenantId: null,
    role: 'INSP',
    branchId: null,
    inspectorId,
  };
}

// ── ForbiddenError factory ─────────────────────────────────────────────────────

export function forbidden(): never {
  throw new ForbiddenError('FORBIDDEN', 'Insufficient permissions');
}

export function forbiddenPrivilegeEscalation(actorRole: string, targetRole: string): never {
  throw new ForbiddenError(
    'PRIVILEGE_ESCALATION',
    `Role ${actorRole} cannot create users with role ${targetRole}`,
  );
}

export function forbiddenSelfApproval(): never {
  throw new ForbiddenError('SELF_APPROVAL_FORBIDDEN', 'Cannot approve your own work');
}

export function forbiddenTenantSetting(settingKey: string): never {
  throw new ForbiddenError('TENANT_SETTING_DISABLED', `Tenant setting '${settingKey}' is not enabled`);
}
