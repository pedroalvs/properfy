import type { AuthContext } from '@properfy/shared';
import type { ClUserPermission } from '@properfy/shared';
import type { UserRole } from '@properfy/shared';
import type { AuditService } from '../infrastructure/audit';
import { ForbiddenError } from './errors';

export interface AuthorizationContext {
  action: string;
  entityType: string;
  entityId?: string;
}

export interface TenantSettingContext {
  actor: AuthContext;
  action: string;
  entityType: string;
}

/** Roles that CL_ADMIN can create (client-scoped roles only) */
const CL_ADMIN_CREATABLE_ROLES: UserRole[] = ['CL_ADMIN', 'CL_USER'];

/** Roles that OP can create (client-scoped roles only) */
const OP_CREATABLE_ROLES: UserRole[] = ['CL_ADMIN', 'CL_USER'];

export class AuthorizationService {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Asserts the actor's role is in the allowed set.
   * Logs audit and throws ForbiddenError on denial.
   */
  assertRoles(
    actor: AuthContext,
    allowedRoles: UserRole[],
    context: AuthorizationContext,
  ): void {
    if (allowedRoles.includes(actor.role)) return;

    this.auditService.log({
      action: 'authorization.denied',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: context.entityType,
      entityId: context.entityId,
      tenantId: actor.tenantId ?? undefined,
      metadata: {
        attemptedAction: context.action,
        requiredRoles: allowedRoles,
        actualRole: actor.role,
      },
    });

    throw new ForbiddenError(
      'FORBIDDEN',
      `Role ${actor.role} is not permitted to perform ${context.action}`,
    );
  }

  /**
   * Asserts the actor can access data in the target tenant.
   * AM bypasses (global scope). All other roles — including OP per
   * Sprint 1 W-4-IMPL (CORRECTION-001 close-it, 2026-04-13) — must match.
   */
  assertTenantScope(
    actor: AuthContext,
    targetTenantId: string,
    context: AuthorizationContext,
  ): void {
    if (actor.role === 'AM') return;
    if (actor.tenantId === targetTenantId) return;

    this.auditService.log({
      action: 'authorization.denied',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: context.entityType,
      entityId: context.entityId,
      tenantId: actor.tenantId ?? undefined,
      metadata: {
        attemptedAction: context.action,
        reason: 'TENANT_SCOPE_VIOLATION',
        targetTenantId,
      },
    });

    throw new ForbiddenError(
      'TENANT_SCOPE_VIOLATION',
      'Cross-tenant access is forbidden',
    );
  }

  /**
   * Prevents an actor from approving their own work.
   */
  assertNotSelfApproval(
    actorUserId: string,
    originatorUserId: string,
    context: AuthorizationContext,
  ): void {
    if (actorUserId !== originatorUserId) return;

    this.auditService.log({
      action: 'authorization.denied',
      actorType: 'USER',
      actorId: actorUserId,
      entityType: context.entityType,
      entityId: context.entityId,
      metadata: {
        attemptedAction: context.action,
        reason: 'SELF_APPROVAL_FORBIDDEN',
      },
    });

    throw new ForbiddenError(
      'SELF_APPROVAL_FORBIDDEN',
      'Cannot approve your own work',
    );
  }

  /**
   * Asserts a tenant setting is enabled.
   * Used for CL_ADMIN conditional capabilities (e.g., allowClientUserManagement).
   */
  assertTenantSetting(
    tenantSettings: Record<string, unknown>,
    settingKey: string,
    context: TenantSettingContext,
  ): void {
    if (tenantSettings[settingKey]) return;

    this.auditService.log({
      action: 'authorization.denied',
      actorType: 'USER',
      actorId: context.actor.userId,
      entityType: context.entityType,
      tenantId: context.actor.tenantId ?? undefined,
      metadata: {
        attemptedAction: context.action,
        reason: 'TENANT_SETTING_DISABLED',
        settingKey,
      },
    });

    throw new ForbiddenError(
      'TENANT_SETTING_DISABLED',
      `Tenant setting '${settingKey}' is not enabled`,
    );
  }

  /**
   * Prevents vertical privilege escalation on user creation/update.
   * Each role can only create roles at or below its own tier.
   */
  assertNoPrivilegeEscalation(
    actor: AuthContext,
    targetRole: UserRole,
  ): void {
    // AM can create any role
    if (actor.role === 'AM') return;

    // OP can create client-scoped roles only
    if (actor.role === 'OP' && OP_CREATABLE_ROLES.includes(targetRole)) return;

    // CL_ADMIN can create client-scoped roles only
    if (actor.role === 'CL_ADMIN' && CL_ADMIN_CREATABLE_ROLES.includes(targetRole)) return;

    // All other combinations are escalation
    this.auditService.log({
      action: 'authorization.denied',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'User',
      tenantId: actor.tenantId ?? undefined,
      metadata: {
        attemptedAction: 'user.create',
        reason: 'PRIVILEGE_ESCALATION',
        actorRole: actor.role,
        targetRole,
      },
    });

    throw new ForbiddenError(
      'PRIVILEGE_ESCALATION',
      `Role ${actor.role} cannot create users with role ${targetRole}`,
    );
  }

  /**
   * Asserts that a CL_USER has a specific permission flag.
   * No-op for non-CL_USER roles (they are governed by role-level RBAC, not flags).
   * Logs audit on denial.
   */
  assertClUserPermission(
    authContext: AuthContext,
    permission: ClUserPermission,
  ): void {
    if (authContext.role !== 'CL_USER') return;

    const permissions = authContext.clUserPermissions ?? [];
    if (permissions.includes(permission)) return;

    this.auditService.log({
      action: 'authorization.denied',
      actorType: 'USER',
      actorId: authContext.userId,
      entityType: 'Permission',
      tenantId: authContext.tenantId ?? undefined,
      metadata: {
        attemptedAction: 'cl_user_permission_check',
        missingPermission: permission,
      },
    });

    throw new ForbiddenError(
      'FORBIDDEN',
      `CL_USER does not have ${permission} permission`,
    );
  }
}
