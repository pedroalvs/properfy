# Implementation Plan: PWA Route Map and Reorder (F04-4)

**Branch**: `054-f04-4-route-map-reorder` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/054-f04-4-route-map-reorder/spec.md`

## Summary

Add a **Map** tab (numbered pins in plan order, origin, real Directions line) and **reorder** (drag via `@dnd-kit` + up/down arrows, local recomputation from the plan's raw matrix, "+N min vs. suggested", window warnings, optimistic Save with version-conflict handling, "Reset to suggested") to the inspector's Route screen in `apps/pwa`. Pure frontend: consumes the already-merged day-plan contracts from TASK-F04-1/2/3 — no backend, schema, `api-types`, migration, or env change. The reorder evaluator is the already-merged `@properfy/shared` optimizer (`toOptimizerInput`, `buildLegOverrides`, `evaluateSequence`); the map reuses the offers-map hooks generalized into `src/lib/map/`.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24; pnpm 9 + Turborepo
**Primary Dependencies**: React 18, Vite 5, React Router 6, TanStack Query 5, Tailwind 3, `mapbox-gl` 3, `openapi-fetch`, `@properfy/shared` (route-planning + day-plan schemas), **new**: `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/modifiers@9.0.0`, `@dnd-kit/utilities@3.2.2`
**Storage**: N/A (client state only; reorder draft in a React hook, never persisted except via the existing `PUT …/order`). No `localStorage` for the draft.
**Testing**: Vitest 1 + React Testing Library (unit/component, `mapbox-gl` mocked as in offers tests); PWA Playwright E2E (`apps/pwa/tests/e2e`, Chromium + WebKit, all API stubbed) is a CI gate (`test-pwa-e2e`); manual QA checklist M1–M4 / R1–R11
**Target Platform**: PWA (iOS Safari standalone, Android Chrome, iPad); offline-capable (local reorder works offline; Save requires network)
**Project Type**: Monorepo frontend workspace (`apps/pwa`), consuming `packages/shared`
**Performance Goals**: Reorder recomputation is O(n) `evaluateSequence` over 3–4 typical stops (≤ 25 by contract); map pins/line via `mapbox-gl`; `mapbox-gl` and the Map tab are `React.lazy` so they stay out of the entry chunk
**Constraints**: PWA entry chunk grows ≤ **5 kB gzip** and `route-planning` must not land in the entry chunk (else add the `@properfy/shared/route-planning` subpath export, conditional +0.25); no `style.transform` on map markers; every map `paint` uses comma-form HSL (lesson #1302); WCAG-level keyboard + screen-reader support for drag and arrows; ≤ 150 changed files
**Scale/Scope**: ~55 files (git-mv renames counted); one PWA feature slice; no cross-tenant/backend surface

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture (backend)**: N/A — no backend code is touched. Frontend keeps the project's feature-folder layout (`features/day-plan`, shared primitives in `src/lib/map`). Pure logic (reorder-draft libs) is separated from React hooks and components. **PASS.**
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)**: `DayPlan`/`DayPlanStop` are platform-scoped (no `tenant_id`) because the inspector is cross-tenant; every day-plan endpoint is `INSP`-scoped to the caller's own plan. This feature consumes only those `INSP` endpoints and makes **no** new query, scope decision, entity, or `tenant_id` judgment. The Mapbox token never reaches the PWA (the line arrives pre-computed in `geometry`). **PASS** (no new multi-tenant surface).
- **III. Test-Driven Development (NON-NEGOTIABLE)**: The task ships with a full red-green test plan (pure libs, map view, reorderable list, save bar, draft hook, offers no-regression). Tests are written first. **PASS (committed).**
- **API conventions / Zod / dates-timezones**: No new API. Civil times formatted in `stop.timezone`; `finishEta`/greetings in `plan.timezone`; `:date` from `todayInTzDateString(effectiveTz)`, never device tz. **PASS.**
- **Inspector GPS privacy**: The PWA is the inspector's own device; raw coordinates it shows are the inspector's own + property coordinates (not another inspector's). No CL exposure path. **PASS.**

No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/054-f04-4-route-map-reorder/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (client state shapes; no DB)
├── quickstart.md        # Phase 1 output (manual QA + verification recipe)
├── contracts/           # Phase 1 output (pointer to consumed INSP endpoints)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/pwa/src/
├── lib/map/                      # NEW (generalized from features/offers; via git mv)
│   ├── useMapboxInstance.ts      # moved, API unchanged
│   ├── useMapCamera.ts           # moved + generalized to points: {lat,lng}[]
│   ├── markers.ts                # moved + makeNumberedMarkerEl({label,variant,ariaLabel})
│   ├── colors.ts                 # moved (hslTripletToMapboxColor, resolvePrimaryColor)
│   ├── useGeoJsonLineLayer.ts    # NEW (solid + dashed layers from a FeatureCollection)
│   ├── MapStatusOverlay.tsx      # NEW (error/retry + "no pins" extracted from MapOverlays)
│   ├── bounds.ts                 # moved from src/lib/map-bounds.ts
│   └── index.ts                  # NEW barrel
├── features/offers/              # MODIFY: import from @/lib/map, delete moved files
│   ├── hooks/{useOfferPins,useOfferRoute}.ts
│   ├── components/{OffersMapView,MapOverlays}.tsx
│   └── lib/offers-map/types.ts
└── features/day-plan/
    ├── lib/reorder-draft.ts          # NEW (reorderableIds live, alignOrder, moveItem/Up/Down,
    │                                 #      evaluateDraft→shared evaluateSequence, formatDelta, toViolationMessages)
    ├── hooks/
    │   ├── useReorderDraft.ts        # NEW (draft state, version freeze/discard, STALE)
    │   ├── useSaveDayPlanOrder.ts    # NEW (PUT …/order, conflict handling)
    │   ├── useResetDayPlanOrder.ts   # NEW (POST …/recalculate)
    │   └── useRoutePins.ts           # NEW (stops → pins for the map)
    ├── components/
    │   ├── RouteMapView.tsx          # NEW (lazy map)
    │   ├── RouteMapChip.tsx          # NEW (pin tap chip)
    │   ├── ReorderableStopList.tsx   # NEW (dnd-kit list)
    │   ├── SortableStopRow.tsx       # NEW (handle + arrows + StopCard row)
    │   ├── ReorderControls.tsx       # NEW (up/down arrows)
    │   ├── ReorderSaveBar.tsx        # NEW (sticky save/discard)
    │   ├── RouteSummary.tsx          # MODIFY (local delta/totals)
    │   └── RouteStopList.tsx         # MODIFY (wrapper: static vs reorderable)
    └── pages/RoutePage.tsx           # MODIFY (Segmented List/Map, ?view=)
```

**Structure Decision**: Frontend feature-folder layout. Map primitives are promoted from `features/offers` to a shared `src/lib/map/` so both offers and day-plan consume one map toolkit (Finding 2). Reorder logic lives in `features/day-plan` with pure libs separated from hooks/components so the pure evaluator can be unit-tested without React. `apps/pwa/CLAUDE.md` and root `CLAUDE.md` are updated in this PR (shared-file discipline: 1-line rebase-friendly edits).

## Phase 0 — Research (`research.md`)

Resolves: L-F04-03 variant (Plan A, verified in merged shared code); whether `buildLegOverrides`/`toOptimizerInput` are reimplemented (no — reuse shared); `@dnd-kit` iOS-scroll + a11y configuration; `useGeoJsonLineLayer` two-layer (solid/dashed) approach; bundle-budget measurement + conditional subpath. No NEEDS CLARIFICATION remains.

## Phase 1 — Design & Contracts

- **data-model.md**: client-only state shapes (reorder draft, pin model, violation message) and the consumed `DayPlanResponse`/`routingInput` fields — no DB.
- **contracts/**: pointer to the consumed `INSP` day-plan endpoints (GET / PUT order / POST recalculate / origin / sheet) with the response/error codes the UI handles. No new contract is authored.
- **quickstart.md**: the verification recipe (build/lint/typecheck/test/check:ds, bundle measurement, `style.transform` grep) and the manual QA checklist M1–M4 / R1–R11.
- **Agent context**: update via `.specify/scripts/bash/update-agent-context.sh claude` (adds `@dnd-kit/*`).

## Complexity Tracking

No constitution violations — section intentionally empty.
