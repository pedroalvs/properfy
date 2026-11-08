# Phase 1 — Data Model: F08-4 Challenges (PWA) + performance messages

**No new table, column, migration, or Prisma change.** This feature reads existing platform-scoped entities (all **without `tenant_id`**, D12) and writes only a system notice through F02. The "model" here is the **read model** returned by `GET /v1/inspector/program` and the **dedupe-key grammar** of the three messages.

## Consumed entities (read-only)

| Entity | Source | Read for | Key fields used |
|---|---|---|---|
| `InspectorGoal` *(no `tenant_id`)* | F08-1 | `activeGoals`, participation, message period text | `title`, `metric`, `comparator`, `target`/`next_target`, `period`, scope (`region`/`service_type`/`inspector`), `rewardAmount`/`next_reward_amount`, `startsAt`, `endsAt`, `active`, `createdAt` |
| `RewardAward` *(no `tenant_id`)* | F08-1 | `awards[]` (latest 50), goal-reached message (48 h scan) | `goalTitle`, `metric`, `periodType`, `periodStart`, `periodEnd`, `amount`, `achievedValue`, `status`, `inspectorNote`, `paidAt`, `voidedAt`, `createdAt`, `inspectorId`; **never `voidReason`** |
| `GoalPeriodClosure` *(no `tenant_id`)* | F08-1 | streak derivation (via standing service) | participations by inspector, cycle, `periodStart`, skipped-inactive marker |
| `InspectorReliabilitySnapshot` *(no `tenant_id`)* | F07 | `standing.index`, `ranking`, level-change message | `score`, `status`, `position`, `snapshotDate`, `settings_json { weights, minimumVolume, toleranceMinutes, volumeReference.source }` |
| `Inspector` *(platform/global)* | core | active filter for messages & ranking cohort | `id`, `status` (`ACTIVE`), `deleted_at` |
| `inspectorProgram` platform setting | F03-1 | level thresholds for `resolveInspectorLevel` | `levels.silverMinScore`, `levels.goldMinScore` |

## Read model — `GET /v1/inspector/program` response

(See `contracts/get-inspector-program.md` for the full schema and the error envelope.) Validation rules enforced by `inspectorProgramResponseSchema` (Zod, `packages/shared`):

- `summary.currency` literal `'AUD'`; `openCashTotal` ≥ 0 number (sum of current-period participated goals' `rewardAmount`, no `UPCOMING`, no cap).
- `activeGoals[].state ∈ {MET_SO_FAR, IN_PROGRESS, BELOW_TARGET, NOT_ENOUGH_SERVICES, NO_DATA, UPCOMING}`; `startsOn` non-null **iff** `state === 'UPCOMING'`; `value` null for `UPCOMING`; `minimumServices` = 10 for rate metrics else null; `description` server-rendered (`describeGoal`).
- `standing.index.status ∈ {SCORED, INSUFFICIENT_VOLUME, NO_WEIGHTED_DATA, NOT_COMPUTED}` (`ReliabilityDetailStatus` + `NOT_COMPUTED`); `level ∈ InspectorLevel | null`; `streak.cycle ∈ BillingPeriodType | null`.
- `awards[]` carries `inspectorNote: string | null`; **no** `voidReason` key exists in the schema.
- `ranking.entries[]` is **`.strict()`** with exactly `{ position:number, score:number, level: InspectorLevel|null, isMe:boolean }`; `entries` is `[]` when `cohortTooSmall`; `notRankedReason ∈ {'NOT_ENOUGH_DATA','NOT_COMPUTED'} | null`.

## State transitions

None introduced. Reward-award lifecycle (`PENDING → APPROVED → PAID | VOID`) is owned by F08-1/F08-6; this feature only **reads** the current status and renders the DL14 chip label.

## Dedupe-key grammar (notice idempotency, internal)

| Message | `dedupeKey` | Idempotency scope |
|---|---|---|
| Goal reached (aggregated) | `program-goals-reached:<inspectorId>:<periodEnd>` | one notice per inspector per period **end** (48 h scan → next-day recovery is idempotent; same-start/different-end stay distinct) |
| Level change | `program-level:<inspectorId>:<snapshotDate>` | one per inspector per snapshot day; the 7-day guard reads the `program-level:<id>:` **prefix** |
| Streak at risk | `program-streak-risk:<inspectorId>:<periodStart>` | one per inspector per cycle period |

All three use `type: 'PERFORMANCE_MESSAGE'` (never critical → push + inbox, no SMS) and `targetPath: '/profile/challenges'`.

## Ports introduced (interfaces only; no data change)

- `IRecentProgramNoticeReader.hasRecentNotice(dedupeKeyPrefix, since) → boolean` (domain) — adapter over F02 `HasRecentSystemInspectorNoticeUseCase`.
- `IRecentRewardAwardReader` (domain) — `findRecentNonVoidByCreatedAt(since) → award[]` (for the 48 h goal-reached scan) and `findRecentByInspector(inspectorId, limit=50) → award[]` (for `awards[]`), implemented by a Prisma reader over `reward_awards`.
