# Implementation Plan: Appointments

**Branch**: `006-appointments` | **Date**: 2026-04-05 | **Spec**: [spec.md](./spec.md)
**Feature Status**: IMPLEMENTED (Phase 1) — Phase 2/3 gaps tracked in [tasks.md](./tasks.md).

## Summary

Own the central business entity of Properfy. This module implements the sovereign appointment state machine, the two-person cross-check on `DONE`, pricing snapshots, bulk import, and the read surface consumed by every portal. The module's correctness directly determines the integrity of financial entries, notifications, and SLA tracking across the platform.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.

**Primary Dependencies**

- Backend: Fastify, Prisma, Zod, `@fastify/rate-limit`, `@fastify/multipart`, pg-boss (import worker), shared `AuditService`, `IIdempotencyService`, `IReportStorageService`.
- Domain ports consumed from other modules: `IBranchRepository` (002), `IPropertyRepository` + `CreatePropertyUseCase` (003), `IServiceTypeRepository` + `IPricingRuleRepository` (004), `IInspectorRepository` + `IInspectionExecutionRepository` + `IInspectionAssetRepository` + `IServiceTypeReader` (inspector + inspector-execution modules), `IUserManagementRepository` (001), `IAuditLogRepository` (011), `ITenantRepository` (002), `IAppointmentTimeSlotRepository` (appointment-time-slot module).
- Cross-module orchestration: `resolvePricingRule` (pure function from 004), `assertClUserPermission` (shared helper for CL_USER permissions).
- Web (Master Admin + Agency portals): pages under `apps/web/src/features/appointments/`.
- PWA (Inspector app): pages under `apps/pwa/src/features/schedule/`.

**Storage**

- PostgreSQL (Supabase). Tables: `appointments`, `appointment_contacts`, `appointment_restrictions`, `appointment_imports`. Writes into `audit_logs` (feature 011) and reads from linked entities across features 002–004.

**Testing**

- Unit: Vitest — every use case, the `AppointmentStateMachine` transition matrix, and the pricing snapshot helpers.
- Integration: Supertest + real Postgres — every route, including the full state machine happy path and each negative branch. Concurrency tests for idempotent replay on state transitions.
- Frontend: Vitest + RTL for web and PWA pages.

**Target Platform**: Backend on Fly.io. Web on static CDN. PWA installable.
**Project Type**: Monorepo — backend API + web SPA + PWA + shared package.
**Performance Goals**: List/read p95 < 300 ms. Create p95 < 400 ms. State transition p95 < 400 ms. Cross-check p95 < 500 ms (audit log lookup dominates).
**Constraints**: Sovereign state machine — single entry point. Two-person rule on financial entries is a hard precondition. Multi-tenant scoping enforced at use case. Idempotency on state transitions and imports.
**Scale/Scope**: Phase 1 target: thousands of appointments per tenant per month, hundreds of concurrent operators and inspectors.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | Module split into `domain/`, `application/`, `infrastructure/`, `interfaces/`. The state machine, validator-style errors, and pricing snapshot helpers live in `domain/`. Use cases orchestrate cross-module reads through ports only — no direct Prisma imports from foreign modules. |
| II. Multi-Tenant Safety | PASS | Every use case enforces tenant scope explicitly. **AM is the only cross-tenant role** (`tenant_id = null`). OP is tenant-scoped and derives `tenantId` from JWT. CL roles derive `tenantId` from JWT. INSP scope is per-appointment via `inspectorId`. Cross-tenant reads by non-AM actors return `NOT_FOUND` rather than `FORBIDDEN`. |
| III. Test-Driven Development | PARTIAL | Unit and integration coverage present across every use case. Critical module — 80%+ coverage floor mandatory per constitution. Phase 2/3 tasks must land with TDD, especially any change to the state machine matrix or the cross-check evidence rules. |
| IV. Contract-First APIs | PASS | Zod schemas in `packages/shared/src/schemas/appointment.ts` are authoritative. OpenAPI generated from Fastify. Human projection in [contracts/](./contracts/). |
| V. Simplicity & Minimal Impact | PASS | The module is large because the domain is large — not because of over-engineering. The 10 use cases correspond directly to 10 operations. The state machine is a data table + validator, not a framework. |
| VI. State Machine Sovereignty | PASS | `ExecuteStatusTransitionUseCase` + `PerformCrossCheckUseCase` are the only paths. No other code in the repo writes `appointments.status`. Verified by convention and reviewed. Phase 2 work must preserve this — any new transition must go through the matrix. |

**Gate result**: PASS for Phase 1 as implemented.

## Project Structure

### Documentation (this feature)

```text
specs/006-appointments/
├── spec.md
├── plan.md
├── data-model.md
├── contracts/
│   ├── README.md
│   ├── appointment-endpoints.md
│   └── import-endpoints.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/backend/
├── prisma/schema.prisma                             # Appointment, AppointmentContact, AppointmentRestriction, AppointmentImport, AppointmentStatus, TenantConfirmationStatus, RestrictionSource
└── src/
    └── modules/
        └── appointment/
            ├── domain/
            │   ├── appointment.entity.ts
            │   ├── appointment-contact.entity.ts
            │   ├── appointment-restriction.entity.ts
            │   ├── appointment-import.entity.ts
            │   ├── appointment.repository.ts        # port
            │   ├── appointment-import.repository.ts # port
            │   ├── appointment-state-machine.ts     # TRANSITION_RULES + validator
            │   ├── appointment-pricing.service.ts   # pure helpers
            │   └── appointment.errors.ts            # 25+ typed errors
            ├── application/
            │   └── use-cases/
            │       ├── create-appointment.use-case.ts
            │       ├── get-appointment.use-case.ts
            │       ├── list-appointments.use-case.ts
            │       ├── update-appointment.use-case.ts
            │       ├── execute-status-transition.use-case.ts    # THE sovereign use case
            │       ├── perform-cross-check.use-case.ts          # two-person rule
            │       ├── force-manual-confirmation.use-case.ts
            │       ├── import-appointments.use-case.ts
            │       ├── get-import-status.use-case.ts
            │       └── list-appointment-contacts.use-case.ts
            ├── infrastructure/
            │   ├── prisma-appointment.repository.ts
            │   ├── prisma-appointment-import.repository.ts
            │   └── workers/
            │       └── import.worker.ts
            └── interfaces/
                └── appointment.routes.ts

apps/web/src/features/appointments/                  # list, detail, create, transition actions, contact drawer
apps/pwa/src/features/schedule/                      # inspector schedule view

packages/shared/src/
├── enums/appointment*.ts                            # AppointmentStatus, TenantConfirmationStatus, RestrictionSource
└── schemas/appointment*.ts

apps/backend/tests/
├── unit/appointment/                                # state machine, use cases, pricing snapshot
└── integration/appointment/                         # full route suite with state machine coverage
```

**Structure Decision**: One large Clean-Architecture module under `apps/backend/src/modules/appointment/`. The size is justified by the domain complexity — every use case has a single responsibility, and the cross-module consumption is abstracted through ports. Splitting into sub-modules would only duplicate wiring.

## Cross-Feature Dependencies

This is the most densely connected feature in the platform. It reads from or writes to almost every other feature:

- **Feature 001-identity-access** — Consumes `AuthContext` on every route. Depends on `IUserManagementRepository` for `doneCheckedByUserId` validation. `assertClUserPermission` depends on `001#GAP-003` being closed for a full permission model.
- **Feature 002-tenants-branches** — Reads `ITenantRepository` for active-tenant check and CL_USER permission lookup. Reads `IBranchRepository` for branch validation at create.
- **Feature 003-properties** — Reads `IPropertyRepository` for existing property lookup. Invokes `CreatePropertyUseCase` for inline property creation during appointment create and bulk import.
- **Feature 004-service-catalog** — Reads `IServiceTypeRepository` for service type validation and confirmation rules. Reads `IPricingRuleRepository` and calls `resolvePricingRule` at create time. Snapshots the rule into `pricing_rule_snapshot_json`.
- **Feature 005-service-groups-marketplace** — Writes to `service_group_id` via that feature's use cases. Enforces `APPOINTMENT_SERVICE_GROUP_REQUIRED` on `DRAFT → AWAITING_INSPECTOR`.
- **Feature 007-tenant-portal** — Writes `tenantConfirmationStatus` via its own flow (tenant portal tokens). This feature's force-confirmation endpoint is the operator escape hatch.
- **Feature 008-inspector-execution** — Reads `IInspectionExecutionRepository` and `IInspectionAssetRepository` at cross-check time to verify evidence. `SCHEDULED → DONE` transition is typically triggered by the "finish inspection" flow in that feature.
- **Feature 009-notifications** — Consumes the `onTransitionHandler` (and eventually domain events, see GAP-006). Notified on every state transition.
- **Feature 010-billing-ledger** — Consumes the `onDoneHandler` **after cross-check only** to create `TENANT_DEBIT` and `INSPECTOR_PAYOUT` entries. Handles `DONE → REJECTED` compensation (GAP-002).
- **Feature 011-reports-audit** — Consumes `IAuditLogRepository` inside the appointment module for cross-check origin lookup (the only feature that reads its own audit log).

## Security & Operational Notes

- **State machine sovereignty**: `ExecuteStatusTransitionUseCase` is the only write path. Any new feature that needs a new transition must extend `TRANSITION_RULES`, not bypass the use case. Reviewers should block PRs that introduce new status writes.
- **Two-person rule enforcement**: The canonical business flow is: (1) INSP marks DONE, (2) a separate OP/AM cross-checks via `POST /v1/appointments/:id/cross-check-done`, (3) financial entries are created. The code also supports an `implementation shortcut` where `doneCheckedByUserId` is provided in the same DONE transition call — this respects the two-person rule (distinct user IDs) but is not the primary flow described in the dossiê. GAP-010 proposes a cleaner API surface for the compound case. Neither shortcut should be confused with the canonical path.
- **Audit log dependency for cross-check**: `PerformCrossCheckUseCase` reads the audit log to identify the user who marked DONE. This is a cross-module read into feature 011. If audit retention ever deletes these records before cross-check happens, the feature breaks. Coordinate with feature 011 on retention policy.
- **Idempotency cache on status transitions**: 24 h retention with scope `status-transition`. Replay returns cached result without re-running side effects (financial entries, notifications) — this is correct behavior, but reviewers must keep the cache in sync when adding new side effects.
- **Past-date bypass for AM/OP**: Deliberate for backfill. Documented in FR-006; reviewers should not add a feature flag to restrict it without explicit product approval.
- **Financial side effect failure swallowed**: The `onDoneHandler.execute()` try/catch swallows errors. This prioritizes state-machine integrity over side-effect completeness — a correct tradeoff but one that requires a monitoring alert when the handler throws (Phase 2 observability work).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Two separate use cases (`ExecuteStatusTransitionUseCase` + `PerformCrossCheckUseCase`) for DONE | The two-person rule is a hard precondition — combining would let a single actor mark DONE + cross-check themselves. | A single use case with role-check branching would make the self-check prevention fragile under permission changes. |
| Audit log scanned to find who marked DONE | Ensures the cross-checker differs from the marker without storing the marker id on the row directly. | Adding a `done_marked_by_user_id` column would be simpler but slightly couples audit data into the row (Phase 2 optimization — GAP-009). |
| Pricing snapshot on the appointment row | Pricing rules can change after the appointment is scheduled; the snapshot protects the tenant from mid-flight rate changes. | Looking up the rule at read time would drift over time and break billing reproducibility. |
| 25+ typed error classes | Each failure mode must be distinguishable for client UIs and for analytics. | A single generic error type would make UX hard and analytics impossible. |
| `CreatePropertyUseCase` invoked inline inside appointment create | Agencies often onboard a property and book its first inspection in the same flow. | Forcing a two-step flow would require the web portal to orchestrate two calls with rollback semantics. |
| `onDoneHandler` and `onTransitionHandler` as optional constructor parameters | Lets the use case run in isolation for tests without wiring the full billing + notification stack. | Mandatory dependencies would couple every test setup to the full container. |

Phase 1 deviations above are justified. Phase 2 items must add rows above if they introduce new deviations.

## Execution Strategy

> Detailed task definitions in [`tasks.md`](./tasks.md).

### Phase 2 — Gap Closure

#### Wave 1: Quick Fixes + Already-Resolved Dependencies (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 1a | GAP-001 — Typed reason codes | T100–T105 | Enum in shared, enforce on write. No dependencies. |
| 1b | GAP-007 — CL_USER permission set schema | T160–T163 | Already resolved by 001#GAP-003 (`ClUserPermission` type exists). Verify + close. |
| 1c | GAP-008 — Appointment number runbook | T170–T171 | Documentation only. |
| 1d | CORRECTION — Contact error code | T195–T196 | Tiny fix. |

#### Wave 2: Core Improvements (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 2a | GAP-004 — Import idempotency verification | T130–T132 | Same pattern as 003#GAP-006. |
| 2b | GAP-005 — Appointment soft-delete | T140–T142 | Decision + implementation. |
| 2c | GAP-009 — done_marked_by_user_id column | T180–T184 | Optimization removing audit scan. Recommended co-impl from 020 spec. |
| 2d | GAP-010 — Compound DONE + cross-check | T190–T193 | Ergonomic add-on. |

#### Wave 3: Event-Driven + Cross-Feature (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 3a | GAP-002 — Financial compensation on DONE→REJECTED | T110–T113 | Depends on DomainEventBus (done). |
| 3b | GAP-003 — Reschedule handoff protocol | T120–T123 | Cross-feature with 007. |
| 3c | GAP-006 — Typed transition event contract | T150–T153 | Depends on DomainEventBus (done). |

### Parallelization Summary

```
Wave 1:  GAP-001 ══╗
         GAP-007 ══╬══ (all parallel)
         GAP-008 ══╝
         CORRECTION ╝

Wave 2:  GAP-004 ══╗
         GAP-005 ══╬══ (all parallel)
         GAP-009 ══╝
         GAP-010 ══╝

Wave 3:  GAP-002 ══╗
         GAP-003 ══╬══ (all parallel)
         GAP-006 ══╝
```
