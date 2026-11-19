# Phase 1 Data Model: Reliability Index Metrics (TASK-F07-1)

No new persisted table. One expand-only index. The "entities" below are mostly in-memory domain types plus one shared setting and one enum extension.

## Persistence changes

### `InspectionExecution` — new index (expand-only)

```prisma
model InspectionExecution {
  // ... existing fields ...
  @@index([finished_at])   // NEW — drives Q1a of the reliability facts reader
}
```

Migration `migrations/<ts>_inspection_executions_finished_at_idx/migration.sql`:

```sql
CREATE INDEX "inspection_executions_finished_at_idx" ON "inspection_executions" ("finished_at");
```

- Ordered **after** the F03 and F04 migrations. Pure expand. No `audit_logs` index added. The generated diff must be reviewed so Prisma does not drop any `Unsupported()` (PostGIS) index.

## Shared — `reliabilityIndex` platform setting

Cross-tenant (`PlatformSetting`, **no `tenant_id`**).

| Field | Type | Range / rule | Default |
|---|---|---|---|
| `weights.PUNCTUALITY…DONE_REJECTED` | integer (×8) | 0–10 each; refine: at least one > 0 | 1 each |
| `minimumVolume` | integer | 1–200 | 10 |
| `volumeReferenceOverride` | integer \| null | 1–1000 or null (null = median, P11) | null |
| `minimumRatings` | integer | 1–50 (L-F07-03) | 3 |

`resolvePlatformSettingValue('reliabilityIndex', null)` returns the defaults. No stored value predates this key, so no data migration.

## Shared — `RejectionReasonCode` extension

| Code | Label | Allowed from | Actors | Penalises |
|---|---|---|---|---|
| `INSPECTOR_NO_SHOW` (NEW) | "Inspector didn't attend" | `SCHEDULED` only | OP, AM (not SYS, not CL) | metrics 1 (`PUNCTUALITY`) + 6 (`CANT_ATTEND`) |
| `NOT_EXECUTED` (NEW) | "Inspection was not actually carried out" | `DONE` only | AM | metric 8 (`DONE_REJECTED`) only |

- `REJECTION_CODES_BY_ORIGIN` + `allowedRejectionCodesFrom(fromStatus): RejectionReasonCode[]` — existing codes keep current origins; `SYSTEM_ONLY_REJECTION_CODES` (F03) respected.
- `reason-codes.test.ts` total count = previous + 2 (with F03 = 11).

## Shared — `ReliabilityMetricKey` & constants

- `RELIABILITY_METRIC_KEYS` (exact order): `PUNCTUALITY, GEOFENCE, NO_STUCK, SATISFACTION, LATE_NOTICE, CANT_ATTEND, VOLUME, DONE_REJECTED`.
- `RELIABILITY_METRIC_LABELS`, `RELIABILITY_METRIC_DESCRIPTIONS` (English, all 8).
- `ReliabilityScoreStatus`: `SCORED`, `INSUFFICIENT_VOLUME`, `NO_WEIGHTED_DATA` (`NOT_COMPUTED` is F07-2).
- `RELIABILITY_WINDOW_DAYS = 30`, `RELIABILITY_TRAVEL_FACTOR = 1`, `CANT_ATTEND_EARLY_NOTICE_HOURS = 24`, `RELIABILITY_FAILURES_MAX = 20`.

## Shared — `reliabilityMetricResultSchema`

```ts
{
  metric: ReliabilityMetricKey,
  rate: number(0..1) | null,            // 4 decimals; higher = better; null = no eligible / below min
  eligibleCount: int >= 0,              // denominator without weight (VOLUME: completedCount)
  successCount: int >= 0 | null,        // null only for SATISFACTION
  averageRating: number | null,         // SATISFACTION only (raw 1–5 mean)
  volumeReference: number > 0 | null,   // VOLUME only (median or override, >= 1)
  weightedSuccess: number >= 0,         // minutes
  weightedEligible: number >= 0,        // minutes
  volume: int >= 0,                     // size of the inspector's universe (excl. lateRejection facts)
  activeDays: int >= 0 | null,          // VOLUME only (L-F07-05)
  failureCount: int >= 0,               // total failures before the cap
  failures: Array<{ appointmentId: uuid, serviceDate: civilDate, detail: string<=80 }> (max 20)
}
```

## Domain (in-memory) types

### `ServiceFact`

One service occurrence for one inspector. Built by `build-service-facts` from the reader's raw rows (dedupe + annotate). Key fields:

- `inspectorId`, `appointmentId`, `tenantId`, `serviceDate` (agency-tz civil date)
- `kind`: `EXECUTED | DONE_WITHOUT_EXECUTION | CANT_ATTEND | NO_SHOW_REJECTED`
- `origin`: `CURRENT_DONE | REJECTED_DONE | CANT_ATTEND | NO_SHOW_REJECTED`
- `doneRejected: boolean`, `lateRejection: boolean`
- `durationMinutes: number`, `plannedTravelMinutes: number` (from the same inspector's plan stop, else type default / 0)
- slot: `windowStartAt`, `windowEndAt` (UTC instants built from agency-tz wall time)
- timing: `startedAt?`, `startClientAt?`, `finishedAt?`, `resumedAt?`, `outOfWindow`, `publishedEtaAt?`, `publishedServiceStartAt?`
- geofence: `outOfRadius`, `finishOutOfRadius`, `geolocationDistanceMeters?`, `finishGeolocationDistanceMeters?`, `startAccuracyM?`, `finishAccuracyM?`, `geofenceRadiusM?` **(never any lat/lng)**
- satisfaction: `rating?`
- notices: `lateNotices: Array<{ effectiveNoticeAt }>`, `cantAttendNoticeAt?`
- `inspectorCreatedOn` (Sydney civil date)

Builder dedupe rules (per task test 10): a `CANT_ATTEND` is dropped when the same inspector has a DONE occurrence or `NO_SHOW_REJECTED` on the same appointment; a DONE with an execution of a **different** inspector → `DONE_WITHOUT_EXECUTION`; a reopened-and-still-open execution → no fact; `lateRejection` = (service date outside `[from,to]`).

### `ServiceFactsReader` port (`IReliabilityFactsReader`)

```ts
interface IReliabilityFactsReader {
  load(args: { from: CivilDate; to: CivilDate; inspectorIds?: string[] }): Promise<ServiceFactRow[]>;
  loadCompletedCounts(args: { from: CivilDate; to: CivilDate }): Promise<Map<string, number>>;
  // tx-scoped variants for the F07-2 job (computeAllWith)
}
```

### `InspectorReliabilityComputation` / `ReliabilityComputationBatch`

See `contracts/reliability-metrics.contract.md` — the engine's exported output types for F07-2 and F08.
