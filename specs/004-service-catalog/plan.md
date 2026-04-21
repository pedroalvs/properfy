# Implementation Plan: Service Catalog

**Branch**: `004-service-catalog` | **Date**: 2026-04-05 | **Spec**: [spec.md](./spec.md)
**Feature Status**: IMPLEMENTED (Phase 1) — Phase 2/3 gaps tracked in [tasks.md](./tasks.md).

## Summary

Own the three catalog concerns that drive pricing and geographic matching: platform-wide service types, platform-wide service regions, and tenant-scoped pricing rules. These are referenced by every appointment (feature 006), every marketplace offer (feature 005), and every financial entry (feature 010). Kept together as a single spec-kit feature because they share a release cadence and a set of consumers.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.

**Primary Dependencies**

- Backend: Fastify, Prisma, Zod, shared `AuditService`. No async workers specific to this feature.
- Shared: Zod schemas and enums (`ServiceTypeFlowType`, `ServiceTypeStatus`, `PayoutType`, `PriceRuleStatus`, `RegionStatus`).
- Cross-module ports: `ITenantRepository`, `IBranchRepository` (read-only; used by pricing rule creation to validate tenant/branch), `IServiceTypeRepository` (consumed by pricing rule and, downstream, feature 006).
- Web: React + Vite pages under `apps/web/src/features/service-types/` and the `PricingRulesSection` component under `apps/web/src/features/tenants/components/`.

**Storage**

- PostgreSQL (Supabase). Tables: `service_types`, `service_price_rules`, `service_regions`, `inspector_regions`.
- PostGIS: `service_regions.geom GEOMETRY(Polygon, 4326)` declared via `Unsupported(...)`, not populated in Phase 1 (GAP-004). `service_regions.geojson` holds the application source of truth.

**Testing**

- Unit: Vitest for use cases and the `resolvePricingRule` domain function.
- Integration: Supertest against real Postgres for all three sub-modules.
- Frontend: Vitest + RTL for service type pages and pricing rule section.

**Target Platform**: Backend on Fly.io. Web on static CDN.
**Project Type**: Monorepo — backend API + web SPA + shared package.
**Performance Goals**: Service type and pricing rule list/detail p95 < 300 ms. Region resolve p95 < 500 ms for 200 appointment IDs (PostGIS spatial indexes via GAP-004).
**Constraints**: All writes audited. Pricing rule uniqueness is `(tenant_id, service_type_id, branch_id)` including NULL branch. Service type is global (AM only); pricing rule is tenant-scoped; service region is **tenant-scoped** (CORRECTION-004 — code currently treats it as global, which is a divergence). Do not leak the scope distinction to consumers.
**Scale/Scope**: Phase 1 target: dozens of service types, hundreds of regions, a few pricing rules per tenant.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | Three modules each structured into `domain/`, `application/`, `infrastructure/`, `interfaces/`. Pricing rule depends on service type and tenant/branch via domain ports — no cross-module Prisma imports. Pure `resolvePricingRule` lives in domain with its own unit test surface. |
| II. Multi-Tenant Safety | PARTIAL — CORRECTION-004 pending | Service type is an intentional exception: global catalog curated by AM only — documented in the spec. Pricing rule scopes by tenant on every read/write; CL_ADMIN cannot set foreign `tenantId`. **Service region is tenant-scoped at storage** (CORRECTION-004); AM and OP are both cross-tenant operators (per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003) and supply `tenantId` in mutation payloads. Until storage isolation is enforced everywhere, region access is guarded at the use-case layer. |
| III. Test-Driven Development | PARTIAL | Unit and integration coverage present across all three sub-modules. Phase 2/3 items must land with TDD. Verify critical-module 80%+ during review. |
| IV. Contract-First APIs | PASS | Shared Zod schemas in `packages/shared/src/schemas/{service-type,service-region,pricing-rule}.ts` are authoritative. OpenAPI generated from Fastify routes. Human projection in [contracts/](./contracts/). |
| V. Simplicity & Minimal Impact | PASS | `resolvePricingRule` is a 20-line pure function — no abstractions beyond what the domain needs. Phase 2 additions must stay justified. |

**Gate result**: PASS for Phase 1 as implemented.

## Project Structure

### Documentation (this feature)

```text
specs/004-service-catalog/
├── spec.md
├── plan.md
├── data-model.md
├── contracts/
│   ├── README.md
│   ├── service-type-endpoints.md
│   ├── service-region-endpoints.md
│   └── pricing-rule-endpoints.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/backend/
├── prisma/schema.prisma                              # ServiceType, ServicePriceRule, ServiceRegion, InspectorRegion + enums
└── src/
    └── modules/
        ├── service-type/
        │   ├── domain/
        │   │   ├── service-type.entity.ts
        │   │   ├── service-type.repository.ts        # port
        │   │   └── service-type.errors.ts
        │   ├── application/use-cases/
        │   │   ├── create-service-type.use-case.ts
        │   │   ├── get-service-type.use-case.ts
        │   │   ├── list-service-types.use-case.ts
        │   │   └── update-service-type.use-case.ts
        │   ├── infrastructure/prisma-service-type.repository.ts
        │   └── interfaces/service-type.routes.ts
        ├── service-region/
        │   ├── domain/
        │   │   ├── service-region.entity.ts
        │   │   ├── service-region.repository.ts      # port (includes resolveRegionsForAppointments)
        │   │   └── service-region.errors.ts
        │   ├── application/use-cases/
        │   │   ├── create-service-region.use-case.ts
        │   │   ├── get-service-region.use-case.ts
        │   │   ├── list-service-regions.use-case.ts
        │   │   ├── update-service-region.use-case.ts
        │   │   ├── deactivate-service-region.use-case.ts
        │   │   ├── delete-service-region.use-case.ts
        │   │   └── resolve-regions.use-case.ts
        │   ├── infrastructure/prisma-service-region.repository.ts
        │   └── interfaces/service-region.routes.ts
        └── pricing-rule/
            ├── domain/
            │   ├── pricing-rule.entity.ts
            │   ├── pricing-rule.repository.ts        # port (findByUnique + findAll)
            │   ├── pricing-rule.errors.ts
            │   └── resolve-pricing-rule.ts           # pure function
            ├── application/use-cases/
            │   ├── create-pricing-rule.use-case.ts
            │   ├── list-pricing-rules.use-case.ts
            │   └── update-pricing-rule.use-case.ts
            ├── infrastructure/prisma-pricing-rule.repository.ts
            └── interfaces/pricing-rule.routes.ts

apps/web/src/features/
├── service-types/                                    # list, detail, form drawer
└── tenants/components/PricingRulesSection.tsx        # tenant-scoped pricing UI

packages/shared/src/
├── enums/
│   ├── service-type.ts                               # ServiceTypeFlowType, ServiceTypeStatus
│   ├── service-region.ts                             # RegionStatus
│   └── pricing-rule.ts                               # PayoutType, PriceRuleStatus
└── schemas/
    ├── service-type.ts
    ├── service-region.ts
    └── pricing-rule.ts

apps/backend/tests/
├── unit/{service-type,service-region,pricing-rule}/
└── integration/{service-type,service-region,pricing-rule}/
```

**Structure Decision**: Three small Clean-Architecture modules colocated under `apps/backend/src/modules/`. One spec-kit feature wraps them because they share consumers and a release cadence. A future split (one spec per module) is possible if any of the three grows enough to deserve dedicated planning.

## Cross-Feature Dependencies

- **Feature 002-tenants-branches** — Pricing rule creation reads `ITenantRepository` for currency (response) and `IBranchRepository` for branch validation.
- **Feature 005-service-groups-marketplace** — Service regions (tenant-scoped) drive marketplace offer matching within a tenant; service groups carry `service_type_id` and `region_id` FKs. Marketplace matching must scope region lookups by the appointment's `tenant_id`.
- **Feature 006-appointments** — Every appointment references `service_type_id`. `flowType` and `requiresTenantConfirmation` drive the state machine. Feature 006 consumes `resolvePricingRule` at scheduling time (or financial entry time — verify ownership).
- **Feature 010-billing-ledger** — Reads pricing rules to compute `TENANT_DEBIT` and `INSPECTOR_PAYOUT` entries. Depends on `bonus_rule_json` shape (GAP-003).
- **Feature 011-reports-audit** — Consumes audit records emitted by all three sub-modules.
- **Inspector module** — Owns `InspectorRegion` mapping creation (`inspector_regions` table). The inspector is global/multi-tenant, but each `InspectorRegion` row links to a tenant-scoped `ServiceRegion` — the tenant of the region defines the operational context of the coverage mapping. Read by the resolve-regions use case for inspector counts.

## Security & Operational Notes

- **Service type is an intentional tenant-scope exception**: this is the only business entity without `tenant_id`. Documented explicitly in the spec and in the constitution's Principle II (multi-tenant safety). Reviewers should be careful not to "fix" this by adding tenant scoping.
- **Pricing rule uniqueness with NULL branch**: Postgres allows multiple NULLs in a unique index. The application-level duplicate check via `findByUnique` must explicitly compare `branch_id IS NULL`. Audit the repository implementation (GAP-005).
- **ServiceRegion tenant-scope divergence (CORRECTION-004)**: the approved dossiê requires regions to be per-tenant (`tenant_id` mandatory, names unique within tenant). The code currently stores regions without `tenant_id` (global). Until corrected, region data lacks tenant isolation. Any reviewer or implementer must treat the current global behavior as a **known divergence**, not as the target architecture.
- **PostGIS `geom` column unused**: declared via `Unsupported(...)` so Prisma ignores it. Region matching uses in-memory GeoJSON comparison in `PrismaServiceRegionRepository.resolveRegionsForAppointments`. This works at current scale but does not use spatial indexes; fix tracked as GAP-004. The dossiê recommends that a point on the boundary counts as valid coverage (`ST_Contains` with border inclusion or `ST_Intersects`).
- **Currency coupling**: pricing rules carry no currency field. Changes to a tenant's currency silently re-denominate existing rules. Decision pending (GAP-002).
- **Region delete cascade**: `InspectorRegion` rows cascade on region delete. Active regions cannot be deleted (two-step delete: deactivate first, then delete).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Service type as a global entity (no `tenant_id`) | The platform curates a single menu of services. Per-tenant service types would force every tenant to redefine the same four or five rows. | Per-tenant service catalogs duplicate metadata and complicate cross-tenant reporting (feature 011). |
| ~~Service region as a global entity~~ **DIVERGENCE -- must be corrected** | ~~Inspectors are contracted across tenants; the marketplace matches at the platform level.~~ **CORRECTION (2026-04-06)**: The dossier establishes that service regions are tenant-scoped. The current codebase stores them without `tenant_id`, which is a divergence that must be corrected. A `tenant_id` column must be added to `service_regions` and all queries must be scoped accordingly. An inspector covering multiple tenants will have separate region mappings per tenant. | The original "global entity" justification was based on an incorrect reading of the business rules. |
| `resolvePricingRule` as a pure domain function (not a repository method) | Lets the caller pre-fetch all candidate rules (e.g., a batch of appointments) and resolve without additional queries. | Putting the selection logic in the repository couples the selection algorithm to Prisma and prevents batching. |

Phase 1 deviations above are justified. Phase 2 items that reintroduce tenant scoping to service types or regions must justify themselves here.

## Execution Strategy

> Detailed task definitions live in [`tasks.md`](./tasks.md).

### Phase 2 — Gap Closure

#### Wave 1: Quick Corrections + Small Fixes (serial prerequisite then parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 1a (serial) | CORRECTION-004 — ServiceRegion tenant_id | T126–T129b | **BLOCKER.** Divergence from dossiê. Must land before GAP-004/GAP-006. Adds `tenant_id` to `service_regions`, migrates all queries to tenant-scoped. |
| 1b (parallel after 1a) | GAP-001 — requiresTenantConfirmation default | T110–T112 | Tiny fix. No dependencies. |
| 1c (parallel after 1a) | GAP-005 — NULL-branch uniqueness | T140–T142 | Audit + partial index. No dependencies. |

#### Wave 2: PostGIS + Spatial (serial, depends on CORRECTION-004 + 003#GAP-003)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 2 | GAP-004 — PostGIS geom population | T130–T135 | Backfill geom from GeoJSON, GIST index, rewrite resolver to ST_Intersects. |

#### Wave 3: Schema Contracts + Decisions (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 3a | GAP-002 — Currency decoupling | T113–T115 | Decision: freeze currency on rule or forbid tenant currency change. |
| 3b | GAP-003 — bonus_rule_json schema | T120–T123 | Define Zod schema for bonus rules. |
| 3c | GAP-008 — Service type delete runbook | T170–T171 | Documentation only. |

#### Wave 4: Advanced Features (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 4a | GAP-006 — MultiPolygon support | T150–T153 | Depends on GAP-004. |
| 4b | GAP-007 — Pricing rule history | T160–T162 | Decision + implementation. |
| 4c | GAP-009 — Region deactivation notifications | T180–T182 | Depends on DomainEventBus from 002#GAP-005. |
| 4d | GAP-010 — Larger resolve batches | T190–T192 | Depends on GAP-004 for spatial perf. |

### Parallelization Summary

```
Wave 1:  CORRECTION-004 (serial) → GAP-001 ══╗
                                    GAP-005 ══╝ (parallel)

Wave 2:  GAP-004 (serial, depends on Wave 1)

Wave 3:  GAP-002 ══╗
         GAP-003 ══╬══ (all parallel)
         GAP-008 ══╝

Wave 4:  GAP-006 ══╗
         GAP-007 ══╬══ (all parallel)
         GAP-009 ══╝
         GAP-010 ══╝
```
