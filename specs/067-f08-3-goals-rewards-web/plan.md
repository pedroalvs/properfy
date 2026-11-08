# Implementation Plan: Goals & Rewards web (AM/OP)

**Branch**: `067-f08-3-goals-rewards-web` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/067-f08-3-goals-rewards-web/spec.md`

## Summary

Add the AM/OP web surface for the inspector program (contract 03.6, 03.8, 03.11, 03.13; acceptance 03.A4, 03.A5): a new **Goals & rewards** page (`/goals-rewards`) with Goals and Rewards tabs, a goal create/edit form with Back-button sub-routes, an **Inspector program** section in Platform settings, a derived **Level** column on the F07 Inspector performance page, and a Playwright E2E proving 03.A4. The feature is a **pure consumer** of the merged TASK-F08-1 contract plus the F03 platform-settings and F07 performance endpoints: **no backend route, DB model, or schema change**; the only shared addition is one pure helper, `describeGoal`, in `packages/shared/src/lib/goal-copy.ts`. Technical approach: reuse the existing web primitives (`PageHeader`/`backTo`, `ListFilterTableTemplate`, `DataTable`, `Dialog`, `SelectInput`, `usePlatformSetting`, `status-colors`), fetch all periods from the backend (never compute dates client-side), render all civil dates/instants in `PLATFORM_TIMEZONE`, and enforce access with `AuthGuard roles={[AM, OP]}`.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict, ES2022 ESM), Node.js 24, pnpm 9 + Turborepo
**Primary Dependencies**: React 18, Vite 5, React Router 6, TanStack Query 5, Tailwind 3, `openapi-fetch` (typed by `packages/shared/src/api-types.ts`); shared: Zod 3
**Storage**: N/A (no DB change; consumes platform-scoped entities `InspectorGoal`/`RewardAward`/`GoalPeriodClosure` via AM/OP endpoints)
**Testing**: Vitest 1 + React Testing Library + MSW (unit/component); a11y via explicit ARIA-role/keyboard RTL assertions (the web workspace has **no** axe engine — F05-2/F07-3 precedent); Playwright (E2E, `apps/web/tests/e2e`, API stubbed except the 03.A4 fixture-seeded flow)
**Target Platform**: Modern browsers (Portal Master Admin / web SPA)
**Project Type**: Web application (monorepo `apps/web` + `packages/shared`)
**Performance Goals**: N/A — standard SPA interactivity; no new performance target
**Constraints**: No backend/schema/`api-types` change (regenerate only if CI contract-freshness flags it); all period dates come from the backend in `PLATFORM_TIMEZONE`; browser/user timezone never used for business dates (DR5); PR ≤ 150 changed files; existing dashboards unchanged except the derived Level column on the F07 page
**Scale/Scope**: ~34 files (one new web feature folder, one shared helper, Sidebar/router/platform-settings/F07-page edits, unit + a11y + E2E tests, CLAUDE.md)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | ✅ PASS | No backend module touched. The one shared addition (`describeGoal`) is a pure, I/O-free function with zero dependencies (domain-like). The E2E fixture lives in `apps/backend/src/scripts`, is never registered as a route/worker, and refuses `NODE_ENV=production` (FR-027). |
| II. Multi-Tenant Safety | ✅ PASS (documented exception) | Consumed entities are **platform-scoped (no `tenant_id`)** — the D12 exception to CLAUDE.md §7.1, with precedent (`Inspector`, global `ServiceRegion`, `PlatformSetting`, snapshots). Isolation is by RBAC: `AuthGuard roles={[AM, OP]}` on all routes + no menu item for `CL_*`/`INSP`/`TNT` (Q18). All writes go through audited backend endpoints (03.A5). This web layer adds no new data path, so it cannot widen isolation; it shows no agency/tenant/coordinate data. |
| III. Test-Driven Development | ✅ PASS | Red→green→refactor with Vitest + RTL + MSW for every component/hook, `axe` for a11y, and a mandatory Playwright E2E for 03.A4 (DV5). TZ-dependent tests pin `TZ` away from Sydney. |
| IV. Contract-First APIs | ✅ PASS | No new API surface. Consumes the F08-1 OpenAPI contract (already generated, #1358) + platform-settings + F07 endpoints. The shared `describeGoal` helper lives in `packages/shared` (not duplicated across workspaces) and is built to `dist/` before web consumes it. `api-types.ts` is regenerated only if CI contract-freshness flags drift. |
| V. Simplicity & Minimal Impact | ✅ PASS | Reuses existing primitives; adds no speculative abstraction; changes existing files only where required (Sidebar append, router 3 routes, platform-settings section, F07 Level column); period logic stays server-side (no client date math). |

**Result**: All gates pass. The only constitutional note is the §II platform-scoped exception, which is explicitly sanctioned by the Phase-2 plan (D12) and recorded in the spec and this plan. No entry in Complexity Tracking required.

## Project Structure

### Documentation (this feature)

```text
specs/067-f08-3-goals-rewards-web/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (view-models of consumed entities; no DB change)
├── quickstart.md        # Phase 1 output (build/verify/QA recipe)
├── contracts/           # Phase 1 output
│   ├── consumed-endpoints.md   # F08-1 + platform-settings + F07 routes this feature reads/writes
│   └── describe-goal.md        # Contract of the new shared describeGoal helper
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
└── lib/
    ├── goal-copy.ts            # NEW — describeGoal({ metric, target, scopeLabel })
    └── goal-copy.test.ts       # NEW — unit tests (L-F08-13 fallbacks)

apps/web/src/
├── features/inspector-program/           # NEW feature folder
│   ├── pages/
│   │   ├── GoalsRewardsPage.tsx          # /goals-rewards (tabs Goals | Rewards)
│   │   └── GoalFormPage.tsx              # /goals-rewards/goals/new, /goals-rewards/goals/:goalId
│   ├── components/
│   │   ├── GoalsTab.tsx, RewardsTab.tsx
│   │   ├── GoalFilters.tsx, PeriodSelect.tsx
│   │   ├── ProgramTotals.tsx, GoalSummaryTable.tsx, RewardAwardsTable.tsx
│   │   ├── VoidAwardDialog.tsx
│   │   └── InspectorProgramSettingsSection.tsx
│   ├── hooks/
│   │   ├── useGoals.ts, useGoal.ts, useSaveGoal.ts
│   │   ├── useProgramPeriods.ts, useProgramSummary.ts
│   │   └── useRewardAwards.ts, useRewardAwardAction.ts
│   ├── lib/goal-labels.ts
│   └── __tests__/ (co-located *.test.tsx per component/hook)
├── components/shell/Sidebar.tsx          # EDIT — append "Goals & rewards" as last Dashboard child
├── app/router.tsx                        # EDIT — 3 routes under AuthGuard [AM, OP]
├── lib/status-colors.ts                  # EDIT — REWARD_AWARD_STATUS_MAP (existing tokens)
├── features/platform-settings/pages/PlatformSettingsPage.tsx  # EDIT — mount settings section
└── features/inspector-performance/...    # EDIT — add derived "Level" column

apps/web/tests/e2e/
└── inspector-program-rewards.spec.ts     # NEW — 03.A4 E2E

apps/backend/src/scripts/
└── e2e-inspector-program-fixture.ts      # NEW — dev/test-only fixture for the E2E globalSetup

apps/web/CLAUDE.md                        # EDIT — document feature, menu item, Q12, derived Level column
```

**Structure Decision**: Web application in the existing monorepo. One new self-contained web feature folder (`apps/web/src/features/inspector-program/`) following the sibling `inspector-performance` (F07-3) and `platform-settings` (F03-4) conventions, plus one pure shared helper in `packages/shared/src/lib/`. All other changes are minimal edits to existing shared-ownership files (Sidebar, router, status-colors, PlatformSettingsPage, the F07 page), each of which has a documented append/insert convention to avoid merge conflicts with sibling tasks.

## Complexity Tracking

> No constitutional violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
