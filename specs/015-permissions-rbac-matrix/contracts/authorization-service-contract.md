# Contract: AuthorizationService

**Feature**: 015-permissions-rbac-matrix
**Type**: Internal domain service (not an HTTP endpoint)

## Overview

The `AuthorizationService` is the centralized authorization enforcement point consumed by all use cases. It lives in the application/domain layer and is injected via DI.

**Location**: `apps/backend/src/shared/domain/authorization.service.ts`

---

## Methods

### `assertRoles(actor, allowedRoles, context)`

Asserts the actor's role is in the allowed set. Logs audit on denial.

**Signature**:
```typescript
assertRoles(
  actor: AuthContext,
  allowedRoles: UserRole[],
  context: { action: string; entityType: string; entityId?: string }
): void
```

**Behavior**:
- If `actor.role` is in `allowedRoles` → no-op
- Otherwise → log audit record with `action: 'authorization.denied'` and throw `ForbiddenError`

---

### `assertClUserPermission(actor, permission)`

**Existing method** — no changes. Asserts CL_USER has the required permission flag.

**Signature**:
```typescript
assertClUserPermission(
  actor: AuthContext,
  permission: ClUserPermission
): void
```

**Behavior**:
- If `actor.role !== 'CL_USER'` → no-op (other roles don't use flags)
- If `actor.clUserPermissions` includes `permission` → no-op
- Otherwise → throw `ForbiddenError`

---

### `assertTenantScope(actor, targetTenantId, context)`

Asserts the actor can access the target tenant's data.

**Signature**:
```typescript
assertTenantScope(
  actor: AuthContext,
  targetTenantId: string,
  context: { action: string; entityType: string; entityId?: string }
): void
```

**Behavior**:
- If `actor.role === 'AM'` → no-op (AM is global)
- If `actor.tenantId === targetTenantId` → no-op
- Otherwise → log audit record and throw `ForbiddenError`

---

### `assertNotSelfApproval(actorUserId, originatorUserId, context)`

Prevents an actor from approving their own work.

**Signature**:
```typescript
assertNotSelfApproval(
  actorUserId: string,
  originatorUserId: string,
  context: { action: string; entityType: string; entityId?: string }
): void
```

**Behavior**:
- If `actorUserId !== originatorUserId` → no-op
- Otherwise → log audit record and throw `ForbiddenError` with code `SELF_APPROVAL_FORBIDDEN`

---

### `assertTenantSetting(tenantSettings, settingKey, context)`

Asserts a tenant setting is enabled (for CL_ADMIN conditional capabilities).

**Signature**:
```typescript
assertTenantSetting(
  tenantSettings: TenantSettings,
  settingKey: string,
  context: { actor: AuthContext; action: string; entityType: string }
): void
```

**Behavior**:
- If `tenantSettings[settingKey]` is truthy → no-op
- Otherwise → log audit record and throw `ForbiddenError`

---

### `assertNoPrivilegeEscalation(actor, targetRole)`

Prevents vertical privilege escalation on user creation/update.

**Signature**:
```typescript
assertNoPrivilegeEscalation(
  actor: AuthContext,
  targetRole: UserRole
): void
```

**Behavior**:
- AM → can create any role
- OP → can create CL_ADMIN, CL_USER (within own tenant)
- CL_ADMIN → can create CL_ADMIN, CL_USER only (within own tenant, if user management enabled)
- CL_USER, INSP → cannot create any user → throw `ForbiddenError`
- If target role is higher than actor's capability → throw `ForbiddenError`

---

## Shared Role Matrix

**Location**: `packages/shared/src/permissions/role-matrix.ts`

**Exported constant**: `ROLE_ACTION_MATRIX`

**Consumed by**:
- Backend `AuthorizationService` — enforcement
- Frontend `permissions.ts` — UI element visibility (`can(role, action): boolean`)

**Shape**:
```typescript
export const ROLE_ACTION_MATRIX: Record<string, {
  roles: UserRole[];
  condition?: 'cl_user_flag' | 'tenant_setting' | 'self_approval_check';
  conditionKey?: string;
}>;
```

---

## Error Codes

| Code | HTTP | When |
|------|------|------|
| `FORBIDDEN` | 403 | Role not permitted for action |
| `SELF_APPROVAL_FORBIDDEN` | 403 | Actor is the originator |
| `TENANT_SCOPE_VIOLATION` | 403 | Cross-tenant access attempt |
| `PRIVILEGE_ESCALATION` | 403 | Creating user with higher role |
| `TENANT_SETTING_DISABLED` | 403 | Required tenant setting not enabled |
