# Implementation Plan: Locked time and per-inspector alert limits (web)

**Branch**: `061-f05-3-locked-time-alerts` | **Date**: 2026-11-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/061-f05-3-locked-time-alerts/spec.md`

## Summary

Web-only closing slice of F05. Add a **"Locked time"** tab to the existing Live Day panel (contract
**01.13**), a **"Live Day alerts"** section to Platform settings (platform default) and to the
inspector detail drawer (per-inspector override) wired to the merged alert-thresholds endpoints
(contract **01.A5**), and the **"Open inspector"** navigation path with an `?open=<id>` deep link on
the inspector list (L-F05-14). It consumes already-merged F05-1 backend contracts and introduces
**no** backend, Prisma, `packages/shared`, or `api-types.ts` change.

**Technical approach**: three feature-local hooks (`useLockedTime`, `useInspectorAlertThresholds`,
and reuse of `usePlatformSetting`) over the existing typed `openapi-fetch` client; new presentational
components composed from existing primitives (`TabsNav`, `SelectInput`, `DataTable`, `EmptyState`,
`Tooltip`, `FormSection`/`DetailRow`); tab/`?open=` state owned by the page (`LiveDayPage`,
`InspectorListPage`) via `useSearchParams` with `replace`; all civil dates via shared helpers in
`PLATFORM_TIMEZONE`.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict, ES2022 ESM), React 18
**Primary Dependencies**: Vite 5, React Router 6 (data router), TanStack Query 5, Tailwind 3,
`openapi-fetch` typed by `@properfy/shared` `paths`, `@properfy/frontend-standards` (`cn`)
**Storage**: N/A (read-only consumer + two existing write endpoints; no client persistence)
**Testing**: Vitest (unit/component, jsdom) + existing Playwright web E2E gate (stubbed)
**Target Platform**: Modern browsers (desktop-first, responsive to tablet/mobile)
**Project Type**: Web SPA (`apps/web`) in a pnpm + Turborepo monorepo
**Performance Goals**: No new polling; locked-time query `staleTime` 60 s, no refetch interval;
override `PUT` invalidates `['live-day']` so the next existing 30 s poll reflects the change
**Constraints**: AM/OP-only; 0 axe violations; full keyboard operability; **no backend / schema /
`packages/shared` / `api-types.ts` change**; no change to `/analytics`, `ConfirmationMeter`, or any
existing dashboard screen (D9, D12); PR < 150 changed files
**Scale/Scope**: ~18 files across `features/live-day`, `features/inspectors`,
`features/platform-settings` (+ tests); one new tab, two new sections, one deep-link param

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | No backend touched. Web keeps feature structure (hooks/components/lib); presentational components stay free of data-fetching except via hooks. |
| II. Multi-Tenant Safety | PASS | `locked-time`/`alert-thresholds` are cross-tenant **AM/OP-only** reads/writes enforced by the merged F05-1 backend (D14 exception: inspector is cross-tenant; `inspectors.alert_overrides_json` has no `tenant_id`). Web enforces AM/OP via route `AuthGuard` + conditional render + disabling the alert-thresholds hook for CL. No new persisted entity → no new `tenant_id` decision. No inspector GPS coordinate surfaces in any consumed contract. |
| III. Test-Driven Development | PASS | TDD red→green→refactor per the task-file test list (`useLockedTime`, `LockedTimeSection`, `LiveDayPanel` additions, `useInspectorAlertThresholds`, `InspectorAlertThresholdsSection`, `PlatformSettingsPage` addition, `LiveDayInspectorDetail`/`InspectorListPage` additions). Vitest; the web E2E CI gate stays green. |
| IV. Contract-First APIs | PASS | Consumes the merged OpenAPI/`api-types.ts` only; **regenerates nothing**. No divergence introduced — a freshness check would be a no-op. Zod validation of the override/settings payloads uses the existing shared schemas. |
| V. Simplicity and Minimal Impact | PASS | Reuses existing primitives and the `usePlatformSetting` plumbing; adds one tab, two sections, one URL param. No new abstraction, no refactor of unrelated code, no dead code. |

**Gate result: PASS — no violations, Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/061-f05-3-locked-time-alerts/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (consumed contracts + view models)
├── quickstart.md        # Phase 1 output (QA / smoke steps)
├── contracts/           # Phase 1 output (consumed, already-merged contracts — reference only)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/web/src/features/live-day/
├── hooks/
│   └── useLockedTime.ts                      # NEW — GET /v1/dashboard/locked-time, key ['locked-time', from, to], staleTime 60s, no poll
├── components/
│   ├── LockedTimeSection.tsx                 # NEW — tab body: period selector, overall meter, by-agency + by-region tables, states
│   ├── LiveDayPanel.tsx                      # EDIT — add TabsNav (Inspectors | Locked time), render LockedTimeSection on the locked tab
│   └── LiveDayInspectorDetail.tsx            # EDIT — "Open inspector" link to /inspectors?open=<id> + helper text (L-F05-14)
├── pages/
│   └── LiveDayPage.tsx                       # EDIT — own tab state via ?tab=locked (replace); keep polling + selection across tab switch
└── lib/
    └── lockedTimeView.ts                     # NEW (if needed) — pure helpers: period→range, region label, sort with "No region" last

apps/web/src/features/inspectors/
├── hooks/
│   └── useInspectorAlertThresholds.ts        # NEW — GET + PUT /v1/inspectors/:id/alert-thresholds; PUT invalidates self + ['live-day']
├── components/
│   ├── InspectorAlertThresholdsSection.tsx   # NEW — read/edit "Live Day alerts" section (AM/OP only), rendered in InspectorDetailSections
│   ├── InspectorDetailSections.tsx           # EDIT — render the section when isAmOp
│   └── InspectorDetailDrawer.tsx             # EDIT (if needed) — "This inspector no longer exists." 404 state
└── pages/
    └── InspectorListPage.tsx                 # EDIT — read ?open=<uuid>, open drawer, clear param on close with replace

apps/web/src/features/platform-settings/
└── components/
    ├── LiveDayAlertsSettingsSection.tsx      # NEW — "Live Day alerts" section via usePlatformSetting('liveDayAlerts')
    └── ... PlatformSettingsPage.tsx          # EDIT — mount the section + include its dirty state in the back-guard

apps/web/CLAUDE.md                            # EDIT — document Locked time (Live Day, not /analytics), the "requires confirmation" definition, and "default + per-field override" limits
```

**Structure Decision**: Web SPA feature-folder layout (`apps/web/src/features/<domain>`). No new
top-level directories; everything composes existing `components/` primitives and the three feature
folders already created by F05-2 / F01-2 / F03-4.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
