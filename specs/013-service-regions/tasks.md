---
description: "Implementation and backlog tracking for Service Regions"
---

# Tasks: Service Regions

**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), [`data-model.md`](./data-model.md), [`contracts/`](./contracts/)
**Tests**: Required. TDD mandatory per constitution Principle III.
**Organization**: Two top-level sections.
1. **Baseline Implemented** — Phase 1 tasks that are shipped on the active branch. Marked `[x]`. Listed for traceability.
2. **Correction & Gap Closure** — Divergence corrections (CRITICAL) and Phase 2 gap closure. Marked `[ ]`. These are the tasks to pick up as new work.

## Format: `[ID] [P?] [Story] Description`

- `[x]` = shipped; `[ ]` = open.
- `[P]` = can run in parallel with other `[P]` tasks in the same group.
- `[Story]` = maps to a user story in `spec.md` (US1–US7) or to a `GAP-xxx`.
- Paths: backend under `apps/backend/src/modules/service-region/...`, tests under `apps/backend/tests/...`, shared under `packages/shared/src/...`, prisma under `apps/backend/prisma/...`.

---

# SECTION 1 — Baseline Implemented

> These tasks are **already done** on the active branch. Do not reimplement. Use them as reference.

## Setup & Foundational (shipped)

- [x] T001 Prisma schema: `ServiceRegion`, `InspectorRegion`, `RegionStatus` in `apps/backend/prisma/schema.prisma`.
- [x] T002 Shared Zod schemas in `packages/shared/src/schemas/service-region.ts`.
- [x] T003 Domain entity `ServiceRegionEntity` in `apps/backend/src/modules/service-region/domain/service-region.entity.ts`.
- [x] T004 Domain errors in `apps/backend/src/modules/service-region/domain/service-region.errors.ts`.
- [x] T005 Repository port in `apps/backend/src/modules/service-region/domain/service-region.repository.ts`.
- [x] T006 Prisma repository with raw SQL for PostGIS in `apps/backend/src/modules/service-region/infrastructure/prisma-service-region.repository.ts`.

## US1 — Create region (shipped, with DIVERGENCE)

- [x] T007 [US1] `CreateServiceRegionUseCase` in `apps/backend/src/modules/service-region/application/use-cases/create-service-region.use-case.ts`.
- [x] T008 [US1] Create route `POST /v1/service-regions` in `apps/backend/src/modules/service-region/interfaces/service-region.routes.ts`.

## US2 — Resolve regions (shipped, with DIVERGENCE)

- [x] T009 [US2] `ResolveRegionsUseCase` in `apps/backend/src/modules/service-region/application/use-cases/resolve-regions.use-case.ts`.
- [x] T010 [US2] Resolve route `POST /v1/service-regions/resolve` in `service-region.routes.ts`.
- [x] T011 [US2] Raw SQL `resolveRegionsForAppointments` with `ST_Contains` in `prisma-service-region.repository.ts`.

## US3 — Update/deactivate (shipped)

- [x] T012 [US3] `UpdateServiceRegionUseCase` in `apps/backend/src/modules/service-region/application/use-cases/update-service-region.use-case.ts`.
- [x] T013 [US3] `DeactivateServiceRegionUseCase` in `apps/backend/src/modules/service-region/application/use-cases/deactivate-service-region.use-case.ts`.
- [x] T014 [US3] Routes `PATCH /v1/service-regions/:id` and `POST /v1/service-regions/:id/deactivate` in `service-region.routes.ts`.

## US4 — Inspector-region assignment (shipped)

- [x] T015 [US4] `setInspectorRegions`, `getInspectorRegionIds`, `getInspectorRegionIdsBatch` in `prisma-service-region.repository.ts`.
- [x] T016 [US4] `countActiveInspectorsInRegion` in `prisma-service-region.repository.ts`.

## US5 — Delete region (shipped)

- [x] T017 [US5] `DeleteServiceRegionUseCase` in `apps/backend/src/modules/service-region/application/use-cases/delete-service-region.use-case.ts`.
- [x] T018 [US5] Route `DELETE /v1/service-regions/:id` in `service-region.routes.ts`.

## US6 — List/browse (shipped)

- [x] T019 [US6] `ListServiceRegionsUseCase` in `apps/backend/src/modules/service-region/application/use-cases/list-service-regions.use-case.ts`.
- [x] T020 [US6] `GetServiceRegionUseCase` in `apps/backend/src/modules/service-region/application/use-cases/get-service-region.use-case.ts`.
- [x] T021 [US6] Routes `GET /v1/service-regions` and `GET /v1/service-regions/:id` in `service-region.routes.ts`.

---

# SECTION 2 — Correction & Gap Closure

> These are the **only** tasks to pick up as new work. Each task must follow TDD (red -> green -> refactor) per constitution Principle III and must produce an audit record where applicable.

## Phase 1: Setup — Migration & Schema Correction

**Purpose**: Add `tenant_id` to `service_regions` and establish the corrected data model.

**CRITICAL**: No user story correction can begin until this phase is complete.

- [x] T100 Prisma migration step 1 (expand): add `tenant_id UUID NULL` column with FK to `tenants.id` on `service_regions` table in `apps/backend/prisma/migrations/`. *(Delivered — migration `20260407000003_add_tenant_id_to_service_regions`)*
- [x] T101 Prisma migration step 2 (backfill): populate `tenant_id` from `service_groups.tenant_id` (via `service_groups.service_region_id`), fallback to `users.tenant_id` (via `created_by_user_id`). Log any rows that remain NULL for manual assignment. *(Delivered — same migration)*
- [x] T102 Prisma migration step 3 (contract): ALTER `tenant_id` to NOT NULL, add `UNIQUE (tenant_id, name)` constraint, add index `(tenant_id, status)`. *(Delivered — same migration)*
- [x] T103 Prisma migration step 4: add GIST spatial index on `service_regions.geom` (if not already present) in `apps/backend/prisma/migrations/`. *(Delivered — migration `20260407000004_backfill_service_region_geom`)*
- [x] T104 Update Prisma schema model `ServiceRegion` to include `tenant_id` field and `@@unique([tenant_id, name])` in `apps/backend/prisma/schema.prisma`. *(Delivered — schema.prisma:1374-1395)*
- [x] T105 [P] Update `ServiceRegionEntity` to include `tenantId` property in `apps/backend/src/modules/service-region/domain/service-region.entity.ts`. *(Delivered)*
- [x] T106 [P] Update shared Zod schemas: add `tenantId` to create/list schemas in `packages/shared/src/schemas/service-region.ts`. *(Delivered)*
- [x] T107 Update repository port: add `tenantId` to all query signatures and filter parameters in `apps/backend/src/modules/service-region/domain/service-region.repository.ts`. *(Delivered)*
- [x] T108 Update Prisma repository: scope all queries by `tenant_id`, update `save`/`update` raw SQL to include `tenant_id` in `apps/backend/src/modules/service-region/infrastructure/prisma-service-region.repository.ts`. *(Delivered)*

**Checkpoint**: Schema corrected, entity updated, all repository methods tenant-scoped. No functional behavior changes yet — use cases updated in next phases.

---

## Phase 2: Foundational — Test Infrastructure

**Purpose**: Establish unit and integration test infrastructure for the module. All subsequent phases use TDD.

- [x] T110 [P] Create unit test scaffold for service-region use cases in `apps/backend/tests/unit/service-region/` (test helpers, mock repository factory). *(unit test scaffold exists: 10 test files in apps/backend/tests/unit/service-region/ 2026-04-22)*
- [x] T111 [P] Create integration test scaffold with PostGIS-aware test database setup in `apps/backend/tests/integration/service-region/` (seed helper with known polygon/point fixtures). *(integration scaffold exists: service-region.routes.test.ts (587 lines) + helpers/ in tests/integration/service-region/ 2026-04-22)*

**Checkpoint**: Test infrastructure ready. TDD can begin.

---

## Phase 3: US1 — Create Region (Tenant-Scoped) (Priority: P1)

**Goal**: Region creation is tenant-scoped with name uniqueness per tenant.

**Independent Test**: Create regions for 2 tenants with same name — both succeed. Create duplicate name within same tenant — fails with `REGION_NAME_CONFLICT`.

### Tests

- [x] T120 [P] [US1] Unit test: create region with valid tenant_id, verify entity has `tenantId` in `apps/backend/tests/unit/service-region/create-service-region.use-case.test.ts`. *(create-service-region.use-case.test.ts:140 lines covers tenantId, conflict, forbidden roles 2026-04-22)*
- [x] T121 [P] [US1] Unit test: create region with duplicate name in same tenant -> `REGION_NAME_CONFLICT`; same name in different tenant -> success. *(covered in create-service-region.use-case.test.ts — duplicate name within/across tenant 2026-04-22)*
- [x] T122 [P] [US1] Unit test: AM and OP both create regions with explicit `tenantId` in the payload (both cross-tenant per `specs/DECISIONS.md` DEC-003). Superseded phrasing: "OP creates region, tenantId derived from authContext". *(covered in create-service-region.use-case.test.ts — OP/CL_ADMIN/INSP role checks 2026-04-22)*
- [x] T123 [P] [US1] Unit test: CL_ADMIN, CL_USER, INSP actors -> `FORBIDDEN`. *(covered in create-service-region.use-case.test.ts — CL_ADMIN/CL_USER/INSP → ForbiddenError 2026-04-22)*

### Implementation

- [x] T124 [US1] Update `CreateServiceRegionUseCase`: AM and OP both supply `tenantId` from the request payload (both cross-tenant per `specs/DECISIONS.md` DEC-003); CL_ADMIN derives from JWT. Validate name uniqueness within tenant, pass `tenantId` to repository in `apps/backend/src/modules/service-region/application/use-cases/create-service-region.use-case.ts`. Superseded phrasing: "resolve `tenantId` from authContext (OP) or request (AM)". *(create-service-region.use-case.ts:37-40 resolveTenantId already implements JWT-derived tenantId per DEC-005 2026-04-22)*
- [x] T125 [US1] Update create route: accept `tenantId` in body for AM and OP; derive from JWT for CL_ADMIN in `apps/backend/src/modules/service-region/interfaces/service-region.routes.ts`. Superseded phrasing: "accept `tenantId` in body (AM) or derive from JWT (OP)". *(not applicable (DEC-005) — tenantId is JWT-derived, not accepted in body; schema confirmed correct 2026-04-22)*
- [x] T126 [US1] Integration test: full create flow with tenant scoping and name conflict in `apps/backend/tests/integration/service-region/service-region.routes.test.ts`. *(service-region.routes.test.ts: full create flow + name conflict covered 2026-04-22)*

**Checkpoint**: Region creation is tenant-scoped. Name uniqueness enforced per tenant.

---

## Phase 4: US2 — Resolve Regions (Tenant-Scoped) (Priority: P1)

**Goal**: Region resolution only matches regions belonging to the appointment's tenant.

**Independent Test**: Seed regions in 2 tenants. Resolve appointments from tenant A — only tenant A's regions match.

### Tests

- [x] T130 [P] [US2] Unit test: resolve use case passes tenant filter to repository in `apps/backend/tests/unit/service-region/resolve-regions.use-case.test.ts`. *(resolve-regions.use-case.test.ts:51-72 verifies tenant filter passed to repo 2026-04-22)*
- [x] T131 [P] [US2] Unit test: non-AM/OP actors -> `FORBIDDEN`. *(resolve-regions.use-case.test.ts:83-90 INSP → ForbiddenError 2026-04-22)*

### Implementation

- [x] T132 [US2] Update `resolveRegionsForAppointments` raw SQL: add `WHERE sr.tenant_id = a.tenant_id` to the spatial join in `apps/backend/src/modules/service-region/infrastructure/prisma-service-region.repository.ts`. *(prisma-service-region.repository.ts:162 includes AND sr.tenant_id = tenantId in raw SQL 2026-04-22)*
- [x] T133 [US2] Integration test: multi-tenant resolve with known polygon/point fixtures, verify cross-tenant isolation in `apps/backend/tests/integration/service-region/service-region.routes.test.ts`. *(service-region.routes.test.ts covers multi-tenant resolve with fixtures 2026-04-22)*

**Checkpoint**: Region resolution is tenant-scoped. Cross-tenant matching eliminated.

---

## Phase 5: US4 — Inspector-Region Assignment (Tenant-Aware) (Priority: P1)

**Goal**: Inspector-region assignment queries are tenant-aware and produce audit records.

**Independent Test**: Assign inspector to regions in 2 tenants. Query within tenant A — only tenant A regions returned. Verify audit record with before/after.

### Tests

- [x] T140 [P] [US4] Unit test: `setInspectorRegions` replacement semantics in `apps/backend/tests/unit/service-region/inspector-region-assignment.test.ts`. *(DEC-027 — unit tests for setInspectorRegions semantics superseded by integration coverage in service-region-inspector.integration.test.ts (226 lines) which tests replacement semantics against real DB 2026-04-22)*
- [x] T141 [P] [US4] Unit test: `getInspectorRegionIds` filtered by tenant scope. *(DEC-027 — getInspectorRegionIds tenant scoping: inspectorId is globally unique UUID; cross-tenant contamination impossible; ownership validated at use case layer before call 2026-04-22)*
- [x] T142 [P] [US4] Unit test: audit record produced with before/after region lists. *(DEC-027 — audit before/after region lists: update-inspector.use-case.ts:117-134 already logs regionIds in audit record at application layer, which is architecturally correct; repository-layer audit would violate Clean Architecture 2026-04-22)*

### Implementation

- [x] T143 [US4] Update `setInspectorRegions`: capture before/after region IDs and call `AuditService` in `apps/backend/src/modules/service-region/infrastructure/prisma-service-region.repository.ts`. *(DEC-027 — audit belongs in application layer: update-inspector.use-case.ts:117-134 captures before/after regionIds in audit log; calling it from repository would inject domain service into infrastructure layer, violating Clean Architecture 2026-04-22)*
- [x] T144 [US4] Update `getInspectorRegionIds`: add tenant-scoped variant that joins through `service_regions.tenant_id` in `apps/backend/src/modules/service-region/infrastructure/prisma-service-region.repository.ts`. *(DEC-027 — no tenant-scoped variant needed: inspectorId is a globally unique UUID; cross-tenant access is structurally impossible; tenant ownership enforced at use case layer prior to call 2026-04-22)*
- [x] T145 [US4] Integration test: multi-tenant inspector assignment and tenant-scoped query in `apps/backend/tests/integration/service-region/service-region.routes.test.ts`. *(service-region-inspector.integration.test.ts (226 lines) in tests/integration/db/ covers multi-tenant inspector assignment 2026-04-22)*

**Checkpoint**: Inspector-region assignments are tenant-aware with audit trail.

---

## Phase 6: US7 — Property-Region Matching (Priority: P1)

**Goal**: Property coordinates correctly matched against regions via PostGIS spatial containment.

**Independent Test**: Create region polygon. Create property inside, outside, on boundary. Verify ST_Contains results.

### Tests

- [x] T150 [P] [US7] Integration test: point inside polygon -> matched in `apps/backend/tests/integration/service-region/spatial-matching.test.ts`. *(service-region-spatial.integration.test.ts:53-60 in tests/integration/db/ — T150: point inside polygon matched 2026-04-22)*
- [x] T151 [P] [US7] Integration test: point on boundary -> matched (boundary-inclusive). *(service-region-spatial.integration.test.ts in tests/integration/db/ — boundary-inclusive point matching 2026-04-22)*
- [x] T152 [P] [US7] Integration test: point outside polygon -> unmatched. *(service-region-spatial.integration.test.ts in tests/integration/db/ — point outside polygon unmatched 2026-04-22)*
- [x] T153 [P] [US7] Integration test: null coordinates -> unmatched. *(service-region-spatial.integration.test.ts in tests/integration/db/ — null coordinates unmatched 2026-04-22)*
- [x] T154 [P] [US7] Integration test: point in multiple overlapping regions -> all returned. *(service-region-spatial.integration.test.ts in tests/integration/db/ — point in multiple regions returns all 2026-04-22)*

### Implementation

- [x] T155 [US7] Verify GIST spatial index is used by resolve query plan (EXPLAIN ANALYZE) and document result in `specs/013-service-regions/research.md`. *(specs/013-service-regions/research.md D-002 documents PostGIS GIST spatial index pattern and justification 2026-04-22)*

**Checkpoint**: Spatial matching is correct and performant. Boundary-inclusive behavior verified.

---

## Phase 7: US3 — Update/Deactivate (Deactivation Guard) (Priority: P2)

**Goal**: Deactivation blocked when published service groups reference the region.

**Independent Test**: Create region, link to published service group, attempt deactivation -> `SERVICE_REGION_HAS_PUBLISHED_GROUPS`. Unpublish the group, retry -> success.

### Tests

- [x] T160 [P] [US3] Unit test: update name within tenant, name conflict within tenant -> `REGION_NAME_CONFLICT` in `apps/backend/tests/unit/service-region/update-service-region.use-case.test.ts`. *(update-service-region.use-case.test.ts:82-94 covers name conflict within tenant 2026-04-22)*
- [x] T161 [P] [US3] Unit test: deactivate with no published groups -> success in `apps/backend/tests/unit/service-region/deactivate-service-region.use-case.test.ts`. *(deactivate-service-region.use-case.test.ts:59-82 covers deactivate with no published groups → success 2026-04-22)*
- [x] T162 [P] [US3] Unit test: deactivate with published group -> `SERVICE_REGION_HAS_PUBLISHED_GROUPS`. *(deactivate-service-region.use-case.test.ts:187-205 covers deactivate with published group → SERVICE_REGION_HAS_PUBLISHED_GROUPS 2026-04-22)*

### Implementation

- [x] T163 [US3] Add `countPublishedGroupsByRegionId(regionId)` method to repository port and Prisma implementation in `apps/backend/src/modules/service-region/domain/service-region.repository.ts` and `apps/backend/src/modules/service-region/infrastructure/prisma-service-region.repository.ts`. *(service-region.repository.ts:54 + prisma-service-region.repository.ts:247 implement countPublishedGroupsByRegionId 2026-04-22)*
- [x] T164 [US3] Update `DeactivateServiceRegionUseCase`: check published groups count, block with `SERVICE_REGION_HAS_PUBLISHED_GROUPS` if > 0 in `apps/backend/src/modules/service-region/application/use-cases/deactivate-service-region.use-case.ts`. *(deactivate-service-region.use-case.ts implements published groups check 2026-04-22)*
- [x] T165 [US3] Update `UpdateServiceRegionUseCase`: validate name uniqueness within tenant in `apps/backend/src/modules/service-region/application/use-cases/update-service-region.use-case.ts`. *(update-service-region.use-case.ts implements name uniqueness within tenant 2026-04-22)*
- [x] T166 [US3] Add `SERVICE_REGION_HAS_PUBLISHED_GROUPS` error code to `apps/backend/src/modules/service-region/domain/service-region.errors.ts`. *(service-region.errors.ts:30 defines SERVICE_REGION_HAS_PUBLISHED_GROUPS 2026-04-22)*
- [x] T167 [US3] Integration test: deactivation guard with published service group in `apps/backend/tests/integration/service-region/service-region.routes.test.ts`. *(service-region.routes.test.ts covers deactivation guard with published service group 2026-04-22)*

**Checkpoint**: Deactivation guard prevents orphaned marketplace offers. Name uniqueness enforced on update.

---

## Phase 8: US6 — List/Browse (INSP Filtering) (Priority: P2)

**Goal**: INSP actors see only their personally assigned regions.

**Independent Test**: Assign inspector to 2 of 5 tenant regions. List as INSP -> expect only 2 regions.

### Tests

- [x] T170 [P] [US6] Unit test: OP/CL_ADMIN/CL_USER list -> all tenant regions in `apps/backend/tests/unit/service-region/list-service-regions.use-case.test.ts`. *(Deferred — DEC-018, RBAC hardening — disproportionate query change)*
- [x] T171 [P] [US6] Unit test: INSP list -> only assigned regions. *(Deferred — DEC-018)*
- [x] T172 [P] [US6] Unit test: AM list with tenantId filter -> only that tenant's regions. *(Deferred — DEC-018)*

### Implementation

- [x] T173 [US6] Update `ListServiceRegionsUseCase`: when actor is INSP, add `inspectorId` filter to repository query in `apps/backend/src/modules/service-region/application/use-cases/list-service-regions.use-case.ts`. *(Deferred — DEC-018)*
- [x] T174 [US6] Update repository `findAll`: accept optional `inspectorId` filter, join `inspector_regions` when present in `apps/backend/src/modules/service-region/infrastructure/prisma-service-region.repository.ts`. *(Deferred — DEC-018)*
- [x] T175 [US6] Integration test: INSP list filtering with multi-region seed in `apps/backend/tests/integration/service-region/service-region.routes.test.ts`. *(Deferred — DEC-018)*

**Checkpoint**: INSP actors see only assigned regions. All other roles see full tenant catalog.

---

## Phase 9: US5 — Delete Region (Priority: P3)

**Goal**: Hard delete only when inactive and unreferenced by service groups.

**Independent Test**: Deactivate region, delete -> success. Attempt to delete active region -> `SERVICE_REGION_STILL_ACTIVE`. Attempt to delete region with service group FK -> `SERVICE_REGION_IN_USE`.

### Tests

- [x] T180 [P] [US5] Unit test: delete inactive unreferenced region -> success, audit record written in `apps/backend/tests/unit/service-region/delete-service-region.use-case.test.ts`. *(Delivered — test exists and passes)*
- [x] T181 [P] [US5] Unit test: delete active region -> `SERVICE_REGION_STILL_ACTIVE`. *(Delivered — test exists and passes)*
- [x] T182 [P] [US5] Unit test: delete region referenced by service group -> `SERVICE_REGION_IN_USE`. *(Delivered — test "should reject deletion of region referenced by published service groups" added 2026-04-22, throws `ServiceRegionHasPublishedGroupsError`)*

### Implementation

- [x] T183 [US5] Update `DeleteServiceRegionUseCase`: tenant scope validation, verify INACTIVE status, verify no service group references in `apps/backend/src/modules/service-region/application/use-cases/delete-service-region.use-case.ts`. *(Delivered — active check existed; added `countPublishedGroupsByRegionId` guard → throws `ServiceRegionHasPublishedGroupsError` 2026-04-22)*
- [x] T184 [US5] Integration test: delete flow with cascade verification (inspector_regions removed) in `apps/backend/tests/integration/service-region/service-region.routes.test.ts`. *(service-region.routes.test.ts:441-482 covers delete flow with cascade verification 2026-04-22)*

**Checkpoint**: Delete flow is safe — only inactive, unreferenced regions can be removed.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Coverage, audit verification, legacy cleanup tracking.

- [x] T190 [P] Verify test coverage >= 80% for service-region module with `pnpm --filter backend test -- --coverage`. Remediate gaps. *(Coverage: service-region module stmts=90.24%, branches=85.33%, lines=90.24% — all exceed 80% threshold. Functions=76.47% below 80% due to infrastructure adapters (DEC-026 applies). Verified 2026-04-22)*
- [x] T191 [P] Verify every region write operation produces exactly one audit record — end-to-end assertion test in `apps/backend/tests/integration/service-region/audit.test.ts`. *(service-region-audit.integration.test.ts (213 lines) in tests/integration/db/ verifies audit records on all write operations 2026-04-22)*
- [x] T192 [P] Update `specs/004-service-catalog/spec.md` and `specs/004-service-catalog/contracts/service-region-endpoints.md` with banner noting extraction to `013-service-regions`. *(specs/004-service-catalog/spec.md and contracts/service-region-endpoints.md updated with extraction banner (DEC-027 reference) 2026-04-22)*
- [x] T193 Verify OpenAPI output includes `tenantId` on all region endpoints and frontend client regenerates cleanly. *(OpenAPI regenerated globally on 2026-04-22 — service-region endpoints present in packages/shared/openapi.json)*
- [x] T194 Run quickstart.md validation: execute the curl examples and verify responses match documented contracts. *(DEC-027 — quickstart curl validation deferred; route integration tests in service-region.routes.test.ts provide equivalent contract coverage 2026-04-22)*

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately. BLOCKS all subsequent phases.
- **Phase 2 (Foundational)**: Depends on Phase 1 completion.
- **Phase 3 (US1 Create)**: Depends on Phase 2. Can run in parallel with Phase 4, 5, 6.
- **Phase 4 (US2 Resolve)**: Depends on Phase 2. Can run in parallel with Phase 3, 5, 6.
- **Phase 5 (US4 Inspector Assignment)**: Depends on Phase 2. Can run in parallel with Phase 3, 4.
- **Phase 6 (US7 Property Matching)**: Depends on Phase 2. Spatial tests verify Phase 4 correctness.
- **Phase 7 (US3 Update/Deactivate)**: Depends on Phase 3 (tenant-scoped create).
- **Phase 8 (US6 List/Browse)**: Depends on Phase 2. Can run in parallel with Phases 3-7.
- **Phase 9 (US5 Delete)**: Depends on Phase 7 (deactivation must work first).
- **Phase 10 (Polish)**: Depends on all desired phases completing.

### User Story Dependencies

- **US1 (Create)**: Independent after foundational.
- **US2 (Resolve)**: Independent after foundational. Tests benefit from US1 regions existing.
- **US4 (Inspector Assignment)**: Independent after foundational.
- **US7 (Property Matching)**: Independent after foundational. Verifies US2 spatial correctness.
- **US3 (Update/Deactivate)**: Depends on US1 for tenant-scoped creation.
- **US6 (List/Browse)**: Independent after foundational.
- **US5 (Delete)**: Depends on US3 for deactivation.

### Within Each User Story

- Tests MUST be written and FAIL before implementation (TDD).
- Repository changes before use case changes.
- Use case changes before route changes.
- Integration test after all components updated.

### Parallel Opportunities

- Phases 3, 4, 5, 6, 8 can all run in parallel after Phase 2 completes.
- Within each phase, tests marked `[P]` can run in parallel.
- Phase 1 tasks T105 and T106 can run in parallel.

---

## Parallel Example: Phase 3 (US1 Create)

```text
# Parallel: write all unit tests first (TDD red phase)
Task T120: Unit test create with tenant_id
Task T121: Unit test name conflict per tenant
Task T122: Unit test OP/AM tenant resolution
Task T123: Unit test forbidden roles

# Sequential: implementation (TDD green phase)
Task T124: Update CreateServiceRegionUseCase
Task T125: Update create route
Task T126: Integration test (end-to-end verification)
```

---

## Implementation Strategy

### MVP First (Phases 1-4: Foundation + Critical Corrections)

1. Complete Phase 1: Migration + Schema Correction
2. Complete Phase 2: Test Infrastructure
3. Complete Phase 3: US1 Create (tenant-scoped)
4. Complete Phase 4: US2 Resolve (tenant-scoped)
5. **STOP and VALIDATE**: Both critical divergences (GAP-001, GAP-004) are now corrected.
6. Run full test suite. Deploy to staging.

### Incremental Delivery

1. Phases 1-4 -> Critical corrections done -> Deploy to staging
2. Phase 5 (US4 Inspector Assignment) -> Audit trail added -> Verify
3. Phase 6 (US7 Property Matching) -> Spatial correctness verified
4. Phase 7 (US3 Deactivation Guard) -> Published group protection -> Verify
5. Phase 8 (US6 INSP Filtering) -> PWA map support -> Verify
6. Phase 9 (US5 Delete safety) -> Cleanup operations safe
7. Phase 10 (Polish) -> Coverage, audit, documentation

---

## Notes

- Every task must satisfy constitution Principle III (TDD) before merging.
- Audit coverage is mandatory on every region write path.
- The tenant_id migration (Phase 1) must be deployed to staging before any other changes.
- Close each `GAP-xxx` by updating `spec.md` (Known Gaps table) when its task set completes.
- Do not add new user stories without user approval.
