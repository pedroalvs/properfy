# Implementation Plan: F03-4 — Field activity, inspector-unable card, platform settings (web)

**Branch**: `048-f03-4-execution-block-web` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/048-f03-4-execution-block-web/spec.md`

## Summary

Web-only slice of F03. It renders already-merged backend contracts: a **Field activity** block on the appointment detail (execution summary + field events, with the CL coordinate cut), an **"Inspector couldn't complete"** card (detail + map modal), new **AuditTimeline** labels/badges, the **INSPECTOR_UNABLE** humanization + manual-dialog exclusion, a new **Platform settings** page (AM/OP) hosting a "Field events" section, and the **rental-tenant portal** hiding the change-time picker when `canChangeTime === false`. No backend, Prisma, or hand-written `api-types.ts` change — only the generated typed client is consumed.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; React 18; Vite 5
**Primary Dependencies**: React Router 6, TanStack Query 5, `openapi-fetch` (typed by `packages/shared/src/api-types.ts`), Tailwind 3, `@properfy/frontend-standards` (`cn()`, CVA), `@properfy/shared` (enums, schemas, `formatReasonCodeLabel`, `PLATFORM_SETTINGS_REGISTRY`, `SYSTEM_ONLY_REJECTION_CODES`, `TRANSITION_SOURCE_*`)
**Storage**: N/A (reads via REST; no client persistence)
**Testing**: Vitest + React Testing Library (unit/component); Playwright (`apps/web/tests/e2e`, all API calls stubbed, CI gate `test-web-e2e`)
**Target Platform**: Modern browsers (web SPA)
**Project Type**: Web frontend (`apps/web`) in a pnpm + Turborepo monorepo
**Performance Goals**: N/A beyond normal SPA responsiveness; field-activity is one cached query per detail
**Constraints**: CL DOM must contain zero inspector coordinates; `Sidebar.tsx` append-only within X01's canonical order; existing dashboards untouched (D11); compact map card opens no modal of its own
**Scale/Scope**: ~1 new page, ~4 new components, ~6 modified components/files, ≤ 150 changed files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture** — N/A to web layer structurally; the feature follows the existing `features/<domain>/{pages,components,hooks,lib,types}` layout. New `features/platform-settings/` mirrors it. **PASS.**
- **II. Multi-Tenant Safety** — No new query; data is read through RBAC-guarded endpoints. The **privacy invariant** (CL sees no raw inspector coordinates) is enforced by the backend payload shape and asserted by a web test that fails if a coordinate key/value reaches a CL DOM. `PlatformSetting` is the documented platform-scoped exception (no `tenant_id`); restated in the spec. **PASS.**
- **III. TDD** — Every component/page/hook is driven red→green by Vitest+RTL tests enumerated in the task file; four Playwright specs added. **PASS (enforced in Phase 2 ordering).**
- **IV. Contract-First APIs** — Consumes the OpenAPI-generated `api-types.ts` only; no hand-edit, no `as any`. If a field is missing the fix is in F03-2, not here. **PASS.**
- **V. Simplicity & Minimal Impact** — Reuse existing primitives (`FormSection`, `DetailRow`, `PageHeader`, `ErrorState`, snackbar, `AuthGuard`, `formatReasonCodeLabel`); one generic `usePlatformSetting(key)` hook rather than a bespoke per-section fetch; append-only Sidebar; no refactors in passing. **PASS.**

No violations → Complexity Tracking left empty.

> Note on constitution §Branching (says "develop on `staging`"): the active project workflow and user instructions (root CLAUDE.md §12, role brief) target `develop` as the PR base. Explicit session/user guidance takes precedence per the constitution's Governance clause. PR targets `develop`.

## Project Structure

### Documentation (this feature)

```text
specs/048-f03-4-execution-block-web/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (consumed view-models)
├── quickstart.md        # Phase 1 output (how to run + QA)
├── contracts/           # Phase 1 output (consumed endpoint contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/web/src/
├── app/
│   └── router.tsx                      # + lazy route "platform-settings" guarded AM/OP
├── components/shell/
│   └── Sidebar.tsx                     # + "Platform Settings" appended to Configuration group
├── features/
│   ├── appointments/
│   │   ├── components/
│   │   │   ├── InspectorIssueCard.tsx          # NEW (full|compact variants)
│   │   │   ├── AppointmentFieldActivitySection.tsx  # NEW
│   │   │   ├── AppointmentDetailSections.tsx   # MOD (render issue card at top)
│   │   │   ├── AppointmentMapDetailPanel.tsx   # MOD (humanize banner + compact card)
│   │   │   ├── AuditTimeline.tsx               # MOD (labels/styles/badges)
│   │   │   ├── StatusTransitionDialog.tsx      # MOD (filter SYSTEM_ONLY_REJECTION_CODES)
│   │   │   └── AppointmentTable.tsx            # (regression only)
│   │   ├── pages/AppointmentDetailPage.tsx     # MOD (mount field-activity section)
│   │   ├── hooks/useAppointmentFieldActivity.ts # NEW
│   │   └── types/index.ts                      # MOD (inspectorIssue view types if needed)
│   ├── platform-settings/                      # NEW feature folder
│   │   ├── pages/PlatformSettingsPage.tsx
│   │   ├── components/FieldEventsSettingsSection.tsx
│   │   └── hooks/usePlatformSetting.ts
│   └── rental-tenant-portal/
│       └── pages/PortalPage.tsx                # MOD (canChangeTime gate)
└── tests/e2e/
    ├── appointment-inspector-issue.spec.ts     # NEW
    ├── appointment-field-activity-cl.spec.ts   # NEW
    ├── platform-settings.spec.ts               # NEW
    └── portal-inspector-unable.spec.ts         # NEW
```

**Structure Decision**: Web frontend only. New components live beside the appointment feature they extend; the settings page gets its own `features/platform-settings/` folder (host for future per-feature sections). No change outside `apps/web/` except consuming generated types already present in `packages/shared`.

## Complexity Tracking

> No constitution violations. Section intentionally empty.
