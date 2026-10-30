# Tasks: Permanent Geocoding Compliance

**Input**: Design documents from `/specs/035-x02-permanent-geocoding/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — TDD is mandatory (constitution III; source task "Testes primeiro"). Every behavior task is preceded by its red test.

**Abbreviations**: `BE = apps/backend`, `WEB = apps/web`, `SH = packages/shared`.

**Spike**: the Mapbox v5 spike (step 0) is already resolved (2026-10-29, see research.md). T002 only records it in the ops doc.

## Phase 1: Setup

- [X] T001 Regenerate the Prisma client and confirm the baseline builds in the worktree: `pnpm --filter backend exec prisma generate && pnpm --filter @properfy/shared build` (no code change; gate for the rest).
- [X] T002 [P] Record the confirmed Mapbox v5 spike result (URL form, 401 `{"message"}` envelope, `places-permanent` 200 entitlement signal) and the per-environment positive-proof smoke in `docs/ops/pre-deploy-smoke-checklist.md` (CA9).

## Phase 2: Foundational (BLOCKS all user stories)

Shared port, helpers, adapter, migration, entities, repositories and schemas. No user story can be verified until these land.

### Port & shared helpers

- [X] T003 Extend the port in `BE/src/modules/property/domain/geocoding.service.ts`: `GeocodingMode`, `GeocodeOptions { mode?: GeocodingMode }` (absent ⇒ permanent), `geocode(address, options?)`, and `class MapboxPermanentGeocodingUnavailableError { readonly code = 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE' }` with the message from contracts.
- [X] T004 [P] Test `BE/src/shared/domain/geocoding-address.test.ts` (cases 1–9: full branch address, city==suburb omit, empty/null parts, trimming, property `addressLine2` order, `fullAddress` equivalence, `isSameGeocodingAddress` true/false/extra-keys).
- [X] T005 Implement `BE/src/shared/domain/geocoding-address.ts`: `GeocodableAddress`, `formatGeocodingQuery`, `isSameGeocodingAddress` (pure; order & rules per contracts). Make T004 green.
- [X] T006 [P] Test `BE/src/modules/property/application/services/geocode-with-timeout.test.ts` (fake timers, cases 1–9: resolve/`null`, default 4000 + permanent, temporary passthrough, timeout at 4000/50, account-error passthrough, late rejection no unhandledRejection, timer count 0).
- [X] T007 Implement `BE/src/modules/property/application/services/geocode-with-timeout.ts`: `GEOCODE_SYNC_TIMEOUT_MS=4000`, `GeocodeTimeoutError`, `geocodeWithTimeout`. Make T006 green.

### Mapbox adapter, stub & dynamic provider

- [X] T008 [P] Test `BE/src/modules/property/infrastructure/mapbox-geocoding.service.test.ts` (`vi.stubGlobal('fetch')`, cases 1–10: `permanent=true`+`limit=1` URL & `center→{lat,lng}`; explicit permanent; temporary omits `permanent`; 403+"permanent" body ⇒ account-error code, fetch once; six account errors still coded; 500 generic; 401 generic; empty `features` ⇒ null; `&`/`#` encoded; 403-without-"permanent" fallback ⇒ account-error). Use the spike envelope `{"message": …}`.
- [X] T009 Implement `BE/src/modules/property/infrastructure/mapbox-geocoding.service.ts`: build URL with `URLSearchParams`, `permanent=true` unless `mode:'temporary'`, parse `{message}` errors, detect account error (status ∈ {401,403,422} AND ("permanent" in message OR 403 fallback)), raise `MapboxPermanentGeocodingUnavailableError` OUTSIDE the `CircuitBreaker` (sentinel from inside `execute`). Make T008 green.
- [X] T010 Update `BE/src/modules/property/infrastructure/stub-geocoding.service.ts` to accept `options?: GeocodeOptions` and still return `null`.
- [X] T011 [P] Test `BE/src/modules/integration/infrastructure/__tests__/dynamic-providers.test.ts` `describe('DynamicGeocodingService')` (cases 1–5: no config ⇒ null & `isConfigured()` false; config ⇒ true; `{mode:'temporary'}` passthrough; no opts ⇒ inner receives `undefined`; token change recreates adapter).
- [X] T012 Implement `DynamicGeocodingService` in `BE/src/modules/integration/infrastructure/dynamic-providers.ts`: pass `options` through to the inner service and add `isConfigured(): Promise<boolean>`. Make T011 green.

### Migration, entities, repositories

- [X] T013 Add columns in `BE/prisma/schema.prisma`: `properties.geocoded_permanently_at DateTime?`, `properties.geocoding_failure_code String? @db.VarChar(64)`, `branches.geocoded_permanently_at DateTime?`. Generate `BE/prisma/migrations/<ts>_permanent_geocoding_markers/migration.sql` (expand-only `ADD COLUMN … NULL`); verify `prisma migrate diff` has no drift and the `Unsupported()` `coordinates` index is not dropped.
- [X] T014 Extend `BE/src/modules/property/domain/property.entity.ts` with optional `geocodedPermanentlyAt?: Date | null` and `geocodingFailureCode?: string | null` (default null) and `applyGeocodingResult(result, { permanent })` setting the marker; extend `BE/src/modules/tenant/domain/branch.entity.ts` with optional `geocodedPermanentlyAt?: Date | null`.
- [X] T015 Extend `BE/src/modules/property/infrastructure/prisma-property.repository.ts` + its interface: `update` accepts the two fields and keeps `syncCoordinates`; `findFailedGeocoding` adds `geocoding_failure_code IS NULL`; add `countBlockedFailedGeocoding(): Promise<number>`. Map the new columns in `save`/`update`/reads.
- [X] T016 Extend the branch Prisma repository + interface (the tenant/agency repo that writes `branches.address_json` and holds `formatBranchAddress`, `prisma-fy.repository.ts:234` per the source task — confirm by `grep -rn "address_json" BE/src/modules/tenant`): `update` accepts `geocodedPermanentlyAt` (written alongside the `address_json` the use case passes).

### Shared schemas (contract)

- [X] T017 [P] Test `SH/src/schemas/address.test.ts` (strip `latitude/longitude`; `branchAddressSchema instanceof z.ZodObject` and `.extend({extra}).parse(...)` works — dec. 24).
- [X] T018 Edit `SH/src/schemas/address.ts`: remove `latitude/longitude` from `branchAddressSchema`, keep it a plain `z.object` (no top-level `.transform/.refine/.superRefine/.passthrough/.strict`). Make T017 green.
- [X] T019 [P] Test `SH/src/schemas/import.test.ts` (`found` + `mode:'permanent'` valid; `found` without mode valid; `mode:'temporary'` invalid) and `SH/src/schemas/property.test.ts` (create strips lat/lng; update keeps them).
- [X] T020 Edit `SH/src/schemas/import.ts`: add `mode: z.literal('permanent').optional()` to the `found` variant. Make T019 green.

**Checkpoint**: `pnpm --filter @properfy/shared build && pnpm --filter backend typecheck` green; port/helpers/adapter/repos/schemas in place.

## Phase 3: User Story 1 — Stored coordinates always permanent & traceable (P1) 🎯 MVP

**Goal**: every stored coordinate comes from a permanent geocode and carries the marker; branches geocode in permanent mode.
**Independent test**: create a property → SUCCESS + marker + `permanent=true` on the wire; save a branch → `addressJson` has coords + marker only on success.

- [X] T021 [P] [US1] Test `BE/tests/unit/property/create-property.use-case.test.ts` (geocoder called `(fullAddress, {mode:'permanent'})`; success ⇒ SUCCESS + marker Date; account-error ⇒ PENDING + `sendJob('property.geocode')`, null coords; `null` ⇒ FAILED + null marker).
- [X] T022 [US1] Update `BE/src/modules/property/application/use-cases/create-property.use-case.ts`: use `geocodeWithTimeout` (remove the private `geocodeWithinTimeout` and `DEFAULT_SYNC_GEOCODE_TIMEOUT_MS`, keep the constructor `syncGeocodeTimeoutMs` passed as `timeoutMs`); set the marker on success. Make T021 green.
- [X] T023 [P] [US1] Test `BE/tests/unit/property/geocode.worker.test.ts` success + MANUAL-skip cases (called with `{mode:'permanent'}`; success ⇒ `update {lat,lng,SUCCESS,geocodedPermanentlyAt:any(Date),geocodingFailureCode:null}`; MANUAL ⇒ geocoder not called). (Account-error & generic cases added in US3 T038.)
- [X] T024 [US1] Update `BE/src/modules/property/infrastructure/workers/geocode.worker.ts` success/marker path (permanent mode; set marker, clear code on success). Preserve the existing MANUAL-skip, SUCCESS-skip and `null`⇒`FAILED` "Geocoding service returned no results" branches unchanged (covered by existing worker tests; FR-016). Make T023 green.
- [X] T025 [P] [US1] Test `BE/src/modules/property/application/services/import-geocode-verifier.test.ts` cases 1–2 (geocoder called `{mode:'permanent'}`; found ⇒ `{status:'found',lat,lng,mode:'permanent'}`).
- [X] T026 [US1] Update `BE/src/modules/property/application/services/import-geocode-verifier.ts`: request permanent mode and set `mode:'permanent'` on `found`. (Batch short-circuit added in US3 T040.)
- [X] T027 [P] [US1] Test `BE/src/modules/appointment/infrastructure/workers/appointment-import-commit.worker.test.ts` case 1 (`found` with `mode` ⇒ SUCCESS + marker). (No-mode case in US4 T044.)
- [X] T028 [US1] Update `BE/src/modules/appointment/infrastructure/workers/appointment-import-commit.worker.ts:304-328` to set the marker when committing a `found`-with-`mode` result. Make T027 green.
- [X] T029 [P] [US1] Test `BE/tests/unit/tenant/create-branch.use-case.test.ts` (cases 1–7: success ⇒ coords + marker, geocoder called `(formatGeocodingQuery(address), {mode:'permanent'})` via `geocodeWithTimeout`; null/account-error/timeout ⇒ no coords, null marker, warn/error; input `latitude` ignored; no `address` ⇒ no geocode; no geocoder injected ⇒ saved without coords).
- [X] T030 [US1] Update `BE/src/modules/tenant/application/use-cases/create-branch.use-case.ts`: optional `IGeocodingService` at the end of the constructor; `formatGeocodingQuery` + `geocodeWithTimeout` (permanent, 4000 ms); write coords + marker on success, null marker on failure; never fail the save. Make T029 green.
- [X] T031 [P] [US1] Test `BE/tests/unit/tenant/update-branch.use-case.test.ts` cases 1–6 (changed address geocodes; same address + marker ⇒ copy old coords, no geocode, marker kept; same address no marker ⇒ geocode; name-only ⇒ no geocode; changed + null/error/timeout ⇒ new JSON no coords, explicit null marker + log).
- [X] T032 [US1] Update `BE/src/modules/tenant/application/use-cases/update-branch.use-case.ts` per data-model branch table (uses `isSameGeocodingAddress`, copies old lat/lng on same address, explicit null marker on failure). Make T031 green.
- [X] T033 [US1] Reorder wiring in `BE/src/main/container.ts` so `geocodingService` is created before and injected into `CreateBranchUseCase`/`UpdateBranchUseCase` (grep `new CreateBranchUseCase(`/`new UpdateBranchUseCase(`).
- [X] T033b [P] [US1] Test `WEB/src/features/tenants/hooks/useBranchSave.test.ts` (the POST/PATCH body never contains `latitude/longitude`), then update `WEB/src/features/tenants/hooks/useBranchSave.ts:67-68` to stop sending autocomplete coordinates (CA2 for branches). Make the test green.
- [X] T034 [P] [US1] Integration test `BE/tests/integration/db/property-geocode-permanent.integration.test.ts` (PostGIS sync cases 1–6: PENDING→SUCCESS coords+marker+`ST_X/ST_Y`=point & `permanent=true`; account-error FAILED null coords+code+audit; `findFailedGeocoding` excludes coded; update same coords stays SUCCESS; update different ⇒ MANUAL + moved point; update SUCCESS null/null+new address ⇒ PENDING keeps old point until worker). Run via subagent.
- [X] T035 [US1] Integration test `BE/tests/integration/tenant/tenant.routes.test.ts` (POST branch with `address.latitude` ⇒ 201 and `addressJson` lacks it; CL_USER ⇒ 403 `AUTH_FORBIDDEN`).

**Checkpoint**: US1 independently testable — create/commit/branch store permanent coords + marker.

## Phase 4: User Story 2 — False-`MANUAL` bug fixed (P1)

**Goal**: editing without changing coordinates keeps the status; only changed coords become MANUAL; invariant never-MANUAL-without-coord.
**Independent test**: edit a SUCCESS property without touching coords ⇒ stays SUCCESS; change coords ⇒ MANUAL.

- [X] T036 [P] [US2] Test `BE/tests/unit/property/update-property.use-case.test.ts` cases 1–9 (different ⇒ MANUAL + null marker, no job; equal/7dp ⇒ no lat/lng/status, no job, SUCCESS in audit; equal + address change ⇒ PENDING + job; unlock; address-only ⇒ PENDING; null/null non-MANUAL ⇒ ignored + debug; null/null + address ⇒ PENDING + job; incomplete pair ⇒ ignored) + the invariant assertion across every case.
- [X] T037 [US2] Update `BE/src/modules/property/application/use-cases/update-property.use-case.ts:176-206`: 7-dp `Number(x.toFixed(7))` compare; null/null non-MANUAL & incomplete-pair ignore with debug log; clear marker/code on MANUAL and on address-change/unlock transitions; invariant guard. Make T036 green.
- [X] T038 [P] [US2] Test `WEB/src/features/properties/hooks/usePropertySave.test.ts` (cases 1–5) + `WEB/src/features/properties/components/PropertyFormDrawer.test.tsx` (cases 1–7) for the diff/send rules.
- [X] T039 [US2] Update `WEB/src/features/properties/hooks/usePropertySave.ts:90-95` (receive initial values + `geocodingStatus`; send the pair only when changed; send `null,null` only for a MANUAL with both cleared) and `WEB/src/features/properties/components/PropertyFormDrawer.tsx:95-96,133` (pass initial + status to save; autocomplete suggestion zeroes coords only for MANUAL in edit). Make T038 green.

**Checkpoint**: US2 independently testable — MANUAL only on real coordinate edits.

## Phase 5: User Story 3 — Stop paying for / retrying unentitled geocoding (P1)

**Goal**: account-error ⇒ FAILED + code, no retry; sweep skips coded; import batch short-circuits.
**Independent test**: with the account rejecting permanent, create a property ⇒ FAILED + code, sweep skips it.

- [X] T040 [P] [US3] Extend `BE/tests/unit/property/geocode.worker.test.ts` (account-error ⇒ `update {FAILED, code}` no coords, audit `metadata.code`, `logger.error`, resolves without throwing; generic error ⇒ FAILED no code).
- [X] T041 [US3] Add the account-error & generic-error branches to `BE/src/modules/property/infrastructure/workers/geocode.worker.ts` (catch the account error, set code, audit with code, `logger.error`, do not rethrow). Make T040 green.
- [X] T042 [P] [US3] Test `BE/tests/unit/property/geocode-retry.worker.test.ts` (only coded-null FAILED re-enqueued; `skippedCount` from `countBlockedFailedGeocoding`) and `BE/tests/unit/property/geocode-property.use-case.test.ts` (`update {PENDING, geocodingFailureCode:null}`).
- [X] T043 [US3] Update `BE/src/modules/property/infrastructure/workers/geocode-retry.worker.ts` (rely on the `findFailedGeocoding` filter + log `skippedCount`) and `BE/src/modules/property/application/use-cases/geocode-property.use-case.ts` (clear the failure code on re-queue). Make T042 green.
- [X] T044 [P] [US3] Test `BE/src/modules/property/application/services/import-geocode-verifier.test.ts` cases 3–4 (account error on a 3-row batch ⇒ geocoder called once, 3 `unverified`, one `logger.error('import.geocode_verify_permanent_unavailable', {code, remaining:2})`; generic error 2/3 ⇒ one aggregated `logger.warn {failedCount:2}`).
- [X] T045 [US3] Add the batch short-circuit + aggregated logging to `BE/src/modules/property/application/services/import-geocode-verifier.ts:96`. Make T044 green.

**Checkpoint**: US3 independently testable — no coordinate stored, no retry, one call per failing batch.

## Phase 6: User Story 4 — Pre-deploy previews don't store temporary coords (P2)

**Goal**: a `found` verification without a mode becomes PENDING + job on commit.
**Independent test**: commit a no-mode preview ⇒ PENDING, no coords, job enqueued.

- [X] T046 [P] [US4] Extend `BE/src/modules/appointment/infrastructure/workers/appointment-import-commit.worker.test.ts` case 2 (`found` without `mode` ⇒ PENDING, null coords, `jobQueue.enqueue('property.geocode')`; `logger.info('Legacy preview verification treated as unverified', {importId, normalizedAddressKey})`).
- [X] T047 [US4] Add the no-mode→unverified branch to `BE/src/modules/appointment/infrastructure/workers/appointment-import-commit.worker.ts:304-328`. Make T046 green.

**Checkpoint**: US4 independently testable — pre-deploy previews re-geocode in permanent mode.

## Phase 7: Polish & Cross-Cutting

- [X] T048 Regenerate the contract: `pnpm --filter backend generate:openapi && pnpm --filter @properfy/shared generate:types && pnpm --filter @properfy/shared build`; commit `packages/shared/openapi.json` and `packages/shared/src/api-types.ts` (do not hand-edit).
- [X] T049 [P] Remove the N4 transition clause from `apps/backend/CLAUDE.md` §10 and reconcile the N4 text with dec. 1/2/6/8/9; verify `grep -n "until it merges" apps/backend/CLAUDE.md` is empty in N4 and `grep -n "geocoded_permanently_at\|MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE" apps/backend/CLAUDE.md` has ≥1 each.
- [X] T050 [P] Add the account-requirement note + symptom to `docs/fly-deploy-guide.md:74-84` and finalize `docs/ops/pre-deploy-smoke-checklist.md` (price, account rate limit, daily-sweep cost formula — dec. 22).
- [X] T051 [P] Update the workspace CLAUDE.md files this PR changes (`apps/backend/CLAUDE.md`, `packages/shared/CLAUDE.md`, `apps/web/CLAUDE.md`) for the new columns, port mode, helpers, schema deltas and branch geocoding (project rule §13.11).
- [X] T052 Full verification inside the worktree (via subagent for the heavy suites): shared test; backend lint+typecheck+test; `test:integration` + `test:integration:db -- property-geocode-permanent`; web lint+typecheck+`test -- PropertyFormDrawer usePropertySave useBranchSave`. Confirm migration applies without drift.

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T020)** block everything.
- Within Foundational: T003 (port) precedes T006/T007 (timeout types) and T008/T009 (adapter); T013 (migration) precedes T014–T016 (entities/repos); schema tests precede their impl.
- **US1 (T021–T035)** depends on Foundational. It is the MVP.
- **US2 (T036–T039)**, **US3 (T040–T045)**, **US4 (T046–T047)** depend on Foundational; US3/US4 reuse files touched in US1 (geocode worker, import verifier, commit worker) so they run **after** the US1 edits to those files to avoid churn, but are logically independent behaviors.
- **Polish (T048–T052)** last; T048 (contract regen) after all schema/route changes; T052 is the final gate.

## Parallel Opportunities

- Foundational tests marked [P] (T004, T006, T008, T011, T017, T019) can be written together; the pure-helper pair (T004/T005) and the formatter are independent of the adapter.
- US1 test tasks T021/T023/T025/T027/T029/T031/T034 are [P] (distinct files) before their sequential impls.
- Polish T049/T050/T051 are [P] (distinct docs).

## Implementation Strategy

MVP = Setup + Foundational + **US1**. US1 delivers the compliance core (permanent + marker on every write path) and unblocks the map features. US2 (data-integrity fix), US3 (cost/retry safety) and US4 (in-flight imports) layer on without changing US1's contract. Ship as one PR (well under 150 files); the suggested commit sequence is in the source task.
