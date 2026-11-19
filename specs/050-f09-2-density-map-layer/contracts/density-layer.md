# Component & Hook Contracts

The HTTP contract (`GET /v1/map/execution-density`) is owned by TASK-F09-1 and already in `develop`; it is not restated here except as consumed. These are the web-internal contracts introduced by this feature.

## HTTP (consumed, unchanged)

`GET /v1/map/execution-density?fromDate&toDate[&tenantId][&inspectorId]` → `{ data: ExecutionDensityResponse }`.
- 400 `VALIDATION_ERROR` (incl. `details.reason = 'PERIOD_NOT_A_PRESET'`, `allowedDays: [7,30,90]` for CL out-of-preset).
- 403 `AUTH_FORBIDDEN` (role not AM/OP/CL_*; CL with `inspectorId`).
- Called via typed `api.GET` — no `as any`/`as never`.

## `DensityLayer` (generic map primitive, `components/map/DensityLayer.tsx`)

- Renders `null`. Side-effecting on the passed `map`.
- `visible && cells` → ensure source `execution-density` (GeoJSON) + layer `execution-density-layer` (heatmap); `getSource` → `setData` on rerender; `setPaintProperty('…','heatmap-weight',…)` when `maxCount` changes.
- `addLayer(…, beforeId)` where `beforeId` = first `gl-draw-*` layer id or `undefined`.
- `map.on('style.load', apply)` re-creates source+layer from a `ref` of latest cells.
- `map.on('styledata', ensureBelowDraw)` → `moveLayer` below the first `gl-draw-*` iff a `gl-draw-*` sits below it; idempotent (no loop).
- `visible === false` → `removeLayer` + `removeSource` if present.
- Unmount → `off` both handlers + remove layer/source in try/catch (map may be gone).
- `map === null` → no-op, no handlers registered.
- All paint colours comma-form HSL.

Acceptance tests: L1–L12, L6a, L7a–L7d (see spec/tasks).

## `useExecutionDensity` (hook, `features/appointments/hooks/useExecutionDensity.ts`)

- Input: `{ enabled, fromDate, toDate, tenantId?, inspectorId? }`.
- Output: `UseExecutionDensityReturn` (see data-model.md).
- Omits empty-string params. Query key and options per data-model.
- `isError` → frozen `EMPTY` state (no stale data). `errorReason` read from the error envelope at `(body).error?.details?.reason` — `api.GET`'s `error` is the parsed `{ error: { code, message, details } }` body, so the reason sits inside `.error` (cf. `useInvoiceSummary`).

Acceptance tests: H1–H10.

## `execution-density-period` (pure lib)

- `presetRange('7d'|'30d'|'90d')` → inclusive N-day lookback ending Sydney today; agrees with `isExecutionDensityPreset` (P10).
- `validateCustomRange(from, to)` → `null` | message (end≥start, ≤366 days, not future, both chosen).

Acceptance tests: P1–P10.

## `ExecutionDensityControl` (feature control, `features/appointments/components/ExecutionDensityControl.tsx`)

- Toolbar toggle (`aria-pressed`, `aria-controls`) + panel (`role="region"`).
- AM/OP: 4 period options incl. Custom (`FilterDateRange`, `max = today`), agency/inspector passed to hook.
- CL: 3 presets only, no Custom, `tenantId`/`inspectorId` discarded, privacy lines, re-anchor-once on `PERIOD_NOT_A_PRESET`.
- Scope line (4 AM/OP variants + 1 CL variant), numbered relative legend, `aria-live` summary, error + Retry, Escape/× close panel only.
- Renders `DensityLayer` with memoized `cells` and `visible = enabled`.

Acceptance tests: C1–C17.

## Page wiring (`AppointmentMapPage.tsx`)

- ≤ ~12 lines: import + JSX in toolbar, `mode === 'appointments'` only, passing `map={mapInstance}`, `isGlobalRole`, `tenantId`/`inspectorId` from `appointmentFilters`.

Acceptance tests: E1–E5.
