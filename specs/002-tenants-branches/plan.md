# Implementation Plan: Tenants & Branches

**Branch**: `002-tenants-branches` | **Date**: 2026-04-07 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `/specs/002-tenants-branches/spec.md`

**Note**: Phase 1 is fully implemented on the active branch. This plan documents the existing architecture and defines the roadmap for Phase 2 (gap closure) and Phase 3 (polish).

## Summary

Tenants & Branches owns the real-estate agency (tenant) and branch (filial) lifecycle: creation, read, update, deactivation, and the underlying tenant-scoped settings that drive the rest of the platform. Enforce multi-tenant isolation invariants at the use-case layer through RBAC gates and at the repository layer through mandatory `tenant_id` scoping. Block destructive operations (tenant/branch deactivation) when open appointments exist, so financial and operational integrity is preserved. Phase 2 closes 11 known gaps including tenant activation, rich settings schema, billing cross-field validation, domain events, and branch improvements.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20
**Primary Dependencies**: Fastify, Prisma ORM, Zod, shared `AuditService`, domain port `IAppointmentChecker`
**Storage**: PostgreSQL (Supabase). Tables: `tenants`, `branches`. Audit records in shared `audit_logs`. Default time-slots seeded into `appointment_time_slots`.
**Testing**: Vitest (unit), Supertest (integration). Coverage target: 80%+ (critical module).
**Target Platform**: Backend on Fly.io; web on static CDN
**Project Type**: Multi-tenant B2B SaaS backend API + web SPA + shared package
**Performance Goals**: Tenant/branch endpoints p95 < 300 ms. Deactivation with appointment check p95 < 500 ms.
**Constraints**: All writes must produce audit entries. No route may accept client-role `tenantId` from body/query. Open-appointment check is a hard precondition.
**Scale/Scope**: Low thousands of tenants, low tens of branches per tenant.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | Tenant module: `domain/` → `application/` → `infrastructure/` → `interfaces/`. Ports: `ITenantRepository`, `IBranchRepository`, `IAppointmentChecker`. |
| II. Multi-Tenant Safety | PASS | Every repo method accepts `tenantId`. Use cases derive `tenantId` from JWT for OP/client roles. AM is the only cross-tenant role. OP is tenant-scoped. |
| III. Test-Driven Development | PARTIAL | Broad unit/integration coverage. Phase 2 items must land with TDD. |
| IV. Contract-First APIs | PASS | Zod schemas in `packages/shared/src/schemas/tenant.ts`. Contracts in `contracts/`. |
| V. Simplicity & Minimal Impact | PASS | No speculative abstractions. Appointment checker port justified by cross-module dependency. |

**Gate result**: PASS for Phase 1.

## Project Structure

### Documentation (this feature)

```text
specs/002-tenants-branches/
├── plan.md              # This file
├── data-model.md        # Phase 1 output (Tenant, Branch entities)
├── contracts/
│   ├── README.md
│   ├── tenant-endpoints.md
│   └── branch-endpoints.md
├── spec.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/backend/src/modules/tenant/
├── domain/
│   ├── tenant.entity.ts
│   ├── branch.entity.ts
│   ├── tenant.repository.ts              # Port
│   ├── branch.repository.ts              # Port
│   ├── appointment-checker.ts            # Port + StubAppointmentChecker
│   └── tenant.errors.ts
├── application/
│   └── use-cases/
│       ├── create-tenant.use-case.ts
│       ├── get-tenant.use-case.ts
│       ├── list-tenants.use-case.ts
│       ├── update-tenant.use-case.ts
│       ├── deactivate-tenant.use-case.ts
│       ├── create-branch.use-case.ts
│       ├── list-branches.use-case.ts
│       ├── update-branch.use-case.ts
│       └── deactivate-branch.use-case.ts
├── infrastructure/
│   ├── prisma-tenant.repository.ts
│   ├── prisma-branch.repository.ts
│   └── prisma-appointment-checker.ts
└── interfaces/
    └── tenant.routes.ts

apps/web/src/features/tenants/
├── pages/
│   ├── TenantListPage.tsx
│   ├── TenantDetailPage.tsx
│   └── TenantContactListPage.tsx
├── components/
│   ├── TenantTable.tsx / TenantAdminTable.tsx
│   ├── TenantFormDrawer.tsx
│   ├── BranchSection.tsx
│   └── BranchFormDrawer.tsx
└── hooks/

packages/shared/src/
├── enums/tenant.ts       # TenantStatus, BranchStatus
└── schemas/tenant.ts     # create/update/deactivate + list queries
```

**Structure Decision**: Single Clean-Architecture module for tenant + branch. Branches live inside the tenant module because they are strongly coupled to tenant lifecycle rules.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `IAppointmentChecker` port | Deactivation needs appointment count without pulling appointment entities into tenant module | Direct Prisma query would leak cross-module schema knowledge |
| `CreateTenantUseCase` depends on `IAppointmentTimeSlotRepository` | Default time-slot seeding must be atomic with creation | Post-create job adds asynchrony and risks partial onboarding |

## Execution Strategy

> Detailed task definitions live in [`tasks.md`](./tasks.md). This section defines **ordering, dependencies, parallelization, and checkpoints**.

### Phase 2 — Gap Closure

#### Wave 1: Quick Wins + Unblocking (serial then parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 1a (serial) | GAP-001 — Activate tenant | T100–T104 | Unblocks self-serve onboarding and any flow that needs tenants to exit `PENDING`. No dependencies. |
| 1b (parallel with 1a) | GAP-006 — Branch reactivation | T150–T152 | Small scope (one use case + route + tests). Mirror of deactivation pattern. |
| 1c (parallel with 1a) | GAP-008 — Get branch by id | T170–T173 | Simple read endpoint. No dependencies. High frontend value. |

**Why this order**: GAP-001 is the most impactful quick win — tenants stuck in PENDING is a real operational pain point. GAP-006 and GAP-008 are independent and tiny.

#### Wave 2: Settings Foundation (serial — blocks Wave 3)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 2 | GAP-002 — Rich tenant settings schema | T110–T115 | Requires design doc first (T110). Expands `tenantSettingsSchema` with branding, billing config, feature flags, email templates. **Blocks** GAP-003, GAP-004, GAP-010. |

**Why serial**: Every settings-dependent gap needs the expanded schema. The design doc (T110) must be approved before implementation.

#### Wave 3: Settings-Dependent Gaps (parallel, after Wave 2)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 3a (parallel) | GAP-003 — Billing period cross-field validation | T120–T121 | `.refine()` on the new schema. Small. |
| 3b (parallel) | GAP-004 — CL_ADMIN fine-grained settings scope | T130–T132 | Key-level allow-list filter on update. Small. |

#### Wave 4: Structural Improvements (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 4a (parallel) | GAP-007 — Case-insensitive branch name uniqueness | T160–T163 | Migration + application logic. Independent. |
| 4b (parallel) | GAP-011 — Branch address schema | T210–T215 | Schema + backfill + UI. Independent. |

#### Wave 5: Infrastructure & Ops (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 5a (parallel) | GAP-005 — Domain events emission | T140–T143 | Introduces `DomainEventBus`. Cross-cutting but low risk. |
| 5b (parallel) | GAP-009 — Tenant hard-delete runbook | T180–T181 | Documentation only. No code risk. |
| 5c (parallel) | GAP-010 — Tenant branding asset upload | T190–T193 | Signed-URL upload pipeline. Depends on GAP-002 for `logoUrl` key. |

### Parallelization Summary

```
Wave 1:  GAP-001 ══╗
         GAP-006 ══╬══ (all parallel)
         GAP-008 ══╝

Wave 2:  GAP-002 design doc → GAP-002 implementation (serial)

Wave 3:  GAP-003 ══╗
         GAP-004 ══╝ (parallel, after Wave 2)

Wave 4:  GAP-007 ══╗
         GAP-011 ══╝ (parallel)

Wave 5:  GAP-005 ══╗
         GAP-009 ══╬══ (parallel)
         GAP-010 ══╝
```

### Phase 3 — Polish & Cross-Cutting

| Task | Category | Notes |
|------|----------|-------|
| T200 — Coverage verification | Hardening | Run `--coverage`, hit 80%+ floor. |
| T201 — Audit record assertion | Hardening | Every write path emits exactly one audit record. |
| T202 — OpenAPI documentation | Cleanup | Verify all tenant/branch routes in OpenAPI output. |
| T203 — Legacy spec supersede | Cleanup | Banner on old `specs/backend/tenant.spec.md` if it exists. |
| T204 — Soft-delete uniqueness review | Decision | Decide if legal-name uniqueness should exclude soft-deleted rows. |

### Implementation Checkpoints

#### Wave 1 Complete

- [ ] GAP-001: `ActivateTenantUseCase` works for `PENDING→ACTIVE` and `INACTIVE→ACTIVE`. CL users can authenticate after activation.
- [ ] GAP-006: `ActivateBranchUseCase` works for `INACTIVE→ACTIVE`. Already-active branches rejected.
- [ ] GAP-008: `GET /v1/tenants/:tenantId/branches/:branchId` returns branch detail. Tenant-scoped.

#### Wave 2 Complete

- [ ] GAP-002: Design doc approved. `tenantSettingsSchema` expanded with all dossier-defined keys. Backfill defaults for existing tenants.

#### Wave 3 Complete

- [ ] GAP-003: Billing period refinement rejects inconsistent `billingPeriod` + day combinations.
- [ ] GAP-004: CL_ADMIN settings update limited to allow-listed keys only.

#### Wave 4 Complete

- [ ] GAP-007: Branch names compared case-insensitively. `Main` and `main` conflict.
- [ ] GAP-011: `branchAddressSchema` replaces freeform JSON. Existing rows backfilled.

#### Wave 5 Complete

- [ ] GAP-005: Domain events emitted for all tenant/branch write operations.
- [ ] GAP-009: Hard-delete runbook written.
- [ ] GAP-010: Logo upload via signed URL, stored in `settings.logoUrl`.

#### Phase 3 Complete

- [ ] Coverage ≥ 80% for tenant module.
- [ ] Every write path emits exactly one audit record.
- [ ] OpenAPI includes all tenant/branch routes.
