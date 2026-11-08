# Consumed endpoints (no new API surface)

All routes below already exist in `packages/shared/src/api-types.ts` on `develop` (TASK-F08-1 #1358, F03 platform-settings, F07 performance). This feature **adds none and changes none**. Access: AM/OP only (`CL_*`/`INSP`/`TNT` → 403/denied). Idempotency header on the two mutating award actions.

## Inspector program (TASK-F08-1)

| Method | Path | Query / Body | Response | Used by |
|---|---|---|---|---|
| GET | `/v1/inspector-program/goals` | `listGoalsQuerySchema` (`active` default true, `metric?`, `period?`, `page`, `pageSize`, `sortBy`, `sortOrder`) | `goalsListResponseSchema` (paginated `goalResponseSchema`) | GoalsTab, cumulative-goals advisory |
| POST | `/v1/inspector-program/goals` | `createGoalSchema` | `goalResponseSchema` | GoalFormPage (create) |
| GET | `/v1/inspector-program/goals/{goalId}` | — | `goalResponseSchema` | GoalFormPage (edit load) |
| PATCH | `/v1/inspector-program/goals/{goalId}` | `updateGoalSchema` (`.strict`: title/target/rewardAmount/endsAt/active only) | `goalResponseSchema` | GoalFormPage (edit, deactivate, reactivate) |
| GET | `/v1/inspector-program/periods` | `programPeriodsQuerySchema` (`periodType`, `direction: upcoming\|past`, `count` 1–26) | `programPeriodsResponseSchema` (`data[] {start,end,status}`) | PeriodSelect (both tabs + form) |
| GET | `/v1/inspector-program/awards` | `listAwardsQuerySchema` (`status?`, `periodType?`, `periodStart?`, `goalId?`, `inspectorId?`, `page`, `pageSize`) | `rewardAwardsListResponseSchema` | RewardsTab award table |
| GET | `/v1/inspector-program/summary` | `programPeriodSummaryQuerySchema` (`periodType`, `periodStart`) | `programPeriodSummaryResponseSchema` | RewardsTab tiles + per-goal table |
| POST | `/v1/inspector-program/awards/{awardId}/approve` | `Idempotency-Key` header | `rewardAwardResponseSchema` | approve action |
| POST | `/v1/inspector-program/awards/{awardId}/void` | `voidAwardSchema` `{reason, inspectorNote?}` + `Idempotency-Key` | `rewardAwardResponseSchema` | VoidAwardDialog |

**Error handling**: 422 (e.g. `GOAL_END_IN_CURRENT_PERIOD`) → server message at top of form; 400 with `details` → per-field errors via shared `getFieldErrors`; 409 on approve/void → "This reward was updated by someone else." + reload. Void `reason` enforced 5–500 client-side (route requires ≥ 5; shared schema is ≥ 1).

## Platform settings (F03)

| Method | Path | Body | Used by |
|---|---|---|---|
| GET | `/v1/platform-settings/{key}` (`key=inspectorProgram`) | — | `usePlatformSetting('inspectorProgram')` — settings section + F07 Level column |
| PUT | `/v1/platform-settings/{key}` | full `inspectorProgram` object (`levels` + `earlyAccess`; `enabledAt` echoed, server recomputes) | InspectorProgramSettingsSection save |

## Inspector performance (F07)

| Method | Path | Used by |
|---|---|---|
| GET | `/v1/dashboard/inspector-performance` | existing ranking hook — the Level column derives from the returned `score` only; **no change to query or response** |

## Audit (03.A5)
Create / update / deactivate / reactivate / approve / void all write audit rows **server-side** (TASK-F08-1). The web performs no state change outside these endpoints (FR-023).
