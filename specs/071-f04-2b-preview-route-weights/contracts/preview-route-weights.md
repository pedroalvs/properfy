# Contract — POST /v1/day-plans/preview (contract 01.14, L-F04-14)

Static route; registered before `/v1/day-plans/:inspectorId/:date` so the radix router prefers it.

## Request

```
POST /v1/day-plans/preview
Authorization: Bearer <AM|OP access token>
Content-Type: application/json
```

Body (`previewRouteWeightsRequestSchema`, already in `@properfy/shared`):

```json
{
  "inspectorId": "uuid",
  "date": "YYYY-MM-DD",
  "weights": { "travel": 1, "windowWait": 0, "baseProximity": 1 }
}
```

- `weights` validated by `routeWeightsSettingSchema`: each 0..10, step 0.1; at least one > 0 (all-zero → 400 "At least one weight must be greater than 0").

## Responses

| Status | Code | When |
|---|---|---|
| 200 | — | `{ data: { current, proposed } }`, each `routeWeightsPreview` (`etaSource 'MATRIX'`). Exactly 1 Matrix call, 0 Directions; nothing persisted. |
| 400 | `VALIDATION_ERROR` | body fails schema (bad uuid, bad date, invalid weights) — before any routing call |
| 403 | `FORBIDDEN` | actor role ∉ {AM, OP} (`Role {role} is not permitted to perform day_plan.preview_weights`) |
| 404 | `INSPECTOR_NOT_FOUND` | `inspectorId` references no inspector |
| 422 | `DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` | `date` < today or > today+14 in the actor's effective tz — "Pick a day between today and 14 days ahead"; routing NOT called |
| 429 | rate limit | > 10 requests/min per user |

## 200 body shape

```json
{
  "data": {
    "current": {
      "weights": { "travel": 1, "windowWait": 1, "baseProximity": 1 },
      "etaSource": "MATRIX",
      "approximate": false,
      "departureAt": "2026-11-05T21:00:00.000Z",
      "finishEta": "2026-11-05T23:30:00.000Z",
      "totals": { "driveS": 0, "waitS": 0, "lateS": 0 },
      "feasible": true,
      "stops": [
        {
          "appointmentId": "uuid",
          "sequence": 1,
          "appointmentCode": "APPT-001",
          "suburb": "Bondi",
          "windowStart": "08:00",
          "windowEnd": "10:00",
          "timezone": "Australia/Sydney",
          "eta": "2026-11-05T21:00:00.000Z",
          "lateS": 0
        }
      ]
    },
    "proposed": { "...": "same shape with the requested weights" }
  }
}
```

## OpenAPI

Regenerated into `packages/shared/openapi.json` and `packages/shared/src/api-types.ts` via `pnpm generate:api` (CI `contract-freshness` gate).
