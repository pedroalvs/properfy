# Implementation Plan: Activity density layer on the appointment map (web)

**Branch**: `050-f09-2-density-map-layer` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/050-f09-2-density-map-layer/spec.md`

## Summary

Add an opt-in **"Activity density"** heatmap layer to the `/map` screen (Appointments mode only), consuming the already-merged `GET /v1/map/execution-density` endpoint (TASK-F09-1, PR #1326). The layer has its own period selector (default last 30 Sydney days), honours the existing agency/inspector map filters for AM/OP, offers only fixed presets for CL (backend privacy rule), renders a numbered relative legend and a textual summary, sits below the lasso layers, and survives style reloads. Web-only: no backend/schema/`api-types` change. All new logic lives in a generic `DensityLayer` map component, a `useExecutionDensity` hook, a period lib, and an `ExecutionDensityControl` panel; `AppointmentMapPage.tsx` only gets ≤ ~12 lines of wiring.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict, ES2022 ESM); React 18; Node 24 toolchain
**Primary Dependencies**: React 18, Vite 5, TanStack Query 5 (`keepPreviousData`), `mapbox-gl` 3, `openapi-fetch` (typed by `packages/shared/src/api-types.ts`), Tailwind 3, `@properfy/shared` (period helpers, constants), `@properfy/frontend-standards` (`cn()`), `@mdi/font` (Material Design Icons — toolbar uses `mdi-fire`)
**Storage**: N/A (read-only consumer; no persistence — no storage/URL state)
**Testing**: Vitest + Testing Library (unit/component, incl. the page test `AppointmentMapPage.test.tsx`); existing web Playwright E2E suite (`apps/web/tests/e2e`, `pnpm --filter web test:e2e`, **Chromium-only, every API call stubbed**) is the CI gate `test-web-e2e` — re-run to prove no regression since the map flow is touched (no new Playwright spec required)
**Target Platform**: Modern browsers (web SPA); responsive down to phone width (panel full-width with 16px gutter < 768px)
**Project Type**: Web application (monorepo workspace `apps/web`)
**Performance Goals**: Heatmap stays fluid; payload capped at 5,000 cells by the backend; `staleTime: 5 min` avoids refetch churn; `setData`/`setPaintProperty` reuse the existing source/layer across period changes (no add/remove thrash)
**Constraints**: Mapbox paint colours must be comma-form HSL (space-form breaks the map, PR #1302); layer must stay below `gl-draw-*`; re-apply on `style.load` + re-order on `styledata` idempotently; "today" via `todayInTzDateString(PLATFORM_TIMEZONE)` only (Sydney-only by design); no camera move; `AppointmentMapPage.tsx` delta ≤ ~12 lines
**Scale/Scope**: ~14 files; 4 new modules + page wiring + CLAUDE.md; no new npm dependency

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | ✅ N/A (web) | Backend layering not touched. Web keeps separation: generic map primitive (`DensityLayer`) ↔ data hook (`useExecutionDensity`) ↔ pure period lib ↔ feature control; no fetch in the layer, no map code in the hook. |
| II. Multi-Tenant Safety | ✅ PASS | The endpoint is tenant-scoped; the **backend is the authority** (TASK-F09-1 enforces CL isolation, k-anon, preset lock). Web defence-in-depth: the control discards `tenantId`/`inspectorId` for CL so the UI never sends cross-tenant input. No raw inspector coordinates are ever handled (backend returns cell centres only). |
| III. Test-Driven Development | ✅ PASS | Every unit (L1–L12), lib (P1–P10), hook (H1–H10), control (C1–C17) and page (E1–E5) test from the task file is written red first, then implemented. Web E2E gate re-run because the map flow is touched. |
| IV. Contract-First APIs | ✅ PASS | Consumes the generated `api-types.ts` via typed `api.GET` — no `as any`/`as never`, no new/duplicated schema. Period presets agree with `isExecutionDensityPreset`/`EXECUTION_DENSITY_PRESET_DAYS` from `@properfy/shared` (single source). |
| V. Simplicity & Minimal Impact | ✅ PASS | Reuses `RegionHeatmap`'s GeoJSON+heatmap pattern (without importing it or editing it), `FilterSegmented`, `FilterDateRange` (existing `min`/`max`). No dashboard touched. `AppointmentMapPage` grows ≤ ~12 lines. No feature flag, no persistence. |

**No violations. Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/050-f09-2-density-map-layer/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (view models / state)
├── quickstart.md        # Phase 1 output (dev + smoke)
├── contracts/           # Phase 1 output (component/hook contracts; endpoint is pre-existing)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/web/src/
├── components/
│   ├── map/
│   │   ├── DensityLayer.tsx            # NEW — generic Mapbox heatmap primitive (no fetch)
│   │   ├── DensityLayer.test.tsx       # NEW — L1–L12
│   │   └── index.ts                    # MODIFY — export DensityLayer + ids/ramp
│   └── filters/
│       └── FilterDateRange.tsx         # UNCHANGED — min/max already present (F00 merged)
└── features/appointments/
    ├── lib/
    │   ├── execution-density-period.ts        # NEW — presetRange/validateCustomRange
    │   └── execution-density-period.test.ts   # NEW — P1–P10
    ├── hooks/
    │   ├── useExecutionDensity.ts             # NEW — typed query + empty-on-error
    │   ├── useExecutionDensity.test.tsx       # NEW — H1–H10
    │   └── index.ts                           # MODIFY — export hook
    ├── components/
    │   ├── ExecutionDensityControl.tsx        # NEW — toggle + panel + legend + summary
    │   └── ExecutionDensityControl.test.tsx   # NEW — C1–C17
    └── pages/
        ├── AppointmentMapPage.tsx             # MODIFY — ≤ ~12 lines wiring (appointments mode)
        └── AppointmentMapPage.test.tsx        # MODIFY — E1–E5

apps/web/CLAUDE.md                              # MODIFY — custom Mapbox layer pattern (X00 rule)
```

**Structure Decision**: Web application, single workspace `apps/web`. The generic map primitive lives under `components/map/` (reusable, sibling to `MapLassoSelect`); the feature-specific control, hook, and lib live under `features/appointments/` next to the map page that consumes them. This mirrors the existing split (`RegionHeatmap` is a generic-ish heatmap under `features/analytics`; `MapLassoSelect` is the generic map primitive under `components/map`).

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
