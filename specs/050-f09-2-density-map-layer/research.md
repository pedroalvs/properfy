# Phase 0 Research: Activity density layer (web)

The feature consumes an already-merged, typed contract, so research is confirmation of existing codebase facts (verified in the worktree at `origin/develop` @ `05f2f384`) rather than open technology choices. No `NEEDS CLARIFICATION` remained after the spec.

## Decision 1 — Reuse the shared F09-1 contract, do not re-derive

- **Decision**: Import `ExecutionDensityResponse`, `ExecutionDensityCell`, `isExecutionDensityPreset`, and `EXECUTION_DENSITY_PRESET_DAYS` from `@properfy/shared`; call the endpoint through the typed `api.GET('/v1/map/execution-density', …)`.
- **Rationale**: Constitution IV (contract-first). `api-types.ts` in `develop` already types the route (verified). `isExecutionDensityPreset(range, today)` is pure civil-date math shared with the backend, so the web preset builder can be unit-checked against it (test P10), guaranteeing both sides agree on what a preset is.
- **Signature confirmed**: `isExecutionDensityPreset({ fromDate, toDate }, today)` returns true iff `toDate === today` and `fromDate === addCivilDays(today, -(N-1))` for N ∈ {7,30,90}. My `presetRange(preset)` must therefore produce `{ fromDate: addCivilDays(today, -(N-1)), toDate: today }`.
- **Alternatives rejected**: duplicating the preset list or constants in web (violates "never duplicate shared" and risks drift).

## Decision 2 — `DensityLayer` follows the `RegionHeatmap` pattern, without importing or editing it

- **Decision**: New generic component `components/map/DensityLayer.tsx` using `getSource → setData` / `addSource + addLayer`, GeoJSON `Point` features `[lng, lat]` with `properties.count`, `heatmap-weight` interpolated on `count` capped at `maxCount`.
- **Rationale**: `RegionHeatmap` (`features/analytics`) is the proven Mapbox heatmap pattern in this repo, but it is a dashboard (untouchable per README) and it **moves the camera** (`fitBounds`/`flyTo`) — which this layer must not (FR-018). So we mirror the pattern in a new, fetch-free primitive and omit the camera logic.
- **Differences from RegionHeatmap**: (a) no camera move; (b) own HSL-comma ramp (not importing `HEATMAP_RAMP` from `features/analytics`); (c) `setPaintProperty('heatmap-weight', …)` when `maxCount` changes (the layer lives across period changes, RegionHeatmap only sets weight at `addLayer`); (d) `style.load` re-apply + `styledata` re-order below `gl-draw-*`; (e) renders `null` (no DOM, no `MapContainer` wrapper — the map already exists on the page).
- **Alternatives rejected**: DOM markers (encode presence, not concentration); editing/generalizing `RegionHeatmap` (dashboard is off-limits).

## Decision 3 — Layer ordering below the lasso

- **Decision**: `beforeId` = id of the first `map.getStyle().layers` entry whose id starts with `gl-draw-`; register `map.on('styledata', ensureBelowDraw)` to `moveLayer` the density below the first `gl-draw-*` when the draw control re-adds its layers on top after a style change.
- **Rationale**: `MapLassoSelect` creates `mapbox-gl-draw` layers with ids `gl-draw-polygon-fill-properfy`, `…-stroke-properfy`, `…-vertex-properfy` (confirmed), which get `.cold`/`.hot` suffixes — recognized by the `gl-draw-` prefix. After `style.load`, the draw re-adds its layers on top, so `beforeId` computed at `style.load` is insufficient; `ensureBelowDraw` on `styledata` is the fix, idempotent (skips when already below all `gl-draw-*`) to avoid the `moveLayer → styledata` loop.
- **Alternatives rejected**: `setTimeout` hacks, relying on `mapbox-gl-draw` internals.

## Decision 4 — Comma-form HSL in paint

- **Decision**: Ramp constant `DENSITY_HEATMAP_RAMP` uses `hsla(199, 54%, 28%, a)` strings; a test asserts `/^hsla?\(\d+, \d+%, \d+%(, [\d.]+)?\)$/` and no space-form HSL.
- **Rationale**: Space-form HSL (Tailwind token form) in Mapbox paint breaks the whole map (PR #1302, in project memory). The same tone as `/analytics` (`rgb(33,86,110)` = `hsl(199,54%,28%)`) is kept for visual consistency without importing the token.
- **Alternatives rejected**: Tailwind HSL tokens (space form) directly in paint.

## Decision 5 — "Today" in Sydney, evaluated in state, not render

- **Decision**: `todayInTzDateString(PLATFORM_TIMEZONE)` computed only on enable / preset-apply / Custom-apply / re-anchor; the resolved `range` lives in component state; no timer.
- **Rationale**: L-F09-05/06. Keeps the period stable across refetches (focus/`staleTime`) and matches the backend's Sydney aggregation so `toDate = today` includes the current day and passes the backend preset check. Deliberately diverges from F00's `resolveWindowTimezone(tenant.timezone)` (pins), which is a nil-effect difference today (all agencies in Sydney).
- **Alternatives rejected**: deriving the range in render (would advance silently at midnight and desync from the request actually sent); a per-second timer (unnecessary churn).

## Decision 6 — Error empties the layer (no stale leakage)

- **Decision**: In `isError`, the hook returns a frozen `EMPTY` view model (`cells: []`, counts `0`, `truncated: false`, `minCellCount: 1`), never `data`/placeholder; the control passes `cells: []` with `visible: true` to the layer (empty source, not removed) and shows error + `Retry`.
- **Rationale**: L-F09-08. Prevents a failed agency switch from leaving the previous agency's heatmap visible (a cross-tenant visual leak) and prevents stale counts in the summary.
- **Alternatives rejected**: keeping `keepPreviousData` on error (would show the prior agency's cells).

## Decision 7 — Existing primitives reused

- `FilterSegmented` (`{ label, value, options, onChange }`, roving-tabindex tabs, selection-follows-focus) for the period tablist — satisfies the arrow-key a11y requirement natively.
- `FilterDateRange` already exposes `min`/`max` in `develop` (F00 merged, verified), so TASK-F09-2 P7 is a **no-op**; Custom just passes `max = today`.
- `api` typed client from `@/services/api`; TanStack Query `useQuery` with `keepPreviousData` — same shape as `useAnalytics`.
