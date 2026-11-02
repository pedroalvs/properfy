# Consumed Contracts

This feature exposes **no new interface**. It changes one existing contract and consumes three others.

## Changed: `POST /v1/service-types` body

`defaultDurationMinutes` moves from optional-with-default to **required**. OpenAPI marks it `required` after `pnpm generate:api`.

| Field | Type | Rule |
|---|---|---|
| code | string | 1–50, uppercased |
| name | string | 1–200 |
| flowType | enum | ROUTINE/INGOING/OUTGOING |
| requiresRentalTenantConfirmation | boolean | — |
| **defaultDurationMinutes** | integer | **required**, 5–480 |

`PATCH /v1/service-types/:id` — `defaultDurationMinutes` optional (5–480), unchanged behaviour.

## Consumed (unchanged): `GET/PUT /v1/platform-settings/routeWeights`

`PUT` body `{ value: { travel: number, windowWait: number, baseProximity: number } }`, each 0–10 (≤1 decimal), sum > 0.

## Consumed (unchanged): `POST /v1/day-plans/preview`

Body `{ inspectorId, date (YYYY-MM-DD), weights }` → `{ data: { current, proposed } }`. See data-model.md for the full `RouteWeightsPreview` shape and error codes.

## Consumed (unchanged): `GET /v1/inspectors`

`?status=ACTIVE&search={text}&pageSize=20` for the preview inspector picker.
