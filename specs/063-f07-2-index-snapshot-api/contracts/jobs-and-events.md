# Contract: Jobs, Event Subscription & Exported Reader

## Job: `reliability.compute-snapshots`

- **Payload**: `{ trigger: 'SCHEDULED' | 'SETTINGS_CHANGED' | 'BACKFILL' }`.
- **Schedule**: `boss.schedule('reliability.compute-snapshots', '15 4 * * *', {}, SYDNEY_TZ)` (04:15 Sydney — outside the DST skip 02:00–03:00, after `audit.retention` 03:30 and `day-plan.purge-route-data`-era 03:45).
- **Worker**: `boss.work('reliability.compute-snapshots', { teamSize: 1, teamConcurrency: 1 }, withJobMetrics('reliability.compute-snapshots', async (job) => computeReliabilitySnapshotsUseCase.execute({ trigger: job.data.trigger ?? 'SCHEDULED' })))`.
- **Handler failure (L-F07-02)**: wrap in try/catch → `logger.error('reliability.snapshots_failed', { snapshotDate, trigger, reason, attempt: job.retryCount + 1 })` → rethrow (pg-boss global retry: `retryLimit 6`, `retryBackoff`). A timeout logs `reason 'TIMEOUT'`.
- **Use case**: `ComputeReliabilitySnapshotsUseCase.execute({ trigger, now? })` →
  `{ snapshotDate, inspectors, scored, insufficient, durationMs }`; logs `reliability.snapshots_computed { snapshotDate, trigger, inspectors, scored, insufficient, durationMs }` and, when a `SCHEDULED` run purged, `reliability.snapshots_purged { count, deletedInspectors }` (no names, no coordinates).

## Job: `reliability.ensure-today`

- **Payload**: none.
- **Schedule**: `boss.schedule('reliability.ensure-today', '0 5-12 * * *', {}, SYDNEY_TZ)`, **no** `singletonKey`.
- **Worker**: `boss.work('reliability.ensure-today', withJobMetrics('reliability.ensure-today', () => ensureTodaySnapshotUseCase.execute()))`.
- **Boot backfill**: after worker registration, `await ensureTodaySnapshotUseCase.execute()` once.
- **Use case**: `EnsureTodaySnapshotUseCase.execute()` → `'ENQUEUED_MISSING' | 'ENQUEUED_OVERDUE' | 'PENDING' | 'UP_TO_DATE'`:
  - no row for today → `jobQueue.enqueue('reliability.compute-snapshots', { trigger: 'BACKFILL' })` → `'ENQUEUED_MISSING'`;
  - row exists, `settingsUpdatedAt > computedAt + RECOMPUTE_OVERDUE_MINUTES (15)` → `logger.error('reliability.recompute_overdue', { settingsUpdatedAt, computedAt })` + enqueue `{ trigger: 'SETTINGS_CHANGED' }` → `'ENQUEUED_OVERDUE'`;
  - row exists, within 15 min of a settings change → `'PENDING'`;
  - up to date → `'UP_TO_DATE'`.

Both queues are added to the final queue-list log in `workers.ts` and to both worker test sites (`tests/unit/workers.test.ts` counts + `src/main/__tests__/workers.test.ts` `EXPECTED_SCHEDULES`).

## Event subscription (consumed from F03, R1)

- **Event**: `PLATFORM_SETTING_EVENTS.UPDATED = 'platform_setting.updated.v1'`, payload `{ key: PlatformSettingKey; before: unknown; after: unknown; actorId: string; occurredAt: string }` (emitted by the **unchanged** F03 `UpdatePlatformSettingUseCase` with `Promise.allSettled`).
- **Subscriber**: `RecomputeReliabilityOnSettingsChangeSubscriber.handle(event)` registered in the container via `domainEventBus.subscribe(PLATFORM_SETTING_EVENTS.UPDATED, …)`.
  - `payload.key === 'reliabilityIndex'` → `jobQueue.enqueue('reliability.compute-snapshots', { trigger: 'SETTINGS_CHANGED' }, { startAfter: new Date(occurredAt + SETTINGS_RECOMPUTE_DELAY_SECONDS*1000), retryLimit: 3, retryBackoff: true, expireInMinutes: 15 })` — **no `singletonKey`**.
  - any other key → nothing.
  - enqueue throws → `logger.error` and return (do not rethrow; the save already committed and the daily/hourly job corrects it).
- **Constant**: `SETTINGS_RECOMPUTE_DELAY_SECONDS = 35` (30 s settings-cache TTL + 5 s margin), kept beside a comment tying it to the F03 TTL. This task imports `PLATFORM_SETTING_EVENTS`; it never declares it or edits the F03 use case.

## Exported reader (for F08)

- `ReliabilityIndexReader.getCurrentIndexes(inspectorIds?)` → one entry per requested (or all, when unfiltered) inspector: `{ inspectorId: string; score: number | null; status: 'SCORED' | 'INSUFFICIENT_VOLUME' | 'NO_WEIGHTED_DATA' | 'NOT_COMPUTED'; position: number | null; volume: number; snapshotDate: string | null }` where:
  - `position` is the **platform-wide** competition ranking (all `ACTIVE` + `SCORED` rows of the latest snapshot), regardless of the `inspectorIds` filter (the filter narrows only the output) — R2;
  - below-volume → `position null`, `status 'INSUFFICIENT_VOLUME'`;
  - no row → `status 'NOT_COMPUTED'`, `snapshotDate` = latest date;
  - `snapshotDate` may be earlier than today (documented for F08; no `getUncached`).
- Exposed as `container.reliability.indexReader`.
