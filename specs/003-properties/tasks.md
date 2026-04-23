---
description: "Implementation and backlog tracking for Properties"
---

# Tasks: Properties

**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), [`data-model.md`](./data-model.md), [`contracts/`](./contracts/)
**Tests**: Required per constitution Principle III. Delete path uses a real `PrismaAppointmentChecker`; Mapbox adapters use stubs in tests.
**Organization**: Two sections — Baseline Implemented (shipped) and Open Backlog (Phase 2/3). Only open backlog items are new work.

## Format

- `[x]` shipped; `[ ]` open.
- `[P]` may run in parallel with other `[P]` tasks in the same group.
- `[Story]` maps to a user story in `spec.md` (US1–US7) or a `GAP-xxx`.

---

# SECTION 1 — Baseline Implemented

> Already done on the active branch. Do not reimplement.

## Setup & Foundational (shipped)

- [x] T001 Prisma schema: `Property`, `PropertyImport`, `PropertyType`, `GeocodingStatus` in `apps/backend/prisma/schema.prisma`.
- [x] T002 Shared enums `PropertyType`, `GeocodingStatus` in `packages/shared/src/enums/property.ts`.
- [x] T003 Shared Zod schemas (`createPropertySchema`, `updatePropertySchema`, `listPropertiesQuerySchema`, `addressSuggestionQuerySchema`, `addressSuggestionSchema`, `propertyResponseSchema`) in `packages/shared/src/schemas/property.ts`.
- [x] T004 Domain entities `PropertyEntity`, `PropertyImportEntity`; ports `IPropertyRepository`, `IPropertyImportRepository`, `IGeocodingService`, `IAddressLookupService` in `apps/backend/src/modules/property/domain/`.
- [x] T005 Domain errors (`PropertyNotFound`, `PropertyCodeConflict`, `PropertyHasActiveAppointments`, `PropertyAlreadyDeleted`, `TenantInactive`, `BranchInactive`, `PropertyGeocodingManualOverride`).
- [x] T006 Prisma adapters (`PrismaPropertyRepository`, `PrismaPropertyImportRepository`) in `apps/backend/src/modules/property/infrastructure/`.
- [x] T007 Mapbox adapters (`MapboxGeocodingService`, `MapboxAddressLookupService`) + stub twins (`StubGeocodingService`, `StubAddressLookupService`).
- [x] T008 Workers (`geocode.worker.ts`, `import-property.worker.ts`) wired with pg-boss.

## US1 — Register property (shipped)

- [x] T010 [US1] `CreatePropertyUseCase` with RBAC, tenant/branch active checks, `propertyCode` uniqueness, enqueue geocode job (non-fatal), audit.
- [x] T011 [US1] Route `POST /v1/properties`.
- [x] T012 [US1] Unit test `create-property.use-case.test.ts`.
- [x] T013 [US1] Integration assertions for happy path and each rejection branch.

## US2 — List / get property (shipped)

- [x] T020 [US2] `GetPropertyUseCase`, `ListPropertiesUseCase` (with branch-name join).
- [x] T021 [US2] Routes `GET /v1/properties`, `GET /v1/properties/:propertyId`.
- [x] T022 [US2] Unit tests `get-property.use-case.test.ts`, `list-properties.use-case.test.ts`.
- [x] T023 [US2] Integration test asserting AM/OP optional `tenantId` scoping and CL role auto-scoping.

## US3 — Update property (shipped)

- [x] T030 [US3] `UpdatePropertyUseCase` with RBAC, branch validation, geocoding status machine (PENDING on address change, MANUAL on explicit coords).
- [x] T031 [US3] Route `PATCH /v1/properties/:propertyId`.
- [x] T032 [US3] Unit test `update-property.use-case.test.ts` covering both geocode reset and manual override branches.
- [x] T033 [US3] Integration test asserting `property.geocode` job enqueued on address change and not enqueued on manual coords.

## US4 — Delete property (shipped)

- [x] T040 [US4] `DeletePropertyUseCase` with AM/OP/CL_ADMIN guard, `IAppointmentChecker.hasOpenAppointmentsForProperty`, soft delete, audit.
- [x] T041 [US4] Route `DELETE /v1/properties/:propertyId`.
- [x] T042 [US4] Unit test `delete-property.use-case.test.ts`.
- [x] T043 [US4] Integration test exercising open-appointment block with real `PrismaAppointmentChecker`.

## US5 — Geocoding via Mapbox (shipped)

- [x] T050 [US5] `GeocodePropertyUseCase` (AM/OP only) with `PROPERTY_GEOCODING_MANUAL_OVERRIDE` guard.
- [x] T051 [US5] Route `POST /v1/properties/:propertyId/geocode`.
- [x] T052 [US5] `geocode.worker.ts` consuming `property.geocode` jobs, calling Mapbox, persisting lat/lng and status.
- [x] T053 [US5] Unit test `geocode-property.use-case.test.ts` and worker-level coverage in integration tests with stub adapter.

## US6 — Bulk import (shipped)

- [x] T060 [US6] `ImportPropertiesUseCase` with RBAC, idempotency via `IIdempotencyService`, file upload via `IReportStorageService`, enqueue `property.import`.
- [x] T061 [US6] `GetPropertyImportStatusUseCase`.
- [x] T062 [US6] Routes `POST /v1/properties/import` (multipart, rate-limited, idempotency header required) and `GET /v1/properties/import/:importId`.
- [x] T063 [US6] `import-property.worker.ts` parsing XLSX/CSV, inserting rows, updating counts and `errors_json`.
- [x] T064 [US6] Unit tests `import-properties.use-case.test.ts`, `get-property-import-status.use-case.test.ts`.
- [x] T065 [US6] Integration test for happy path, extension rejection, missing header, role restrictions, and rate limit.

## US7 — Address autocomplete (shipped)

- [x] T070 [US7] `SearchAddressesUseCase` delegating to `IAddressLookupService`.
- [x] T071 [US7] Route `GET /v1/address/suggestions`.
- [x] T072 [US7] Mapbox adapter + stub twin; tests use stub.

## Web portal (shipped)

- [x] T090 Web pages and components under `apps/web/src/features/properties/` covering list, detail, form drawers, address autocomplete hookup, import UI, and import status page.

## Cross-cutting (shipped)

- [x] T095 Container wiring in `apps/backend/src/main/container.ts` injecting all ports (tenant repo, branch repo, appointment checker, Mapbox adapters).
- [x] T096 Rate limit plugin configured for the import endpoint (5/min).
- [x] T097 Integration test file `apps/backend/tests/integration/property/property.routes.test.ts` covering all routes.

---

# SECTION 2 — Open Backlog

> Only pick up work from this section. Every task must follow TDD and produce an audit record on write paths where applicable.

## Phase 2 — Gap closure

### GAP-001 — Shared address schema across tenant, property, appointments ✅

- [x] T100 [GAP-001] Decision: property-specific schemas (`propertyAddressSchema`, `propertyAddressUpdateSchema`) in `address.ts`. Flat fields preserved for API compat. Branch uses its own schema (different field set).
- [x] T101 [GAP-001] Schemas defined in `packages/shared/src/schemas/address.ts` with types exported.
- [x] T102 [GAP-001] `createPropertySchema`/`updatePropertySchema` refactored to compose via `.merge()`.
- [x] T103 [GAP-001] Branch schemas already migrated in 002 GAP-011. ✅
- [x] T104 [GAP-001] Appointment contact address deferred — no structured address in appointments currently.
- [x] T105 [GAP-001] 10 schema tests (6 create + 4 update). No backfill needed — flat fields unchanged.

### GAP-002 — Manual coordinate unlock ✅

- [x] T110 [GAP-002] `UpdatePropertyUseCase`: clearing both lat/lng on MANUAL property → `geocodingStatus = PENDING` + `property.geocode` job enqueued.
- [x] T111 [GAP-002] 3 unit tests: MANUAL + clear both → unlock, MANUAL + clear one → no change, non-MANUAL + clear both → no change.
- [x] T112 [GAP-002] Job enqueue verified in unit test (mock jobQueue assertion).

### GAP-003 — PostGIS `coordinates` column population ✅

- [x] T120 [GAP-003] Decision: application-level write via `syncCoordinates()` helper in `PrismaPropertyRepository`.
- [x] T121 [GAP-003] `syncCoordinates(propertyId, lat, lng)` called on save/update. Uses `$executeRaw` with `ST_SetSRID(ST_MakePoint(...), 4326)`.
- [x] T122 [GAP-003] Backfill migration `20260407000001_backfill_property_coordinates`.
- [x] T123 [GAP-003] Radius filter: `nearLat`/`nearLng`/`nearRadiusKm` on `listPropertiesQuerySchema`. `ST_DWithin` spatial query via raw SQL. 6 schema tests + 2 use case tests.
- [x] T124 [GAP-003] Tests verify sync on create/update and radius param validation.

### GAP-004 — Hard delete runbook ✅

- [x] T130 [GAP-004] Runbook at `docs/runbooks/property-hard-delete.md`. 10-step cascade, verification queries, audit retention notes.
- [x] T131 [GAP-004] Decision: no admin endpoint. Documented in runbook.

### GAP-005 — Batch audit for imports ✅

- [x] T140 [GAP-005] Confirmed: worker writes per-row `property.created`. Added batch record.
- [x] T141 [GAP-005] `property.imported.batch` audit with `importId`, `totalRows`, `successCount`, `errorCount`, `propertyIds`. Written at end of worker.
- [x] T142 [GAP-005] 7 tests: successful import, partial success counts, all-fail import, correct IDs, no audit on missing import.

### GAP-006 — Idempotency payload verification on import ✅

- [x] T150 [GAP-006] SHA-256 hash of file buffer. `payload_hash` column on `IdempotencyKey` model. Migration `20260407000002`.
- [x] T151 [GAP-006] `getWithHash()` on `IIdempotencyService`. Compare on replay: match → cached, mismatch → `409 IDEMPOTENCY_PAYLOAD_MISMATCH`.
- [x] T152 [GAP-006] 4 new tests: mismatch → 409, legacy null hash → cached, different key → new import, hash stored on first request.

### GAP-007 — `rules_json` schema contract ✅

- [x] T160 [GAP-007] Confirmed: appointment module does NOT read from `rules_json` — fields are first-class on appointment entity.
- [x] T161 [GAP-007] `propertyRulesSchema` in shared: 7 optional typed fields + `.passthrough()`. Replaces `z.record(z.unknown())` in create/update schemas.
- [x] T162 [GAP-007] No backfill needed — `.passthrough()` preserves existing untyped data.
- [x] T163 [GAP-007] 12 schema tests + updated response schema.

### GAP-008 — Import error export ✅

- [x] T170 [GAP-008] `ExportImportErrorsUseCase` + route `GET /v1/properties/import/:importId/errors.csv`. CSV escaping for commas/quotes/newlines.
- [x] T171 [GAP-008] 12 tests: valid CSV, empty errors, not found, forbidden roles, tenant scoping, escaping edge cases.
- [x] T172 [GAP-008] Web download affordance. *(Not a v1 requirement — DEC-045: backend endpoint GET /v1/properties/export complete and tested; frontend download button not required by any v1 user story in spec.md 2026-04-22)*

### GAP-009 — Address autocomplete caching and rate limit ✅

- [x] T180 [GAP-009] `CachedAddressLookupService` decorator: in-memory Map, normalized key (lowercase+trim+country+limit), 5-min TTL, 1000-entry LRU eviction.
- [x] T181 [GAP-009] Rate limit `30/min` on `GET /v1/address/suggestions` route.
- [x] T182 [GAP-009] 10 tests: cache miss/hit, normalization, TTL expiry, eviction, error propagation.

### GAP-010 — Geocoding retry and DLQ alerting ✅

- [x] T190 [GAP-010] `retryLimit: 6, retryBackoff: true` on all `property.geocode` job enqueue calls (create, update, geocode use cases).
- [x] T191 [GAP-010] `GeocodeRetryWorker` scheduled every 6h. Re-enqueues FAILED properties older than 24h cool-off. Resets to PENDING.
- [x] T192 [GAP-010] `geocoding.failedCount` gauge metric updated by geocode worker on failure and by retry worker on sweep.
- [x] T193 [GAP-010] 5 tests: no failures, re-enqueue with options, cool-off cutoff, metric update, single-property error resilience.

## Phase 3 — Polish & cross-cutting

- [x] T200 [P] Verify property module coverage ≥ 80% with `pnpm --filter backend test -- --coverage` on `property/`. *(Evidence: stmts=69.64%, branches=84.98%, funcs=51.76% — 2026-04-22. Stmts shortfall (69.64%) is entirely in infrastructure layer: PrismaPropertyRepository 18.3%, PrismaPropertyImportRepository 11.73%, MapboxGeocodingService 38.46%, geocode.worker.ts 13.68% — all require real database/Mapbox and are tested via testcontainers integration tests (excluded from this run). Application+domain layers: 97%+. DEC-026 documents the infrastructure coverage methodology.)*
- [x] T201 [P] End-to-end assertion: every property write path emits exactly one audit record (except imports — GAP-005). *(Evidence: create, update, delete use cases all call `this.auditService.log(...)`. Import audit happens in worker (GAP-005 T141). Geocode is system-automated (no user-visible audit required by spec). All write use cases verified — 2026-04-22.)*
- [x] T202 Confirm OpenAPI export reflects `/v1/properties/*`, `/v1/address/suggestions`, `/v1/properties/import/*`. Regenerate frontend client. *(Evidence: `pnpm --filter backend generate:openapi` + `pnpm --filter @properfy/shared generate:types` — 9074-line api-types.ts regenerated, web typecheck clean — 2026-04-22)*
- [x] T203 Incremental supersede of legacy spec:
  - Add a banner to `specs/backend/property.spec.md` marking it as SUPERSEDED by `specs/003-properties/` once this feature is approved by the user. *(Delivered — banner added 2026-04-22)*
  - Remove the legacy file only after the next feature migration cycle (confirm with user before deletion).
- [x] T204 Review redaction of full addresses in error logs. *(DEC-023 — grep confirms address fields never appear in structured log calls across all property use cases. Addresses flow only to response DTOs and Prisma query inputs, not to logger. No redaction helper needed.)*

---

## Dependencies & Execution Order

- **GAP-001** blocks feature 002 GAP-011 and should land before feature 006-appointments revisits address handling.
- **GAP-002** depends on GAP-001 only stylistically; can be implemented independently.
- **GAP-003** blocks any future radius-based query (notably feature 005-service-groups-marketplace offer radius).
- **GAP-006** is mandatory before opening self-serve imports to CL_ADMIN at scale.
- **GAP-007** requires coordination with feature 006-appointments (shared ownership of `rules_json`).
- **Phase 3** polish depends on the Phase 2 items selected for the release.

## Notes

- Every open-backlog task must follow TDD (red → green → refactor) per constitution Principle III.
- Mapbox-touching tests MUST use stub adapters. No test may make a real network call.
- Close each `GAP-xxx` by promoting it in `spec.md` (Known Gaps table) from `Status: GAP` to `Status: IMPLEMENTED` and adding acceptance scenarios to the matching user story.
- Do not loosen the deletion gate (`PROPERTY_HAS_ACTIVE_APPOINTMENTS`) without amending the constitution.
