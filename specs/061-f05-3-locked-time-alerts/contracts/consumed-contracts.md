# Consumed Contracts (reference only — already merged, NOT modified)

This feature exposes **no new interface**. It consumes contracts shipped by TASK-F05-1 and read
through the generated `openapi-fetch` client (`apps/web/src/services/api.ts`, typed by
`@properfy/shared` `paths`). This file documents them for review; **nothing here changes**
`packages/shared/openapi.json` or `packages/shared/src/api-types.ts`.

## 1. `GET /v1/dashboard/locked-time`

- **Auth**: AM/OP only (403 otherwise — enforced by the merged backend and the route `AuthGuard`).
- **Query**: `from?`, `to?` (civil dates). Web always sends both.
- **200**: `lockedTimeResponseSchema` — see `data-model.md §1`.
- **Web usage**: `useLockedTime(today, periodDays)` → `['locked-time', from, to]`, `staleTime` 60 s,
  no poll.

## 2. `GET /v1/inspectors/{inspectorId}/alert-thresholds`

- **Auth**: AM/OP only.
- **200**: `inspectorAlertThresholdsResponseSchema` — `platformDefaults` / `override` (nullable per
  field) / `effective`.
- **404**: inspector not found → web shows "This inspector no longer exists.".
- **Web usage**: `useInspectorAlertThresholds(inspectorId)` GET half, `enabled: isAmOp && open`.

## 3. `PUT /v1/inspectors/{inspectorId}/alert-thresholds`

- **Auth**: AM/OP only.
- **Body**: `updateInspectorAlertThresholdsSchema` (`.strict()`): `{ delayMinutes, notStartedMinutes }`,
  each `int 5..240 | null`.
- **200**: updated `inspectorAlertThresholdsResponseSchema`.
- **400**: validation error `{ error: { code, message, details? } }` → shown in the form (`role="alert"`),
  entered values kept.
- **Web usage**: `useInspectorAlertThresholds(...).mutate`; on success invalidate
  `['inspector-alert-thresholds', id]` + `['live-day']`.

## 4. `GET` / `PUT /v1/platform-settings/{key}` with `key = liveDayAlerts`

- **Auth**: AM/OP only.
- **Value**: `{ delayMinutes:int 5..240, notStartedMinutes:int 5..240 }`, defaults `{ 20, 30 }`.
- **Web usage**: existing `usePlatformSetting('liveDayAlerts')` (GET/PUT, last-write-wins D18).

## 5. `GET /v1/dashboard/live-day` (anchor only)

- Already consumed by `useLiveDay` on this screen. This feature reads only `response.today` for the
  locked-time range anchor (L-F05-09); it does not add a request.

## Contract-freshness

Because no route schema changes, `pnpm generate:api` would produce an identical `openapi.json` /
`api-types.ts`. The CI `contract-freshness` job stays green with no regeneration. **Do not** run a
regeneration that could introduce unrelated drift.
