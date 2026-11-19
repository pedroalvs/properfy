# Phase 1 Contracts — Inspector Program API

All routes: `preHandler: authenticate`; shared Zod schemas (`fastify-type-provider-zod`); error envelope `{ error: { code, message, details } }`; civil dates `YYYY-MM-DD`; instants ISO-8601; AUD 2 decimals. RBAC: AM/OP → 2xx; `CL_ADMIN`/`CL_USER`/`INSP`/`TNT` → `403` before any read; no token → `401`. Response schemas strip undeclared fields. All additive (expand). `api-types` regenerated via `pnpm generate:api`.

## Goals & periods (AM/OP · `inspector_program.goals.manage`)

| Method & path | Request | Response | Errors |
|---|---|---|---|
| `GET /v1/inspector-program/goals` | `active?` (bool query, default true), `metric?`, `period?`, `page`, `pageSize ≤ 100`, `sortBy` (`createdAt`\|`title`\|`startsAt`), `sortOrder` | 200 `{ data: GoalResponse[], page, pageSize, total }` | 400/401/403 |
| `POST /v1/inspector-program/goals` | `createGoalSchema` | 201 `GoalResponse` | 400; 422 `GOAL_START_NOT_ALIGNED`, `GOAL_END_NOT_ALIGNED`, `GOAL_START_IN_PAST`, `GOAL_SCOPE_*_NOT_FOUND` |
| `GET /v1/inspector-program/goals/:goalId` | uuid param | 200 `GoalResponse` | 404 `GOAL_NOT_FOUND` |
| `PATCH /v1/inspector-program/goals/:goalId` | `updateGoalSchema` (`title`,`target`,`rewardAmount`,`endsAt`,`active`) | 200 `GoalResponse` | 400; 404; 422 `GOAL_END_NOT_ALIGNED`, `GOAL_END_IN_CURRENT_PERIOD`, `GOAL_SCOPE_REGION_DELETED` |
| `GET /v1/inspector-program/periods` | `periodType`, `direction` (`upcoming`\|`past`, required), `count` (1–26); `.strict()` | 200 `{ data: Array<{ start, end, status: 'CLOSED'\|'IN_PROGRESS'\|'UPCOMING' }> }` | 400 |

`direction` (DL10): `upcoming` starts at the current period (`IN_PROGRESS`) forward; `past` starts at the last closed period backward (no current). `GoalResponse` carries `pendingChange`, `resumesOn`, `minEndsAt`, `currentPeriod`, `lastClosedPeriod`, `scopeRegionDeleted`, `deactivatedAt`, author/updater, per the spec FR-010.

## Rewards (AM/OP)

| Method & path | Action | Request | Response | Errors |
|---|---|---|---|---|
| `GET /v1/inspector-program/awards` | `awards.view` | `status?`,`periodType?`,`periodStart?`,`goalId?`,`inspectorId?`,`page`,`pageSize ≤ 100`; P9 order when `goalId`+`periodStart`, else `period_end desc, created_at desc` | 200 paginated | 400/401/403 |
| `GET /v1/inspector-program/summary` | `awards.view` | `periodType`, `periodStart` (aligned, else 400) | 200 `ProgramPeriodSummaryResponse` | 400/401/403 |
| `POST /v1/inspector-program/awards/:awardId/approve` | `awards.approve` | header `Idempotency-Key`; no body | 200 `RewardAwardResponse` | 400 `IDEMPOTENCY_KEY_REQUIRED`; 404 `REWARD_AWARD_NOT_FOUND`; 409 `REWARD_AWARD_INVALID_STATUS`, `IDEMPOTENCY_PAYLOAD_MISMATCH`, `IDEMPOTENCY_IN_PROGRESS` |
| `POST /v1/inspector-program/awards/:awardId/void` | `awards.void` | `Idempotency-Key`; `{ reason: 5–500, inspectorNote?: 1–200 }` (`.strict()`) | 200 `RewardAwardResponse` | idem; 409 `REWARD_AWARD_INVALID_STATUS` on `PAID`/`VOID` |

No `mark-paid` route (Q12). `RewardAwardResponse` includes `indexSnapshotDate`, `paidAt` (null until F08-6), `voidReason`, `inspectorNote`, `scopeLabel`, per spec FR-010. `ProgramPeriodSummaryResponse.totals = { promised, achieved, approved, paid (0 until F08-6), pending, voided }` and `goals[]` with `skipped`.
Idempotency: `tryAcquire(key, 'reward-award', hash({ awardId, action, body, actor.userId }), 24h)`.

## Region delete (existing route, new conflict)

`DELETE /v1/service-regions/:id` — new `409 SERVICE_REGION_HAS_ACTIVE_GOALS`, message "This region is used by {n} active goals. Deactivate them first.", `details: { activeGoalCount }`. Declared in the route schema and regenerated into `api-types`. Checked after the existing active-region and published-group checks.

## RBAC matrix

| Role | Goals/periods | Awards (list, summary) | Approve / void |
|---|---|---|---|
| AM | yes | yes | yes (void-after-invoicing is F08-6) |
| OP | yes | yes | yes |
| CL_ADMIN / CL_USER / INSP / TNT | 403 | 403 | 403 |

## Internal contract (exported for TASK-F08-2/4/5)

`InspectorProgramStandingService` (`application/inspector-program-standing.service.ts`):
- `getStanding(inspectorId, now): Promise<InspectorStanding>`
- `getActiveGoalProgress(inspectorId, now): Promise<GoalProgress[]>`
- `getActiveGoalProgressForMany(inspectorIds, now): Promise<Map<string, GoalProgress[]>>`
- `hasEarlyAccess(inspectorId, now): Promise<{ hasAccess: boolean; reason: 'LEVEL' | 'DISABLED' | null }>`

Daily job (`run-inspector-program-daily.use-case.ts`): `InspectorProgramDailyTrigger = 'SCHEDULED' | 'STARTUP' | 'MESSAGES'`; steps are `{ name, phase: 'COMPUTE' | 'MESSAGES', run(ctx) }` — `SCHEDULED`/`STARTUP` run COMPUTE steps and enqueue the MESSAGES run; `MESSAGES` runs only MESSAGES steps (registered by TASK-F08-4).

Approval seam: `IRewardAwardApprovalHook` (domain port) with `NoopRewardAwardApprovalHook` default, invoked inside the approve and void transactions for TASK-F08-6.
