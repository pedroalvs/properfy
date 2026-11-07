# Phase 0 Research: Locked time and per-inspector alert limits (web)

All product decisions are already closed in `fase2-etapa1/tarefas/F05-tarefas.md` (D5, D9, D11, D12,
D14) and the 2026-10-29 lacunas (L-F05-09, L-F05-13, L-F05-14). This file records only the few
**implementation** choices with more than one reasonable option, plus the verified realities of the
merged contract. No `NEEDS CLARIFICATION` remained after the clarify pass.

## Verified merged reality (IMPLEMENTED REALITY)

- `GET /v1/dashboard/locked-time`, `GET`/`PUT /v1/inspectors/{inspectorId}/alert-thresholds`, and
  `GET`/`PUT /v1/platform-settings/{key}` are present in `packages/shared/src/api-types.ts` — no
  regeneration needed.
- `lockedTimeResponseSchema`, `updateInspectorAlertThresholdsSchema` (`.strict()`),
  `inspectorAlertThresholdsResponseSchema`, and the `liveDayAlerts` platform-settings key exist in
  `packages/shared/src/schemas/live-day.ts` / `schemas/platform-settings.ts`.
- `liveDayResponseSchema` carries `today` (actor server-side civil today) — the anchor for L-F05-09.
- `apps/web/src/features/live-day/components/LiveDayPanel.tsx` is **presentational** and has **no
  tabs** today; `LiveDayPage` owns data/URL/map. `LiveDayInspectorDetail.tsx` renders the selected
  inspector view.
- `apps/web/src/features/platform-settings/pages/PlatformSettingsPage.tsx` already composes sections
  via `usePlatformSetting(key)`: Field events (F03-4), Route planning (F04-5), Tenant arrival notices
  (F06-1). A new key appends a section without touching the hook/page plumbing.
- `InspectorListPage` opens the drawer from **local state** (`selectedId`/`drawerOpen`); there is no
  URL parameter today. `InspectorDetailDrawer` has tabs `details | availability | ratings`, computes
  `isAmOp`, renders `InspectorDetailSections` in "Details", and today handles only `isLoading` (no
  "not found" state).

## Decision 1 — Tab state ownership and URL parameter

- **Decision**: `LiveDayPage` owns the active tab (`'inspectors' | 'locked'`) derived from
  `?tab=locked` via `useSearchParams`, written with `replace`. `LiveDayPanel` receives
  `activeTab` + `onTabChange` and renders the existing list/detail or `LockedTimeSection`. The
  `useLiveDay` query, its polling, and the selected inspector live above the tab, so switching tabs
  never remounts them.
- **Rationale**: Matches the F05-2 architecture (page owns data/URL/map; panel is presentational) and
  satisfies the test "switching the tab does not stop polling and does not clear the selection".
- **Alternatives rejected**: Local `useState` in the panel (loses deep-linkability and would risk
  remounting the live query); a separate route (D10 — Live Day is one top-level screen; a tab is not
  a sub-screen and needs no Back button).

## Decision 2 — Meter semantics (overall vs per-row)

- **Decision**: The **overall** summary uses a single `role="meter"` bar with `aria-valuenow`,
  `aria-valuemin=0`, `aria-valuemax=100`. Each per-row "Locked" cell shows a thin bar + the "66.7%"
  text; the bar is decorative (`aria-hidden`) and the cell's own text is the accessible value, so
  screen-reader users read the number, not a second meter per row.
- **Rationale**: One meter per visible row would flood assistive tech; the task's test requires the
  `role="meter"` on the summary and a bar + text on the row, which this satisfies without N meters.
- **Alternatives rejected**: `role="meter"` on every row cell (noisy, and `DataTable` cells read the
  text already).

## Decision 3 — Period → civil range, anchored on today (L-F05-09)

- **Decision**: `from = data.today` (the Live Day response's server-side civil today), `to =
  addCivilDays(from, periodDays - 1)`, computed with the shared civil-date helpers. The period is one
  of 7/14/30 (default 14), a feature-local constant unrelated to F00's `mapWindowDays`. The subtitle
  is `formatShortDayLabel(from) – formatShortDayLabel(to)` with no timezone (civil dates). The
  "Inspectors" tab's selected date never feeds the range.
- **Rationale**: L-F05-09 verbatim. Reuses the same `data.today` the panel already reads for the date
  selector and polling.
- **Alternatives rejected**: Anchoring on the selected date (would drift when viewing a past day);
  computing the range in the browser timezone (forbidden by root §9).

## Decision 4 — Region label and "No region" ordering (L-F05-13)

- **Decision**: Region cell = `regionName` + (`agencyName ? ' · ' + agencyName` :
  `regionId === null ? '' : ' · Platform'`). The "No region" row (`regionId === null`) always sorts
  last, independent of the "Locked" sort direction (sort partitions it out, then appends).
- **Rationale**: L-F05-13 verbatim; distinguishes two same-named regions by agency suffix.
- **Alternatives rejected**: Treating `agencyName === null` uniformly as "Platform" (wrong for the
  "No region" row, which must have no suffix) — so the discriminator is `regionId`, not `agencyName`.

## Decision 5 — Override invalidation

- **Decision**: On a successful `PUT /v1/inspectors/:id/alert-thresholds`, invalidate the inspector's
  own `['inspector-alert-thresholds', id]` query **and** `['live-day']`.
- **Rationale**: The task requires the next Live Day poll to use the new limit immediately for the
  editor; the backend recomputes alerts from the stored override, so a cache invalidation (not a
  client recompute) is correct. Acceptable that non-editors see it on their next poll + cache cycle
  (~60 s), as the help text states.
- **Alternatives rejected**: Client-side recompute of alerts (duplicates backend logic; D13/D5 keep
  the threshold logic on the server).

## Decision 6 — `?open=<id>` deep link, invalid uuid, and 404 (L-F05-14)

- **Decision**: `InspectorListPage` reads `?open` via `useSearchParams`. If it is a valid uuid, it
  initialises `selectedId`/`drawerOpen`; a non-uuid is ignored (regex/`z.string().uuid()` guard, no
  drawer). Closing the drawer removes `open` with `replace` (no history entry). A GET that 404s
  surfaces a new `InspectorDetailDrawer` state "This inspector no longer exists." (distinct from
  `isLoading`). The existing row-click open path is preserved; it writes `open` too so both paths are
  one code path.
- **Rationale**: L-F05-14 verbatim; `replace` keeps the browser Back button returning to the Live Day
  with its `?date`/`?inspector` selection intact.
- **Alternatives rejected**: `push` on close (would trap Back on the list); throwing on an unknown id
  (console noise — the task forbids it).

## Decision 7 — Placement of the inspector alert-thresholds section (rebase risk)

- **Decision**: Render `InspectorAlertThresholdsSection` in `InspectorDetailSections` **after** the
  existing sections, guarded by `isAmOp`, following the `FormSection`/`DetailRow` pattern the F01
  sections use. Rebase on `develop` immediately before opening the PR to absorb any F01/F07 section
  additions in the same file (memory "rebase long lived").
- **Rationale**: Matches the task's "after the existing sections" and the drawer's current structure.
- **Alternatives rejected**: A fourth drawer tab (the task wants it inside "Details").

## Testing strategy (TDD)

Red→green→refactor, tests first, per the task-file list: `useLockedTime.test.tsx`,
`LockedTimeSection.test.tsx`, `LiveDayPanel.test.tsx` (additions), `useInspectorAlertThresholds.test.tsx`,
`InspectorAlertThresholdsSection.test.tsx`, `PlatformSettingsPage.test.tsx` (addition),
`LiveDayInspectorDetail.test.tsx` (addition), `InspectorListPage.test.tsx` (additions). a11y is
asserted through explicit ARIA/keyboard invariants in component tests (the web workspace has no axe
engine — consistent with prior F05-2/F09-2 features); the "axe: 0 violations" acceptance item is met
by those invariants + manual QA.
