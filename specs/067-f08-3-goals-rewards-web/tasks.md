# Tasks: Goals & Rewards web (AM/OP)

**Input**: Design documents from `/specs/067-f08-3-goals-rewards-web/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — TDD is mandatory for this repo (constitution §III; task "Testes primeiro"). Every component/hook/helper gets a red test before its implementation.

**Organization**: by user story (US1 Goals P1, US2 Rewards P1, US3 Settings P2, US4 Level column P3). No backend/DB/api-types change; one shared helper (`describeGoal`).

## Path conventions
- Web feature: `apps/web/src/features/inspector-program/`
- Shared helper: `packages/shared/src/lib/`
- Edited shared-ownership files: `apps/web/src/components/shell/Sidebar.tsx`, `apps/web/src/app/router.tsx`, `apps/web/src/lib/status-colors.ts`, `apps/web/src/features/platform-settings/pages/PlatformSettingsPage.tsx`, the F07 `features/inspector-performance/` ranking table.
- E2E: `apps/web/tests/e2e/`; fixture: `apps/backend/src/scripts/`.

---

## Phase 1: Setup

- [X] T001 Create the feature folder skeleton `apps/web/src/features/inspector-program/` with `pages/`, `components/`, `hooks/`, `lib/` subfolders (empty index/barrels as the sibling `inspector-performance` feature uses).
- [X] T002 Confirm the F08-1 routes exist in `packages/shared/src/api-types.ts` (no `generate:api`) and note the typed `paths` keys for `/v1/inspector-program/*`; do NOT regenerate unless CI contract-freshness flags drift.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the shared helper, navigation, routing, page shell and period selector that BOTH P1 stories depend on.

- [X] T003 [P] Write `packages/shared/src/lib/goal-copy.test.ts` (red) covering the full `describeGoal` matrix in `contracts/describe-goal.md` (every metric, the two deleted-scope fallbacks, scopeLabel ignored for non-scoped metrics).
- [X] T004 Implement `packages/shared/src/lib/goal-copy.ts` (`describeGoal({ metric, target, scopeLabel })`) to green T003; export it from `packages/shared/src/lib/index.ts` and the main barrel; run `pnpm --filter @properfy/shared build`.
- [X] T005 [P] Add `lib/goal-labels.ts` in the feature: period-cycle labels (Weekly/Fortnightly/Monthly), period-option label builder ("Week of Mon 2 Nov 2026" / "Fortnight of …" / "November 2026") and a deterministic Sydney instant formatter ("d MMM yyyy, h:mm a") built from a fixed month array + shared `civilDateInTz` helpers (NOT `@/lib/format-date`, NOT Intl month names — ICU drift). Co-locate `goal-labels.test.ts` (red→green), TZ pinned away from Sydney.
- [X] T006 [P] Write `useProgramPeriods.test.ts` (red): calls `GET /v1/inspector-program/periods` with `{ periodType, direction, count }`; returns typed options; empty/error states.
- [X] T007 Implement `hooks/useProgramPeriods.ts` to green T006 (TanStack Query; typed via `openapi-fetch`).
- [X] T008 [P] Implement `components/PeriodSelect.tsx` (+ test): renders backend period options as labels (via T005), never computes a date; controlled value; used by the form and the Rewards tab.
- [X] T009 Write `Sidebar.roles.test.tsx` additions + `Sidebar.test.tsx` `filterNavItems` test (red, DR6): AM/OP see "Goals & rewards" → `/goals-rewards` as the **last** Dashboard child (assert by label, no `SidebarSubmenu`/`SidebarItem` mocks, `MemoryRouter`); CL_ADMIN/CL_USER/INSP do not; group active on `/goals-rewards/*`; relative order after "Inspector performance".
- [X] T010 Add the menu child to `apps/web/src/components/shell/Sidebar.tsx` Dashboard submenu — `{ icon: 'mdi-trophy-outline', label: 'Goals & rewards', to: '/goals-rewards', roles: [UserRole.AM, UserRole.OP] }` as the last child (X01 canonical order) — to green T009.
- [X] T011 Write `router.test.tsx` additions (red): `/goals-rewards`, `/goals-rewards/goals/new`, `/goals-rewards/goals/:goalId` each under `AuthGuard [AM, OP]`; CL_ADMIN redirected to dashboard.
- [X] T012 Add the 3 routes to `apps/web/src/app/router.tsx` (`Loadable(lazyRetry(...))`, `AuthGuard roles={[AM, OP]}`) to green T011.
- [X] T013 Implement `pages/GoalsRewardsPage.tsx` shell: `PageHeader` "Goals & rewards" + subtitle, the shared `TabsNav` (`role="tablist"`/`role="tab"`, A12) Goals | Rewards, tab state in the URL (`?tab=goals|rewards`), `const BACK_TO = '/goals-rewards?tab=goals'` exported for sub-pages. Co-locate a shell render test (tabs present + switch via click).

**Checkpoint**: navigation, routing, shared copy helper and period selector exist; both P1 stories can proceed.

---

## Phase 3: User Story 1 — Operators define inspector goals (P1)

**Goal**: Goals tab list/filter + goal create/edit/deactivate/reactivate.
**Independent test**: create a goal via the form, see it listed, edit it, deactivate/reactivate it.

- [X] T014 [P] [US1] Write `hooks/useGoals.test.ts` + `hooks/useGoal.test.ts` + `hooks/useSaveGoal.test.ts` (red): list (`GET /goals` with filters), single (`GET /goals/:id`), create (`POST`), update (`PATCH` changed fields only), deactivate/reactivate (`PATCH {active}`); 422/400/409 surfaced.
- [X] T015 [US1] Implement `hooks/useGoals.ts`, `hooks/useGoal.ts`, `hooks/useSaveGoal.ts` to green T014 (typed client; query keys plural-prefixed, e.g. `['inspector-program','goals', ...]`; invalidate on mutation).
- [X] T016 [P] [US1] Write `components/GoalsTab.test.tsx` (red): columns Goal (title + `describeGoal`), Period, Who, Bonus, Runs, Status; Status/Metric/Period filters; empty "No goals yet. Create one to start the program."; error "Couldn't load goals." + "Retry"; row click/Enter opens the form.
- [X] T017 [US1] Implement `components/GoalsTab.tsx` + `components/GoalFilters.tsx` to green T016 (reuse `ListFilterTableTemplate`/`DataTable`; focusable button cell for row activation; Who from scope names; Runs from startsAt/endsAt).
- [X] T018 [P] [US1] Write `pages/GoalFormPage.test.tsx` (red) — create: metric-dependent fields (Region/Service type required; unit + "at least"/"at most"/"points"); Starts from `periods?direction=upcoming&count=13`; Ends "No end date" + period ends; cycle switch reloads+clears; valid POST body exact; 201 → "Goal created" + back to Goals; 422 top message; 400 per-field.
- [X] T019 [P] [US1] Write `pages/GoalFormPage.edit.test.tsx` (red) — edit: metric/period/scope/startsAt disabled ("Create a new goal to change this."); only changed fields sent; Save disabled when unchanged; fixed note "Changes to target and bonus apply from the next period."; `pendingChange` → "From Mon 16 Nov 2026: target 12, bonus $40.00."; Ends only ≥ `minEndsAt`; 422 `GOAL_END_IN_CURRENT_PERIOD` top message; `scopeRegionDeleted` → warning + Reactivate disabled; cumulative advisory (L-F08-04) with self excluded; **edge cases** (spec Edge Cases #1/#2): an inactive goal opened by URL is editable and shows an "Inactive" chip; a non-existent goal id (404) shows "Goal not found" + "Back to goals".
- [X] T020 [P] [US1] Write `pages/GoalFormPage.lifecycle.test.tsx` (red) — deactivate dialog + `PATCH {active:false}` + "Goal deactivated"; reactivate dialog with resume date (from `periods?direction=upcoming&count=2`) + `PATCH {active:true}` + "Goal reactivated"; `resumesOn` → "Counts again from Mon 21 Dec 2026"; Back button `to=BACK_TO`; unsaved changes → "Leave without saving?" via `onBack(goBack)` (P-a/P-b/P-c, P-b as OP).
- [X] T021 [US1] Implement `pages/GoalFormPage.tsx` (create + edit + deactivate/reactivate dialogs + cumulative advisory via `GET /goals?active=true&period=…` client count + Q12 footer copy "Bonuses are reviewed by the Properfy team. Once approved, they're added to the inspector's next invoice." + the Inactive-chip and "Goal not found"/"Back to goals" edge states) to green T018–T020.

**Checkpoint**: full goal-management loop works independently.

---

## Phase 4: User Story 2 — Operators review and settle rewards (P1, 03.A4 headline)

**Goal**: Rewards tab promised×achieved + approve/void; no manual pay.
**Independent test**: with a seeded closed period, see the achieved award in "Achieved", approve it, void it.

- [X] T022 [US2] Add `REWARD_AWARD_STATUS_MAP` to `apps/web/src/lib/status-colors.ts` (PENDING/APPROVED/PAID/VOID → existing tokens; no new token) + a small test asserting it maps every `RewardAwardStatus`.
- [X] T023 [P] [US2] Write `hooks/useProgramSummary.test.ts` + `hooks/useRewardAwards.test.ts` (red): `GET /summary` (periodType+periodStart) and `GET /awards` (filters incl. periodStart/periodType); empty/error.
- [X] T024 [US2] Implement `hooks/useProgramSummary.ts` + `hooks/useRewardAwards.ts` to green T023.
- [X] T025 [P] [US2] Write `hooks/useRewardAwardAction.test.ts` (red): approve (`POST /approve`, `Idempotency-Key`, 409 → message + reload), void (`POST /void` `{reason, inspectorNote?}`); double-click → one request; retry reuses key.
- [X] T026 [US2] Implement `hooks/useRewardAwardAction.ts` to green T025 (one Idempotency-Key per attempt, reused on retry; in-flight guard).
- [X] T027 [P] [US2] Write `components/ProgramTotals.test.tsx` + `components/GoalSummaryTable.test.tsx` (red): tiles Promised (help)/Achieved/Approved/Paid in AUD (`en-AU`); per-goal table Per winner/Participants/Max payout/Achievers/Achieved; skipped → "Skipped (goal inactive)" + "$0.00"; in-progress message; no goals → "No goals ran in this period.".
- [X] T028 [US2] Implement `components/ProgramTotals.tsx` + `components/GoalSummaryTable.tsx` to green T027.
- [X] T029 [P] [US2] Write `components/RewardAwardsTable.test.tsx` (red): columns Inspector (name+email), Goal (`describeGoal`), Result ("62 inspections" vs "96.4%" by `GOAL_METRIC_KIND`), Index at close, Level (`INSPECTOR_LEVEL_LABELS`, "–" when null), Amount, Status (`REWARD_AWARD_STATUS_LABELS` → "Pending review"…), Actions; Approve on PENDING only; Void on PENDING/APPROVED; NO "Mark as paid" in any status; PAID/VOID → no action; action `aria-label` includes inspector name.
- [X] T030 [P] [US2] Write `components/VoidAwardDialog.test.tsx` (red): "Internal reason" required 5–500 (help "Only the Properfy team sees this."), "Note to the inspector (optional)" ≤200 (help "Shown in the inspector's app."); body `{reason, inspectorNote?}`; no "Recovery note" field; `aria-labelledby`.
- [X] T031 [US2] Implement `components/RewardAwardsTable.tsx` + `components/VoidAwardDialog.tsx` to green T029–T030.
- [X] T032 [P] [US2] Write `components/RewardsTab.test.tsx` (red): Cycle (Weekly default) + Period (`periods?direction=past&count=12` + `direction=upcoming&count=1`, current "In progress" on top); URL `?tab=rewards&cycle=…&period=…`; invalid period for cycle → falls back to current; refetches summary + awards; "Reward approved"/"Reward voided" snackbars.
- [X] T033 [US2] Implement `components/RewardsTab.tsx` to green T032 (wires PeriodSelect + totals + summary table + awards table + actions).

**Checkpoint**: 03.A4 reward loop works end-to-end against stubbed data.

---

## Phase 5: User Story 3 — Configure levels & early-offer access (P2)

**Goal**: "Inspector program" section in Platform settings.
**Independent test**: change thresholds/early-access, save, values persist.

- [X] T034 [P] [US3] Write `components/InspectorProgramSettingsSection.test.tsx` (red): "Silver from"/"Gold from"/"Early offer access" switch (off by default)/"Early access window (hours)"/"Minimum level"; Gold ≤ Silver → inline error, no submit; hours outside 1–72 → error; save → `PUT /v1/platform-settings/inspectorProgram` with full object (enabledAt echoed) + "Inspector program settings saved"; enabled → "On since 1 Nov 2026, 11:00 am" (Sydney) + DL8 help; `enabledAt` not an editable field.
- [X] T035 [US3] Implement `components/InspectorProgramSettingsSection.tsx` to green T034 (reuse `usePlatformSetting('inspectorProgram')`, `getFieldErrors`, "Save changes" label).
- [X] T036 [US3] Mount `<InspectorProgramSettingsSection />` in `apps/web/src/features/platform-settings/pages/PlatformSettingsPage.tsx`; update `PlatformSettingsPage.test.tsx` to mock the new section's hook (avoid mockOnce-queue pollution) and assert the section renders.

**Checkpoint**: settings section saves independently.

---

## Phase 6: User Story 4 — Level column on the F07 performance page (P3)

**Goal**: derived "Level" column after "Score".
**Independent test**: Level matches thresholds per score; "–" when setting unavailable.

- [X] T037 [US4] Write the F07 page test addition (red): "Level" after "Score": 88.3→Gold, 70→Silver, 50→Bronze with defaults; thresholds 70/90 → 88.3→Silver; "Not enough data" block has no column; loading/unreadable setting → "–"; no other column changes.
- [X] T038 [US4] Add the derived "Level" column to the F07 `features/inspector-performance/` ranking table using `resolveInspectorLevel(row.score, setting.levels)` + `INSPECTOR_LEVEL_LABELS` and `usePlatformSetting('inspectorProgram')` to green T037 (no backend/response change; no other column touched).

**Checkpoint**: Level column correct; F07 page otherwise unchanged.

---

## Phase 7: Polish & cross-cutting

- [X] T039 [P] a11y: explicit ARIA/keyboard RTL assertions (NOT axe — the web workspace has no axe engine, A11) on GoalsRewardsPage (both tabs), GoalFormPage and the Inspector program settings section — `role="tablist"`/`role="tab"` via shared `TabsNav` (A12), `<th scope>`, action `aria-label` with inspector name, dialog `aria-labelledby`, error `aria-describedby`, no raw ids.
- [X] T040 **Dropped — hermetic E2E (decision).** No backend fixture script: the web E2E suite (the `test-web-e2e` CI gate) stubs *all* API calls, so a `globalSetup` running the F08-1 daily use case against a real DB would break the gate, and an unused fixture is dead code (constitution §V). The 03.A4 spec (T041) stubs a closed period with an achieved award instead; a real-backend "Paid" extension belongs to TASK-F08-6. Recorded in spec §Assumptions and the PR report.
- [X] T041 Write `apps/web/tests/e2e/inspector-program-rewards.spec.ts` (03.A4), **hermetic** (API stubbed, like the whole suite): AM → `/goals-rewards` → "New goal" → save (CRUD proof) → Rewards tab → pick the closed week → award shows "Pending review" + "$30.00" summed into "Achieved" → "Approve" → "Reward approved"; and CL_ADMIN is redirected from `/goals-rewards` (Q18).
- [X] T042 [P] Update `apps/web/CLAUDE.md`: new `inspector-program` feature (Goals & rewards page, goal form, Rewards approve/void), menu item (last Dashboard child), "bonus paid by the inspector invoice (Q12, TASK-F08-6); no manual payment", derived client-side Level column on the F07 page, Inspector program settings section.
- [X] T043 [P] Update `packages/shared/CLAUDE.md`: add `lib/goal-copy.ts` `describeGoal` under the F08 shared entry (consumed by web/pwa/report).
- [X] T044 Full verification inside the worktree (via a subagent returning a condensed summary): `pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared typecheck lint test`; `pnpm --filter web typecheck lint test`; `pnpm --filter web test:e2e -- inspector-program-rewards`; `git diff --stat origin/develop... | tail -1` < 150. Fix any failure and re-run.

---

## Dependencies & order

- **Setup (T001–T002)** → **Foundational (T003–T013)** → stories.
- **US1 (T014–T021)** and **US2 (T022–T033)** both depend only on Foundational; US2 is the 03.A4 headline. They are independent of each other (different files) and could be built in either order; recommended US1 then US2.
- **US3 (T034–T036)** depends on Foundational only.
- **US4 (T037–T038)** depends on Foundational (shared enums/helper + `usePlatformSetting`) only; touches the F07 feature.
- **Polish (T039–T044)**: T041 depends on US1+US2 (and T040 fixture); T039 after the screens exist; T042–T043 after code; T044 last.

## Parallel opportunities
- T003/T005/T006 (different files) in parallel at the start of Foundational.
- Within US1: T014 (hooks tests), T016 (GoalsTab test), T018/T019/T020 (form tests) are [P] (separate files) before their implementations.
- Within US2: T023/T025/T027/T029/T030/T032 test files are [P].
- Across stories: once Foundational is done, US1, US2, US3, US4 are mostly independent (US2 and US4 share only the read-only shared enums).

## MVP
US1 + US2 (both P1) = the operator can define goals and review/approve/void rewards — satisfies 03.6/03.8/03.13/03.A4. US3 (settings) and US4 (Level column) complete 03.7-config and 03.11.
