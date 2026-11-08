# Feature Specification: Inspector Program — Goals, Rewards & Period Closure (backend + shared)

**Feature Branch**: `065-f08-1-goals-rewards-backend`
**Created**: 2026-11-08
**Status**: Draft
**Input**: User description: "F08-1 Inspector program goals and rewards (backend + shared)"
**Task source**: `fase2-etapa1/tarefas/F08-tarefas.md` § TASK-F08-1
**Contract codes**: 03.6, 03.7, 03.8, 03.9, 03.13; acceptance criteria **03.A4** (backend), **03.A5** (03.A3 ranking is TASK-F08-4)

## Overview

Properfy rewards reliable inspectors. The operations team defines **goals** (e.g. "do 10 inspections this week", "keep punctuality ≥ 90% this month", "reach reliability index ≥ 85"), the platform measures each active inspector against every goal at the end of each period, and each inspector who meets a goal earns a cash **reward award** that an operator then reviews. This feature builds the **measurement and reward engine** for that program: the goal model and CRUD, the daily period-closure job that evaluates participants and creates idempotent awards, the derived level and streak, the partial-progress read model, and the approve/void reward actions.

This slice is **dark**: it adds AM/OP HTTP routes but no UI (web is TASK-F08-3, PWA is TASK-F08-4) and it is consumed by every later F08 task. Its value is (a) the `inspector-program` backend module and its exported `InspectorProgramStandingService`, (b) the extension of F07's `ReliabilityMetricsService` with an optional `{ regionId?, serviceTypeId? }` scope and `completedServiceDates`, and (c) the reward lifecycle up to `APPROVED`.

**Q12 boundary (decided by the client 2026-10-30).** Reward bonuses live in the financial module (ledger + inspector invoice), but that integration is **TASK-F08-6**. This slice MUST NOT touch `financial_entries`, `inspector_invoices`, or any billing code. Approving a reward leaves a no-op **extension hook** (`IRewardAwardApprovalHook`) inside the approval/void transaction for TASK-F08-6 to implement later; there is **no manual payment** path (`mark-paid`, `paidOn`, `paymentReference`, `recoveryNote` do not exist). Between this task's merge and F08-6's, an approved award simply stays `APPROVED`.

**Multi-tenant exception (D12).** `inspector_goals`, `reward_awards`, and `goal_period_closures` carry **no `tenant_id`**: goals and awards belong to the platform program and the inspector is cross-tenant (precedents: `Inspector`, global `ServiceRegion`, `PlatformSetting`, `InspectorReliabilitySnapshot`). This is an explicit, recorded exception to CLAUDE.md §7.1; isolation is by RBAC (AM/OP admin, INSP own data only, all agency/portal roles → 403) and no row stores an agency name, address, or coordinate.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Close each period and create reward awards (Priority: P1)

As the platform (for the operations team), I need one daily job that, for every active goal whose period has ended, evaluates each participating inspector with F07's engine and creates exactly one `PENDING` reward award per achiever, idempotently and with an immutable snapshot of the goal and index, so that operators can later review and approve real, auditable rewards.

**Why this priority**: This is 03.A4 and 03.9 — the core of the program and the critical-path dependency for every other F08 task. Without it there are no awards.

**Independent Test**: Run `CloseGoalPeriodsUseCase.execute({ trigger: 'SCHEDULED', now })` against repository/metrics/index/settings fakes and the F07 worked-example fixtures; assert one `GoalPeriodClosure` per closed goal/period (with `participant_ids`, counts, `promised_amount`, `scope_label`, `index_snapshot_date`) and one `PENDING` `RewardAward` per achiever (with the goal snapshot, `achieved_value`, `achieved_on`, `index_score_at_close`, `level_at_close`), re-running the job is a no-op, and a `MESSAGES` run is enqueued for 08:00.

**Acceptance Scenarios**:

1. **Given** an active weekly goal `VOLUME ≥ 10` with 3 active participants of whom 2 reach 10 completed services in the closed period, **When** the daily job runs after the period ends, **Then** exactly 2 `PENDING` awards of `amount 30` are created, 1 closure records `participants_count 3`/`achievers_count 2`/`promised_amount 90`, and audits `goal_period.closed` (SYSTEM) and one `reward_award.created` per award are written.
2. **Given** a period already closed (its `GoalPeriodClosure` exists), **When** the job runs again the same day, **Then** `createMany({ skipDuplicates })` returns `count 0`, no award is written for that period, and nothing is audited.
3. **Given** the F07 daily snapshot for today failed (latest snapshot is yesterday), **When** the period closes, **Then** the closure and awards store `index_snapshot_date = yesterday` with that snapshot's score/level, the job logs `warn inspector_program.index_snapshot_stale { snapshotDate, today }`, and closure proceeds; a later-arriving today snapshot never re-closes the period.
4. **Given** the `04:45` scheduled run finishes its compute phase, **When** it ends, **Then** it enqueues `inspector-program.daily { trigger: 'MESSAGES' }` with `startAfter = messagesRunAt(now)` (08:00 Sydney today) and `singletonKey 'inspector-program.messages:<today>'`, and does **not** create a second `boss.schedule`.
5. **Given** a goal with pending term changes (`next_target`/`next_reward_amount`/`next_effective_from`), **When** the period before `next_effective_from` closes, **Then** the closure uses the current terms and, in the same transaction, promotes `next_*` into `target`/`reward_amount` (clearing `next_*`) with audit `inspector_goal.terms_applied`.

---

### User Story 2 - Define and manage goals (Priority: P1)

As an Admin Master / Operator, I need to create, list, read, and edit inspector goals — choosing a metric, comparator, target, period, optional scope (region / service type / inspector), reward amount, start and optional end — and to deactivate and reactivate them, so I can run the reward program; every change is audited (03.A5).

**Why this priority**: 03.6/03.8. There is no program to measure without goals; CRUD is a hard prerequisite for US1 to have anything to close.

**Independent Test**: Exercise `create-goal`/`update-goal`/`list-goals`/`get-goal` and the Zod schemas; assert validation (comparator fixed per metric, scope required/forbidden per metric, target/reward ranges, period alignment, `startsAt` not in the past, `endsAt` ≥ current period), audit entries with author and before/after, reactivation writing `SKIPPED_INACTIVE` closures, and term changes landing on the next period.

**Acceptance Scenarios**:

1. **Given** a valid `createGoalSchema` body with no `comparator`, **When** a goal is created, **Then** the comparator defaults to the metric's fixed comparator (`GTE`, or `LTE` for `CANT_DO_MAX`), `created_by_user_id` is the actor, and audit `inspector_goal.created` carries the full `after`.
2. **Given** a running goal (it has a current period), **When** an AM PATCHes `{ target, rewardAmount }`, **Then** `target`/`reward_amount` are unchanged, `next_target`/`next_reward_amount`/`next_effective_from` (first day of the next period) are set, the response carries `pendingChange`, and audit records the pending change.
3. **Given** a goal deactivated weeks ago, **When** it is reactivated, **Then** in one transaction every not-yet-closed period that started on/before today becomes a `SKIPPED_INACTIVE` closure (0 participants, no award), `deactivated_at` is cleared, the audit records `{ skippedPeriods, resumesOn }`, and the goal counts again only from the next period.
4. **Given** a weekly goal whose current period is `[Mon…Sun]`, **When** an operator PATCHes `endsAt` to a date inside the current period, **Then** the request fails `422 GOAL_END_IN_CURRENT_PERIOD` ("A goal can only end after the current period. To stop it now, deactivate it.").
5. **Given** `startsAt` that is not the first day of a period, or before the current period, **When** the goal is created, **Then** it fails `422 GOAL_START_NOT_ALIGNED` or `GOAL_START_IN_PAST` respectively.

---

### User Story 3 - Review (approve / void) reward awards (Priority: P2)

As an Admin Master / Operator, I need to see the promised-vs-achieved summary of a period and approve or void each reward award — approval being concurrency-safe and any system-generated award approvable by any AM/OP (including whoever created the goal) — so that only legitimate bonuses move forward, with an audit trail.

**Why this priority**: 03.13 (backend). It turns raw awards into reviewed ones and provides the summary the web panel (F08-3) renders, but the awards exist and are correct without it (US1), so it ranks after the engine and CRUD.

**Independent Test**: Exercise `approve-reward-award`/`void-reward-award` use cases and routes; assert the `PENDING → APPROVED` CAS lets exactly one of two concurrent approvers win (the other gets `409`), approval invokes the no-op `IRewardAwardApprovalHook`, void requires a reason and stores an optional `inspectorNote`, `PAID`/`VOID` cannot be approved or voided here, there is no `mark-paid` route, idempotency is enforced, and all non-AM/OP roles get `403`.

**Acceptance Scenarios**:

1. **Given** a `PENDING` award, **When** an OP approves it with an `Idempotency-Key`, **Then** it becomes `APPROVED` with `approved_by`/`approved_at`, the approval hook runs (no-op in this slice), and audit `reward_award.approved` records before/after.
2. **Given** two operators approving the same `PENDING` award simultaneously, **When** both commit, **Then** the `updateMany WHERE status='PENDING'` CAS lets one win and the other, after re-reading, gets `409 REWARD_AWARD_INVALID_STATUS`.
3. **Given** an `APPROVED` award, **When** an operator voids it with a `reason` (5–500) and optional `inspectorNote` (≤ 200), **Then** it becomes `VOID` with `voided_by`/`voided_at`/`void_reason`/`inspector_note` and audit `reward_award.voided`.
4. **Given** a `PAID` award (constructed only in tests here), or a `POST …/mark-paid` call, **When** an operator tries to void it or pay it, **Then** the void returns `409 REWARD_AWARD_INVALID_STATUS` and the mark-paid route returns `404` (no route; Q12).

---

### User Story 4 - Extend the F07 facts engine with scope and service dates (Priority: P2)

As the platform, I need F07's `computeMetric`/`computeAll` to accept an optional `{ regionId?, serviceTypeId? }` scope and to expose `completedServiceDates`, so region-/service-type-scoped volume goals and "achieved on" dates can be evaluated — **without changing F07's existing behaviour, numbers, or query count**.

**Why this priority**: Region/service-type volume goals and the `achievedOn` date depend on it, but the common (unscoped) goals and the index work without it; it ranks with the other engine extensions.

**Independent Test**: Add regression cases to `reliability-metrics.service.test.ts` proving unscoped results and query counts are identical to F07, scoped results filter to the region (PostGIS intersect) or service type, `completedServiceDates` equals the completed-count dates in ascending order, and the volume reference stays unscoped.

**Acceptance Scenarios**:

1. **Given** no scope, **When** `computeAll`/`computeMetric` run, **Then** every existing F07 worked-example number (Ana 88.3, Dan 89.0, Eva 100, Fábio 97.5, median 9.5) and the query count are unchanged.
2. **Given** `computeAll(from, to, ids, { regionId })`, **When** facts load, **Then** Q1/Q2(both branches)/Q3 filter to appointments whose property intersects the region's `geom` (any region status; properties without coordinates excluded), while `loadCompletedCounts` (the volume reference) stays unscoped.
3. **Given** a computation, **When** it returns, **Then** each inspector's `completedServiceDates` is ascending, may repeat, and has `length === completedCount`.

---

### User Story 5 - Derive level, streak, standing, and partial progress (Priority: P2)

As the platform (for TASK-F08-2/4), I need to derive an inspector's level (Bronze/Silver/Gold from the current index), their streak (consecutive closed periods with at least one award in the smallest cycle they participate in), their combined "standing", and their on-demand partial progress against active goals — all without a dedicated table — so early access (F08-2) and the Challenges screen (F08-4) have one source of truth.

**Why this priority**: Required by later F08 tasks but not by US1/US3; it is a read model over the data US1 produces.

**Independent Test**: Unit-test `resolveInspectorLevel`/`isEarlyAccessLevel`, `computeStreak`/`isStreakAtRisk`, `compareAwardsForRanking`, and `InspectorProgramStandingService.getStanding`/`getActiveGoalProgress(ForMany)`/`hasEarlyAccess` against fakes and fixtures.

**Acceptance Scenarios**:

1. **Given** index scores `null`, `59.9`, `60`, `84.9`, `85`, `100` with `{ silverMinScore: 60, goldMinScore: 85 }`, **When** levels are resolved, **Then** they are `null`, Bronze, Silver, Silver, Gold, Gold.
2. **Given** an inspector who was a participant in the last 3 consecutive closed weekly periods, each with a non-void award, **When** the streak is computed, **Then** it is `{ cycle: 'WEEKLY', count: 3 }`; a period with participation but no award stops the count, a period with no participation is skipped.
3. **Given** an active goal whose next period starts within 7 days and which has no evaluable current period (not started, or current skipped), **When** partial progress is requested, **Then** it returns `state 'UPCOMING'` without calling `computeAll`.

---

### User Story 6 - Configure the inspector-program platform setting (Priority: P3)

As an Admin Master, I need an `inspectorProgram` platform setting holding the level thresholds and the early-access configuration, so levels and (later) early access can be tuned without a deploy.

**Why this priority**: The engine reads it, but ships with sensible defaults; the generic F03 `GET/PUT /v1/platform-settings/:key` already serves it (server-side `enabledAt` fill is TASK-F08-2).

**Independent Test**: Validate `PLATFORM_SETTINGS_REGISTRY.inspectorProgram` defaults and schema (Silver/Gold thresholds `0 < silver < gold ≤ 100` one decimal; `earlyAccess.hours` integer 1–72; `enabledAt` ISO-8601-with-Z or null) and that `resolvePlatformSettingValue('inspectorProgram', null)` returns defaults.

**Acceptance Scenarios**:

1. **Given** no stored value, **When** resolved, **Then** it is `{ levels: { silverMinScore: 60, goldMinScore: 85 }, earlyAccess: { enabled: false, hours: 12, minLevel: 'GOLD', enabledAt: null } }`.
2. **Given** `silverMinScore === goldMinScore`, **When** validated, **Then** it is rejected with "Gold must be above Silver" at `levels.goldMinScore`.
3. **Given** `earlyAccess.hours` of `0`, `73`, or `1.5`, **When** validated, **Then** it is rejected (integer 1–72).

---

### User Story 7 - List canonical periods for the selectors (Priority: P3)

As an Admin Master / Operator (through the F08-3 web selectors), I need a route that returns the canonical periods for a period type, either upcoming (from the current one) or past (from the last closed one), so the web can offer period pickers without duplicating the period math.

**Why this priority**: A thin read endpoint used by the web; the program works without it, so it ranks last.

**Independent Test**: Call `GET /v1/inspector-program/periods` with `direction=upcoming|past` and `count`, asserting `upcoming` starts at the current period (`IN_PROGRESS`) and moves forward, `past` starts at the last closed period and moves backward (no current), and `from` is rejected (`.strict()`).

### Edge Cases

- **Goal created mid-period**: services since the period start count (P5); the partial-progress read exposes `countsSince = periodStart` so the app can say "Counts jobs since {date}".
- **Goal edited mid-period** (L-F08-02): `title` and `endsAt` take effect immediately; `target` and `rewardAmount` only from the next period (`next_*`), so the closing period uses the terms the inspector tracked. An edit between the period end (Sun 23:59) and the close (Mon 04:45) also only affects the following period.
- **Goal deactivated before a finished period closes**: nothing closes. On reactivation (next day or months later) every not-yet-closed period started up to today, including the current one, becomes `SKIPPED_INACTIVE` (no award, no "promised"); the goal counts again from the next period. No retroactive catch-up.
- **`endsAt` shortened**: accepted only ≥ the end of the current period; to stop now, deactivate.
- **Reactivate/deactivate several times in one period** (L-F08-02): the current period already has its `SKIPPED_INACTIVE` closure from the first reactivation; `skipDuplicates` prevents a duplicate row.
- **`pendingChange` on a goal deactivated before `next_effective_from`** (L-F08-02): reactivation's skipped periods don't promote the terms; promotion happens on the first run with `today ≥ next_effective_from` and no earlier pending period.
- **Inspector deactivated before close**: does not participate; an award already created stays.
- **Region deleted**: blocked while any active goal uses it (`409`); with only inactive goals the delete proceeds (`onDelete: SetNull`) and those goals keep `scope_label` but cannot be reactivated (`422 GOAL_SCOPE_REGION_DELETED`).
- **Service type**: there is no service-type delete in the codebase; `onDelete: Restrict` covers it.
- **Job did not run for days**: startup and the next schedule close up to `CLOSE_CATCH_UP_MAX_PERIODS = 8` overdue periods per goal, oldest first, with a `warn` when capped.
- **F07 snapshot stale** (DR2): `getCurrentIndexes` returns the latest ≤ today; closure proceeds with it, stores `index_snapshot_date`, logs `inspector_program.index_snapshot_stale` when `snapshotDate < today`, and is not redone when today's snapshot arrives; no snapshot at all → `index_score_at_close`/`level_at_close`/`index_snapshot_date` null.
- **Weekly goal with `volumeReferenceOverride`** (DR3): the `INDEX_AT_LEAST` score uses the batch's period-scaled reference; volume goals count services and are unaffected.
- **Late data after close** (DR4): a later `NOT_EXECUTED` rejection (even the late one F07 counts in the rejection's period) affects only the index and future levels, never a closed period or an existing award; an operator voids the award instead.
- **Overlapping goals** (L-F08-04): the same completed service counts in every goal whose scope it satisfies; an inspector can earn multiple bonuses; no cap or budget this phase.
- **Sydney DST**: the `04:45` run is outside the skipped/repeated hour (02:00–03:00).
- **Award approved between this task and F08-6**: it stays `APPROVED` with no ledger entry; F08-6 does not backfill (the two deploy together).

## Requirements *(mandatory)*

### Functional Requirements

**Shared — enums, labels, constants**

- **FR-001**: The shared package MUST export (`as const` object + type, matching `reason-codes.ts`) `GoalMetric` with exactly `['VOLUME','REGION_VOLUME','SERVICE_TYPE_VOLUME','INDEX_AT_LEAST','PUNCTUALITY','GEOFENCE','NO_STUCK','SATISFACTION','LATE_NOTICE','CANT_DO_MAX']`, `GoalComparator` (`GTE`, `LTE`), `RewardAwardStatus` (`PENDING`, `APPROVED`, `PAID`, `VOID`), and `InspectorLevel` (`BRONZE`, `SILVER`, `GOLD`).
- **FR-002**: The shared package MUST export `GOAL_METRIC_COMPARATOR` (`CANT_DO_MAX → 'LTE'`, the other nine → `'GTE'`), `GOAL_METRIC_RELIABILITY_KEY` (`PUNCTUALITY`/`GEOFENCE`/`NO_STUCK`/`SATISFACTION`/`LATE_NOTICE` identity, `CANT_DO_MAX → CANT_ATTEND`, volumes and `INDEX_AT_LEAST → null`), and `GOAL_METRIC_KIND` (3 volumes → `'VOLUME'`, `INDEX_AT_LEAST → 'INDEX'`, 6 rates → `'RATE'`).
- **FR-003**: The shared package MUST export complete English `GOAL_METRIC_LABELS`, `REWARD_AWARD_STATUS_LABELS`, `INSPECTOR_LEVEL_LABELS`, and the constants `GOAL_RATE_MINIMUM_VOLUME = 10`, `CLOSE_CATCH_UP_MAX_PERIODS = 8`, `UPCOMING_GOAL_LOOKAHEAD_DAYS = 7`. Period type reuses the existing `BillingPeriodType`.

**Shared — level library**

- **FR-004**: The shared package MUST export pure functions `resolveInspectorLevel(score, { silverMinScore, goldMinScore })` (`null` → `null`; `< silver` → Bronze; `< gold` → Silver; else Gold), `isEarlyAccessLevel(level, minLevel)` (Gold ≥ Silver true; Bronze ≥ Silver false; null false), and `minScoreForLevel(level, levels)` (Bronze → 0, Silver → silver, Gold → gold; used by the TASK-F08-2 SQL).

**Shared — inspectorProgram platform setting**

- **FR-005**: `PLATFORM_SETTINGS_REGISTRY` MUST gain an `inspectorProgram` entry (schema + defaults + `section: 'inspectorProgram'`) with `levels` (`silverMinScore`, `goldMinScore`, each `0 < x ≤ 100` one decimal, refined `goldMinScore > silverMinScore` → "Gold must be above Silver" at `levels.goldMinScore`) and `earlyAccess` (`enabled` boolean, `hours` integer 1–72, `minLevel` `InspectorLevel`, `enabledAt` ISO-8601-with-`Z` string or null; the client-sent `enabledAt` is ignored — server fill is TASK-F08-2).
- **FR-006**: The `inspectorProgram` defaults MUST be `{ levels: { silverMinScore: 60, goldMinScore: 85 }, earlyAccess: { enabled: false, hours: 12, minLevel: 'GOLD', enabledAt: null } }`, and `resolvePlatformSettingValue('inspectorProgram', null)` MUST return them.

**Shared — Zod schemas**

- **FR-007**: The shared package MUST export `createGoalSchema` enforcing: `title` 1–120 trimmed; `metric`; optional `comparator` defaulting to `GOAL_METRIC_COMPARATOR[metric]` and rejected when it disagrees ("This metric uses 'at most'"); scope rules per P2 (`REGION_VOLUME` requires `scopeRegionId`, `SERVICE_TYPE_VOLUME` requires `scopeServiceTypeId`, other metrics reject those scopes, `scopeInspectorId` optional for any); `target` (volume integer 1–10000; rate `0 < x ≤ 100` two decimals; `INDEX_AT_LEAST` `0 < x ≤ 100` one decimal); `rewardAmount` `0 < x ≤ 99999.99` two decimals; `startsAt` civil date; optional `endsAt` civil date rejected when before `startsAt`.
- **FR-008**: The shared package MUST export `updateGoalSchema` (`.strict()`) accepting only `title`, `target`, `rewardAmount`, `endsAt`, `active`; any of `metric`/`period`/`scope*`/`startsAt` → "This field can't be changed. Create a new goal instead."; an empty object → "Nothing to update".
- **FR-009**: The shared package MUST export `voidAwardSchema` (`.strict()`) `{ reason: 1–500 (min 5 on the route), inspectorNote?: 1–200 }` with no `recoveryNote` field (Q12), and `programPeriodsQuerySchema` (`.strict()`) requiring `periodType`, `direction` (`upcoming|past`), `count` (1–26), rejecting `from`.
- **FR-010**: The shared package MUST export the response and query schemas `goalResponseSchema`, `goalsListResponseSchema`, `listGoalsQuerySchema`, `programPeriodsResponseSchema`, `rewardAwardResponseSchema`, `rewardAwardsListResponseSchema`, `listAwardsQuerySchema`, `programPeriodSummaryQuerySchema`, and `programPeriodSummaryResponseSchema`, matching the Contracts tables.

**Shared — permissions (append only)**

- **FR-011**: `ROLE_ACTION_MATRIX` MUST gain `inspector_program.goals.manage`, `inspector_program.awards.view`, `inspector_program.awards.approve`, `inspector_program.awards.void` (each `AM`, `OP`) and `inspector_program.view_own` (`INSP`), appended at the end. No `awards.pay` (Q12); the AM-only void-after-invoicing action is TASK-F08-6.

**F07 facts engine extension (owned here, behaviour-preserving)**

- **FR-012**: `IReliabilityFactsReader.load` MUST accept an optional `scope?: ReliabilityFactsScope = { regionId?: string; serviceTypeId?: string }` (exported from `domain/reliability-facts.reader.ts`); the Prisma reader MUST add it to Q1, both branches of Q2, and Q3 (Algorithm A) with explicit `::text` casts, leaving Q4–Q6 and `loadCompletedCounts` unchanged. With no scope both predicates are true and the result equals F07's.
- **FR-013**: `computeMetric(metric, inspectorId, from, to, scope?)` and `computeAll(from, to, inspectorIds?, scope?)` MUST forward the scope; `computeAllWith` is unchanged; the query count MUST equal F07's for the same call (6 without `inspectorIds`, 7 with).
- **FR-014**: `InspectorReliabilityComputation` MUST gain `completedServiceDates: CivilDate[]` — the service dates of the counted completions (P2 of F07 by fact type, agency timezone), ascending, with repetition, `length === completedCount`. Before changing the shape, all mocks of `computeAll`/`InspectorReliabilityComputation` MUST be grepped and updated.
- **FR-015**: The scoped region predicate MUST be `EXISTS (… service_regions sr WHERE sr.id = $7 AND sr.geom IS NOT NULL AND p.coordinates IS NOT NULL AND ST_Intersects(sr.geom, p.coordinates))`, independent of region status (P4); a region with `geom NULL` matches no service. The volume reference (`loadCompletedCounts`) MUST stay unscoped.

**Backend — persistence (migration, expand-only, no `tenant_id`)**

- **FR-016**: The migration MUST add enums `GoalMetric`, `GoalComparator`, `RewardAwardStatus` and tables `inspector_goals`, `reward_awards`, `goal_period_closures` as modelled (no `tenant_id`), with the uniques `reward_awards(goal_id, inspector_id, period_start)` and `goal_period_closures(goal_id, period_start)`, the listed indexes, and the CHECK constraints (scope-per-metric, comparator-per-metric, `ends_at ≥ starts_at`, positive target/reward, `active = (deactivated_at IS NULL)`, `next_terms`, and `reward_awards_status_fields_chk` where `VOID` may hold `paid_at` for F08-6's void-after-paid and `PAID` requires `paid_at`). The generated migration MUST NOT drop any existing `Unsupported()` index and MUST be applied locally.
- **FR-017**: Civil dates MUST be `@db.Date` and instants `timestamp(3)` in UTC; decimals surface as `number`; each date field's timezone MUST follow the DR5 table (periods and `index_snapshot_date` are civil dates in `PLATFORM_TIMEZONE`, an explicit exception to the agency-timezone default because the program is platform-scoped).

**Backend — period math (pure domain)**

- **FR-018**: `goal-periods.ts` MUST reuse the billing period functions (`getCanonicalPeriod`, `isCycleAligned`, `computeClosedPeriods`, `periodDateColumns`) **without copy or change**, and MUST export `goalPeriodsToClose(goal, today, closedStarts)` (ended, unclosed periods within `[starts_at, ends_at]`, ≤ `CLOSE_CATCH_UP_MAX_PERIODS`, oldest first, excluding `SKIPPED_INACTIVE` starts, `warn` when capped), `currentGoalPeriod(goal, today)`, `periodsToSkipOnReactivation(goal, today, closedStarts)` (every canonical period with `start ≤ today`, within range, unclosed; no cap), `goalTermsForPeriod(goal, periodStart)` (current vs `next_*` by `next_effective_from`), and `minEndsAt(goal, today)` (end of the current or first period).

**Backend — evaluation, participants, streak, ordering, summary (pure domain)**

- **FR-019**: `evaluateGoal(goal, computation | undefined, ctx)` MUST implement: volumes — `value = completedCount ?? 0`, `achieved = value ≥ target`, `achievedOn = completedServiceDates[target − 1]`; `INDEX_AT_LEAST` — `computeReliabilityScore(metrics, ctx.reliabilityIndex, volume)`, `achieved = SCORED && score ≥ target`, `INSUFFICIENT_VOLUME → NOT_ENOUGH_SERVICES`, `NO_WEIGHTED_DATA → NO_DATA`, `achievedOn = periodEnd`; rates — `volume < 10 → NOT_ENOUGH_SERVICES`, `rate === null → NO_DATA` **except** `LATE_NOTICE` which becomes `value 100` and continues (DV6), `value` by P8 (`roundHalfUp(rate×100, 2)`, `CANT_DO_MAX` uses `(1−rate)×100`), comparison by the comparator, `achievedOn = periodEnd`. Missing computation → `{ achieved: false, value: 0, serviceCount: 0 }`.
- **FR-020**: `evaluateGoal` MUST NOT read `volumeReferenceOverride` or re-scale volume/pro-rata (DR3); volume goals compare the raw `completedCount`; `INDEX_AT_LEAST` uses the batch's already-scaled `volumeReference` and pro-rated `VOLUME.rate`.
- **FR-021**: `resolveParticipants(goal, inspectors, regionLinks)` MUST return active, non-deleted inspectors filtered by scope: unscoped → all; `REGION_VOLUME` → linked to the region; `SERVICE_TYPE_VOLUME` → those whose `service_types_json` has the type; `scope_inspector_id` → only that inspector (if active), intersected with the metric's scope.
- **FR-022**: `computeStreak({ today, participations })` MUST pick the smallest participated cycle (WEEKLY < FORTNIGHTLY < MONTHLY), walk back over that cycle's distinct closed `periodStart`s the inspector participated in (awarded → count++, participated-without-award → stop, no participation → skip), with a 104-period lookback; `isStreakAtRisk(...)` MUST be true only when `streak ≥ 1`, today is the last day of the current cycle period, the inspector participates in a goal of that cycle, and nothing is achieved yet.
- **FR-023**: `compareAwardsForRanking` (P9) MUST order by value (higher first for `GTE`, lower for `CANT_DO_MAX`), then `indexScoreAtClose` desc (null last), then `achievedOn` asc, then `inspectorId` asc — ordering only, no winner cap.
- **FR-024**: `summarizePeriod` (P10) MUST compute `promised = Σ reward_amount × participants`, `achieved = Σ non-void awards`, split by `approved`/`paid`/`pending`/`voided`; an open period takes participants from the caller, `achieved 0`, `status 'IN_PROGRESS'`.

**Backend — goal CRUD & region guard (application)**

- **FR-025**: `create-goal` MUST validate scope existence (`422 GOAL_SCOPE_{REGION,SERVICE_TYPE,INSPECTOR}_NOT_FOUND`), period alignment (`422 GOAL_START_NOT_ALIGNED`, `GOAL_END_NOT_ALIGNED` via `isCycleAligned`), and `startsAt` not before the current period (`422 GOAL_START_IN_PAST`); it MUST set `created_by_user_id` and audit `inspector_goal.created`. No DELETE route; no `Idempotency-Key`.
- **FR-026**: `update-goal` MUST: write `target`/`rewardAmount` as `next_*` for a running goal and directly for a not-yet-started goal; reject `endsAt < minEndsAt` (`422 GOAL_END_IN_CURRENT_PERIOD`) and misaligned `endsAt` (`422 GOAL_END_NOT_ALIGNED`); on `active:false` set `deactivated_at` and audit `inspector_goal.deactivated`; on `active:true` write the `SKIPPED_INACTIVE` closures in the same transaction, clear `deactivated_at`, and audit `inspector_goal.reactivated { skippedPeriods, resumesOn }`; reject reactivation of a region-deleted goal (`422 GOAL_SCOPE_REGION_DELETED`); a PATCH with no real change returns `200` with no audit; every real change audits before/after only of changed fields and sets `updated_by_user_id`.
- **FR-027**: `list-program-periods` MUST implement `direction` (DL10): `upcoming` from the current period forward (`IN_PROGRESS` then `UPCOMING`), `past` from the last closed period backward (`CLOSED`, excluding the current), rejecting `from`.
- **FR-028**: Region deletion MUST be guarded by a small port `IRegionGoalUsageChecker` (in the `service-region` domain, implemented by `inspector-program` via `IGoalRepository.countActiveByScopeRegionId`), wired as an **optional trailing constructor parameter** of `DeleteServiceRegionUseCase`, checked **after** the existing active-region and published-group checks, raising `ServiceRegionHasActiveGoalsError` (`ConflictError('SERVICE_REGION_HAS_ACTIVE_GOALS', "This region is used by {n} active goals. Deactivate them first.", { activeGoalCount })`); `delete` is not called and nothing is audited when it fires.

**Backend — closure, reactivation, reward actions, standing (application)**

- **FR-029**: `CloseGoalPeriodsUseCase.execute({ trigger, now })` MUST: compute `today` in `PLATFORM_TIMEZONE`; find active goals and their pending periods via `goalPeriodsToClose` using `goalTermsForPeriod`; read `inspectorProgram` and `reliabilityIndex` once via `IPlatformSettingsReader.get` (no `getUncached`); load active inspectors and region links once; group `(goal, period)` by `(periodStart, periodEnd, scopeKey)` and call `computeAll(periodStart, periodEnd, participantIds, scope)` once per group; read `getCurrentIndexes(allParticipantIds)` once; and, per `(goal, period)`, in one transaction `createMany` the closure (`skipDuplicates`; `count 0` → stop, the period is already closed) then the achievers' awards with the goal snapshot and `index_score_at_close`/`level_at_close = resolveInspectorLevel(score, settings.levels)`/`index_snapshot_date`, re-read the created ids, promote `next_*` when due, and, after commit, audit `goal_period.closed` and one `reward_award.created` per award.
- **FR-030**: Closure MUST follow DR2 for the snapshot: use the `snapshotDate` returned by `getCurrentIndexes` (latest ≤ today, or null), store it in the closure and each award, log `warn inspector_program.index_snapshot_stale { snapshotDate, today }` when `snapshotDate < today`, proceed regardless, store null score/level/date when there is no snapshot, and never re-close an already-closed period.
- **FR-031**: The closure's last compute-phase step (`ScheduleMessagesRunStep`) MUST enqueue `inspector-program.daily { trigger: 'MESSAGES' }` with `startAfter = messagesRunAt(now)` and `singletonKey 'inspector-program.messages:' + today`; `messagesRunAt(now)` (pure, testable) MUST return 08:00 `PLATFORM_TIMEZONE` of today, or `now` if already past. There MUST be no second `boss.schedule` for the queue. A `MESSAGES` run MUST run only message steps (registered by TASK-F08-4) and enqueue nothing.
- **FR-032**: Reactivation (`update-goal`, `active → true`) MUST, in the PATCH transaction, `createMany({ skipDuplicates })` a `SKIPPED_INACTIVE` closure (empty participants, zero counts, `promised_amount 0`, current `scope_label`, `closed_at = now`) for each `periodsToSkipOnReactivation` period, clear `deactivated_at`, and set the response `resumesOn` to the first period after today; the daily job then closes nothing for those periods.
- **FR-033**: `approve-reward-award` MUST use idempotency (`tryAcquire(key, 'reward-award', hash({ awardId, action, body, actor.userId }), 24h)`), a `PENDING → APPROVED` CAS (`updateMany WHERE status='PENDING'`; 0 rows → re-read → `409 REWARD_AWARD_INVALID_STATUS`), allow any AM/OP (no self-approval check — system awards have no author, DV2), set `approved_by`/`approved_at`, invoke `IRewardAwardApprovalHook` (no-op default) inside the transaction, and audit `reward_award.approved` before/after. `APPROVED`/`PAID`/`VOID` → `409`.
- **FR-034**: `void-reward-award` MUST void only `PENDING`/`APPROVED` (CAS `updateMany WHERE status IN ('PENDING','APPROVED')`), require `reason` (5–500), store optional `inspectorNote` (≤ 200), set `voided_by`/`voided_at`/`void_reason`, invoke the same extension hook, and audit `reward_award.voided`; `PAID`/`VOID` → `409` (void-after-invoicing is TASK-F08-6). There MUST be no `mark-paid` route.
- **FR-035**: `InspectorProgramStandingService` MUST expose `getStanding(inspectorId, now)` (index score/status/snapshotDate/position + level + streak with `atRisk`), `getActiveGoalProgress(inspectorId, now)` and `getActiveGoalProgressForMany(inspectorIds, now)` (partial progress per Algorithm F, grouping by `(period, scope)`, one `computeAll` per group, `goalTermsForPeriod` terms, `countsSince`, and the `UPCOMING` state within `UPCOMING_GOAL_LOOKAHEAD_DAYS`), and `hasEarlyAccess(inspectorId, now)` (level vs setting; `{ hasAccess, reason }`). A goal whose current period is `SKIPPED_INACTIVE` has no progress.

**Backend — job/worker, container, routes**

- **FR-036**: The worker MUST register one `boss.schedule('inspector-program.daily', '45 4 * * *', {}, SYDNEY_TZ)` and `boss.work` with `withJobMetrics`, behind `INSPECTOR_PROGRAM_JOBS_ENABLED` (default true); on startup it MUST enqueue `{ trigger: 'STARTUP' }` with `singletonKey 'inspector-program.daily'` only when a period is overdue; the handler MUST forward `job.data.trigger` to the use case. No `0 8 * * *` schedule.
- **FR-037**: The DI container MUST expose `container.inspectorProgram` (use cases, `standingService`, `regionGoalUsageChecker`) wired with `container.reliability.metricsService`/`indexReader`/snapshot repo, `IPlatformSettingsReader`, `AuditService`, `IIdempotencyService`, `AuthorizationService`, and register the routes.
- **FR-038**: All `inspector-program` routes MUST use `preHandler: authenticate`, shared schemas, and the `{ error: { code, message, details } }` envelope; AM/OP get 2xx, `CL_ADMIN`/`CL_USER`/`INSP`/`TNT` get `403` before any read, no token gets `401`; `GET /goals/:id` of a missing goal returns `404 GOAL_NOT_FOUND`; response schemas strip undeclared fields.

**Multi-tenant & privacy**

- **FR-039**: `inspector_goals`, `reward_awards`, and `goal_period_closures` MUST carry **no `tenant_id`** (D12, explicit §7.1 exception). Isolation MUST be: (a) AM/OP role check for admin routes and `INSP` + linked-inspector for own-data reads, before any read; (b) no agency route reads these tables; (c) no row stores an agency name, address, or coordinate. A route test MUST prove `CL_ADMIN`/`CL_USER`/`INSP`/`TNT` cannot reach the admin routes (403).

### Key Entities *(include if feature involves data)*

- **InspectorGoal**: a platform goal (no `tenant_id`) — `title`, `metric`, fixed `comparator`, `target`, `period`, optional scope (`scope_region_id`/`scope_service_type_id`/`scope_inspector_id`), `reward_amount`, `starts_at`, optional `ends_at`, `active`/`deactivated_at`, pending terms (`next_target`/`next_reward_amount`/`next_effective_from`), author/updater.
- **RewardAward**: one inspector's reward for one goal and period (no `tenant_id`) — immutable goal snapshot (`goal_title`/`metric`/`comparator`/`target`/`amount`/`scope_label`), result (`achieved_value`/`service_count`/`achieved_on`/`index_score_at_close`/`level_at_close`/`index_snapshot_date`), lifecycle (`status` `PENDING→APPROVED→PAID`/`VOID`, `approved_*`, `paid_at` filled by F08-6, `voided_*`/`void_reason`/`inspector_note`). Unique `(goal_id, inspector_id, period_start)`.
- **GoalPeriodClosure**: the record that a goal's period was processed (no `tenant_id`) — `period_*`, `participant_ids`, counts, `promised_amount`, `scope_label`, `index_snapshot_date`, `trigger` (`SCHEDULED`/`STARTUP`/`SKIPPED_INACTIVE`), `closed_at`. Unique `(goal_id, period_start)`; the idempotency barrier for closing.
- **inspectorProgram platform setting**: cross-tenant (`PlatformSetting`, no `tenant_id`) — level thresholds and early-access config.
- **InspectorStanding / GoalProgress**: in-memory read models (`InspectorProgramStandingService`) combining the F07 index, derived level, derived streak, and per-goal partial progress; not persisted.

## Success Criteria *(mandatory)*

### Acceptance criteria 03.A4, 03.A5 *(identifiers verbatim from TASK-F08-1; prose in English per Constitution §Commits)*

- **03.A4 (backend)** — A goal met in a closed period yields, through the job, exactly one `PENDING` `RewardAward` per achieving inspector, visible in `GET /awards` and summed in `GET /summary` (domain test + route). The end-to-end proof is the TASK-F08-3 E2E.
- **03.A5** — Creating, editing, deactivating/reactivating a goal and approving/voiding an award all produce audit entries with author and timestamp (before/after); changes to `inspectorProgram` produce `platform_setting.updated` (F03).
- **03.A3** — Not applicable to this slice (the anonymous ranking is TASK-F08-4).
- **Concurrency** — Two simultaneous approvers → one wins, the other gets `409` (CAS).
- **Idempotency** — Neither the job nor the actions duplicate writes (closure and award uniques; `Idempotency-Key` on actions).
- **F07 intact** — Without a scope, F07's tests pass unchanged (numbers and query count).
- **Region** — Deleting a region used by an active goal returns `409` with a clear message, never `500`.
- **Q18** — `CL_*`, `INSP`, `TNT` → `403`.
- **Q12** — No manual-payment route or permission; void only `PENDING`/`APPROVED`.
- **Messages split (L-F08-01)** — The `04:45` run sends no message; it enqueues the 08:00 `MESSAGES` run on the same queue, with no second `boss.schedule`.

### Measurable Outcomes

- **SC-001**: A weekly `VOLUME ≥ 10` goal with 3 participants (2 achievers) closed by the job creates exactly 2 `PENDING` awards (`amount 30`) and 1 closure (`participants 3`, `achievers 2`, `promised 90`); re-running the job the same day creates nothing.
- **SC-002**: Evaluating the F07 worked-example inspectors reproduces every documented goal outcome in `evaluate-goal.test.ts` (volume, region, rate below/at/above target, `CANT_DO_MAX` boundary, rounding P8, null-rate P7, `LATE_NOTICE` DV6 exception, index at/below target, insufficient volume).
- **SC-003**: With no scope, `reliability-metrics.service.test.ts` and the DB facts-reader test produce results deep-equal to F07's and the same query count (6 / 7); with a scope, results filter to the region/service type and the volume reference stays unscoped.
- **SC-004**: `resolveInspectorLevel`, `computeStreak`/`isStreakAtRisk`, and `compareAwardsForRanking` match every row of their tables, including null handling and the smallest-cycle streak rule.
- **SC-005**: Two concurrent `approve` calls on one `PENDING` award end with one `APPROVED` and one `409`; a `void` of a `PAID` award and a `POST …/mark-paid` return `409` and `404` respectively.
- **SC-006**: A stale F07 snapshot (today's missing) still closes the period, storing `index_snapshot_date = latest` and logging `inspector_program.index_snapshot_stale`, and no closed period is redone when today's snapshot later arrives.
- **SC-007**: No `inspector_program` row, response, or log line contains an agency name, address, or inspector coordinate; all agency/portal roles receive `403` from the admin routes.

## Assumptions

The following product decisions are **settled** in `F08-tarefas.md` (plan 2026-10-27, dev 2026-10-28 P1–P11, gaps 2026-10-29 L-F08-01…14, reconciliation 2026-10-29 DR1–DR7, Q12 decided 2026-10-30) and are adopted here as premises; no open clarification remains for this slice:

- **D1 / Q12 boundary** (adopted): the bonus lives in billing but only TASK-F08-6 touches it; this slice leaves a no-op `IRewardAwardApprovalHook` and has no manual-payment path. Between merges an approved award stays `APPROVED`.
- **D12 multi-tenant exception** (adopted): goals, awards, and closures carry no `tenant_id`; isolation is by RBAC and by `inspectorId`.
- **D3/D4/D5/D6/D8** (adopted): three levels by index band (configurable), independent cumulative goals (no cap), the metric set and its rate-minimum of 10 services, the fixed closing rules, and agencies seeing nothing (403).
- **DV1/DV2/DV6** (adopted): rewards are cash only; a system award has no author so any AM/OP approves it (CAS for concurrency); `LATE_NOTICE` with zero late services and ≥ 10 services counts as achieved (value 100).
- **P1–P11** (adopted): fixed comparator per metric; scope requirements per metric; participants = active, non-deleted, scope-filtered at close; a service's region by PostGIS intersect; canonical billing periods with `isCycleAligned`; `INDEX_AT_LEAST` recomputed over the goal period; null-rate not achieved (except `LATE_NOTICE`); `% = roundHalfUp(rate×100, 2)`; the ordering-only tie-break; "promised" = `reward_amount × participants`; streak = smallest participated cycle walked back over participated periods.
- **DL1–DL13** (adopted): 08:00 aggregated messages via same-queue `startAfter`; reactivation `SKIPPED_INACTIVE` + `endsAt ≥ current period` + next-period terms; void of `PENDING`/`APPROVED` with internal reason and `inspectorNote`; `direction` period semantics; `scope_label` snapshot; and the related copy/column gaps that belong to later tasks.
- **DR1–DR5** (adopted): service date = F07 P2; snapshot read with the latest ≤ today and stored as `index_snapshot_date`; volume by count with the batch's scaled reference for the index; closure definitive; per-field timezone per the DR5 table.
- **Dependencies merged before this slice**: TASK-X00-1, TASK-F07-1 (`ReliabilityMetricsService.computeMetric`/`computeAll`, `computeReliabilityScore`, facts reader), TASK-F07-2 (snapshots, `getCurrentIndexes`, `reliability.compute-snapshots` 04:15), TASK-F03-1 (`PLATFORM_SETTINGS_REGISTRY`, `IPlatformSettingsReader.get`).

### Security tradeoff (known limitation)

Rewards are driven by the F07 reliability index and by completed-service counts, both of which trust client-reported inputs (device timestamps rescuing a `LATE` start, self-reported GPS accuracy excluding a far check-in) per F07's inherited F03 **D25** "never penalise without evidence" rule. Because rewards are **money**, this slice widens the F07 threat surface: an inspector who manipulates their device clock or inflated accuracy could marginally improve metrics that feed a goal. This is a deliberate reuse of the F03/F07 rule for contract consistency; server-side hardening (server time for notice decisions, a GPS-accuracy cap) is a cross-cutting change recorded in `estacionamento` rather than taken here. Mitigations in this slice: awards are `PENDING` until an operator reviews them (two-person control before any payout), every award stores an immutable snapshot (`index_score_at_close`, `index_snapshot_date`, `scope_label`), closure is auditable per award, and an operator can `void` an award with a reason.

### Out of scope

- Any change to `billing`/`financial_entries`/`inspector_invoices` and manual reward payment (TASK-F08-6; manual payment removed 2026-10-30).
- Level-based early access in the offer flow (TASK-F08-2), the web screens (TASK-F08-3), the Challenges PWA + automatic messages (TASK-F08-4), and the program report (TASK-F08-5).
- Non-cash rewards, reward valuation, taxation, badges; reopening periods; recomputing an award with late data; a winner cap; a per-inspector/period bonus cap or budget; automatic paid/void messages; title uniqueness; configuring the streak cycle; evaluating `bonus_rule_json`; automatic late-data detection after close.
