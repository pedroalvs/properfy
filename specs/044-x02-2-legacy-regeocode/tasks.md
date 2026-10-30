# Tasks: Legacy Permanent Re-Geocoding

**Feature**: `044-x02-2-legacy-regeocode` | **Input**: `spec.md`, `plan.md`, `data-model.md`, `contracts/cli-regeocode-permanent.md`, `quickstart.md`

**TDD requested** (spec §"Testes primeiro (TDD)" + constitution III): every implementation task is preceded by its failing tests. Unit tests → `apps/backend/src/scripts/regeocode-permanent.test.ts`; DB integration → `apps/backend/tests/integration/db/regeocode-permanent.integration.test.ts`. Test-case numbers below reference the spec's enumerated lists.

**Parallelism note**: the script, its unit test file and the property repository are each a *single* file touched by nearly every story, so most tasks are **sequential within those files** — `[P]` is used only where files genuinely differ (runbook, CLAUDE.md, the DB integration file vs. the unit file). This is honest: do not parallelize edits to the same file.

**Paths** are relative to the repo root (`apps/backend/...`, `docs/...`).

---

## Phase 1: Setup

- [ ] T001 Confirm the worktree baseline is green before writing code: `pnpm --filter @properfy/shared build`, `pnpm --filter backend exec prisma generate`, `pnpm --filter backend typecheck` (already run by setup subagent — re-run only if drift suspected). No new dependency is added by this feature.

## Phase 2: Foundational (blocking prerequisites for all stories)

**Repository ports + CLI skeleton that every phase builds on.**

- [ ] T002 [P] Write failing unit tests for argument parsing & safety in `apps/backend/src/scripts/regeocode-permanent.test.ts`: cases 1 (default options), 2 (`--rate=0` → `Invalid argument`), 3 (`--retry-failed-permanent` + `--strip-import-previews` → combination error), 14 (`isGeocoderConfigured()===false` → `aborted.code='MAPBOX_NOT_CONFIGURED'`, no selection), 18 (module import is inert via `isDirectInvocation`). Also assert exit-code mapping for invalid `--limit=-1`, `--false-manual-tolerance-m=0`, `--move-threshold-m=-1`.
- [ ] T003 Create `apps/backend/src/scripts/regeocode-permanent.ts` skeleton following `backfill-inspector-base-coords.ts`: exported `regeocodePermanent(deps, options)`, `RegeocodeReport` type (per contract), `RegeocodeOptions`, the pure arg parser (`parseArgs(argv): RegeocodeOptions | { error, exitCode }`), `isDirectInvocation`, inert-on-import guard, dry-run default, `isGeocoderConfigured()` pre-check with `MAPBOX_NOT_CONFIGURED` abort, injectable `sleep`/`clock`, masked-host `regeocode.started`/`regeocode.finished` logging. Make T002 pass.
- [ ] T004 Declare the narrow port `ILegacyRegeocodeRepository` in a new file `apps/backend/src/modules/property/domain/legacy-regeocode.repository.ts`: `applyPermanentBackfill`, `markLegacyNoResult`, `restoreFalseManual`, `backfillBranchCoordinates`, `findLegacyCoordinateCandidates`, `findLegacyBranchCandidates`, `findManualWithTransitionAudit`, `findAddressChangesAfter`, `findImportPreviewsToStrip`, `findAccountBlockedProperties` (signatures per `data-model.md`). Domain-only; `PrismaPropertyRepository` will implement it (shared `IPropertyRepository` untouched).

## Phase 3: User Story 1 — Legacy properties & branches re-geocoded, idempotent, CAS-safe (P1) 🎯 MVP

**Goal**: dry-run counts; `--apply` re-geocodes legacy properties and branches with CAS on `updated_at`, PostGIS consistency, throttle, 429 handling, `noResult`, `moved`, report. **Independent test**: spec integration seed #1–#4.

- [ ] T005 [US1] Extend `apps/backend/src/scripts/regeocode-permanent.test.ts` with failing property-phase unit tests: cases 4 (dry-run scanned, no geocode, `estimatedRequests`), 5 (`applyPermanentBackfill` args incl. `formatGeocodingQuery` query + `{mode:'permanent'}`, `updated:1`, `moved:0`), 6 (100 m → `moved:1`), 7 (`null` → `markLegacyNoResult`, `noResult`, coord intact), 8 (generic error → `errors`, continues), 9 (account error on 2nd → 1st written, `aborted.atEntityId`), 10 (`applyPermanentBackfill` false → `skippedConcurrent:1`), 13 (`rate:120` → `sleep(500)`), 33/34 (429 retry once / twice), 35 (`--limit=1` per phase), 11/12/37 (branch found/no-result/CAS-false).
- [ ] T006 [US1] Implement `findLegacyCoordinateCandidates`, `applyPermanentBackfill`, `markLegacyNoResult` in `apps/backend/src/modules/property/infrastructure/prisma-property.repository.ts` (CAS `updateMany` + `syncCoordinates` in one `$transaction`; selection per data-model.md; batches of 100 by `id`).
- [ ] T007 [US1] Implement `findLegacyBranchCandidates` and `backfillBranchCoordinates` in the same repository file (`$queryRaw` select with `address_json ? 'latitude'` + `updated_at`; `$executeRaw` jsonb merge write that never rewrites the address, CAS on `geocoded_permanently_at IS NULL AND updated_at`).
- [ ] T008 [US1] Implement the property and branch phases in `regeocode-permanent.ts`: throttle (`60000/rate`), haversine, `--move-threshold-m`, 429 → `sleep(60000)` + one retry, account-error abort, per-row `regeocode.entity_processed` debug log, `SYSTEM` audits `property.geocode_permanent_backfilled`/`property.geocode_permanent_no_result`/`branch.geocode_permanent_backfilled`, `--limit` per phase, report counters. Make T005 pass.
- [ ] T009 [US1] Create `apps/backend/tests/integration/db/regeocode-permanent.integration.test.ts` with the real-DB property+branch cases: seed #1 (mixed statuses; only SUCCESS-no-marker/PENDING-with-lat/FAILED-with-lat/branch-with-lat change, `ST_X/ST_Y` match), #2 (`null` → `LEGACY_PERMANENT_NO_RESULT`, coords kept), #3 (second run `scanned:0`), #4/#4b (CAS lost on concurrent lat / address change), #4c/#4d (branch CAS lost / jsonb merge keeps other keys), #7 (audit rows). Fake geocoder, PostGIS. Make it pass.

**Checkpoint**: US1 is independently shippable — legacy coordinate compliance works end to end.

## Phase 4: User Story 2 — False-MANUAL detection & restoration via audit (P1)

**Goal**: detect false MANUAL (Proof 1 audit + Proof 2 distance), restore confirmed, list ambiguous/missing with `addressChangedAfterTransition`. **Independent test**: integration seed #8.

- [ ] T010 [US2] Add failing false-MANUAL unit tests to `apps/backend/src/scripts/regeocode-permanent.test.ts`: cases 19 (no audit → `missingAudit`, no geocode), 20 (redacted → `audit_redacted`), 21 (address changed → `address_changed_in_transition`, no geocode), 22 (trim/case-equal → candidate), 23 (~2.4 m → `restoreFalseManual`, `restored:1`, audit `distanceM`/`toleranceM`), 24 (~11 m → `coordinates_differ`), 25 (tolerance 15 → restored), 26 (`null` → `no_result`, no write), 27 (generic error → `geocode_error`), 28 (account error → abort), 29 (`restoreFalseManual` false → `skippedConcurrent`), 30 (dry-run classification), 31 (`--entities` excludes phase), 32 (geocoder gets `formatGeocodingQuery`+`{mode:'permanent'}`), 38 (`addressChangedAfterTransition` true/false), 39 (`expected.updatedAt` passed), 40 (`estimatedRequests.falseManual`).
- [ ] T011 [US2] Implement `findManualWithTransitionAudit`, `findAddressChangesAfter`, `restoreFalseManual` in `apps/backend/src/modules/property/infrastructure/prisma-property.repository.ts` (the audit `$queryRaw` `DISTINCT ON (entity_id)` per data-model.md; CAS restore in `$transaction` + `syncCoordinates`).
- [ ] T012 [US2] Implement the `false-manual` phase in `regeocode-permanent.ts`: the ordered classification (missingAudit → audit_redacted → address_changed_in_transition → candidate), Proof-2 geocode + haversine tolerance, `addressChangedAfterTransition`, `regeocode.false_manual_classified`/`regeocode.false_manual_processed` logs, `property.false_manual_restored` audit, report `falseManual.*`, `estimatedRequests.falseManual`. Make T010 pass.
- [ ] T013 [US2] Add integration seed #8 (a–e) and #9 to `apps/backend/tests/integration/db/regeocode-permanent.integration.test.ts`: only (a) restored with PostGIS consistent + `property.false_manual_restored`; (b) `coordinates_differ`, (c) `missingAudit`, (d)/(e) `address_changed_in_transition`; (b)–(e) byte-for-byte unchanged; second run `restored:0`. Make it pass.

**Checkpoint**: US1 + US2 together cover the full re-geocoding surface.

## Phase 5: User Story 3 — Strip committed import previews (P2)

**Goal**: `--strip-import-previews` nulls legacy `found`-without-`mode` entries, keeps the rest, no Mapbox.

- [ ] T014 [US3] Add failing unit test case 15 to `apps/backend/src/scripts/regeocode-permanent.test.ts` (2 `found`-no-mode + 1 `found`-mode + 1 `not_found` → 2 nulls, `mode`/`not_found` kept, `stripped:1`) and case 36's strip half (`--tenant=X` scopes the selection).
- [ ] T015 [US3] Implement `findImportPreviewsToStrip` in `apps/backend/src/modules/property/infrastructure/prisma-property.repository.ts` and the strip phase in `regeocode-permanent.ts` (parse `preview_json` via the shared `geocodeVerificationSchema` shape, null only `status==='found' && !mode`, write only on change, `regeocode.import_previews_stripped` log). Make T014 pass.
- [ ] T016 [US3] Add integration case #5 (COMPLETED & FAILED previews stripped; PROCESSING & PREVIEW intact) to the DB integration file. Make it pass.

## Phase 6: User Story 4 — Bulk resume of account-blocked properties (P2)

**Goal**: `--retry-failed-permanent` re-enqueues blocked properties, runs alone, stops the queue.

- [ ] T017 [US4] Add failing unit test case 16 (2 blocked → 2 `update({PENDING, code:null})`, 2 `enqueue('property.geocode',{propertyId},{retryLimit:6,retryBackoff:true})`, `retriedFailedPermanent:2`) and case 36's retry half (`--tenant` scopes) to `apps/backend/src/scripts/regeocode-permanent.test.ts`.
- [ ] T018 [US4] Implement `findAccountBlockedProperties` in the repository and the `--retry-failed-permanent` phase in `regeocode-permanent.ts` (incompatibility guard with `--entities`/`--strip-import-previews` → exit 2; `repo.update` + `enqueue`; `property.geocode_retry_requeued` audit; `stopQueue()` in `finally`; `regeocode.retry_failed_permanent_enqueued`). Make T017 pass.
- [ ] T019 [US4] Add integration case #6 (blocked rows → PENDING code-null, jobs present in the test pg-boss schema) to the DB integration file. Make it pass.

## Phase 7: Polish & cross-cutting

- [ ] T020 [P] Wire the real `main()` entrypoint in `regeocode-permanent.ts`: `createContainer` → `container.geocodingService` (DynamicGeocodingService) for `geocoder` + `isGeocoderConfigured`, `sendJob`/`stopQueue` from `shared/infrastructure/queue`, `container.auditService`, masked DB host; pretty-print the report; `estimatedRequests.total × US$0.005` cost line with the US$ 200 sign-off warning; `prisma.$disconnect()` in `finally`. (Covered by unit cases 4/40; verify no direct `prisma.property.update*` for coordinates.)
- [ ] T021 [P] Create `docs/runbooks/regeocode-permanent.md`: staging→prod rollout, cost formula + current price + US$ 200 threshold, the account's real rate limit, the edge-20 note (`coordinates_differ` from `postcode`/`addressLine2` is expected — do not raise tolerance), and the manual-correction recipe for `ambiguous`/`missingAudit`/`noResult` (prioritize `addressChangedAfterTransition: true`): property → clear Lat/Lng in the web and save (unlock → PENDING → permanent worker); branch → re-open and save the address. State that the prod report + marker-less count is the F03 geofence-BLOCK audit input (dec. 18).
- [ ] T022 [P] Update `apps/backend/CLAUDE.md` §10/§12: document `src/scripts/regeocode-permanent.ts`, the new repository methods, the `LEGACY_PERMANENT_NO_RESULT` code, and that execution is a gated OPS step (dry-run default). (CLAUDE.md §13.11 compliance.)
- [ ] T023 Run the full gate inside the worktree (via subagent, condensed summary): `pnpm --filter backend lint`, `pnpm --filter backend typecheck`, `pnpm --filter backend test -- regeocode-permanent`, `pnpm --filter backend test:integration:db -- regeocode-permanent`; plus a local dry-run smoke (`tsx ... --strip-import-previews`). Fix any failure and re-run. No `pnpm generate:api` (no route/schema change) — confirm `git status` shows no `openapi.json`/`api-types.ts` drift.

---

## Dependencies & order

- **Setup (T001)** → **Foundational (T002–T004)** → stories.
- **US1 (T005–T009)** is the MVP and must land first (it creates the repository `$transaction`/`syncCoordinates` write path and the script's phase loop the others extend).
- **US2 (T010–T013)**, **US3 (T014–T016)**, **US4 (T017–T019)** each depend on the Foundational skeleton + US1's script loop; they touch the same two files (`regeocode-permanent.ts`, `prisma-property.repository.ts`) so they are **sequential**, not parallel, among themselves.
- **Polish (T020–T023)**: T021/T022 (`docs/`, `CLAUDE.md`) are `[P]` with each other and with code; T020 edits the script (after the phases exist); T023 is the final gate, last.

## Parallel opportunities

- T002 can start immediately (new file).
- T021 (runbook) and T022 (CLAUDE.md) are independent files — write them in parallel with late code tasks.
- Everything else serializes on `regeocode-permanent.ts` and `prisma-property.repository.ts`.

## MVP scope

**US1 only** (T001–T009) is a shippable increment: legacy properties and branches become permanent-compliant with a report, CAS safety and PostGIS consistency. US2–US4 are bounded add-ons layered on the same script.

## Implementation strategy

Red→green→refactor per task: write the listed failing tests, implement to green, refactor. Keep the script dry-run-safe at every step. Do not run `--apply` against any real data — execution is a separate OPS step after X02-1 is in production.
