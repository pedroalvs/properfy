# Research: Permissions & RBAC Matrix

**Feature**: 015-permissions-rbac-matrix
**Date**: 2026-04-09

## Research Summary

This feature is **cross-cutting** — it standardizes and completes the authorization model already partially implemented across all backend modules. No new external dependencies or technologies are needed.

---

## R1: Current AuthorizationService Scope

**Decision**: Expand the existing `AuthorizationService` with role-check and tenant-scope helpers rather than replacing it.

**Rationale**: The service already exists at `apps/backend/src/shared/domain/authorization.service.ts` with a single method (`assertClUserPermission`). Adding `assertRoles()` and `assertTenantScope()` keeps the centralized pattern without disrupting existing call sites.

**Alternatives considered**:
- Decorator-based authorization at route level — rejected because constitution mandates authorization in the application layer (use cases), not routes.
- Middleware-level role enforcement — rejected for same reason; middleware only extracts context and checks tenant active status.
- New `PermissionEngine` abstraction — rejected as over-engineering; flat flag-based model doesn't need a rules engine.

---

## R2: OP Tenant Scope Correction

**Decision**: Out of scope for this feature. Tracked in `.specify/memory/correction-op-tenant-scope.md` as a cross-feature correction.

**Rationale**: The spec explicitly states (Assumptions): "This spec documents the approved rule but does not own the migration." The correction affects ~80 use cases across the backend and needs its own coordinated effort.

**Impact on this feature**: The `AuthorizationService` helpers we build MUST be designed assuming OP is tenant-scoped (the approved rule). Existing use cases that treat OP as global will be corrected in the separate track, but new code written here must follow the approved rule.

---

## R3: CL_USER Permission Flags — Current State

**Decision**: All 7 permission flags are already defined and enforced. The spec now lists all 7 canonical flags (including `reschedule_appointments`).

**Current implementation**:
- Enum defined in `packages/shared/src/enums/user.ts`: `create_appointments`, `cancel_appointments`, `reject_appointments`, `reschedule_appointments`, `force_confirmation`, `create_properties`, `export_reports`
- Zod schema in `packages/shared/src/schemas/tenant.ts` validates the array
- Auth middleware resolves permissions from tenant settings for CL_USER role
- `AuthorizationService.assertClUserPermission()` checks at use-case level
- All 7 flags are actively checked in their respective use cases

**Gap from spec**: Spec says only 3 of 6 are implemented — this is outdated. Research confirms all flags are implemented. The spec's GAP-003 can be closed.

---

## R4: CL_ADMIN User Management Gate

**Decision**: Use the existing `allowClientUserManagement` tenant setting flag (already in the Zod schema at `packages/shared/src/schemas/tenant.ts`).

**Rationale**: The setting already exists in the schema. The recent commit `7191794` ("enforce allowClientUserManagement tenant setting on CL_ADMIN user operations") suggests this may already be partially implemented.

**What to verify**: Whether the gate is enforced on all CL_ADMIN user management paths (create, update, deactivate).

---

## R5: Permission Denial Audit

**Decision**: Standardize audit logging for all FORBIDDEN responses through the `AuthorizationService` helpers.

**Rationale**: Currently, not all forbidden responses produce audit records (GAP-005). By centralizing role checks and permission checks in `AuthorizationService` methods that call `AuditService.log()` on denial, we get consistent coverage.

**Pattern**:
```typescript
assertRoles(actor, allowedRoles, action, entityType, entityId) {
  if (!allowedRoles.includes(actor.role)) {
    this.auditService.log({ action, actorType: 'USER', actorId: actor.userId, ... reason: 'FORBIDDEN' });
    throw new ForbiddenError(...);
  }
}
```

---

## R6: Test Strategy for RBAC Matrix

**Decision**: Matrix-driven integration tests that programmatically test role × action combinations.

**Rationale**: SC-007 requires "a matrix-driven integration test that programmatically tests every role × action combination." Current tests are per-endpoint, not matrix-style.

**Pattern**:
- Define a `ROLE_ACTION_MATRIX` constant mirroring the spec's role matrix
- For each action, create a test that iterates all roles and asserts allow/deny
- Use existing test helpers: `createMockContainer()`, mock JWT verification
- Separate test file: `tests/integration/rbac/rbac-matrix.test.ts`

---

## R7: Frontend Permission Gating

**Decision**: Use existing `AuthContext` in frontend (from JWT/session) to conditionally render UI elements.

**Rationale**: FR-008 requires UI elements to be hidden (not disabled) for non-permitted roles. The frontend already has auth context from the session. Permission checks should use a shared `can(role, action)` utility derived from the same role matrix.

**Pattern**: Shared `packages/shared/src/permissions/role-matrix.ts` defining the matrix, consumed by both backend `AuthorizationService` and frontend permission guards.
