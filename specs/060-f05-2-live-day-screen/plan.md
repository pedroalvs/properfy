# Implementation Plan: Live Day screen (web)

**Branch**: `060-f05-2-live-day-screen` | **Date**: 2026-11-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/060-f05-2-live-day-screen/spec.md`

## Summary

Build the `/live-day` web screen (AM/OP) that renders the current working day live: a map with one pin per inspector at their last known location (state encoded in head colour + icon), a side panel with a severity-sorted inspector list (state, progress, delay, alerts, route chips, "Route infeasible" indicator), per-inspector route/stop detail, a date selector anchored on the server's `today`, 30 s polling while the tab is visible, "Show all routes" (capped at 40), a "Needs attention" filter, a "Route ETA accuracy" footer, a collapsible mobile panel, and full WCAG 2.1 AA.

Technical approach: a new lazy feature `apps/web/src/features/live-day/` (hooks + pure selectors + presentational components + page) consuming the already-merged TASK-F05-1 contract and F04 `eta-accuracy`; a new `components/map/RouteLayer.tsx` (the web's first line layer, porting the PWA `useOfferRoute` idempotent add/setData pattern), additive `MapMarker` props, a `components/map/marker-offsets.ts` extraction (import-only change to `AppointmentMapPage`), and a `MapScreenLayout` evolution (`storageKey` + collapsible mobile mode, shared with `/map`). **Zero backend / schema / OpenAPI / `api-types` change.**

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; React 18; Node.js 24; pnpm 9 + Turborepo
**Primary Dependencies**: React 18, Vite 5, React Router 6, TanStack Query 5 (`useQuery`, `keepPreviousData`), Tailwind 3, `mapbox-gl` 3, `openapi-fetch` (typed `api` client), `@properfy/shared`, `@properfy/frontend-standards` (`cn`)
**Storage**: N/A (client reads only; `sessionStorage` for the `MapScreenLayout` panel width via `useResizableWidth`)
**Testing**: Vitest 1 + Testing Library (`api` mocked, `mapbox-gl` mocked with the existing `MapContainer`/`MapMarker` mock), fake timers for polling; a11y verified via explicit ARIA/keyboard-invariant assertions (the web workspace has no axe engine and prior web features shipped without one — no axe dependency is added); no new Playwright E2E required (manual browser QA per spec)
**Target Platform**: Modern browsers (web SPA); responsive from 375 px phone to desktop
**Project Type**: Web application (SPA) — `apps/web` workspace only
**Performance Goals**: 30 s poll never carries undrawn geometry (D18); with 40 routes drawn, pan/zoom stays smooth and a poll re-render is < ~100 ms (QA criterion); polling never moves the camera
**Constraints**: No browser call to any Mapbox API (geometry is pre-built); comma-form HSL only in Mapbox paint (#1302); `bg-x/N` token opacity broken → use `color-mix`; `git diff --stat origin/develop...` < 150 files; lint `--max-warnings 0` (WEB-6)
**Scale/Scope**: One screen; roster up to ~100 inspectors (no clustering); ~40 new files (components/map additions + feature + tests + docs)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture (backend)** — N/A: no backend change. The web layering is respected: pure selectors/formatters in `features/live-day/lib/`, data access in `features/live-day/hooks/` (TanStack Query over the typed `api`), presentation in `features/live-day/components/`, route composition in `pages/`. Reusable map primitives live in `components/map/`. **PASS.**
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — The consumed `live-day`/`eta-accuracy` reads are AM/OP cross-tenant (D14); the page is `AuthGuard roles={[AM, OP]}` and the server enforces the same. The client applies no tenant scoping and never exposes another tenant's data to a pinned role (CL/INSP are denied the route and the menu item). This task adds **no entity**, so it inherits the D14 exception registered by TASK-F05-1 and introduces no new one. No inspector GPS coordinate is shown to CL (CL never reaches this screen). **PASS.**
- **III. TDD (NON-NEGOTIABLE)** — Every unit/component test (RouteLayer, MapMarker additions, marker-offsets move, MapScreenLayout, useLiveDay, useEtaAccuracy, liveDayView selectors, LiveDayPage, LiveDayInspectorDetail, LiveDayLegend, Sidebar, router, a11y invariants) is written red-first before implementation. **PASS.**
- **IV. Contract-First APIs (NON-NEGOTIABLE)** — Consumes the existing contract only; imports Zod types/enums/palette/caps from `@properfy/shared`; regenerates nothing and changes no OpenAPI/`api-types`. **PASS.**
- **V. Simplicity & Minimal Impact** — Lazy feature chunk; reuses existing primitives (DateInput, EmptyState, Tooltip, StatusChip, Button, cn); moves `computeMarkerOffsets` (not a refactor) with an import-only change to `AppointmentMapPage`; `MapScreenLayout` default `storageKey` preserves `/map` behaviour. No speculative abstractions. **PASS.**

**Branching note**: the constitution's older "develop on `staging`" line is superseded by the project CLAUDE.md §12 and the user's standing instruction (`develop → staging → main`). This PR targets **`develop`**. No other deviation. **Complexity Tracking: none.**

## Project Structure

### Documentation (this feature)

```text
specs/060-f05-2-live-day-screen/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (consumed types; no new entity)
├── quickstart.md        # Phase 1 output (run + QA)
├── contracts/           # Phase 1 output (consumed endpoints; no new contract)
│   └── consumed-endpoints.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root) — `apps/web` only

```text
apps/web/src/
├── components/map/
│   ├── RouteLayer.tsx                 # NEW — first web line layer (solid/dashed, comma-HSL, hover popup)
│   ├── RouteLayer.test.tsx            # NEW
│   ├── marker-offsets.ts              # NEW — moved from AppointmentMapPage.tsx:298 (content unchanged)
│   ├── marker-offsets.test.ts         # NEW — cases moved from AppointmentMapPage test
│   ├── MapMarker.tsx                  # EDIT — add headColor/outlineColor/innerText/innerIcon (additive)
│   ├── MapMarker.test.tsx             # EDIT — add cases; existing stay green
│   ├── MapScreenLayout.tsx            # EDIT — storageKey? + collapsible mobile mode (< md)
│   ├── MapScreenLayout.test.tsx       # NEW/EDIT — storageKey + mobile cases; existing stay green
│   └── index.ts                       # EDIT — export RouteLayer, computeMarkerOffsets
├── features/live-day/                 # NEW feature
│   ├── hooks/useLiveDay.ts
│   ├── hooks/useEtaAccuracy.ts
│   ├── hooks/useFrozenOrder.ts
│   ├── lib/liveDayView.ts             # pure selectors/formatters (sortInspectors, canShowAllRoutes, …)
│   ├── components/LiveDayPanel.tsx
│   ├── components/LiveDayInspectorRow.tsx
│   ├── components/LiveDayInspectorDetail.tsx
│   ├── components/LiveDayAlertList.tsx
│   ├── components/LiveDayStopList.tsx
│   ├── components/LiveDayLegend.tsx
│   ├── components/LiveDayStateBadge.tsx
│   ├── components/RouteEtaAccuracyFooter.tsx
│   ├── pages/LiveDayPage.tsx
│   └── *.test.tsx|ts                  # tests alongside each unit
├── app/router.tsx                     # EDIT — add /live-day lazy route (AM/OP)
└── components/shell/Sidebar.tsx       # EDIT — add "Live Day" child after Overview
apps/web/CLAUDE.md                     # EDIT — X00 doc rule (RouteLayer, palette, polling, MapScreenLayout, today)
apps/web/src/features/appointments/pages/AppointmentMapPage.tsx  # EDIT — import computeMarkerOffsets from components/map (only)
```

**Structure Decision**: Web application, single workspace (`apps/web`). Reusable, cross-feature map primitives (RouteLayer, marker-offsets, MapMarker/MapScreenLayout evolutions) live under `components/map/`; everything Live-Day-specific lives under the new lazy `features/live-day/`. The only touch outside these is the one-line import swap in `AppointmentMapPage.tsx`, the router, the Sidebar, and the web CLAUDE.md.

## Complexity Tracking

No constitution violations. Table intentionally empty.
