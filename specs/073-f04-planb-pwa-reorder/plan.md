# Implementation Plan: F04 Plan B PR-B — PWA reorder via server preview

**Branch**: `073-f04-planb-pwa-reorder` | **Date**: 2026-11-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/073-f04-planb-pwa-reorder/spec.md`

## Summary

Migrate the PWA Route **reorder** off the local matrix recompute onto PR-A's
`POST /v1/inspector/day-plans/:date/order/preview` endpoint. The reorder stops reading
`plan.routingInput` / calling `toOptimizerInput` / `buildLegOverrides` / `evaluateSequence`;
instead a debounced (400 ms) React Query call evaluates the candidate order server-side
(`etaSource: 'MATRIX'`) and returns finish, totals, per-stop ETAs and window violations.
The "+N min vs. suggested" delta is derived from two previews (draft + cached suggested).
Save (`PUT …/order`), reset (`POST …/recalculate`), drift handling and the route **map**
(`plan.geometry`) are unchanged. PWA-only; no shared/backend/api-types change.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node 24; pnpm 9 + Turborepo
**Primary Dependencies**: React 18, Vite 5, React Router 6, TanStack Query 5, @dnd-kit/*
(already present from PR #1334), `@properfy/shared` (consumed from `dist/`)
**Storage**: N/A (TanStack Query cache + existing F03 IndexedDB execution state, read-only here)
**Testing**: Vitest 1 + RTL (unit/component), Playwright (hermetic PWA E2E, Chromium + WebKit)
**Target Platform**: PWA (iOS Safari / Android Chrome), offline-capable shell
**Project Type**: Mobile PWA frontend (apps/pwa) consuming the backend REST `/v1` API
**Performance Goals**: reorder preview debounced 400 ms; ≤ 1 preview request per settled
move (+ ≤ 1 cached suggested-order request per plan version); server limit 30/min/inspector
**Constraints**: no shared contract / backend / api-types change; raw matrix must never reach
the client; entry bundle must not grow (`route-planning` stays out of the eager chunk);
WCAG: reorder remains keyboard- and screen-reader-operable
**Scale/Scope**: ~3–4 stops typical, up to 25 per order (contract); one feature slice in
`apps/pwa/src/features/day-plan` (~10–14 files touched, well under the 150 cap)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture** — N/A to the backend; the PWA keeps its feature-layer split
  (lib = pure, hooks = data/state, components = view). No cross-layer leak introduced.
- **II. Multi-Tenant Safety** — `DayPlan`/`DayPlanStop` are platform-scoped (no `tenant_id`,
  D10 exception, inspector is cross-tenant). The preview endpoint is INSP-only and scoped
  server-side to the caller's own `inspectorId`; the PWA sends no tenant predicate and
  cannot reach another inspector's plan. No GPS/coordinate exposure change (the raw matrix
  is what we are *removing* from the client). **PASS.**
- **III. TDD** — every change is driven red→green (adapt existing day-plan specs to the
  async preview first, add new specs for debounce/superseded/degraded/delta). **PASS.**
- **API contract freshness** — no route schema change, so `openapi.json` / `api-types.ts`
  are untouched (CI `contract-freshness` stays green). **PASS.**
- **Dates/timezones** — per-stop ETAs formatted in each stop's timezone with "~" via the
  existing shared helpers; no `new Date('YYYY-MM-DD')`. **PASS.**

No violations → Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/073-f04-planb-pwa-reorder/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (consumed existing types)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/pwa/src/features/day-plan/
├── api/
│   └── day-plan-keys.ts                 # + orderPreview(date, version, order) key
├── hooks/
│   ├── useReorderDraft.ts               # drop sync evaluateDraft; expose order/version for preview
│   ├── usePreviewDayPlanOrder.ts        # NEW: debounced React Query preview call
│   └── useReorderPreview.ts             # NEW: draft + cached-suggested → finish/delta/violations/etas
├── lib/
│   ├── reorder-draft.ts                 # keep set/move/align/format helpers; remove evaluateDraft + routingInput reads
│   └── reorder-preview.ts               # NEW: pure mappers (PreviewResponse → view model, delta, violation msgs, etas)
└── components/
    ├── RouteSummary.tsx                 # consume preview view model (loading/degraded states)
    ├── ReorderableStopList.tsx          # async ETAs + two-step a11y announcement
    └── ReorderSaveBar.tsx               # delta from preview; save unchanged
```

Tests mirror each touched file under its `__tests__/`. The map (`RouteMapView`,
`useRoutePins`, `src/lib/map/*`) and the save/reset hooks are **not** modified.

**Structure Decision**: Single existing PWA feature slice (`apps/pwa/src/features/day-plan`).
Pure mapping logic lives in `lib/`, the network/debounce in `hooks/`, view wiring in
`components/` — matching the slice's current separation.

## Complexity Tracking

> No constitution violations — section intentionally empty.
