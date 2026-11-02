# Implementation Plan: PWA field-event actions on the schedule card

**Branch**: `047-f03-3-checkin-card-actions` | **Date**: 2026-11-02 | **Spec**: `specs/047-f03-3-checkin-card-actions/spec.md`
**Input**: Feature specification from `/specs/047-f03-3-checkin-card-actions/spec.md`

## Summary

Add inspector field-event actions to the PWA (apps/pwa), consuming the already-merged F03-1/F03-2 contracts with **no** backend, schema, route or `api-types` change:

- **Check in / Check out on the schedule card** (two taps, D5): restructure `AppointmentCard` from a single `<button>` into an `<article>` with a navigation target plus an action bar, and extract a shared `useExecutionActions(appointmentId)` hook so the card and `ExecutionPage` write the same IndexedDB `ExecutionState`. The card derives its phase from the **local** `ExecutionState` (`useLocalExecutionState`), since the day-schedule payload carries no server `executionStatus` and backend changes are out of scope.
- **"Can't do this job"** and **"Running late"** sheets (online only, D7) under a new `features/field-events/` folder, posting to `POST /v1/inspector/appointments/:id/cant-do` and `.../late-notice` with a stable per-open `Idempotency-Key`.
- **Server-driven geofence feedback** (03.A2): `GeoLocationCapture` takes a `radiusMeters` prop from the detail's `geofence` (default = shared registry default 300), drops the hard-coded 200 m threshold, and only warns; BLOCK is enforced server-side and surfaced as the 422 message.
- **Permanent queued-START cleanup** (D21/L-F03-02): classify a queued START sync failure as permanent (4xx except 401/408/429; 422 geofence permanent on first response) and clear local state + the chained FINISH so the card returns to "Check in".
- **"You reported…" detail alert** (D28/L-F03-09) from the detail's `lastFieldIssue`.
- `accuracy` + `clientOccurredAt` added to start/finish bodies (online and queued).

## Technical Context

**Language/Version**: TypeScript 5.6 (strict, ES2022 ESM)
**Primary Dependencies**: React 18, Vite 5, React Router 6, TanStack Query 5, Tailwind 3; shared `@properfy/shared` (Zod schemas, enums, `api-types`), `@properfy/frontend-standards` (`cn()`, CVA); IndexedDB (via existing `features/execution/lib/indexeddb.ts`). No new runtime dependency.
**Storage**: IndexedDB only (existing `ExecutionState` + `QueuedAction` stores). No schema change; `payload` is already free-form.
**Testing**: Vitest + React Testing Library (`apps/pwa`, `__tests__` beside source). **Playwright E2E is broken repo-wide (D18)** and no new spec is added — gate is Vitest + `check:ds` + manual QA checklist Q1–Q11.
**Target Platform**: PWA on iOS Safari / Android Chrome (installed + browser).
**Project Type**: Mobile PWA (React SPA) consuming the Properfy `/v1` API.
**Performance Goals**: N/A (interaction-level; no measurable perf target introduced).
**Constraints**: Offline-capable for start/finish (queue); field events are online-only; all "today"/date rules via `useEffectiveTimezone` (never device TZ); `check:ds` forbids off-design-system classes.
**Scale/Scope**: ~1 card component, 2 sheets, 1 extracted hook, 2 field-event hooks, geofence prop plumbing, queue classifier, 1 detail alert. ≤ 150 files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Clean Architecture** — N/A to the PWA layer; the app follows the repo's `features/<name>/{components,hooks,lib,pages,types}` convention. New code lands in `features/field-events/` and extends `features/execution/` and `features/schedule/`. **PASS.**
- **II. Multi-Tenant Safety** — No new entity and no new `tenant_id` decision. The app sends only the inspector JWT; the server scopes every read/write to the inspector's own assignments. Inspector GPS coordinates are **not** rendered to agency roles anywhere — but this is a PWA used only by `INSP`, so no agency-role surface exists here; the consumed `lastFieldIssue`/detail payloads carry no raw coordinates by design. **PASS.**
- **III. TDD** — Red→green→refactor per the "Testes primeiro" list (hooks, card, sheets, capture, queue, detail). Vitest is the real gate (A-D18 documents the broken Playwright suite — a pre-existing repo condition, not a regression introduced here). **PASS, with documented deviation:** Playwright E2E is not run for this task (A-D18); recorded in Spec Assumptions and the Complexity Tracking note below.
- **IV. Contract-First** — Consumes the contracts merged by F03-1/F03-2; adds **no** route and makes **no** contract change. The PWA surfaces the detail through its existing hand-written response type + `mapInspectorAppointmentDetail` adapter (the established PWA pattern), extended with `geofence?`/`lastFieldIssue?` whose shapes mirror the committed shared schemas (`responses.ts`, `inspectorLastFieldIssueSchema`) — no divergence from the contract. **PASS.**
- **V. Simplicity & Minimal Impact** — The only non-trivial restructure (card `<button>` → `<article>` + extracted hook) is mandated by a DOM-correctness bug (button-in-button) and a shared-state hazard (two writers of `ExecutionState`); both are the least change that solves the problem. No feature flags, no speculative abstraction. **PASS.**

**Result: PASS.** One documented testing-tool deviation (Playwright E2E not run, A-D18); not a complexity violation.

## Project Structure

### Documentation (this feature)

```text
specs/047-f03-3-checkin-card-actions/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (client state + consumed contracts)
├── quickstart.md        # Phase 1 output (how to run/verify)
├── contracts/
│   └── consumed-contracts.md   # The F03-1/F03-2 endpoints + shared this task consumes
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/pwa/src/
├── features/
│   ├── schedule/
│   │   ├── components/AppointmentCard.tsx        # restructured: <article> + action bar + menu; phase via useLocalExecutionState
│   │   ├── components/__tests__/AppointmentCard.test.tsx
│   │   ├── types/index.ts                         # + geofence?, lastFieldIssue?, publishedServiceStartAt? on detail/domain types
│   │   ├── lib/adapters.ts                         # mapInspectorAppointmentDetail maps the new fields
│   │   └── pages/AppointmentDetailPage.tsx       # "You reported…" alert + secondary actions
│   ├── execution/
│   │   ├── hooks/useExecutionActions.ts          # NEW: extracted check-in/out logic
│   │   ├── hooks/useStartInspection.ts           # + accuracy + clientOccurredAt
│   │   ├── hooks/useFinishInspection.ts          # + accuracy + clientOccurredAt
│   │   ├── hooks/useOfflineQueue.ts              # permanent-failure classifier (L-F03-02)
│   │   ├── lib/indexeddb.ts                       # purgeAppointmentFromOfflineQueue helper
│   │   ├── components/GeoLocationCapture.tsx      # radiusMeters prop; drop 200 m constant
│   │   ├── components/PreStartPanel.tsx / InProgressPanel.tsx / FinishingPanel.tsx
│   │   └── pages/ExecutionPage.tsx                # consumes useExecutionActions (no visual change)
│   └── field-events/                             # NEW folder
│       ├── components/CantDoSheet.tsx
│       ├── components/LateNoticeSheet.tsx
│       ├── hooks/useReportCantDo.ts
│       ├── hooks/useReportLateNotice.ts
│       └── __tests__/…
└── (router.tsx, BottomNavBar.tsx — not touched by this task)
```

**Structure Decision**: Feature-sliced React PWA. New field-event UI is isolated in `features/field-events/`; the only cross-feature edits are the card (schedule), the execution hooks/panels (execution), and the detail page. `router.tsx`/`BottomNavBar.tsx`/`sw.ts` are **not** touched (no new route; this track owns those files but this task has no reason to change them).

## Complexity Tracking

> Only the documented testing-tool deviation; no architectural complexity violation.

| Item | Why | Simpler alternative rejected because |
|------|-----|--------------------------------------|
| Playwright E2E not run (A-D18) | The PWA Playwright suite is broken repo-wide (`project_pwa_e2e_suite_broken_vacuous`); X03 recovered the harness but this task adds no E2E | Writing new E2E now would be throwaway against a non-gating suite; the Vitest component tests + manual QA checklist cover the journeys |
| Card restructure + `useExecutionActions` extraction | Button-in-button is invalid DOM/a11y; two independent writers of `ExecutionState` is a correctness hazard | Keeping the single-`<button>` card cannot host nested action buttons; duplicating execution logic in the card would drift from `ExecutionPage` |
