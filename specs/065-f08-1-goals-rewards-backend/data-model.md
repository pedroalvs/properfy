# Phase 1 Data Model — Inspector Program

Source of truth: `F08-tarefas.md` § TASK-F08-1 "Modelo de dados". All three tables are **platform-scoped — no `tenant_id`** (D12, explicit CLAUDE.md §7.1 exception). Civil dates are `@db.Date` in `PLATFORM_TIMEZONE`; instants are `timestamp(3)` UTC; decimals surface as `number`. One expand-only migration, ordered after the F07 migrations; it must not drop any `Unsupported()` index.

## Enums (Prisma + shared)

- `GoalMetric` = `VOLUME | REGION_VOLUME | SERVICE_TYPE_VOLUME | INDEX_AT_LEAST | PUNCTUALITY | GEOFENCE | NO_STUCK | SATISFACTION | LATE_NOTICE | CANT_DO_MAX`
- `GoalComparator` = `GTE | LTE`
- `RewardAwardStatus` = `PENDING | APPROVED | PAID | VOID`
- `InspectorLevel` (shared only) = `BRONZE | SILVER | GOLD`
- Period type reuses the existing `BillingPeriodType` (`WEEKLY | FORTNIGHTLY | MONTHLY`).

## InspectorGoal (`inspector_goals`)

Fields: `id`, `title` (varchar 120), `metric`, `comparator` (fixed per metric, P1), `target` (Decimal 8,2 — volume integer / rate % / index points), `period` (`BillingPeriodType`), `scope_region_id?` (`SetNull`), `scope_service_type_id?` (`Restrict`), `scope_inspector_id?` (`Restrict`), `reward_amount` (Decimal 10,2, AUD), `starts_at` (Date, first day of a period), `ends_at?` (Date, last day of a period), `active` (default true), `deactivated_at?` (instant), `next_target?`/`next_reward_amount?`/`next_effective_from?` (pending terms, L-F08-02), `created_by_user_id`, `updated_by_user_id?`, `created_at`, `updated_at`.
Relations: `scope_region`/`scope_service_type`/`scope_inspector`, `created_by`/`updated_by`, `awards[]`, `closures[]`.
Indexes: `(active, period)`, `(scope_region_id)`, `(scope_inspector_id)`.

CHECKs: scope-per-metric (`REGION_VOLUME` ⇒ region set unless inactive; region only on `REGION_VOLUME`; `SERVICE_TYPE_VOLUME` ⇔ service-type set); comparator-per-metric (`CANT_DO_MAX` ⇔ `LTE`); `ends_at IS NULL OR ends_at >= starts_at`; `target > 0 AND reward_amount > 0`; `active = (deactivated_at IS NULL)`; `next_terms` (`(next_target OR next_reward_amount) = (next_effective_from set)`, both positive when set).

Lifecycle: active ↔ deactivated (`deactivated_at`); reactivation writes `SKIPPED_INACTIVE` closures for unclosed past/current periods and resumes next period. Term edits on a running goal land in `next_*` and are promoted at close.

## RewardAward (`reward_awards`)

Immutable goal snapshot at close + result + lifecycle. Fields: `id`, `goal_id`, `inspector_id`, `period_type`, `period_start`/`period_end` (Date); snapshot `goal_title`, `metric`, `comparator`, `target` (Dec 8,2), `amount` (Dec 10,2), `scope_label?` (varchar 200, L-F08-13); result `achieved_value` (Dec 8,2), `service_count` (Int), `achieved_on` (Date), `index_score_at_close?` (Dec 4,1), `level_at_close?` (varchar 10), `index_snapshot_date?` (Date, DR2); lifecycle `status` (default `PENDING`), `approved_by_user_id?`/`approved_at?`, `paid_at?` (filled by F08-6), `voided_by_user_id?`/`voided_at?`/`void_reason?` (varchar 500, internal), `inspector_note?` (varchar 200, L-F08-05), `created_at`, `updated_at`.
Relations: `goal` (`Restrict`), `inspector` (`Restrict`), `approved_by`, `voided_by`.
Unique: `(goal_id, inspector_id, period_start)` — the award idempotency barrier.
Indexes: `(status, period_end)`, `(inspector_id, period_end)`, `(period_type, period_start)`.

CHECK `reward_awards_status_fields_chk` (implication `bool <= bool`): `status IN ('APPROVED','PAID') ⇒ approved_by set`; `status = 'PAID' ⇒ paid_at set`; `paid_at set ⇒ status IN ('PAID','VOID')` (VOID may keep `paid_at` for F08-6 void-after-paid); `inspector_note set ⇒ status = 'VOID'`; `status = 'VOID' ⇔ (voided_at set AND void_reason set)`.

Transitions (this slice): `PENDING → APPROVED` (CAS), `PENDING/APPROVED → VOID` (CAS). `PAID` and void-after-invoicing are TASK-F08-6. No `mark-paid`.

## GoalPeriodClosure (`goal_period_closures`)

Fields: `id`, `goal_id`, `period_type`, `period_start`/`period_end` (Date), `participant_ids` (String[], P3/P11), `participants_count`, `achievers_count`, `promised_amount` (Dec 12,2 = `reward_amount × participants`; 0 for `SKIPPED_INACTIVE`), `scope_label?` (varchar 200), `index_snapshot_date?` (Date, DR2), `trigger` (varchar 20: `SCHEDULED | STARTUP | SKIPPED_INACTIVE`), `closed_at`.
Relation: `goal` (`Restrict`). Unique: `(goal_id, period_start)` — the closing idempotency barrier. Index: `(period_type, period_start)`.

Back-relations to add: `Inspector.reward_awards`, `Inspector.scoped_goals` (`InspectorGoalScope`), `ServiceRegion.inspector_goals`, `ServiceType.inspector_goals`, and four named `User` relations (created_by, updated_by, approved_by, voided_by). No `paid_by` (the invoice pays, Q12).

## inspectorProgram platform setting (F03 registry, no `tenant_id`)

```ts
const levelScore = z.number().min(0.1).max(100).multipleOf(0.1);
inspectorProgramSettingSchema = z.object({
  levels: z.object({ silverMinScore: levelScore, goldMinScore: levelScore })
    .refine(l => l.goldMinScore > l.silverMinScore, { message: 'Gold must be above Silver', path: ['goldMinScore'] }),
  earlyAccess: z.object({
    enabled: z.boolean(),
    hours: z.number().int().min(1).max(72),
    minLevel: z.nativeEnum(InspectorLevel),
    enabledAt: z.string().datetime().nullable(), // server-filled in TASK-F08-2; client value ignored
  }),
});
// defaults: { levels: { silverMinScore: 60, goldMinScore: 85 },
//             earlyAccess: { enabled: false, hours: 12, minLevel: 'GOLD', enabledAt: null } }
```

## Timezone per field (DR5)

| Field | Kind | Timezone |
|---|---|---|
| service date (count, `achieved_on`, `completedServiceDates`) | civil | agency (F07 P2, DR1) |
| `starts_at`, `ends_at`, `next_effective_from`, `period_start`/`period_end`, `minEndsAt`, `resumesOn`, `countsSince`, job "today", periods route "today" | civil | `PLATFORM_TIMEZONE` |
| `index_snapshot_date` | civil | `PLATFORM_TIMEZONE` (F07 snapshot date) |
| cron 04:45, messages run 08:00, `messagesRunAt` | job time | `PLATFORM_TIMEZONE` |
| `approved_at`, `paid_at` (=invoice `paid_at`, F08-6), `voided_at`, `deactivated_at`, `closed_at`, `created_at` | instant | UTC (displayed in `PLATFORM_TIMEZONE`) |

## In-memory read models (not persisted)

- `InspectorStanding` = `{ inspectorId, index: { score, status, snapshotDate, position }, level, streak: { cycle, count, atRisk } }`.
- `GoalProgress` = `{ goalId, title, metric, comparator, target, period, daysLeft, rewardAmount, scopeLabel, value, serviceCount, countsSince, state }` where `state ∈ MET_SO_FAR | IN_PROGRESS | BELOW_TARGET | NOT_ENOUGH_SERVICES | NO_DATA | UPCOMING`.
