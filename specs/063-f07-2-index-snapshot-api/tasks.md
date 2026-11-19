# Tasks: Reliability Index — Daily Snapshot, Recompute-on-Settings-Change & AM/OP API

**Input**: Design documents from `/specs/063-f07-2-index-snapshot-api/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (api.md, jobs-and-events.md), quickstart.md
**Tests**: INCLUDED — TDD is mandatory (constitution §III); the task file provides the full red test list.

**Branch**: `063-f07-2-index-snapshot-api` (worktree, based on `origin/develop`). Builds on merged TASK-F07-1.

## Conventions

- Backend module path: `apps/backend/src/modules/reliability/` (new `application/`, `infrastructure/`, `interfaces/` on the existing F07-1 `domain/`).
- `[P]` = parallelizable (different file, no incomplete dependency). Tasks touching the same file are sequential.
- After every shared edit: `pnpm --filter @properfy/shared build` before backend typecheck.
- Red→green→refactor: write the test task, see it fail, implement, see it pass.

---

## Phase 1: Setup

- [x] T001 Confirm the worktree baseline is green (delegated to the setup subagent): `pnpm install`, `prisma generate`, `@properfy/shared build`, and backend+shared `typecheck`/`lint` all pass on `origin/develop` HEAD before any change.

---

## Phase 2: Foundational (blocking prerequisites for all stories)

**Purpose**: data model, shared contract, and the pure domain + repository that every use case depends on.

- [x] T002 Add `model InspectorReliabilitySnapshot` and `Inspector.reliability_snapshots` to `apps/backend/prisma/schema.prisma` per data-model.md (`@@unique([inspector_id, snapshot_date])`, `@@index([snapshot_date, score(sort: Desc)])`, no `tenant_id`).
- [x] T003 Generate the expand-only migration `apps/backend/prisma/migrations/<ts>_inspector_reliability_snapshots/migration.sql` (ordered after the F07-1 migration) and add the two raw CHECK constraints (`score` range; `status='SCORED' ⇔ score IS NOT NULL`); apply locally and `prisma generate`.
- [x] T004 [P] Write the shared schema test `packages/shared/src/schemas/reliability.test.ts` (test 9): `reliabilityRankingResponseSchema` accepts the example and rejects `score` out of 0–100 and `position 0`; `inspectorReliabilityResponseSchema` accepts `NOT_COMPUTED` with `metrics []` and rejects a metric with 21 failures; both require `isStale`+`settingsUpdatedAt`; `inspectorReliabilityParamsSchema` requires a uuid.
- [x] T005 [P] Write the role-matrix test addition `packages/shared/src/permissions/role-matrix.test.ts` (test 10): `ROLE_ACTION_MATRIX['reliability.view'].roles === ['AM','OP']`.
- [x] T006 Add `reliabilityRankingResponseSchema`, `inspectorReliabilityResponseSchema`, `inspectorReliabilityParamsSchema` and `reliabilityDetailStatusSchema` (adds API-only `NOT_COMPUTED`) to `packages/shared/src/schemas/reliability.ts` (import already-exported `instantStr`/`civilDateSchema`, extend `reliabilityMetricResultSchema` with `weight`); export from the schemas barrel. (makes T004 pass)
- [x] T007 Append `'reliability.view': { roles: ['AM', 'OP'] }` to `ROLE_ACTION_MATRIX` in `packages/shared/src/permissions/role-matrix.ts`; then `pnpm --filter @properfy/shared build`. (makes T005 pass)
- [x] T008 [P] Write `apps/backend/src/modules/reliability/domain/snapshot-window.test.ts` (test 1): `snapshotWindow('2026-12-01')→{from:'2026-11-01',to:'2026-11-30'}`; `snapshotWindow('2026-03-01')→{from:'2026-01-30',to:'2026-02-28'}`; `snapshotDateFor(2026-11-30T13:30:00Z)→'2026-12-01'` under `TZ=America/Los_Angeles`.
- [x] T009 Implement `apps/backend/src/modules/reliability/domain/snapshot-window.ts` (`snapshotWindow`, `snapshotDateFor` via `civilDateInTz`/`addCivilDays`, `PLATFORM_TIMEZONE`). (makes T008 pass)
- [x] T010 [P] Write `apps/backend/src/modules/reliability/domain/ranking.test.ts` (test 2): competition ranking "1,2,2,4" with name tiebreak; `notEnoughData` by volume desc then name; ACTIVE-without-row → `notEnoughData` volume 0 `INSUFFICIENT_VOLUME`; INACTIVE excluded from both; region-agnostic single platform-wide list (R2).
- [x] T011 Implement `apps/backend/src/modules/reliability/domain/ranking.ts` (`rankSnapshots(rows)` — pure, platform-wide, no region input). (makes T010 pass)
- [x] T012 [P] Implement `apps/backend/src/modules/reliability/domain/snapshot-retention.ts` (`RELIABILITY_SNAPSHOT_RETENTION_DAYS = 400`) and `apps/backend/src/modules/reliability/domain/reliability.errors.ts` (`InspectorNotFoundError` → 404 `INSPECTOR_NOT_FOUND`).
- [x] T013 [P] Implement `apps/backend/src/modules/reliability/domain/reliability-snapshot.entity.ts` and the port `apps/backend/src/modules/reliability/domain/reliability-snapshot.repository.ts` (`IReliabilitySnapshotRepository`: `createManyForDate(tx, rows)`/`deleteForDate(tx, date)`, `purge(tx, before, deletedInspectors)`, `findLatestSnapshotDate(tx?)`, `findByDate(date)`, `findInspectorRow(inspectorId, date)`, `findTodayMeta()` for ensure-today, plus `listNonDeletedInspectors`/`findInspector` as needed).
- [x] T014 Implement `apps/backend/src/modules/reliability/infrastructure/prisma-reliability-snapshot.repository.ts` (implements the port; `Prisma.Decimal`→`number`; purge via `deleteMany` OR `snapshot_date < before` / `inspector.deleted_at not null`; reads latest `snapshot_date` and `platform_settings.updated_at` of `reliabilityIndex`).

**Checkpoint**: shared builds green; domain + repository compile; schema/role-matrix tests pass.

---

## Phase 3: User Story 4 — Daily snapshot computed idempotently & serialized (P1)

**Goal**: `ComputeReliabilitySnapshotsUseCase` writes one row per non-deleted inspector under the advisory lock, idempotently, with the once-per-run median; registered as the 04:15 job.
**Independent test**: run the use case for a seeded day → one row per inspector, same `volumeReference` across rows, re-run replaces (count stable), concurrency fails without the lock.

- [x] T015 [US4] Write `apps/backend/src/modules/reliability/application/use-cases/compute-reliability-snapshots.use-case.test.ts` (test 3, fakes, clock `2026-12-01T17:15:00Z`): one row per inspector with the documented columns; single `computeAllWith` call; `volumeReference 9.5` on every row; next-day different population → different reference; empty inspector → `INSUFFICIENT_VOLUME`/`score null`/`VOLUME 0`; run 2× replaces; reads settings after the lock; reader error → rollback + rethrow; returns `{ snapshotDate, inspectors, scored, insufficient, durationMs }` + logs `reliability.snapshots_computed`.
- [x] T016 [US4] Implement `apps/backend/src/modules/reliability/application/use-cases/compute-reliability-snapshots.use-case.ts` (algorithm §: fix `snapshotDate`+window; `$transaction` with `pg_advisory_xact_lock(hashtext('reliability.compute-snapshots'))`; read settings; load inspectors; `computeAllWith` once; build rows via `computeReliabilityScore` (inspectors absent from `batch.byInspector` get a synthesized result — `volume 0`, 8 metrics all `rate null` except `VOLUME rate 0`, shared reference → `INSUFFICIENT_VOLUME`/`score null`; verify F07-1's empty-facts behavior for `VOLUME` pro-rata when implementing); `deleteForDate`+`createManyForDate`; log). Failure path logs `reliability.snapshots_failed` and rethrows. (makes T015 pass)
- [x] T017 [US4] Wire `container.reliability.computeSnapshotsUseCase` in `apps/backend/src/main/container.ts` (inject repository, `ReliabilityMetricsService`, `IPlatformSettingsReader`, logger, prisma for the tx).
- [x] T018 [US4] Register the `reliability.compute-snapshots` schedule (`'15 4 * * *'`, SYDNEY_TZ) + worker (`teamSize 1, teamConcurrency 1`, `trigger = job.data.trigger ?? 'SCHEDULED'`, try/catch → `reliability.snapshots_failed { attempt: job.retryCount+1 }` → rethrow) in `apps/backend/src/main/workers.ts`; add the queue to the final log list; update both worker test sites (`tests/unit/workers.test.ts` counts + `src/main/__tests__/workers.test.ts` `EXPECTED_SCHEDULES`).

---

## Phase 4: User Story 1 — AM/OP reads the current ranking (P1)

**Goal**: `GET /v1/dashboard/inspector-performance` serves the latest snapshot's ranking with RBAC + freshness.
**Independent test**: AM → 200 with the seeded ranking; CL/INSP → 403 with no read; no snapshot → empty payload.

- [x] T019 [US1] Write `apps/backend/src/modules/reliability/application/use-cases/get-reliability-ranking.use-case.test.ts` (test 6, ranking cases): AM/OP ok; CL/INSP → `ForbiddenError` + `authorization.denied` + no repo read; no snapshot → documented empty object; `isStale` by clock; `settingsUpdatedAt`; `volumeReference`/source + `minimumVolume` from the latest snapshot's `settings_json`.
- [x] T020 [US1] Implement `apps/backend/src/modules/reliability/application/use-cases/get-reliability-ranking.use-case.ts` (assertRoles `reliability.view` first; latest snapshot → `rankSnapshots`; derive `isStale`/`settingsUpdatedAt`). (makes T019 pass)
- [x] T021 [US1] Add `GET /v1/dashboard/inspector-performance` to `apps/backend/src/modules/reliability/interfaces/reliability.routes.ts` (`preHandler: authenticate`, response `successResponseSchema(reliabilityRankingResponseSchema)`, `success(result)`); register the route file in the app wiring; wire `container.reliability.getRankingUseCase`.

---

## Phase 5: User Story 2 — AM/OP reads one inspector's detail (P1)

**Goal**: `GET /v1/dashboard/inspector-performance/:inspectorId` serves the stored 8 metrics + weights + failures.
**Independent test**: AM → detail with `score 88.3`, `position 4`, metrics+failures; NOT_COMPUTED for a rowless inspector; 404 unknown; 400 non-uuid.

- [x] T022 [US2] Write `apps/backend/src/modules/reliability/application/use-cases/get-inspector-reliability.use-case.test.ts` (test 6, detail cases): scored detail with weights from `settings_json`, `position`/`rankedCount`; INSUFFICIENT_VOLUME; NOT_COMPUTED (`metrics []`, volume 0); INACTIVE with row (`position null`); unknown/deleted → `InspectorNotFoundError`; failures from `metrics_json` (not recomputed).
- [x] T023 [US2] Implement `apps/backend/src/modules/reliability/application/use-cases/get-inspector-reliability.use-case.ts` (assertRoles first; find inspector or 404; find row in latest snapshot or NOT_COMPUTED; position from `rankSnapshots`). (makes T022 pass)
- [x] T024 [US2] Add `GET /v1/dashboard/inspector-performance/:inspectorId` (params `inspectorReliabilityParamsSchema`, response `successResponseSchema(inspectorReliabilityResponseSchema)`) to `reliability.routes.ts`; wire `container.reliability.getInspectorReliabilityUseCase`.
- [x] T025 [US1][US2] Write the HTTP integration test `apps/backend/tests/integration/reliability/reliability.routes.test.ts` (test 7, Supertest): 401 no token; 403 CL/CL_USER/INSP; 200 AM/OP; `/not-a-uuid` → 400; unknown id → 404; privacy contract (recursive scan: no `latitude/longitude/lat/lng/email/phone`, ≤ 20 failures, `detail` ≤ 80 chars, no coordinate/address); schema contract (all fields present after serialization).

**Checkpoint**: both routes live; MVP (US4+US1+US2) demoable.

---

## Phase 6: User Story 3 — Index recomputed on weights change (03.A1) (P1)

**Goal**: subscribe the F03 event and enqueue a delayed `SETTINGS_CHANGED` recompute for `reliabilityIndex` only.
**Independent test**: event for `reliabilityIndex` → one enqueue (+35 s, no singletonKey); other keys → nothing; enqueue failure → logged, not thrown.

- [x] T026 [US3] Write `apps/backend/src/modules/reliability/application/subscribers/recompute-reliability-on-settings-change.subscriber.test.ts` (test 4): `reliabilityIndex` event → `enqueue('reliability.compute-snapshots', {trigger:'SETTINGS_CHANGED'}, {startAfter: occurredAt+35s, retryLimit:3, retryBackoff:true, expireInMinutes:15})` no `singletonKey`; other keys → no enqueue; enqueue throws → `logger.error`, no throw.
- [x] T027 [US3] Implement `apps/backend/src/modules/reliability/application/subscribers/recompute-reliability-on-settings-change.subscriber.ts` with `SETTINGS_RECOMPUTE_DELAY_SECONDS = 35` (comment tying it to the F03 30 s cache TTL); import `PLATFORM_SETTING_EVENTS` (do not declare it). (makes T026 pass)
- [x] T028 [US3] In `apps/backend/src/main/container.ts`, construct the subscriber and register `domainEventBus.subscribe(PLATFORM_SETTING_EVENTS.UPDATED, subscriber.handle)`; do NOT edit `update-platform-setting.use-case.ts`.

---

## Phase 7: User Story 5 — Stale data & overdue recompute visible and self-healing (P2)

**Goal**: `EnsureTodaySnapshotUseCase` (backfill + overdue), hourly job, boot backfill; `isStale`/`settingsUpdatedAt` already in the read use cases (US1/US2).
**Independent test**: no row today → enqueue BACKFILL; overdue weights → log + enqueue SETTINGS_CHANGED; within 15 min → PENDING; up to date → UP_TO_DATE; failed job → `isStale true` then healed.

- [x] T029 [US5] Write `apps/backend/src/modules/reliability/application/use-cases/ensure-today-snapshot.use-case.test.ts` (test 3a): the four outcomes (`ENQUEUED_MISSING`/`UP_TO_DATE`/`PENDING`/`ENQUEUED_OVERDUE`) with the clock cases; `recompute_overdue` log on overdue; double-call → up to 2 jobs (lock resolves).
- [x] T030 [US5] Implement `apps/backend/src/modules/reliability/application/use-cases/ensure-today-snapshot.use-case.ts` (`RECOMPUTE_OVERDUE_MINUTES = 15`; reads today's row meta + `settingsUpdatedAt`; enqueues BACKFILL/SETTINGS_CHANGED; `logger.error('reliability.recompute_overdue', …)`). (makes T029 pass)
- [x] T031 [US5] Wire `container.reliability.ensureTodaySnapshotUseCase`; register the `reliability.ensure-today` schedule (`'0 5-12 * * *'`, SYDNEY_TZ, no `singletonKey`) + worker, add the boot backfill `await ensureTodaySnapshotUseCase.execute()` after registration, add the queue to the log list, and update both worker test sites (counts + `EXPECTED_SCHEDULES`) in `apps/backend/src/main/workers.ts`.
- [x] T032 [US5] Confirm/extend the ranking + detail use-case tests (T019/T022) cover `isStale` (clock before/after the job, incl. 03:00) and `settingsUpdatedAt` (set / never-saved → null) per test 6; implement the derivations in the read use cases if not already.

---

## Phase 8: User Story 6 — 400-day retention & deleted-inspector purge (P2)

**Goal**: purge inside the `SCHEDULED` compute transaction only.
**Independent test**: 401-day row + deleted-inspector rows removed after a SCHEDULED run; SETTINGS_CHANGED/BACKFILL do not purge.

- [x] T033 [US6] Extend `compute-reliability-snapshots.use-case.test.ts` (test 3, L-F07-12 cases): after `createMany`, `SCHEDULED` deletes `snapshot_date < today−400` (401 gone, 400 kept) and all rows of soft-deleted inspectors; logs `reliability.snapshots_purged { count, deletedInspectors }`; `SETTINGS_CHANGED`/`BACKFILL` → no purge; deleted inspectors never gain a new row.
- [x] T034 [US6] Add the purge step (`repo.purge(tx, snapshotDate−400, deletedInspectors)`, `SCHEDULED` only, same transaction, after `createManyForDate`) to `compute-reliability-snapshots.use-case.ts` and log `reliability.snapshots_purged`. (makes T033 pass)

---

## Phase 9: User Story 7 — F08 exported reader with platform-wide position (P2)

**Goal**: `ReliabilityIndexReader.getCurrentIndexes` for F08; position is platform-wide regardless of filter.
**Independent test**: `getCurrentIndexes(['ana'])` → Ana `position 4` (not 1); no-row inspector → `NOT_COMPUTED`.

- [x] T035 [US7] Write `apps/backend/src/modules/reliability/application/reliability-index.reader.test.ts` (test 2a): subset filter keeps the platform-wide position; full read matches `rankSnapshots`; below-volume → `INSUFFICIENT_VOLUME`/`position null`; no row → `NOT_COMPUTED`, `snapshotDate` = latest.
- [x] T036 [US7] Implement `apps/backend/src/modules/reliability/application/reliability-index.reader.ts` (`ReliabilityIndexReader.getCurrentIndexes(inspectorIds?)`; position from the full latest snapshot, output narrowed by filter) and expose `container.reliability.indexReader`. (makes T035 pass)

---

## Phase 10: Polish & Cross-Cutting

- [x] T037 Write the real-DB integration test `apps/backend/tests/integration/db/reliability-snapshots.db.test.ts` (test 8, testcontainers): seeded ranking end-to-end; 03.A1 (`PUT reliabilityIndex PUNCTUALITY:3` → event → job → Ana 87.3, audit with actorId); override 20 → Ana 83.3 then back to 9.5; **concurrency serialization that FAILS if the advisory lock is removed**; idempotency (3× → inspector-count rows); performance (200×30 < 15 s, fixed query count); backfill enqueue; failed-job→`isStale`→ensure-today recovery; purge.
- [x] T038 [P] Update `apps/backend/CLAUDE.md` (Reliability index section): add the TASK-F07-2 routes (`GET /v1/dashboard/inspector-performance(+/:id)`, `reliability.view`), the two jobs (04:15 compute + 05:00–12:00 ensure-today, reasons), the snapshot table (no `tenant_id`, §7.1 exception), 400-day retention, recompute via the settings event (+35 s), and the `reliability.snapshots_failed`/`recompute_overdue` alert logs.
- [x] T039 [P] Update `packages/shared/CLAUDE.md` (Reliability index F07-1 bullet): note the F07-2 API response schemas (`reliabilityRankingResponseSchema`/`inspectorReliabilityResponseSchema`/`inspectorReliabilityParamsSchema`, `reliabilityDetailStatusSchema` adds API-only `NOT_COMPUTED`) and the `reliability.view` role-matrix action.
- [x] T040 Regenerate the API contract: `pnpm --filter backend generate:openapi` then `pnpm --filter @properfy/shared generate:types` (or `pnpm generate:api`); commit both `openapi.json` and `api-types.ts` with no pending diff.
- [x] T041 Run the full gates inside the worktree (via subagent, condensed summary): `pnpm --filter @properfy/shared build test`; `pnpm --filter backend exec prisma generate`; `pnpm --filter backend typecheck lint test`; `pnpm --filter backend test:integration:db`; confirm `git diff --stat origin/develop... | tail -1` < 150 files and no contract-freshness diff.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** block everything.
- Within Phase 2: T002→T003 (schema→migration); T004/T005/T008/T010/T012/T013 are `[P]` (different files); T006 after T004, T007 after T005, T009 after T008, T011 after T010; T014 after T013 (+T002/T003 for Prisma types).
- **US4 (Phase 3)** needs Phase 2 (repository + metrics service). **US1/US2 (Phases 4–5)** need US4's rows conceptually but can be implemented against the repository in parallel after Phase 2; the DB e2e (T037) needs US4+US3.
- **US3 (Phase 6)** needs US4's job name. **US5 (Phase 7)** needs US4 + the read use cases. **US6 (Phase 8)** edits the US4 file (sequential after T016). **US7 (Phase 9)** needs Phase 2 + `ranking.ts`.
- **Polish (Phase 10)**: T037 after US3/US4/US6; T038/T039 `[P]`; T040 after all routes exist; T041 last.

## Parallel opportunities

- T004, T005, T008, T010, T012, T013 (distinct files) in parallel after T003.
- T038 and T039 (two different CLAUDE.md files) in parallel.
- US1 (T019–T021) and US2 (T022–T024) are mostly parallel (shared route file T021/T024 is sequential; shared integration test T025 after both).

## MVP scope

US4 + US1 + US2 (Phases 3–5) — the daily snapshot plus the AM/OP ranking and detail reads — is the minimum demoable increment. US3 (03.A1) is the headline acceptance and should ship in the same PR; US5/US6/US7 are required for go-live and F08 and are included in this single PR.

## Format validation

All tasks use `- [ ] [TaskID] [P?] [Story?] Description + file path`; Setup/Foundational/Polish carry no story label; Phases 3–9 carry `[US4]`/`[US1]`/`[US2]`/`[US3]`/`[US5]`/`[US6]`/`[US7]`.
