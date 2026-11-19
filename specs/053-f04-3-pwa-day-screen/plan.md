# Implementation Plan: F04-3 · PWA Day Screen & Route navigation base

**Branch**: `053-f04-3-pwa-day-screen` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/053-f04-3-pwa-day-screen/spec.md`

## Summary

Build the PWA inspector's new home: a **Today** screen (`/today`) and a **Route** list screen (`/today/route[/:date]`) that render the published `DayPlan` from the already-merged F04-2 contract, swap the bottom bar to **Today / Schedule / Offers / More** (More opens the existing `/profile` hub, URLs unchanged), add the **per-day base** (OriginRow/OriginSheet), the **stop card** (01.5) with role-aware **Call contact** (L-F04-08), the **Navigate** link (01.6, Apple/Google), route-sheet download (01.A6 consumption), and the F02 notice wiring (`/today` on the allowlist + `targetPath '/today'`, DB7). All data is read-only in the PWA; the only backend/shared changes are the `/today` allowlist entry, the two use-case `targetPath` wirings, and the `formatInstantTime` helper. Offline is handled by a single minimal SW cache route (`api-day-plan-cache`) with logout cleanup.

The technical approach is a thin, test-first React/TanStack-Query feature layer over a stable server contract: pure libs (`format-route`, `day-plan-view`, `navigation-url`) first, then hooks (`useDayPlan`, `useDayPlanOrigin`, `useRouteSheetDownload`), then screens/components, then navigation and the F02/SW wiring — each slice red-green-refactor.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24; pnpm 9 + Turborepo
**Primary Dependencies**: React 18, Vite 5, React Router 6 (`createBrowserRouter`/`useMatch`/`useMatches`), TanStack Query 5, Tailwind 3, `openapi-fetch`, lucide-react 0.468, Radix (Sheet/Dialog); `vite-plugin-pwa` (Workbox `injectManifest`, set up by F02-3); shared `@properfy/shared` (dist) and `@properfy/frontend-standards` (dist)
**Storage**: None new. Reads the server `DayPlan`; client state is TanStack Query cache (`gcTime` 24 h, `networkMode: 'offlineFirst'`) + one SW runtime cache `api-day-plan-cache` (NetworkFirst, `maxEntries 3`, `maxAgeSeconds` 12 h, `statuses:[200]`). No `localStorage` for plan data.
**Testing**: Vitest + React Testing Library (unit/component), dependencies injected, fresh `QueryClient` per test, `vi.setSystemTime` with explicit UTC instants; suite also run with `TZ=America/Los_Angeles`; backend Vitest for the two use-case wirings; QA checklist Q1–Q16 in the PR (iOS Simulator + Android/Chrome). No Playwright E2E in this task (DB9: Vitest + RTL + manual QA gate; E2E belongs to F04-3b over the X03-fixed suite).
**Target Platform**: PWA — iOS 16.4+ Safari / standalone, Android Chrome; tablet (iPad landscape, two-pane).
**Project Type**: Monorepo, frontend workspace (`apps/pwa`) consuming `packages/shared`; a one-line allowlist + two backend use-case wirings in `apps/backend`/`packages/shared`.
**Performance Goals**: 60 fps interaction; GET `/v1/inspector/day-plans/:date` is the inspector's own plan (120/min server limit, well above the 30 s staleTime polling); offline reopen served from `api-day-plan-cache` within the 10 s network timeout.
**Constraints**: Offline-capable (cached plan + graceful degradation); civil dates via `todayInTzDateString(effectiveTz)`, instants formatted per `stop.timezone`/`plan.timezone`; a11y (headings in order, `aria-current`, ≥44px targets, no button-in-button); privacy (plan cache holds tenant contact PII → must be in `INSPECTOR_API_CACHES`, cleared on logout, 200-only, short TTL); PR ≤ 150 files; bottom-bar clearance contract must stay green unchanged.
**Scale/Scope**: ~65 files incl. tests (per source estimate), well under 150. Two screens, ~14 new components, 6 hooks/libs, 1 fixture, plus shared/backend/SW edits.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture** — PASS. Frontend feature-sliced (`features/today`, `features/day-plan`); pure libs hold formatting/selection logic with no React/Query coupling; hooks own data access. The two backend edits stay in the application layer (use cases) and add no new dependency direction.
- **II. Multi-Tenant Safety** — PASS. `DayPlan` is a documented platform-scoped, per-inspector entity (no `tenant_id`); the PWA reads only its own plan through INSP endpoints. **Privacy-critical:** the plan carries tenant contact name/phone, so `api-day-plan-cache` is registered in `INSPECTOR_API_CACHES` and deleted on logout (SC-010, QA Q12); only 200 responses are cached. No inspector GPS is exposed to agency roles here (PWA is the inspector's own view). No raw coordinates are logged.
- **III. Test-Driven Development** — PASS. Every lib/hook/component/screen is specified test-first (spec §"Testes primeiro" source; this plan's Phase 1 enumerates the files). Fixtures assert the API shape (`dayPlanResponseSchema.parse(buildDayPlan())`). TZ-dependent tests pin `TZ` away from Sydney.
- **IV. Contract-First APIs** — PASS. No new route schema; the PWA consumes the F04-2 `api-types.ts` as published. The `/today` allowlist entry is a shared constant (append-only), and `formatInstantTime` is a shared util; both have tests. If `api-types.ts` is stale, regenerate via `pnpm generate:api` (never hand-edit).
- **V. Simplicity & Minimal Impact** — PASS. Reuses existing primitives (`Card`, `Sheet`, `Segmented`, `TwoPaneLayout`, `TopBar`, `AppointmentActionBar` extraction, `BaseAddressFields` extraction). No `/profile`→`/more` rename, no redirect, no feature flag, one SW cache route. Out-of-scope items (map, reorder, tour) are explicitly deferred.

**Knowledge classification:** this plan targets IMPLEMENTED REALITY (the merged F04-2 contract, F01-3/F02-3/F03-3 surfaces) and APPROVED RULES (the F04-3 task + accepted lacunas L-F04-02/07/08/13, DB7, F02 D24, X00 L-X00-04). No FUTURE GAP item is promoted into code. **No violations — Complexity Tracking left empty.**

## Project Structure

### Documentation (this feature)

```text
specs/053-f04-3-pwa-day-screen/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (consumed entities)
├── quickstart.md        # Phase 1 output (dev/QA walkthrough)
├── contracts/           # Phase 1 output (consumed endpoint contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── constants/inspector-notices.ts        # append '/today' to INSPECTOR_NOTICE_TARGET_PATTERNS (+ test)
└── utils/format-display-date.ts          # + formatInstantTime(value, timeZone) (+ test, index export)

apps/backend/src/modules/day-plan/application/use-cases/
├── publish-day-plans.use-case.ts         # targetPath: '/today' (+ test)
└── recalculate-day-plan.use-case.ts      # targetPath: '/today' (+ test)
apps/backend/src/modules/inspector-notice/.../publish-system-inspector-notice.use-case.ts  # (test only: '/today' accepted)

apps/pwa/src/
├── app/
│   ├── router.tsx                        # export routes; index/* → /today; today + route/:date; profile unchanged (+ router.test.tsx)
│   └── QueryProvider.tsx                  # (unchanged; referenced)
├── components/shell/
│   ├── BottomNavBar.tsx                   # Today/Schedule/Offers/More; badge → More (+ test)
│   └── PwaLayout.tsx                      # SW listener also invalidates day-plan (+ test)
├── hooks/
│   ├── useApiQuery.ts                     # + apiPut, apiDelete, apiGetBlob
│   └── useAuth.tsx                        # INSPECTOR_API_CACHES += 'api-day-plan-cache' (+ test)
├── sw/
│   ├── runtime-caching.ts                 # + api-day-plan-cache route (+ test)
│   └── push-handlers.ts                   # resolveClickTarget opens /today (+ test)
├── features/
│   ├── today/{pages/{TodayLayout,TodayPage},components/{TodayHeader,NextInspectionCard,ComingUpList,TomorrowRouteCard,UnreadNoticesCard,RouteWarnings},hooks/useCivilToday}  (+ tests)
│   ├── day-plan/{pages/RoutePage, components/{RouteSummary,RouteStopList,RouteLegRow,RouteSheetMenu,OriginRow,OriginSheet,StopCard,CallContactLink,NavigateButton}, hooks/{useDayPlan,useDayPlanOrigin,useRouteSheetDownload}, api/day-plan-keys, lib/{day-plan-view,format-route,navigation-url}, __fixtures__/day-plan}  (+ tests)
│   ├── execution/components/AppointmentActionBar.tsx   # extracted from AppointmentCard (+ adapter stopToActionTarget)
│   ├── profile/{pages/ProfilePage (App settings row), components/BaseAddressFields (extracted)}  (+ tests)
│   ├── schedule/components/PropertyAddressSection.tsx   # uses buildNavigationUrl (+ test)
│   └── auth/pages/LoginPage.tsx           # redirect default '/today' (+ test)
└── apps/pwa/CLAUDE.md                     # routes, api-day-plan-cache, remove N10 "from F04"
```

**Structure Decision**: Feature-sliced PWA layout. New work concentrates in `features/today` (home) and `features/day-plan` (route, stop, origin, data). PWA-nuclear files (`router.tsx`, `BottomNavBar.tsx`, `sw/*`) are touched only here, per the track-C concentration rule. Two deliberate extractions (`AppointmentActionBar`, `BaseAddressFields`) avoid duplicating F03/F01 UI while keeping those screens visually unchanged.

## Complexity Tracking

> No constitution violations. Section intentionally empty.
