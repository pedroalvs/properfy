# Data Model — Goals & Rewards web (TASK-F08-3)

**No database change. No new Zod schema except the pure `describeGoal` helper.** This feature consumes the TASK-F08-1 contract. The entities below are **platform-scoped (no `tenant_id`, D12)**; the web only reads/writes them through AM/OP endpoints that enforce isolation server-side (spec §Context, FR-023).

## Consumed entities (read-only shapes from `@properfy/shared`)

### Goal (`goalResponseSchema` → `GoalResponse`)
Displayed in the Goals tab and the goal form.

| Field | Used for |
|---|---|
| `id`, `title` | row key, Goal column, form |
| `metric`, `comparator`, `target` | `describeGoal`, Metric/Target form fields (disabled in edit) |
| `period` | Period column + filter |
| `scopeRegionId/Name`, `scopeServiceTypeId/Name`, `scopeInspectorId/Name` | Who column, scope form fields, `describeGoal` scope label |
| `scopeRegionDeleted` | "deleted region" copy + reactivate-disabled warning |
| `rewardAmount` | Bonus column, form |
| `startsAt`, `endsAt`, `minEndsAt` | Runs column, Starts/Ends form fields (Ends ≥ `minEndsAt`) |
| `active`, `deactivatedAt` | Status column/chip, deactivate/reactivate |
| `pendingChange { target, rewardAmount, effectiveFrom }` | "From {date}: target {n}, bonus {$}." |
| `resumesOn` | "Counts again from {date}" |
| `currentPeriod`, `lastClosedPeriod` | contextual labels |
| `createdByUserId`, `updatedByUserId`, `createdAt`, `updatedAt` | not rendered as raw ids (FR-026) |

**Civil-date fields** (`startsAt`, `endsAt`, `minEndsAt`, `pendingChange.effectiveFrom`, `resumesOn`, `currentPeriod/lastClosedPeriod.start/end`) are `PLATFORM_TIMEZONE` wall-clock from the backend — rendered as received (DR5). `deactivatedAt` is an instant, displayed in `PLATFORM_TIMEZONE`.

### RewardAward (`rewardAwardResponseSchema` → `RewardAwardResponse`)
Listed in the Rewards tab award table.

| Field | Used for |
|---|---|
| `id`, `goalId`, `inspectorId` | keys (never shown raw) |
| `inspector { id, name, email }` | Inspector column (name + email) |
| `goal { id, title }`, `goalTitle`, `metric`, `comparator`, `target`, `scopeLabel` | Goal column, `describeGoal` |
| `achievedValue`, `serviceCount` | Result ("{serviceCount} inspections" for VOLUME kind; "{achievedValue}%"/" points" for RATE/INDEX) |
| `achievedOn` | tie-break context (not a primary column) |
| `indexScoreAtClose` | Index at close column |
| `levelAtClose` | Level column (`INSPECTOR_LEVEL_LABELS`, "–" when null) |
| `amount` | Amount column (AUD) |
| `status` | Status chip (`REWARD_AWARD_STATUS_LABELS`) + which actions show |
| `approvedByName`, `approvedAt` | tooltip/detail for approved rows (instant → Sydney) |
| `voidedByName`, `voidedAt`, `voidReason`, `inspectorNote` | void detail (internal reason is AM/OP-only, already server-gated) |
| `paidAt` | always null in this slice (F08-6) |

### Period summary (`programPeriodSummaryResponseSchema`)
Drives the Rewards tiles + per-goal table.

- `totals { promised, achieved, approved, paid, pending, voided }` → tiles Promised / Achieved / Approved / Paid (AUD).
- `goals[] { goalId, title, metric, rewardAmount, participants, promised, achievers, achievedAmount, closed, skipped }` → per-goal table: **Per winner** = `rewardAmount`, **Participants** = `participants`, **Max payout** = `promised`, **Achievers** = `achievers`, **Achieved** = `achievedAmount`; `skipped` → "Skipped (goal inactive)" with Max payout "$0.00".
- `status: 'CLOSED'|'IN_PROGRESS'|'UPCOMING'` → in-progress message; empty `goals` → "No goals ran in this period.".

### Program period option (`programPeriodsResponseSchema`)
`data[] { start, end, status }` → cycle/period selectors (civil dates, PLATFORM_TIMEZONE).

### Inspector program setting (`inspectorProgram` platform-settings key)
`{ levels: { silverMinScore, goldMinScore }, earlyAccess: { enabled, hours, minLevel, enabledAt } }`. Read/written by the settings section; `levels` also read on the F07 page for the Level column. `enabledAt` is an instant, read-only, shown as "On since {d MMM yyyy, h:mm a}" (Sydney).

### Inspector performance row (F07, `GET /v1/dashboard/inspector-performance`)
Already returns per-inspector `score` (and `status`); the Level column derives from `score` only. **No F07 response change.**

## New shared helper

### `describeGoal({ metric, target, scopeLabel })` — `packages/shared/src/lib/goal-copy.ts`
Pure, I/O-free; `scopeLabel: string | null`. Returns the plain-language description (contracts/describe-goal.md). This is the only new contract artifact; it has unit tests and is exported from the shared barrel, then built to `dist/`.

## View-models (web-local, not shared)
- **Period option**: `{ periodType, start, end, status, label }` where `label` is formatted client-side ("Week of Mon 2 Nov 2026" / "Fortnight of …" / "November 2026") from the backend `start`/`end` — formatting only, never computing the period.
- **Award row VM**: the award response plus a derived `resultText` (from `GOAL_METRIC_KIND` + `serviceCount`/`achievedValue`) and the two action flags (`canApprove = status === PENDING`, `canVoid = status === PENDING || status === APPROVED`).

## State transitions (reward award, as acted on here)
`PENDING → APPROVED` (approve, any AM/OP, CAS + Idempotency-Key) · `PENDING | APPROVED → VOID` (void, reason + optional note). `PAID` and post-invoicing void are **out of scope** (TASK-F08-6). The web never writes `PAID`.
