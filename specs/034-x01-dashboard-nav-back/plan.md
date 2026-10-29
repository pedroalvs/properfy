# Implementation Plan: Dashboard Sidebar Group and Standard Back Button (X01)

**Branch**: `034-x01-dashboard-nav-back` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/034-x01-dashboard-nav-back/spec.md`

## Summary

A **web-only** navigation change in `apps/web`: (1) gather the three panel screens under one
"Dashboard" sidebar group with a fixed canonical child order and a `collapseIfSingle` behaviour,
exporting `NAV_ITEMS`/`filterNavItems`; (2) add a standard `BackButton` (icon + visible "Back") to
every sub-screen, backed by a corrected `useGoBack` that decides app-history by
`window.history.state.idx` instead of `location.key`; (3) remove the in-header cross-navigation
buttons from the three (frozen) dashboard screens. No backend, no shared API, no data model, no
migration. TDD throughout; one PR targeting `develop`; ~40 files, well under the 150 limit.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict, ESM), React 18  
**Primary Dependencies**: React Router 6.28 (data router), Tailwind 3, `@properfy/frontend-standards` (`cn()`), `@properfy/shared` (`UserRole`), `@mdi/font` icons  
**Storage**: N/A — no persistence change  
**Testing**: Vitest + Testing Library (`@testing-library/react`, `user-event`); `createMemoryRouter`/`createBrowserRouter`/`MemoryRouter`; web E2E (Playwright) unaffected  
**Target Platform**: Modern browsers (web SPA)  
**Project Type**: Web application (frontend workspace `apps/web` only)  
**Performance Goals**: N/A — navigation UI; no new network or compute  
**Constraints**: `pnpm --filter web lint` must pass with `--max-warnings 0`; `PageHeader` must still render outside a router when `backTo` is absent; menu tests must run without `SidebarSubmenu`/`SidebarItem` mocks  
**Scale/Scope**: 3 sidebar children, 1 new component, 1 hook fix, 3 header edits, 15 sub-screens wired, ~40 files total

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | **PASS (N/A)** | Frontend-only; no backend layers touched. |
| II. Multi-Tenant Safety | **PASS** | No business-data query and no entity. The only tenant-adjacent logic is RBAC menu filtering: each child's `roles` mirrors its route `AuthGuard` (SC-002), so the menu never offers a blocked route. No `tenant_id`, no audit surface. |
| III. Test-Driven Development | **PASS** | Red→green per the spec's test tables (`BackButton`, `useGoBack` G1–G5, `PageHeader` H1–H5, `Sidebar.roles` S1–S9, `filterNavItems` F1–F6, and a P-a/P-b/P-c trio per sub-screen). Tests precede implementation. |
| IV. Contract-First APIs | **PASS (N/A)** | No route, no OpenAPI/api-types change; `pnpm generate:api` not run. |
| V. Simplicity & Minimal Impact | **PASS** | Reuses `SidebarSubmenu`, `SidebarItem`, `PageHeader`, `useGoBack`, `ConfirmDialog`; adds exactly one small primitive (`BackButton`). No speculative placeholders for future children; dead cluster-nav code is deleted, not flagged. |

No violations → Complexity Tracking left empty.

**Knowledge classification (constitution §Knowledge Classification):** every FR in the spec is an
APPROVED RULE (closed task decisions L-X01-01…08). The current code state cited in the task
(`useGoBack` key-based, flat Dashboard item, unexported `filterNavItems`) is IMPLEMENTED REALITY,
verified by reading the files. No FUTURE GAP item is promoted into code (future children
F02/F05/F07/F08 are explicitly NOT scaffolded).

## Project Structure

### Documentation (this feature)

```text
specs/034-x01-dashboard-nav-back/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (N/A rationale)
├── quickstart.md        # Phase 1 output (verification/smoke)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

No `contracts/` directory: the feature exposes no external interface (no API, no CLI). Its only
contracts are internal component props, documented in `data-model.md`.

### Source Code (repository root)

```text
apps/web/src/
├── components/
│   ├── shell/
│   │   ├── Sidebar.tsx                 # group item + collapseIfSingle + exports (P1)
│   │   ├── Sidebar.roles.test.tsx      # drop SidebarSubmenu/SidebarItem mocks; S1–S9 (P1)
│   │   └── Sidebar.test.tsx            # filterNavItems F1–F6 over exports (P1)
│   └── layout/
│       ├── BackButton.tsx              # NEW primitive (P3)
│       ├── BackButton.test.tsx         # NEW; B1–B7 (P3)
│       ├── PageHeader.tsx              # backTo + onBack(goBack) (P3)
│       ├── PageHeader.test.tsx         # H1–H5 (P3)
│       ├── index.ts                    # export BackButton (P3)
│       └── templates/
│           └── ListFilterTableTemplate.tsx   # backTo passthrough (P3)
├── hooks/
│   ├── useGoBack.ts                    # history.state.idx criterion (P3.0)
│   └── useGoBack.test.tsx              # G1–G5 (P3.0)
└── features/
    ├── dashboard/pages/DashboardPage(.test).tsx            # remove cluster buttons (P2)
    ├── analytics/pages/AnalyticsPage(.test).tsx            # remove cluster buttons (P2)
    ├── inspector-workload/pages/InspectorWorkloadPage(.test).tsx  # remove cluster buttons (P2)
    ├── appointments/pages/{AppointmentList,Board,Import,Detail}Page(.test).tsx  # (P4)
    ├── properties/pages/{PropertyCreate,PropertyDetail}Page(.test).tsx          # (P5)
    ├── contacts/pages/ContactDetailPage(.test).tsx                              # (P5)
    ├── service-groups/pages/{ServiceGroupList,Create,Detail}Page(.test).tsx     # (P5)
    ├── tenants/pages/TenantDetailPage(.test).tsx                                # (P6)
    ├── integrations/pages/{IntegrationDetail,FyIntegration}Page(.test).tsx      # (P6)
    ├── settings/pages/AccountSettingsPage(.test).tsx                            # (P6)
    └── financial/pages/InvoicesPage(.test).tsx                                  # (P6)
apps/web/CLAUDE.md        # remove N2/N3 transition clauses, record current state (P7.1)
```

**Structure Decision**: Single workspace (`apps/web`). No cross-workspace stacking is needed
because nothing in `packages/shared` or the backend changes. The build order is still
`@properfy/shared` + `@properfy/frontend-standards` → `web` (dist-consumed), already satisfied by
the baseline setup.

## Phase 0 — Research

See [research.md](./research.md). No `NEEDS CLARIFICATION` remained after the spec; the single
non-obvious technical decision (how to detect "app history exists" reliably) is the L-X01-01
`history.state.idx` criterion, documented there with rationale and rejected alternatives.

## Phase 1 — Design & Contracts

- **data-model.md**: no data entities; documents the two UI "contracts" instead — the `NavItem`
  descriptor change (`collapseIfSingle`, optional `clUserPermissions`) and the `BackButton`/
  `PageHeader` prop contracts (`onClick(goBack)` / `onBack(goBack)`).
- **contracts/**: omitted (no external interface).
- **quickstart.md**: the manual smoke script (P7.2) plus the local verification commands.
- **Agent context**: `apps/web/CLAUDE.md` is updated as FR-017 (P7.1) within the implementation,
  not by the generic update script — the web guidance file is the agent context here and the task
  prescribes the exact edits (remove N2/N3 clauses).

## Phase 2 — Task ordering (preview; generated by /speckit.tasks)

Dependency order follows the task's P1→P7 steps: P1 (menu) and P3 (useGoBack+BackButton+PageHeader)
are the foundations; P2 (dashboard headers) depends on P1 being the new nav path; P4/P5/P6 (wire
sub-screens) depend on P3; P7 (docs + smoke) last. P1 and P3 are independent and may be built in
either order; everything is TDD (test file edited red before the implementation file).

## Complexity Tracking

No constitution violations — intentionally empty.
