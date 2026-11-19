# Phase 1 Data Model: PWA Route Map and Reorder (F04-4)

No database, table, column, or `api-types` change. This feature consumes the already-merged `DayPlanResponse` and introduces **client-only** state shapes.

## Consumed (read-only, from `@properfy/shared`)

- **`DayPlanResponse`** (`schemas/day-plan.ts`): `id, inspectorId, date, timezone, status, version, publishedAt, computedAt, lastTrigger, approximate, approximateReason, routingProvider, matrixProfile, optimizerMethod, origin, originWarning, originOverride, departureAt, finishEta, totals, feasible, violations, manualOrder, suggestedOrder, stops[], geometry, routingInput`.
- **`DayPlanStop`**: `appointmentId, sequence, appointmentCode, agencyName, appointmentStatus, executionStatus, eta, serviceStartAt, serviceEndAt, travelS, distanceM, waitS, lateS, windowStart, windowEnd, windowStartAt, windowEndAt, timezone, durationMinutes, manual, executed, approximate, missingCoordinates, lat, lng, propertyAddress, suburb, serviceTypeName, keyRequired, meetingLocation, rentalTenantConfirmationStatus, primaryContact{name,phone,role}`.
- **`DayPlanGeometry`**: GeoJSON `FeatureCollection` of `LineString` features with `properties { fromSequence, toSequence, approximate }`.
- **`DayPlanRoutingInput`** (Plan A): `points[{key,lat,lng}], travelS[][], originKey, earliestDepartureAt, weights{travel,windowWait,baseProximity}, legTravelS[{fromKey,toKey,travelS}]`.
- **Optimizer** (`route-planning/`): `OptimizerInput`, `SequenceEvaluation`, `evaluateSequence`, `RouteOrderMismatchError`.

## Client-only state

### `ReorderDraft` (in `useReorderDraft`)
| Field | Type | Notes |
|---|---|---|
| `order` | `string[]` | appointmentIds of reorderable stops in draft order |
| `baseVersion` | `number` | `plan.version` the draft was built on (sent as `basedOnVersion`) |
| `frozen` | `boolean` | true when a newer version arrived while dirty (Save disabled, "Review" shown) |
| `isDirty` | derived | `order` ≠ saved reorderable order |

Lifecycle: created on first move → updated on each move → **cleared** on Save 200 / Discard / conflict / set-change; **frozen** on new version while dirty; never persisted to storage.

### `RoutePin` (in `useRoutePins`, feeds the map)
| Field | Type | Notes |
|---|---|---|
| `appointmentId` | `string` | |
| `label` | `string` | display number by current (draft or plan) order |
| `variant` | `'stop'\|'done'\|'origin'\|'group'` | `done` for DONE/in-progress; `origin` synthesized from `plan.origin` |
| `lat,lng` | `number` | omitted/skipped when `missingCoordinates` |
| `ariaLabel` | `string` | "Stop {n}, {address}, ETA {hh:mm}" / "Start: {label}" |
| `chip` | `{ title, address, window, detailHref }` | shown on tap |

### `DraftEvaluation` (output of `evaluateDraft`, from the shared `SequenceEvaluation`)
| Field | Type | Notes |
|---|---|---|
| `finishS` | `number` | local finish epoch-seconds for the draft order |
| `deltaFinishMin` | `number` | `round((finishS(new) − finishS(suggested))/60)` |
| `totalTravelS` | `number` | sum of leg travel seconds |
| `violations` | `{ key, lateS }[]` | window overruns (never blocks Save — DB3) |
| `perStopEtaS` | `Record<id, number>` | local service-start epoch-seconds (rendered with "~") |
| `invalid` | `boolean` | set when `evaluateSequence` throws `RouteOrderMismatchError` |

## State transitions (reorder/save)

```
idle ──move──▶ dirty ──Save 200──▶ idle (cache replaced, final ETAs)
  ▲             │  ├─Discard──────▶ idle
  │             │  ├─409/422──────▶ idle (refetch, alert)
  │             │  └─net/429──────▶ dirty (draft kept, retry msg)
  │             ▼
  │          frozen (newer version) ──Review──▶ idle (adopt new version)
  └──set-changed (CANT_DO / this-device check-in)──▶ idle (draft discarded + alert)
```

## Validation rules

- Save body contains **only** `executed: false` stops, in draft order, with `basedOnVersion = plan.version`; ≤ 25 ids (contract; above → server 400).
- Reorder controls appear only when `routingInput != null`, ≥ 2 reorderable stops, and date ≥ today.
- Window overrun produces a warning, never a blocked Save (DB3).
