# Implementation Plan: PWA App Tour (coach marks) with install step, proven by E2E

**Branch**: `055-f04-3b-app-tour` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/055-f04-3b-app-tour/spec.md`

## Summary

Add a self-contained, in-app guided tour (coach marks) to the Properfy Inspector PWA. It opens once on the inspector's first visit to the Today screen after login, walks them through the new navigation and Today surfaces (8 target steps) and an optional install step (9th, only outside standalone), and records completion through the existing F01 app-state heartbeat (`onboardingCompleted: true`) so it never auto-opens again. "Show app tour" in App settings replays it without changing state. The contract criterion `00.A1` is proven by Playwright E2E (E1–E6) over the X03-restored suite; the tour engine, steps, controller and persistence are covered by Vitest/RTL.

**Technical approach**: a bespoke overlay component (portal in `document.body`, spotlight via a large `box-shadow`, anchored balloon positioned by a pure geometry helper, custom focus trap, MutationObserver-backed target resolution) — no tour library and no new dependency. Reads `onboardingCompletedAt` from the existing `useInspectorMe` query (manually typed, `/v1/inspectors/me` has no response schema) and posts the completion via the existing app-state endpoint. Attribute-only `data-tour` edits on the already-shipped navigation and Today components provide the anchors.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict, ES2022 ESM), React 18, Vite 5
**Primary Dependencies**: React, React Router 6, TanStack Query 5, `@properfy/frontend-standards` (z-index/timing/touch constants, `cn()`), `lucide-react` (icons), `@properfy/shared` (schemas, for E2E fixture validation). **No new runtime dependency** (hard requirement FR-016 / `00.2` scope).
**Storage**: Browser `localStorage` only — a per-user local completion record (`properfy.pwa.tourCompletedPending`) used solely to prevent reopen and to retry a failed completion signal. No server storage added (consumes TASK-F04-2's `onboarding_completed_at` read-only).
**Testing**: Vitest + React Testing Library (engine, steps, controller, persistence, fixtures) and Playwright E2E (`apps/pwa/tests/e2e`, 2 phone projects for the tour specs via `skipOnWide`).
**Target Platform**: Mobile-first PWA (iOS Safari 16.4+, Android Chrome), served as a standalone-capable web app.
**Project Type**: Mobile web app (PWA), frontend-only slice of a monorepo.
**Performance Goals**: 60fps overlay; reposition on resize/orientation via `requestAnimationFrame`; no layout thrash (spotlight uses `box-shadow`, not `clip-path`, to avoid iOS repaint cost).
**Constraints**: No backend/schema/API-contract change; no new dependency; all text English ≤ 140 chars; 44px touch targets; respects `prefers-reduced-motion`; safe-area insets honored; fully accessible (focus trap, `inert`, `aria-*`).
**Scale/Scope**: One new feature folder (`features/tour/`), ~5 attribute-only edits to existing components, 1 new E2E spec (+ standalone helper), fixtures extension. ~30 files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Status |
|---|---|---|
| I. Clean Architecture (backend layering) | No — frontend-only, no backend code | N/A |
| II. Multi-Tenant Safety | No new entity/query; consumes platform-scoped `onboarding_completed_at` (TASK-F04-2 recorded the §7.1 exception — inspector is cross-tenant). No tenant data is queried here. | PASS (N/A, exception already recorded upstream) |
| III. Test-Driven Development (NON-NEGOTIABLE) | Yes | PASS — E2E specs + engine/controller unit tests written first (red), then implementation (green). `00.A1` is an E2E gate. |
| IV. Contract-First APIs | No contract change; consumes existing `/v1/inspectors/me` (read) and `/v1/inspectors/me/app-state` (write) unchanged | PASS (no api-types regen) |
| V. Simplicity & Minimal Impact | Yes | PASS — bespoke minimal component, no library, no speculative abstraction; attribute-only edits to shipped components. |
| Tech Stack (no new dependency) | Yes | PASS — FR-016 enforced; verified by `git diff` on `apps/pwa/package.json`. |
| Quality Gates (lint/typecheck/test/build) | Yes | PASS — full PWA gate set + `check:ds` + `test:e2e` run inside the worktree before PR. |
| Commits (Conventional, English, no AI refs) | Yes | PASS — enforced by workflow. |
| Appointment State Machine / Financial / Audit / RBAC | No — none touched | N/A |

**No violations. No Complexity Tracking entries required.**

## Project Structure

### Documentation (this feature)

```text
specs/055-f04-3b-app-tour/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── consumed-apis.md  # Read-only description of consumed (unchanged) endpoints
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/pwa/
├── src/
│   ├── features/
│   │   └── tour/                      # NEW feature folder
│   │       ├── components/
│   │       │   ├── AppTour.tsx        # overlay + spotlight + balloon (portal in body)
│   │       │   ├── AppTourHost.tsx    # mounts controller + AppTour, lives in PwaLayout
│   │       │   ├── InstallStepBody.tsx# platform-adaptive install step content
│   │       │   └── __tests__/AppTour.test.tsx
│   │       ├── hooks/
│   │       │   ├── useAppTourController.ts   # open/record/replay orchestration
│   │       │   ├── useTargetRect.ts          # MutationObserver + resize/scroll/orientation (rAF)
│   │       │   ├── usePrefersReducedMotion.ts
│   │       │   └── __tests__/useAppTourController.test.tsx
│   │       └── lib/
│   │           ├── tour-geometry.ts          # pure: spotlight rect, balloon placement/clamp
│   │           ├── tour-steps.ts             # pure: resolveTourSteps(standalone, ios, canInstall)
│   │           ├── focus-trap.ts             # pure/DOM focus trap helper
│   │           ├── tour-pending-storage.ts   # per-user localStorage record (try/catch)
│   │           └── __tests__/{tour-geometry,tour-steps}.test.ts
│   ├── components/shell/
│   │   ├── BottomNavBar.tsx           # +data-tour on 4 tabs (attribute-only)
│   │   └── PwaLayout.tsx              # mount <AppTourHost/>
│   ├── features/today/components/
│   │   ├── NextInspectionCard.tsx     # +data-tour="today-next"/"today-next-actions"
│   │   ├── ComingUpList.tsx           # (route link anchor if applicable)
│   │   └── TodayHeader.tsx            # (route link anchor if applicable)
│   ├── features/execution/components/
│   │   └── AppointmentActionBar.tsx   # +data-tour="today-more-actions"
│   ├── features/profile/
│   │   ├── hooks/useInspectorMe.ts    # +onboardingCompletedAt field (manual type)
│   │   └── pages/ProfileSettingsPage.tsx  # "Show app tour" MenuRow → replay
│   └── lib/auth-storage.ts            # clear pending key on logout
└── tests/e2e/
    ├── app-tour.spec.ts               # E1–E6 (skipOnWide)
    └── support/
        ├── auth.ts                    # +day-plan default to baseline (prefix route)
        ├── fixtures.ts                # +INSPECTOR_PROFILE(_TOUR_PENDING), DAY_PLAN_TODAY
        └── standalone.ts              # NEW init-script helper to emulate standalone
apps/pwa/src/__tests__/e2e-fixtures.test.ts  # +.strict().parse of new fixtures
apps/pwa/CLAUDE.md                     # +tour section + data-tour convention
```

**Structure decision**: A single new `features/tour/` folder keeps the tour self-contained and lazy-mountable from `PwaLayout` via `AppTourHost`. Pure logic (geometry, step resolution, storage) is isolated from DOM-bound components so it is unit-testable without a layout engine. Existing components receive attribute-only edits.

## Complexity Tracking

No constitutional deviations. No entries.
