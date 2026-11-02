# Phase 1 Data Model: Activity density layer (web)

No persistence, no database, no new wire schema. This feature's "data model" is the set of client view models and component state. The wire contract (query/response) is owned by TASK-F09-1 in `@properfy/shared` and reused as-is.

## Wire contract (reused, not defined here)

From `@properfy/shared` (`execution-density.ts`):

- `ExecutionDensityQuery` = `{ fromDate: string; toDate: string; tenantId?: string; inspectorId?: string }`
- `ExecutionDensityCell` = `{ lat: number; lng: number; count: number }` (cell center, count ≥ 1)
- `ExecutionDensityResponse` = `{ fromDate; toDate; gridSizeDegrees; minCellCount; cells; cellCount; totalExecutions; excludedWithoutCoordinates; truncated }`
- `isExecutionDensityPreset(range, today)`, `EXECUTION_DENSITY_PRESET_DAYS = [7, 30, 90]`

## View models / component contracts

### `DensityCell` (DensityLayer input)

```ts
interface DensityCell { lat: number; lng: number; count: number }
```
Structurally identical to `ExecutionDensityCell`; declared locally in `DensityLayer.tsx` so the generic map primitive carries no dependency on the feature's wire types.

### `DensityLayerProps`

```ts
interface DensityLayerProps {
  map: mapboxgl.Map | null;   // null when the map is not ready (token missing / mode switch)
  cells: DensityCell[];        // memoized by the caller to keep stable identity
  visible: boolean;            // false removes layer+source; true ensures them (empty collection allowed)
}
```
Exports: `DENSITY_SOURCE_ID = 'execution-density'`, `DENSITY_LAYER_ID = 'execution-density-layer'`, `DENSITY_HEATMAP_RAMP: (string | number)[]`.

### `useExecutionDensity` return (hook contract)

```ts
interface UseExecutionDensityReturn {
  cells: ExecutionDensityCell[];
  totalExecutions: number;
  cellCount: number;             // from response; default 0 before first response
  excludedWithoutCoordinates: number;
  truncated: boolean;
  minCellCount: number;          // from response; default 1 before first response (L-F09-03)
  errorReason?: string;          // from the error envelope: (body as { error }).error?.details?.reason, e.g. 'PERIOD_NOT_A_PRESET' (L-F09-01). `api.GET` returns the parsed body `{ error: { code, message, details } }` as its `error` field (cf. useInvoiceSummary), so the reason is one level inside `.error`.
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}
```
Invariants:
- On `isError`, **all** data fields come from a frozen `EMPTY` constant, never `data`/placeholder (L-F09-08).
- Query key: `['map', 'execution-density', fromDate, toDate, tenantId ?? null, inspectorId ?? null]`.
- `enabled: enabled && !!fromDate && !!toDate`; `staleTime: 5*60_000`; `placeholderData: keepPreviousData`.
- Empty-string `tenantId`/`inspectorId` are omitted from the query params (never sent).

### `ExecutionDensityControl` props + internal state

```ts
interface ExecutionDensityControlProps {
  map: mapboxgl.Map | null;
  isGlobalRole: boolean;   // AM/OP → Custom + agency/inspector filters; CL → presets only, no filters
  tenantId: string;        // from appointmentFilters; discarded for CL
  inspectorId: string;     // from appointmentFilters; discarded for CL
}

type Preset = '7d' | '30d' | '90d' | 'custom';   // 'custom' only reachable for AM/OP
interface ControlState {
  enabled: boolean;
  panelOpen: boolean;      // the × / Escape closes the panel without disabling the layer
  preset: Preset;
  range: { fromDate: string; toDate: string };   // changes only on enable / preset / Custom apply / re-anchor
}
```

### Period lib (`execution-density-period.ts`)

```ts
type DensityPreset = '7d' | '30d' | '90d';
function presetRange(preset: DensityPreset): { fromDate: string; toDate: string };
//   = { fromDate: addCivilDays(today, -(N-1)), toDate: today }, today = todayInTzDateString(PLATFORM_TIMEZONE)
function validateCustomRange(fromDate: string, toDate: string): string | null;
//   null = valid; otherwise one of the inline error messages (P4–P7)
```

## State transitions (layer lifecycle)

```
disabled ──enable──▶ enabled+panelOpen (range = presetRange('30d'))
enabled ──select preset──▶ range = presetRange(preset)
enabled(AM/OP) ──apply valid Custom──▶ range = { from, to }
enabled ──× / Escape──▶ panelOpen = false (layer stays visible)
enabled+panelClosed ──click toggle──▶ panelOpen = true (layer stays visible; no period recompute)
enabled ──toggle off──▶ disabled (DensityLayer visible=false; hook enabled=false)
enabled(CL) ──refetch 400 PERIOD_NOT_A_PRESET──▶ range = presetRange(currentPreset) [re-anchor], retry once
disabled ──re-enable──▶ range recomputed from today (period does not persist)
```
