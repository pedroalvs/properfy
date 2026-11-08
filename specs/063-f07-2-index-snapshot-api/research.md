# Phase 0 Research: Reliability Snapshot, Recompute & API

All product decisions for TASK-F07-2 are closed (plan 2026-10-27; dev 2026-10-28; lacunas + reconciliation 2026-10-29). No `NEEDS CLARIFICATION` remained after the spec. This file records the technical decisions and the existing-code facts they rely on.

## D1 — Serialize the compute with a transaction advisory lock, not `singletonKey`

- **Decision**: wrap the whole compute in `prisma.$transaction(async (tx) => { … }, { timeout: 120_000, maxWait: 10_000 })`; the first statement is `SELECT pg_advisory_xact_lock(hashtext('reliability.compute-snapshots'))`.
- **Rationale**: two Fly machines and the recompute-on-save path create genuine concurrency. `PgBossJobQueue.enqueue` returns a silent no-op (`console.warn` only) when a `singletonKey` collides with an **active** job (`pgboss-job-queue.ts:18-25`), so a weight save during the daily run would be dropped — breaking 03.A1. The advisory lock serializes without dropping; the last job (enqueued 35 s after the save) wins with the new weights. PgBouncer makes session-level locks unusable, so only `pg_advisory_xact_lock` inside an interactive `$transaction` works (precedent `provision-admin.ts:71`).
- **Alternatives rejected**: `singletonKey` (drops the recompute); session advisory lock (dies under PgBouncer); application mutex (not cross-instance).

## D2 — Read settings *after* the lock; delay the recompute 35 s

- **Decision**: read `reliabilityIndex` + `fieldEvents` via `IPlatformSettingsReader.get` **inside** the transaction, after acquiring the lock. The subscriber enqueues with `startAfter = occurredAt + SETTINGS_RECOMPUTE_DELAY_SECONDS (35)`.
- **Rationale**: `PlatformSettingsService.get` caches 30 s per instance; a worker on another machine could read stale weights. The 35 s delay (30 s TTL + 5 s margin) guarantees the new value is readable when the job runs. There is no `getUncached` (dev revision 2026-10-28). Reading after the lock also keeps the read-then-write ordering correct under contention.
- **Alternatives rejected**: `getUncached` (not built; adds a bypass); reading before the lock (could use a stale value and race a concurrent write).

## D3 — One pass via `ReliabilityMetricsService.computeAllWith`

- **Decision**: call `computeAllWith(tx, from, to, settings)` once per run. It returns `{ volumeReference, byInspector }`; the median is computed once and shared across all rows of the day. Score/status come from `computeReliabilityScore(metrics, settings.reliabilityIndex, volume)`.
- **Rationale**: F07-1 already loads the whole period in a fixed 7 `$queryRaw` statements regardless of inspector count and computes the median once; re-using it keeps the job O(services), not O(inspectors), and keeps the metric math in one place (DRY, D6/P11). Inspectors with no facts are not in `byInspector` and get a synthesized empty row (`volume 0`, `VOLUME rate 0`, same reference).
- **Alternatives rejected**: `computeMetric` per inspector (N× queries, re-derives the median wrong); re-implementing the math in F07-2 (duplication, drift).

## D4 — `snapshotWindow` / `snapshotDateFor` in `PLATFORM_TIMEZONE`

- **Decision**: pure domain helpers. `snapshotDateFor(now) = civilDateInTz(now, PLATFORM_TIMEZONE)`; `snapshotWindow(snapshotDate) = { from: snapshotDate − 30, to: snapshotDate − 1 }` (30 complete civil days up to yesterday, P8).
- **Rationale**: "today" is open, so excluding it makes any same-day recompute produce the same window (idempotence, P8). All snapshot civil dates and the crons run on `PLATFORM_TIMEZONE` (R3). Uses the existing `civilDateInTz`/`addCivilDays` helpers; TZ-dependent tests pin `TZ` away from Sydney.
- **Alternatives rejected**: browser/server tz (forbidden for business rules); including today (window drifts during the day).

## D5 — `isStale` and `settingsUpdatedAt` are derived in the use case

- **Decision**: `isStale = snapshotDate !== null && snapshotDate < civilDateInTz(now, PLATFORM_TIMEZONE)`. `settingsUpdatedAt = platform_settings.updated_at` of key `reliabilityIndex` (or `null`), read in one query.
- **Rationale**: a simple, explainable freshness rule (L-F07-02) that the screen turns into a banner only after 05:00 (TASK-F07-3). The overdue-recompute signal (L-F07-10) compares `settingsUpdatedAt` with the snapshot's `computed_at`.
- **Alternatives rejected**: storing `isStale` in the row (it depends on "now", not the row); a job-health table (over-engineering; the log + `isStale` suffice).

## D6 — Hourly `ensure-today` + boot backfill; log-only alerting

- **Decision**: `EnsureTodaySnapshotUseCase` enqueues a `BACKFILL` when today's row is missing, or a `SETTINGS_CHANGED` + `reliability.recompute_overdue` error log when `settingsUpdatedAt > computedAt + 15 min`. Scheduled hourly `0 5-12 * * *` (Sydney) and run once at boot. No change to the `dlq-monitor` threshold.
- **Rationale**: a daily job that exhausts retries leaves a single `failed` row — below the `dlq-monitor`'s ≥ 10 threshold — so the observable signal is the `error` log + `isStale` on the API, and the hourly job is the self-healing retry (L-F07-02). Boot backfill covers a fresh deploy (precedent: geocoding re-enqueue at startup in `workers.ts`).
- **Alternatives rejected**: lowering the `dlq-monitor` threshold (shared infra; would noise other queues); a dedicated alert table (out of scope).

## D7 — Retention in the same transaction, `SCHEDULED` only

- **Decision**: after `createMany`, on `trigger 'SCHEDULED'` only, `deleteMany({ where: { OR: [{ snapshot_date: { lt: snapshotDate − 400 } }, { inspector: { deleted_at: { not: null } } }] } })`; log `reliability.snapshots_purged`.
- **Rationale**: bounds growth (~80k rows ceiling) and removes deleted-inspector data (privacy) without a separate job; doing it only on the scheduled run avoids a settings recompute or backfill purging unexpectedly (L-F07-12). FK has no cascade (soft delete), so the explicit relation filter is needed.
- **Alternatives rejected**: a separate retention job (more surface; the daily run already holds the lock); cascade delete (inspectors are soft-deleted, never hard-deleted).

## D8 — AM/OP routes under `/v1/dashboard/`, RBAC before any read

- **Decision**: `GET /v1/dashboard/inspector-performance` and `/:inspectorId`, `preHandler: authenticate`, role gate `reliability.view` (`['AM','OP']`) via `AuthorizationService.assertRoles` **before** any repository call. Response/params schemas in shared; Fastify response schema enforces the privacy/shape contract.
- **Rationale**: mirrors the cross-tenant AM/OP dashboard precedent (`get-inspector-workload.use-case.ts` + `dashboard.routes.ts`, `WORKLOAD_ROLES = ['AM','OP']`). A blocked role audits `authorization.denied` and reads nothing (US1-3, US2-6). The validation-before-auth Fastify quirk (a CL token on a non-uuid `:inspectorId` → 400 not 403) is accepted and documented (no data leak).
- **Alternatives rejected**: a bespoke route prefix (inconsistent with the Dashboard menu group, X01); checking the role in the route handler after a read (leaks a read for a forbidden actor).

## D9 — Subscribe the F03 event; do not touch the F03 use case

- **Decision**: register `domainEventBus.subscribe(PLATFORM_SETTING_EVENTS.UPDATED, subscriber.handle)` in the container. The subscriber enqueues only for `payload.key === 'reliabilityIndex'` and never throws on an enqueue failure.
- **Rationale**: the F03 `UpdatePlatformSettingUseCase` already emits `platform_setting.updated.v1` after commit with `Promise.allSettled` (R1); the only write path for the weights is that generic `PUT`, and 03.A1 needs a recompute on save. Subscribing avoids polling or a duplicate weights route. This task imports the constant and never edits `update-platform-setting.use-case.ts` nor adds the emission test (that coverage is F03's).
- **Alternatives rejected**: a dedicated weights endpoint (duplicates F03); polling `platform_settings.updated_at` (wasteful; the `ensure-today` overdue check already covers a missed event).

## D10 — Schemas reuse already-exported shared helpers

- **Decision**: build `reliabilityRankingResponseSchema` / `inspectorReliabilityResponseSchema` / `inspectorReliabilityParamsSchema` in `packages/shared/src/schemas/reliability.ts`, importing `instantStr`/`civilDateSchema` and reusing F07-1's `reliabilityMetricResultSchema` (extended with `weight`). `ReliabilityScoreStatus`'s `NOT_COMPUTED` is added only in a detail-status schema (`reliabilityDetailStatusSchema`), not to the F07-1 enum.
- **Rationale**: `instantStr`/`instantStrNullable`/`civilDateStr`/`civilDateStrNullable` are already exported from `responses.ts` (F05-1), so the task-file step 8 is already satisfied — import, don't change visibility. Keeping `NOT_COMPUTED` out of the shared enum respects F07-1's statement that the three-value enum is the compute output and `NOT_COMPUTED` is an API-only concept.
- **Alternatives rejected**: re-exporting private helpers (already public); widening the F07-1 enum (would leak an API-only state into the compute domain).

## Existing-code facts relied on (IMPLEMENTED REALITY)

- `ReliabilityMetricsService.computeAllWith(tx, from, to, { reliabilityIndex, toleranceMinutes })` → `{ volumeReference: { value, source, activeInspectors, periodDays }, byInspector: Map<id, { inspectorId, volume, completedCount, metrics[8] }> }` (`reliability-metrics.service.ts:106`).
- `computeReliabilityScore(metrics, reliabilityIndexSetting, volume)` → `{ status, score }` (`score.ts:31`).
- `IPlatformSettingsReader.get('reliabilityIndex'|'fieldEvents')` (`shared/domain/platform-settings.ts`); `reliabilityIndex` registry key with `weights`/`minimumVolume`/`volumeReferenceOverride`/`minimumRatings` (`schemas/platform-settings.ts:156`).
- F03 event `PLATFORM_SETTING_EVENTS.UPDATED = 'platform_setting.updated.v1'`, payload `{ key, before, after, actorId, occurredAt }` (`domain-event-bus.ts`), `Promise.allSettled` dispatch.
- `IJobQueue.enqueue(name, payload, options)` (`shared/domain/job-queue.ts`); silent no-op on active `singletonKey` collision (`pgboss-job-queue.ts:18`).
- `AuthorizationService.assertRoles(actor, roles, context)` → audits `authorization.denied`, throws `ForbiddenError('FORBIDDEN')` (`authorization.service.ts:32`); `ROLE_ACTION_MATRIX` (`role-matrix.ts:25`).
- Dashboard route precedent: `GET /v1/dashboard/inspector-workload` (`dashboard.routes.ts:113`), `WORKLOAD_ROLES = ['AM','OP']`.
- `workers.ts`: `SYDNEY_TZ`, `boss.schedule(name, cron, {}, SYDNEY_TZ)`, `withJobMetrics`, boot re-enqueue precedent, final queue-list log.
- `inspection_executions(finished_at)` index already added by F07-1 (migration `20261109000000`); **no new index needed here** beyond the snapshot table's own.
- `instantStr`/`instantStrNullable`/`civilDateStr`/`civilDateStrNullable` already exported from `responses.ts` (F05-1).
- `civilDateInTimezone` (`apps/backend/src/shared/domain/timezone-date.ts:144`); `PLATFORM_TIMEZONE` / `SYDNEY_TZ`.
