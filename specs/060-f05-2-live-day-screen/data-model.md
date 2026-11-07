# Phase 1 Data Model: Live Day screen (web)

This feature introduces **no persisted entity and no new wire contract**. It consumes the TASK-F05-1 shared types and defines only client-side view state. All consumed types come from `@properfy/shared` (`api-types` is already regenerated on `origin/develop`).

## Consumed wire types (from `@properfy/shared`)

### `LiveDayResponse` (`GET /v1/dashboard/live-day`)

| Field | Type | Notes |
|---|---|---|
| `date` | civil date `YYYY-MM-DD` | the requested/resolved day |
| `today` | civil date | server actor civil today (drives all "today" logic, L-F05-05) |
| `timezone` | string | actor timezone |
| `isToday` | boolean | server convenience; the web still computes `isLive = date >= today` |
| `generatedAt` | instant ISO | |
| `thresholdsDefault` | `{ delayMinutes, notStartedMinutes }` | platform defaults |
| `summary` | `{ inspectors, notStarted, atProperty, inTransit, doneForDay, needsAttention, stopsDone, stopsTotal }` | panel counters |
| `inspectors[]` | `LiveDayInspector[]` | server-sorted by name; web re-sorts by severity |

### `LiveDayInspector`

`inspectorId`, `inspectorName`, `state` (`LiveDayInspectorState`), `lastKnown { source (LiveDayLastKnownSource), lat|null, lng|null, at|null, appointmentId|null, label|null }`, `progress { done, inProgress, remaining, total }`, `delayMinutes|null`, `thresholds { delayMinutes, delaySource, notStartedMinutes, notStartedSource }`, `alerts: LiveDayAlert[]`, `needsAttention`, `dayPlanId|null`, `planStatus (DRAFT|PUBLISHED|STALE|NONE)`, `planVersion|null`, `routeOutOfDate`, `routeApproximate`, `routeFeasible`, `routeViolations[] ({ appointmentId, appointmentCode, sequence, lateMinutes })`, `origin ({ lat, lng, label|null }) | null`, `geometryIncluded`, `geometry: DayPlanGeometry | null`, `stops: LiveDayStop[]`.

### `LiveDayAlert`

`type (LiveDayAlertType)`, `occurredAt`, `appointmentId|null`, `appointmentCode|null`, `minutes|null`, `estimatedArrivalAt|null`, `thresholdMinutes|null`, `thresholdSource|null`, `reason|null`, `reasonLabel|null`, `note|null`, `phase (LiveDayGeofencePhase)|null`, `distanceMeters|null`, `radiusMeters|null`.

### `LiveDayStop`

`appointmentId`, `appointmentCode`, `sequence|null` (null ⇒ out-of-plan), `inPlan`, `progress (LiveDayStopProgress)`, `agencyName`, `propertyAddress`, `suburb`, `lat|null`, `lng|null`, `missingCoordinates`, `windowStart`/`windowEnd` ("HH:mm" agency wall time), `timezone`, `startedAt|null`, `finishedAt|null`, `predictedStartAt|null`, `publishedStartAt|null`, `delayMinutes|null`.

### `RouteEtaAccuracy` (`GET /v1/day-plans/eta-accuracy`)

`meanAbsoluteErrorMinutes|null`, `sampleSize`, `excludedOutliers`, `thresholdMinutes` (10), `minSampleSize` (30), `status (INSUFFICIENT_DATA|OK|ABOVE_THRESHOLD)`.

### Shared enums / constants / helpers consumed

- Enums: `LiveDayInspectorState`, `LiveDayStopProgress`, `LiveDayAlertType`, `LiveDayLastKnownSource`, `LiveDayThresholdSource`, `LiveDayGeofencePhase`.
- Labels: `LIVE_DAY_STATE_LABELS` (`AT_PROPERTY = "At a property"`), `LIVE_DAY_ALERT_LABELS`.
- Order/caps: `LIVE_DAY_ALERT_TYPE_ORDER`, `LIVE_DAY_SHOW_ALL_MAX` (40), `LIVE_DAY_GEOMETRY_ALL_MAX_INSPECTORS` (60).
- Colour: `INSPECTOR_ROUTE_PALETTE`, `inspectorRouteColorIndex(id)`, `inspectorRouteColor(id) → { mapbox, hex, index }`.
- Geometry: `dayPlanGeometrySchema` / `DayPlanGeometry` (FeatureCollection of LineString with `properties { fromSequence, toSequence, approximate }`).

## Client-only view state (no persistence)

| Name | Shape | Owner | Notes |
|---|---|---|---|
| URL params | `date?`, `inspector?`, `attention?`, `routes?` | `LiveDayPage` via `useSearchParams` | all optional; `replace: true` on change |
| `geometryMode` | `'none' \| 'selected' \| 'all'` | derived in `LiveDayPage` | D18; feeds `useLiveDay` query key |
| `selectedId` | `string \| null` | derived from `?inspector`, validated against roster | ignored silently if absent on the day |
| `showAll` | boolean | derived from `?routes=all` AND `canShowAllRoutes(visible)` | gated by the 40 cap |
| `needsAttention` | boolean | derived from `?attention=1` | drives `filterInspectors` |
| frozen order | `string[]` of inspectorIds | `useFrozenOrder` | held during pointer/focus interaction |
| panel collapsed | boolean | `MapScreenLayout` mobile mode | `aria-expanded` on "Map / List" |

## Derived view models (pure, `lib/liveDayView.ts`)

- `filterInspectors(list, { needsAttention }) → LiveDayInspector[]`
- `sortInspectors(list) → LiveDayInspector[]` — severity rank (`LIVE_DAY_ALERT_TYPE_ORDER`, no alert = 7) then `inspectorName.localeCompare('en-AU')`
- `routesToDraw(list, { showAll, selectedId }) → Array<{ inspector, emphasis }>` — `'selected' | 'normal' | 'muted'`
- `canShowAllRoutes(visibleCount) → boolean` — `≤ LIVE_DAY_SHOW_ALL_MAX`
- `formatDelay(min|null) → string` — `"+22 min" | "On time" | "—"`
- `stopTimeLabel(stop, { isPastDay }) → string` — per FR-011 table (DONE/CURRENT/OPEN/REMAINING/out-of-plan/past-day), formatted in `stop.timezone`

## Validation rules (client)

- Invalid `?date` → first request omits `date` (server defaults to today).
- `?date` beyond tomorrow → 400 `LIVE_DAY_DATE_TOO_FAR` → set `date = today` (replace) + banner; not treated as an error page.
- `?inspector` not in roster → cleared silently.
- `?routes=all` with > 40 visible → ignored until the list fits.
- Nullable coordinates (`lat/lng null`, `missingCoordinates true`) → no map pin; excluded from `fitBounds`; stop row shows the "Location not found" note.
