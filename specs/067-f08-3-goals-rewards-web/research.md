# Research — Goals & Rewards web (TASK-F08-3)

Phase 0 decisions. This feature is a **pure consumer** of merged contracts, so research is mostly "which existing thing do we reuse" and "where do the task's copy/behaviour choices land against the shipped code". All shapes below were read from the code on `develop` (worktree base `1a706ab5`), not paraphrased from the task.

## Consumed contract (verified in `packages/shared`)

- **Routes present in `api-types.ts`** (no regeneration needed): `GET/POST /v1/inspector-program/goals`, `GET/PATCH /v1/inspector-program/goals/{goalId}`, `GET /v1/inspector-program/periods`, `GET /v1/inspector-program/awards`, `GET /v1/inspector-program/summary`, `POST /v1/inspector-program/awards/{awardId}/approve`, `POST /v1/inspector-program/awards/{awardId}/void`; plus `GET/PUT /v1/platform-settings/{key}` (F03) and `GET /v1/dashboard/inspector-performance` (F07).
- **`goalResponseSchema`** already carries everything the Goals list and form need: `scopeRegionName`/`scopeServiceTypeName`/`scopeInspectorName`, `scopeRegionDeleted`, `pendingChange { target, rewardAmount, effectiveFrom }`, `resumesOn`, `minEndsAt`, `currentPeriod`/`lastClosedPeriod`, `deactivatedAt`. → **no extra lookups** for Who/scope/pending-change/resume/ends-floor.
- **`rewardAwardResponseSchema`** carries `scopeLabel`, `achievedValue`, `serviceCount`, `achievedOn`, `indexScoreAtClose`, `levelAtClose`, `status`, `approvedByName`, `voidedByName`, `voidReason`, `inspectorNote`, `goal {id,title}`, `inspector {id,name,email}`, `paidAt` (always null here).
- **`programPeriodSummaryResponseSchema`**: `totals { promised, achieved, approved, paid, pending, voided }` + `goals[] { goalId, title, metric, rewardAmount, participants, promised, achievers, achievedAmount, closed, skipped }`.
- **`programPeriodsResponseSchema`**: `data[] { start, end, status: 'CLOSED'|'IN_PROGRESS'|'UPCOMING' }`; query `{ periodType, direction: 'upcoming'|'past', count: 1..26 }` (`.strict()` — no `from`).
- **Shared enums/labels/helpers**: `GoalMetric` (10), `GOAL_METRIC_KIND` (`VOLUME`/`INDEX`/`RATE`), `GOAL_METRIC_LABELS`, `RewardAwardStatus`, `REWARD_AWARD_STATUS_LABELS`, `InspectorLevel`, `INSPECTOR_LEVEL_LABELS`, `resolveInspectorLevel(score, {silverMinScore, goldMinScore})`, `UPCOMING_GOAL_LOOKAHEAD_DAYS`. The `inspectorProgram` platform-settings key: `{ levels:{silverMinScore,goldMinScore}, earlyAccess:{enabled,hours,minLevel,enabledAt} }`.

## Decisions

### D1 — Status chip reuses the shipped shared label ("Pending review")
- **Decision**: Render award status with `REWARD_AWARD_STATUS_LABELS` → `PENDING` is **"Pending review"**, not the task's "Pending approval". Spec, tests and the E2E assert "Pending review".
- **Rationale**: The merged shared contract (#1358) is the single source of truth; constitution §IV/§V and `packages/shared` CLAUDE.md §10 forbid duplicating/overriding a shipped label. "Pending review" is semantically correct (the Properfy team reviews before approving) and matches the DL14 app copy.
- **Alternatives rejected**: Hard-code "Pending approval" in the web (duplication, drift from PWA/report which also consume the shared label).

### D2 — Q12: no manual payment; Q12-consistent footer copy
- **Decision**: Ship no "Mark as paid" control in any status; the goal-form footer reads "Bonuses are reviewed by the Properfy team. Once approved, they're added to the inspector's next invoice."; the Paid tile is read-only $0.00 until TASK-F08-6.
- **Rationale**: Q12 decided 2026-10-30 (invoice settlement, F08-6). The source task's leftover "paid outside Properfy / Mark them as paid" copy and "…marked as paid" acceptance phrase are pre-Q12 remnants contradicted by the same task's objective/out-of-scope/criteria (spec A2).
- **Alternatives rejected**: Keep the manual-paid control (contradicts Q12 + the void-after-invoicing ownership in F08-6).

### D3 — Void dialog validates reason 5–500 client-side
- **Decision**: "Internal reason" required, 5–500; "Note to the inspector" optional ≤ 200.
- **Rationale**: `voidAwardSchema` is lenient (reason ≥ 1) but the void **route** requires ≥ 5; validating 5 client-side avoids a guaranteed 400 and gives a clear inline error.

### D4 — Periods always from the backend; no client date math (DR5/A4)
- **Decision**: RewardsTab period selector = `GET /periods?direction=past&count=12` + `GET /periods?direction=upcoming&count=1` (current `IN_PROGRESS` shown on top). Goal-form "Starts" = `direction=upcoming&count=13`. "Ends" = "No end date" + period ends from `direction=upcoming&count=26` filtered to `end ≥ minEndsAt` (edit) / `end ≥` the chosen start's period end (create); switching the cycle refetches and clears the selection.
- **Rationale**: The web must never compute a billing period (DR5); the periods route is the only source. The route is `.strict()` with no `from`, so all options are anchored at the current period going forward — valid because a goal can only start in the current/future period.

### D5 — Level column on the F07 page derived client-side
- **Decision**: Add a "Level" column after "Score" in the Inspector performance ranking table, computed as `resolveInspectorLevel(row.score, setting.levels)` → `INSPECTOR_LEVEL_LABELS`, with thresholds from `usePlatformSetting('inspectorProgram').levels`. "–" while the setting loads or if it can't be read; the "Not enough data" block has no column; no other column changes; no backend/response change.
- **Rationale**: Contract 03.11 assigns the column to F08; the F07 response already returns `score`. Pure client derivation keeps F07 untouched.
- **Note (F07-3 memory)**: `DataTable` rows aren't keyboard-focusable and the column field is `label`, not `header`; add the column via the table's column config without changing other columns.

### D6 — `describeGoal` placement and shape
- **Decision**: New `packages/shared/src/lib/goal-copy.ts` exporting `describeGoal({ metric, target, scopeLabel })` (`scopeLabel: string | null`); barrel-exported; built to `dist/` before web/pwa consume it. Goal list passes the metric's scope name (region/service-type) as `scopeLabel`; award list passes `award.scopeLabel`.
- **Rationale**: Consumed by web now and by the PWA (F08-4) and report (F08-5) later — belongs in shared, not duplicated. The exact strings are in contracts/describe-goal.md.

### D7 — Idempotency-Key reuse across retries
- **Decision**: Generate one `Idempotency-Key` per approve/void **attempt instance** (stored on the row's pending action), reuse it on retry, and only rotate it after a terminal success. A double-click sends one request (button disabled/in-flight guard).
- **Rationale**: Matches the route's idempotency contract and the memory `project_rate_limit`/idempotency adoption patterns; prevents duplicate approvals on retry.

### D8 — Access control (Q18 / AuthGuard redirect)
- **Decision**: All three routes under `AuthGuard roles={[AM, OP]}`; the menu item carries `roles: [AM, OP]`. Denied roles are **redirected** (to `/dashboard`), not shown an in-page panel.
- **Rationale**: F07-3 memory — `AuthGuard` REDIRECTS denied roles (+ info toast); route-guard test mirrors `live-day-route-guard.test.tsx`.

### D9 — Back button + unsaved-changes (X01/DR6)
- **Decision**: `const BACK_TO = '/goals-rewards?tab=goals'` backs both `useGoBack(BACK_TO)` and `PageHeader backTo`; the unsaved-changes "Leave without saving?" prompt uses the `onBack(goBack)` override; P-b test runs as **OP** (most restrictive role that reaches the page).
- **Rationale**: X01 contract (DR6) + F03-4's platform-settings back-button precedent (discard prompt via `PageHeader onBack`).

### D10 — Date/time formatting helpers (ICU drift)
- **Decision**: Format instants ("On since {d MMM yyyy, h:mm a}", approvedAt, voidedAt) in `PLATFORM_TIMEZONE` using the shared Sydney-default helpers (`civilDateInTz` + an explicit month-array formatter), never `@/lib/format-date` (user tz) or `toLocaleDateString`/Intl month names.
- **Rationale**: F07-3 memory — `formatCivilDate` is `dd/mm/yyyy` and Intl month short-names drift across Node versions (ICU); F07-3 already built deterministic reliability-date formatters. Reuse the same approach (a small `lib/goal-labels.ts`/format helper) for the program's "d MMM yyyy, h:mm a".

### D11 — Status colours reuse existing tokens
- **Decision**: `REWARD_AWARD_STATUS_MAP` in `apps/web/src/lib/status-colors.ts` maps PENDING/APPROVED/PAID/VOID to **existing** status tokens (e.g. warning/positive/neutral/muted); no new token.
- **Rationale**: Task step 3 + design-system consistency.

### D12 — E2E fixture safety (DV5)
- **Decision**: `apps/backend/src/scripts/e2e-inspector-program-fixture.ts` seeds an inspector with 10 DONE in a closed week and runs the F08-1 daily use case with a fixed `now`; called by the spec's Playwright `globalSetup`; refuses `NODE_ENV=production`; never registered as a route/worker. The spec also creates a second goal via the form (CRUD proof) and asserts CL_ADMIN sees denied access.
- **Rationale**: Task §9 + the constraint that the fixture is out of the production bundle.

## Open questions

None. The ambiguity scan (clarify) found no product decision requiring Pedro; the only source inconsistencies (Q12 copy, "Pending approval" vs shipped "Pending review") are resolved against decided rules and the merged contract (D1/D2, spec A2/A8).
