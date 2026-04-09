# Implementation Plan: Permissions & RBAC Matrix

**Branch**: `015-permissions-rbac-matrix` | **Date**: 2026-04-09 | **Spec**: `specs/015-permissions-rbac-matrix/spec.md`
**Input**: Feature specification from `/specs/015-permissions-rbac-matrix/spec.md`

## Summary

Standardize and complete the authorization model across the Properfy backend by expanding the existing `AuthorizationService` with centralized role-check, tenant-scope, and audit-on-denial helpers. Implement a shared role-action matrix consumable by both backend and frontend. Close remaining gaps: CL_ADMIN user management gate enforcement, permission denial audit consistency, and matrix-driven RBAC integration tests.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20
**Primary Dependencies**: Fastify, Prisma ORM, Zod, shared `AuditService`, existing `AuthorizationService`
**Storage**: PostgreSQL (Supabase) — `tenants.settings_json` (JSONB) for permission flags; `audit_logs` for denial records
**Testing**: Vitest (unit), Supertest (integration)
**Target Platform**: Node.js backend API + React SPA frontend
**Project Type**: Cross-cutting enhancement to existing multi-tenant B2B SaaS
**Constraints**: Must not break existing authorization checks; OP tenant-scope correction is out of scope (separate track)
**Scale/Scope**: ~80 use cases consume auth context; 7 CL_USER permission flags; 1 CL_ADMIN conditional capability; ~50 role×action matrix entries

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Clean Architecture | PASS | Authorization stays in application layer (use cases). `AuthorizationService` is a domain service injected via DI. No route-level enforcement. |
| II. Multi-Tenant Safety | PASS | All helpers enforce tenant scope. New code treats OP as tenant-scoped per approved rule. Audit records carry `tenantId`. |
| III. Test-Driven Development | PASS | Matrix-driven integration tests + unit tests for new helpers. TDD cycle enforced. |
| IV. Contract-First APIs | PASS | No new API endpoints needed for authorization. Tenant settings update endpoint already exists. Shared role matrix in `packages/shared`. |
| V. Simplicity and Minimal Impact | PASS | Expanding existing service, not creating new abstraction layers. Flat flag model preserved. |
| Knowledge Classification | PASS | Spec clearly labels IMPLEMENTED, APPROVED, DIVERGENCE, and GAP statuses. |

**Post-Phase 1 re-check**: PASS — design adds helpers to existing service, shared matrix constant, and tests. No architectural deviations.

## Project Structure

### Documentation (this feature)

```text
specs/015-permissions-rbac-matrix/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── authorization-service-contract.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── permissions/
│   └── role-matrix.ts              # Canonical role×action matrix (shared by backend + frontend)
├── enums/
│   └── user.ts                     # Existing — CL_USER_PERMISSIONS, UserRole (no changes needed)
└── schemas/
    └── tenant.ts                   # Existing — clUserPermissions Zod schema (no changes needed)

apps/backend/src/
├── shared/
│   ├── domain/
│   │   ├── authorization.service.ts    # EXPAND — add assertRoles(), assertTenantScope(), assertNotSelfApproval(), assertTenantSetting(), assertNoPrivilegeEscalation()
│   │   └── cl-user-permissions.ts      # Existing — no changes needed
│   └── interfaces/
│       └── auth-middleware.ts          # Existing — no changes needed
└── modules/
    └── */application/use-cases/*.ts    # MODIFY — adopt AuthorizationService helpers where inline checks exist

apps/backend/tests/
├── unit/
│   └── shared/
│       └── authorization.service.test.ts   # NEW — unit tests for expanded service
└── integration/
    └── rbac/
        └── rbac-matrix.test.ts             # NEW — matrix-driven role×action integration tests

apps/web/src/
└── lib/
    └── permissions.ts                      # NEW — frontend permission guard using shared role matrix
```

**Structure Decision**: Cross-cutting feature touching shared packages and existing backend modules. No new domain modules. The role matrix lives in `packages/shared` for single-source-of-truth consumption by both backend and frontend.

## Complexity Tracking

No constitution violations. No complexity justifications needed.

## Closure Status

**Implemented**: 2026-04-09 | **Commit**: `48a6a3d` | **Tests**: 2567 backend + 12 frontend, all passing

The authorization foundation is complete: shared role matrix, expanded AuthorizationService (6 methods with audit-on-denial), ~70 use cases migrated, frontend permission guard ready. Deferred items (integration tests, UI adoption) are non-blocking — see `tasks.md` Closure Status section for classification.
