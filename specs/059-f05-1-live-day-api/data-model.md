# Phase 1 Data Model: Live Day Dashboard API (F05-1)

## Persistent changes

### `inspectors.alert_overrides_json` (NEW, expand-only)

| Field | Type | Null | Default | Semantics |
|---|---|---|---|---|
| `alert_overrides_json` | `Json?` (`JSONB`) | yes | – | `{ delayMinutes?: int 5–240, notStartedMinutes?: int 5–240 }`; only overridden keys; `NULL` = platform defaults for both |

- No index (read with the inspector row).
- **No `tenant_id`** (D14 exception — inspector is cross-tenant; see plan Complexity Tracking).
- Prisma: `alert_overrides_json Json?` on `model Inspector`, comment "F05 per-inspector Live Day alert overrides; null = platform defaults".
- Migration: `ALTER TABLE "inspectors" ADD COLUMN "alert_overrides_json" JSONB;` (expand; no backfill). Timestamp regenerated on rebase, ordered after X02/F01/F02/F03/F04.

### `PlatformSetting.liveDayAlerts` (NEW shared key — no DB row until first write)

```ts
const alertMinutes = z.number().int().min(5).max(240);
liveDayAlertsSettingSchema = z.object({ delayMinutes: alertMinutes, notStartedMinutes: alertMinutes });
DEFAULT_LIVE_DAY_ALERTS = { delayMinutes: 20, notStartedMinutes: 30 };   // onboarding
// PLATFORM_SETTINGS_REGISTRY:
liveDayAlerts: { schema: liveDayAlertsSettingSchema, defaults: DEFAULT_LIVE_DAY_ALERTS, section: 'Live Day alerts' }
```

## Read entities (response shapes — in `packages/shared/src/schemas/live-day.ts`)

### LiveDayResponse
`date`, `today` (actor server-side civil today), `timezone`, `isToday`, `generatedAt`, `thresholdsDefault {delayMinutes,notStartedMinutes}`, `summary {inspectors,notStarted,atProperty,inTransit,doneForDay,needsAttention,stopsDone,stopsTotal}`, `inspectors[]` (sorted by name, `localeCompare 'en-AU'`).

### LiveDayInspector
`inspectorId`, `inspectorName`, `state ∈ {NOT_STARTED,AT_PROPERTY,IN_TRANSIT,DONE_FOR_DAY}`, `lastKnown {source∈{CHECK_IN,CHECK_OUT,BASE,NONE},lat?,lng?,at?,appointmentId?,label?}`, `progress {done,inProgress,remaining,total}`, `delayMinutes?`, `thresholds {delayMinutes,delaySource,notStartedMinutes,notStartedSource}`, `alerts[]`, `needsAttention`, `dayPlanId?`, `planStatus ∈ {DRAFT,PUBLISHED,STALE,NONE}`, `planVersion?`, `routeOutOfDate`, `routeApproximate`, `routeFeasible`, `routeViolations[]`, `origin {lat,lng,label?}?`, `geometryIncluded`, `geometry?` (`dayPlanGeometrySchema`), `stops[]`.

### LiveDayStop
`appointmentId`, `appointmentCode`, `sequence?` (null = out of plan), `inPlan`, `progress ∈ {DONE,CURRENT,OPEN,REMAINING}`, `agencyName`, `propertyAddress`, `suburb`, `lat?`, `lng?`, `missingCoordinates`, `windowStart`/`windowEnd` (agency wall "HH:mm"), `timezone`, `startedAt?`, `finishedAt?`, `predictedStartAt?`, `publishedStartAt?`, `delayMinutes?`.

### LiveDayAlert (7 types)
`type ∈ {DELAY,NOT_STARTED,LATE_NOTICE,CANT_DO,GEOFENCE,OUT_OF_WINDOW,COMPLETION_REMINDER}`, `occurredAt`, `appointmentId?`, `appointmentCode?`, `minutes?`, `estimatedArrivalAt?`, `thresholdMinutes?`, `thresholdSource ∈ {PLATFORM,INSPECTOR}?`, `reason?`, `reasonLabel?`, `note?`, `phase ∈ {START,FINISH}?`, `distanceMeters?`, `radiusMeters?`.

### LockedTimeResponse
`from`, `to`, `generatedAt`, `overall {confirmed,required,percent?}`, `byAgency[] {tenantId,agencyName,confirmed,required,percent?}`, `byRegion[] {regionId?,regionName,agencyName?,confirmed,required,percent?}` (name order, "No region" last).

### InspectorAlertThresholds
`inspectorId`, `platformDefaults {delayMinutes,notStartedMinutes}`, `override {delayMinutes?,notStartedMinutes?}`, `effective {delayMinutes,notStartedMinutes}`.

## State derivation (D2 / §2)

Per visible, live stop classify via F04 `classifyStops` (D18): `DONE` or finished-not-abandoned → `FINISHED`; started-not-finished-not-abandoned → `IN_PROGRESS`; else `NOT_STARTED`. With `I`/`F`/`N` counts, first true wins: `I≥1 → AT_PROPERTY`; `N=0 → DONE_FOR_DAY`; `F=0 → NOT_STARTED`; else `IN_TRANSIT`.

## Derived flat row types (domain)

`ILiveDayReadRepository.getDay(date) → LiveDayRawRow[]` and `.getLockedTime(from,to) → LockedTimeRawRows`. Rows are flat (no Prisma types) so the pure functions (`derive-*`, `plan-freshness`, `filter-t1-visible`, `to-eta-inputs`) stay Prisma-free and testable.

## Audit

`inspector.alert_thresholds_updated`: `entityType 'Inspector'`, `entityId`, `tenantId null`, `actorType 'USER'`, `metadata { before, after }` (each `{delayMinutes,notStartedMinutes}` objects, `null` = default). Idempotent PUT (equal value) writes no audit.
