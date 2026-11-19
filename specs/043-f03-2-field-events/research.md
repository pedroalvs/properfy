# Phase 0 Research — Inspector Field Events (F03-2)

No `NEEDS CLARIFICATION` remained after `/speckit.clarify`. This file records the non-obvious technical decisions, each already fixed by the task file (`fase2-etapa1/tarefas/F03-tarefas.md`) and the closed decisions D1–D31.

## R1 — Rejection via SYS, not a new transition rule

- **Decision**: "Can't do this job" drives `SCHEDULED → REJECTED` through the existing `ExecuteStatusTransitionUseCase` with `{ ...SYSTEM_ACTOR, tenantId: appointment.tenantId }` and the new code `INSPECTOR_UNABLE`.
- **Rationale**: `SCHEDULED → REJECTED` already admits SYS in the state machine; the `report-unavailability` use case is a working precedent (`TENANT_DECLINED` via SYS). Reusing it keeps the state machine sovereign and leaves all 5 transition-RBAC sources untouched (constitution: "no code path may transition an appointment except through the transition use case").
- **Alternatives rejected**: a bespoke rejection path (would duplicate side effects and bypass the sovereign use case); a new transition-RBAC entry (unnecessary, the matrix already allows it).

## R2 — Attributing a SYS transition to a human

- **Decision**: add an optional generic `auditMetadata: Record<string, unknown>` to the transition use case, merged into the `status_transition` audit and the `STATUS_TRANSITION` event. The can't-do passes `{ initiatedByUserId, initiatedByInspectorId, source: TRANSITION_SOURCE_INSPECTOR_CANT_DO, fieldEventId }`.
- **Rationale**: the transition stays `actorType: 'SYSTEM'` (no actorId) while still recording who triggered it. Keeping the field generic lets F06-2 pass `{ source: TRANSITION_SOURCE_INSPECTOR_FINISH }` on finish without touching the use case (D31, L-F06-04). `source` is a shared constant, read by consumers instead of `actorType`.
- **Alternatives rejected**: a typed `cantDoMetadata` field (not reusable by F06); inferring the initiator from `actorType` (SYS has none).

## R3 — Concurrency: appointment-row `FOR UPDATE` lock + status CAS

- **Decision**: both `finish` and `cant-do` take `SELECT id FROM appointments WHERE id = $1 FOR UPDATE` as the **first** statement of their transaction (identical lock order: appointment → execution → transition), and the status write uses `updateMany({ where: { id, tenant_id, status: expectedStatus } })` with `expectedStatus: 'SCHEDULED'`, raising `409 APPOINTMENT_STATUS_CHANGED` on `count === 0`.
- **Rationale**: a shared lock on the same row serializes the two writers deterministically (no lock-order inversion = no `40P01` deadlock). The CAS is a second line of defense against any writer that does not take the lock. Both guards are required; the integration test (23) must fail if either is removed (mutation proof, per `feedback_concurrency_test_must_fail_without_guard`).
- **Alternatives rejected**: optimistic status check with a plain `update` by id (TOCTOU — the read and write are not atomic); serializable isolation (heavier, and the repo's precedent is row locks — `prisma-service-group.repository.ts:1385`).

## R4 — Abandoned execution sentinel

- **Decision**: a rejection after check-in sets `inspection_executions.abandoned_at` instead of deleting the row; all 5 readers treat an abandoned row as "not started"; a later `start` restarts the same row, snapshotting the current geofence radius and auditing `inspection_execution.restarted` (no coordinates).
- **Rationale**: `appointment_id` is `@unique` on `inspection_executions`, so a re-offer cannot create a second row and must not leave a stale open one (would break `start`, `finish`, schedule, stuck worker and portal). A nullable sentinel is the minimal expand-only change (no constraint change, no `@@index` needed for the small filtered set).
- **Alternatives rejected**: dropping the unique constraint + one row per attempt (larger migration, changes every reader's cardinality assumption); deleting the abandoned row (loses the audit trail of the abandoned check-in).

## R5 — `inspectorIssue` without N+1

- **Decision**: one `$queryRaw` `DISTINCT ON (appointment_id)` over `inspector_field_events` joined to `inspectors`, called once per page with the page's appointment ids (`= ANY(${ids}::uuid[])`), merged in memory. Empty list → no query.
- **Rationale**: a nested Prisma `include` with `take: 1` can fetch all relation rows and slice in memory (N+1 / over-fetch). `DISTINCT ON … ORDER BY appointment_id, created_at DESC` uses the `(appointment_id, type, created_at desc)` index and returns exactly the latest `CANT_DO` per appointment in one round trip (SC-010). `::uuid[]` param per `project_prisma_queryraw_int_params`.
- **Alternatives rejected**: per-row lookup (N+1); a correlated subquery per appointment (worse plan).

## R6 — Estimated arrival reference

- **Decision**: `estimatedArrivalAt = max(reference, effectiveNoticeAt) + minutesLate`, where `reference = publishedStopStartReader.find(appointmentId, inspectorId, scheduledDate) ?? windowStartAt`, exposed as a pure `computeEstimatedArrivalAt(reference, effectiveNoticeAt, minutesLate)`. The F03 `IPublishedStopStartReader` returns `null` (F04 not merged); F04-2 wires the real adapter.
- **Rationale**: late-reporting consumers (F05/F06/F07) must agree on arrival without re-deriving an ETA. A pure exported function plus a domain port decouples F03 from F04's `DayPlanStop`. `effectiveNoticeAt` comes from `resolveEffectiveEventTime` (F03-1) so offline-synced notices are not penalized (D25).
- **Alternatives rejected**: storing `estimated_arrival_at` as a column (derivable, and would drift when F04 adds published plans); recomputing per consumer (divergence risk).

## R7 — Inspector coordinate privacy

- **Decision**: no audit written by this task stores raw inspector lat/lng. Event coordinates live only in `inspector_field_events`, served to AM/OP via field-activity. The field-activity use case applies the same tenant cut as `GetAppointmentUseCase` and omits the latitude/longitude keys entirely for CL roles. The audit-log coordinate mask for CL is already in place (TASK-F03-1).
- **Rationale**: constitution §II / CLAUDE.md §7.9 — agency roles see only derived values (distance, accuracy, flags). Omitting the keys (not nulling them) means no coordinate ever appears in a CL response; a regression test asserts the absence of any coordinate key.
- **Alternatives rejected**: nulling coordinates for CL (a null is still a declared key and easy to accidentally repopulate); masking strings (unnecessary when the keys are simply not projected).

## R8 — Portal no-reoffer for inspector rejections

- **Decision**: a new `isPortalChangeTimeBlocked({ status, rejectionReasonCode })` = dead status OR (`REJECTED` with a `SYSTEM_ONLY_REJECTION_CODES` code). `PORTAL_DEAD_STATUSES` / `isPortalDeadStatus` are unchanged so `TENANT_DECLINED` still revives via the portal.
- **Rationale**: an inspector-rejected job must be re-offered by operations, not revived by the tenant (D20). Centralizing the rule in one function avoids divergence across `join-group` (3 call sites), `get-available-groups` and `get-portal-data`, and the in-transaction re-read keeps it correct under a race.
- **Alternatives rejected**: adding `REJECTED` to `PORTAL_DEAD_STATUSES` (would also kill the `TENANT_DECLINED` revive path).

## R9 — Completion reminder dedupe

- **Decision**: `dedupeKey = completion-reminder:{appointmentId}:{civilDate}:{inspectorId}` (prefix is a shared constant). F02's `PublishSystemInspectorNoticeUseCase` owns dedup; F03 adds no column. Audit only when F02 returns `created === true`.
- **Rationale**: "once per appointment, civil date and inspector" survives a same-day re-offer to another inspector (new key) and a reschedule (new civil date). Pushing dedup into F02 avoids a parallel F03 ledger. The job runs every 15 min; a busy inspector (another later in-progress execution) is skipped and retried next cycle.
- **Alternatives rejected**: an F03 "already reminded" column (duplicates F02's notice dedup); per-cycle in-memory dedup (lost across restarts).

## R10 — Offline connectivity premise (A-Q2 / D7)

- **Decision**: `CANT_DO` and `LATE_NOTICE` require live connectivity and are never queued offline; `start`/`finish` keep their offline tolerance.
- **Rationale**: these events drive a status change and OP alerts that must not fire from a stale queued payload. Recorded as a premise because Q2's wording was assumed per the plan recommendation.
- **Alternatives rejected**: queueing field events offline (a queued `CANT_DO` could reject a job the inspector later completed; a queued `FINISH` after a `CANT_DO` fails the `REJECTED → DONE` transition — handled as a permanent error that the PWA clears).
