---
description: "Task list for F08-4 Challenges (PWA) + performance messages"
---

# Tasks: Challenges in the inspector app + performance messages

**Input**: Design documents from `specs/068-f08-4-challenges-pwa/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/get-inspector-program.md

**Tests**: REQUIRED — TDD is mandatory (constitution §III; TASK-F08-4 "Testes primeiro"). Every test task is written and made to FAIL before its implementation task.

**Organization**: by user story. All paths are relative to the repo root `/Users/pedro/Code/GitHub/properfy/.claude/worktrees/068-f08-4-challenges-pwa`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an incomplete task → may run in parallel
- **[Story]**: US1–US5 for user-story phases only

---

## Phase 1: Setup (shared contract — blocks the backend endpoint and the message steps)

- [ ] T001 [P] Add FAILING cases to `packages/shared/src/constants/inspector-notices.test.ts`: `/profile/challenges` allowed; `/profile/challenges/`, `/profile/challenges/x`, `/profile/challengesx`, `/Profile/Challenges`, `/profile/challenges?tab=ranking` rejected; existing targets unchanged (DR7/L-F02-08).
- [ ] T002 Implement in `packages/shared/src/constants/inspector-notices.ts`: append `'/profile/challenges'` to `INSPECTOR_NOTICE_TARGET_PATTERNS` and export `INSPECTOR_CHALLENGES_PATH = '/profile/challenges'` (T001 green).
- [ ] T003 [P] Add FAILING cases to `packages/shared/src/schemas/inspector-program.test.ts`: `inspectorProgramResponseSchema` parses a full valid response; `rankingEntrySchema` is `.strict()` (exactly `position/score/level/isMe`; an object with `inspectorId` or `name` fails); `awards[]` has no `voidReason` key.
- [ ] T004 Implement in `packages/shared/src/schemas/inspector-program.ts`: `inspectorProgramResponseSchema` + sub-schemas (`summary`, `activeGoal`, `standing.index`, `award`, `ranking`, `rankingEntry` `.strict()`), reusing shipped `GoalMetric`/`GoalComparator`/`BillingPeriodType`/`InspectorLevel`/`RewardAwardStatus`/`ReliabilityDetailStatus`; export the inferred `InspectorProgramResponse` type (T003 green).
- [ ] T005 Build + test shared: `pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test`.

**Checkpoint**: shared contract + allowlist published to `dist/`; backend and PWA can consume them.

---

## Phase 2: Foundational (endpoint + PWA page shell — blocks US1/US2/US3)

**⚠️ CRITICAL**: the three tabs are views of one endpoint and one page; this phase must complete before US1–US3.

### Backend endpoint

- [ ] T006 [P] FAILING test `apps/backend/src/modules/inspector-program/domain/ranking-anonymiser.test.ts`: cohort filter (`position !== null`); sort by position then `sha256(snapshotDate+':'+inspectorId)`; stable within a day, different-but-stable across snapshot dates; insertion/name invariance; competition positions preserved (two at 3 → next 5); `totalRanked<5` → `cohortTooSmall`, `entries:[]`, `myPosition/myScore` kept; not-ranked → `NOT_ENOUGH_DATA`/`NOT_COMPUTED`; entries drop `inspectorId`.
- [ ] T007 Implement `apps/backend/src/modules/inspector-program/domain/ranking-anonymiser.ts` (`buildAnonymousRanking`, `RANKING_MINIMUM_COHORT = 5`) — pure (T006 green).
- [ ] T008 [P] FAILING test + implement the recent-awards reader port `apps/backend/src/modules/inspector-program/domain/recent-awards.reader.ts` (`IRecentRewardAwardReader`: `findRecentByInspector(id, limit)`, `findRecentNonVoidByCreatedAt(since)`) and Prisma impl `apps/backend/src/modules/inspector-program/infrastructure/prisma-recent-reward-award.reader.ts` (read `reward_awards`; never select `void_reason` for the inspector shape).
- [ ] T009 [P] FAILING test `apps/backend/src/modules/inspector-program/application/use-cases/get-inspector-program.use-case.test.ts`: composes standing + active progress (mapped to the contract incl. `description` via `describeGoal`, `minimumServices`, `startsOn`, `countsSince`), `summary.openCashTotal` (current-period participated goals only, no UPCOMING), awards (latest 50 `period_end` desc, `inspectorNote` never `voidReason`), ranking (via the anonymiser); UPCOMING goal in `activeGoals` but not in `openCashTotal`.
- [ ] T010 Implement `apps/backend/src/modules/inspector-program/application/use-cases/get-inspector-program.use-case.ts` (compose `InspectorProgramStandingService` + `getCurrentIndexes()` + recent-awards reader; `generatedAt`/`timezone`) (T009 green).
- [ ] T011 FAILING Supertest `apps/backend/src/modules/inspector-program/interfaces/inspector-program-inspector.routes.test.ts`: **03.A3** — 6 scored inspectors, body carries none of the other 5 ids/names/emails/phones, recursive key scan finds no `inspectorId|id|name|photoUrl|avatarUrl|email|phone`, each entry has exactly 4 keys; 4-ranked → `entries:[]`; RBAC AM/OP/CL_ADMIN/CL_USER/TNT → 403; INSP without inspectorId → 400 `INSPECTOR_NOT_LINKED`; no token → 401.
- [ ] T012 Implement `apps/backend/src/modules/inspector-program/interfaces/inspector-program-inspector.routes.ts` — `GET /v1/inspector/program`, local `requireLinkedInspector` (same codes/messages as inspector-execution), `schema.response[200] = inspectorProgramResponseSchema`; register the route file and wire `GetInspectorProgramUseCase` + readers in `apps/backend/src/main/container.ts` (T011 green).

### PWA page shell

- [ ] T013 [P] FAILING test + implement `apps/pwa/src/features/challenges/hooks/useInspectorProgram.ts` (React Query, `queryKey ['inspector-program']`, `staleTime 60_000`, typed by `paths['/v1/inspector/program']`) — foundational: the hook feeds all three tabs and the More tile.
- [ ] T014 FAILING test + implement `apps/pwa/src/features/challenges/pages/ChallengesPage.tsx` shell: TopBar "Challenges" + back to `/profile`; `role="tablist"` Active/My results/Ranking; `?tab=results|ranking` with `replace`, default Active; skeleton, error ("Couldn't load your challenges." + "Try again"), offline-with-cache ("You're offline. Showing your last update."); add `{ path: 'challenges', element: lazyElement(ChallengesPage) }` under `profile` in `apps/pwa/src/app/router.tsx`.

**Checkpoint**: endpoint is live and anonymity-proven; the page renders its shell + states; tabs can be filled independently.

---

## Phase 3: User Story 1 — Active challenges & progress (Priority: P1) 🎯 MVP

**Goal**: Active tab shows each participated goal's progress/bonus/deadline + a "Starting soon" section; footer explains next-invoice bonuses.

**Independent Test**: with the endpoint stubbed (MSW) returning volume/rate/index goals + one UPCOMING, the Active tab renders all six states, the progressbar, "Starting soon", "Counts jobs since …" and the footer.

- [ ] T015 [P] [US1] FAILING test `apps/pwa/src/features/challenges/components/__tests__/ActiveGoalsTab.test.tsx` (+ `GoalProgressCard`, `UpcomingGoalCard`): ordering (least `daysLeft` then bonus); progressbar `aria-valuenow/valuemax/valuetext`; the six state texts; status line ("Target reached"/"On track"/"{n} days left"/"Last day"/"Target {t}%"); "Starting soon" present only with UPCOMING items, bar-less "Starts {EEE d MMM}"; "Counts jobs since {EEE d MMM}"; footer (FR-011); empty state.
- [ ] T016 [US1] Implement `apps/pwa/src/features/challenges/components/{ActiveGoalsTab,GoalProgressCard,UpcomingGoalCard}.tsx` and `apps/pwa/src/features/challenges/lib/challenge-copy.ts` (AUD/period formatting + footer) (T015 green).

**Checkpoint**: Active tab fully functional and independently testable.

---

## Phase 4: User Story 2 — Standing & reward history (Priority: P1)

**Goal**: My results shows index/level/streak cards and the reward history with chips + voided note.

**Independent Test**: MSW returns a standing (88.3/Gold/3-week) and awards (PENDING + VOID-with-note); My results renders the three cards, the four chips, the voided note / fallback, and the footer; 03.A4 reward shows "Pending review".

- [ ] T017 [P] [US2] FAILING test `apps/pwa/src/features/challenges/components/__tests__/MyResultsTab.test.tsx` (+ `StandingCards`, `RewardStatusChip`): index/level/streak cards incl. empty + at-risk + `NOT_COMPUTED` copy; **(03.A4)** PENDING reward → "Pending review"; chips "Pending review"/"Approved – on your next invoice"/"Paid"/"Voided"; VOID with `inspectorNote` shows note, without → "Contact the Properfy team for details."; empty history; footer.
- [ ] T018 [US2] Implement `apps/pwa/src/features/challenges/components/{MyResultsTab,StandingCards,RewardStatusChip}.tsx` (chip derives identity from status, DL14 display copy; FR-018) (T017 green).

**Checkpoint**: Active + My results both work independently.

---

## Phase 5: User Story 3 — Anonymous ranking (Priority: P1)

**Goal**: Ranking tab shows own position + anonymised leaderboard; cohort<5 and not-ranked states; no names.

**Independent Test**: MSW returns a 37-entry ranking; the tab shows "You're #4 of 37", the `<ol>` with no names, the "You" row + `aria-label`, ties, the platform footer, and the cohort<5 / not-ranked states.

- [ ] T019 [P] [US3] FAILING test `apps/pwa/src/features/challenges/components/__tests__/RankingTab.test.tsx`: "You're #{p} of {n}"; `<ol>` rows "#{p} · {score} · {level}" with **no name rendered**; own row "You" + `aria-label "Your position: 4 of 37, score 88.3"`; tied rows share a position; cohort<5 → own card + "The ranking appears once at least 5 inspectors have a score."; not-ranked → "You're not ranked yet" + help; footer (L-F08-07).
- [ ] T020 [US3] Implement `apps/pwa/src/features/challenges/components/RankingTab.tsx` (T019 green).

**Checkpoint**: all three tabs independently functional; 03.A3 proven at endpoint (T011) and UI (T019).

---

## Phase 6: User Story 4 — Automatic performance messages (Priority: P1, backend-only)

**Goal**: the daily 08:00 MESSAGES run publishes goal-reached (aggregated), level-change (weights-version + 7-day guard) and streak-risk `PERFORMANCE_MESSAGE`s; never in the 04:45 run.

**Independent Test**: run `RunInspectorProgramDailyUseCase` with `trigger:'MESSAGES'` against seeded awards/snapshots; assert exact publish calls + dedupe keys; `trigger:'SCHEDULED'` publishes none.

- [ ] T021 [P] [US4] FAILING test `apps/backend/src/modules/inspector-program/domain/program-message-copy.test.ts`: single/aggregated goal-reached copy + "Mon 2 Nov"/"fortnight"/"November" period text; level up/down copy; streak-risk copy; title>120 → 120 "…", body>2000 → 2000 "…".
- [ ] T022 [US4] Implement `apps/backend/src/modules/inspector-program/domain/program-message-copy.ts` (pure) (T021 green).
- [ ] T023 [P] [US4] FAILING test + implement the 7-day-guard port `apps/backend/src/modules/inspector-program/domain/recent-program-notice.reader.ts` (`IRecentProgramNoticeReader`) and adapter `apps/backend/src/modules/inspector-program/infrastructure/f02-recent-program-notice.reader.ts` over `HasRecentSystemInspectorNoticeUseCase`.
- [ ] T024 [P] [US4] FAILING test `apps/backend/src/modules/inspector-program/application/program-messages.test.ts`: group non-void rewards by `(inspectorId, periodEnd)`; aggregate titles in P9 order + summed total; weights-version hash equality/inequality; streak-risk selection (today=period end, participates, none MET_SO_FAR).
- [ ] T025 [US4] Implement `apps/backend/src/modules/inspector-program/application/program-messages.ts` (Prisma-free grouping/selection helpers) (T024 green).
- [ ] T026 [US4] FAILING test `apps/backend/src/modules/inspector-program/application/steps/program-message-steps.test.ts` covering the full spec table (triggers, aggregation, same-start/different-end, per-inspector, 04:45 no-send, 48h recovery, void-before-08:00, level up/down, weights-changed skip + log, 7-day guard incl. exact-7-days boundary, null↔level, missing snapshot warn, streak risk/no-risk, repeat `created:false`, inactive inspector, content-no-leak scan, DR4 snapshot-reader-calls-only).
- [ ] T027 [US4] Implement the three steps `apps/backend/src/modules/inspector-program/application/steps/{send-goal-reached-messages,send-level-change-messages,send-streak-risk-messages}.step.ts` (each `phase:'MESSAGES'`, self-catching so one failure doesn't stop others; observability logs D9); append all three to the daily-step array in `apps/backend/src/main/container.ts` (no new queue/schedule/worker/subscriber) (T026 green).

**Checkpoint**: 03.17 fully covered; messages fire only at 08:00, aggregated, guarded.

---

## Phase 7: User Story 5 — Hub tile & tour (Priority: P2)

**Goal**: "Challenges" tile after Earnings; tour step 8 mentions challenges; deep-link allowlisted (done in Phase 1).

**Independent Test**: ProfilePage grid test asserts tile #2 position/value/target; tour-step test asserts step-8 text; `nav-clearance-contract` stays green.

- [ ] T028 [P] [US5] FAILING test for the tile in `apps/pwa/src/features/profile/pages/__tests__/ProfilePage.test.tsx` (or new test): "Challenges" tile is the 2nd (after Earnings; order Earnings, Challenges, Availability, Documents, My account), trophy icon, `to="/profile/challenges"`, value "Up to {openCashTotal} in bonuses" / "See your goals and ranking" (error/offline fallback); Announcements stays `col-span-2` last.
- [ ] T029 [US5] Implement the tile in `apps/pwa/src/features/profile/pages/ProfilePage.tsx` (reads `summary.openCashTotal` from `useInspectorProgram`) (T028 green).
- [ ] T030 [P] [US5] FAILING test in `apps/pwa/src/features/tour/lib/__tests__/tour-steps.test.ts` for step 8 = "Announcements, challenges, earnings, your profile and app settings."; then implement in `apps/pwa/src/features/tour/lib/tour-steps.ts`; confirm `nav-clearance-contract.test.ts` green.

**Checkpoint**: discoverability + deep-linking complete.

---

## Phase 8: Polish & cross-cutting

- [ ] T031 Regenerate the contract: `pnpm generate:api`; commit `packages/shared/openapi.json` + `packages/shared/src/api-types.ts` (must leave no diff — CI contract-freshness).
- [ ] T032 [P] Update `apps/backend/CLAUDE.md` (new INSP route; message steps on the 08:00 run; aggregation + dedupe by `periodEnd`; weights-version rule; 7-day guard port) and `packages/shared/CLAUDE.md` (new allowlist target + `INSPECTOR_CHALLENGES_PATH`; `inspectorProgramResponseSchema`).
- [ ] T033 [P] Update `apps/pwa/CLAUDE.md` (feature `challenges`; anonymous ranking with whole-platform cohort + minimum cohort; no other-inspector data on the client; More tile; `/profile/challenges` route).
- [ ] T034 Gates inside the worktree via a subagent returning a condensed summary: `pnpm --filter @properfy/shared build test`; `pnpm --filter backend typecheck lint test` + full `test:integration`; `pnpm --filter pwa typecheck lint test`; `pnpm --filter pwa test:e2e` (Chromium+WebKit, CI fallback authorised); `pnpm generate:api` no-diff; `git diff --stat origin/develop... | tail -1` < 150.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)**: no deps; T001→T002, T003→T004, then T005. T001/T003 parallel.
- **Phase 2 (Foundational)**: after Phase 1. Backend chain T006→T007; T008, T009 parallel; T010 after T007/T008/T009; T011→T012 (T012 after T010). PWA T013/T014 after T005 (independent of backend; MSW-stubbed). Phase 2 BLOCKS US1–US3.
- **US1 (Phase 3)/US2 (Phase 4)/US3 (Phase 5)**: each after Phase 2; mutually independent (different component files) — parallelisable.
- **US4 (Phase 6)**: after Phase 1 (needs the allowlist for `targetPath`) + the merged F08-1 daily-step scaffolding; independent of the PWA phases. T021→T022; T023, T024 parallel; T025 after T024; T026→T027.
- **US5 (Phase 7)**: after Phase 2 (hub tile reads the hook). T028→T029; T030 independent.
- **Phase 8 (Polish)**: after all stories. T031 after the route is final; T032/T033 parallel; T034 last.

### Parallel opportunities

- T001 ‖ T003 (shared tests, different files).
- T006 ‖ T008 ‖ T009 (backend foundational, different files).
- Once Phase 2 is done: US1 ‖ US2 ‖ US3 ‖ (US4 even earlier, after Phase 1).
- T032 ‖ T033 (different CLAUDE.md files).

## Implementation Strategy

- **MVP**: Phase 1 + Phase 2 + US1 (Active tab) → a working Challenges screen on the endpoint.
- **Incremental**: add US2, US3, US4, US5 each independently testable; US4 (messages) can land in parallel with the UI since it's backend-only.
- **Single PR** (TASK-F08-4 = 1 PR): all phases ship together; merge after TASK-F08-6 (copy already true) and before TASK-F08-5.

## Notes

- Verify each test FAILS before its implementation task (TDD).
- Never hand-merge `api-types.ts` — regenerate (T031).
- Allowlist change (T002) ships in this same PR as the route (T012) — allowlist-with-route rule.
- Commit after each logical group; Conventional Commits; no Claude/AI references.
