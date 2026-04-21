# Quickstart: Permissions & RBAC Matrix

**Feature**: 015-permissions-rbac-matrix
**Branch**: `015-permissions-rbac-matrix`

## What this feature does

Standardizes the authorization model across the Properfy backend. It expands the existing `AuthorizationService` with centralized helpers for role checks, tenant scope, self-approval prevention, and privilege escalation guards. It also introduces a shared role-action matrix used by both backend and frontend.

## Key files to understand first

1. **Spec**: `specs/015-permissions-rbac-matrix/spec.md` — the canonical role×action matrix and all acceptance scenarios
2. **Existing AuthorizationService**: `apps/backend/src/shared/domain/authorization.service.ts` — currently has `assertClUserPermission()` only
3. **Auth middleware**: `apps/backend/src/shared/interfaces/auth-middleware.ts` — populates `AuthContext` from JWT
4. **CL_USER permissions enum**: `packages/shared/src/enums/user.ts` — `CL_USER_PERMISSIONS` constant
5. **Tenant settings schema**: `packages/shared/src/schemas/tenant.ts` — Zod schema for `settings_json`
6. **Constitution RBAC section**: `.specify/memory/constitution.md` — binding role definitions

## Implementation order

### Phase 1: Shared role matrix + AuthorizationService expansion

1. Create `packages/shared/src/permissions/role-matrix.ts` with the `ROLE_ACTION_MATRIX` constant
2. Expand `AuthorizationService` with: `assertRoles()`, `assertTenantScope()`, `assertNotSelfApproval()`, `assertTenantSetting()`, `assertNoPrivilegeEscalation()`
3. Each denial method logs an audit record before throwing
4. Unit tests for all new methods

### Phase 2: Adopt helpers in existing use cases

5. Replace inline role checks in use cases with `authorizationService.assertRoles()`
6. Add `assertTenantScope()` where missing
7. Ensure all CL_ADMIN user management paths check `allowClientUserManagement`
8. Integration tests for each modified use case

### Phase 3: Frontend permission guard

9. Create `apps/web/src/lib/permissions.ts` — `can(role, action)` utility consuming the shared matrix
10. Apply to UI components that conditionally render based on role (hide, not disable)

### Phase 4: Matrix-driven RBAC integration tests

11. Create `apps/backend/tests/integration/rbac/rbac-matrix.test.ts`
12. Programmatically test every role×action combination from the matrix
13. Assert correct allow/deny for each combination

## Running locally

```bash
# Install dependencies
pnpm install

# Run backend tests (includes new RBAC tests)
pnpm --filter backend test

# Run shared package tests
pnpm --filter shared test

# Typecheck all
pnpm typecheck
```

## Key design decisions

- **No new database tables** — role matrix is a code constant, permissions use existing `tenants.settings_json`
- **No middleware-level authorization** — constitution mandates authorization in the application layer
- ~~**OP tenant scope correction is out of scope** — tracked separately in `.specify/memory/correction-op-tenant-scope.md`~~ **Superseded by `specs/DECISIONS.md` DEC-003 (2026-04-19)**: OP is cross-tenant per CLAUDE.md §6; no correction pending.
- **Flat permission model** — no role inheritance; each role has independent capabilities
- **Audit on denial** — every FORBIDDEN response produces an audit record through the centralized helpers
