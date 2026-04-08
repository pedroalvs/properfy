# Implementation Plan: Service Groups & Marketplace

**Branch**: `005-service-groups-marketplace` | **Date**: 2026-04-05 | **Spec**: [spec.md](./spec.md)
**Feature Status**: IMPLEMENTED (Phase 1) — Phase 2/3 gaps tracked in [tasks.md](./tasks.md).

## Summary

Own the end-to-end lifecycle of service groups — from operator creation out of pending appointments, through publication to the inspector marketplace (or direct manual assignment), to optimistic-lock acceptance and the cascading appointment `AWAITING_INSPECTOR → SCHEDULED` transitions. This feature sits between feature 006 (appointments) and feature 008 (inspector execution) and is the primary allocation mechanism of the platform.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.

**Primary Dependencies**

- Backend: Fastify, Prisma, Zod, shared `AuditService`, shared `IIdempotencyService` (for accept-offer replay protection).
- Cross-module ports: `IAppointmentRepository` (feature 006), `IInspectorRepository` (inspector module), `IServiceRegionRepository` (feature 004), `IServiceTypeRepository` (feature 004 — indirectly through appointment/inspector lookups).
- Shared: Zod schemas and enums (`ServiceGroupStatus`, `PriorityMode`, `ServiceGroupExceptionType`).
- Web (Master Admin portal): React + Vite pages under `apps/web/src/features/service-groups/` and `apps/web/src/features/marketplace/`.
- PWA (Inspector app): React + Vite pages under `apps/pwa/src/features/offers/`.

**Storage**

- PostgreSQL (Supabase). Tables: `service_groups`, plus writes into `appointments` (foreign module) and `audit_logs`.
- `service_groups` does not declare a PostGIS column — region matching borrows from `service_regions.geom` via the repository (GAP-001, depends on 004#GAP-004).

**Testing**

- Unit: Vitest — every use case, the `ServiceGroupEntity` state predicates, and the `ServiceGroupValidator`.
- Integration: Supertest + real Postgres — every route, including optimistic-lock race tests with two concurrent acceptors.
- Frontend: Vitest + RTL for web service group pages and PWA offer pages.

**Target Platform**: Backend on Fly.io. Web on static CDN. PWA installable.
**Project Type**: Monorepo — backend API + web SPA + PWA + shared package.
**Performance Goals**: Marketplace list p95 < 400 ms. Accept-offer p95 < 500 ms. Publish p95 < 300 ms.
**Constraints**: Optimistic concurrency on accept is non-negotiable. Idempotency on accept-offer is mandatory. Every state transition audited. Multi-tenant scoping applies to service group reads and manual assignment; marketplace reads are scoped by inspector eligibility (cross-tenant by design).
**Scale/Scope**: Phase 1 target: tens of groups per tenant per day, dozens of active inspectors competing on the marketplace.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | Module split into `domain/`, `application/`, `infrastructure/`, `interfaces/`. Domain layer carries `ServiceGroupEntity`, `ServiceGroupValidator`, and typed errors. Cross-module reads use domain ports (`IAppointmentRepository`, `IInspectorRepository`, `IServiceRegionRepository`) — no direct imports of foreign Prisma entities. |
| II. Multi-Tenant Safety | PASS | Service group reads scoped by `tenantId` for operator flows. Marketplace reads are intentionally cross-tenant (scoped by inspector eligibility), documented in the spec. Accept flow validates inspector tenant eligibility via `isEligibleForTenant`. |
| III. Test-Driven Development | PARTIAL | Unit and integration coverage present for every use case. Optimistic-lock race test is the critical TDD gate for Phase 2 changes. Verify 80%+ coverage on this critical module during review. |
| IV. Contract-First APIs | PASS | Zod schemas in `packages/shared/src/schemas/service-group.ts` are authoritative. Human projection in [contracts/](./contracts/). OpenAPI generated from Fastify routes. |
| V. Simplicity & Minimal Impact | PASS | Each use case focuses on one transition. State predicates (`canPublish`, `canAccept`, etc.) live on the entity to keep use cases readable. Phase 2 additions must stay justified. |

**Gate result**: PASS for Phase 1 as implemented.

## Project Structure

### Documentation (this feature)

```text
specs/005-service-groups-marketplace/
├── spec.md
├── plan.md
├── data-model.md
├── contracts/
│   ├── README.md
│   ├── service-group-endpoints.md
│   └── marketplace-endpoints.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/backend/
├── prisma/schema.prisma                             # ServiceGroup, ServiceGroupStatus, PriorityMode, ServiceGroupExceptionType
└── src/
    └── modules/
        └── service-group/
            ├── domain/
            │   ├── service-group.entity.ts          # entity + state predicates
            │   ├── service-group.validator.ts       # size, service-type, status, group-membership invariants
            │   ├── service-group.repository.ts      # port (incl. acceptOptimistic, scheduleAppointments, linkAppointments)
            │   └── service-group.errors.ts
            ├── application/
            │   └── use-cases/
            │       ├── create-service-group.use-case.ts
            │       ├── get-service-group.use-case.ts
            │       ├── list-service-groups.use-case.ts
            │       ├── update-service-group.use-case.ts
            │       ├── publish-service-group.use-case.ts
            │       ├── assign-inspector-manually.use-case.ts
            │       ├── cancel-service-group.use-case.ts
            │       ├── reject-service-group.use-case.ts
            │       ├── get-marketplace-offers.use-case.ts
            │       └── accept-offer.use-case.ts
            ├── infrastructure/
            │   └── prisma-service-group.repository.ts
            └── interfaces/
                ├── service-group.routes.ts          # /v1/service-groups/*
                └── marketplace.routes.ts            # /v1/marketplace/offers/*

apps/web/src/features/
├── service-groups/                                  # operator group list, detail, create wizard, assign drawer
└── marketplace/                                     # operator-facing marketplace view (if applicable)

apps/pwa/src/features/
└── offers/                                          # inspector marketplace list + detail + accept action

packages/shared/src/
├── enums/service-group.ts                           # ServiceGroupStatus, PriorityMode, ServiceGroupExceptionType
└── schemas/service-group.ts                         # all Zod schemas

apps/backend/tests/
├── unit/service-group/                              # use-case + validator tests
└── integration/service-group/                       # route tests including race conditions
```

**Structure Decision**: One Clean-Architecture module at `apps/backend/src/modules/service-group/` holding both operator (`/v1/service-groups`) and inspector (`/v1/marketplace/offers`) routes. They share the same entity and repository so splitting them into separate modules would only duplicate wiring. The two interface files keep the route concerns clean.

## Cross-Feature Dependencies

- **Feature 001-identity-access** — Supplies `AuthContext`; the marketplace relies on `inspectorId` being present in the token for INSP actors.
- **Feature 002-tenants-branches** — Service group `tenant_id` FK. Auth middleware uses `tenants.status` to reject inactive tenants.
- **Feature 004-service-catalog** — `service_type_id` FK; region resolver (tenant-scoped) for publication and manual assignment; pricing rules read by marketplace offers for `payoutEstimate` (`implementation decision` — computed inline, not a dossiê field). Spatial matching depends on 004#GAP-004 + 004#CORRECTION-004 (`tenant_id` on regions). Future spatial implementation should use `ST_Intersects` (boundary inclusion per dossiê).
- **Feature 006-appointments** — Owns `Appointment.service_group_id` FK and the state machine. This feature writes `AWAITING_INSPECTOR` (on create) and `SCHEDULED` (on accept / manual assign) through `IAppointmentRepository.update`. Any state machine change must coordinate here.
- **Feature 009-notifications** — Will consume service group domain events (GAP-005) to notify inspectors of new offers and cancelations.
- **Feature 010-billing-ledger** — Reads `ServiceGroup` and its appointments to compute financial entries when the group reaches `ACCEPTED` and the underlying appointments later reach `DONE`.
- **Feature 011-reports-audit** — Receives audit records. Potential GAP-010 report on exception usage.

## Security & Operational Notes

- **Optimistic lock**: `acceptOptimistic(groupId, inspectorId, now)` is a conditional UPDATE returning the number of affected rows. A zero result means another inspector won the race. This is the only correct pattern — do not replace with `SELECT ... FOR UPDATE` without an explicit plan.
- **Idempotency cache**: accept-offer writes to `IIdempotencyService` with scope `accept-offer` and 24 h retention. Default key includes groupId + inspectorId so simultaneous retries from the same inspector converge. Clients supplying their own `Idempotency-Key` get a custom cache entry (GAP-007 covers the replay-identity check).
- **Appointment drift check**: even after the optimistic lock succeeds, the use case re-reads appointments to verify none moved out of `AWAITING_INSPECTOR` between the claim and the re-read. This guards against a rare ordering where manual-assign or cancel happens inside the same millisecond.
- **Marketplace is cross-tenant for INSP by design** (`Source: dossier — modelo-dados-executavel.md:98 "marketplace sao scoped por inspector_id, nunca por tenant_id"`): inspectors see offers from every tenant they are eligible for. OP is tenant-scoped and manages groups only within their own tenant. Reviewers MUST NOT add tenant-scope filtering to the marketplace list or accept endpoints — that would break the inspector experience. Eligibility is the filter, not `tenant_id`.
- **Priority expiry semantics**: `priority_expires_at` is a *cutoff* — once passed, neither publication nor acceptance may succeed. This is distinct from `scheduled_date` which is the actual service date.
- **Size limits are exception-aware**: the domain validator picks limits based on `exception_type`. Reviewers adding new exception types must update `EXCEPTION_LIMITS` and add matching Zod validation.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Optimistic concurrency on accept (no row locks) | Inspectors race on the same offer; pessimistic locks would serialize the marketplace and hurt throughput. | `SELECT ... FOR UPDATE` would bottleneck accept endpoints and complicate connection pooling with PgBouncer. |
| Idempotency service coupled into accept-offer | Accept is a money-impact action; a duplicate retry must not double-schedule appointments. | No idempotency would force clients to implement exactly-once at the HTTP level, which is unreliable over mobile networks. |
| Marketplace and operator routes share the same module | They operate on the same entity; splitting modules would duplicate the repository wiring for no benefit. | Separate modules would force a second repository and re-export the entity. |
| Manual assignment bypass of marketplace | Operations staff handle edge cases (VIP tenants, inspectors who cannot use the PWA). | A marketplace-only flow would leave operators without an escape hatch for exceptions. |
| Exception types with different size limits | Low-density regions and isolated services cannot meet the 5-appointment minimum. | Hard minimum of 5 would make the platform unusable in rural areas. |

Phase 1 deviations above are justified. Phase 2 items must document any new deviation here.

## Execution Strategy

> Detailed task definitions in [`tasks.md`](./tasks.md).

### Phase 2 — Gap Closure

#### Wave 1: PostGIS + Quick Fixes (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 1a | GAP-001 — Marketplace spatial indexing | T100–T103 | Rewrite offer query to use ST_Intersects. Depends on 003#GAP-003 + 004#GAP-004 (both done). |
| 1b | GAP-007 — Accept-offer idempotency check | T160–T161 | Tiny defense-in-depth fix. |
| 1c | GAP-008 — Manual assign idempotency | T170–T172 | Small idempotency scope addition. |
| 1d | GAP-009 — Wider update schema for DRAFT | T180–T182 | Schema change, no dependencies. |

#### Wave 2: Lifecycle + Expiry (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 2a | GAP-003 — Expire after priority window | T120–T124 | Scheduled job + new status or auto-cancel. |
| 2b | GAP-004 — Re-publish after cancellation | T130–T132 | Decision + implementation. |
| 2c | GAP-005 — Domain events | T140–T143 | Depends on DomainEventBus (002#GAP-005, done). |

#### Wave 3: Refactoring + Views (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 3a | GAP-002 — Extract PricingResolver | T110–T114 | Cross-cutting with 010-billing. |
| 3b | GAP-006 — Lightweight marketplace list | T150–T153 | Split list/detail endpoints. |

#### Wave 4: Configuration (serial)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 4a | GAP-010 — Exception usage report | T190–T191 | Coordinate with 011-reports-audit. |
| 4b | GAP-011 — Priority offer configurability | T195–T198 | Depends on 002#GAP-002 (rich settings, done). |

### Parallelization Summary

```
Wave 1:  GAP-001 ══╗
         GAP-007 ══╬══ (all parallel)
         GAP-008 ══╝
         GAP-009 ══╝

Wave 2:  GAP-003 ══╗
         GAP-004 ══╬══ (all parallel)
         GAP-005 ══╝

Wave 3:  GAP-002 ══╗
         GAP-006 ══╝ (parallel)

Wave 4:  GAP-010 ══╗
         GAP-011 ══╝ (parallel)
```
