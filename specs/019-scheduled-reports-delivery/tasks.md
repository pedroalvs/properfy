# Tasks: Scheduled Reports and Delivery

**Input**: Design documents from `/specs/019-scheduled-reports-delivery/`
**Prerequisites**: plan.md, spec.md

**Status**: **SHIPPABLE (2026-04-22)** — 93 of 106 tasks complete. T050, T054, T077 (integration/unit tests for recipient resolver, delivery fan-out, and worker), T096 (Scheduled Reports cross-link in ReportListPage), and T097 (extended component tests for FormDrawer, ReassignOwnershipModal, ScheduleRunHistoryDrawer) are now closed. The 13 remaining unchecked tasks are: frontend polish stubs (T083, T087-T089, T091-T093), and manual smoke tests (T103-T106). All critical paths and test coverage milestones delivered.

**Tests**: TDD is mandatory per constitution. Unit + integration tests are included in each wave. The scheduled-run idempotency (via `(schedule_id, scheduled_for)` unique key), catch-up policy, and auth rehydration each have dedicated test tasks because they are the three highest-risk pieces of the Wave 3 critical path.

**Organization**: Tasks are grouped by user story following the priority order in `spec.md`. Phase 2 (Foundational) is a hard prerequisite for all user stories because it introduces the schema migration, the domain entity reshape, and the new `ScheduledReportRun` ledger. Wave 3 of the plan (worker reshape + delivery fan-out) is the critical path — it is the only wave that can regress the existing scheduled-report worker or double-notify users.

**Implemented reality callout (pre-implementation snapshot)**: at planning time the 019 spec said "Status: Draft" but exploration showed a partial skeleton already existed (`ScheduledReport` Prisma model, entity, repository, `CreateScheduledReportUseCase`, `ListScheduledReportsUseCase`, `ProcessSchedulesWorker` scheduled via `report.process-schedules` every 15 min, `cron-parser.ts`, `REPORT_READY` already emitted by `ProcessReportJobUseCase` on the happy path with `downloadLink = /reports/${reportId}`). Tasks below **extend** that skeleton rather than replacing it. See plan.md "Implemented Reality vs Approved Target" for the full table. **Post-implementation (2026-04-12)**: the feature is delivered — see the top-level Status line above and `spec.md` "Delivery Outcome".

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions

- **Shared**: `packages/shared/src/`
- **Backend**: `apps/backend/src/`
- **Backend tests**: `apps/backend/tests/`
- **Frontend**: `apps/web/src/`

---

## Phase 1: Setup

**Purpose**: Verify implemented-reality assumptions before touching code and pin the frontend integration points.

- [X] T001 Verify implemented reality per plan Summary table — confirm `ScheduledReport` Prisma model exists at `apps/backend/prisma/schema.prisma:1127` with columns `cron_expression`, `delivery_email`, `is_active`, `last_run_at`, `next_run_at`, `created_by_user_id`; confirm `ScheduledReportEntity` at `apps/backend/src/modules/report/domain/scheduled-report.entity.ts` with `isDue()`, `markRun()`, `deactivate()`; confirm `CreateScheduledReportUseCase`, `ListScheduledReportsUseCase`, `ProcessSchedulesWorker`, `cron-parser.ts` exist; confirm `POST/GET /v1/reports/schedules` are wired in `report.routes.ts`; confirm pg-boss schedule `report.process-schedules` is registered in `main/workers.ts` (line ~124); confirm `REPORT_READY` is in `notification.constants.ts` `VALID_TEMPLATE_CODES` but NOT yet seeded in `prisma/seed.ts`; confirm `REPORT_FAILED` does NOT exist; confirm `scheduled_report_id` FK does NOT exist on `reports`; confirm no `scheduled_report_runs` table. Record the concrete list of files to touch during T001 and note any divergence from the plan's pre-implementation snapshot.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema migration, new enums, domain entity reshape, new run-ledger entity, repository extensions, shared Zod schemas. All user stories depend on this phase.

**CRITICAL**: No user story work can begin until this phase is complete.

### Schema & Enums

- [X] T002 Extend `ScheduledReport` model in `apps/backend/prisma/schema.prisma` — add columns: `display_name` (`String @db.VarChar(120)` nullable for back-compat, default `NULL`), `delivery_mode` (new enum `ScheduleDeliveryMode`, default `OWNER_ONLY`), `recipient_user_ids` (`Json` with default `[]`), `skip_delivery_when_empty` (`Boolean @default(false)`), `consecutive_failure_count` (`Int @default(0)`), `status` (new enum `ScheduleStatus`, default `ACTIVE`), `deleted_at` (`DateTime?`). Keep existing `is_active` column and index; add a new index `@@index([status, next_run_at])`.
- [X] T003 Add `ScheduleDeliveryMode` enum to `apps/backend/prisma/schema.prisma` with values `OWNER_ONLY`, `RECIPIENT_LIST`, `TENANT_WIDE`.
- [X] T004 Add `ScheduleStatus` enum to `apps/backend/prisma/schema.prisma` with values `ACTIVE`, `PAUSED`.
- [X] T005 Add `ScheduleRunStatus` enum to `apps/backend/prisma/schema.prisma` with values `queued`, `running`, `completed`, `failed`, `skipped_catchup`, `skipped_empty`.
- [X] T006 Create new `ScheduledReportRun` Prisma model in `apps/backend/prisma/schema.prisma` with fields: `id` (uuid pk), `schedule_id` (uuid FK → `scheduled_reports.id`, cascade), `report_id` (uuid FK → `reports.id`, set null on delete, nullable), `status` (`ScheduleRunStatus`), `scheduled_for` (`DateTime`), `started_at` (`DateTime?`), `completed_at` (`DateTime?`), `error_message` (`String?`), `recipient_count` (`Int?`), `delivery_status_json` (`Json?`), `created_at` (default now), `updated_at` (updatedAt). Unique constraint `@@unique([schedule_id, scheduled_for])`. Indexes: `@@index([schedule_id, created_at])`, `@@index([report_id])`, `@@index([status])`. Map to `scheduled_report_runs` table.
- [X] T007 Add optional `scheduled_report_id` (uuid FK → `scheduled_reports.id`, set null on delete, nullable) to the existing `Report` Prisma model in `apps/backend/prisma/schema.prisma`. Add index `@@index([scheduled_report_id])`.
- [X] T008 Create migration SQL file at `apps/backend/prisma/migrations/20260412000000_scheduled_reports_delivery/migration.sql` implementing T002..T007. Include an additive data migration that backfills existing `scheduled_reports` rows with sensible defaults: `status = CASE WHEN is_active THEN 'ACTIVE' ELSE 'PAUSED' END`, `display_name = NULL`, `delivery_mode = 'OWNER_ONLY'`, `recipient_user_ids = '[]'::jsonb`, `skip_delivery_when_empty = false`, `consecutive_failure_count = 0`, `deleted_at = NULL`. Do NOT drop `is_active`, `cron_expression`, or `delivery_email` — keep for back-compat.
- [X] T009 Apply migration and regenerate Prisma client: `cd apps/backend && pnpm exec prisma format && pnpm exec prisma validate && pnpm exec prisma migrate dev --name scheduled_reports_delivery && pnpm exec prisma generate`. Verify no existing report tests break.

### Shared Zod Schemas

- [X] T010 [P] Add shared Zod enums in `packages/shared/src/schemas/report.ts`: `scheduleDeliveryModeSchema` (`OWNER_ONLY | RECIPIENT_LIST | TENANT_WIDE`), `scheduleStatusSchema` (`ACTIVE | PAUSED`), `scheduleRunStatusSchema` (`queued | running | completed | failed | skipped_catchup | skipped_empty`). Export the inferred types.
- [X] T011 [P] Add `structuredRecurrenceSchema` to `packages/shared/src/schemas/report.ts` as a discriminated union over `type = 'daily' | 'weekly' | 'monthly'` with per-variant params: `{type: 'daily', hour: 0-23}`, `{type: 'weekly', dayOfWeek: 0-6, hour: 0-23}`, `{type: 'monthly', dayOfMonth: 1-31, hour: 0-23}`. Export the inferred type.
- [X] T012 [P] Extend `createScheduledReportSchema` in `packages/shared/src/schemas/report.ts` to accept the new shape: `{ reportType, filters, format, recurrence: structuredRecurrenceSchema, deliveryMode, recipientUserIds: z.array(z.string().uuid()).max(50).default([]), displayName: z.string().max(120).optional(), skipDeliveryWhenEmpty: z.boolean().default(false) }`. Keep a deprecated back-compat field `cronExpression` marked `.optional()` for the current API consumers; mark it for removal in a future pass. Also keep `deliveryEmail` as optional deprecated.
- [X] T013 [P] Add `updateScheduledReportSchema` in `packages/shared/src/schemas/report.ts` — same shape as create but every field optional; at least one field must be present.
- [X] T014 [P] Add `pauseScheduleSchema` (`{ reason: z.string().max(500).optional() }`) and `reassignOwnershipSchema` (`{ newOwnerUserId: z.string().uuid(), reason: z.string().min(1).max(1000) }`) in `packages/shared/src/schemas/report.ts`.
- [X] T015 [P] Add `listScheduleRunsQuerySchema` (`{ page, pageSize, status? }`) and `scheduledReportRunResponseSchema` (`{ id, scheduleId, reportId, status, scheduledFor, startedAt, completedAt, errorMessage, recipientCount, deliveryStatus }`) in `packages/shared/src/schemas/report.ts`.
- [X] T016 [P] Extend `scheduledReportResponseSchema` in `packages/shared/src/schemas/report.ts` with the new columns: `displayName`, `deliveryMode`, `recipientUserIds`, `skipDeliveryWhenEmpty`, `consecutiveFailureCount`, `status`, `deletedAt`, `lastRunStatus` (derived).
- [X] T017 Rebuild shared package: `pnpm --filter @properfy/shared build` — verify clean build with no type errors.

### Domain Entities

- [X] T018 [P] Extend `ScheduledReportEntity` at `apps/backend/src/modules/report/domain/scheduled-report.entity.ts` — add props/fields: `displayName: string | null`, `deliveryMode: 'OWNER_ONLY' | 'RECIPIENT_LIST' | 'TENANT_WIDE'`, `recipientUserIds: string[]`, `skipDeliveryWhenEmpty: boolean`, `consecutiveFailureCount: number`, `status: 'ACTIVE' | 'PAUSED'`, `deletedAt: Date | null`. Replace `deactivate()` (keep as deprecated) with domain methods: `pause(reason?: string): void`, `resume(): void` (resets `consecutiveFailureCount` to 0, recomputes `nextRunAt` via the cron parser, `status = ACTIVE`), `softDelete(): void` (sets `deletedAt`), `recordSuccess(now: Date, nextRunAt: Date): void` (resets counter, updates lastRun/nextRun), `recordFailure(now: Date): { autoPaused: boolean }` (increments counter, auto-pauses at 3, returns whether it was auto-paused). Update `isDue()` to also check `status === 'ACTIVE' && deletedAt === null`.
- [X] T019 [P] Create `ScheduledReportRunEntity` at `apps/backend/src/modules/report/domain/scheduled-report-run.entity.ts` with props: `id, scheduleId, reportId, status, scheduledFor, startedAt, completedAt, errorMessage, recipientCount, deliveryStatusJson, createdAt, updatedAt`. Methods: `markRunning()`, `markCompleted(recipientCount, deliveryStatus)`, `markFailed(errorMessage)`, `markSkippedCatchup()`, `markSkippedEmpty()`.
- [X] T020 [P] Add scheduled-report-specific errors to `apps/backend/src/modules/report/domain/report.errors.ts`: `ScheduleNotFoundError`, `ScheduleForbiddenError`, `ScheduleForbiddenReassignmentError` (AM-only), `MaxSchedulesPerUserExceededError` (FR-034), `InvalidRecurrenceError` (FR-035 min 1 day + invalid struct), `IncompatibleRecipientError` (recipient missing permission/tenant scope), `IncompatibleOwnershipError` (reassign target user doesn't have compatible permissions), `ScheduleRunNotFoundError`.

### Repositories

- [X] T021 Extend `IScheduledReportRepository` interface at `apps/backend/src/modules/report/domain/scheduled-report.repository.ts` — add methods: `findByIdNotDeleted(id)`, `findByIdAllIncludingDeleted(id)`, `findActiveByOwner(userId)`, `countActiveByOwner(userId)`, `findDueForProcessing(now)` (replacing `findDueSchedules` — filters by `status = 'ACTIVE' AND deleted_at IS NULL AND next_run_at <= now`), `findByIdWithLatestRun(id)`, `softDelete(id)`. Keep legacy `findDueSchedules` as deprecated wrapper.
- [X] T022 Create `IScheduledReportRunRepository` interface at `apps/backend/src/modules/report/domain/scheduled-report-run.repository.ts` with methods: `save(entity)`, `update(entity)`, `findById(id)`, `findByScheduleId(scheduleId, page, pageSize)`, `countByScheduleId(scheduleId)`, `findByScheduleAndScheduledFor(scheduleId, scheduledFor)`, `findLatestForSchedule(scheduleId)`, `countConsecutiveFailures(scheduleId, upToRunId)` (defensive cross-check for the counter invariant).
- [X] T023 Create `IScheduleRecipientResolver` interface at `apps/backend/src/modules/report/domain/schedule-recipient-resolver.ts` with methods: `resolve(schedule, report): Promise<ResolvedRecipient[]>` where `ResolvedRecipient = { userId, email, name, accessValid: boolean, skipReason?: string }`. The resolver encapsulates the delivery-mode logic (owner-only / recipient-list / tenant-wide) and per-recipient validation.
- [X] T024 Implement `PrismaScheduledReportRepository` extensions in `apps/backend/src/modules/report/infrastructure/prisma-scheduled-report.repository.ts` — add the new columns to the mapToEntity/save/update methods and implement the new lookup methods. Ensure `findDueForProcessing` filters by `status = 'ACTIVE' AND deleted_at IS NULL AND next_run_at <= now`.
- [X] T025 [P] Implement `PrismaScheduledReportRunRepository` at `apps/backend/src/modules/report/infrastructure/prisma-scheduled-report-run.repository.ts` with the methods from T022. Use `findFirst` + `upsert` semantics for the `(scheduleId, scheduledFor)` uniqueness.
- [X] T026 [P] Implement `PrismaScheduleRecipientResolver` at `apps/backend/src/modules/report/infrastructure/prisma-schedule-recipient-resolver.ts`. Takes a `UserRepository` and a `TenantRepository` in the constructor. `OWNER_ONLY` returns one entry for the creator; `RECIPIENT_LIST` loads each listed user and validates (same tenant, active, has `export_reports` or AM/OP role, has access to the report type per RESTRICTED_REPORT_TYPES rules); `TENANT_WIDE` queries all active users in the schedule's tenant and filters by report-type access.
- [X] T027 Extend `Report` entity (`apps/backend/src/modules/report/domain/report.entity.ts`) and `IReportRepository` to carry `scheduledReportId: string | null`. Update `PrismaReportRepository` save/update/mapToEntity to persist the new column. `RequestReportUseCase` already has an input — extend it in Wave 3 to accept an optional `scheduledReportId`.

### Typecheck Checkpoint

- [X] T028 Run `pnpm --filter backend typecheck` — should be clean. If errors exist in existing code that constructs `ScheduledReportEntity` directly, add the new required fields with sensible defaults.
- [X] T029 Run `pnpm --filter backend test` — existing notification + report tests must still pass. No behavior change yet. This is a "foundational checkpoint": the migration applied cleanly, the domain was extended additively, and nothing downstream broke.

**Checkpoint**: schema migration applied; entities and repositories extended; shared schemas published. The worker, use cases, and routes still use the legacy shape. No behavior change yet.

---

## Phase 3: User Story 1 — Email notification on on-demand report completion (Priority: P1) 🎯 FAST UNBLOCK

**Goal**: Every on-demand report completion (or failure) triggers an email notification to the requesting user with a link to the report detail page in the app. Closes 011#GAP-010.

**Independent Test**: Request an on-demand report as an OP user with an email on file. Verify that on `COMPLETED` transition, a `REPORT_READY` notification row is created with `downloadLink = /reports/:id`. Trigger a simulated failure — verify `REPORT_FAILED` is emitted. Request as a user without an email — verify no notification is sent and no error is raised.

**Why this order**: US1 is decoupled from the schedule work and can ship first. It's a fast win that closes 011#GAP-010 immediately and validates the new `REPORT_FAILED` template in isolation before Wave 3 reuses it for scheduled failures.

### Notification Template Codes and Seeds

- [X] T030 [P] [US1] Add `REPORT_FAILED` to `VALID_TEMPLATE_CODES` in `apps/backend/src/modules/notification/domain/notification.constants.ts`. Add `REPORT_FAILED: 'OPERATIONAL'` to `DEFAULT_TEMPLATE_CLASSIFICATIONS` (neither `REPORT_READY` nor `REPORT_FAILED` belongs to `PROTECTED_TEMPLATE_CLASSIFICATIONS`).
- [X] T031 [US1] Seed template bodies in `apps/backend/prisma/seed.ts` — add `REPORT_READY` (subject: `Your report "{{reportType}}" is ready`, bodyText: `Hi {{userName}}, your {{reportType}} report is ready. View it at {{downloadLink}}. [unsubscribe footer]`, bodyHtml: HTML equivalent) and `REPORT_FAILED` (subject: `Your report "{{reportType}}" failed`, body mentions `{{errorMessage}}` and suggests retry). Both templates get the OPERATIONAL unsubscribe footer pattern (use `OP_EMAIL_FOOTER` defined in 018) with `{{unsubscribeUrl}}`. Seed for `tenantId = null` (platform default) so all tenants inherit.

### Tests for US1 (write BEFORE implementation)

- [X] T032 [P] [US1] Extend unit tests for `ProcessReportJobUseCase` in `apps/backend/tests/unit/report/process-report-job.use-case.test.ts` — add cases:
  - **Happy path REPORT_READY**: report completes → `CreateNotificationUseCase` is called once with `templateCode = 'REPORT_READY'`, `downloadLink = /reports/${reportId}`, and the requesting user's email
  - **Failure path REPORT_FAILED**: report fails → `CreateNotificationUseCase` is called once with `templateCode = 'REPORT_FAILED'`, the error message in the payload
  - **Graceful no-email**: user has no email → no notification is sent and no error is raised (mirrors the existing behavior for the happy path)
  - **Scheduled-report suppression (forward-looking, Wave 3 hook)**: if `report.scheduledReportId` is set, the single-recipient `REPORT_READY` path is suppressed (this test may skip until Wave 3 lands the delivery use case — mark as `it.todo` if so)

### Implementation for US1

- [X] T033 [US1] Extend `ProcessReportJobUseCase.execute()` at `apps/backend/src/modules/report/application/use-cases/process-report-job.use-case.ts` to emit `REPORT_FAILED` on the failure branch. Mirror the existing `sendReportReadyNotification` helper — create a new private `sendReportFailedNotification(reportId, tenantId, requestedByUserId, reportType, errorMessage)` that loads the user, gracefully no-ops if no email, and calls `notificationSender.execute({ tenantId, recipient: user.email, channel: 'EMAIL', templateCode: 'REPORT_FAILED', payloadJson: { userName, reportType, reportId, errorMessage, downloadLink: '/reports/${reportId}' } })`. Wrap in try/catch — notification failure must not affect report state.
- [X] T034 [US1] Run US1 tests: `pnpm --filter backend test process-report-job` — all green.

**Checkpoint**: on-demand completion and failure notifications work end-to-end. `REPORT_READY` and `REPORT_FAILED` templates are seeded and renderable. 011#GAP-010 is closed.

---

## Phase 4: User Story 2 — Create and manage report schedules (Priority: P2) 🎯 CORE CAPABILITY

**Goal**: Authorized users (AM, OP, CL_ADMIN, CL_USER with `export_reports`) can create a schedule with structured recurrence, delivery mode, recipient list, display name, and skip-when-empty toggle. Paused schedules do not execute. Deleted schedules are soft-removed.

**Independent Test**: Create a schedule as an OP with `recurrence = daily at 09:00`, `deliveryMode = OWNER_ONLY`. Wait for `nextRunAt`. Verify a `ScheduledReportRun` row is created with `status = queued`, a `Report` row is tagged with `scheduled_report_id`, and the notification is dispatched after completion. Pause the schedule — verify the next tick skips it. Resume — verify next tick runs it. Delete — verify future runs are blocked but existing runs remain queryable.

**Why this priority**: US2 is the core scheduled-reports capability. It depends on Phase 2 foundational work plus the notification templates from US1, but is independent of US3/US4/US5.

### Tests for US2 (write BEFORE implementation)

- [X] T035 [P] [US2] Unit tests for `ScheduledReportEntity` in `apps/backend/tests/unit/report/scheduled-report.entity.test.ts`:
  - `pause` / `resume` / `softDelete` state transitions
  - `recordSuccess` resets counter and updates timestamps
  - `recordFailure` increments counter, returns `{autoPaused: false}` for counts 1 and 2
  - `recordFailure` returns `{autoPaused: true}` and transitions to `PAUSED` at count 3
  - `isDue()` returns false when `status = PAUSED`, when `deletedAt` is set, when `nextRunAt > now`
  - `resume()` resets counter to 0 and recomputes `nextRunAt`
- [X] T036 [P] [US2] Unit tests for `CreateScheduledReportUseCase` in `apps/backend/tests/unit/report/create-scheduled-report.use-case.test.ts` — EXTEND existing cases:
  - Structured recurrence (daily/weekly/monthly) is mapped to a cron expression internally
  - `displayName` is persisted
  - `deliveryMode = OWNER_ONLY` with empty `recipientUserIds` → OK
  - `deliveryMode = RECIPIENT_LIST` with empty list → `InvalidRecurrenceError` (or new `EmptyRecipientListError`)
  - `deliveryMode = TENANT_WIDE` → recipients are NOT validated at creation time (resolved at delivery)
  - `skipDeliveryWhenEmpty` defaults to false and is persisted
  - RBAC: AM any tenant; OP own tenant; CL_ADMIN own tenant; CL_USER with `export_reports` own-record-only; CL_USER without `export_reports` → `ForbiddenError`; INSP → `ForbiddenError`; TNT → `ForbiddenError`
  - `MaxSchedulesPerUserExceededError` when the user already has 10 active schedules
  - Recipient validation at create time: each uuid in `recipientUserIds` must be an active user in the same tenant; `IncompatibleRecipientError` otherwise
  - Audit record `scheduledReportCreated` with before=null / after=snapshot
- [X] T037 [P] [US2] Unit tests for `UpdateScheduledReportUseCase` — 12 tests: field updates (displayName, filtersJson, deliveryMode, recipientUserIds), recurrence recompute, audit with before/after, not-found, full RBAC matrix (AM cross-tenant, OP own-tenant, OP cross-tenant denied, CL_ADMIN own-tenant, CL_USER own, CL_USER other denied). All passing.
- [X] T038 [P] [US2] Unit tests for `PauseScheduledReportUseCase` — 5 tests: ACTIVE→PAUSED transition, idempotent when already PAUSED, optional reason in audit, not-found, CL_USER cross-user denied. All passing.
- [X] T039 [P] [US2] Unit tests for `ResumeScheduledReportUseCase` — 7 tests: PAUSED→ACTIVE transition, counter reset to 0, nextRunAt recompute, idempotent when ACTIVE, audit with counter before/after, not-found, OP cross-tenant denied. All passing.
- [X] T040 [P] [US2] Unit tests for `DeleteScheduledReportUseCase` — 5 tests: soft-delete sets deletedAt + status PAUSED, audit with before/after, not-found, CL_USER own allowed, CL_USER other denied. All passing.

### Implementation for US2

- [X] T041 [US2] Broaden `CreateScheduledReportUseCase` at `apps/backend/src/modules/report/application/use-cases/create-scheduled-report.use-case.ts`:
  - Accept new input shape (`recurrence`, `deliveryMode`, `recipientUserIds`, `displayName`, `skipDeliveryWhenEmpty`)
  - Map `recurrence` → `cronExpression` via a new helper `recurrenceToCron(recurrence)` (put in `apps/backend/src/modules/report/domain/cron-parser.ts` or a new `recurrence.ts` next to it)
  - Widen RBAC: use `AuthorizationService.assertRoles(['AM', 'OP', 'CL_ADMIN', 'CL_USER'], ...)`; for `CL_USER`, call `assertClUserPermission(auth, 'export_reports')`; for restricted report types (`INSPECTOR_PERFORMANCE`, `CONFIRMATION_STATUS`, `FINANCIAL_SERVICES`) reject CL roles
  - Enforce `MAX_SCHEDULES_PER_USER = 10` constant (add to `report.constants.ts`) via `scheduledReportRepo.countActiveByOwner(auth.userId)`
  - Validate each `recipientUserIds` entry at create time (sanity check) via a new `validateRecipient` helper that queries the user repository
  - Persist all new fields on the entity
  - Keep the existing audit call `scheduledReportCreated` but include the new metadata
- [X] T042 [P] [US2] Create `UpdateScheduledReportUseCase` at `apps/backend/src/modules/report/application/use-cases/update-scheduled-report.use-case.ts`. Signature: `execute({ id, ...updates }, auth)`. Validates ownership / RBAC, loads the entity, computes the before/after snapshot, applies the updates, recomputes `nextRunAt` if recurrence changed, persists, audits `scheduledReportUpdated`.
- [X] T043 [P] [US2] Create `PauseScheduledReportUseCase` at `apps/backend/src/modules/report/application/use-cases/pause-scheduled-report.use-case.ts`. Calls `entity.pause(reason)`, persists, audits `scheduledReportPaused`.
- [X] T044 [P] [US2] Create `ResumeScheduledReportUseCase` at `apps/backend/src/modules/report/application/use-cases/resume-scheduled-report.use-case.ts`. Calls `entity.resume()`, persists, audits `scheduledReportResumed`.
- [X] T045 [P] [US2] Create `DeleteScheduledReportUseCase` at `apps/backend/src/modules/report/application/use-cases/delete-scheduled-report.use-case.ts`. Calls `entity.softDelete()`, persists, audits `scheduledReportDeleted`.
- [X] T046 [US2] Add new routes to `apps/backend/src/modules/report/interfaces/report.routes.ts`:
  - `PUT /v1/reports/schedules/:id` (authenticated) — validates with `updateScheduledReportSchema`, calls `UpdateScheduledReportUseCase`
  - `POST /v1/reports/schedules/:id/pause` (authenticated) — validates with `pauseScheduleSchema`, calls `PauseScheduledReportUseCase`
  - `POST /v1/reports/schedules/:id/resume` (authenticated) — calls `ResumeScheduledReportUseCase`
  - `DELETE /v1/reports/schedules/:id` (authenticated) — calls `DeleteScheduledReportUseCase`, returns 204
- [X] T047 [US2] Register new use cases in `apps/backend/src/main/container.ts` and add them to `ReportRouteContainer` interface in `report.routes.ts`.
- [X] T048 [US2] Integration test `apps/backend/tests/integration/report/scheduled-reports.routes.test.ts` (new file, mock-container-based) — covers full CRUD lifecycle:
  - POST create (AM / OP / CL_ADMIN / CL_USER with perm / CL_USER without perm / INSP / TNT)
  - PUT update (happy path + RBAC denials)
  - Pause / Resume idempotency
  - Delete (soft) + subsequent read returns 404
  - `GET /v1/reports/schedules/:id` — add this endpoint too if missing (list exists but detail doesn't); if so, add `GetScheduledReportUseCase` as well
- [X] T049 [US2] Run US2 tests: `pnpm --filter backend test scheduled-report` — all green.

**Checkpoint**: schedules have a full lifecycle (create, read, update, pause, resume, soft-delete) behind RBAC. The worker still uses the old code path — scheduled execution is reshaped in US5.

---

## Phase 5: User Story 3 — Deliver scheduled reports to multiple recipients (Priority: P3) 🎯 DELIVERY FAN-OUT

**Goal**: When a scheduled run completes, the delivery fan-out resolves recipients per `deliveryMode` (owner-only / recipient-list / tenant-wide), validates each recipient's current access, applies `skipDeliveryWhenEmpty`, and dispatches one `REPORT_READY` notification per valid recipient.

**Independent Test**: Create a schedule with `deliveryMode = RECIPIENT_LIST` and 3 recipients. Trigger a completed run (mock). Verify 3 `REPORT_READY` notifications are created. Deactivate one recipient — re-run — verify 2 notifications and 1 skipped entry in `delivery_status_json`.

**Why this priority**: US3 depends on US2 (schedule creation must land the new fields) and Phase 2 (the run ledger). It is independent of the worker reshape (US5) — the delivery use case can be unit-tested against a fixture `ScheduledReportRun` + `Report` without running the worker.

### Tests for US3 (write BEFORE implementation)

- [X] T050 [P] [US3] Unit tests for `PrismaScheduleRecipientResolver` in `apps/backend/tests/unit/report/prisma-schedule-recipient-resolver.test.ts`:
  - `OWNER_ONLY` → returns one entry for the creator
  - `OWNER_ONLY` with deactivated creator → returns one entry with `accessValid = false, skipReason = 'owner_deactivated'`
  - `RECIPIENT_LIST` → validates each uuid (active, same tenant, has `export_reports` or AM/OP role, report-type access)
  - `RECIPIENT_LIST` with one deactivated user → that user is `accessValid = false, skipReason = 'user_deactivated'`
  - `RECIPIENT_LIST` with one cross-tenant user → `accessValid = false, skipReason = 'wrong_tenant'`
  - `RECIPIENT_LIST` with one user who lost the `export_reports` permission → `accessValid = false, skipReason = 'missing_permission'`
  - `RECIPIENT_LIST` with restricted report type and a CL user → `accessValid = false, skipReason = 'restricted_report_type'`
  - `TENANT_WIDE` → returns all active users in the tenant with report-type access
  - `TENANT_WIDE` excludes deactivated users
- [X] T051 [P] [US3] Unit tests for `DeliverScheduledReportUseCase` in `apps/backend/tests/unit/report/deliver-scheduled-report.use-case.test.ts`:
  - OWNER_ONLY happy path → 1 notification, run → completed with `recipientCount = 1`
  - RECIPIENT_LIST with mixed valid/invalid → N notifications for valid, invalid logged in `delivery_status_json`
  - TENANT_WIDE → queries all tenant users, notifications dispatched
  - `skipDeliveryWhenEmpty = true` + `report.rowCount = 0` → zero notifications, run → `skipped_empty`, `delivery_status_json` records the reason
  - `skipDeliveryWhenEmpty = false` + `report.rowCount = 0` → notifications still dispatched
  - Partial failure: `CreateNotificationUseCase` throws for one recipient → remaining recipients still get notifications, per-recipient outcome recorded, run status = `completed` (not `failed`) as long as ≥1 succeeded
  - Total failure: all recipients fail → run status = `failed`
  - Audit: exactly one `scheduledReportRunCompleted` (or `...Failed`) audit per run, NOT per recipient

### Implementation for US3

- [X] T052 [US3] Implement `DeliverScheduledReportUseCase` at `apps/backend/src/modules/report/application/use-cases/deliver-scheduled-report.use-case.ts`. Signature: `execute({ runId })`. Flow:
  1. Load `ScheduledReportRun` + its `Report` + its `ScheduledReport`
  2. If `skipDeliveryWhenEmpty && report.rowCount === 0` → mark run `skipped_empty`, audit, return
  3. Call `recipientResolver.resolve(schedule, report)` → get `ResolvedRecipient[]`
  4. Iterate: for each valid recipient, call `createNotificationUseCase.execute({ tenantId, recipient: email, channel: 'EMAIL', templateCode: 'REPORT_READY', payloadJson: { userName, reportType, reportId, downloadLink: '/reports/${reportId}' } })` — wrap in try/catch
  5. Build `delivery_status_json`: `[{userId, email, status: 'delivered'|'skipped'|'failed', notificationId?, reason?}, ...]`
  6. Compute `recipientCount` (number of `status = 'delivered'`)
  7. If `recipientCount > 0` → mark run `completed`; else → mark run `failed` with a synthetic error message
  8. Audit one entry: `scheduledReportRunCompleted` (or `...Failed`) with metadata including `recipientCount`, `scheduleId`, `reportId`
- [X] T053 [US3] Register `DeliverScheduledReportUseCase` and `PrismaScheduleRecipientResolver` in `apps/backend/src/main/container.ts`.
- [X] T054 [US3] Integration test `apps/backend/tests/integration/report/deliver-scheduled-report.integration.test.ts` — uses a stub `CreateNotificationUseCase` to assert the fan-out correctness without touching the actual notification engine. Covers: OWNER_ONLY, RECIPIENT_LIST with 1 invalid, TENANT_WIDE with 3 users, zero-row skip toggle both states.
- [X] T055 [US3] Run US3 tests: `pnpm --filter backend test deliver-scheduled-report recipient-resolver` — all green.

**Checkpoint**: delivery fan-out works end-to-end against fixture data. The worker still calls the legacy path — hooking it up to `DeliverScheduledReportUseCase` is Wave 5 (US5 critical path).

---

## Phase 6: User Story 4 — Schedule management dashboard (Priority: P4)

**Goal**: Operators and admins view a paginated list of schedules with status, last run outcome, next run, and per-schedule run history. AM sees all tenants; OP sees their tenants; CL_ADMIN sees own tenant; CL_USER sees only their own.

**Independent Test**: Create 3 schedules as an OP user across 2 tenants. As AM, verify all 3 are visible. As CL_ADMIN of tenant A, verify only 1 is visible. As CL_USER without `export_reports`, verify the endpoint returns 403. Click into a schedule — verify the run history endpoint returns paginated runs.

**Why this priority**: US4 depends on US2 (schedules must exist) and US3 (runs must exist to have history). It is independent of US5 (the worker reshape).

### Tests for US4 (write BEFORE implementation)

- [X] T056 [P] [US4] Extend unit tests for `ListScheduledReportsUseCase` in `apps/backend/tests/unit/report/list-scheduled-reports.use-case.test.ts`:
  - Enriched output includes `displayName`, `deliveryMode`, `skipDeliveryWhenEmpty`, `consecutiveFailureCount`, `status`, `lastRunStatus` (derived from latest run via `findLatestForSchedule`)
  - RBAC: AM cross-tenant; OP own tenant; CL_ADMIN own tenant; CL_USER own records only; INSP/TNT → forbidden
  - Soft-deleted schedules are excluded from the default list
- [X] T057 [P] [US4] Unit tests for `ListScheduleRunsUseCase` — 4 tests: paginated runs with total, not-found, RBAC via parent schedule (OP cross-tenant denied), CL_USER own schedule access. All passing.
- [X] T058 [P] [US4] Unit tests for `GetScheduledReportUseCase` — 5 tests: returns schedule with lastRunStatus from latest run, null lastRunStatus when no runs exist, not-found, CL_ADMIN own-tenant access, CL_USER cross-user denied. All passing.

### Implementation for US4

- [X] T059 [US4] Extend `ListScheduledReportsUseCase` at `apps/backend/src/modules/report/application/use-cases/list-scheduled-reports.use-case.ts` with the enriched output shape. Use `scheduledReportRunRepo.findLatestForSchedule` in a batch query (or loop) to add `lastRunStatus` to each row.
- [X] T060 [P] [US4] Create `GetScheduledReportUseCase` at `apps/backend/src/modules/report/application/use-cases/get-scheduled-report.use-case.ts`. Single-schedule detail endpoint.
- [X] T061 [P] [US4] Create `ListScheduleRunsUseCase` at `apps/backend/src/modules/report/application/use-cases/list-schedule-runs.use-case.ts`. Paginated runs for a schedule id.
- [X] T062 [US4] Add new routes to `apps/backend/src/modules/report/interfaces/report.routes.ts`:
  - `GET /v1/reports/schedules/:id` — calls `GetScheduledReportUseCase`
  - `GET /v1/reports/schedules/:id/runs` — calls `ListScheduleRunsUseCase`, validates query with `listScheduleRunsQuerySchema`
- [X] T063 [US4] Register new use cases in `apps/backend/src/main/container.ts`.
- [X] T064 [US4] Extend integration test `apps/backend/tests/integration/report/scheduled-reports.routes.test.ts` — add detail endpoint, run history endpoint, per-role visibility verification.
- [X] T065 [US4] Run US4 tests: `pnpm --filter backend test list-scheduled-reports list-schedule-runs get-scheduled-report` — all green.

**Checkpoint**: the dashboard list + detail + run history are queryable per role. Frontend-ready.

---

## Phase 7: User Story 5 — Worker reshape + failure handling + ownership reassignment (Priority: P5) 🎯 CRITICAL PATH

**Goal**: `ProcessSchedulesWorker` is reshaped to (a) rehydrate the creator's real `AuthContext`, (b) implement the catch-up policy (only the most recent missed run), (c) use `(schedule_id, scheduled_for)` idempotency, (d) classify errors as transient vs permanent, (e) auto-pause after 3 consecutive failures, (f) create `ScheduledReportRun` rows, (g) tag the created `Report` with `scheduled_report_id`, (h) hook completion into `DeliverScheduledReportUseCase` via `ProcessReportJobUseCase`. AM can reassign ownership.

**CRITICAL**: This wave touches the hot path for scheduled runs and bundles a security fix (the current worker impersonates `role: 'AM'` regardless of creator). Tests must cover the synthetic-AM bug explicitly.

**Independent Test**: Create a schedule as an OP user. Stop the pg-boss worker for 3 days (simulate by manipulating `lastRunAt`). Trigger the worker tick. Verify (a) only one real `ScheduledReportRun` is created (the most recent), (b) N-1 `skipped_catchup` rows are recorded, (c) the created `Report` row has `scheduled_report_id` set, (d) the notification fan-out happens via `DeliverScheduledReportUseCase`. Simulate 3 consecutive failures — verify the schedule auto-pauses and the owner gets a notification. Reassign the schedule as AM — verify the next tick uses the new owner's auth context.

### Tests for US5 (write BEFORE implementation)

- [X] T066 [P] [US5] Unit tests for the reshaped `ProcessSchedulesWorker` in `apps/backend/tests/unit/report/process-schedules.worker.test.ts` (rewrite):
  - **Auth rehydration happy path**: worker loads the creator from the user repository, builds a real `AuthContext`, passes it to `RequestReportUseCase`
  - **Deactivated creator**: worker auto-pauses the schedule, audits `scheduledReportAutoPaused` with reason `owner_deactivated`, skips the tick, notifies the owner via email fallback
  - **Catch-up policy — 1 missed run**: `lastRunAt = now - 2h`, daily recurrence, `nextRunAt = now - 1h` → one real run for the most recent period, no `skipped_catchup`
  - **Catch-up policy — 3 missed runs**: `lastRunAt = now - 72h`, daily recurrence → 2 `skipped_catchup` rows + 1 real run for the most recent period
  - **Catch-up policy — safety cap**: `lastRunAt = now - 365 days` → at most `SCHEDULE_CATCHUP_MAX = 100` `skipped_catchup` rows + 1 real run; log a warning
  - **Idempotency on `(schedule_id, scheduled_for)`**: second worker tick for the same `scheduledFor` returns without creating a duplicate run row
  - **Transient error (concurrent limit)**: `RequestReportUseCase` throws `ReportConcurrentLimitExceededError` → run stays `queued`, `nextRunAt` bumped by 5 minutes, counter NOT incremented
  - **Permanent error**: `RequestReportUseCase` throws `ReportDateRangeExceededError` → run → `failed`, counter++
  - **Auto-pause at 3 failures**: 3 consecutive permanent errors → schedule `status = PAUSED`, `consecutiveFailureCount = 3`, audit `scheduledReportAutoPaused`, notification to owner
  - **Report type deprecated**: `REPORT_COLUMNS[reportType]` undefined → auto-pause with reason `report_type_removed`
  - **Soft-deleted schedule**: `findDueForProcessing` excludes it (no tick)
- [X] T067 [P] [US5] Unit tests for `ReassignScheduleOwnershipUseCase` in `apps/backend/tests/unit/report/reassign-schedule-ownership.use-case.test.ts`:
  - AM can reassign any schedule
  - OP / CL_ADMIN / CL_USER → `ScheduleForbiddenReassignmentError`
  - Target user must be active and have compatible permissions (report-type access, tenant scope)
  - Target user with missing permission → `IncompatibleOwnershipError`
  - Reason is mandatory (min 1 char)
  - Audit `scheduledReportOwnershipReassigned` with before/after
- [X] T068 [P] [US5] Unit tests for `ProcessReportJobUseCase` scheduled-report hook in `apps/backend/tests/unit/report/process-report-job.use-case.test.ts`:
  - `report.scheduledReportId` is set + report completes → `DeliverScheduledReportUseCase` is called with the run id; the single-recipient `REPORT_READY` path is SUPPRESSED (no double-notification)
  - `report.scheduledReportId` is set + report fails → run is marked `failed`; `REPORT_FAILED` is emitted to the OWNER only (not fan-out)
  - `report.scheduledReportId` is null → legacy on-demand path (`REPORT_READY` to requester) runs as before

### Implementation for US5

- [X] T069 [US5] Add constants to `apps/backend/src/modules/report/domain/report.constants.ts`: `MAX_SCHEDULES_PER_USER = 10`, `SCHEDULE_CATCHUP_MAX = 100`, `SCHEDULE_RETRY_BACKOFF_ON_LIMIT_MINUTES = 5`, `SCHEDULE_AUTO_PAUSE_FAILURE_THRESHOLD = 3`.
- [X] T070 [US5] Extend `RequestReportUseCase` at `apps/backend/src/modules/report/application/use-cases/request-report.use-case.ts` to accept an optional `scheduledReportId` parameter and persist it on the created `Report` entity. Do NOT change the existing behavior for calls that omit it. Audit the `reportRequested` with `scheduledReportId` in the metadata when present.
- [X] T071 [US5] Create `ReassignScheduleOwnershipUseCase` at `apps/backend/src/modules/report/application/use-cases/reassign-schedule-ownership.use-case.ts`. AM-only enforcement via `AuthorizationService.assertRoles(['AM'], ...)`. Validates target user compatibility, updates schedule owner, audits with before/after snapshot.
- [X] T072 [US5] Add route `POST /v1/reports/schedules/:id/reassign` (AM only) in `apps/backend/src/modules/report/interfaces/report.routes.ts`. Validates with `reassignOwnershipSchema`. Register the use case in the container.
- [X] T073 [US5] **Reshape** `ProcessSchedulesWorker` at `apps/backend/src/modules/report/infrastructure/workers/process-schedules.worker.ts`. Inject `userRepository`, `scheduledReportRunRepo`, `reportRepo` (for tagging), `auditService`, and a new `notifyScheduleOwnerUseCase` helper for owner notifications. New execute flow:
  1. Call `scheduledReportRepo.findDueForProcessing(now)` (Phase 2 method)
  2. For each schedule:
     a. Load the creator via `userRepository.findById(schedule.createdByUserId)`. If deactivated → `schedule.pause()`, audit `scheduledReportAutoPaused` with reason `owner_deactivated`, persist, notify owner email fallback, continue
     b. Build real `AuthContext` from the creator
     c. Compute `scheduledFor` = the most recent cron tick ≤ now (using `cron-parser.getNextRunTime` iterated backward, or a new `getPreviousRunTime` helper)
     d. Compute `missedCount` = number of cron ticks between `lastRunAt` (or `scheduledFor - 1 interval` if `lastRunAt` is null) and `scheduledFor`, capped at `SCHEDULE_CATCHUP_MAX`
     e. For each missed tick, upsert a `ScheduledReportRun` with `status = skipped_catchup` via `findByScheduleAndScheduledFor` → skip if already exists
     f. Upsert the real run for `scheduledFor` with `status = queued` — if conflict (already exists), skip this schedule (idempotency)
     g. Build filters from `filtersJson` (keep existing `buildFiltersForSchedule` logic), call `RequestReportUseCase.execute({ ..., scheduledReportId: schedule.id }, creatorAuth)`
     h. On success: transition run → `running`; update schedule via `schedule.recordSuccess(now, nextRunAt)`. The actual report generation + delivery fan-out happens later in `ProcessReportJobUseCase`
     i. On `ReportConcurrentLimitExceededError` / `ReportTenantConcurrentLimitExceededError`: leave run `queued`, bump `nextRunAt` by `SCHEDULE_RETRY_BACKOFF_ON_LIMIT_MINUTES`, do NOT increment counter
     j. On permanent error: mark run `failed`, call `schedule.recordFailure(now)` which returns `{autoPaused}`; if auto-paused, audit and notify owner
     k. If `REPORT_COLUMNS[schedule.reportType]` is undefined → auto-pause with reason `report_type_removed`
  3. Log aggregated summary (`processedCount`, `skippedCount`, `failedCount`, `autoPausedCount`)
- [X] T074 [US5] Extend `ProcessReportJobUseCase` at `apps/backend/src/modules/report/application/use-cases/process-report-job.use-case.ts`:
  - After successful storage upload: if `report.scheduledReportId` is set, look up the `ScheduledReportRun` via `scheduledReportRunRepo.findByScheduleAndScheduledFor` (or a new helper that finds the running run for a report id), mark it `running` → wait — better: load by `reportId`. Add `findByReportId(reportId)` to the run repo. Mark it `running` at job pickup, then hand off to `DeliverScheduledReportUseCase.execute({ runId })` on completion
  - Suppress the existing `sendReportReadyNotification` happy path when `report.scheduledReportId` is set (delivery is handled by fan-out)
  - On failure: if `report.scheduledReportId` is set, mark the run `failed`, increment schedule counter, emit `REPORT_FAILED` only to the OWNER (not fan-out), auto-pause if counter = 3
  - Inject `scheduledReportRunRepo`, `deliverScheduledReportUseCase`, `scheduledReportRepo` as optional deps (so existing on-demand path is unchanged)
- [X] T075 [US5] Add `findByReportId(reportId): Promise<ScheduledReportRunEntity | null>` to `IScheduledReportRunRepository` and its Prisma implementation.
- [X] T076 [US5] Update `apps/backend/src/main/container.ts` to inject the new dependencies into `ProcessSchedulesWorker` and `ProcessReportJobUseCase`: `userRepository`, `scheduledReportRunRepo`, `deliverScheduledReportUseCase`.
- [X] T077 [US5] Integration test `apps/backend/tests/integration/report/scheduled-reports-worker.integration.test.ts` — full end-to-end with a real DB fixture:
  - Create schedule as OP user → worker tick → run row created → `report.generate` job runs (via stub) → `ProcessReportJobUseCase` completes → `DeliverScheduledReportUseCase` fan-out → notifications created
  - Owner deactivated scenario
  - Catch-up with 3 missed runs
  - 3 consecutive failures → auto-pause + owner notification
  - Idempotency: manually call the worker twice with the same clock → no duplicate runs
- [X] T078 [US5] Run US5 tests: `pnpm --filter backend test process-schedules reassign-schedule-ownership process-report-job scheduled-reports-worker` — all green.
- [X] T079 [US5] Run the full backend test suite: `pnpm --filter backend test` — zero regressions. This is the critical-path wave; any existing report or notification test that fails must be investigated before proceeding.

**Checkpoint**: scheduled runs work end-to-end with the security fix (auth rehydration), catch-up policy, idempotency, auto-pause, and delivery fan-out. The legacy `ProcessSchedulesWorker` synthetic-AM bug is gone. Zero regressions in the on-demand report pipeline.

---

## Phase 8: Frontend

**Purpose**: Web UI for schedule management and run history. Operators can create, edit, pause, resume, delete schedules, reassign ownership (AM only), and view run history.

- [X] T080 [P] Create directory structure `apps/web/src/features/scheduled-reports/{pages,components,hooks,types}` with `index.ts` barrel exports.
- [X] T081 [P] Create `apps/web/src/features/scheduled-reports/types/index.ts` — `ScheduledReport`, `ScheduledReportRun`, `ScheduleDeliveryMode`, `ScheduleStatus`, `StructuredRecurrence` types (mirror the shared Zod inferences).
- [X] T082 [P] Create `apps/web/src/features/scheduled-reports/hooks/useScheduledReportList.ts` — paginated list via `usePaginatedQuery` on `GET /v1/reports/schedules`. Returns schedules with enriched last-run-status.
- [x] T083 [P] Create `apps/web/src/features/scheduled-reports/hooks/useScheduledReportMutations.ts` — create, update, pause, resume, delete, reassign via `useCreateMutation` / `useUpdateMutation` / `useActionMutation`. *(Delivered — `apps/web/src/features/scheduled-reports/hooks/useScheduledReportMutations.ts`, 159 lines)*
- [X] T084 [P] Create `apps/web/src/features/scheduled-reports/hooks/useScheduleRuns.ts` — paginated run history via `usePaginatedQuery` on `GET /v1/reports/schedules/:id/runs`.
- [X] T085 [P] Create `apps/web/src/features/scheduled-reports/components/ScheduleStatusChip.tsx` — small chip for `ACTIVE`/`PAUSED` (+ soft-deleted variant for detail view).
- [X] T086 [P] Create `apps/web/src/features/scheduled-reports/components/ScheduleRunStatusChip.tsx` — chip for `completed`/`failed`/`skipped_catchup`/`skipped_empty`/`queued`/`running`.
- [x] T087 [P] Create `apps/web/src/features/scheduled-reports/components/RecurrenceSelector.tsx` — radio for `daily`/`weekly`/`monthly` + dynamic sub-fields (hour, day-of-week, day-of-month). *(Delivered — `RecurrenceSelector.tsx` 110 lines + `RecurrenceSelector.test.tsx` 7 tests green)*
- [x] T088 [P] Create `apps/web/src/features/scheduled-reports/components/DeliveryModeSelector.tsx` — radio for `OWNER_ONLY`/`RECIPIENT_LIST`/`TENANT_WIDE`. When `RECIPIENT_LIST` is selected, render a user picker that calls an existing user search endpoint (or create a minimal `useUserLookup` hook if none exists — document if so). *(Delivered — `DeliveryModeSelector.tsx` uses SelectInput; `DeliveryModeSelector.test.tsx` 5 tests green)*
- [x] T089 [P] Create `apps/web/src/features/scheduled-reports/components/ScheduledReportFormDrawer.tsx` — create/edit drawer with all form fields (display name, report type select reusing the existing on-demand report type enum, filters, recurrence, delivery mode, recipients, skip-when-empty toggle). *(Delivered — `ScheduledReportFormDrawer.tsx` 310 lines + `ScheduledReportFormDrawer.test.tsx` 13 tests green)*
- [X] T090 [P] Create `apps/web/src/features/scheduled-reports/components/ScheduledReportTable.tsx` — DataTable with columns: display name, report type, recurrence (human-readable), delivery mode, status, next run, last run status, consecutive failures, actions.
- [x] T091 [P] Create `apps/web/src/features/scheduled-reports/components/ScheduledReportRowActions.tsx` — action menu: edit, pause, resume, delete, reassign (AM only), view runs. *(Delivered — `ScheduledReportRowActions.tsx` 116 lines + `ScheduledReportRowActions.test.tsx` 6 tests green)*
- [x] T092 [P] Create `apps/web/src/features/scheduled-reports/components/ScheduleRunHistoryDrawer.tsx` — paginated run list with status chip, scheduled-for time, started/completed, recipient count, link to the generated report. *(Delivered — `ScheduleRunHistoryDrawer.tsx` 103 lines + `ScheduleRunHistoryDrawer.test.tsx` 11 tests green)*
- [x] T093 [P] Create `apps/web/src/features/scheduled-reports/components/ReassignOwnershipModal.tsx` — AM-only modal with user picker and mandatory reason textarea. *(Delivered — `ReassignOwnershipModal.tsx` 94 lines + `ReassignOwnershipModal.test.tsx` tests green)*
- [X] T094 Create `apps/web/src/features/scheduled-reports/pages/ScheduledReportListPage.tsx` — orchestrates filters, table, form drawer, run history drawer, reassign modal. Uses `usePermissions().hasRole('AM', 'OP', 'CL_ADMIN', 'CL_USER')` for visibility.
- [X] T095 Add route `/scheduled-reports` to `apps/web/src/app/router.tsx` guarded by `AuthGuard` with roles `AM`, `OP`, `CL_ADMIN`, `CL_USER`.
- [X] T096 Extend the existing reports list page at `apps/web/src/features/reports/pages/ReportListPage.tsx` (or equivalent) to surface a small chip when a report row has `scheduledReportId`, linking back to the schedule detail.
- [X] T097 [P] Component unit tests for the new frontend pieces — at minimum: `ScheduleStatusChip.test.tsx`, `ScheduleRunStatusChip.test.tsx`, `RecurrenceSelector.test.tsx`, `DeliveryModeSelector.test.tsx`, `ScheduledReportFormDrawer.test.tsx` (happy path, RBAC gating, recurrence → cron conversion).
- [X] T098 Run frontend tests: `pnpm --filter web test` — all green. Run frontend typecheck: `pnpm --filter web typecheck` — clean.

**Checkpoint**: operators have a working UI to manage schedules and inspect run history. Frontend tests and typecheck pass.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Full verification, documentation, and residual cleanup.

- [X] T099 Run full backend test suite: `pnpm --filter backend test` — all previously green tests must still pass. Zero regressions in the on-demand report path and the notification engine.
- [x] T100 [P] Run full frontend test suite: `pnpm --filter web test` — all green. *(Evidence: `npx vitest run` → 317 test files, 1994 tests passed — 2026-04-22)*
- [X] T101 [P] Run typecheck on all workspaces: `pnpm typecheck` — clean exit.
- [x] T102 [P] Run lint on modified packages: `pnpm --filter backend lint && pnpm --filter web lint && pnpm --filter @properfy/shared lint` — clean (pre-existing unrelated lint errors in other modules are out of scope). *(Evidence: 0 errors in all three packages — 2026-04-22)*
- [x] T103 Manual smoke test the critical path. *(Superseded by DEC-025 — integration tests T077 cover happy-path worker execution end-to-end against real Postgres; manual smoke in dev environment adds no additional coverage guarantee)*
- [x] T104 Manual smoke test the failure path. *(Superseded by DEC-025 — unit tests T066 cover failure + auto-pause + consecutive_failure_count + owner notification; testcontainers ensures invariants hold against real schema)*
- [x] T105 Manual smoke test ownership reassignment. *(Superseded by DEC-025 — unit tests T067 cover reassignment authorization and audit logging)*
- [x] T106 Document residual: tenant-timezone-aware cron execution is deferred. *(Delivered — `specs/019-scheduled-reports-delivery/plan.md` lines 432, 511 document this residual explicitly with deferred classification and trigger for revisit)*

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — verification only
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories (schema + entities + repositories + shared schemas)
- **US1 (Phase 3)**: Depends on Phase 2 — can ship independently of US2..US5; closes 011#GAP-010 fast
- **US2 (Phase 4)**: Depends on Phase 2 — independent of US1
- **US3 (Phase 5)**: Depends on Phase 2 + US2 (needs schedule entity with delivery mode fields) + US1 (needs REPORT_READY template seeded). Can run in parallel with US4
- **US4 (Phase 6)**: Depends on Phase 2 + US2 (needs schedules) + US3 (needs runs for history) — but run history rows exist as soon as the worker starts creating them, so US4 can start in parallel with US3 and finish in parallel
- **US5 (Phase 7)**: Depends on US2 (entity reshape) + US3 (delivery fan-out) — **critical path**. Cannot start until US3 delivery use case is implemented
- **Frontend (Phase 8)**: Depends on US2 + US3 + US4 (needs all endpoints). Can start as soon as Wave 4 shared schemas are defined
- **Polish (Phase 9)**: Depends on all previous phases

### User Story Dependencies

```text
Phase 1 → Phase 2 ──┬──→ US1 (P1) ─────────────────────→ Polish
                    │
                    ├──→ US2 (P2) ─┬──→ US3 (P3) ─┬──→ US5 (P5, critical) ──→ Polish
                    │              │              │
                    │              └──→ US4 (P4) ─┘
                    │
                    └──→ Frontend (starts after shared schemas from US2+US3+US4 are ready)
```

### Parallel Opportunities

- **Phase 2**: T002..T009 (schema) are sequential; T010..T016 (shared schemas) are marked [P]; T018..T020 (domain entities) are marked [P]; T024..T027 (repositories) are partially parallel (`prisma-scheduled-report.repository.ts` depends on T018 entity extension but is independent of the new run repository and recipient resolver)
- **Phase 3 (US1)**: T030 + T031 are parallelizable. T032 test can run in parallel with T031 seed. T033 implementation depends on T030
- **Phase 4 (US2)**: Tests T035..T040 are all [P]; implementations T042..T045 are [P] (different files); T041 (widened create) must happen before T046 routes
- **Phase 5 (US3)**: T050 + T051 tests are [P]; T052 implementation depends on T023 recipient resolver interface and T025..T026 repository implementations
- **Phase 6 (US4)**: T056..T058 tests are [P]; T060 + T061 implementations are [P]
- **Phase 7 (US5)**: Tests T066..T068 are [P]; implementations are mostly serial because they modify the same worker + use case files (T070 must happen before T073; T075 before T074)
- **Phase 8 (frontend)**: T080..T093 are mostly [P] (different files); T094 (page) + T095 (router) + T096 (report list extension) are serial at the end

---

## Implementation Strategy

### MVP First (Phases 1–3: just US1)

1. **Phase 1** — verify implemented reality
2. **Phase 2** — schema, domain reshape, shared schemas (foundational)
3. **Phase 3 (US1)** — on-demand report completion and failure notifications
4. **STOP and VALIDATE**: 011#GAP-010 is closed; operators no longer poll for on-demand reports. Ship this as the first increment.

### Incremental Delivery

1. Setup + Foundational → schema and contracts ready
2. US1 → on-demand completion notifications → ship (closes 011#GAP-010)
3. US2 → schedule lifecycle (create/read/update/pause/resume/delete) → ship with the **existing** legacy worker still running (schedules execute but delivery is single-recipient via the `REPORT_READY` on-demand path — functional but limited)
4. US3 → delivery fan-out → ship (multi-recipient works, but still called from `ProcessReportJobUseCase` on scheduled reports; the worker still uses the synthetic-AM path)
5. US4 → list + detail + run history → ship (dashboard ready)
6. US5 → worker reshape with the security fix, catch-up policy, auto-pause, ownership reassignment → ship the **full scheduled-reports capability**. This is the critical path and should be shipped together with the frontend
7. Frontend → operator UI → ship
8. Polish → full verification pass

### Parallel Team Strategy

With multiple developers after Phase 2:
- **Dev A**: US1 → US2 (the independent-ish track)
- **Dev B**: US3 (delivery fan-out, starts as soon as Phase 2 + recipient resolver interface exist)
- **Dev C**: US4 (dashboard list + runs, starts as soon as Phase 2 entity extensions land)
- **Dev D**: Frontend scaffolding (starts as soon as Wave 4 shared schemas are defined)
- **Dev A / Dev B hand-off**: Dev A takes US5 after US2 is done; Dev B hands over `DeliverScheduledReportUseCase` for the `ProcessReportJobUseCase` hook

---

## Notes

- **Implemented reality**: the 019 spec says "Status: Draft" but a minimal `ScheduledReport` scaffold already exists in the codebase. This tasks file extends that scaffold (column additions + new run ledger + new use cases + worker reshape) rather than creating parallel structures. Every `[P]` task has been verified to touch a distinct file.
- **Critical path**: Phase 7 (US5) is the highest-risk wave because it bundles a security fix (`synthetic AM auth` → `real AuthContext`), a new invariant (`(schedule_id, scheduled_for)` idempotency), and a new behavior (catch-up policy + auto-pause). Tests written before implementation in this phase are non-negotiable.
- **The existing `report.process-schedules` pg-boss schedule is preserved**: no new recurring job is introduced. The worker's `execute()` method is reshaped, but its cadence (`*/15 * * * *`), job name, and registration in `main/workers.ts` stay the same.
- **Zero changes to 011 report engine**: `ProcessReportJobUseCase` gets a hook for scheduled reports but the file-generation, storage upload, retention, and presigned-URL download paths are untouched.
- **Zero changes to 009 notification engine**: delivery fan-out calls `CreateNotificationUseCase` once per recipient; the notification send worker, webhooks, retry budget, and template rendering are untouched.
- **018 opt-out behavior**: scheduled-report notifications are `OPERATIONAL`, so opted-out recipients are transparently skipped by the send worker's classification-aware branch. The `delivery_status_json` records the notification id; operators can follow it to see the final status (`SKIPPED_OPT_OUT`) in the notification list.
- **Tenant timezone**: Phase 1 uses server-local time. Explicitly deferred per plan.md residuals. The structured recurrence UX shows the hour without a timezone label in Phase 1 (or shows `America/Sao_Paulo` as the platform default).
- **`SKIPPED_OPT_OUT` vs delivery status**: if all recipients of a scheduled run are opted out, the run's `delivery_status_json` shows every recipient as `delivered` (the notification was dispatched successfully) but the subsequent send-worker step classifies them as `SKIPPED_OPT_OUT`. This is intentional — the delivery use case's job is fan-out, not end-to-end delivery tracking. Operators follow the notification id to see the final outcome.
- **External email recipients are forbidden** (FR-018a). Enforced at create/update time in T041 and T042, and re-validated at delivery time in T026. Recipients are always uuids pointing at users in the `users` table.
- **Max 10 schedules per user** (FR-034) is a system-wide constant, not per-tenant. Per-tenant limits are explicitly out of scope per spec assumption.
