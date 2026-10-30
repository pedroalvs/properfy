# Implementation Plan: Inspector notices — Web (AM/OP)

**Branch**: `045-f02-2-notices-op-screen` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/045-f02-2-notices-op-screen/spec.md`

## Summary

Build the AM/OP web screen for inspector notices on top of the already-merged F02-1 API:
a list page (`/inspector-notices`) with an Active/Archived/All filter and read counts, a
"New notice" drawer that publishes to three audiences (all active / selected / region) with
a critical ConfirmDialog that shows the SMS-ceiling and night-time notices, and a detail page
(`/inspector-notices/:noticeId`) with per-recipient read receipts, accessibility chips and an
idempotent Archive action. Add the "Inspector notices" child to the Sidebar "Dashboard" group
in the canonical X01 order, register the two routes behind `AuthGuard roles={[AM, OP]}`, and
swap the F01-2 "Push" tooltip copy to the subscription wording (D10).

The feature is web-only: it consumes the F02-1 routes already typed into
`packages/shared/src/api-types.ts` and creates no backend code, no migration, no env, and
does not regenerate `api-types.ts`.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; React 18, Vite 5
**Primary Dependencies**: React Router 6, TanStack Query 5, Zod 3 (shared schemas), `openapi-fetch` typed by `packages/shared/src/api-types.ts`, Tailwind 3, existing web design-system primitives (`DrawerPanel`, `ConfirmDialog`, `DataTable`, `ListFilterTableTemplate`, `PageHeader`/`BackButton`, `FilterSegmented`, `FormField`/`TextInput`/`Textarea`/`SelectInput`/`Checkbox`/`FormActions`, `StatusChip`, `InfoBanner`, `EmptyState`/`ErrorState`/`LoadingState`, `useSnackbar`)
**Storage**: N/A (web consumes the REST API; no browser storage used — jsdom localStorage is unreliable per memory)
**Testing**: Vitest + React Testing Library (unit); no new Playwright E2E (the end-to-end QA is manual in TASK-F02-3). Run the existing web E2E suite in CI mode to prove no regression.
**Target Platform**: modern browsers (Portal Master Admin / operational team); responsive down to phone width (drawer full-screen on mobile)
**Project Type**: web application (`apps/web`), monorepo workspace consuming `packages/shared`
**Performance Goals**: no explicit latency target; platform volume is dozens of inspectors / notices. The detail recipient table renders all rows (no pagination).
**Constraints**: `--max-warnings 0` lint (jsx-a11y included); AA contrast on chips; keyboard-operable clickable rows and widgets; shared `dist/` built before web typecheck; Sydney timezone for all civil date/time display and for the night-time ConfirmDialog phrase (never the browser timezone for business rules)
**Scale/Scope**: ~34 files across `features/inspector-notices/` plus Sidebar + router + the two F01-2 tooltip copy sites; no change to existing dashboard screens.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture (backend)**: N/A — no backend code. Web follows the established
  feature-folder structure (`pages/`, `components/`, `hooks/`, `lib/`, `types/`). ✅
- **II. Multi-Tenant Safety**: `InspectorNotice`/recipient/subscription are platform-scoped
  with **no `tenant_id`** (inspector is cross-tenant) — the documented §7.1 exception recorded
  in F02-1 and restated in the spec. The web screen is AM/OP-only, enforced by the route
  `AuthGuard roles={[AM, OP]}` and the Sidebar child `roles`; the server is the source of
  truth. No agency-scoped data is read. No raw inspector coordinates are involved. ✅
- **III. TDD (NON-NEGOTIABLE)**: every page/component/hook/lib is written test-first (Vitest +
  RTL), per the acceptance tables in the spec. ✅
- **IV. Contract-First APIs**: the web consumes the F02-1 OpenAPI contract via `openapi-fetch`
  and the generated `api-types.ts` already on `develop`; it does **not** edit or regenerate
  the contract. `openapi-fetch` typing caveat (200-only routes type `error` as `never`) is
  handled by reading errors off the status/`response`. Zod validation reuses the shared
  `publishInspectorNoticeSchema`. ✅
- **V. Simplicity**: reuse existing primitives; the only genuinely new building block is a
  form multi-select (no generic form multi-select exists in web today) built as a scoped
  `InspectorMultiSelect`, not a speculative generic abstraction. ✅

No violations → Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/045-f02-2-notices-op-screen/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (consumed view models, no DB)
├── quickstart.md        # Phase 1 output (manual smoke steps)
├── contracts/           # Phase 1 output (consumed endpoints reference)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/web/src/
├── features/inspector-notices/
│   ├── index.ts
│   ├── types/index.ts
│   ├── lib/
│   │   ├── format-audience.ts
│   │   └── critical-confirm-copy.ts
│   ├── hooks/
│   │   ├── useInspectorNoticeList.ts
│   │   ├── useInspectorNoticeDetail.ts
│   │   ├── usePublishInspectorNotice.ts
│   │   ├── useArchiveInspectorNotice.ts
│   │   ├── useActiveInspectorOptions.ts
│   │   ├── useActiveInspectorCount.ts
│   │   └── useActiveRegionOptions.ts
│   ├── components/
│   │   ├── InspectorNoticeTable.tsx
│   │   ├── NewInspectorNoticeDrawer.tsx
│   │   ├── InspectorMultiSelect.tsx
│   │   └── RegionSelect.tsx
│   └── pages/
│       ├── InspectorNoticeListPage.tsx
│       └── InspectorNoticeDetailPage.tsx
├── components/shell/Sidebar.tsx            # add Dashboard child (append, no reorder)
├── app/router.tsx                          # register 2 routes behind AuthGuard[AM,OP]
└── <F01-2 Push tooltip copy sites>         # table column + inspector detail field (D10)
```

**Structure Decision**: Standard `apps/web` feature folder following
`features/service-regions/` and `features/appointments/` conventions (page +
`useServiceRegionList`-style `usePaginatedQuery` hook, `ListFilterTableTemplate` + `DataTable`
for the list, `DrawerPanel` for the form, `PageHeader backTo` for the detail). Each new file
is paired with a colocated `*.test.tsx`/`*.test.ts`. Shared files touched are limited to
`Sidebar.tsx` (append one child, keep canonical X01 order) and `app/router.tsx` (two routes).

## Complexity Tracking

> No constitution violations — intentionally empty.
