# Consumed contracts (no new contract)

This web feature defines **no new API contract**. It consumes endpoints already merged on `origin/develop`. No OpenAPI or `api-types` change is produced by this task; `pnpm generate:api` is NOT run.

## 1. `GET /v1/dashboard/live-day` (TASK-F05-1)

- **Auth**: AM/OP only (server-enforced; CL/INSP → 403).
- **Query**: `date?` (civil `YYYY-MM-DD`, default = actor civil today), `includeGeometry` (`none` default | `selected` | `all`), `inspectorId?` (uuid; required by the server when `includeGeometry=selected`).
- **200**: `liveDayResponseSchema` (see data-model.md).
- **400 `LIVE_DAY_DATE_TOO_FAR`**: `date` beyond tomorrow → the client re-anchors to `today` with a banner (not an error page).
- **400 `LIVE_DAY_TOO_MANY_ROUTES`**: `includeGeometry=all` with roster > 60 → guarded client-side by the 40-visible cap, so it should not normally fire; if it does, the client treats it like a polling/initial error and does not draw routes.
- **Client usage**: `useLiveDay({ date, geometryMode, selectedId })`; `queryKey ['live-day', date, geometryMode, selectedId]`; `refetchInterval 30_000` only when `isLive`; `keepPreviousData`.

## 2. `GET /v1/day-plans/eta-accuracy` (F04)

- **Auth**: AM/OP.
- **Query**: `days` (30).
- **200**: `routeEtaAccuracySchema` (`meanAbsoluteErrorMinutes|null`, `sampleSize`, `excludedOutliers`, `thresholdMinutes 10`, `minSampleSize 30`, `status`).
- **Client usage**: `useEtaAccuracy()`; `staleTime 10 min`; no `refetchInterval`.

## 3. Shared imports (`@properfy/shared`)

Types/enums/labels/caps/palette/geometry schema listed in data-model.md. All already exported from `packages/shared/src/{schemas/live-day,enums/live-day,live-day/inspector-route-color,schemas/day-plan}.ts` and surfaced via the package barrels.

## UI contract (web) exposed to other features

These are internal web contracts (not HTTP) added by this task and reused later (F05-3, F07, F09):

- `components/map/RouteLayer.tsx` — props `{ id, geometry: DayPlanGeometry|null, color (comma-HSL), emphasis?, stops?, onClick?, label? }`.
- `components/map/MapMarker` — new optional props `headColor`, `outlineColor`, `innerText`, `innerIcon`.
- `components/map/MapScreenLayout` — new optional `storageKey?` + collapsible mobile mode (< md).
- `components/map/marker-offsets.ts` — `computeMarkerOffsets` (re-exported from `components/map/index.ts`).
