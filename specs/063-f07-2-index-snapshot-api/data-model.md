# Phase 1 Data Model: Reliability Snapshot

## New entity: `InspectorReliabilitySnapshot` (table `inspector_reliability_snapshots`)

One immutable-per-day record of one inspector's computed reliability over a 30-day civil window. **No `tenant_id`** (documented exception to Constitution §II / root `CLAUDE.md` §7.1 — the Inspector is cross-tenant; see plan Complexity Tracking).

| Field | Type (Prisma / DB) | Notes |
|---|---|---|
| `id` | `String @id @default(uuid())` | |
| `inspector_id` | `String` | FK → `Inspector.id` (no cascade; inspectors are soft-deleted) |
| `snapshot_date` | `DateTime @db.Date` | civil date (Sydney) of the compute |
| `window_days` | `Int @default(30)` | `RELIABILITY_WINDOW_DAYS` |
| `window_from` | `DateTime @db.Date` | `snapshot_date − 30` |
| `window_to` | `DateTime @db.Date` | `snapshot_date − 1` |
| `status` | `String @db.VarChar(30)` | `SCORED` \| `INSUFFICIENT_VOLUME` \| `NO_WEIGHTED_DATA` |
| `score` | `Decimal? @db.Decimal(4, 1)` | 0.0–100.0; `NULL` when `status ≠ SCORED` |
| `volume` | `Int` | `|U|` — the service universe size |
| `completed_count` | `Int` | completed DONE count in the window |
| `metrics_json` | `Json` | `ReliabilityMetricResult[8]` (shared shape, canonical order, incl. `failures`/`failureCount`) |
| `settings_json` | `Json` | `{ weights, minimumVolume, minimumRatings, toleranceMinutes, volumeReference: { value, source, activeInspectors, periodDays } }` — the day's median, identical across all rows of the day |
| `trigger` | `String @db.VarChar(30)` | `SCHEDULED` \| `SETTINGS_CHANGED` \| `BACKFILL` |
| `computed_at` | `DateTime` | UTC instant of the compute |
| `created_at` | `DateTime @default(now())` | |
| `updated_at` | `DateTime @updatedAt` | |

### Prisma model

```prisma
model InspectorReliabilitySnapshot {
  id              String   @id @default(uuid())
  inspector_id    String
  snapshot_date   DateTime @db.Date
  window_days     Int      @default(30)
  window_from     DateTime @db.Date
  window_to       DateTime @db.Date
  status          String   @db.VarChar(30)
  score           Decimal? @db.Decimal(4, 1)
  volume          Int
  completed_count Int
  metrics_json    Json
  settings_json   Json
  trigger         String   @db.VarChar(30)
  computed_at     DateTime
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  inspector Inspector @relation(fields: [inspector_id], references: [id])

  @@unique([inspector_id, snapshot_date])
  @@index([snapshot_date, score(sort: Desc)])
  @@map("inspector_reliability_snapshots")
}
```

- Add `reliability_snapshots InspectorReliabilitySnapshot[]` to `model Inspector`.

### Migration (expand-only, ordered after the F07-1 migration)

- `CREATE TABLE "inspector_reliability_snapshots"` with the columns above.
- `@@unique([inspector_id, snapshot_date])` → unique index; `@@index([snapshot_date, score(sort: Desc)])` → the ranking index.
- FK `inspector_id` → `inspectors(id)` (no cascade).
- Extra raw CHECKs (not expressible in Prisma schema):
  - `CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100))`
  - `CHECK (("status" = 'SCORED') = ("score" IS NOT NULL))`
- `Prisma.Decimal` → `number` conversion happens in the repository (score read-back).

## Lifecycle & invariants

- **Write**: produced only by `ComputeReliabilitySnapshotsUseCase` inside the advisory-locked transaction. The day's rows are replaced atomically (`deleteMany({ snapshot_date })` + `createMany`). Never updated in place after the day's write (next day is a new `snapshot_date`; a same-day recompute replaces).
- **Uniqueness**: exactly one row per `(inspector_id, snapshot_date)`.
- **Volume reference**: `settings_json.volumeReference.value` is the per-day median (or override), identical across all rows of one `snapshot_date`.
- **Status ↔ score**: enforced by the DB CHECK — `score` is non-null iff `status = 'SCORED'`.
- **Retention**: rows with `snapshot_date < today − 400` and all rows of soft-deleted inspectors are purged on each `SCHEDULED` run (same transaction).
- **No coordinates**: no column stores lat/lng; `metrics_json.failures[].detail` is ≤ 80 chars with no address/coordinate/agency name (enforced by F07-1's `metric-failures.ts`, re-checked by the DB privacy test).

## Derived (not stored) fields in the API

- `isStale` — computed per request (`snapshotDate < today`), never stored.
- `settingsUpdatedAt` — read from `platform_settings.updated_at` of key `reliabilityIndex`.
- `position` / `rankedCount` — computed from the latest snapshot's `SCORED` + `ACTIVE` rows (`ranking.ts`), platform-wide (R2).
- `NOT_COMPUTED` (detail only) — API-level status when the inspector has no row in the latest snapshot; not a stored `status` value.
