# Phase 0 Research: PWA Route Map and Reorder (F04-4)

## R1. L-F04-03 reorder variant

- **Decision**: **Plan A** — `routingInput` (raw matrix) is forwarded to the client in the `GET` and reordering recomputes **locally**.
- **Rationale**: Verified against merged `packages/shared/src/schemas/day-plan.ts` on `origin/develop` (2fb00e3d): `dayPlanRoutingInputSchema` exists (`points`, `travelS`, `originKey`, `earliestDepartureAt`, `weights`, `legTravelS`), `dayPlanResponseSchema.routingInput` is present, and `toOptimizerInput`/`buildLegOverrides` are exported. The exported-contracts example also shows `routingInput`. So (c) in the Mapbox consultation was granted.
- **Alternatives considered**: Variant B (`POST …/order/preview` server evaluation, `etaSource 'MATRIX'`, 400 ms debounce). **Rejected** — not needed; would add a backend round-trip per drag and is only the fallback if the matrix could not reach the client.

## R2. Reuse of shared evaluator vs. reimplementation

- **Decision**: Reuse `toOptimizerInput(plan, now)`, `buildLegOverrides(order, routingInput)`, `evaluateSequence(input, order, { legTravelS })`, `RouteOrderMismatchError`, and types from `@properfy/shared`. The PWA `reorder-draft.ts` **wraps** them (reorderable-set derivation, `alignOrder`, `moveItem/Up/Down`, delta/violation formatting) and does not redefine the evaluator.
- **Rationale**: F04-1 put the optimizer in shared precisely so the PWA reorder reuses the same evaluator (exported-contracts §4). `toOptimizerInput(plan, now)` already folds in `earliestDepartureS = max(now, routingInput.earliestDepartureAt)` for today, so a separate `resolveEarliestDeparture` is at most a thin adapter. The task file's older step-4 wording ("`buildLegOverrides(plan, order)` in `reorder-draft.ts`") is superseded by the merged shared signature `buildLegOverrides(order, routingInput)`.
- **Alternatives considered**: Reimplementing leg-override logic in the PWA. **Rejected** — duplicates domain logic, risks drift from the server's evaluation, violates "use `packages/shared` for shared logic".

## R3. `@dnd-kit` configuration for iOS scroll + accessibility

- **Decision**: `DndContext` with `PointerSensor` (`activationConstraint { delay: 150, tolerance: 5 }`), `KeyboardSensor` (`sortableKeyboardCoordinates`), `SortableContext` + `verticalListSortingStrategy`, modifiers `restrictToVerticalAxis` + `restrictToParentElement`, `autoScroll` on, English `accessibility.announcements` + `screenReaderInstructions`. `touch-action: none` only on the drag handle; up/down arrow buttons as a non-drag alternative. `prefers-reduced-motion` → `DragOverlay`/`dropAnimation` null and no transform transition.
- **Rationale**: The `delay` keeps vertical scrolling free on touch (handle-only activation); arrows + keyboard sensor give a full non-pointer path (WCAG). `restrict*` modifiers prevent horizontal drift and escaping the list.
- **Alternatives considered**: HTML5 DnD (poor touch/a11y), `MouseSensor`+`TouchSensor` split (more code, same result), no delay (steals scroll on iOS — the documented failure mode).

## R4. Route line rendering (`useGeoJsonLineLayer`)

- **Decision**: One GeoJSON source (`day-plan-route`) and **two** line layers added once: solid (`filter ['!=', ['get','approximate'], true]`) and dashed (`line-dasharray [0.5, 2]`, `filter ['==', ['get','approximate'], true]`); `line-color` via `hslTripletToMapboxColor(resolvePrimaryColor())` (comma-form HSL, e.g. `hsl(221, 83%, 53%)`), width 4, opacity 0.9, below the pin markers. `setData` on each change; `null` → empty FeatureCollection; re-add on a map rebuilt after retry.
- **Rationale**: Space-separated HSL in `paint` breaks the whole map (#1302) — the comma-form converter is mandatory. Two statically-filtered layers avoid per-feature paint and let approximate legs dash without re-adding layers.
- **Alternatives considered**: One layer with a data-driven dash expression (`line-dasharray` is not data-driven in mapbox-gl) — **rejected** (unsupported).

## R5. Bundle budget for importing `route-planning` from the shared barrel

- **Decision**: Keep the Map tab + `mapbox-gl` behind `React.lazy`; import `evaluateSequence`/`toOptimizerInput` from `@properfy/shared` (barrel) and **measure**. If the entry chunk grows > 5 kB gzip or `route-planning` appears in the entry chunk, add the `@properfy/shared/route-planning` subpath export (tsup entry + `exports["./route-planning"]`) and import from there (conditional +0.25, recorded in the PR).
- **Rationale**: `packages/shared` has no `"sideEffects": false` and exports only the barrel, so tree-shaking of `route-planning` is not guaranteed. Measuring before refactoring avoids blind subpath work (Finding B5/6).
- **Measurement**: `pnpm --filter pwa build` on `develop` and on the branch; compare gzip for `index-*.js`, the lazy Route/Reorder chunk, and total `dist/assets/*.js`; `grep -l "ROUTE_ORDER_MISMATCH" apps/pwa/dist/assets/*.js` to locate which chunk holds `route-planning`.

## R6. Draft-vs-live-plan reconciliation

- **Decision**: `useReorderDraft` holds `{ order, baseVersion }`. On refetch: no draft → adopt silently; dirty + higher version → **freeze** (alert + "Review" that discards to the new version, Save disabled); dirty + reorderable-set changed → discard with "A stop was removed from your route…"; `status 'STALE'` → Save disabled "Updating your route…". A this-device check-in (F03 local execution state) removes the stop from `reorderableIds` live and discards the draft if that stop was moved.
- **Rationale**: Matches the server's live-derived reorderable set (DB11) and never overwrites a newer plan; conflict codes (409/422) are the backstop if a Save races ahead.
- **Alternatives considered**: Auto-rebasing the draft onto the new version — **rejected** (silently reinterprets the inspector's intent; the contract says reload-and-review).

## Resolved

No `NEEDS CLARIFICATION` remains. All decisions trace to the merged contracts and the task's applied gaps (L-F04-03/07/13, DB3/10/11, Q19).
