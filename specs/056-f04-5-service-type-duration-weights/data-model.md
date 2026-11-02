# Phase 1 Data Model: Service Type Duration + Route Weights (web)

No persistent schema change (no migration). This documents the client-side shapes and the contracts consumed.

## Shared schema change (the only contract change)

`packages/shared/src/schemas/service-type.ts`:

```
// before
defaultDurationMinutes: durationMinutes.default(SERVICE_TYPE_DURATION_DEFAULT_MINUTES)  // transitional
// after (create — REQUIRED)
defaultDurationMinutes: durationMinutes
```

- `durationMinutes = z.number().int().min(5).max(480)` (unchanged constants `SERVICE_TYPE_DURATION_MIN_MINUTES=5`, `MAX=480`).
- `updateServiceTypeSchema.defaultDurationMinutes` stays `.optional()` (same bounds).
- `SERVICE_TYPE_DURATION_DEFAULT_MINUTES` constant stays (DB `DEFAULT 45`, direct inserts).

## Web types (`apps/web/src/features/service-types/types/index.ts`)

```
interface ServiceType {            // detail shape
  …existing…
  defaultDurationMinutes: number;  // NEW — already in serviceTypeResponseSchema
}

interface ServiceTypeFormData {
  code: string; name: string; flowType: string;
  requiresRentalTenantConfirmation: boolean;
  defaultDurationMinutes: string;  // NEW — form input value
}

EMPTY_SERVICE_TYPE_FORM.defaultDurationMinutes = '';
```

## Consumed contracts (no change — merged)

### `routeWeights` platform setting

- `GET /v1/platform-settings/routeWeights` → `{ data: PlatformSettingResponse }` (`value`, `defaults`, `isDefault`, `updatedAt`, `updatedBy`).
- `PUT /v1/platform-settings/routeWeights` body `{ value: { travel, windowWait, baseProximity } }`.
- `routeWeightsSettingSchema`: each weight `0..10`, at most one decimal place; refine `travel + windowWait + baseProximity > 0`. Default `DEFAULT_ROUTE_WEIGHTS = {1,1,1}`.

### Day-plan preview (F04-2b)

- `POST /v1/day-plans/preview` (AM/OP, 10/min). Body `previewRouteWeightsRequestSchema = { inspectorId: uuid, date: civilDate, weights: routeWeightsSettingSchema }`.
- Response `successResponseSchema(routeWeightsPreviewResponseSchema)`, `data = { current, proposed }`, each `RouteWeightsPreview`:
  - `weights {travel,windowWait,baseProximity}`, `etaSource:'MATRIX'`, `approximate: boolean`, `departureAt: instant|null`, `finishEta: instant|null`, `totals {driveS,waitS,lateS}` (ints, seconds), `feasible: boolean`.
  - `stops[]`: `{ appointmentId:uuid, sequence:int, appointmentCode, suburb, windowStart, windowEnd, timezone, eta:instant, lateS:int }`.
- Errors: `429` (rate limit), `422 DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` (date outside today..today+14 in actor tz), `404 INSPECTOR_NOT_FOUND`, `403` (non-AM/OP).

### Inspector search

- `GET /v1/inspectors?status=ACTIVE&search={text}&pageSize=20` → paginated `inspectorResponseSchema[]`; picker uses `{ id, name }`.

## Derived values (client)

- `durationSeconds → "1 h 10 min"` formatter for `totals.driveS`/`waitS`.
- `orderChanged(current, proposed) = current.stops.map(s=>s.appointmentId).join() !== proposed.stops.map(s=>s.appointmentId).join()`.
- `lateChip(stop.lateS) → "Late by {round(lateS/60)} min"` when `lateS > 0`.
- weight validation: `n ∈ [0,10]` and `Math.round(n*10) === n*10` (one decimal); group rule sum > 0.
