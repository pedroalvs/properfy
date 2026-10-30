# Feature Specification: Inspector Field Events (backend + shared)

**Feature Branch**: `043-f03-2-field-events`
**Created**: 2026-10-30
**Status**: Draft
**Input**: TASK-F03-2 (`fase2-etapa1/tarefas/F03-tarefas.md`) — contracts **00.7**, **00.8**, **03.1**, **03.2**, **03.16**; acceptance criteria **00.A3**, **03.A2**. Phase 2 Stage 1 critical path, pair task (Pilar + Esteio).

## Overview

When an inspector is at (or on the way to) a property, three things can happen that the system does not record today: the inspector cannot complete the job ("Can't do this job"), the inspector is running late ("Running late"), or the inspector simply never checks out. This feature introduces the **InspectorFieldEvent** record and the backend/shared behavior around it:

- **"Can't do this job"** records a `CANT_DO` event and, in the same transaction, drives `SCHEDULED → REJECTED` as the **SYSTEM** actor with the new rejection reason code `INSPECTOR_UNABLE`, letting the existing rejection side effects run (unlink service group, release inspector, agency e-mail). Operations (OP/AM) are then alerted by e-mail.
- **"Running late"** records a `LATE_NOTICE` event with a reason and estimated delay, and returns a server-computed `estimatedArrivalAt`. No status change, no tenant notification.
- A **rejection after check-in** leaves the open `InspectionExecution` row intact but marks it `abandoned_at`, so every execution reader treats it as "not started" and a later re-offer re-starts the same row.
- A **field activity API** and the `inspectorIssue` projection on the appointment list/detail expose these events, with a privacy cut that hides raw inspector coordinates from agency roles.
- A **completion reminder** (contract 03.16) nudges the inspector once per appointment/day when a job is overdue or checked-in but not finished, via the F02 `PublishSystemInspectorNoticeUseCase`.

This task is **backend + shared only**. No web/PWA UI (that is TASK-F03-3/F03-4).

## Clarifications

### Session 2026-10-30

All product decisions for F03 were closed on 2026-10-27 (D1–D13), 2026-10-28 (D14–D19) and 2026-10-29 (D20–D31); see `fase2-etapa1/decisoes.md` and the "Decisões" block of TASK-F03-2. They are encoded directly into Requirements and Assumptions below. The only historically open question touching this task is **Q2** (does a new field event need live connectivity?), whose wording was *assumed* per the plan recommendation and is recorded as premise **A-Q2**. No further clarification is required to implement; remaining `[NEEDS CLARIFICATION]` markers (if any) are surfaced in `/speckit.clarify`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspector can't complete a scheduled job (Priority: P1)

An inspector arrives at a property for a `SCHEDULED` inspection assigned to them and cannot complete it (no answer at the door, key did not work, tenant refused entry, unsafe, a problem at the property, or they simply cannot attend). From the app they pick a reason (and, when the reason is "Problem at the property", add a short note) and submit "Can't do this job".

**Why this priority**: This is the core of contract **00.A3** ("the inspector cancellation") and unblocks F04/F05/F07/F09. Without it there is no record that a scheduled job failed in the field and no automatic release of the job back to operations.

**Independent Test**: `POST /v1/inspector/appointments/:id/cant-do` as the assigned inspector on a `SCHEDULED` appointment in an accepted service group; assert the appointment becomes `REJECTED` with `rejection_reason_code = INSPECTOR_UNABLE`, is unlinked from its group and inspector, a `CANT_DO` field event row exists with the appointment's `tenant_id`, the agency gets one `INSPECTION_REJECTED_AGENCY` e-mail, each active OP/AM gets one `INSPECTOR_UNABLE_ALERT`, the tenant gets nothing, and the job disappears from the inspector's schedule.

**Acceptance Scenarios**:

1. **Given** a `SCHEDULED` appointment assigned to the inspector in group `g1`, **When** the inspector reports `CANT_DO` with reason `NO_ANSWER`, **Then** a `CANT_DO` event is written (tenant = appointment tenant), the appointment transitions `SCHEDULED → REJECTED` as SYSTEM with `INSPECTOR_UNABLE`, `service_group_id` and `inspector_id` become null, and the response is `{ eventId, appointmentId, appointmentStatus: 'REJECTED', occurredAt, executionAbandoned: false }`.
2. **Given** reason `SITE_ISSUE` **without** a note, **When** submitted, **Then** validation fails with "Add a short note for this reason".
3. **Given** the inspector already reported `CANT_DO` for this job (appointment now `REJECTED`, inspector released) and retries with a **new** Idempotency-Key, **When** submitted, **Then** `409 CANT_DO_ALREADY_REPORTED` "You already reported this job. It is no longer on your route."
4. **Given** the same request retried with the **same** Idempotency-Key, **When** submitted, **Then** the cached response is returned and no second write occurs; with the same key but a different payload → `409 FIELD_EVENT_IDEMPOTENCY_PAYLOAD_MISMATCH`.
5. **Given** the inspector had already checked in (an in-progress execution), **When** they report `CANT_DO`, **Then** the execution is marked `abandoned_at`, `executionAbandoned: true`, and an `inspection_execution.abandoned` audit is written; the appointment still becomes `REJECTED`.
6. **Given** a non-INSP actor (OP, CL_ADMIN), **When** they call the endpoint, **Then** `403 FORBIDDEN`; an INSP without a linked inspector profile → `403 INSPECTOR_NOT_LINKED`.
7. **Given** the state-machine refuses the transition, **When** `CANT_DO` is processed, **Then** the whole transaction rolls back: no event, no `abandoned_at`, no cached idempotency.

### User Story 2 - Inspector reports running late (Priority: P2)

On the day of a `SCHEDULED` job assigned to them, before checking in, an inspector tells the system they are running late, choosing a reason (traffic, previous job ran over, personal, other) and an estimated delay in minutes.

**Why this priority**: Contract **00.8**. It feeds the tenant arrival notices (F06) and the Live Day board (F05); those consumers rely on a server-computed `estimatedArrivalAt` rather than recomputing it.

**Independent Test**: `POST /v1/inspector/appointments/:id/late-notice` as the assigned inspector on today's `SCHEDULED` job; assert a `LATE_NOTICE` event row and a response carrying `estimatedArrivalAt`, `referenceAt`, `referenceSource`; assert no status change and no notification.

**Acceptance Scenarios**:

1. **Given** today's `SCHEDULED` job with booked window 09:00–11:00 and no published plan, **When** the inspector reports `TRAFFIC` with `minutesLate: 20` at 09:30 (agency timezone), **Then** a `LATE_NOTICE` event is written and the response has `referenceSource: 'WINDOW_START'`, `referenceAt` = 09:00, `estimatedArrivalAt` = 09:50 (`max(windowStart, effectiveNoticeAt) + minutesLate` = `max(09:00, 09:30) + 20`).
2. **Given** a published plan stop whose `published_service_start_at` is 10:15, **When** the inspector reports `minutesLate: 20` at 09:30, **Then** `referenceSource: 'PUBLISHED_PLAN'`, `referenceAt` = 10:15, `estimatedArrivalAt` = 10:35.
3. **Given** the job is not today (yesterday or a future date) and still `SCHEDULED`, **When** a late notice is sent, **Then** `422 LATE_NOTICE_NOT_ALLOWED` "You can only send a running-late notice on the day of the job."
4. **Given** the inspector already checked in (in-progress, not abandoned), **When** a late notice is sent, **Then** `422 LATE_NOTICE_NOT_ALLOWED` "You've already checked in to this job."; if the execution is finished → "This job is already finished."
5. **Given** an abandoned execution after a re-offer (not yet restarted), **When** a late notice is sent, **Then** it is allowed.

### User Story 3 - Operations and the agency learn a job was rejected in the field (Priority: P1)

When an inspector reports `CANT_DO`, operations must be alerted so they can re-offer the job, and the agency must learn the inspection will not go ahead.

**Why this priority**: Part of 00.A3 / 00.7. A silent rejection would strand the job.

**Independent Test**: after a `CANT_DO`, assert one `INSPECTOR_UNABLE_ALERT` e-mail per active OP/AM and one `INSPECTION_REJECTED_AGENCY` e-mail to the agency whose final paragraph states the inspector could not complete it; assert the tenant receives nothing.

**Acceptance Scenarios**:

1. **Given** active OP/AM users, **When** `CANT_DO` is committed, **Then** each receives exactly one `INSPECTOR_UNABLE_ALERT`; a failed recipient is logged and does not fail the request; with zero active OP/AM, an error is logged and the rejection still stands.
2. **Given** the rejection code is `INSPECTOR_UNABLE`, **When** the agency e-mail payload is built, **Then** `rejectedByInspector: true` and `inspectorName` (from the last `CANT_DO`) are set and the template renders the inspector block; for `TENANT_DECLINED` the current paragraph renders unchanged.
3. **Given** the inspector's note, **When** the agency e-mail is built, **Then** the note reaches the agency via `{{rejectionReason}}` (existing behavior).

### User Story 4 - Operations can review field activity; agencies see it without inspector coordinates (Priority: P2)

Operations and agency users can read the execution + field-event history of an appointment. Agency roles must never see the inspector's raw GPS coordinates.

**Why this priority**: 00.A3 ("appears in the detail/activity API") and the platform privacy rule (CLAUDE.md §7.9).

**Independent Test**: `GET /v1/appointments/:id/field-activity` as OP (coordinates present), as CL_ADMIN of the tenant (coordinates absent; distances/accuracy/flags present), as a CL of another tenant (404), as INSP (403).

**Acceptance Scenarios**:

1. **Given** an execution and events with coordinates, **When** AM/OP reads field activity, **Then** the response includes `startLatitude/startLongitude/finishLatitude/finishLongitude` and per-event `latitude/longitude`.
2. **Given** the same data, **When** CL_ADMIN/CL_USER of the tenant reads it, **Then** no latitude/longitude keys are present anywhere, but distances, accuracy and flags are.
3. **Given** the appointment list/detail, **When** any role reads it, **Then** `inspectorIssue` (from the latest `CANT_DO`) is present (or null), and reading a page does not add per-row queries (single `DISTINCT ON` query per page).
4. **Given** CL reads `/v1/audit-logs`, **When** audits carry inspector coordinate keys, **Then** those keys are masked; AM/OP read them intact (covered in TASK-F03-1; this task must not introduce a new leak).

### User Story 5 - Inspector is reminded to finish an overdue job (Priority: P2)

A scheduled job whose booked window has ended by a configurable margin, and which is either not checked in or checked in but not finished, triggers a push (with SMS fallback) to the inspector — once per appointment, civil date and inspector.

**Why this priority**: Contract **03.16**. Depends on F02's `PublishSystemInspectorNoticeUseCase`.

**Independent Test**: run the completion-reminder use case twice for a qualifying appointment; assert exactly one notice and one `inspection.completion_reminder_sent` audit (second cycle deduped by F02).

**Acceptance Scenarios**:

1. **Given** a `SCHEDULED` job today, window end 11:00, margin 30 min, now 11:31, no execution, **When** the reminder runs, **Then** F02 is called with `type: COMPLETION_REMINDER`, the "not started" body, `dedupeKey = completion-reminder:{appointmentId}:{civilDate}:{inspectorId}`, `targetPath = /schedule/{appointmentId}`.
2. **Given** an in-progress execution without finish, **When** the reminder runs, **Then** the "did you finish" body is used with the same `dedupeKey`.
3. **Given** the inspector has **another** in-progress (non-abandoned) execution started after this window's end, **When** the reminder runs, **Then** this appointment is skipped (`skippedBusy`).
4. **Given** F02 returns `{ created: true, noticeId }`, **Then** an `inspection.completion_reminder_sent` audit is written; `{ created: false }` → no audit, counted `skippedAlreadySent`.
5. **Given** `completionReminderEnabled: false`, **Then** nothing is sent.
6. **Given** the reminder title/body, **Then** they contain only the service code, property address and (not-started variant) the window end — never tenant name, phone, lockbox/key codes or the access note (locked-screen safe, D12).

### User Story 6 - Tenant cannot self-reschedule a job the inspector rejected (Priority: P2)

After an inspector `CANT_DO` rejection (`INSPECTOR_UNABLE`), the tenant's portal link stays valid but "change time" is blocked; only operations can re-offer the job.

**Why this priority**: D20 / L-F03-01. A tenant reviving an inspector-rejected job would contradict the field report.

**Independent Test**: with the active portal token, `GET` portal data → `appointment.canChangeTime: false`; `GET` available groups → `[]`; `join-group` → `409 PORTAL_APPOINTMENT_INACTIVE`. For `TENANT_DECLINED` the portal still revives the job.

**Acceptance Scenarios**:

1. **Given** `REJECTED` + `INSPECTOR_UNABLE`, **When** the portal is read, **Then** `canChangeTime: false`, available groups are empty (eligible-slot lookup is not called), and `join-group` returns `409 PORTAL_APPOINTMENT_INACTIVE`.
2. **Given** `REJECTED` + `TENANT_DECLINED`, **When** the portal is used, **Then** the existing `REJECTED → AWAITING_INSPECTOR → SCHEDULED` revive path still works.
3. **Given** a race where operations set `INSPECTOR_UNABLE` between read and lock, **When** `join-group` re-reads inside the transaction, **Then** it still refuses.

### User Story 7 - Finish and Can't-do cannot corrupt each other under concurrency (Priority: P1)

If a finish and a can't-do arrive for the same appointment at the same time, exactly one wins and the other fails cleanly, with no deadlock and no mixed state.

**Why this priority**: A mixed state (e.g. `DONE` with a `CANT_DO` event, or `REJECTED` with a `finished_at`) is a data-integrity failure in finance-bearing data.

**Independent Test**: integration test firing `/finish` and `/cant-do` concurrently 20× (fresh appointments, with a barrier); each round: exactly one of {DONE+finished, REJECTED+abandoned} and the other a clean 409/422; no `40P01` deadlock; removing the lock or the CAS makes the test fail.

**Acceptance Scenarios**:

1. **Given** an in-progress execution, **When** finish and can't-do race, **Then** both take the same appointment-row `FOR UPDATE` lock as their first statement and serialize; the loser sees the new status and returns 409/422.
2. **Given** any writer that bypasses the lock, **When** it writes the status, **Then** the compare-and-swap (`expectedStatus: 'SCHEDULED'`) rejects it with `409 APPOINTMENT_STATUS_CHANGED`.

### Edge Cases

- **Double tap, same key** → cached response; **new key after rejection** → `409 CANT_DO_ALREADY_REPORTED`; never two rejections.
- **Offline queue items**: `CANT_DO`/`LATE_NOTICE` are never queued offline (premise A-Q2 / D7). A queued `FINISH` arriving after a `CANT_DO` fails the `REJECTED → DONE` transition permanently; a queued `START` arriving after → 404 (no longer assigned). The PWA (F03-3) clears the appointment's queue on report.
- **Rejection after check-in** → `abandoned_at`; all readers treat it as not started; re-offer restarts the same row (D13), snapshotting the **current** geofence radius (D24).
- **Appointment not SCHEDULED** → 409 (assigned) or 404 (not assigned/other inspector, without revealing existence).
- **No active OP/AM** → log error; rejection still stands.
- **Late notice after window end** → allowed; `estimatedArrivalAt = max(windowStart/publishedStart, now) + minutesLate`.
- **Late notice has no note field** → a submitted `note` is stripped by the schema.
- **Reminder crossing midnight** (window end 23:45 + 30 min) → not sent (rule is "today"); known limitation (D17), documented.
- **Reminder after same-day re-offer** → `dedupeKey` includes the inspector, so the new inspector gets their own.
- **Immutable events**: no `updated_at`, no edit/delete endpoint.

## Requirements *(mandatory)*

### Functional Requirements

**Shared contracts**

- **FR-001**: The `RejectionReasonCode` enum MUST add `INSPECTOR_UNABLE` (total **9** codes) with a doc note "System-assigned only", and export `SYSTEM_ONLY_REJECTION_CODES = ['INSPECTOR_UNABLE']`. `formatReasonCodeLabel('INSPECTOR_UNABLE')` MUST be "Inspector Unable". (TASK-F07-1 later raises the count to 11; tests here must not assume the list is closed beyond "exactly 9".)
- **FR-002**: A new `InspectorFieldEventType` enum MUST have exactly `CANT_DO`, `LATE_NOTICE`; `FieldIssueReason` exactly the 6 values (`NO_ANSWER`, `KEY_FAILED`, `TENANT_REFUSED`, `UNSAFE`, `SITE_ISSUE`, `CANT_ATTEND`) with labels; `LateNoticeReason` exactly 4 (`TRAFFIC`, `PREVIOUS_JOB_OVERRAN`, `PERSONAL`, `OTHER`) with labels; `FIELD_ISSUE_NOTE_REQUIRED_REASONS = ['SITE_ISSUE']`; `LATE_NOTICE_MINUTES_OPTIONS = [10,20,30,45,60,90]`.
- **FR-003**: Shared MUST export `TRANSITION_SOURCE_INSPECTOR_CANT_DO = 'INSPECTOR_CANT_DO'` in `constants/transition-sources.ts` (D31), used by the can't-do use case and the web timeline instead of a literal.
- **FR-004**: Shared MUST export `COMPLETION_REMINDER_DEDUPE_PREFIX = 'completion-reminder'` and `buildCompletionReminderDedupeKey({ appointmentId, civilDate, inspectorId })` → `completion-reminder:{a}:{d}:{i}`.
- **FR-005**: Shared MUST define request/response schemas `cantDoRequestSchema`, `cantDoResponseSchema`, `lateNoticeRequestSchema`, `lateNoticeResponseSchema`, `inspectorIssueSchema` (with nullable/optional `inspectorId`), `fieldEventItemSchema`, `executionSummarySchema`, `appointmentFieldActivityResponseSchema`, `inspectorLastFieldIssueSchema`, matching the shapes in the task's "Modelo de dados / Contratos". `appointmentResponseSchema.inspectorIssue` MUST be declared nullable+optional; `portalDataResponseSchema.appointment.canChangeTime` MUST be an optional boolean; `inspectorAppointmentDetailResponseSchema.lastFieldIssue` MUST be nullable+optional.
- **FR-006**: The validators MUST enforce: `cantDoRequestSchema` requires a trimmed non-empty `note` for `FIELD_ISSUE_NOTE_REQUIRED_REASONS` and `note ≤ 500`; latitude and longitude must be sent together; `lateNoticeRequestSchema` requires integer `minutesLate` in 5..240 and strips any `note`.

**Persistence**

- **FR-007**: A single expand-only migration MUST add the `InspectorFieldEventType` enum, the `inspector_field_events` table (columns, indexes and relations per the task's Prisma block; `tenant_id` present = the appointment's tenant), and the nullable `inspection_executions.abandoned_at` column. One migration per PR; timestamp regenerated at implementation so it orders after F02's migration.
- **FR-008**: `InspectorFieldEvent` is agency-scoped and therefore **carries `tenant_id`** — this is NOT a §7.1 exception (unlike `PlatformSetting`). A scoping test MUST prove a CL actor of another tenant gets 404 from field activity and that CL never receives inspector coordinates.

**"Can't do this job" (contract 00.7 / 03.1 / 03.2)**

- **FR-009**: `POST /v1/inspector/appointments/:appointmentId/cant-do` MUST require an `Idempotency-Key` (scope `cant-do`, TTL 24h), be restricted to INSP on their own `SCHEDULED` appointments, and within one transaction: take `SELECT id FROM appointments WHERE id = $1 FOR UPDATE` as the **first** statement; re-read idempotency in-tx; validate assignment/status; mark any in-progress execution `abandoned_at`; create the `CANT_DO` event with the appointment's `tenant_id`; drive `SCHEDULED → REJECTED` as `{ ...SYSTEM_ACTOR, tenantId: appointment.tenantId }` with `rejectionReasonCode: 'INSPECTOR_UNABLE'`, `expectedStatus: 'SCHEDULED'` (CAS) and `auditMetadata`; persist idempotency in-tx.
- **FR-010**: `ExecuteStatusTransitionUseCase` MUST accept an optional generic `auditMetadata: Record<string, unknown>` merged into the `status_transition` audit and the `STATUS_TRANSITION` event (used by F06-2's finish too), and an optional `expectedStatus` that switches the write to `updateMany({ where: { id, tenant_id, status: expectedStatus } })`, raising `409 APPOINTMENT_STATUS_CHANGED` on `count === 0`. It MUST add a guard: a human actor using a `SYSTEM_ONLY_REJECTION_CODES` code → `403 REJECTION_REASON_CODE_SYSTEM_ONLY`. It MUST NOT change `appointment-state-machine.ts` or any of the other 4 transition-RBAC sources.
- **FR-011**: After commit (each step independently fail-safe), the use case MUST write audits `inspector_field_event.cant_do` (actor USER=inspector; metadata `fieldEventId, reason, hasNote, afterCheckIn, executionId` — never the note text) and, if applicable, `inspection_execution.abandoned`; send one `INSPECTOR_UNABLE_ALERT` per active OP/AM; and emit `INSPECTOR_FIELD_EVENTS.RECORDED`. The `reason` string stored on the appointment MUST be `FIELD_ISSUE_REASON_LABELS[reason] + (note ? ' — ' + note.trim() : '')`.
- **FR-012**: Error contract per the task's endpoint table: `400 IDEMPOTENCY_KEY_MISSING` / `VALIDATION_ERROR`; `403 FORBIDDEN` / `INSPECTOR_NOT_LINKED`; `404 APPOINTMENT_NOT_FOUND`; `409 CANT_DO_ALREADY_REPORTED` / `FIELD_EVENT_APPOINTMENT_NOT_SCHEDULED` / `EXECUTION_ALREADY_FINISHED` / `FIELD_EVENT_IDEMPOTENCY_PAYLOAD_MISMATCH`.

**"Running late" (contract 00.8)**

- **FR-013**: `POST /v1/inspector/appointments/:appointmentId/late-notice` MUST require an `Idempotency-Key` (scope `late-notice`, TTL 24h), be INSP-only on their own `SCHEDULED` job, reject when the job is not today in the agency timezone, when already checked in (in-progress non-abandoned), or when finished (each a `422 LATE_NOTICE_NOT_ALLOWED` with the specific message). It MUST compute `estimatedArrivalAt = max(reference, effectiveNoticeAt) + minutesLate` where `reference = publishedStopStartReader.find(...) ?? windowStartAt`, write the `LATE_NOTICE` event (no note), audit `inspector_field_event.late_notice`, emit a domain event, and return `{ eventId, appointmentId, occurredAt, reason, minutesLate, referenceAt, referenceSource, estimatedArrivalAt }`. No status change, no notification.
- **FR-014**: A pure `computeEstimatedArrivalAt(reference, effectiveNoticeAt, minutesLate)` MUST be exported so F05/F06/F07 recompute arrival the same way without recomputing an ETA. The F03 `IPublishedStopStartReader` implementation returns `null` (F04 not merged yet); TASK-F04-2 wires the real adapter.

**Abandoned execution (D13)**

- **FR-015**: The following readers MUST treat an execution with `abandoned_at` set as "not started": `start` (restarts the same row with new inspector/coords/flags and the current geofence radius, writing `inspection_execution.restarted` audit with no coordinates), `finish` (`404 EXECUTION_NOT_STARTED`), inspector schedule (`executionStatus NOT_STARTED`), inspector appointment detail (`execution: null`), `findStuckExecutions` (filters `abandoned_at IS NULL`), and the portal `report-unavailability` (no longer raises `PortalInspectionAlreadyStartedError`).

**Field activity & inspectorIssue projection**

- **FR-016**: `GET /v1/appointments/:appointmentId/field-activity` MUST return `{ execution, events }` with the **same tenant cut as `GetAppointmentUseCase`**: AM/OP any agency; CL_ADMIN/CL_USER own tenant only and **without** any latitude/longitude keys; INSP 403; cross-tenant CL 404. Events ordered `occurredAt` desc, max 50.
- **FR-017**: `GET /v1/appointments/:id` and `GET /v1/appointments` MUST include `inspectorIssue` (latest `CANT_DO`: `reason, note, inspectorId, inspectorName, occurredAt`) or null, computed via one `DISTINCT ON` query per page (no N+1, no nested `take: 1` include). The export's "Cancellation Reason" column already humanizes `INSPECTOR_UNABLE`; no new column.
- **FR-018**: `GET /v1/inspector/appointments/:id` MUST include `lastFieldIssue` (`reason, note, occurredAt`) only when the latest `CANT_DO` of the appointment was made by the requesting inspector; else null (D28).

**Operations alert & agency e-mail**

- **FR-019**: A new platform template `INSPECTOR_UNABLE_ALERT` (EMAIL, TRANSACTIONAL explicit, target `PLATFORM_OPS`) MUST be registered in all 8 template-registration places (not `seed.ts`; seeded by `syncPlatformTemplates` at boot) with its `INSPECTOR_UNABLE_ALERT_PAYLOAD_KEYS`, subject and body per the task.
- **FR-020**: `INSPECTION_REJECTED_AGENCY` MUST gain optional variable `rejectedByInspector` and reuse `inspectorName`; when the rejection code is `INSPECTOR_UNABLE`, the payload builder sets `rejectedByInspector: true` and `inspectorName` from the latest `CANT_DO` (the appointment already has `inspector_id` null), and the template renders the inspector block; otherwise the current paragraph is unchanged. No new template, no 8-place registration.

**Completion reminder (contract 03.16)**

- **FR-021**: A `send-completion-reminders` use case + a 15-minute job MUST select today's `SCHEDULED`, inspector-assigned, non-deleted appointments whose window end + `completionReminderMinutesAfterWindowEnd` has passed (agency timezone) and that have no finished execution; skip an inspector who is busy on another later in-progress execution (`skippedBusy`); call F02 `PublishSystemInspectorNoticeUseCase` with `type COMPLETION_REMINDER`, the right variant body, the dedupe key and `targetPath`; audit `inspection.completion_reminder_sent` only on `created === true`; and log a summary `{ candidates, sent, skippedAlreadySent, skippedBusy, failed }`. Gated off by `completionReminderEnabled: false`. **Depends on F02-1 merged; this slice ships last and the PR rebases onto F02-1 before merge.**

**Portal (D20 / L-F03-01)**

- **FR-022**: `rental-tenant-portal/domain/portal-statuses.ts` MUST add `isPortalChangeTimeBlocked({ status, rejectionReasonCode }) = isPortalDeadStatus(status) || (status === 'REJECTED' && SYSTEM_ONLY_REJECTION_CODES.includes(rejectionReasonCode))`, used by `join-group` (the 3 points that call `isPortalDeadStatus`, same `PortalAppointmentInactiveError`), `get-available-groups` (returns `{ groups: [] }` before querying slots) and `get-portal-data` (`appointment.canChangeTime`). `isPortalDeadStatus` and `PORTAL_DEAD_STATUSES` MUST NOT change (so `TENANT_DECLINED` still revives). The tenant's confirmation status MUST NOT be altered.

**Concurrency**

- **FR-023**: `finish-inspection.use-case.ts` MUST take the same appointment-row `FOR UPDATE` lock as its **first** transaction statement, re-read the execution in-tx (abandoned/finished → 404/409), and call the transition with `expectedStatus: 'SCHEDULED'`. The lock + CAS MUST be proven by an integration test that fails when either is removed.

**Generated artifacts**

- **FR-024**: `openapi.json` and `api-types.ts` MUST be regenerated and committed (`pnpm generate:api`); shared built before backend typecheck/tests. The matching `CLAUDE.md` files MUST be updated in this PR (backend + shared) and the X00 transition clauses (N6/N9) that this PR makes true MUST be removed per L-X00-04.

### Key Entities

- **InspectorFieldEvent**: an immutable record that an inspector reported something from the field. Attributes: appointment, inspector, tenant (the appointment's), type (`CANT_DO` | `LATE_NOTICE`), reason code (a `FieldIssueReason` or `LateNoticeReason`), optional note (CANT_DO only, ≤500), optional minutes (LATE_NOTICE only, 5..240), optional latitude/longitude/accuracy, optional client-reported time, created_at. Indexed for latest-per-appointment, per-inspector, per-tenant and per-type reads.
- **InspectionExecution (extended)**: gains `abandoned_at` — a non-null value means the check-in was abandoned (inspector reported can't-do after checking in). Treated as "not started" by all readers; a later `start` restarts the same row.
- **RejectionReasonCode (extended)**: gains `INSPECTOR_UNABLE`, the only member of `SYSTEM_ONLY_REJECTION_CODES`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (contract 00.A3)**: Check-in, check-out and "Can't do this job" each record date, time and inspector and appear in the detail/field-activity API. Proven by integration tests 17 (the can't-do creates the transition, unlinks the group, releases the inspector, exposes `inspectorIssue`) and 18 (after check-in).
- **SC-002 (contract 03.A2)**: No change in this task (covered by TASK-F03-1); the acceptance code is carried for homologation traceability.
- **SC-003**: `INSPECTOR_UNABLE` is refused for human actors (unit test on the transition use case) and accepted only for SYSTEM.
- **SC-004**: The completion reminder reaches the inspector exactly once per appointment, civil date and inspector, with the correct "in-progress" vs "not-started" text (tests 16 and 21).
- **SC-005**: After a "Can't do this job", the tenant cannot reschedule via the portal (tests 13b and 18).
- **SC-006**: The agency rejection e-mail states the inspector could not complete the job when the code is `INSPECTOR_UNABLE` (test 14b).
- **SC-007**: `POST .../late-notice` returns `estimatedArrivalAt` and is accepted only on the day, before check-in (tests 7 and 19).
- **SC-008**: Under 20× concurrent finish-vs-can't-do rounds, exactly one wins each round with no deadlock and no mixed state; removing the lock or CAS makes the proof test fail (test 23).
- **SC-009**: No audit written by this task stores raw inspector latitude/longitude, and no field-activity or audit-log response to a CL role carries a coordinate key.
- **SC-010**: Reading an appointments page carries exactly one extra query for `inspectorIssue` regardless of page size (test 17).

## Assumptions

- **A-Q2 (premise, decision D7, wording assumed)**: new field events (`CANT_DO`, `LATE_NOTICE`) require live connectivity and are **never** placed in the PWA offline queue; the existing offline tolerance of `start`/`finish` is kept. Chosen per the plan recommendation; recorded as a premise because Q2's wording was assumed rather than ratified.
- **Dependency F03-1 merged** (`PlatformSetting`, `fieldEvents` settings key incl. `completionReminderMinutesAfterWindowEnd`/`completionReminderEnabled`, start/finish accuracy + distance + flags, `GeofenceMode` enum, `resolveEffectiveEventTime`, the audit-log coordinate mask). Confirmed merged (#1314).
- **Dependency F02-1 (partial)**: only the completion-reminder slice (FR-021) needs F02's `PublishSystemInspectorNoticeUseCase`. The rest is built first; the 03.16 slice ships last, and the PR is rebased onto F02-1 and merged only after F02-1 merges. If F02-1 is late, FR-021 can split to a follow-up PR without changing the rest (recorded in the plan).
- The agency timezone is `tenants.timezone` (default `Australia/Sydney`); civil dates and time windows are wall-clock in that zone; instants are UTC ISO. Platform jobs ("today", cut-offs) run on `PLATFORM_TIMEZONE`. Timezone-dependent tests pin `TZ` away from Sydney.
- The existing `SYSTEM_ACTOR` + `report-unavailability` precedent (`TENANT_DECLINED` via SYS) is the model for the SYS rejection; `SCHEDULED → REJECTED` already accepts SYS in the state machine, so no RBAC source changes.
- Backend DB integration tests run via testcontainers, serially, and are excluded from the main `pnpm --filter backend test` run (invoked explicitly as `test:integration:db`).

## Out of Scope

- Any new appointment status or new transition RBAC rule.
- Any tenant notification when the inspector can't complete.
- Self-service unassign; entry photo; "called the tenant"; continuous tracking.
- The Live Day "Needs attention" item (F05) and tenant arrival notices (F06).
- Marking the `DayPlan` STALE (F04 subscribes to the exported events).
- An operations→inspector reply about the can't-do.
- A reason-code filter on the list (does not exist today).
- All web/PWA UI (TASK-F03-3 / F03-4).
