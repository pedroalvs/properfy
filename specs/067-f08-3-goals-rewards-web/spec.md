# Feature Specification: Goals & Rewards web (AM/OP)

**Feature Branch**: `067-f08-3-goals-rewards-web`
**Created**: 2026-11-08
**Status**: Draft
**Input**: TASK-F08-3 (`fase2-etapa1/tarefas/F08-tarefas.md`) — Web (AM/OP) screens for the inspector program: "Goals & rewards" page (Goals + Rewards tabs), goal form, promised × achieved panel, approve/void with a note to the inspector (no "Mark as paid", Q12), a Dashboard menu item, an "Inspector program" section in Platform settings, a "Level" column on the F07 "Inspector performance" page, and the 03.A4 E2E.

> Contract codes delivered: **03.6, 03.8, 03.11, 03.13** and acceptance criteria **03.A3 (n/a here), 03.A4, 03.A5**. This is the web surface of feature F08 (contract items 03.6–03.10, 03.13–03.15, 03.17).

## Context & constraints

This feature is a **pure consumer** of the already-merged TASK-F08-1 backend/shared contract (PR #1358, on `develop`). It adds **no backend route, no database model, and no schema change**. The only shared addition is one pure, I/O-free helper, `describeGoal`, in `packages/shared/src/lib/goal-copy.ts` (consumed here, and later by the PWA and the program report).

**Multi-tenant exception to root `CLAUDE.md` §7.1 (D12).** The entities this feature displays — `InspectorGoal`, `RewardAward`, `GoalPeriodClosure` — are **platform-scoped: they carry no `tenant_id`**, because an inspector is cross-tenant (precedents: `Inspector`, global `ServiceRegion`, `PlatformSetting`, `InspectorReliabilitySnapshot`). Isolation is guaranteed by RBAC, not by a tenant predicate: the whole feature is AM/OP-only, enforced by `AuthGuard roles={[AM, OP]}`; `CL_ADMIN`, `CL_USER`, `INSP` and `TNT` receive no menu item and are denied every route (Q18). No row carries an agency name, address, or coordinate, and this web surface never renders one. This web task adds no new data path, so it cannot widen that isolation; it only consumes AM/OP endpoints that already enforce it server-side.

**Dates & timezones (DR5).** Every civil period date (`startsAt`, `endsAt`, `periodStart`, `periodEnd`, `minEndsAt`, `resumesOn`, `nextEffectiveFrom`) is produced by the backend in `PLATFORM_TIMEZONE` (`Australia/Sydney`) and is rendered as received — the web never computes or re-derives a period. Instants (`approvedAt`, `paidAt`, `enabledAt`) are displayed in `PLATFORM_TIMEZONE`. The browser timezone and `users.timezone` never enter any calculation or display here.

## Clarifications

### Session 2026-11-08

A structured ambiguity scan across the full taxonomy (functional scope, domain/data, UX flow, non-functional, integration, edge cases, constraints, terminology, completion signals) found **no critical ambiguities requiring a product decision**: the source task (TASK-F08-3) is exhaustive and every acceptance criterion traces to a merged contract. The only inconsistency found was resolved from existing decisions, not by asking:

- Q: The source task still carries pre-Q12 "manual payment" copy (goal-form footer "…Mark them as paid here…" and an acceptance phrase "…marked as paid"), which contradicts the same task's Q12-aligned objective, out-of-scope list and criteria. Which wins? → A: Q12 (decided by the client 2026-10-30). No manual-payment control ships; the bonus settles through the inspector invoice (TASK-F08-6). Footer copy is replaced with Q12-consistent wording. Recorded in **A2** and enforced by **FR-016**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operators define inspector goals (Priority: P1)

An operator (AM or OP) opens **Goals & rewards** from the Dashboard menu, lands on the **Goals** tab, and manages the goals that drive the inspector program: lists and filters existing goals, creates a new goal from a form, edits a goal (with the fields that cannot change after creation locked), and deactivates or reactivates a goal.

**Why this priority**: Without goals there is no program. Defining and maintaining goals is the setup value operators get first, and it is the entry point to the whole feature (contract 03.6, 03.8).

**Independent Test**: With the backend goal endpoints available, an operator can open the Goals tab, create a goal through the form, see it in the list, edit it, and deactivate/reactivate it — delivering a complete goal-management loop on its own.

**Acceptance Scenarios**:

1. **Given** an AM or OP on `/goals-rewards`, **When** the Goals tab loads, **Then** existing goals are listed with columns Goal (title + plain-language description), Period, Who, Bonus, Runs and Status, and Status/Metric/Period filters are available; an empty result shows "No goals yet. Create one to start the program." and a load error shows "Couldn't load goals." with "Retry".
2. **Given** the Goals tab, **When** the operator chooses "New goal", fills a valid goal (e.g. Volume, target 10, Weekly, bonus $30.00, a start period chosen from the backend period list) and submits, **Then** the app sends the exact create payload, shows "Goal created" on 201, and returns to the Goals tab with the new goal listed.
3. **Given** the create form, **When** the metric is "Region volume", **Then** a required "Region" field appears; for "Service type volume" a required "Service type" field appears; for rate metrics the target shows "%" and "at least" (or "at most" for "Can't-do rate"); for the index metric the target shows "points"; and switching the cycle reloads the "Starts" period options and clears the previous choice.
4. **Given** an operator editing a goal that has already started, **When** the form renders, **Then** Metric, Period, scope and "Starts" are disabled ("Create a new goal to change this."), only changed fields are sent on save, Save is disabled when nothing changed, and a fixed note reads "Changes to target and bonus apply from the next period." (with a pending change rendered as "From {EEE d MMM yyyy}: target {n}, bonus {$}." when present).
5. **Given** a goal, **When** the operator deactivates it, **Then** a dialog confirms ("Deactivate this goal? Open periods won't be evaluated and no new rewards will be created."), the app sends `PATCH { active: false }`, and shows "Goal deactivated"; reactivation shows a dialog stating the goal counts again from the next period's start date (from the backend period list) and, on confirm, sends `PATCH { active: true }` and shows "Goal reactivated".
6. **Given** a goal whose scope region was deleted, **When** the form renders, **Then** it warns "This goal's region was deleted. It can't be reactivated." and the "Reactivate goal" action is disabled.
7. **Given** the create/edit form for a weekly goal with two other active weekly goals that could include the same inspectors, **Then** an informational (non-blocking) note reads "Inspectors can earn this on top of 2 other active weekly goals."; with zero such goals no note appears; in edit, the goal being edited does not count itself.

---

### User Story 2 - Operators review and settle earned rewards (Priority: P1)

An operator switches to the **Rewards** tab, chooses a cycle and a closed period, and reviews what the program promised versus what was achieved: summary tiles, a per-goal table, and the list of awards earned by inspectors. The operator approves a pending award and can void a pending or approved award with an internal reason and an optional note shown to the inspector. There is **no manual "Mark as paid"** — an approved bonus is settled through the inspector's invoice (Q12, delivered by TASK-F08-6).

**Why this priority**: This is the contractually tested headline of F08 (03.13 "promised × achieved" + approve/void, proven by the mandatory 03.A4 E2E). It delivers the operator's core recurring workflow.

**Independent Test**: With a period closed by the daily job (seeded by the E2E fixture), an operator can open the Rewards tab, select that period, see the achieved award summed into "Achieved", approve it, and void it — a complete settlement loop, independently demonstrable.

**Acceptance Scenarios**:

1. **(03.A4)** **Given** a goal that was reached and whose period was closed by the daily job, **When** the operator selects that period on the Rewards tab, **Then** the earned award appears for the inspector with its "Pending review" status (the shipped `REWARD_AWARD_STATUS_LABELS` label, see A8) and the achieved amount, the amount is summed into the "Achieved" tile, and the operator can approve it (status becomes "Approved").
2. **(03.13)** **Given** a closed period, **When** the Rewards tab loads, **Then** it shows tiles Promised (help: "The most you could pay if every eligible inspector reached every goal."), Achieved, Approved and Paid in AUD, a per-goal table (Per winner, Participants, Max payout, Achievers, Achieved), and the award list (Inspector name + email, Goal, Result, Index at close, Level, Amount, Status, Actions); the cycle/period selection is reflected in the URL and refetches the summary and awards.
3. **Given** a pending award, **When** any AM/OP operator approves it (DV2), **Then** the app sends approve with an `Idempotency-Key`, updates the row and shows "Reward approved"; a 409 shows "This reward was updated by someone else." and reloads; a double-click sends only one request and a retry reuses the same `Idempotency-Key`.
4. **(L-F08-05)** **Given** a pending or approved award, **When** the operator voids it, **Then** a "Void reward" dialog collects an "Internal reason" (required, 5–500, help "Only the Properfy team sees this.") and an optional "Note to the inspector" (≤ 200, help "Shown in the inspector's app."), sends `{ reason, inspectorNote? }`, and shows "Reward voided".
5. **(Q12)** **Given** any award in any status, **Then** no "Mark as paid" control is shown anywhere; an approved award offers only "Void"; the "Paid" tile reads $0.00 and paid/voided rows offer no action in this feature (post-invoicing void is AM-only, TASK-F08-6).
6. **Given** a period still in progress, **Then** the tiles and table show the message "This period is still open. Rewards are created after it closes."; a period a reactivated goal skipped shows that goal's row as "Skipped (goal inactive)" with Max payout "$0.00"; a period with no goals shows zeroed tiles and "No goals ran in this period."

---

### User Story 3 - Operators configure levels and early-offer access (Priority: P2)

An operator opens **Platform settings** and uses the new **Inspector program** section to set the reliability-score thresholds for the Silver and Gold levels and to configure early-offer access (whether it is on, the window in hours, and the minimum level).

**Why this priority**: The level thresholds drive both the "Level" column (P3 of the contract, US4 here) and the early-access behaviour; they must be configurable, but the program is usable with defaults, so this ranks after the core goal/reward loop.

**Independent Test**: An operator can open the Inspector program settings section, change the thresholds and early-access options, save, and see the saved values persist — independently of the goals and rewards screens.

**Acceptance Scenarios**:

1. **Given** the Platform settings page, **When** the Inspector program section loads, **Then** it shows "Silver from", "Gold from", an "Early offer access" switch (off by default), "Early access window (hours)" and "Minimum level".
2. **Given** the section, **When** Gold ≤ Silver or the window is outside 1–72 hours, **Then** an inline error is shown and nothing is submitted.
3. **Given** valid values, **When** the operator saves, **Then** the app sends the full `inspectorProgram` object to the settings endpoint (echoing `enabledAt` back as received; the server recomputes it) and shows "Inspector program settings saved".
4. **(L-F08-08)** **Given** early access is on, **Then** the section shows "On since {d MMM yyyy, h:mm a}" in Sydney time and the switch help reads "Only offers published after you turn this on are affected. Changing the window applies to offers already published."; `enabledAt` is never an editable field.

---

### User Story 4 - Operators see each inspector's level on the performance page (Priority: P3)

On the existing **Inspector performance** page (F07), an operator sees a new **Level** column so the reliability ranking and the program levels are visible together.

**Why this priority**: It is a small, derived read-only enrichment of an existing page (contract 03.11); valuable but not required for the program to run.

**Independent Test**: With the performance page returning scores, the Level column shows the correct level for each score given the configured thresholds — testable in isolation on that page.

**Acceptance Scenarios**:

1. **(03.11)** **Given** the Inspector performance ranking, **When** the page loads, **Then** a "Level" column after "Score" shows the level derived from the score and the configured thresholds (e.g. with defaults: 88.3 → "Gold", 70 → "Silver", 50 → "Bronze"); changing thresholds to 70/90 makes 88.3 → "Silver".
2. **Given** the page, **Then** the "Not enough data" block has no Level column; while the thresholds setting is still loading, or if it cannot be read, the Level cell shows "–"; no other column on the page changes.

---

### Edge Cases

- Opening an inactive goal by URL: it is editable and shows an "Inactive" chip.
- A non-existent goal id: "Goal not found" with "Back to goals".
- A period with no goals: zeroed tiles plus "No goals ran in this period."
- An award changed by another operator while a dialog is open: 409 → message and reload.
- A period in the URL that is invalid for the selected cycle: falls back to the current period.
- All monetary values formatted with `Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })`.
- The `inspectorProgram` setting unreadable on the performance page: Level column shows "–".
- An award APPROVED before TASK-F08-6: stays "Approved" with no payment action; the Paid tile shows $0.00.
- A reactivated goal whose current period was skipped: Rewards shows that period as "Skipped (goal inactive)"; the form shows "Counts again from …".
- A region-deleted goal: "Who" and the goal description use "a deleted region".
- Leaving a sub-page with unsaved form changes: a "Leave without saving?" confirmation (via the PageHeader back override); "Stay" does not navigate, "Leave" runs the provided back navigation.

## Requirements *(mandatory)*

### Functional Requirements

**Navigation, routing and access (X01 / DR6 / Q18 / D12)**

- **FR-001**: The system MUST add a "Goals & rewards" item (`/goals-rewards`) as the **last** child of the Dashboard sidebar group, preserving the X01 canonical order (Overview · Live Day · Inspector notices · Analytics · Workload · Inspector performance · Goals & rewards); if an earlier neighbour is not yet present at merge time, the item still renders last. Menu presence/absence MUST be asserted by label, not by index or count, and without mocking the submenu/item components.
- **FR-002**: The system MUST expose three routes — `/goals-rewards`, `/goals-rewards/goals/new`, `/goals-rewards/goals/:goalId` — each guarded by `AuthGuard roles={[AM, OP]}`; `CL_ADMIN`, `CL_USER`, `INSP` and `TNT` MUST NOT see the menu item and MUST be denied the routes (redirected per the existing AuthGuard behaviour).
- **FR-003**: Each sub-page (`/goals-rewards/goals/new`, `/goals-rewards/goals/:goalId`) MUST show a Back button in the top-left whose fallback target is `/goals-rewards?tab=goals`; the same fallback constant MUST back both `useGoBack` and the PageHeader `backTo`. With unsaved changes, the back action MUST route through the PageHeader `onBack(goBack)` override and show "Leave without saving?" ("Leave" runs the given back navigation, "Stay" does not navigate).

**Goals tab and goal form (03.6, 03.8)**

- **FR-004**: The Goals tab MUST list goals from the goals endpoint with columns Goal (title + `describeGoal`), Period, Who, Bonus, Runs and Status; provide Status (Active/Inactive/All), Metric and Period filters; show "No goals yet. Create one to start the program." when empty and "Couldn't load goals." + "Retry" on error; and open the form when a row is clicked or activated with Enter.
- **FR-005**: The goal form MUST offer Title, Metric, Target (with the correct unit and "at least"/"at most"), Period, Region (only for Region volume, required), Service type (only for Service type volume, required), Inspector (default "All eligible inspectors"), Bonus (AUD), Starts and Ends; the "Starts" options MUST come from the backend period list (`direction=upcoming`) and "Ends" MUST offer "No end date" plus period ends; switching the cycle MUST reload "Starts" and clear the previous choice.
- **FR-006**: On a valid create, the system MUST send the exact create payload to the create endpoint, show "Goal created" and return to the Goals tab on 201, surface the server message at the top on 422, and show per-field errors on 400 with details.
- **FR-007**: In edit mode, the system MUST disable Metric, Period, scope and "Starts" ("Create a new goal to change this."), send only changed fields, disable Save when nothing changed, and show the fixed note "Changes to target and bonus apply from the next period."; a pending target/bonus change MUST render as "From {EEE d MMM yyyy}: target {n}, bonus {$}.".
- **FR-008**: "Ends" MUST offer only period ends ≥ `minEndsAt`; a 422 `GOAL_END_IN_CURRENT_PERIOD` MUST surface the server message at the top.
- **FR-009**: Deactivate MUST confirm via a dialog and send `PATCH { active: false }` ("Goal deactivated"); Reactivate MUST confirm via a dialog that states the resume date (the next period's start, from the backend period list) and send `PATCH { active: true }` ("Goal reactivated"); a goal carrying `resumesOn` MUST show "Counts again from {EEE d MMM yyyy}".
- **FR-010**: A goal whose scope region was deleted MUST warn "This goal's region was deleted. It can't be reactivated." and disable the "Reactivate goal" action.
- **FR-011**: The form MUST show a non-blocking advisory "Inspectors can earn this on top of {n} other active {weekly|fortnightly|monthly} goals." computed on the client from the active goals of the same cycle (no new route); with zero such goals no advisory appears, and in edit the goal being edited is excluded from the count.

**Rewards tab (03.13, 03.A4)**

- **FR-012**: The Rewards tab MUST provide a Cycle selector (Weekly default) and a Period selector whose options come from the backend (`direction=past` for closed periods plus the current "In progress" period on top); the cycle/period selection MUST be reflected in the URL and MUST refetch the summary and the awards.
- **FR-013**: The Rewards tab MUST show tiles Promised (with the help text), Achieved, Approved and Paid in AUD, a per-goal table (Per winner, Participants, Max payout, Achievers, Achieved), and the award list with columns Inspector (name + email), Goal, Result, Index at close, Level, Amount, Status and Actions.
- **FR-014**: Any AM/OP operator MUST be able to approve a pending award; approval MUST send an `Idempotency-Key`, update the row and show "Reward approved"; a 409 MUST show "This reward was updated by someone else." and reload; a double-click MUST send only one request and a retry MUST reuse the same `Idempotency-Key`.
- **FR-015**: Void MUST be offered on pending and approved awards only; the "Void reward" dialog MUST collect a required "Internal reason" (5–500, help "Only the Properfy team sees this.") and an optional "Note to the inspector" (≤ 200, help "Shown in the inspector's app."), send `{ reason, inspectorNote? }`, and show "Reward voided".
- **FR-016**: The system MUST NOT render any manual-payment control in any award status (Q12); an approved award MUST offer only "Void"; the "Paid" tile MUST read $0.00 and paid/voided rows MUST offer no action in this feature.
- **FR-017**: An in-progress period MUST show "This period is still open. Rewards are created after it closes."; a goal skipped in the selected period MUST show as "Skipped (goal inactive)" with Max payout "$0.00"; a period with no goals MUST show zeroed tiles and "No goals ran in this period.".

**Inspector program settings (D2, D3, L-F08-08)**

- **FR-018**: The Platform settings page MUST include an "Inspector program" section with "Silver from", "Gold from", an "Early offer access" switch (off by default), "Early access window (hours)" and "Minimum level".
- **FR-019**: The section MUST reject, inline and without submitting, Gold ≤ Silver and a window outside 1–72 hours; a valid save MUST send the full `inspectorProgram` object (echoing `enabledAt` back as received) and show "Inspector program settings saved".
- **FR-020**: When early access is on, the section MUST show "On since {d MMM yyyy, h:mm a}" in Sydney time and the help "Only offers published after you turn this on are affected. Changing the window applies to offers already published."; `enabledAt` MUST NOT be an editable field.

**Level column (03.11)**

- **FR-021**: The Inspector performance page MUST show a "Level" column after "Score", derived on the client from the row's score and the configured thresholds (`resolveInspectorLevel` + `INSPECTOR_LEVEL_LABELS`); the "Not enough data" block MUST NOT have the column; while the thresholds setting is loading or if it cannot be read, the cell MUST show "–"; no other column on that page may change, and no backend/response change is introduced.

**Shared helper**

- **FR-022**: `packages/shared/src/lib/goal-copy.ts` MUST export `describeGoal({ metric, target, scopeLabel })` (with `scopeLabel: string | null`) producing the plain-language goal description, including the deleted-scope fallbacks ("… in a deleted region", "… inspections of a deleted service type") for null scope labels on the two scoped volume metrics, and ignoring `scopeLabel` for the other metrics.

**Cross-cutting**

- **FR-023 (03.A5 audit)**: Every write (create, update, deactivate, reactivate, approve, void) MUST go through the audited backend endpoints; the web MUST NOT mutate program state by any path that bypasses them.
- **FR-024 (dates, DR5)**: All civil period dates MUST come from the backend in `PLATFORM_TIMEZONE` and be rendered as received; instants (`approvedAt`, `paidAt`, `enabledAt`) MUST be displayed in `PLATFORM_TIMEZONE`; the browser timezone and `users.timezone` MUST NOT enter any calculation or display.
- **FR-025 (status colours)**: Award statuses MUST map to existing status colour tokens (`REWARD_AWARD_STATUS_MAP` in `status-colors.ts`); no new colour token is introduced.
- **FR-026 (a11y, WCAG 2.1 AA)**: The new screens MUST meet WCAG 2.1 AA, asserted via explicit ARIA-role and keyboard-interaction tests (the web workspace has **no** `axe` engine — see A11): the Goals/Rewards tabs MUST use the shared `TabsNav` (`role="tablist"`/`role="tab"`), consistent with the app's other tabbed pages (A12); data tables MUST render through the shared `DataTable` primitive (any bespoke table uses semantic `<th>` with `scope`); action controls MUST carry an `aria-label` including the inspector's name (e.g. "Approve reward for Jane Doe"); selects/comboboxes MUST be the shared keyboard-accessible primitives (`SelectInput`); dialogs MUST use `aria-labelledby` and errors `aria-describedby`; no raw ids may appear in the UI.
- **FR-027 (E2E, DV5)**: The system MUST include a Playwright E2E (`apps/web/tests/e2e/inspector-program-rewards.spec.ts`) proving 03.A4; its backend fixture script MUST live in `apps/backend/src/scripts`, MUST NOT be reachable over HTTP or registered as a route/worker, and MUST refuse to run with `NODE_ENV=production`.

### Key Entities *(consumed, not defined here)*

- **InspectorGoal** *(platform-scoped, no `tenant_id`)*: a program goal (metric, comparator, target, period cycle, optional scope — region / service type / inspector, bonus amount, start/optional end, active flag, pending next-period changes, resume date). Displayed and edited here; defined by TASK-F08-1.
- **RewardAward** *(platform-scoped, no `tenant_id`)*: a bonus a specific inspector earned on a specific goal in a specific closed period (result value, index at close, level at close, amount, status PENDING/APPROVED/PAID/VOID, scope label snapshot). Listed and acted on here.
- **GoalPeriodClosure** *(platform-scoped, no `tenant_id`)*: the record of a goal's period being closed (participants, promised/achieved, skipped-inactive marker). Summarised in the per-goal table.
- **Inspector program platform setting** (`inspectorProgram`): level thresholds and early-offer-access config, read/written via the platform-settings endpoint; also read on the performance page for the Level column.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (03.A4)**: A goal reached and closed by the daily job appears in the Rewards panel for its period, is summed into "Achieved", and can be approved — proven by the passing Playwright E2E `inspector-program-rewards.spec.ts`.
- **SC-002 (03.13)**: For every closed period, operators can read promised versus achieved and act on awards: 100% of pending awards expose "Approve", 100% of pending/approved awards expose "Void" with an internal reason and optional inspector note, and no manual-payment control appears in any status.
- **SC-003 (03.11)**: On the performance page, the Level shown matches the configured thresholds for every score across the Bronze/Silver/Gold boundaries (and shows "–" when the setting is unavailable).
- **SC-004 (Q18)**: No `CL_ADMIN`, `CL_USER`, `INSP` or `TNT` user can reach any `/goals-rewards` route or see the menu item — zero leaks, verified by the router test and the E2E denied-access check.
- **SC-005 (X01/DR6)**: Each sub-page has a working Back button (fallback `/goals-rewards?tab=goals`, with the unsaved-changes confirmation), and the menu item is the last Dashboard child — verified by label, without mocking the submenu/item components.
- **SC-006 (a11y)**: Explicit a11y test invariants pass on the Goals & rewards page, the goal form, and the Inspector program settings section — `role="tablist"`/`role="tab"` via the shared `TabsNav`, `<th scope>` headers, action `aria-label`s carrying the inspector name, dialog `aria-labelledby`, error `aria-describedby`, and no raw ids (asserted in RTL, not via axe — A11).
- **SC-007**: The feature introduces no backend route, model or schema change, and no `api-types.ts` change (regeneration only if CI contract-freshness requires it); the PR stays within the 150-changed-file limit.

## Assumptions

- **A1 — Dependencies merged.** TASK-F08-1 (#1358), TASK-X01-1 (Sidebar canonical order + Back button), TASK-F03-4 (Platform settings page + `usePlatformSetting`), and TASK-F07-3 (Inspector performance page) are merged on `develop`; this feature builds on their contracts. (If TASK-F08-2 merges first, the branch is reconciled with `develop` before the PR.)
- **A2 — Q12 resolves the two stale "manual payment" remnants in the source task (recorded as a premise, not a clarify-blocking ambiguity).** The source TASK-F08-3 still contains pre-Q12 copy — a form footer "Bonuses are paid outside Properfy. Mark them as paid here once you've paid them." and an acceptance phrase "…and marked as paid". Q12 was decided by the client on 2026-10-30 (the bonus is settled through the inspector's invoice, owned by TASK-F08-6), and the same task's objective, out-of-scope list and criteria all remove manual payment. This spec therefore ships **no** manual-payment control, drops that footer copy, and uses Q12-consistent wording: the goal-form footer reads "Bonuses are reviewed by the Properfy team. Once approved, they're added to the inspector's next invoice."; the "Paid" tile/status is read-only and shows $0.00 until TASK-F08-6 wires invoice settlement. The 03.A4 E2E proves the flow up to "Approved"; TASK-F08-6 later extends it to "Paid" with the invoice link.
- **A3 — No new contract surface.** No backend route, DB model or Zod schema is added; the only shared change is the pure `describeGoal` helper. `api-types.ts` already carries the F08-1 routes (merged #1358) and is regenerated only if the CI contract-freshness job flags it.
- **A4 — Periods come only from the backend.** The web never computes or re-derives a billing period; the "Starts"/"Ends"/Rewards period selectors read the TASK-F08-1 periods route (`direction=upcoming|past`).
- **A5 — Timezone.** All civil period dates are `PLATFORM_TIMEZONE` values from the backend; instants are displayed in `PLATFORM_TIMEZONE`; the browser/user timezone is never used (DR5). Timezone-dependent tests pin `TZ` away from Sydney.
- **A6 — AuthGuard denies by redirect.** Denied roles are redirected (to `/dashboard`) rather than shown an in-page "no permission" panel (per the merged TASK-F07-3 behaviour).
- **A7 — No existing dashboard screen changes** other than adding the derived, read-only Level column to the F07 Inspector performance page, which the plan (line 03.11) assigns to F08.
- **A8 — Status labels come from the shipped shared contract.** The award status chip reuses `REWARD_AWARD_STATUS_LABELS` from `@properfy/shared` (merged #1358): `PENDING → "Pending review"`, `APPROVED → "Approved"`, `PAID → "Paid"`, `VOID → "Voided"`. Where the source task said "Pending approval", the merged contract's "Pending review" wins (constitution §IV/§V and `packages/shared` single-source-of-truth rule forbid duplicating/overriding a shipped shared label); tests and the E2E assert "Pending review".
- **A9 — Void reason floor matches the route.** The shared `voidAwardSchema` allows `reason` ≥ 1, but the void route tightens it to ≥ 5; the dialog therefore validates "Internal reason" as 5–500 client-side to avoid a guaranteed 400 round-trip.
- **A10 — "Who", scope labels and deleted-scope come from the goal response.** `scopeRegionName`/`scopeServiceTypeName`/`scopeInspectorName`, `scopeRegionDeleted`, `pendingChange`, `resumesOn` and `minEndsAt` are already on `goalResponseSchema`; the UI reads them directly (no extra fetch), and `describeGoal` receives the region/service-type name (or `null` → deleted-scope fallback).
- **A11 — a11y is verified by explicit RTL assertions, not axe.** The `apps/web` workspace has no axe engine and the sibling Phase-2 features (F05-2, F07-3) shipped a11y via explicit ARIA-role/keyboard RTL tests. The source task's "axe" wording is met that way; adding an axe dependency would be an unsanctioned stack change (constitution §Tech Stack, "do not change the stack").
- **A13 — The 03.A4 E2E is hermetic (no backend fixture).** The web E2E suite (the `test-web-e2e` CI gate) stubs every API call; a `globalSetup` seeding a real DB + running the F08-1 daily job would break the gate, and an unused fixture script would be dead code (constitution §V). The spec therefore stubs a closed period with an achieved award and proves the 03.A4 UI behavior (reward appears, summed into "Achieved", approvable) + CL_ADMIN denial. A real-backend "Paid" extension belongs to TASK-F08-6. This resolves the source task's fixture/`globalSetup` step against the shipped hermetic suite.
- **A12 — Tabs reuse the shared `TabsNav` primitive.** The Goals/Rewards tab switch uses the app's standard `TabsNav` (`role="tablist"`/`role="tab"`), as every other tabbed page does (12 consumers, incl. sibling Live Day F05-3). `TabsNav` is click-activated; adding arrow-key roving to it is an app-wide shared-primitive concern (it would touch all 12 consumers), out of scope for this consumer feature, so the task's "arrows" wording is satisfied at the tablist-semantics level, not by re-implementing an accessible tablist here. The other interactive widgets this feature adds (selects, dialogs) use the already keyboard-accessible shared primitives.
