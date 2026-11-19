# Tasks: Locked time and per-inspector alert limits (web)

**Feature**: `061-f05-3-locked-time-alerts` | **Branch**: `061-f05-3-locked-time-alerts`
**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/consumed-contracts.md`, `quickstart.md`

**Scope**: web-only (`apps/web`). No backend / Prisma / `packages/shared` / `api-types.ts` change.
**TDD**: mandatory — each implementation task is preceded by its failing test (red → green → refactor).
All paths are relative to the repo root (worktree `…/.claude/worktrees/f05-3-locked-time`).

## Phase 1: Setup

- [ ] T001 Confirm the worktree baseline is green before writing code (shared + frontend-standards built, web typecheck + lint pass) — already verified at setup; re-confirm with `pnpm --filter web typecheck` if the tree changed.
- [ ] T002 [P] Seed only the feature-local period constant `LOCKED_TIME_PERIODS = [7, 14, 30] as const` + default `14` in `apps/web/src/features/live-day/lib/lockedTimeView.ts` (same file T003/T004 then fill with helpers under TDD — this task adds no logic, just the shared constant US1 reuses). Skip if T003/T004 are done first; the constant simply lives in that file.

## Phase 2: Foundational

No blocking cross-story foundation is required — US1, US2, and US3 touch disjoint files and are
independently testable. (US3's value builds on US2 conceptually, but the code paths are independent.)
Proceed directly to the user-story phases.

## Phase 3: User Story 1 — Locked time tab (01.13) (Priority: P1)

**Goal**: An AM/OP opens a "Locked time" tab in the Live Day panel and sees the confirmed-share of
tenant-confirmation inspections by agency and region over a 7/14/30-day period anchored on today.

**Independent test**: Open `/live-day`, switch to "Locked time", change period, verify overall /
by-agency / by-region figures, the subtitle range, "No region" ordering, and the empty/error states —
without any alert-limit work.

- [ ] T003 [P] [US1] Write `apps/web/src/features/live-day/lib/lockedTimeView.test.ts` — pure helpers: `periodRange(today, periodDays)` → `{from, to=addCivilDays(from, periodDays-1)}`; `rangeLabel`; `regionLabel(row)` ("North · Ray White" / "North · Platform" when `agencyName null && regionId!==null` / "" for `regionId===null`); `sortByLocked(rows, dir)` keeping `regionId===null` last in both directions; `formatPercent(null)` → "—". (RED)
- [ ] T004 [US1] Implement those helpers in `apps/web/src/features/live-day/lib/lockedTimeView.ts` using shared `addCivilDays`/`formatShortDayLabel` + `PLATFORM_TIMEZONE`. (GREEN)
- [ ] T005 [P] [US1] Write `apps/web/src/features/live-day/hooks/useLockedTime.test.tsx` — key `['locked-time', from, to]`; preset 14 → `from = data.today`, `to = from + 13`; with the Inspectors tab on a past day the range still anchors on `data.today` (L-F05-09); no polling; `staleTime` 60 s. (RED)
- [ ] T006 [US1] Implement `apps/web/src/features/live-day/hooks/useLockedTime.ts` — `GET /v1/dashboard/locked-time?from&to` via the typed `openapi-fetch` client; memoized derived view (root web §13.11). (GREEN)
- [ ] T007 [P] [US1] Write `apps/web/src/features/live-day/components/LockedTimeSection.test.tsx` — loading (2-table skeleton); success (title "Locked time", help "Share of inspections that need the tenant to confirm and are already confirmed.", summary "Overall: 66.7% locked (2 of 3)" + `role="meter"` bar, "By agency" [Agency · Locked · Confirmed / Required] and "By region" [Region · Locked · Confirmed / Required]); `percent null` → "—" + `aria-label "No inspections need confirmation"`; sort on "Locked" with `aria-sort`, "No region" last; Period `SelectInput` 7/14(default)/30 → new query + subtitle "5 Nov – 18 Nov"; region suffix cases (L-F05-13); empty "No inspections need tenant confirmation in this period."; error "We couldn't load locked time." + "Try again"; 1-dp percents. (RED)
- [ ] T008 [US1] Implement `apps/web/src/features/live-day/components/LockedTimeSection.tsx` using `SelectInput`, `DataTable` (compact), `EmptyState`, `Tooltip`, the view helpers, and an overall `role="meter"` bar; per-row Locked cell = thin `aria-hidden` bar + text (research Decision 2). (GREEN)
- [ ] T009 [P] [US1] Write `apps/web/src/features/live-day/components/LiveDayPanel.test.tsx` + `apps/web/src/features/live-day/pages/LiveDayPage.test.tsx` additions — `TabsNav` "Inspectors" (default) / "Locked time"; `?tab=locked` opens the locked tab; switching tabs does not stop live-day polling and does not clear the selection; map pins/routes remain; the "Route ETA accuracy" footer shows on both tabs. (RED)
- [ ] T010 [US1] Add `TabsNav` to `apps/web/src/features/live-day/components/LiveDayPanel.tsx` (accepting `activeTab`/`onTabChange`, rendering `LockedTimeSection` on the locked tab, inspector list/detail otherwise) and own the tab via `?tab=locked` (`useSearchParams`, `replace`) in `apps/web/src/features/live-day/pages/LiveDayPage.tsx`, keeping `useLiveDay`/polling/selection above the tab. (GREEN)
- [ ] T011 [US1] Refactor: dedupe any table/row rendering, confirm referential stability of derived arrays, run `pnpm --filter web test -- live-day` green. (REFACTOR)

**Checkpoint**: Locked time tab fully usable and tested.

## Phase 4: User Story 2 — Live Day alert limits (platform default + per-inspector override) (01.A5) (Priority: P1)

**Goal**: An AM/OP edits the platform-default delay/not-started limits in Platform settings and
overrides either limit per inspector in the drawer; the Live Day reflects the change next cycle.

**Independent test**: Change the default and save; set an inspector override and save; reload the Live
Day and confirm the effective limit the Live Day uses matches.

### Platform default

- [ ] T012 [P] [US2] Write the "Live Day alerts" additions to `apps/web/src/features/platform-settings/pages/PlatformSettingsPage.test.tsx` — section with "Delay alert (min)" 20 / "Not-started alert (min)" 30; help "Applies to every inspector without a custom limit. Changes show on the Live Day within a minute."; 5–240 validation "Enter a value between 5 and 240 minutes."; Save → `PUT /v1/platform-settings/liveDayAlerts` with `{ delayMinutes, notStartedMinutes }` → "Settings saved."; the Field events / Route planning / Tenant arrival notices sections are unchanged. (RED)
- [ ] T013 [US2] Implement `apps/web/src/features/platform-settings/components/LiveDayAlertsSettingsSection.tsx` via `usePlatformSetting('liveDayAlerts')` (two `NumberInput`s, client validation, 400→field errors, snackbar) and mount it in `PlatformSettingsPage.tsx`, including its dirty state in the page back-guard. (GREEN)

### Per-inspector override

- [ ] T014 [P] [US2] Write `apps/web/src/features/inspectors/hooks/useInspectorAlertThresholds.test.tsx` — GET `/v1/inspectors/{id}/alert-thresholds`; `enabled: isAmOp && open`; PUT invalidates `['inspector-alert-thresholds', id]` and `['live-day']`. (RED)
- [ ] T015 [US2] Implement `apps/web/src/features/inspectors/hooks/useInspectorAlertThresholds.ts` (GET + PUT with invalidation). (GREEN)
- [ ] T016 [P] [US2] Write `apps/web/src/features/inspectors/components/InspectorAlertThresholdsSection.test.tsx` — AM/OP sees "Live Day alerts"; CL_ADMIN does not and the hook does not fire; read rows "Delay alert after: 20 min (platform default)"/"15 min (custom)" + "Not-started alert after: 30 min (platform default)"; Edit → 2 numeric fields (5/240/step 1) + "Use platform default ({n} min)" checkbox disabling the field; validation 4/empty-unchecked/decimal → "Enter a value between 5 and 240 minutes."; Save sends `{ delayMinutes:15, notStartedMinutes:null }` → "Alert limits saved." + back to read; 400/500 → server message `role="alert"` + values kept; Cancel/Escape discards; 404 → "This inspector no longer exists."; focus: Edit→first field, Save/Cancel→"Edit". (RED)
- [ ] T017 [US2] Implement `apps/web/src/features/inspectors/components/InspectorAlertThresholdsSection.tsx` (read/edit, `FormSection`/`DetailRow` pattern) and render it in `apps/web/src/features/inspectors/components/InspectorDetailSections.tsx` when `isAmOp` (after existing sections). (GREEN)
- [ ] T018 [US2] Refactor: ensure Escape `stopPropagation()` (don't close the drawer, root web §10), confirm no 403 noise for CL, run `pnpm --filter web test -- inspectors platform-settings` green. (REFACTOR)

**Checkpoint**: 01.A5 configurable end-to-end (default + override), with the Live Day invalidation.

## Phase 5: User Story 3 — Open inspector deep-link (L-F05-14) (Priority: P2)

**Goal**: From the Live Day inspector view, "Open inspector" opens the inspector's drawer at
`/inspectors?open=<id>`; the list opens the drawer from the URL and clears it on close.

**Independent test**: Click "Open inspector"; confirm `/inspectors?open=<id>` opens the drawer; close
clears `open` with `replace`; unknown uuid → 404 state; non-uuid → ignored; row-click still works.

- [ ] T019 [P] [US3] Write `apps/web/src/features/live-day/components/LiveDayInspectorDetail.test.tsx` addition — a `<Link>` "Open inspector" with `href="/inspectors?open=<id>"` and helper "Alert limits for this inspector are set in their profile" below the heading. (RED)
- [ ] T020 [US3] Implement the "Open inspector" link + helper text in `apps/web/src/features/live-day/components/LiveDayInspectorDetail.tsx` (same-tab `<Link>`). (GREEN)
- [ ] T021 [P] [US3] Write `apps/web/src/features/inspectors/pages/InspectorListPage.test.tsx` additions — `?open=<existing id>` opens the drawer for that `inspectorId`; closing removes `open` with `replace`; `?open=<unknown uuid>` (GET 404) → drawer "This inspector no longer exists." (no console error); `?open=abc` (non-uuid) → ignored; existing row-click open still works. (RED)
- [ ] T022 [US3] Implement `?open=<uuid>` handling in `apps/web/src/features/inspectors/pages/InspectorListPage.tsx` (`useSearchParams` init + clear-on-close with `replace`, uuid guard) and the 404 "This inspector no longer exists." state in `apps/web/src/features/inspectors/components/InspectorDetailDrawer.tsx`. (GREEN)
- [ ] T023 [US3] Refactor: unify the row-click and `?open=` open paths into one (both write `open`), run `pnpm --filter web test -- inspectors live-day` green. (REFACTOR)

**Checkpoint**: Navigation path complete; browser Back returns to the Live Day selection.

## Phase 6: Polish & Cross-Cutting

- [ ] T024 [P] Update `apps/web/CLAUDE.md` §12 with the F05-3 decision entry: "Locked time" lives in the Live Day (not `/analytics`), the "requires confirmation" definition, and the alert limits "platform default + per-field override" model; AM/OP-only; `?open=<id>` deep-link + "Open inspector" path.
- [ ] T025 Full web gates inside the worktree via a condensed-summary subagent: `pnpm --filter web typecheck`, `pnpm --filter web lint` (`--max-warnings 0`), `pnpm --filter web test`. Fix any failure and re-run. (Note the known Node26-local `computeTomorrowLabel` flake is not a regression — passes on CI Node24.)
- [ ] T026 Verify no out-of-scope diff (FR-026, FR-027): `git diff --name-only origin/develop...` touches only `apps/web/**`, `specs/061-**`, and the root `CLAUDE.md` speckit section — **nothing** under `apps/backend/`, `apps/backend/prisma/`, or `packages/shared/` (incl. `api-types.ts`), **and nothing** under `apps/web/src/features/analytics/`, `apps/web/src/features/dashboard/`, `apps/web/src/features/inspector-workload/`, nor any `ConfirmationMeter`/`dashboard.routes` file (D9, D12). Verify size: `git diff --stat origin/develop... | tail -1` < 150.
- [ ] T027 Rebase the branch on the latest `origin/develop` immediately before opening the PR to absorb any F01/F07 additions to `InspectorDetailSections`/`InspectorListPage`; re-run T025 gates after the rebase.

## Dependencies & Execution Order

- **Setup (T001–T002)** → before everything.
- **US1 (T003–T011)**, **US2 (T012–T018)**, **US3 (T019–T023)** are independent and may be done in
  priority order (US1 → US2 → US3) or in parallel by file area. US3's acceptance is most meaningful
  after US2 exists, but its code does not depend on US2.
- **Polish (T024–T027)** after all stories.
- Within each story: the test task (RED) precedes its implementation (GREEN), then REFACTOR.

## Parallel Execution Examples

- US1 RED tests in parallel: T003, T005, T007, T009 (distinct files) before their GREEN tasks.
- Across stories (different files): T012 (platform-settings test), T014 (inspectors hook test),
  T019 (live-day detail test) can be written in parallel.
- T002 and the first RED test of each story are all `[P]`.

## MVP

User Story 1 (the "Locked time" tab, 01.13) is the smallest shippable increment — but **both** US1
(01.13) and US2 (01.A5) are mandatory acceptance items for this task, so the PR ships all three
stories together.

## Format validation

All tasks use `- [ ] [TaskID] [P?] [Story?] Description with file path`; Setup/Foundational/Polish
carry no story label; user-story tasks carry `[US1]`/`[US2]`/`[US3]`; every task names a file path.
