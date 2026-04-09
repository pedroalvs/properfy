# Data Model: Permissions & RBAC Matrix

**Feature**: 015-permissions-rbac-matrix
**Date**: 2026-04-09

## Entities

### 1. RoleActionMatrix (new shared constant, not a database entity)

The canonical mapping of roles to permitted actions. Lives in `packages/shared/src/permissions/role-matrix.ts`.

| Field | Type | Description |
|-------|------|-------------|
| `action` | `string` (enum key) | Action identifier (e.g., `'user.create_internal'`, `'appointment.cancel'`) |
| `roles` | `UserRole[]` | Roles permitted to perform this action |
| `condition?` | `'cl_user_flag'` \| `'tenant_setting'` \| `'self_approval_check'` | Optional condition type that must be satisfied beyond role check |
| `conditionKey?` | `string` | The specific flag/setting key (e.g., `'cancel_appointments'`, `'allowClientUserManagement'`) |
| `auditRequired` | `boolean` | Whether denial produces an audit record |

**Structure**:
```typescript
type RoleMatrixEntry = {
  action: string;
  roles: UserRole[];
  condition?: 'cl_user_flag' | 'tenant_setting' | 'self_approval_check';
  conditionKey?: string;
  auditRequired: boolean;
};

const ROLE_ACTION_MATRIX: Record<string, RoleMatrixEntry>;
```

### 2. AuthContext (existing, no schema changes)

Request-scoped context extracted by auth middleware from JWT.

| Field | Type | Description |
|-------|------|-------------|
| `userId` | `string` | Authenticated user ID |
| `tenantId` | `string \| null` | Tenant scope (null only for AM) |
| `role` | `UserRole` | `AM`, `OP`, `CL_ADMIN`, `CL_USER`, `INSP` |
| `branchId` | `string \| null` | Branch scope for CL roles |
| `inspectorId` | `string \| null` | Inspector ID for INSP role |
| `clUserPermissions` | `ClUserPermission[] \| undefined` | Resolved at middleware for CL_USER only |

### 3. TenantSettings (existing JSON column, no schema changes)

Stored in `tenants.settings_json` (JSONB).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `clUserPermissions` | `ClUserPermission[]` | `[]` | Enabled CL_USER permission flags |
| `allowClientUserManagement` | `boolean` | `false` | Gates CL_ADMIN user management |

**Zod schema**: Already defined in `packages/shared/src/schemas/tenant.ts`.

### 4. AuditLogEntry (existing, no schema changes)

Written to `audit_logs` table via `AuditService`.

| Field | Type | Description |
|-------|------|-------------|
| `action` | `string` | e.g., `'authorization.denied'` |
| `actorType` | `'USER' \| 'SYSTEM' \| 'ANONYMOUS'` | Actor type |
| `actorId` | `string?` | User ID |
| `entityType` | `string` | e.g., `'Appointment'`, `'User'` |
| `entityId` | `string?` | Target entity ID |
| `tenantId` | `string?` | Tenant scope |
| `reason` | `string?` | Denial reason |
| `metadata` | `Record<string, unknown>?` | Extra context (attempted action, required role) |
| `requestId` | `string?` | Request correlation ID |

## Relationships

```
User (1) ──── role ────> UserRole (enum)
  │
  └── tenantId ──────> Tenant (1)
                          │
                          └── settings_json ──> TenantSettings
                                                  ├── clUserPermissions[]
                                                  └── allowClientUserManagement

AuthContext (request-scoped, derived from JWT + tenant settings)
  │
  ├── Consumed by ──> AuthorizationService.assertRoles()
  ├── Consumed by ──> AuthorizationService.assertClUserPermission()
  ├── Consumed by ──> AuthorizationService.assertTenantScope()
  └── Consumed by ──> AuthorizationService.assertNotSelfApproval()

ROLE_ACTION_MATRIX (shared constant)
  │
  ├── Consumed by ──> Backend AuthorizationService (enforcement)
  └── Consumed by ──> Frontend permissions.ts (UI visibility)
```

## Validation Rules

1. **Role check**: `actor.role` must be in `entry.roles` for the attempted action.
2. **CL_USER flag check**: When `condition === 'cl_user_flag'`, `actor.clUserPermissions` must include `conditionKey`.
3. **Tenant setting check**: When `condition === 'tenant_setting'`, the tenant's `settings_json[conditionKey]` must be truthy.
4. **Self-approval check**: When `condition === 'self_approval_check'`, `actor.userId` must differ from the originating actor on the target entity.
5. **Tenant scope**: For non-AM roles, `actor.tenantId` must match the target entity's `tenantId`. AM may specify any `tenantId`.
6. **Privilege escalation**: CL_ADMIN cannot create AM/OP/INSP. OP cannot create AM. CL_USER cannot create any user.

## State Transitions

No new state machines. This feature enforces authorization on existing state transitions (appointment lifecycle, user lifecycle). See spec `006-appointments` for the appointment state machine actor matrix.

## Database Changes

**None required.** All data structures already exist:
- `tenants.settings_json` stores permission flags and tenant settings
- `audit_logs` stores audit records
- `users.role` stores user role enum

The role-action matrix is a code-level constant, not a database entity.
