# Implementation Plan: Inspector Performance Web Page & Reliability Index Settings

**Branch**: `064-f07-3-inspector-performance-page` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/064-f07-3-inspector-performance-page/spec.md`

## Summary

Build the AM/OP **"Inspector performance"** web page (`/inspector-performance`) that renders the F07-2 reliability ranking (03.11) and a per-inspector metric **drawer** (03.12) deep-linked by `?inspector=`, plus a **"Reliability index"** section on the existing "Platform settings" page (03.A1), a Dashboard-menu item (X01 canonical order), and origin-scoped rejection reasons in the `StatusTransitionDialog` (L-F07-01/L-F07-04). The feature is a **pure consumer** of the already-merged F07-1/F07-2 contract: no backend, schema, migration, or `api-types.ts` change. All data comes from `GET /v1/dashboard/inspector-performance[/{inspectorId}]` and `GET/PUT /v1/platform-settings/reliabilityIndex`, typed from `@properfy/shared`.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict, ES2022 ESM); Node.js 24
**Primary Dependencies**: React 18, Vite 5, React Router 6 (`createMemoryRouter` in tests), TanStack Query 5, Tailwind 3, `openapi-fetch` typed by `packages/shared/src/api-types.ts`; `@properfy/shared` and `@properfy/frontend-standards` (consumed from `dist/`)
**Storage**: N/A — no persistence; reads/writes go through the F07-2/F03 HTTP contract
**Testing**: Vitest 1 + React Testing Library + `createMemoryRouter`; injected clock for freshness banners; `TZ` pinned away from Sydney for wall-clock tests
**Target Platform**: `apps/web` SPA (modern browsers), Portal Master Admin / Operations
**Project Type**: Web application (frontend workspace `apps/web`), consuming shared packages
**Performance Goals**: Lazy-loaded route (`Loadable(lazyRetry(...))`); two cached queries (`['reliability','ranking']`, `['reliability','inspector',id]`); **no polling** — freshness reflects reload/invalidation
**Constraints**: WCAG 2.1 AA; lint at zero warnings (no `as any`); **no `api-types.ts`/schema/migration change**; PR < 150 files; shared `Sidebar.tsx` and root `CLAUDE.md` are "keep-all" (whoever merges after F10-2 rebases)
**Scale/Scope**: ~14 source files (page, 6 components, 2 hooks, 2 libs, 1 fixture, 1 settings section) + co-located `*.test.tsx` + 4 minimal edits (`router.tsx`, `Sidebar.tsx`, `PlatformSettingsPage.tsx`, `StatusTransitionDialog.tsx`) + `apps/web/CLAUDE.md` ≈ 30 changed files, well under the 150 cap

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture (NON-NEGOTIABLE)** — PASS. Web-only; follows `apps/web` feature-folder convention (`features/inspector-performance/{pages,components,hooks,lib}`). No backend layer touched; no new ports. Reuses existing primitives (`DataTable`, `DrawerPanel`, `PageHeader`, feedback states, `Tooltip`).
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — PASS. No new entity/query. The data is platform-scoped reliability snapshots (no `tenant_id`, inspectors are cross-tenant — documented exception); isolation is by RBAC: `AuthGuard roles={[AM, OP]}` on the route and `roles` on the menu item; CL/INSP never see scores (D4). No coordinates are rendered (the contract strips them).
- **III. Test-Driven Development (NON-NEGOTIABLE)** — PASS. Every component/hook/lib is written test-first (Vitest + RTL) per the spec's test matrix; fixtures validate against the shared schemas (`schema.parse(fixture)`).
- **IV. Contract-First APIs (NON-NEGOTIABLE)** — PASS. Consumes the committed F07-2 contract; **no** `api-types.ts` regeneration; all types imported from `@properfy/shared`. If a fixture fails `schema.parse`, the fixture is corrected, not the contract.
- **V. Simplicity & Minimal Impact** — PASS. One page covers 03.11 + 03.12; no change to `DashboardPage`/`AnalyticsPage`/`InspectorWorkloadPage` (D5); no "Level" column (F08); shared edits are append-only (menu child) and the dialog option-source swap is minimal.

**Result: PASS — no violations; Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/064-f07-3-inspector-performance-page/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (consumed shapes; no new entity)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (consumed HTTP + UI component contracts)
│   ├── http.md
│   └── ui-components.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/web/src/
├── features/
│   ├── inspector-performance/                 # NEW feature folder
│   │   ├── pages/InspectorPerformancePage.tsx
│   │   ├── components/RankingTable.tsx
│   │   ├── components/NotEnoughDataList.tsx
│   │   ├── components/ReliabilityDrawer.tsx
│   │   ├── components/MetricRow.tsx
│   │   ├── components/MetricFailures.tsx
│   │   ├── components/FreshnessBanners.tsx
│   │   ├── hooks/useReliabilityRanking.ts
│   │   ├── hooks/useInspectorReliability.ts
│   │   ├── lib/format-metric.ts               # UI labels/descriptions/values (premise)
│   │   ├── lib/freshness.ts                    # stale/recompute banner logic (clock-injectable)
│   │   └── __fixtures__/reliability.ts         # fixtures validated against shared schemas
│   ├── platform-settings/
│   │   ├── pages/PlatformSettingsPage.tsx      # EDIT: include the new section
│   │   └── components/ReliabilityIndexSection.tsx  # NEW
│   └── appointments/components/StatusTransitionDialog.tsx  # EDIT: allowedRejectionCodesFrom + hints
├── app/router.tsx                              # EDIT: add guarded /inspector-performance route
└── components/shell/Sidebar.tsx                # EDIT: Dashboard child (canonical X01 order)

apps/web/tests/ (co-located *.test.tsx next to sources, per existing web convention)
apps/web/CLAUDE.md                              # EDIT: document page, deep link, settings section
```

**Structure Decision**: Standard `apps/web` feature-folder layout. The new work is isolated in `features/inspector-performance/`; existing files are edited only minimally and additively (`router.tsx`, `Sidebar.tsx`, `PlatformSettingsPage.tsx`, `StatusTransitionDialog.tsx`, `apps/web/CLAUDE.md`). Tests are co-located `*.test.tsx` matching the existing web convention.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
