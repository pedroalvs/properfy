# Phase 0 Research — Inspector Program (backend + shared)

All product decisions are settled in `fase2-etapa1/tarefas/F08-tarefas.md` (plan 2026-10-27, dev P1–P11 2026-10-28, gaps L-F08-01…14 2026-10-29, reconciliation DR1–DR7 2026-10-29, Q12 2026-10-30). This file records the **technical** decisions and the alternatives weighed; there were no open `NEEDS CLARIFICATION` items after the spec's Assumptions.

## D1 — Platform-scoped tables (no `tenant_id`)

- **Decision**: `inspector_goals`, `reward_awards`, `goal_period_closures` carry no `tenant_id`.
- **Rationale**: the subject is the cross-tenant inspector; the program is one platform program. Matches `Inspector`, global `ServiceRegion`, `PlatformSetting`, `InspectorReliabilitySnapshot`. Isolation is by RBAC (AM/OP admin; INSP own; CL_*/TNT 403) + `inspectorId` scoping, proven by a route 403 test.
- **Alternatives**: nullable `tenant_id` ("platform") — rejected, invites a silent `if (tenantId)` filter and a fractured per-agency program.

## D2 — One daily job; 08:00 messages via same-queue `startAfter`

- **Decision**: a single `boss.schedule('inspector-program.daily', '45 4 * * *', {}, SYDNEY_TZ)`. The 04:45 compute run **enqueues** the 08:00 message run with `IJobQueue.enqueue(..., { startAfter: messagesRunAt(now), singletonKey: 'inspector-program.messages:<today>' })`.
- **Rationale**: pg-boss 9 keeps one schedule row per name — a second `boss.schedule('…','0 8 * * *')` would silently overwrite the 04:45 one. `messagesRunAt(now)` is a pure, testable function (08:00 Sydney today, or `now` if past). The message steps themselves are registered by TASK-F08-4; here the `MESSAGES` run is a no-op but already enqueued (rollout runs empty).
- **Alternatives**: a second schedule (rejected — overwrite trap, L-F08-01); a separate queue (rejected — unnecessary, breaks the single-fila design).

## D3 — Stale F07 snapshot (DR2)

- **Decision**: closure reads `getCurrentIndexes` (latest `snapshot_date ≤ today`), stores it as `index_snapshot_date`, proceeds even when `snapshotDate < today` (logs `warn inspector_program.index_snapshot_stale`), and stores null index/level/date when there is no snapshot. A closed period is never redone when today's snapshot later arrives.
- **Rationale**: the index only orders the P9 tie-break and sets `level_at_close`; waiting for `reliability.ensure-today` (05:00) would delay rewards for no gain. Settings read with `IPlatformSettingsReader.get` (30 s cache) — F03/F07 expose no `getUncached`.
- **Alternatives**: block closure until today's snapshot (rejected — delays rewards, couples to another job's success).

## D4 — F07 engine extension is behaviour-preserving

- **Decision**: `load({ ..., scope? })` adds scope predicates to Q1, both Q2 branches, and Q3 with explicit `$6::text`/`$7::text` casts; Q4–Q6 and `loadCompletedCounts` unchanged; `completedServiceDates` collected from the counted completions. `computeMetric`/`computeAll` forward `scope?`; `computeAllWith` unchanged.
- **Rationale**: unscoped `NULL` params make predicates vacuously true → identical results and identical query count (6/7). The volume reference (median) must stay unscoped so one goal cannot move the index. Proven by F07's regression tests and the DB query-count test.
- **Alternatives**: a parallel scoped reader in `inspector-program` (rejected — two universe definitions drift).

## D5 — Derived level & streak (no table)

- **Decision**: `resolveInspectorLevel(score, levels)` and `computeStreak({ today, participations })` are pure; the standing service reads `getCurrentIndexes` for the level and `goal_period_closures`/`reward_awards` for the streak/history.
- **Rationale**: level is a pure function of the current index; streak is a pure function of participations. A table would duplicate derivable state (D3/D4 of the task).

## D6 — Approval CAS + no-op extension hook (Q12)

- **Decision**: `approve` uses `updateMany WHERE status='PENDING'` (0 rows → re-read → 409); `void` uses `WHERE status IN ('PENDING','APPROVED')`. Both call `IRewardAwardApprovalHook` (default `NoopRewardAwardApprovalHook`) inside the transaction. No `mark-paid` route; `PAID` and void-after-invoicing arrive in TASK-F08-6.
- **Rationale**: system awards have no author, so any AM/OP approves (DV2, mirroring the `initiated_by NULL` billing CAS precedent). The hook is the single, typed seam F08-6 implements without reopening this code. Between merges an approved award stays `APPROVED`.
- **Alternatives**: building the ledger entry here (rejected — Q12 keeps billing in F08-6); a generic plugin framework (rejected — §V simplicity, one port suffices).

## D7 — Region-delete guard via optional trailing constructor param

- **Decision**: `IRegionGoalUsageChecker` (service-region domain port) implemented by `inspector-program` via `IGoalRepository.countActiveByScopeRegionId`; `DeleteServiceRegionUseCase` gets it as an **optional last constructor parameter**, checked after the existing active-region and published-group checks, raising `ServiceRegionHasActiveGoalsError` (`ConflictError 'SERVICE_REGION_HAS_ACTIVE_GOALS'`).
- **Rationale**: optional-trailing avoids breaking untyped test wirings (memory `project_adding_usecase_dep_breaks_untyped_test_wirings`); the port keeps the dependency pointing inward. `onDelete: SetNull` then leaves inactive-goal regions null (only inactive goals can reach a hard delete).
- **Alternatives**: a hard FK with no guard (rejected — P2003 would surface as 500, not a clear 409).

## D8 — Pending terms applied from the next period (L-F08-02)

- **Decision**: editing `target`/`rewardAmount` on a running goal writes `next_target`/`next_reward_amount`/`next_effective_from`; the closing period uses `goalTermsForPeriod(goal, periodStart)`; promotion of `next_*` happens in the closing transaction (or the first run with `today ≥ next_effective_from` and no earlier pending period).
- **Rationale**: inspectors must be judged on the terms they tracked during the period; any direct read of `target`/`reward_amount` for a period is a bug.

## D9 — Reuse billing period math

- **Decision**: `goal-periods.ts` imports `getCanonicalPeriod`/`isCycleAligned`/`computeClosedPeriods`/`periodDateColumns` from billing; no copy.
- **Rationale**: one definition of civil periods in `PLATFORM_TIMEZONE`; a copy (`canonical-period.ts` duplicate) is explicitly out of scope.

## D10 — Volume by count, index by scaled reference (DR3)

- **Decision**: volume goals compare raw `completedCount`; `INDEX_AT_LEAST` uses the batch's already-scaled `volumeReference` and pro-rated `VOLUME.rate`. `evaluateGoal` never reads `volumeReferenceOverride`.
- **Rationale**: a volume goal is a plain count; the index already accounts for the period length and registration pro-rata via F07's batch.

## Dependencies confirmed merged (origin/develop @ c3d78505)

TASK-X00-1, TASK-F07-1 (metrics service, facts reader, `computeReliabilityScore`), TASK-F07-2 (snapshots, `getCurrentIndexes`, `reliability.compute-snapshots` 04:15), TASK-F03-1 (`PLATFORM_SETTINGS_REGISTRY`, `IPlatformSettingsReader.get`). Baseline worktree build/typecheck/lint of backend + shared: GREEN.
