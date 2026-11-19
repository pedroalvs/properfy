# Feature Specification: Reliability Index — Daily Snapshot, Recompute-on-Settings-Change & AM/OP API

**Feature Branch**: `063-f07-2-index-snapshot-api`
**Created**: 2026-11-07
**Status**: Draft
**Input**: TASK-F07-2 (`fase2-etapa1/tarefas/F07-tarefas.md`) — Backend + shared: `InspectorReliabilitySnapshot`, daily job `reliability.compute-snapshots` (04:15 Sydney) + hourly `reliability.ensure-today`, deploy backfill, recompute on saving the `reliabilityIndex` weights (subscribing the F03 `platform_setting.updated.v1`, serialized by an advisory lock), 400-day retention, and the AM/OP ranking + detail API (with `isStale`/`settingsUpdatedAt`).

**Contract codes covered:** `03.4` (snapshot `03.4a` + job), effect of `03.3`, `03.5`, `03.11`/`03.12` (AM/OP screen's API), and acceptance criterion **`03.A1`** (index follows configured weights and is recomputed when the configuration changes). Lacunas `L-F07-02`, `L-F07-06`, `L-F07-08`, `L-F07-10`, `L-F07-12`; reconciliation `R1`, `R2`, `R3`.

**Builds on (already merged):** TASK-F07-1 (`reliability` module compute engine — `ReliabilityMetricsService.computeAllWith`, `computeReliabilityScore`, `reliabilityMetricResultSchema`, `RELIABILITY_WINDOW_DAYS`, the eight metric keys, the `reliabilityIndex` platform-settings key, and the `INSPECTOR_NO_SHOW`/`NOT_EXECUTED` rejection codes). TASK-F03-1 (`PlatformSetting`, `IPlatformSettingsReader`, and the F03 `UpdatePlatformSettingUseCase` that emits `platform_setting.updated.v1`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - AM/OP reads the current reliability ranking (Priority: P1)

An Admin Master or Operator opens the "Inspector performance" data and sees a competition ranking of inspectors by their current reliability score, plus a separate "Not enough data" group for inspectors below the minimum volume (or with no weighted data). The data is served from the most recent daily snapshot — no per-request recomputation.

**Why this priority**: This is the core deliverable of the feature and the only read the AM/OP screen (TASK-F07-3) and the F08 consumer need to exist first. Without the stored snapshot and the ranking read, nothing else has value.

**Independent Test**: Seed the F07-1 worked example (Ana, Ben, Carla, Dan, Eva, Fábio) with November/2026 services, run the compute job for `2026-12-01`, and call `GET /v1/dashboard/inspector-performance` as AM → the ranked list is `[Eva 100, Fábio 97.5, Dan 89.0, Ana 88.3, Ben 79.0]` and `notEnoughData` is `[Carla 9]`.

**Acceptance Scenarios**:

1. **Given** a snapshot exists for the latest date, **When** AM or OP calls `GET /v1/dashboard/inspector-performance`, **Then** the response is `success(ReliabilityRankingResponse)` with `ranked` ordered by score (competition ranking "1, 2, 2, 4" on ties, ties broken by name) using only `SCORED` + `ACTIVE` rows, and `notEnoughData` ordered by volume desc then name.
2. **Given** no snapshot has ever been computed, **When** AM calls the ranking, **Then** it returns `{ snapshotDate: null, windowFrom: null, windowTo: null, computedAt: null, isStale: false, settingsUpdatedAt: null, minimumVolume: <current setting>, volumeReference: null, volumeReferenceSource: null, ranked: [], notEnoughData: [] }`.
3. **Given** any snapshot, **When** CL_ADMIN, CL_USER (with any flag), or INSP calls the ranking, **Then** it returns `403 FORBIDDEN` with an `authorization.denied` audit (`attemptedAction 'reliability.view'`) and **no repository read**; a request with no token returns `401`.
4. **Given** an inspector is `ACTIVE` but has no row in the latest snapshot (created after the compute), **When** AM reads the ranking, **Then** that inspector appears in `notEnoughData` with `volume 0` and `status 'INSUFFICIENT_VOLUME'`; an `INACTIVE` inspector appears in neither list.

---

### User Story 2 - AM/OP reads one inspector's reliability detail (Priority: P1)

An Admin Master or Operator opens one inspector's detail and sees the eight metrics (in canonical order) with the per-metric weight that produced the stored score, the score and competition position, the volume figures, and — per metric — the capped list of failures with no location data.

**Why this priority**: The detail (03.12) is the explainability half of the AM/OP screen and is required by TASK-F07-3 at the same time as the ranking. It reads the snapshot's stored `metrics_json` and `settings_json`, never recomputing.

**Independent Test**: With the seeded example, `GET /v1/dashboard/inspector-performance/:anaId` as AM returns `status 'SCORED'`, `score 88.3`, `position 4`, `rankedCount 5`, eight metrics with weights from the snapshot's `settings_json`, and the PUNCTUALITY metric carries its `failures` and `failureCount`.

**Acceptance Scenarios**:

1. **Given** a scored inspector in the latest snapshot, **When** AM/OP requests the detail, **Then** it returns `success(InspectorReliabilityResponse)` with `status 'SCORED'`, the eight metrics (canonical order) each extended with its `weight` from `settings_json`, the stored `score`, `position`, `rankedCount`, and `volumeReference`/`volumeReferenceSource` from `settings_json`.
2. **Given** an inspector below the minimum volume, **When** AM/OP requests the detail, **Then** `status 'INSUFFICIENT_VOLUME'`, `score null`, `position null`, metrics still populated.
3. **Given** an inspector with no row in the latest snapshot, **When** AM/OP requests the detail, **Then** `status 'NOT_COMPUTED'`, `score null`, `metrics []`, `volume 0`, `volumeReference null`, and `snapshotDate` = the latest snapshot date.
4. **Given** an `INACTIVE` inspector that has a snapshot row, **When** AM/OP requests the detail, **Then** it returns the row with `position null`.
5. **Given** a non-uuid `:inspectorId`, **When** AM/OP requests the detail, **Then** `400 VALIDATION_ERROR`; an unknown or soft-deleted id returns `404 INSPECTOR_NOT_FOUND`.
6. **Given** any detail response, **When** the body is serialized and scanned recursively, **Then** it contains no `latitude`/`longitude`/`lat`/`lng`/`email`/`phone` key at any level, no metric has more than `RELIABILITY_FAILURES_MAX (20)` failures, every `detail` is ≤ 80 chars, and no `detail` matches a coordinate pattern (`/-?\d{1,3}\.\d{4,}/`) or the seed property's address.

---

### User Story 3 - The index is recomputed when the weights change (03.A1) (Priority: P1)

When an AM saves the `reliabilityIndex` platform setting (weights, `minimumVolume`, `volumeReferenceOverride`, `minimumRatings`), today's snapshot is recomputed with the new configuration — without the operator waiting for the next 04:15 run — so the ranking reflects the saved weights.

**Why this priority**: `03.A1` is the single named acceptance criterion of the task and the whole reason the recompute path (event subscriber → job → advisory lock) exists. It is P1 and must be proven end-to-end.

**Independent Test**: `PUT /v1/platform-settings/reliabilityIndex` (AM) with `PUNCTUALITY: 3` → the F03 use case emits `platform_setting.updated.v1` → the F07 subscriber enqueues `reliability.compute-snapshots` with `{ trigger: 'SETTINGS_CHANGED' }` → run the handler → Ana's stored score for `2026-12-01` changes from `88.3` to `87.3`; the `platform_setting.updated` audit carries the AM's `actorId`.

**Acceptance Scenarios**:

1. **Given** the `platform_setting.updated.v1` event for key `reliabilityIndex` at time `T`, **When** the subscriber handles it, **Then** it enqueues `reliability.compute-snapshots` with `{ trigger: 'SETTINGS_CHANGED' }`, `startAfter = T + 35 s`, `retryLimit: 3`, `retryBackoff: true`, `expireInMinutes: 15`, and **no** `singletonKey`.
2. **Given** a `platform_setting.updated.v1` for any other key (`fieldEvents`, `routeWeights`, `liveDayAlerts`, …), **When** the subscriber handles it, **Then** it enqueues nothing.
3. **Given** the enqueue fails, **When** the subscriber handles the event, **Then** it logs an error and does not throw (the save already committed; the daily job corrects it).
4. **Given** a `volumeReferenceOverride` of `20` is saved then reset to `null`, **When** the job runs each time, **Then** Ana's score reflects `volumeReference { value: 20, source: 'OVERRIDE' }` then `{ value: 9.5, source: 'MEDIAN' }`.

---

### User Story 4 - The daily snapshot is computed idempotently and serialized (Priority: P1)

A platform job computes one snapshot row per non-deleted inspector every day at 04:15 Sydney, in a single pass for all inspectors, serialized across app instances so two runs (e.g. the scheduled run and a settings-triggered recompute) never corrupt the day's rows.

**Why this priority**: The ranking and detail are useless without the rows; idempotency and serialization are correctness, not polish, because the recompute path and multiple Fly machines create genuine concurrency.

**Independent Test**: Run the compute use case for `2026-12-01` three times (sequential and concurrent) → `SELECT count(*) WHERE snapshot_date = '2026-12-01'` always equals the inspector count; the concurrent test fails if the `pg_advisory_xact_lock` is removed.

**Acceptance Scenarios**:

1. **Given** the clock is `2026-12-02 04:15` Sydney, **When** the job runs with `trigger 'SCHEDULED'`, **Then** it writes one row per non-deleted inspector (ACTIVE and INACTIVE) with `snapshot_date '2026-12-02'`, `window_from '2026-11-02'`, `window_to '2026-12-01'`, `window_days 30`, the `settings_json` actually used (`weights`, `minimumVolume`, `minimumRatings`, `toleranceMinutes`, `volumeReference { value, source, activeInspectors, periodDays }`) and `metrics_json` with the eight metrics.
2. **Given** the inspectors of the worked example, **When** the job runs, **Then** every row of that day has the same `settings_json.volumeReference.value` (`9.5`) and the metrics service is called **once** (`computeAllWith`, unfiltered), never per inspector.
3. **Given** the job runs twice the same day, **When** it finishes, **Then** the content is identical and the row count unchanged (the day's rows are replaced; `computed_at` is the second run's).
4. **Given** the facts reader throws, **When** the job runs, **Then** the transaction rolls back (no row changed), the error propagates (pg-boss retries), and `reliability.snapshots_failed { snapshotDate, trigger, reason, attempt }` is logged at `error` first (a timeout logs `reason 'TIMEOUT'`).
5. **Given** the job reads settings, **When** it runs, **Then** it reads `reliabilityIndex` and `fieldEvents` through the existing `IPlatformSettingsReader` **after** acquiring the advisory lock.

---

### User Story 5 - Stale data and overdue recompute are visible and self-healing (Priority: P2)

When the daily job has not yet produced today's snapshot (it failed, exhausted retries, or the machine was down at 04:15), the API reports the data as stale and an hourly reinforcement job (05:00–12:00 Sydney) re-enqueues the missing snapshot. When the weights were saved but the recompute has not run, the API exposes `settingsUpdatedAt`; after 15 minutes the hourly job logs an overdue signal and re-enqueues.

**Why this priority**: Operability of a critical, silent job (the `dlq-monitor` does not alert on a single failed job). It makes a failed/overdue state observable to the screen and auto-recoverable, but the core read value in US1–US4 exists without it.

**Independent Test**: Make the handler throw 6× for `2026-12-02` → the ranking returns `snapshotDate '2026-12-01'`, `isStale true`; the 05:00 `ensure-today` enqueues again; the now-healthy handler writes `2026-12-02` and `isStale` becomes `false`.

**Acceptance Scenarios**:

1. **Given** the latest snapshot date is before today (Sydney), **When** AM/OP reads the ranking or detail, **Then** `isStale` is `true`; when it equals today, `isStale` is `false`.
2. **Given** no row exists for today, **When** `reliability.ensure-today` runs, **Then** it enqueues one `reliability.compute-snapshots` with `{ trigger: 'BACKFILL' }` and returns `'ENQUEUED_MISSING'`.
3. **Given** today's row exists and `settingsUpdatedAt > computedAt + 15 min`, **When** `ensure-today` runs, **Then** it logs `reliability.recompute_overdue { settingsUpdatedAt, computedAt }` at `error`, enqueues `{ trigger: 'SETTINGS_CHANGED' }`, and returns `'ENQUEUED_OVERDUE'`; within 15 minutes it returns `'PENDING'` and does nothing; fully up to date returns `'UP_TO_DATE'`.
4. **Given** the `reliabilityIndex` setting's `updated_at` is `T`, **When** AM/OP reads the ranking or detail, **Then** `settingsUpdatedAt` equals `T` (or `null` when the key was never saved).

---

### User Story 6 - The daily job retains 400 days and purges deleted inspectors (Priority: P2)

Each scheduled run, in the same transaction, deletes snapshot rows older than 400 days and all rows of soft-deleted inspectors, bounding table growth and removing data for inspectors that no longer exist.

**Why this priority**: Retention and privacy hygiene. Needed before go-live but not a prerequisite for the read value; only the `SCHEDULED` trigger purges.

**Independent Test**: Seed rows 401 and 400 days old and a soft-deleted inspector with recent rows → after a `SCHEDULED` run only the 401-day row and the deleted inspector's rows are gone; `reliability.snapshots_purged { count, deletedInspectors }` is logged.

**Acceptance Scenarios**:

1. **Given** a `SCHEDULED` run on `2026-12-02`, **When** it commits, **Then** rows with `snapshot_date < 2026-12-02 − 400 days` are deleted (`2025-10-27` gone, `2025-10-28` kept) together with every row of inspectors whose `deleted_at` is not null, and `reliability.snapshots_purged` is logged.
2. **Given** a `SETTINGS_CHANGED` or `BACKFILL` run, **When** it commits, **Then** no purge happens.
3. **Given** a soft-deleted inspector, **When** any run executes, **Then** it never gains a new row.

---

### User Story 7 - F08 reads the current index with a platform-wide position (Priority: P2)

The reliability module exports a reader (`ReliabilityIndexReader.getCurrentIndexes`) that F08 uses to read inspectors' current scores and positions. The position is always the competition ranking across the whole platform (all `ACTIVE` + `SCORED` rows of the latest snapshot); filtering by a subset of inspectors only narrows the output, never the position.

**Why this priority**: It unblocks F08 (levels, goals, anonymous app ranking) but is not needed by the AM/OP screen; F08 depends on `03.A3` honoring the platform-wide position.

**Independent Test**: `getCurrentIndexes(['ana'])` returns Ana with `position 4` (the same as in the full 5-inspector ranking), not `1`.

**Acceptance Scenarios**:

1. **Given** the worked example, **When** `getCurrentIndexes(['ana'])` is called, **Then** Ana's `position` is `4` and only Ana is returned.
2. **Given** `getCurrentIndexes()` (no filter), **When** called, **Then** every inspector has the same positions `rankSnapshots` produces; a below-volume inspector has `position null`, `status 'INSUFFICIENT_VOLUME'`; an inspector with no row has `status 'NOT_COMPUTED'` and `snapshotDate` = the latest date.
3. **Given** the contract documented for F08, **When** F08 reads, **Then** `snapshotDate` may be earlier than today (the consumer records `index_snapshot_date` at close); there is no `getUncached`.

### Edge Cases

- **No snapshot yet** (before the first job/backfill): ranking is empty with `snapshotDate null`, `isStale false`.
- **Inspector created after the compute**: `notEnoughData` with `volume 0` until the next job; detail `NOT_COMPUTED`.
- **Inspector deactivated**: dropped from ranking and `notEnoughData`; the snapshot row is still written (history).
- **Subscriber (F03 event) throws**: the `PUT` already returned 200 (`Promise.allSettled` on the F03 side); the hourly `ensure-today` catches the overdue recompute.
- **Weights saved during the daily job**: the triggered job starts 35 s later, waits for the lock, and runs with the new weights.
- **Two saves in a row**: two jobs, both run serially; the final state has the last value.
- **Invalid stored setting** (schema evolved): `resolvePlatformSettingValue` returns defaults (F03 rule); the job does not break.
- **Timeout of 120 s**: logs `reliability.snapshots_failed { reason: 'TIMEOUT' }` and fails the job (pg-boss retries).
- **Job exhausts retries overnight**: `ensure-today` (05:00–12:00) re-enqueues; a persistent failure leaves the ranking `isStale` with the log `error` as the alert signal (`dlq-monitor` does not alert on a single failed job).
- **Machine down at 04:15**: `ensure-today` at 05:00 covers it (pg-boss does not run a missed schedule).
- **Day rolls over during the job**: `snapshotDate` is fixed at step 1 of the algorithm.
- **Restored inspector**: gains rows again from the next day, with no backfilled history.

## Requirements *(mandatory)*

### Functional Requirements

**Data model**

- **FR-001**: The system MUST persist an `InspectorReliabilitySnapshot` (one row per inspector per `snapshot_date`) with: `inspector_id`, `snapshot_date` (civil date), `window_days`, `window_from`, `window_to`, `status` (`SCORED`/`INSUFFICIENT_VOLUME`/`NO_WEIGHTED_DATA`), nullable `score` `Decimal(4,1)`, `volume`, `completed_count`, `metrics_json` (the eight `ReliabilityMetricResult`), `settings_json` (`{ weights, minimumVolume, minimumRatings, toleranceMinutes, volumeReference }`), `trigger`, `computed_at`, `created_at`, `updated_at`, with `@@unique([inspector_id, snapshot_date])` and `@@index([snapshot_date, score(sort: Desc)])`.
- **FR-002**: The migration MUST add DB CHECK constraints `score IS NULL OR (score >= 0 AND score <= 100)` and `(status = 'SCORED') = (score IS NOT NULL)`, and order **after** the TASK-F07-1 migration.
- **FR-003**: `InspectorReliabilitySnapshot` MUST have **no `tenant_id`** (documented exception to root `CLAUDE.md` §7.1 / backend §5.6 — see Assumptions); the row stores no agency name, address, or coordinate.

**Compute job**

- **FR-004**: `ComputeReliabilitySnapshotsUseCase.execute({ trigger, now? })` MUST fix `snapshotDate = civilDateInTz(now, PLATFORM_TIMEZONE)` and `{ from, to } = snapshotWindow(snapshotDate)` (`[snapshotDate−30, snapshotDate−1]`), then run inside one interactive `$transaction` (`timeout 120_000`, `maxWait 10_000`).
- **FR-005**: Inside the transaction, in order, the system MUST: (a) `SELECT pg_advisory_xact_lock(hashtext('reliability.compute-snapshots'))`; (b) read `reliabilityIndex` and `fieldEvents` via `IPlatformSettingsReader.get`; (c) load non-deleted inspectors; (d) call `ReliabilityMetricsService.computeAllWith(tx, from, to, settings)` once; (e) build one row per inspector — inspectors present in `batch.byInspector` use their computed result; inspectors absent from it (no facts in the window) get a synthesized result with `volume 0`, `completedCount 0`, eight metrics each `rate null` except `VOLUME` with `rate 0` (using the shared `batch.volumeReference`), which `computeReliabilityScore` resolves to `status INSUFFICIENT_VOLUME`, `score null` — with `settings_json.volumeReference = batch.volumeReference`; (f) `deleteMany({ where: { snapshot_date } })` then `createMany(rows)`; (g) only for `trigger 'SCHEDULED'`, purge (FR-016).
- **FR-006**: The volume reference (median) MUST be computed once per run (`batch.volumeReference`) and be identical across all rows of that day.
- **FR-007**: The job MUST be idempotent — re-running for the same `snapshotDate` replaces that day's rows and never changes the count; the result depends only on `snapshotDate`, the data, and the settings.
- **FR-008**: The job MUST serialize across instances via the transaction advisory lock (not pg-boss `singletonKey`, which silently drops a job while another with the same key is active).
- **FR-009**: On success the use case MUST return `{ snapshotDate, inspectors, scored, insufficient, durationMs }` and log `reliability.snapshots_computed { snapshotDate, trigger, inspectors, scored, insufficient, durationMs }` (no names, no coordinates); on any error it MUST log `reliability.snapshots_failed { snapshotDate, trigger, reason, attempt }` at `error` and rethrow.

**Recompute on settings change (03.A1)**

- **FR-010**: A subscriber to `PLATFORM_SETTING_EVENTS.UPDATED` (`'platform_setting.updated.v1'`, emitted by the unchanged F03 use case) MUST, only when `payload.key === 'reliabilityIndex'`, enqueue `reliability.compute-snapshots` `{ trigger: 'SETTINGS_CHANGED' }` with `startAfter = occurredAt + SETTINGS_RECOMPUTE_DELAY_SECONDS (35)`, `retryLimit: 3`, `retryBackoff: true`, `expireInMinutes: 15`, and **no** `singletonKey`.
- **FR-011**: The subscriber MUST ignore every other key and MUST NOT throw on an enqueue failure (log `error` only). This task MUST NOT edit `update-platform-setting.use-case.ts` nor declare `PLATFORM_SETTING_EVENTS` (import only).

**Backfill & hourly reinforcement**

- **FR-012**: `EnsureTodaySnapshotUseCase.execute()` MUST return `'ENQUEUED_MISSING' | 'ENQUEUED_OVERDUE' | 'PENDING' | 'UP_TO_DATE'`: with no row for today → enqueue `BACKFILL`; with a row and `settingsUpdatedAt > computedAt + RECOMPUTE_OVERDUE_MINUTES (15)` → log `reliability.recompute_overdue` and enqueue `SETTINGS_CHANGED`; within 15 min → `PENDING`; up to date → `UP_TO_DATE`.
- **FR-013**: On boot, after worker registration, the system MUST run `EnsureTodaySnapshotUseCase.execute()` (deploy backfill). There MUST be no backfill of past dates.
- **FR-014**: The system MUST register two Sydney-tz pg-boss schedules: `reliability.compute-snapshots` at `'15 4 * * *'` (worker `teamSize 1, teamConcurrency 1`, running the use case with `trigger = job.data.trigger ?? 'SCHEDULED'`) and `reliability.ensure-today` at `'0 5-12 * * *'` (no `singletonKey`), both added to the workers log list and both worker test sites.
- **FR-015**: The compute worker MUST wrap the use case in try/catch, log `reliability.snapshots_failed { …, attempt: job.retryCount + 1 }`, and rethrow so pg-boss applies the global retry.

**Retention**

- **FR-016**: On a `SCHEDULED` run, in the same transaction after `createMany`, the system MUST delete rows with `snapshot_date < snapshotDate − RELIABILITY_SNAPSHOT_RETENTION_DAYS (400)` and all rows of inspectors with a non-null `deleted_at`, logging `reliability.snapshots_purged { count, deletedInspectors }`; `SETTINGS_CHANGED`/`BACKFILL` runs MUST NOT purge.

**API**

- **FR-017**: `GET /v1/dashboard/inspector-performance` (AM/OP) MUST return `success(ReliabilityRankingResponse)` built from the latest `snapshot_date`: `ranked` (competition ranking across all `ACTIVE` + `SCORED` rows, ties by name), `notEnoughData` (`INSUFFICIENT_VOLUME`/`NO_WEIGHTED_DATA`, volume desc then name), plus `snapshotDate`, `windowFrom`, `windowTo`, `computedAt`, `isStale`, `settingsUpdatedAt`, `minimumVolume`, `volumeReference`, `volumeReferenceSource`.
- **FR-018**: `GET /v1/dashboard/inspector-performance/:inspectorId` (AM/OP) MUST return `success(InspectorReliabilityResponse)`: the inspector's row from the latest snapshot with the eight metrics (canonical order, each extended with its `weight` from `settings_json`), stored `score`/`status`/`position`/`rankedCount`, `volume`/`completedCount`, `minimumVolume`/`minimumRatings`, `volumeReference`/`volumeReferenceSource`, plus `isStale`/`settingsUpdatedAt`; a missing row → `status 'NOT_COMPUTED'`, `metrics []`. `404 INSPECTOR_NOT_FOUND` for unknown/deleted, `400 VALIDATION_ERROR` for a non-uuid.
- **FR-019**: Both routes MUST authorize only `AM`/`OP` (role-matrix action `reliability.view`), returning `403 FORBIDDEN` (with `authorization.denied` audit) before any repository read for `CL_ADMIN`/`CL_USER`/`INSP`, and `401` without a token.
- **FR-020**: `isStale` MUST be `snapshotDate !== null && snapshotDate < civilDateInTz(now, PLATFORM_TIMEZONE)`; `settingsUpdatedAt` MUST be the `platform_settings.updated_at` of key `reliabilityIndex` (or `null`), read in a single query.
- **FR-021**: The response schemas MUST be declared in shared (`reliabilityRankingResponseSchema`, `inspectorReliabilityResponseSchema`, `inspectorReliabilityParamsSchema`) with every returned field present (Fastify response serialization strips undeclared keys); `ReliabilityScoreStatus`'s `NOT_COMPUTED` is added only in the detail schema. `api-types.ts`/`openapi.json` MUST be regenerated in the same PR.

**Exported reader (F08)**

- **FR-022**: The module MUST export `ReliabilityIndexReader.getCurrentIndexes(inspectorIds?)` whose `position` is always the platform-wide competition ranking (all `ACTIVE` + `SCORED` of the latest snapshot); a subset filter narrows only the output. A below-volume inspector → `position null`, `status 'INSUFFICIENT_VOLUME'`; a missing row → `status 'NOT_COMPUTED'`, `snapshotDate` = latest date.

**Privacy / explainability**

- **FR-023**: No API response, log, or snapshot column may contain the inspector's raw latitude/longitude or any coordinate (root `CLAUDE.md` §7.9). Each metric's `failures` is capped at `RELIABILITY_FAILURES_MAX (20)` with `failureCount` as the true total; every `detail` is ≤ 80 chars with no address/coordinate/agency name.

### Key Entities *(include if feature involves data)*

- **InspectorReliabilitySnapshot**: an immutable-per-day record of one inspector's computed reliability over a 30-day civil window. Carries the frozen `metrics_json` (eight metric results) and `settings_json` (the weights/thresholds/volume reference used), the `score`/`status`, and the `trigger` that produced it. Related to `Inspector` by `inspector_id` (FK, no cascade). **No `tenant_id`** — the inspector is cross-tenant and the snapshot aggregates services across agencies. Retained 400 days.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the seeded worked example, the ranking returns exactly `[Eva 100, Fábio 97.5, Dan 89.0, Ana 88.3, Ben 79.0]` and `notEnoughData [Carla 9]`, and all per-day rows share `volumeReference 9.5`.
- **SC-002 (03.A1)**: Saving `reliabilityIndex` with `PUNCTUALITY: 3` changes Ana's stored score from `88.3` to `87.3` after the triggered job, and the `platform_setting.updated` audit records the author and date — proving the index follows the configured weights and is recomputed on change.
- **SC-003**: Running the job three times for one day leaves exactly `inspector_count` rows for that `snapshot_date` (idempotent); the concurrency test fails if the advisory lock is removed (serialized).
- **SC-004**: With 200 inspectors × 30 services, the job completes in under 15 s in the test container and issues a fixed number of queries (equal to one inspector's plus two), independent of inspector count.
- **SC-005**: Only AM/OP receive data; CL_ADMIN/CL_USER/INSP receive `403` with no repository read, and no serialized response (ranking or detail) contains a coordinate, email, or phone key at any depth, nor more than 20 failures per metric.
- **SC-006**: A failed daily job is observable and self-healing — the API reports `isStale true`, a `reliability.snapshots_failed` error is logged, and `reliability.ensure-today` re-enqueues; once healthy, `isStale` returns to `false`.
- **SC-007**: After a `SCHEDULED` run, rows older than 400 days and all rows of soft-deleted inspectors are gone, and `reliability.snapshots_purged` is logged.

## Assumptions

- **Multi-tenant exception (D9, explicit).** `InspectorReliabilitySnapshot` has **no `tenant_id`** — the inspector is a cross-tenant subject (precedents: `Inspector`, global `ServiceRegion`, `DayPlan`, `PlatformSetting`, F07-1's facts reader). Isolation is guaranteed by (a) the `reliability.view` role check (AM/OP only) before any read — CL_ADMIN/CL_USER/INSP/TNT get 403; (b) no agency route reads the table; (c) the row stores no agency name, address, or coordinate. The scoping is proven by the RBAC tests (US1 scenario 3, US2 scenario 6) and the DB integration test.
- **All product decisions for F07-2 are closed** (plan 2026-10-27; dev 2026-10-28; lacunas and reconciliation 2026-10-29). No open clarification is assumed; there are no `Q2/Q4/Q6/Q12`-style pending premises in this task's scope.
- **F07-1 is merged and relied upon** for the compute engine, the eight metric keys, the `reliabilityIndex` platform-settings key, the `INSPECTOR_NO_SHOW`/`NOT_EXECUTED` rejection codes, and the `inspection_executions(finished_at)` index. This task only persists and serves the computation; it does not change the metric math.
- **The F03 `UpdatePlatformSettingUseCase` already emits `platform_setting.updated.v1`** (R1). F07-2 only subscribes and imports the constant; it never edits the F03 use case nor adds the event or its emission test.
- **`instantStr`/`instantStrNullable` are already exported** from `packages/shared/src/schemas/responses.ts` (F05-1), so this task imports them for the reliability schemas rather than changing their visibility (the task-file step 8 is already satisfied).
- **`position` is platform-wide** (R2): the competition ranking spans all `ACTIVE` + `SCORED` rows of the snapshot, never partitioned by region, service type, or agency — in the routes and in `getCurrentIndexes`.
- **Timezones (R3):** `snapshot_date`, the snapshot window, "today" for `isStale`/purge, and both crons run on `PLATFORM_TIMEZONE` (`Australia/Sydney`); `computed_at`/`settingsUpdatedAt` are UTC instants. Timezone-dependent tests pin `TZ` away from Sydney.
- **Cache-delay rationale:** the 35 s recompute delay (`SETTINGS_RECOMPUTE_DELAY_SECONDS`) covers the F03 `PlatformSettingsService` 30 s per-instance cache TTL plus a 5 s margin, so a worker on another machine reads the new weights; it is kept beside the TTL with a comment so they move together.
- **Out of scope** (TASK-F07-3 / F08): any UI, the INSP endpoint (`GET /v1/inspector/program`), levels (Bronze/Silver/Gold), historical charts/exports, a PERFORMANCE-report column, backfill of past dates, recompute on saving `fieldEvents`, and a job kill switch.
