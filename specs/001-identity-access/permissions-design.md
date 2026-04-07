# Permissions Design: CL_USER Fine-Grained Permissions

**Date**: 2026-04-06  
**Status**: Proposal (awaiting approval)  
**Gap**: GAP-003 from `specs/001-identity-access/spec.md`  
**Canonical matrix**: `specs/015-permissions-rbac-matrix/spec.md`

## Current State

CL_USER permissions are **partially implemented**. The mechanism is a `clUserPermissions` string array in `tenant.settings_json`, checked via `assertClUserPermission()` in `shared/domain/cl-user-permissions.ts`.

### Already enforced in code (5 flags)

| Flag | Where enforced | Pattern |
|---|---|---|
| `create_appointments` | `create-appointment.use-case.ts` | `assertClUserPermission` |
| `cancel_appointments` | `execute-status-transition.use-case.ts` | `assertClUserPermission` |
| `reject_appointments` | `execute-status-transition.use-case.ts` | `assertClUserPermission` |
| `reschedule_appointments` | `update-appointment.use-case.ts` | `assertClUserPermission` |
| `force_confirmation` | `force-manual-confirmation.use-case.ts` | `assertClUserPermission` |

### Enforced but inconsistent pattern (1 flag)

| Flag | Where enforced | Pattern |
|---|---|---|
| `export_reports` | `request-report.use-case.ts` | Inline `settingsJson.clUserPermissions` check (does NOT use `assertClUserPermission`) |

### Not yet enforced (1 flag)

| Flag | Where needed | Status |
|---|---|---|
| `create_properties` | `create-property.use-case.ts` | CL_USER allowed without flag check |

## Decision: Storage Model

**Option A: JSON column on `tenant.settings_json` (current approach) — RECOMMENDED**

Permissions are already stored as `tenant.settings_json.clUserPermissions: string[]`. This is a tenant-level setting, meaning all CL_USERs in a tenant share the same permission set. This aligns with the dossier: "CL_ADMIN configures what their team can do" — it's a blanket tenant policy, not per-user.

**Why keep this approach:**
- Already partially implemented and working for 5 flags
- Simple — no new tables, no migration needed for the storage model
- Matches the dossier intent (tenant-level, not per-user)
- CL_ADMIN edits these via tenant settings UI
- Small fixed set of flags (7 total) — doesn't warrant a normalized table

**What changes:**
- Move from raw `string[]` to a typed enum/set validated by Zod
- Centralize all checks through a new `AuthorizationService`
- Add the missing `create_properties` enforcement
- Standardize the `export_reports` check to use the shared pattern
- Propagate resolved permissions into `AuthContext` (fetched per request, NOT in JWT)

**Why NOT in JWT claims:**
- Permissions are tenant-level settings that can change at any time
- JWT has a 15-minute TTL — permission changes would be delayed
- Adding permissions to JWT bloats the token
- Per-request fetch from tenant settings is cheap (tenant is already loaded by auth middleware for active-status check)

**Rejected alternatives:**
- **(B) Separate `user_permissions` table**: Over-engineering for 7 boolean flags. Would be needed if permissions were per-user, but the dossier specifies tenant-level.
- **(C) Per-user JSON column on `users` table**: Would allow per-user overrides, but the dossier doesn't require this. Adds complexity without business justification.

## Canonical Permission Flags

The complete set of CL_USER permission flags (7 total):

```typescript
export const CL_USER_PERMISSIONS = [
  'create_appointments',
  'cancel_appointments',
  'reject_appointments',
  'reschedule_appointments',
  'force_confirmation',
  'create_properties',
  'export_reports',
] as const;

export type ClUserPermission = typeof CL_USER_PERMISSIONS[number];
```

**Default**: When a tenant has no `clUserPermissions` configured, CL_USERs have **no write permissions** (read-only access only). This is the safest default — CL_ADMIN must explicitly enable each capability.

## AuthorizationService Design

```typescript
// shared/domain/authorization.service.ts
export class AuthorizationService {
  assertClUserPermission(
    authContext: AuthContext,
    permission: ClUserPermission,
  ): void;
  // Throws ForbiddenError if:
  // - authContext.role is not CL_USER (no-op for other roles)
  // - authContext.clUserPermissions does not include the permission
}
```

**How permissions reach AuthContext:**
1. Auth middleware already loads tenant for active-status check
2. Extend middleware to also read `tenant.settings_json.clUserPermissions`
3. Attach resolved permissions to `request.authContext.clUserPermissions: string[]`
4. `AuthorizationService.assertClUserPermission` reads from AuthContext (no additional DB call)

**AuthContext extension:**
```typescript
export interface AuthContext {
  userId: string;
  tenantId: string | null;
  role: string;
  branchId: string | null;
  inspectorId: string | null;
  clUserPermissions: string[];  // NEW — empty for non-CL_USER roles
}
```

## Implementation Steps

1. Add `ClUserPermission` type and `CL_USER_PERMISSIONS` constant to `packages/shared`
2. Add Zod validation for `clUserPermissions` field in tenant settings
3. Extend `AuthContext` type with `clUserPermissions: string[]`
4. Extend auth middleware to populate `clUserPermissions` from tenant settings
5. Create `AuthorizationService` in `shared/domain/`
6. Replace all `assertClUserPermission()` calls with `AuthorizationService`
7. Add missing `create_properties` gate in `create-property.use-case.ts`
8. Standardize `export_reports` check in `request-report.use-case.ts`
9. Add `clUserPermissions` to create/update tenant settings schema (CL_ADMIN can configure)
10. Tests for each enforcement point

## What This Does NOT Cover

- **Per-user permission overrides**: Not required by dossier. All CL_USERs in a tenant share the same flags.
- **`enable_user_management` tenant setting for CL_ADMIN**: This is a separate concern (002#GAP-002), not a CL_USER permission flag.
- **New permission flags beyond the 7 listed**: Future flags follow the same pattern — add to the enum, add the gate in the use case.
