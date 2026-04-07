---
description: "Implementation and backlog tracking for Service Catalog (service type + service region + pricing rule)"
---

# Tasks: Service Catalog

**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), [`data-model.md`](./data-model.md), [`contracts/`](./contracts/)
**Tests**: Required per constitution Principle III. Pricing rule resolution is consumed by billing (feature 010) and must be exhaustively unit-tested.
**Organization**: Two sections — Baseline Implemented (shipped) and Open Backlog (Phase 2/3). Only open backlog items are new work.

## Format

- `[x]` shipped; `[ ]` open.
- `[P]` may run in parallel with other `[P]` tasks in the same group.
- `[Story]` maps to a user story in `spec.md` (US1–US3) or a `GAP-xxx`.

---

# SECTION 1 — Baseline Implemented

> Already done on the active branch. Do not reimplement.

## Setup & Foundational (shipped)

- [x] T001 Prisma schema: `ServiceType`, `ServicePriceRule`, `ServiceRegion`, `InspectorRegion`, and enums `ServiceTypeFlowType`, `ServiceTypeStatus`, `PayoutType`, `PriceRuleStatus`, `RegionStatus` in `apps/backend/prisma/schema.prisma`.
- [x] T002 Shared enums in `packages/shared/src/enums/{service-type,service-region,pricing-rule}.ts`.
- [x] T003 Shared Zod schemas in `packages/shared/src/schemas/{service-type,service-region,pricing-rule}.ts`.
- [x] T004 Domain entities (`ServiceTypeEntity`, `ServiceRegionEntity`, `PricingRuleEntity`) and errors.
- [x] T005 Domain port `IServiceTypeRepository`, `IServiceRegionRepository`, `IPricingRuleRepository`.
- [x] T006 Pure domain function `resolvePricingRule(rules, branchId)` in `apps/backend/src/modules/pricing-rule/domain/resolve-pricing-rule.ts`.
- [x] T007 Prisma adapters: `PrismaServiceTypeRepository`, `PrismaServiceRegionRepository`, `PrismaPricingRuleRepository`.

## US1 — Service type catalog (shipped)

- [x] T010 [US1] `CreateServiceTypeUseCase` with AM-only guard, code uniqueness, audit.
- [x] T011 [US1] `GetServiceTypeUseCase`, `ListServiceTypesUseCase`.
- [x] T012 [US1] `UpdateServiceTypeUseCase` with AM-only guard.
- [x] T013 [US1] Routes POST/GET/PATCH under `/v1/service-types`.
- [x] T014 [US1] Unit tests in `apps/backend/tests/unit/service-type/`.
- [x] T015 [US1] Integration tests in `apps/backend/tests/integration/service-type/`.
- [x] T016 [US1] Web pages and components under `apps/web/src/features/service-types/`.

## US2 — Service region and resolve (shipped)

- [x] T020 [US2] `CreateServiceRegionUseCase`, `GetServiceRegionUseCase`, `ListServiceRegionsUseCase`, `UpdateServiceRegionUseCase` (AM/OP guards).
- [x] T021 [US2] `DeactivateServiceRegionUseCase` requiring `reason`, audit.
- [x] T022 [US2] `DeleteServiceRegionUseCase` requiring `INACTIVE` state, audit, cascade `inspector_regions`.
- [x] T023 [US2] `ResolveRegionsUseCase` returning regions, inspector counts, unmatched ids (25 appointment cap).
- [x] T024 [US2] Routes under `/v1/service-regions` including `resolve` and `deactivate` actions.
- [x] T025 [US2] Unit tests in `apps/backend/tests/unit/service-region/`.
- [x] T026 [US2] Integration tests exercising deactivate → delete sequence and resolve with unmatched ids.

## US3 — Pricing rules (shipped)

- [x] T030 [US3] `CreatePricingRuleUseCase` with RBAC (AM/OP any tenant, CL_ADMIN own), service type existence, branch validation, uniqueness check, audit.
- [x] T031 [US3] `ListPricingRulesUseCase` and `UpdatePricingRuleUseCase`.
- [x] T032 [US3] Routes POST/GET/PATCH under `/v1/pricing-rules`.
- [x] T033 [US3] Unit tests in `apps/backend/tests/unit/pricing-rule/` including `resolvePricingRule` pure function coverage (branch wins, tenant fallback, none-match).
- [x] T034 [US3] Integration tests including duplicate rejection and CL_ADMIN cross-tenant denial.
- [x] T035 [US3] `PricingRulesSection.tsx` component in the web tenant detail page.

## Cross-cutting (shipped)

- [x] T095 Container wiring in `apps/backend/src/main/container.ts` injecting all three sub-modules, including the cross-module reads to `ITenantRepository`, `IBranchRepository`, and `IServiceTypeRepository`.
- [x] T096 Shared `GeoJSON Polygon` schema strict validation in `packages/shared/src/schemas/service-region.ts`.

---

# SECTION 2 — Open Backlog

> Only pick up work from this section. Every task must follow TDD and produce an audit record on write paths.

## Phase 2 — Gap closure

### GAP-001 — `requiresTenantConfirmation` default drift

- [ ] T100 [GAP-001] Make `CreateServiceTypeUseCase.input.requiresTenantConfirmation` either required or default to `true` explicitly (remove the `?? false` fallback).
- [ ] T101 [GAP-001] Regression unit test directly invoking the use case without the Zod schema and asserting the default.
- [ ] T102 [GAP-001] Audit all existing service type rows; flag any `requiresTenantConfirmation = false` that was set unintentionally.

### GAP-002 — Pricing rule currency coupling

- [ ] T110 [GAP-002] Decision: either freeze currency on the rule at creation (adds `currency` column) or forbid tenant currency change once any rule exists. Capture in a design doc under this feature.
- [ ] T111 [GAP-002] Implement the chosen option with a Prisma migration (expand/contract if adding a column).
- [ ] T112 [GAP-002] Backfill existing rules with the current tenant currency.
- [ ] T113 [GAP-002] Tests for the frozen currency path (if chosen) and for tenant currency change rejection (if chosen).

### GAP-003 — `bonus_rule_json` schema contract

- [ ] T120 [GAP-003] Coordinate with feature 010-billing to enumerate bonus rule shapes currently consumed (volume tiers, service-type bonuses, day-of-week, caps, etc.).
- [ ] T121 [GAP-003] Define `bonusRuleSchema` in `packages/shared/src/schemas/pricing-rule.ts` and validate on write.
- [ ] T122 [GAP-003] Backfill / log offenders before enforcing strict mode.
- [ ] T123 [GAP-003] Tests.

### CORRECTION-004 — ServiceRegion tenant_id migration

> **APPROVED RULE — code/schema diverges.** The dossiê requires `service_regions.tenant_id` as mandatory. The column does not exist in the current schema. This migration is a prerequisite for GAP-004 (spatial matching must be tenant-scoped) and for GAP-006 (multi-polygon support).

- [ ] T126 [CORRECTION-004] Prisma migration: add `tenant_id uuid NOT NULL` to `service_regions` with FK → `tenants.id` (expand phase: add nullable first, backfill, then set NOT NULL).
- [ ] T127 [CORRECTION-004] Add `UNIQUE (tenant_id, name)` index; drop the current name-only uniqueness if any.
- [ ] T128 [CORRECTION-004] Update all repository methods, use cases, and routes to require and scope by `tenant_id`.
- [ ] T129 [CORRECTION-004] Backfill script to assign each existing region to the correct tenant (requires operational decision on orphaned regions).
- [ ] T129b [CORRECTION-004] Tests: region CRUD scoped by tenant; cross-tenant region access rejected.

### GAP-004 — PostGIS `geom` population and spatial index

- [ ] T130 [GAP-004] Decide write strategy (application-level `ST_GeomFromGeoJSON` on save, or database trigger on `geojson` change).
- [ ] T131 [GAP-004] Prisma migration adding `GIST` index on `service_regions.geom` and the trigger if chosen.
- [ ] T132 [GAP-004] Rewrite `PrismaServiceRegionRepository.resolveRegionsForAppointments` to use `ST_Intersects(geom, ST_SetSRID(ST_MakePoint(lng, lat), 4326))` (includes boundary per dossiê) against `properties.lat`/`lng`, scoped by appointment `tenant_id`. Depends on CORRECTION-004 (`tenant_id` column).
- [ ] T133 [GAP-004] Backfill existing rows from `geojson`.
- [ ] T134 [GAP-004] Benchmark resolve endpoint before/after with a 25-appointment fixture.
- [ ] T135 [GAP-004] Coordinate with 003#GAP-003 (property PostGIS backfill) — regions and properties must both be in PostGIS for spatial joins to work.

### GAP-005 — Pricing rule NULL-branch uniqueness verification

- [ ] T140 [GAP-005] Audit `PrismaPricingRuleRepository.findByUnique` — confirm it uses `branch_id IS NULL` explicitly and not `branch_id = $value`.
- [ ] T141 [GAP-005] Add an integration test that would fail if two tenant-level rules for the same `(tenant, service_type)` could be created concurrently.
- [ ] T142 [GAP-005] If the check is insufficient, add a partial unique index `UNIQUE (tenant_id, service_type_id) WHERE branch_id IS NULL` via Prisma migration.

### GAP-006 — MultiPolygon + hole support in service regions

- [ ] T150 [GAP-006] Widen `geojsonPolygonSchema` in `packages/shared/src/schemas/service-region.ts` to accept `Polygon | MultiPolygon` with optional interior rings.
- [ ] T151 [GAP-006] Update the web map editor to draw multi-polygon regions.
- [ ] T152 [GAP-006] Update resolver to handle multi-polygon matching. Blocked by GAP-004 for the spatial path.
- [ ] T153 [GAP-006] Tests with realistic fixtures (e.g., metro region with harbor exclusion).

### GAP-007 — Pricing rule history

- [x] T160 [GAP-007] Decision: audit log replay, no history table. See `specs/004-service-catalog/pricing-history-design.md`.
- [x] T161 [GAP-007] N/A — history table not chosen. Added `currency` to update audit snapshots for completeness.
- [x] T162 [GAP-007] Query pattern and pseudocode documented in `specs/004-service-catalog/pricing-history-design.md`.

### GAP-008 — Service type delete policy

- [ ] T170 [GAP-008] Runbook `docs/ops/service-type-hard-delete.md` covering safety checks (no pricing rules, no appointments, no service groups).
- [ ] T171 [GAP-008] Decision: expose an AM-only endpoint? Capture in runbook; implement only if demand justifies.

### GAP-009 — Region deactivation notifications

- [ ] T180 [GAP-009] Emit a `service_region.deactivated.v1` domain event on deactivation.
- [ ] T181 [GAP-009] Feature 009-notifications consumes the event and notifies inspectors whose mappings intersect the deactivated region.
- [ ] T182 [GAP-009] Tests asserting exactly-once notification per affected inspector.

### GAP-010 — Larger resolve-regions batches

- [x] T190 [GAP-010] Raise the `resolveRegionsSchema.appointmentIds` cap from 25 to 200. No streaming needed — PostGIS handles it in a single query.
- [ ] T191 [GAP-010] Benchmark at new cap with GAP-004 in place.
- [ ] T192 [GAP-010] Update the web portal UX to avoid client-side chunking.

## Phase 3 — Polish & cross-cutting

- [ ] T200 [P] Verify service-type, service-region, pricing-rule module coverage ≥ 80% with `pnpm --filter backend test -- --coverage`.
- [ ] T201 [P] End-to-end assertion: every write path emits exactly one audit record with complete `before`/`after` snapshots.
- [ ] T202 Confirm OpenAPI export reflects all three sub-module endpoints and the frontend client regenerates cleanly.
- [ ] T203 There is no legacy spec for this feature — no supersede step required. Record the decision and remove this task on review completion.
- [ ] T204 Consider splitting this spec into three features (004a-service-types, 004b-service-regions, 004c-pricing-rules) if any of them grows enough to warrant dedicated plans. Revisit after Phase 2.

---

## Dependencies & Execution Order

- **GAP-004** (PostGIS on regions) pairs with **003#GAP-003** (PostGIS on properties). Both must land together for spatial joins to work.
- **GAP-003** blocks self-serve bonus rule configuration by CL_ADMIN and any feature that surfaces bonus summaries to inspectors.
- **GAP-001** and **GAP-005** are small regression/correctness tasks and should land early.
- **GAP-002** requires a product decision — schedule a short design discussion before implementation.
- **GAP-009** depends on the domain event bus introduced by **002#GAP-005**.

## Notes

- Every open-backlog task must follow TDD (red → green → refactor) per constitution Principle III.
- Reviewers should resist "fixing" the service type global scoping — it is intentional (platform curates a single menu of services). **Service region is NOT global** — it is tenant-scoped per the approved dossiê (CORRECTION-004). The code currently treats it as global, which is a divergence to correct. Any PR touching service regions should move toward tenant scoping, not reinforce the current global model.
- Close each `GAP-xxx` by promoting it in `spec.md` (Known Gaps table) from `Status: GAP` to `Status: IMPLEMENTED` and updating the cross-feature `specs/GAPS.md` index.
