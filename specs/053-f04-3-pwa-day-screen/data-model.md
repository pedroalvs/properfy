# Phase 1 Data Model: F04-3 (consumed, not created)

This feature creates **no** database entity and **no** new API schema. It consumes the F04-2 contract. The shapes below are the authoritative source (`packages/shared/src/schemas/day-plan.ts`, surfaced in `api-types.ts`) and the client-side view types this task introduces.

## Consumed server entities

### DayPlanResponse (`dayPlanResponseSchema`)

| Field | Type | Notes |
|---|---|---|
| `id`, `inspectorId`, `inspectorName` | string | plan identity |
| `date` | `YYYY-MM-DD` | civil date in `timezone` |
| `timezone` | IANA | plan tz (header/greeting/finish) |
| `status` | `PUBLISHED` \| `STALE` \| … | STALE → one refetch/version |
| `version` | number | optimistic-concurrency + STALE key |
| `publishedAt`, `computedAt` | UTC ISO \| null | |
| `origin` | `{ source: 'BASE'\|'OVERRIDE'\|'LAST_STOP'\|'NONE', label, lat, lng }` | drives OriginRow |
| `originWarning` | `'NO_BASE'\|'BASE_NOT_LOCATED'` \| null | drives RouteWarnings |
| `originOverride` | `{ address } ` \| null | per-day base |
| `departureAt`, `finishEta` | UTC ISO \| null | |
| `totals` | `{ driveS, waitS, serviceS, lateS, distanceM }` | RouteSummary |
| `feasible`, `violations` | bool, `[{appointmentId,lateS}]` | violation notes |
| `approximate`, `approximateReason` | bool, code\|null | Approximate banner |
| `suggestedOrder` | `string[]` | (used by F04-4) |
| `stops` | `DayPlanStop[]` | ordered by `sequence` |
| `geometry` | FeatureCollection \| null | (map is F04-4) |
| `routingInput` | `{ points, travelS, legTravelS, … }` \| null | (local reorder is F04-4) |

No `tenant_id` — platform-scoped, per-inspector; read-only in the PWA.

### DayPlanStop (`dayPlanStopSchema`)

`appointmentId`, `sequence`, `appointmentCode`, `agencyName`, `appointmentStatus` (`SCHEDULED`/`DONE`/…), `executionStatus` (`NOT_STARTED`/`IN_PROGRESS`/…), `executed` (bool), `eta`/`serviceStartAt`/`serviceEndAt` (UTC ISO), `travelS`/`distanceM`/`waitS`/`lateS` (number), `windowStart`/`windowEnd` (`HH:mm`), `windowStartAt`/`windowEndAt` (UTC ISO), `timezone` (IANA, per-stop), `durationMinutes`, `manual`, `approximate`, `missingCoordinates`, `lat`/`lng`, `propertyAddress`, `suburb`, `serviceTypeName`, `keyRequired`, `meetingLocation`, `rentalTenantConfirmationStatus`, `primaryContact { name, phone, role }`.

`primaryContact.role` ∈ `RENTAL_TENANT`, `RENTAL_TENANT_REPRESENTATIVE`, `HOUSEKEEPER`, `PROPERTY_MANAGER`, `BROKER`, `OTHER`.

### InspectorBaseAddress (`setDayPlanOriginRequestSchema` body `{ address }`)

Structured AU address: `street`, `number`, `unit?`, `suburb`, `state` (NSW/VIC/QLD/WA/SA/TAS/ACT/NT), `postcode` (4 digits), `city = suburb`, `country 'AU'`. No lat/lng (server geocodes). Identical to the F01 profile shape.

## Client-side view types (new, this task)

### DayPlanView (from `lib/day-plan-view.ts`)

Pure selectors over `DayPlanResponse`:
- `progress(plan) → { done, total }` (done = stops with `appointmentStatus 'DONE'`).
- `nextStop(plan) → DayPlanStop | null` (first `executed:false`, `IN_PROGRESS` preferred; live-derived, DB11).
- `comingUp(plan) → DayPlanStop[]` (up to 3 non-executed after next).
- `allDone(plan) → boolean`, `isEmpty(plan) → boolean`.
- `stopsInOrder(plan) → DayPlanStop[]` (sorted by `sequence`).

### ExecutionActionTarget (adapter for `AppointmentActionBar`)

`{ id, status, executionStatus, scheduledDate, appointmentCode, propertyAddress }`; built by `stopToActionTarget(stop, plan.date)`.

### DayPlanQueryState (from `useDayPlan`)

`{ data?: DayPlanResponse, state: 'OK'|'NOT_PUBLISHED'|'NOT_FOUND'|'STALE'|'ERROR', isOffline: boolean, isLoading, refetch }`.

## State transitions (UI, derived from server state)

```
GET :date
 ├─ 200 PUBLISHED ──────────────→ render plan
 ├─ 200 STALE ──(once/version, +2s)→ refetch ──→ PUBLISHED | STALE(hold "Updating…")
 ├─ 404 NOT_PUBLISHED ─(today impossible; tomorrow/past)→ "ready at 7:30 pm" | hidden card
 ├─ 404 NOT_FOUND ─────────────→ "No route for this day"
 ├─ 429 / 5xx ─────────────────→ ErrorState + Retry (no 4xx retry)
 └─ network + cache ───────────→ keep data, "Offline · showing your last saved route"

Origin: PUT/DELETE :date/origin → 200 replace plan (setQueryData)
        │ 422 NOT_FOUND/DATE_IN_PAST/ALREADY_STARTED, 503 GEOCODER, 404 NOT_PUBLISHED → role=alert
```
