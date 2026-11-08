# Feature Specification: Challenges in the inspector app + performance messages

**Feature Branch**: `068-f08-4-challenges-pwa`
**Created**: 2026-11-08
**Status**: Draft
**Input**: TASK-F08-4 (`fase2-etapa1/tarefas/F08-tarefas.md`) — Backend + shared + PWA: an inspector-only `GET /v1/inspector/program` endpoint, a "Challenges" screen in the inspector app (More hub tile + `/profile/challenges` with Active / My results / Ranking tabs, including an **anonymous ranking**), the three automatic `PERFORMANCE_MESSAGE` notices computed by the daily job and sent at 08:00 Sydney, the `/profile/challenges` notice-target allowlist entry, and tour step 8.

> Contract codes delivered: **03.10, 03.15, 03.17**; acceptance criteria **03.A3, 03.A4, 03.A5**. This is the inspector (PWA) surface of feature F08 (contract items 03.6–03.10, 03.13–03.15, 03.17).

## Context & constraints

This feature adds one **inspector-only read endpoint** (`GET /v1/inspector/program`), the three automatic performance-message steps to the **existing** `inspector-program.daily` job's 08:00 "MESSAGES" run (created by TASK-F08-1), and the PWA "Challenges" surface. It is otherwise a **consumer** of already-merged contracts: TASK-F08-1 (inspector-program model, standing service, daily-job phases — PR #1358), TASK-F08-3 (`describeGoal` shared helper — #1360), TASK-F02-1/F02-3 (`PublishSystemInspectorNoticeUseCase`, `PERFORMANCE_MESSAGE`, the notice-target allowlist, the PWA Announcements inbox), and TASK-F04-3/F04-3b (the `/profile` More hub, `ProfileTile`, and the onboarding tour). It **creates no database table and no migration**: it reads the TASK-F08-1 tables and the F07 reliability snapshots, and writes only through the F02 notice use case (which audits).

**Multi-tenant exception to root `CLAUDE.md` §7.1 (D12).** The entities this feature reads — `InspectorGoal`, `RewardAward`, `GoalPeriodClosure` (and the F07 `InspectorReliabilitySnapshot`) — are **platform-scoped: they carry no `tenant_id`**, because an inspector is cross-tenant (precedents: `Inspector`, global `ServiceRegion`, `PlatformSetting`, `InspectorReliabilitySnapshot`). Isolation is guaranteed not by a tenant predicate but by scope-of-subject: the endpoint is **INSP-only and always filtered by the caller's own `inspectorId`** (`requireLinkedInspector`), and the ranking exposes **no** identifying field of any other inspector (03.A3). `AM`, `OP`, `CL_ADMIN`, `CL_USER` and `TNT` receive **403** (Q18). No row this feature reads carries an agency name, address or coordinate, and nothing it emits (response or notice) renders one. The feature adds no path that could read another inspector's or another agency's rows; the ranking is derived server-side and anonymised before it leaves the backend.

**Inspector GPS privacy (root `CLAUDE.md` §7.9).** Not applicable by construction: this feature reads no coordinate column and emits no coordinate; the response and the notices contain only goal titles, numeric values, civil dates, level and streak.

**Dates & timezones (DR5).** Every civil date the app shows (`periodStart`, `periodEnd`, `startsOn`, `countsSince`, "the week of Mon 2 Nov", "Starts Mon 16 Nov", "Counts jobs since Mon 9 Nov", the snapshot date, streak-risk "last day") is produced by the **backend in `PLATFORM_TIMEZONE` (`Australia/Sydney`)** and rendered as received; the PWA never computes or re-derives a period, and never uses the device timezone or `users.timezone`. Instants (`generatedAt`, `paidAt`, `voidedAt`) are UTC ISO strings. The daily-job cron (04:45) and the messages run (08:00) fire on `PLATFORM_TIMEZONE`. Timezone-dependent tests pin `TZ` away from Sydney.

## Clarifications

### Session 2026-11-08

A structured ambiguity scan across the full taxonomy (functional scope, domain/data model, interaction/UX, non-functional/privacy, integration/dependency, edge cases, constraints/trade-offs, terminology, completion signals) found **no critical ambiguity requiring a product decision**: the source task (TASK-F08-4) is exhaustive, every acceptance criterion traces to a merged or in-task contract, and the single product decision in scope (Q12) was already made by the client on 2026-10-30. The inconsistencies found were resolved from existing decisions and shipped contracts, recorded below as premises (not as clarify-blocking questions):

- **Q: Reward-status chip copy.** DL14 specifies the inspector chip for an `APPROVED` reward as "Approved – on your next invoice", but the shipped shared label `REWARD_AWARD_STATUS_LABELS.APPROVED` is "Approved" (#1358). Which wins in the app? → **A:** Both, at different layers. The shared enum label remains the single source of **status identity**; the app renders a chip whose colour/identity derives from the status, with DL14's inspector-facing copy as the **visible label** in the invoice context ("Pending review" / "Approved – on your next invoice" / "Paid" / "Voided"). This is per-surface copy (Q12/DL14), not an override of the shared enum. Recorded in **A8**, enforced by **FR-018**.
- **Q: `describeGoal` scope label on the inspector side.** The Active card uses `describeGoal` (F08-3, #1360), whose signature is `describeGoal({ metric, target, scopeLabel })`. → **A:** The endpoint supplies each active goal's `description` already rendered server-side (so the client needs no scope lookup and no other-inspector/agency data reaches it); the app may additionally call the pure helper for display but MUST NOT fetch scope names. Recorded in **A10**.
- **Q: `summary.openCashTotal` currency/format.** → **A:** The endpoint returns `{ openCashTotal: number; currency: 'AUD' }`; the app formats AUD with no cents when whole (DL "$60", tile "Up to $110 in bonuses"). Recorded in **A7**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An inspector sees their active challenges and progress (Priority: P1)

A linked inspector opens **Challenges** from the More hub and lands on the **Active** tab. Each goal they participate in shows its title, bonus, a plain-language description, current progress toward the target, and how long is left. Goals that have not started yet but begin within 7 days appear under a "Starting soon" section; a goal created mid-period shows since when it counts. A footer explains that approved bonuses are added to the next invoice.

**Why this priority**: This is the inspector's primary value and the entry point to the whole surface — knowing which goals are live, how they are doing, and what they can earn (contract 03.10, 03.15). It is independently demonstrable with only the endpoint and the Active tab.

**Independent Test**: With the endpoint returning active goals (volume, rate, index) plus one upcoming goal, open `/profile/challenges`, land on Active, and verify each state (`MET_SO_FAR`, `IN_PROGRESS`, `BELOW_TARGET`, `NOT_ENOUGH_SERVICES`, `NO_DATA`, `UPCOMING`), the progress bar on volume goals, the "Starting soon" section, "Counts jobs since …", and the footer.

**Acceptance Scenarios**:

1. **(03.10/03.15)** **Given** an inspector who participates in active goals, **When** the Active tab loads, **Then** each goal shows title, bonus ("$60", no cents when whole), the `describeGoal` description, a progress line, and a deadline/status line; goals are ordered by least `daysLeft` then largest bonus.
2. **Given** a volume goal with `value 47`, `target 60`, **Then** the card shows a progress bar with `role="progressbar"`, `aria-valuenow 47`, `aria-valuemax 60`, `aria-valuetext "47 of 60 inspections"` and the text "47 of 60"; rate/index/other states show their text ("96% so far", "Index 82.4 so far", "{n} of 10 jobs to qualify", "No data yet") and no bar.
3. **(L-F08-12)** **Given** a goal with `state 'UPCOMING'` and `startsOn '2026-11-16'`, **When** the Active tab loads, **Then** a "Starting soon" section appears below the active cards with a bar-less card reading "Starts Mon 16 Nov"; with no `UPCOMING` items the section is absent; a goal with `countsSince '2026-11-09'` shows "Counts jobs since Mon 9 Nov" in its description.
4. **(L-F08-14, Q12)** **Given** the Active (and My results) tab, **Then** a footer reads exactly "Bonuses are reviewed by the Properfy team. Once approved, they're added to your next invoice and show in Earnings."
5. **Given** an inspector who participates in no goal, **Then** Active shows "No active challenges right now. New ones will show up here." and the other tabs still work.

---

### User Story 2 - An inspector sees their standing and reward history (Priority: P1)

On the **My results** tab the inspector sees their reliability index, level and streak, plus the history of rewards they have earned, each with a status chip. A voided reward shows only the note written for the inspector (never the internal reason). The reward created by a period closing appears here as "Pending review".

**Why this priority**: This closes the loop from goals to outcomes and proves the PWA side of the award lifecycle (03.A4, 03.15); it is the inspector's record of what they earned and its settlement state.

**Independent Test**: With the endpoint returning a standing (index 88.3 / Gold / 3-week streak) and awards (one `PENDING`, one `VOID` with an `inspectorNote`), open My results and verify the three standing cards, the chips, the voided note, and the footer.

**Acceptance Scenarios**:

1. **(03.15)** **Given** a standing with index 88.3, level Gold, a 3-period streak, **When** My results loads, **Then** it shows a Reliability index card ("88.3" or "Not enough data yet" with the 10-jobs helper), a Level card ("Gold" / "No level yet"), and a Streak card ("3 weeks in a row" / "No streak yet", plus a risk hint when at risk).
2. **(03.A4)** **Given** a reward created by the daily close for a goal the inspector reached, **When** My results loads, **Then** the reward appears in the history with the chip "Pending review".
3. **(L-F08-05)** **Given** a `VOID` reward with `inspectorNote "The job was cancelled by the agency."`, **Then** the row shows the "Voided" chip and that note; a voided reward with no note shows "Contact the Properfy team for details."; the internal `void_reason` is never present in the response or the UI.
4. **(DL14, Q12)** **Given** rewards in each status, **Then** the chips read "Pending review" / "Approved – on your next invoice" / "Paid" / "Voided" (text + colour); the footer matches US1 scenario 4; an empty history shows "No rewards yet. Reach a goal to earn one."

---

### User Story 3 - An inspector sees the anonymous ranking (Priority: P1)

On the **Ranking** tab the inspector sees their own position and score and a leaderboard of the other inspectors' scores — with **no name, photo or id** of anyone else. The ranking covers all active, scored inspectors on the platform. Below a minimum cohort of 5 it shows only the inspector's own card.

**Why this priority**: 03.A3 is the contractually tested privacy headline of F08 — the leaderboard must motivate without ever exposing another inspector's identity. A leak here is a privacy defect, so this story carries its own contract-level anonymity test.

**Independent Test**: With the endpoint returning a ranking of ≥ 5 scored inspectors, open Ranking and verify "You're #4 of 37", the ordered list of "#· score · level" rows with no names, the highlighted "You" row with its `aria-label`, tie handling, the platform-cohort footer, and the two below-threshold / not-ranked states; a contract test asserts no identifier of any other inspector appears anywhere in the response.

**Acceptance Scenarios**:

1. **(03.A3)** **Given** 37 scored inspectors, **When** Ranking loads, **Then** it shows "You're #4 of 37", an `<ol>` of rows "#1 · 96.4 · Gold" (position, score, level — no name/photo/id), the inspector's own row marked "You" with `aria-label "Your position: 4 of 37, score 88.3"`, and ties sharing a position; **no** name is rendered.
2. **(03.A3, DV4)** **Given** fewer than 5 scored inspectors, **Then** the list is hidden and only the inspector's own card shows with "The ranking appears once at least 5 inspectors have a score."; **given** the inspector is not ranked, **Then** it shows "You're not ranked yet" + "You'll appear once you have 10 jobs in the last 30 days."
3. **(L-F08-07)** **Given** any ranking, **Then** the footer reads "Ranked against all active inspectors on the platform. Other inspectors are shown without names. Updated daily."
4. **(03.A3, contract)** **Given** 6 scored inspectors with known ids, names, emails and phones, **When** `GET /v1/inspector/program` is called as one of them, **Then** the serialized body contains none of the other five's id, name, email or phone; a recursive scan finds no key `inspectorId`, `id`, `name`, `photoUrl`, `avatarUrl`, `email` or `phone`; each `entries[i]` has exactly the four keys `position`, `score`, `level`, `isMe`.

---

### User Story 4 - An inspector is notified of their performance (Priority: P1)

The daily job's 08:00 Sydney "MESSAGES" run sends the inspector up to three kinds of `PERFORMANCE_MESSAGE` (push + in-app inbox, never SMS): one aggregated "goal reached" notice per inspector per period end, a level-change notice (at most once every 7 days, and never when the index weights changed between the two snapshots), and a streak-at-risk notice on the last day of the cycle. Tapping the push opens `/profile/challenges`.

**Why this priority**: 03.17 is a named contract deliverable; the aggregation, the 08:00 timing, the 7-day guard and the weights-version rule are the correctness core of the notice behaviour and are heavily asserted.

**Independent Test**: Run the daily use case with `trigger 'MESSAGES'` against seeded awards and snapshots and assert the exact `PublishSystemInspectorNoticeUseCase` calls (titles, bodies, `dedupeKey`s, `targetPath`), and that `trigger 'SCHEDULED'`/`'STARTUP'` produces none.

**Acceptance Scenarios**:

1. **(03.17, L-F08-01, L-F08-14)** **Given** one non-void reward of $30 created at 04:45 for the week of 2–8 Nov, **When** the MESSAGES run executes at 08:00 on 9 Nov, **Then** exactly one notice is published: `type 'PERFORMANCE_MESSAGE'`, title "Goal reached: Weekly volume", body "You reached \"Weekly volume\" for the week of Mon 2 Nov. Your $30.00 bonus will be reviewed and, once approved, added to your next invoice.", `dedupeKey 'program-goals-reached:<inspectorId>:2026-11-08'`, `targetPath '/profile/challenges'`.
2. **(03.17, L-F08-01)** **Given** one inspector with four non-void rewards all with `periodEnd 2026-11-15` (30 + 30 + 60 + 40), **Then** exactly one aggregated notice is published: title "You reached 4 goals", body "You reached \"Weekly volume\", \"On-time arrival\", \"Region volume\" and \"Fortnight volume\". Your bonuses (total $160.00) will be reviewed and, once approved, added to your next invoice.", `dedupeKey 'program-goals-reached:<inspectorId>:2026-11-15'`.
3. **(03.17, L-F08-01)** **Given** a weekly reward ending 2026-11-08 notified on 9 Nov and a fortnightly reward ending 2026-11-15 notified on 16 Nov for the same inspector (same period start, different ends), **Then** two distinct notices are published and neither is discarded as a duplicate; **given** two inspectors with a reward the same day, two notices are published (one each).
4. **(03.17, L-F08-01)** **Given** the 04:45 `SCHEDULED` run, **Then** no performance-message notice is published (message steps run only under `trigger 'MESSAGES'`); **given** a reward created yesterday whose MESSAGES run failed, **Then** today's run republishes it under the same `dedupeKey` (48-hour scan of non-void rewards grouped by `(inspector, periodEnd)`).
5. **(03.17)** **Given** yesterday's and today's snapshots both exist, same weights/`minimumVolume`/`toleranceMinutes`/`volumeReference.source`, scores 82 → 86 crossing into Gold, **Then** a notice "You're now Gold" / "Your reliability index is 86.0. Keep it up to stay at Gold." is published with `dedupeKey 'program-level:<inspectorId>:<snapshotDate>'`; a drop 86 → 83 publishes "You're now Silver" / "Your reliability index is 83.0. Reach 85.0 to get back to Gold.".
6. **(03.17, L-F08-06)** **Given** a level crossing but the weights changed between the two snapshots, **Then** no level notice is published and a `warn`-free info log records `inspector_program.level_messages_skipped { reason: 'WEIGHTS_CHANGED' }`; **given** a level crossing but the inspector received a `program-level:<id>:*` notice within the last 7 days (`created_at ≥ now − 7d` suppresses, `< now − 7d` does not), **Then** none is published, logged `{ reason: 'RECENT_MESSAGE' }`.
7. **(03.17)** **Given** a weekly streak of 3, today being the last day of the week, the inspector participating in ≥ 1 weekly goal with none `MET_SO_FAR`, **Then** a notice "Your 3-week streak is at risk" / "Today is the last day of the week. Reach any weekly goal to keep your streak going." is published with `dedupeKey 'program-streak-risk:<inspectorId>:<periodStart>'`; otherwise none.
8. **(03.17)** **Given** the job runs twice, **Then** the second run publishes nothing new (F02 returns `created: false` per `dedupeKey`); an inactive inspector receives nothing; a failure in one message step is logged and does not stop the others.

---

### User Story 5 - An inspector reaches Challenges from the hub and onboarding (Priority: P2)

A "Challenges" tile appears in the More hub right after Earnings, and the onboarding tour's More step mentions challenges. `/profile/challenges` is registered in the notice-target allowlist so a push can deep-link to it.

**Why this priority**: Discoverability and deep-linking. Valuable but dependent on US1–US3 existing; a usable surface ships without the tour text.

**Independent Test**: Render the ProfilePage grid and assert the tile position/value/target; run the tour step test for the new text; run the shared allowlist test for `/profile/challenges`.

**Acceptance Scenarios**:

1. **(L-F08-09)** **Given** the More hub, **Then** a "Challenges" `ProfileTile` (trophy icon) is the 2nd tile (right after Earnings; order Earnings, Challenges, Availability, Documents, My account) linking to `/profile/challenges`, with value "Up to {openCashTotal} in bonuses" when `openCashTotal > 0` else "See your goals and ranking"; the F02-3 "Announcements" tile stays `col-span-2` at the end; no new group/heading is added.
2. **Given** the onboarding tour, **Then** step 8 (the More step) reads "Announcements, challenges, earnings, your profile and app settings." and the `nav-clearance-contract` test stays green.
3. **(DR7, L-F02-08)** **Given** the notice-target allowlist, **Then** `/profile/challenges` is allowed as a **static exact** pattern (no trailing slash, no variable segment): `/profile/challenges` passes; `/profile/challenges/`, `/profile/challenges/x`, `/profile/challengesx`, `/Profile/Challenges` and `/profile/challenges?tab=ranking` do not; existing targets are unchanged.
4. **Given** a push tapped on a current client, **Then** the service worker opens `/profile/challenges`; an older client falls back to the F02 default target.

### Edge Cases

- **Back navigation**: Challenges' top bar back button returns to `/profile`, including on a direct deep link.
- **No participation**: Active empty, My results and Ranking still render.
- **Mid-period goal**: progress counts from the period start, shown as "Counts jobs since {periodStart}" (L-F08-12).
- **Deactivated then reactivated goal**: disappears on next read; reappears in "Starting soon" only if the next period starts within 7 days (L-F08-02/12); a goal starting more than 7 days out is invisible with no "new goal" message.
- **Four rewards in one close**: one aggregated push at 08:00 ("You reached 4 goals"), not four at 04:45 (L-F08-01).
- **Index oscillating 84.9 ↔ 85.0**: at most one level message per 7 days; the displayed level and early-access eligibility still follow the day's index (no hysteresis, D3) (L-F08-06).
- **Void without note**: "Contact the Properfy team for details."; the internal reason never reaches the app (L-F08-05).
- **Score `null` / `NOT_COMPUTED`**: no level, no ranking position; `NOT_COMPUTED` shows "Your index will appear tomorrow.".
- **Exactly 5 ranked**: full list; **4 ranked**: own card only.
- **Ties**: same position; order among tied rows by the day's stable hash (DV4), not by name or insertion.
- **Reward created in a catch-up after its group was already notified**: not re-announced (accepted limitation); still shows in My results.
- **Goal-reached notice older than 30 days**: archived by F02; the reward still shows in My results (the app never depends on the archived notice) (DR7).
- **Offline with cache**: "You're offline. Showing your last update."; **load error**: "Couldn't load your challenges." + "Try again"; **not linked**: handled by the global `INSPECTOR_NOT_LINKED` treatment.
- **Snapshot missing today**: level step publishes nothing and logs `warn`.

## Requirements *(mandatory)*

### Functional Requirements

**Endpoint & response contract (03.10, 03.15, 03.A3)**

- **FR-001**: The system MUST expose `GET /v1/inspector/program` returning the caller inspector's own program: `summary { openCashTotal, currency: 'AUD' }`, `activeGoals[]`, `standing { index, level, streak }`, `awards[]` (latest 50, `period_end` desc), and `ranking`, matching the response contract in **Contracts** below. It MUST require a linked inspector via a `requireLinkedInspector` helper with the same codes/messages as `inspector-execution` (403 `FORBIDDEN` "Only inspectors can …", 400 `INSPECTOR_NOT_LINKED`); `AM`, `OP`, `CL_ADMIN`, `CL_USER` and `TNT` MUST receive **403** (Q18); no token MUST be **401**.
- **FR-002**: `summary.openCashTotal` MUST be the sum of `rewardAmount` over the active goals the inspector participates in **in the current period only** (not `UPCOMING`), with no cap (L-F08-04).
- **FR-003**: `activeGoals[]` MUST contain only goals the inspector participates in; each item MUST carry `goalId, title, description, metric, comparator, target, periodType, periodStart, periodEnd, daysLeft, rewardAmount, value, serviceCount, minimumServices, state, startsOn, countsSince`, where `state ∈ {MET_SO_FAR, IN_PROGRESS, BELOW_TARGET, NOT_ENOUGH_SERVICES, NO_DATA, UPCOMING}`. `description` MUST be rendered server-side (no scope-name lookup on the client). `UPCOMING` items MUST set `startsOn` to the next period start and `value` to `null`; non-upcoming items MUST set `startsOn` null; `countsSince` MUST be the period start when the goal began mid-period, else null (L-F08-12).
- **FR-004**: `standing.index` MUST be `{ score, status, snapshotDate }` from `getCurrentIndexes()` for the caller; `standing.level` MUST be `resolveInspectorLevel(score, thresholds)` or null; `standing.streak` MUST be `{ cycle, count, atRisk }` derived from closures (P11) with no new table.
- **FR-005**: `awards[]` MUST carry `goalTitle, metric, periodType, periodStart, periodEnd, amount, achievedValue, status, paidAt, voidedAt, inspectorNote` and MUST NEVER include `voidReason` or any other inspector's data (L-F08-05).
- **FR-006 (03.A3)**: `ranking` MUST be `{ myPosition, myScore, totalRanked, notRankedReason, cohortTooSmall, entries[] }` where each `entries[i]` is **exactly** `{ position, score, level, isMe }` (`.strict()`), ordered by `position` asc then by `sha256(snapshotDate + ':' + inspectorId)` asc (stable within a day, independent of name and insertion order), with the F07 competition positions preserved (two at position 3 → next is 5). The cohort MUST be **all** `ACTIVE` inspectors with a `SCORED` index on the platform (`getCurrentIndexes()` with no region/service-type/goal filter, L-F08-07). When `totalRanked < 5` the response MUST set `cohortTooSmall: true` and `entries: []` while still returning `myPosition`/`myScore` (DV4). A not-ranked caller MUST get `myPosition: null` and `notRankedReason ∈ {'NOT_ENOUGH_DATA','NOT_COMPUTED'}`. The response MUST contain **no** `inspectorId`, `id`, `name`, `photoUrl`, `avatarUrl`, `email` or `phone` key anywhere.
- **FR-007 (perf)**: The endpoint MUST compute progress with at most one `computeAll` per `(period, scope)` of the caller's active goals and serve with `staleTime 60_000` on the client; target p95 < 800 ms in staging.

**Active tab (03.10)**

- **FR-008**: The Active tab MUST render one card per active goal with title, bonus ("$60", no cents when whole), the `describeGoal` description, a progress line, and a status/deadline line, ordered by least `daysLeft` then largest bonus; a volume goal MUST render a `role="progressbar"` with `aria-valuenow/valuemax/valuetext` ("47 of 60 inspections") and text "47 of 60"; rate goals show "96% so far" (`CANT_DO_MAX` "3% so far"; `LATE_NOTICE` with no late arrivals "No late arrivals so far"); index "Index 82.4 so far"; `NOT_ENOUGH_SERVICES` "{n} of 10 jobs to qualify"; `NO_DATA` "No data yet".
- **FR-009**: The status line MUST read, for volume `MET_SO_FAR` "Target reached"; for rate/index `MET_SO_FAR` "On track"; otherwise "{n} days left" / "1 day left" / "Last day"; `BELOW_TARGET` MUST additionally show "Target {target}%".
- **FR-010 (L-F08-12)**: When any `UPCOMING` item exists, the Active tab MUST show a "Starting soon" section below the active cards (ordered by `startsOn`) with bar-less cards carrying title, bonus, `describeGoal` and "Starts {EEE d MMM}"; with no upcoming items the section MUST be absent; a goal with `countsSince` MUST show "Counts jobs since {EEE d MMM}" in its description.
- **FR-011 (L-F08-14, Q12)**: The Active and My results tabs MUST show the footer "Bonuses are reviewed by the Properfy team. Once approved, they're added to your next invoice and show in Earnings."

**My results tab (03.15, 03.A4)**

- **FR-012**: My results MUST show a Reliability index card ("88.3" / "Not enough data yet" with "Based on your last 30 days. You need 10 jobs for a score.", and "Your index will appear tomorrow." when `NOT_COMPUTED`), a Level card ("Gold" / "No level yet"), and a Streak card ("3 weeks in a row" / "No streak yet"; "Reach a weekly goal today to keep it." when at risk).
- **FR-013 (03.A4)**: My results MUST list rewards (title, "Week of Mon 2 Nov", amount, status chip); a reward created by the daily close MUST appear with the "Pending review" chip; empty history MUST show "No rewards yet. Reach a goal to earn one.".
- **FR-014 (L-F08-05)**: A `VOID` reward MUST render the "Voided" chip and, below it, the `inspectorNote` or, when absent, "Contact the Properfy team for details."; the internal reason MUST NOT appear.

**Ranking tab (03.A3)**

- **FR-015 (03.A3)**: Ranking MUST show "You're #{myPosition} of {totalRanked}", an `<ol>` of "#{position} · {score} · {level}" rows with no name/photo/id, the caller's own row marked "You" with `aria-label "Your position: {p} of {n}, score {s}"`, and tied rows sharing a position; it MUST render **no** inspector name.
- **FR-016 (DV4)**: When `cohortTooSmall`, Ranking MUST show only the caller's own card plus "The ranking appears once at least 5 inspectors have a score."; a not-ranked caller MUST show "You're not ranked yet" + "You'll appear once you have 10 jobs in the last 30 days.".
- **FR-017 (L-F08-07)**: The Ranking footer MUST read "Ranked against all active inspectors on the platform. Other inspectors are shown without names. Updated daily."

**Status chips (DL14, Q12)**

- **FR-018**: Reward status chips MUST derive identity/colour from the status and render the inspector-facing labels "Pending review" / "Approved – on your next invoice" / "Paid" / "Voided"; the chip MUST NOT override or duplicate the shared `REWARD_AWARD_STATUS_LABELS` enum (which remains the status-identity source) — the augmented "on your next invoice" wording is per-surface copy.

**Automatic messages & daily job (03.17)**

- **FR-019 (L-F08-01)**: The three message steps MUST run **only** in the `inspector-program.daily` run with `trigger 'MESSAGES'` (enqueued by TASK-F08-1's 04:45 run to fire at 08:00 Sydney), in the order goal-reached → level-change → streak-risk, each with `phase 'MESSAGES'`; `trigger 'SCHEDULED'`/`'STARTUP'` MUST run none of them. The feature MUST add **no** new queue, worker, `boss.schedule` or subscriber.
- **FR-020 (L-F08-01, L-F08-14)**: The goal-reached step MUST scan non-void rewards with `created_at ≥ now − 48h` of `ACTIVE` inspectors, group by `(inspectorId, periodEnd)`, and publish exactly one `PERFORMANCE_MESSAGE` per group via `PublishSystemInspectorNoticeUseCase` — single-reward copy "Goal reached: {title}" / "You reached \"{title}\" for {period text}. Your {amount} bonus will be reviewed and, once approved, added to your next invoice.", and aggregated copy (n > 1) "You reached {n} goals" / "You reached \"{t1}\", \"{t2}\" and \"{tn}\". Your bonuses (total {sum}) will be reviewed and, once approved, added to your next invoice." — with `dedupeKey 'program-goals-reached:<inspectorId>:<periodEnd>'`, `targetPath '/profile/challenges'`. Titles over 120 chars MUST be truncated to 120 with "…" and bodies over 2000 to 2000 with "…".
- **FR-021 (03.17)**: The level-change step MUST read only `findLatestSnapshotDate()` and `findByDate(latest)` / `findByDate(latest − 1)` (never a per-inspector history reader, DR4); skip entirely when `latest ≠ today` (log `warn`); for each `ACTIVE` inspector scored on both days, skip with log `{ reason: 'WEIGHTS_CHANGED' }` when `weightsVersion(prev) ≠ weightsVersion(latest)` (hash of `weights`, `minimumVolume`, `toleranceMinutes`, `volumeReference.source`); otherwise, on a change between two non-null levels, publish "You're now {level}" / index-and-next-level body with `dedupeKey 'program-level:<inspectorId>:<snapshotDate>'`, unless suppressed by the 7-day guard (FR-022). No message when a level is null on either side.
- **FR-022 (L-F08-06)**: The level-change step MUST suppress a message when `hasRecentNotice('program-level:' + inspectorId + ':', now − 7d)` (via a `IRecentProgramNoticeReader` port implemented over the F02 system-notice-by-prefix read; it MUST NOT query `inspector_notices` directly), logging `{ reason: 'RECENT_MESSAGE' }`; exactly 7×24h old does not suppress (`created_at ≥ now − 7d` suppresses).
- **FR-023 (03.17)**: The streak-risk step MUST, for each `ACTIVE` inspector with `streak.count ≥ 1`, publish "Your {n}-{cycle} streak is at risk" / "Today is the last day of the {cycle}. Reach any {cycle} goal to keep your streak going." with `dedupeKey 'program-streak-risk:<inspectorId>:<periodStart>'` only when today is the period end of the streak cycle and the inspector participates in ≥ 1 active goal of that cycle with none `MET_SO_FAR`.
- **FR-024 (03.A5, 03.17)**: Message content MUST contain only goal title, numeric values, civil dates, level and streak — never an id, agency name, address or tenant datum (asserted by UUID-regex and fixture-name scans). A failing step MUST be logged and MUST NOT stop the other steps; repeated runs MUST publish nothing new (F02 `created: false` per `dedupeKey`).

**Navigation, tile, tour & allowlist (DL9, DR7)**

- **FR-025 (L-F08-09)**: The system MUST add a route `{ path: 'challenges', element: lazyElement(ChallengesPage) }` under `profile`, and a "Challenges" `ProfileTile` (trophy icon, label "Challenges") immediately after the Earnings tile in `ProfilePage.tsx`, with `to="/profile/challenges"` and value "Up to {openCashTotal} in bonuses" (when `> 0`, read from the same `useInspectorProgram`) else "See your goals and ranking" (and "See your goals and ranking" on error/offline); the F02-3 Announcements tile MUST stay `col-span-2` at the end; no new group/heading.
- **FR-026**: `/profile/challenges` MUST open on the **Active** tab, support `?tab=results` / `?tab=ranking`, switch tabs with `replace`, expose a `role="tablist"` with the three tabs, and provide a top-bar back button returning to `/profile` (including on direct deep link). The page MUST render skeleton, error ("Couldn't load your challenges." + "Try again"), offline-with-cache ("You're offline. Showing your last update.") and per-tab empty states.
- **FR-027 (DR7, L-F02-08)**: The system MUST add `'/profile/challenges'` to `INSPECTOR_NOTICE_TARGET_PATTERNS` (shared) as a **static exact** pattern (no trailing slash, no variable segment, matched by the L-F02-08 algorithm) plus an `INSPECTOR_CHALLENGES_PATH` constant, **in the same PR** as the route; existing targets MUST be unchanged. This change MUST be made with the route (allowlist-with-route rule).
- **FR-028**: The onboarding tour step 8 (the More step) MUST read "Announcements, challenges, earnings, your profile and app settings."; `nav-clearance-contract` MUST stay green.

**Cross-cutting**

- **FR-029 (03.A5 audit / no side-write)**: The feature MUST perform **no** state write except through `PublishSystemInspectorNoticeUseCase` (which audits the notices); the read endpoint MUST be side-effect-free.
- **FR-030 (dates, DR5)**: All civil dates MUST be produced by the backend in `PLATFORM_TIMEZONE` and rendered as received; instants (`generatedAt`, `paidAt`, `voidedAt`) MUST be UTC; the PWA MUST NOT use the device timezone or `users.timezone` for any calculation.
- **FR-031 (a11y, WCAG 2.1 AA)**: The new screen MUST meet WCAG 2.1 AA via explicit ARIA/keyboard RTL assertions (no axe in the workspace, A11): tabs via `role="tablist"`/`role="tab"`; progress via `role="progressbar"` with `aria-valuetext`; the own-ranking row via `aria-label`; status conveyed by text (not colour alone); visible focus; touch targets ≥ 44 px; honour `prefers-reduced-motion`; no raw id in the UI.
- **FR-032 (no schema change)**: The feature MUST add no database table, column or migration; `api-types.ts` MUST be regenerated (new `GET /v1/inspector/program` route) via `pnpm generate:api` and committed; the PR MUST stay within the 150-changed-file limit.
- **FR-033 (out of scope)**: The feature MUST NOT build "Quality reports sent back", badges, "Help and support", any name/photo/id in the ranking, distance-to-next-level, an early-access badge, critical/SMS messages, new queues/schedules/jobs, Earnings or Announcements changes, region-scoped ranking, or a "new goal"/"reward paid/voided" message.

### Key Entities *(consumed, not defined here; D12 platform-scoped, no `tenant_id`)*

- **InspectorGoal** *(no `tenant_id`)*: a program goal (metric, comparator, target, cycle, optional scope, bonus, start/optional end, active, pending next-period change). Read to build `activeGoals` and participation. Defined by TASK-F08-1.
- **RewardAward** *(no `tenant_id`)*: a bonus an inspector earned for a goal in a closed period (amount, achieved value, status, scope-label snapshot, `inspector_note`, `void_reason` internal, `paid_at`, `voided_at`). Read for `awards[]` and the goal-reached message; never exposes `void_reason`.
- **GoalPeriodClosure** *(no `tenant_id`)*: a goal's closed period (participants, index snapshot date). Read for streak derivation.
- **InspectorReliabilitySnapshot** *(no `tenant_id`, F07)*: per-day per-inspector index + `settings_json`. Read via `getCurrentIndexes()` and `findByDate` for standing, ranking and level messages.
- **Inspector-program response** (`inspectorProgramResponseSchema`, new in `packages/shared/src/schemas/inspector-program.ts`): the shape above; `ranking.entries[]` is `.strict()` with exactly four keys.

## Contracts

**`GET /v1/inspector/program`** — INSP only (`inspector_program.view_own`), `requireLinkedInspector`, no query, read-only.

```ts
{
  generatedAt: string; timezone: 'Australia/Sydney';
  summary: { openCashTotal: number; currency: 'AUD' };
  activeGoals: Array<{
    goalId: string; title: string; description: string;
    metric: GoalMetric; comparator: GoalComparator; target: number;
    periodType: BillingPeriodType; periodStart: string; periodEnd: string; daysLeft: number;
    rewardAmount: number; value: number | null; serviceCount: number; minimumServices: number | null;
    state: 'MET_SO_FAR' | 'IN_PROGRESS' | 'BELOW_TARGET' | 'NOT_ENOUGH_SERVICES' | 'NO_DATA' | 'UPCOMING';
    startsOn: string | null; countsSince: string | null;
  }>;
  standing: {
    index: { score: number | null; status: 'SCORED' | 'INSUFFICIENT_VOLUME' | 'NO_WEIGHTED_DATA' | 'NOT_COMPUTED'; snapshotDate: string | null };
    level: InspectorLevel | null;
    streak: { cycle: BillingPeriodType | null; count: number; atRisk: boolean };
  };
  awards: Array<{ goalTitle: string; metric: GoalMetric; periodType: BillingPeriodType; periodStart: string; periodEnd: string;
                  amount: number; achievedValue: number; status: RewardAwardStatus; paidAt: string | null;
                  voidedAt: string | null; inspectorNote: string | null }>;
  ranking: {
    myPosition: number | null; myScore: number | null; totalRanked: number;
    notRankedReason: 'NOT_ENOUGH_DATA' | 'NOT_COMPUTED' | null;
    cohortTooSmall: boolean;
    entries: Array<{ position: number; score: number; level: InspectorLevel | null; isMe: boolean }>;
  };
}
```

- **Errors:** 401 (no token); 403 `FORBIDDEN` (non-INSP, incl. AM/OP); 400 `INSPECTOR_NOT_LINKED` (INSP without an inspector).
- **03.A3:** `entries` never carries an id, name, photo, email or phone; no field describes another inspector.
- **Internal message dedupe keys:** `program-goals-reached:<inspectorId>:<periodEnd>`, `program-level:<inspectorId>:<snapshotDate>`, `program-streak-risk:<inspectorId>:<periodStart>`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (03.A3)**: In a 6-inspector contract test, a `GET /v1/inspector/program` response contains none of the other five inspectors' id, name, email or phone, and each ranking entry has exactly `{ position, score, level, isMe }` — zero identity leaks, proven by the passing Supertest contract test and the RTL "no names rendered" test.
- **SC-002 (03.10/03.15)**: An inspector can read, for every active goal, its progress, bonus and deadline, plus their index, level, streak and reward history with status — all six goal states and all four reward chips render correctly (RTL/MSW).
- **SC-003 (03.17)**: The three `PERFORMANCE_MESSAGE` kinds are published exactly once each (no duplicate, F02 `created:false` on repeat) at **08:00 Sydney** and never in the 04:45 run; same-inspector same-period-end rewards aggregate into one notice; no level message is sent when weights changed between snapshots or more than once per 7 days (L-F08-01, L-F08-06) — proven by the message-step unit tests.
- **SC-004 (03.A4)**: A reward created by the daily close appears in My results as "Pending review" — proven by the RTL test.
- **SC-005 (03.A5 / Q18)**: No write occurs outside the audited F02 notice use case, and `CL_ADMIN`, `CL_USER`, `AM`, `OP` and `TNT` receive 403 on the endpoint — proven by the route test.
- **SC-006 (DL9/allowlist/tour)**: Challenges is the 2nd More tile (after Earnings), `/profile/challenges` is an allowed static-exact notice target, and tour step 8 carries the new text — proven by RTL, the shared allowlist test and the tour-step test, with `nav-clearance-contract` green.
- **SC-007**: The feature adds no DB table/migration; `api-types.ts` is regenerated for the one new route; the PR stays within the 150-file limit; p95 of the endpoint < 800 ms in staging.

## Assumptions

- **A1 — Dependencies merged.** TASK-F08-1 (#1358: inspector-program model, `InspectorProgramStandingService`, `RunInspectorProgramDailyUseCase` with `COMPUTE`/`MESSAGES` phases, `getActiveGoalProgressForMany`, the 04:45→08:00 enqueue), TASK-F08-3 (#1360: `describeGoal`), TASK-F02-1/F02-3 (`PublishSystemInspectorNoticeUseCase`, `PERFORMANCE_MESSAGE`, the notice-target allowlist + matcher, the PWA Announcements inbox and push service worker), and TASK-F04-3/F04-3b (the `/profile` More hub, `ProfileTile`, the onboarding tour) are all merged on `develop` (HEAD #1361, F08-6). This task merges **after** TASK-F08-6 so the "next invoice" copy (DL14/Q12) is already true, and is reconciled with `develop` before the PR.
- **A2 — Q12 (decided 2026-10-30) governs all bonus copy.** Approved bonuses settle through the inspector's next invoice (owned by TASK-F08-6, merged #1361); this feature's copy uses that wording everywhere and ships no manual-payment affordance. No pending Q2/Q4/Q6 applies to this task.
- **A3 — One new read route only.** The sole new contract surface is `GET /v1/inspector/program`; `api-types.ts` is regenerated via `pnpm generate:api` and committed (CI contract-freshness gate). No DB table, column, migration or write route is added.
- **A4 — The 7-day guard reads F02, not the notices table.** The level-change step depends on a `IRecentProgramNoticeReader` port backed by the F02 system-notice-by-`dedupe_key`-prefix read exposed by TASK-F02-1 ("Ajustes necessários em outras tarefas"); this module never queries `inspector_notices` directly. One query per inspector with a candidate level change (few per day).
- **A5 — Timezone.** Every civil date is a `PLATFORM_TIMEZONE` value from the backend; instants are UTC; the PWA never uses the device/user timezone (DR5). The daily job and 08:00 run fire on `PLATFORM_TIMEZONE`. TZ-dependent tests pin `TZ` away from Sydney.
- **A6 — Ranking cohort = whole platform.** The leaderboard is every `ACTIVE` inspector with a `SCORED` index (`getCurrentIndexes()` with no filter), never cut by region, service type or goals (L-F08-07); ties break on `sha256(snapshotDate + ':' + inspectorId)` (stable per day), never by name or insertion.
- **A7 — AUD formatting.** `openCashTotal` is a number with `currency: 'AUD'`; the app formats AUD with no cents when whole ("$60", "Up to $110 in bonuses").
- **A8 — Status identity vs. display copy.** The shared `REWARD_AWARD_STATUS_LABELS` (`PENDING → "Pending review"`, `APPROVED → "Approved"`, `PAID → "Paid"`, `VOID → "Voided"`, #1358) remains the single source of **status identity and colour mapping**; the inspector chip renders the per-surface DL14 copy ("Approved – on your next invoice" for `APPROVED`, the shared label otherwise), which is display copy, not an enum override (no shared label is duplicated or changed).
- **A9 — `requireLinkedInspector` is a local helper.** The endpoint replicates the `inspector-execution` helper (same 403/400 codes and messages) rather than importing across modules, matching the in-task guidance.
- **A10 — `describeGoal` and server-rendered descriptions.** The endpoint supplies each active goal's `description` already rendered server-side; the client never fetches scope names and never receives another inspector's/agency's data. The pure `describeGoal({ metric, target, scopeLabel })` helper (#1360) may be reused for display but requires no network call.
- **A11 — a11y verified by explicit RTL assertions, not axe.** The `apps/pwa` workspace has no axe engine; sibling Phase-2 PWA features shipped a11y via explicit ARIA-role/keyboard RTL tests, and this feature does the same. Adding axe would be an unsanctioned stack change.
- **A12 — Hermetic PWA tests.** Component tests use Vitest + RTL + MSW; the job/endpoint tests use the backend Vitest/Supertest harness with an injected clock and seeded repositories. The PWA E2E suite (`test-pwa-e2e`, Chromium + WebKit) stubs every API call; if Playwright cannot run in the dev environment, the E2E is validated in CI (authorised fallback), and the component/contract tests remain the correctness gate.
- **A13 — Catch-up limitation accepted.** A reward created in a catch-up **after** its `(inspector, periodEnd)` group was already announced is not re-announced (it still appears in My results); the `dedupeKey` by `periodEnd` makes next-day recovery idempotent. This is the documented L-F08-01 trade-off.
- **A14 — Merge order vs. TASK-F08-5.** This task merges before TASK-F08-5 (both consume the program contract); if TASK-F08-5 regenerates `api-types.ts` first, this branch rebases and regenerates rather than hand-merging the generated file.
