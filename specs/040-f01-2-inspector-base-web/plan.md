# Implementation Plan: Web — Inspector base address & app adoption

**Branch**: `040-f01-2-inspector-base-web` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/040-f01-2-inspector-base-web/spec.md`

## Summary

Web-only (`apps/web`) UX for the inspector app-adoption telemetry and base-location display that TASK-F01-1 (merged at `cff52a98`) left unbuilt. **Scope confirmed 2026-10-30 (see spec Clarifications): the create/edit drawer Base Address section is already shipped by F01-1 and is out of scope here.** F01-2 adds: App / Push / Last seen columns and a "No base address" badge + filter to the inspectors table; and "Base address" (read-only location status) + "App adoption" sections to the detail view. All data flows through the already-frozen F01-1 contract and the typed client in `packages/shared/src/api-types.ts` — this feature introduces **no** backend route, Zod schema, migration, or `api-types.ts` change, and does not modify the drawer, `useInspectorSave.ts`, or `lib/address.ts`. TDD throughout (Vitest + RTL for units, one Playwright e2e spec).

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; React 18; Vite 5
**Primary Dependencies**: React Router 6, TanStack Query 5, Tailwind 3, `openapi-fetch` (typed by `packages/shared/src/api-types.ts`), `@properfy/shared` (Zod schemas, `AU_STATES`, `inspectorBaseAddressSchema`), `@properfy/frontend-standards` (`cn()`, CVA)
**Storage**: N/A (consumes the backend API; no client-side persistence)
**Testing**: Vitest + React Testing Library (unit/component), Playwright (e2e, API stubbed)
**Target Platform**: Modern browsers (web SPA — Portal Master Admin / Imobiliaria)
**Project Type**: Web application (monorepo workspace `apps/web`)
**Performance Goals**: N/A beyond normal SPA interactivity; the inspectors table holds dozens of rows, sorted client-side
**Constraints**: `pnpm --filter web lint` runs `--max-warnings 0`; no `as any` on the typed client (memory WEB-10); Sydney timezone for all civil/absolute timestamps via the existing `apps/web/src/lib` helper, independent of browser TZ
**Scale/Scope**: 2 touched areas (table+filters, detail), ~5 modified files + 1 new e2e spec; no new screen, route, or menu item; drawer left untouched (F01-1)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture** — N/A to the frontend layering, but respected in spirit: the shared Zod contract stays the single source of truth; the web consumes it and does not re-derive validation. ✅
- **II. Multi-Tenant Safety** — The `/inspectors` area is AM/OP-only (`router.tsx:373-375`); there is no CL_ADMIN/CL_USER web surface. Inspector privacy (hiding `address`/coordinates from CL roles) is enforced server-side by F01-1. The web never renders raw coordinates (FR-011, memory "no raw ids"). No `tenant_id` decision is made in the web layer; no platform-scoped entity is introduced here. ✅
- **III. Test-Driven Development** — Red→green→refactor. Unit/component tests (Vitest + RTL) for the table, filters, detail sections, and the list hook; one Playwright e2e spec. Tests authored before implementation. ✅
- **IV. Contract-First APIs** — Consumes the OpenAPI-derived types already committed by F01-1. **No contract change originates here**, so no `generate:api` regeneration is expected; if a drift surfaces it is regenerated, never hand-merged (shared-file rule). All new API fields are optional and the UI degrades to "—" when absent (expand/contract consumer side). ✅
- **V. Simplicity & Minimal Impact** — Reuse the existing DataTable sort, tooltip primitives, `FormSection`/`DetailRow`, and the Sydney date helper. No new abstraction. Touch only the table, filters, detail, and the list hook; leave the drawer alone. ✅

**Result: PASS (no violations; Complexity Tracking not required).**

## Project Structure

### Documentation (this feature)

```text
specs/040-f01-2-inspector-base-web/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (view-model / consumed fields)
├── quickstart.md        # Phase 1 output (how to run + verify)
├── contracts/           # Phase 1 output (consumed endpoints + UI contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/web/src/
├── features/inspectors/
│   ├── components/
│   │   ├── InspectorTable.tsx             # + App / Push / Last seen columns + "No base address" badge
│   │   ├── InspectorFilters.tsx           # + "No base address" toggle
│   │   ├── InspectorDetailSections.tsx    # + "Base address" + "App adoption" sections
│   │   ├── InspectorTable.test.tsx
│   │   ├── InspectorFilters.test.tsx
│   │   ├── InspectorDetailSections.test.tsx
│   │   └── __tests__/InspectorDetailSections.test.tsx
│   ├── hooks/
│   │   ├── useInspectorList.ts            # map missingBaseAddress → query param
│   │   └── useInspectorList.test.ts
│   ├── pages/
│   │   ├── InspectorListPage.tsx          # filter empty state
│   │   └── InspectorListPage.test.tsx
│   └── types/index.ts                     # view-model types for the new fields
tests/e2e/
└── inspector-base-address.spec.ts         # NEW Playwright spec (API stubbed)
```

**Structure Decision**: Single workspace (`apps/web`). No new route, page, or menu entry. `Sidebar.tsx` is **not** touched (X01 owns menu order; this feature adds no nav item). The create/edit **drawer** (`InspectorFormDrawer.tsx`, `useInspectorSave.ts`) and `lib/address.ts` are **not** touched — F01-1 owns the drawer base address. Changes are confined to the table, filters, detail sections, the list hook, the view-model types, and one new e2e spec.

## Complexity Tracking

No constitution violations — section intentionally empty.
