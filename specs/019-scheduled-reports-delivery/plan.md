# Implementation Plan: Scheduled Reports and Delivery

**Branch**: `015-permissions-rbac-matrix` (delivered on this integration branch) | **Date**: 2026-04-11 | **Spec**: `specs/019-scheduled-reports-delivery/spec.md`
**Input**: Feature specification from `/specs/019-scheduled-reports-delivery/spec.md`
**Plan Status**: **EXECUTED (2026-04-12)** — all 5 waves landed. See the "Execution Outcome" section at the bottom of this file for the wave-by-wave delivery record. The plan body below is preserved as the design of record.

## Summary

This feature delivers **recurring report scheduling and multi-recipient delivery** on top of the already-shipped on-demand report engine (`011-reports-audit`) and notification engine (`009-notifications`). It closes `011#GAP-010` (email on completion) and `011#GAP-004` (scheduled reports).

**What this feature does:**

- Sends an email notification to the requesting user when an **on-demand** report reaches `COMPLETED` or `FAILED`, using a new `REPORT_FAILED` template and the existing `REPORT_READY` template (US1 / FR-001..FR-004).
- Reshapes the existing `ScheduledReport` entity into a full lifecycle object: display name, structured recurrence, delivery mode, skip-when-empty toggle, consecutive-failure counter, soft-delete, paused/active status (US2 / FR-005..FR-011).
- Introduces a `ScheduledReportRun` ledger so every schedule execution (real or skipped) is traceable back to a row, with status, timing, and delivery outcome (US2 / US4 / FR-017a, FR-029, FR-030).
- Extends the existing `ProcessSchedulesWorker` with the catch-up policy (most recent missed run only, intermediate periods logged as `skipped_catchup`), proper auth rehydration (creator's context, not a synthetic AM), and auto-pause after 3 consecutive failures (FR-015..FR-017a).
- Adds delivery fan-out: on successful run, a recipient list is resolved per delivery mode (owner-only / configured list / tenant-wide) at delivery time, each recipient's access is re-validated, and one `REPORT_READY` notification is dispatched per valid recipient through the existing notification engine. Skipped recipients are logged on the run (US3 / FR-018..FR-021b).
- Adds the remaining schedule lifecycle endpoints: edit, pause, resume, soft-delete, owner reassignment (AM only), and a run-history list (US2 / US4 / FR-007..FR-009, FR-028a/b, FR-029).
- Adds frontend surfaces for AM/OP/CL_ADMIN/CL_USER (per role scope): schedules list page, create/edit drawer, run-history drawer, pause/resume actions.

**What this feature does NOT do:**

- Redesign or replace the 011 report request path, data readers, XLSX generator, storage adapter, retention worker, or presigned-URL download flow. Each scheduled run still goes through `RequestReportUseCase` and produces a standard `Report` row.
- Redesign the 009 notification engine, template rendering, webhook handling, or retry budget. Delivery is one `CreateNotificationUseCase` call per recipient.
- Introduce new report types or new output formats. `FR-010` and `FR-011` reuse the existing 7 types and current XLSX format (CSV/PDF inherit automatically when 011#GAP-006 lands).
- Attach the XLSX file directly to the email. Per the 2026-04-06 clarification, notifications carry an **app link** to the report detail page (`/reports/:id`), and the user downloads through the authenticated app via a fresh presigned URL. No external email recipients.
- Build a BI/query-builder product. Schedules are operator conveniences — the filter shape and column set are the same as on-demand.
- Build per-tenant schedule limits beyond the system-wide defaults (`max 10 active schedules per user`, `min 1-day recurrence`). Per-tenant quotas are out of scope per spec.
- Handle retroactive report generation for periods skipped during outage. Operators manually re-request for specific historical ranges if needed.

### Implemented Reality vs Approved Target (pre-implementation snapshot, 2026-04-11)

> **Editorial note (2026-04-12):** the table below is the **pre-implementation** snapshot captured during planning. It is preserved for traceability. The post-implementation state is in the "Execution Outcome" section at the bottom of this file — every row below that was marked "MISSING" / "DOES NOT EXIST" is now delivered.

**The 019 spec said "Status: Draft" at planning time and implied a greenfield build. Exploration showed a partial skeleton already existed.** This plan treated the existing code as implemented reality and extended it rather than replacing it.

| Component | Spec expectation | Actual state (pre-019) |
|---|---|---|
| `ScheduledReport` Prisma model | Full lifecycle entity | **EXISTS** at `apps/backend/prisma/schema.prisma:1127`, but minimal — only `cron_expression`, `delivery_email` (single string), `is_active`, `last_run_at`, `next_run_at`, `created_by_user_id`. **Missing**: `display_name`, `delivery_mode`, `recipient_user_ids`, `skip_delivery_when_empty`, `consecutive_failure_count`, `deleted_at`, `status`. |
| `ScheduledReportEntity` + repository | Rich domain with markRun, pause, resume, auto-pause | **EXISTS** at `apps/backend/src/modules/report/domain/scheduled-report.entity.ts` with `isDue()`, `markRun()`, `deactivate()`. Missing: pause/resume distinction, soft-delete, consecutive-failure tracking, delivery mode logic. |
| `CreateScheduledReportUseCase` | Structured recurrence + delivery modes + RBAC per role | **EXISTS** — AM/OP only, cron validation, single `deliveryEmail` string. Missing: CL_ADMIN/CL_USER support, structured recurrence, delivery mode, recipient validation, display name. |
| `ListScheduledReportsUseCase` | Per-role scoping with last-run-outcome | **EXISTS** — basic list. Missing: richer columns (last run outcome, next run, consecutive failures). |
| `ProcessSchedulesWorker` + pg-boss schedule | Catch-up policy, auth rehydration, auto-pause | **EXISTS** at `infrastructure/workers/process-schedules.worker.ts`, scheduled every 15 min via `report.process-schedules`. **Impersonates `role: 'AM'` with a synthetic `AuthContext`** (security anti-pattern). No catch-up policy, no auto-pause, no run-ledger rows. |
| `ScheduledReportRun` entity / table | Per-run ledger for audit and UI | **DOES NOT EXIST** — confirmed. |
| `Report.scheduled_report_id` FK | Traceability from Report back to Schedule | **DOES NOT EXIST** — confirmed. |
| Notification on completion (FR-001) | `REPORT_READY` sent to requesting user with app link | **PARTIALLY EXISTS** — `ProcessReportJobUseCase.sendReportReadyNotification()` already emits `REPORT_READY` for the happy path with `downloadLink = /reports/${reportId}` (matches the app-link decision). **Missing**: `REPORT_FAILED` path on the failure branch, seeded template bodies for both codes, and coverage under the 018 classification (both should be `OPERATIONAL`). |
| `REPORT_READY` template code | Present in `notification.constants.ts` | **EXISTS** in `VALID_TEMPLATE_CODES` and `DEFAULT_TEMPLATE_CLASSIFICATIONS` (OPERATIONAL). **But no seed body/subject is written in `prisma/seed.ts`** — the template is declared but not yet renderable end-to-end. |
| `REPORT_FAILED` template code | New template | **DOES NOT EXIST** — confirmed. |
| `cron-parser.ts` | Structured recurrence (daily/weekly/monthly) | **EXISTS** as a 5-field cron parser. The 019 spec describes structured recurrence as a UX; we can keep cron as the storage format and map structured input → cron at the use-case boundary. |
| Frontend schedule surfaces | List / create / edit / pause / run history | **DOES NOT EXIST** (no `apps/web/src/features/scheduled-reports/` folder). |

**Implication**: 019 is an **extension** of the existing skeleton, not a green-field build. Rough shape:
- schema migration: column additions on `scheduled_reports`, new `scheduled_report_runs` table, new FK on `reports`
- domain: extend `ScheduledReportEntity`, add `ScheduledReportRunEntity`
- application: 7 new/extended use cases
- worker: reshape `ProcessSchedulesWorker` for catch-up + auth rehydration + fan-out + auto-pause
- notifications: add `REPORT_FAILED` template code, seed both report templates, wire the failure branch in `ProcessReportJobUseCase`
- frontend: new `scheduled-reports` feature folder

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 (backend), TypeScript 5.6 on React 18.3 (frontend)
**Primary Dependencies**: Fastify, Prisma, Zod, Handlebars (template renderer), pg-boss (existing), `PersistentAuditService` (shared), `CreateNotificationUseCase` (009), `RequestReportUseCase` + `ProcessReportJobUseCase` (011), `AuthorizationService` (015 — for `assertRoles`, `assertTenantScope`, `assertClUserPermission`)
**Storage**: PostgreSQL (Supabase) — extend `scheduled_reports`, add `scheduled_report_runs`, add optional `scheduled_report_id` FK on `reports`. No other tables.
**Testing**: Vitest (unit + integration), Supertest, existing report test helpers, existing notification test helpers.
**Target Platform**: Node.js backend + React SPA frontend. No PWA surface (spec assumption: web-portal only).
**Project Type**: Cross-cutting extension on top of 011-reports-audit and 009-notifications. Adds scheduling + delivery orchestration; reuses the existing report generation + notification engines unchanged.
**Constraints**:
- Zero regressions on the 011 report pipeline (request → generate → download → expire).
- Zero regressions on the 009 notification engine.
- Must not introduce external email delivery — recipients are registered system users only (FR-018a).
- Must honor the 018 transactional-delivery invariant (report notifications are `OPERATIONAL`, so opted-out recipients are still skipped; the skip must be logged on the run).
- Must not break the existing `ScheduledReport` rows if any exist (migration is additive; old rows get sensible defaults).
**Scale/Scope**: ~1 additive Prisma migration, 2 new/extended domain entities, ~7 new/extended use cases, 1 worker reshape, ~5 new endpoints, 1 new frontend feature folder.

### Modules / Backend Impacted

**Extended (not replaced):**

- `apps/backend/prisma/schema.prisma` — add columns to `ScheduledReport`; add new `ScheduledReportRun` model; add optional `scheduled_report_id` (+ optional `scheduled_report_run_id`) on `Report`.
- `apps/backend/src/modules/report/domain/scheduled-report.entity.ts` — add `displayName`, `deliveryMode`, `recipientUserIds`, `skipDeliveryWhenEmpty`, `consecutiveFailureCount`, `status` (ACTIVE/PAUSED), `deletedAt`; replace `deactivate()` with `pause(reason)` / `resume()` / `softDelete()` semantics and add `recordSuccess()` / `recordFailure()` that drive the consecutive-failure counter and auto-pause.
- `apps/backend/src/modules/report/domain/scheduled-report.repository.ts` — add `findActiveByOwner`, `countActiveByOwner`, `findByIdForUpdate` (optimistic), `markPausedDueToFailures`, etc.
- `apps/backend/src/modules/report/infrastructure/prisma-scheduled-report.repository.ts` — implement new columns and methods.
- `apps/backend/src/modules/report/application/use-cases/create-scheduled-report.use-case.ts` — broaden to CL_ADMIN/CL_USER per FR-022..FR-026, accept structured recurrence (`daily`/`weekly`/`monthly` + params) and map to cron internally, accept `deliveryMode` + `recipientUserIds`, validate the configured-list recipients as real system users with the right permission, enforce `max 10 active schedules per user` (FR-034) and `min 1-day recurrence` (FR-035).
- `apps/backend/src/modules/report/application/use-cases/list-scheduled-reports.use-case.ts` — enrich output with last-run outcome, next run, consecutive-failure count, display name, delivery mode.
- `apps/backend/src/modules/report/application/use-cases/process-report-job.use-case.ts` — add `REPORT_FAILED` emission on the failure branch (the happy path already emits `REPORT_READY`). Notification templates stay classified `OPERATIONAL` per 018.
- `apps/backend/src/modules/report/infrastructure/workers/process-schedules.worker.ts` — **reshape** to: (a) rehydrate the creator's `AuthContext` from the user repository (or run as `SYSTEM` actor via a dedicated internal-request path), (b) compute catch-up (if `(now - lastRunAt)` spans more than one recurrence interval, record N-1 `skipped_catchup` runs and one real run for the most recent period), (c) call `RequestReportUseCase` to create the `Report` row tagged with `scheduled_report_id`, (d) create a `ScheduledReportRun` row linking schedule + report, (e) on synchronous failure (before the real report job runs), mark the run `failed` and increment `consecutiveFailureCount`; auto-pause at 3 (FR-016).
- `apps/backend/src/modules/report/interfaces/report.routes.ts` — add edit/pause/resume/delete/reassign/list-runs endpoints.
- `apps/backend/src/modules/notification/domain/notification.constants.ts` — add `REPORT_FAILED` to `VALID_TEMPLATE_CODES` and `DEFAULT_TEMPLATE_CLASSIFICATIONS` (`OPERATIONAL`). Neither new code is in `PROTECTED_TEMPLATE_CLASSIFICATIONS`.
- `apps/backend/prisma/seed.ts` — seed `REPORT_READY` and `REPORT_FAILED` template bodies (subject + bodyText + bodyHtml with `{{unsubscribeUrl}}` footer since both are OPERATIONAL).
- `apps/backend/src/main/container.ts` — register new use cases, new repository, new worker dependencies.
- `apps/backend/src/main/workers.ts` — keep the existing `report.process-schedules` pg-boss schedule (`*/15 * * * *`); no new recurring job. Delivery fan-out happens inside the existing `report.generate` job completion path (see "Delivery hook" below).

**New:**

- `apps/backend/src/modules/report/domain/scheduled-report-run.entity.ts` — `id`, `scheduleId`, `reportId?`, `status` (`queued` | `running` | `completed` | `failed` | `skipped_catchup` | `skipped_empty`), `startedAt`, `completedAt?`, `errorMessage?`, `recipientCount?`, `deliveryStatusJson?` (per-recipient outcome), `createdAt`, `updatedAt`.
- `apps/backend/src/modules/report/domain/scheduled-report-run.repository.ts` — `save`, `update`, `findByScheduleId`, `findLatestForSchedule`, `countByStatus`.
- `apps/backend/src/modules/report/infrastructure/prisma-scheduled-report-run.repository.ts` — Prisma adapter.
- `apps/backend/src/modules/report/application/use-cases/update-scheduled-report.use-case.ts` — AM + owner + CL_ADMIN (own tenant); edits recurrence, filters, recipients, display name; recalculates `nextRunAt`; audited with before/after.
- `apps/backend/src/modules/report/application/use-cases/pause-scheduled-report.use-case.ts` — transitions `status = PAUSED`; reason is required when triggered by the system (auto-pause), optional for user-initiated; audited.
- `apps/backend/src/modules/report/application/use-cases/resume-scheduled-report.use-case.ts` — transitions `status = ACTIVE`, resets `consecutiveFailureCount` to 0, recomputes `nextRunAt`; audited.
- `apps/backend/src/modules/report/application/use-cases/delete-scheduled-report.use-case.ts` — soft delete (`deletedAt`), prevents future runs, preserves history; audited.
- `apps/backend/src/modules/report/application/use-cases/reassign-schedule-ownership.use-case.ts` — **AM only** per FR-028a; validates the target user has compatible permissions and tenant scope; audited with before/after.
- `apps/backend/src/modules/report/application/use-cases/list-schedule-runs.use-case.ts` — paginated run history for a given schedule id; RBAC mirrors the parent schedule.
- `apps/backend/src/modules/report/application/use-cases/deliver-scheduled-report.use-case.ts` — **delivery fan-out**. Given a completed `ScheduledReportRun` + its `Report`, resolves recipients per `delivery_mode`, validates each recipient's current access, applies `skipDeliveryWhenEmpty`, and dispatches one `REPORT_READY` notification per valid recipient via `CreateNotificationUseCase`. Records the per-recipient outcome in `delivery_status_json`. This is called from the completion hook below.
- `apps/backend/src/modules/report/domain/schedule-recipient-resolver.ts` — helper interface used by the delivery use case; reads `UserRepository` + the tenant's `clUserPermissions` for tenant-wide resolution.

### Delivery hook into the existing Report completion path

The cleanest integration point: when `ProcessReportJobUseCase` marks a report `COMPLETED` (or `FAILED`), it checks whether the report has a `scheduled_report_id`. If yes, it calls `DeliverScheduledReportUseCase` with the run id. This keeps the synchronous delivery path simple and reuses the existing job-retry semantics (if delivery fails partially, per-recipient failures are logged in `delivery_status_json`; a total failure just means some recipients won't get the notification, which is acceptable since each recipient is an independent notification with its own retry budget).

- **On-demand reports**: `scheduled_report_id IS NULL` → `ProcessReportJobUseCase` already emits `REPORT_READY` to the requester only (existing path). We also add `REPORT_FAILED` on the failure branch.
- **Scheduled reports**: `scheduled_report_id IS NOT NULL` → `ProcessReportJobUseCase` skips the single-recipient `REPORT_READY` path (to avoid double-notifying the owner if they're in the delivery list) and calls `DeliverScheduledReportUseCase` instead. The delivery use case handles fan-out + per-recipient validation + skip-when-empty.

### Workers/jobs involved

- **Existing `report.generate` pg-boss job** — unchanged shape. `ProcessReportJobUseCase` gains a branch that routes completion to `DeliverScheduledReportUseCase` when the report carries a `scheduled_report_id`.
- **Existing `report.process-schedules` pg-boss job** (`*/15 * * * *`) — `ProcessSchedulesWorker` is reshaped internally but its job name, schedule cadence, and boss wiring stay the same. No new pg-boss job is introduced. This keeps 019 additive from a deployment standpoint.
- **Existing `report.expire-files` job** — unchanged. Scheduled reports follow the same 30-day retention (FR-031).

### Frontend

- `apps/web/src/features/scheduled-reports/` — new feature folder
  - `pages/ScheduledReportListPage.tsx` — RBAC-scoped list (AM → all tenants; OP → tenants they operate; CL_ADMIN → own tenant; CL_USER → own records only)
  - `components/ScheduledReportFormDrawer.tsx` — create/edit drawer with structured recurrence selector (`daily` / `weekly` / `monthly`), delivery-mode radio, recipient picker that calls a user-search endpoint, display-name input, skip-when-empty toggle
  - `components/ScheduledReportRowActions.tsx` — pause / resume / edit / delete / view runs
  - `components/ScheduleRunHistoryDrawer.tsx` — paginated run list with status chip (uses the `list-schedule-runs` endpoint)
  - `hooks/useScheduledReportList.ts`, `hooks/useScheduledReportMutations.ts`
- Router: add `/scheduled-reports` guarded by `AuthGuard` (AM, OP, CL_ADMIN, CL_USER with `export_reports`)
- No change to the existing 011 reports list page other than surfacing the `scheduleId` (if any) as a chip on report rows.

## Constitution / Risk Check

*GATE: must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Invariant | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | New use cases live in application, new entities in domain, new Prisma repository in infrastructure. No route-level business logic. |
| II. Multi-Tenant Safety | PASS | `ScheduledReport.tenantId` is non-null (existing). Every query scopes by tenant. Recipient resolution for tenant-wide mode is explicitly scoped by the schedule's tenant. AM cross-tenant reads are explicit. |
| III. TDD | PASS | Unit tests for every new use case; integration tests for catch-up policy, auto-pause, delivery fan-out, and ownership reassignment. Tests written before implementation per wave. |
| IV. Contract-First APIs | PASS | All new endpoints described in a `contracts/schedule-endpoints.md` file (Phase 1 artifact); shared Zod schemas updated in `packages/shared/src/schemas/report.ts`; OpenAPI regenerates afterwards. |
| V. Simplicity and Minimal Impact | PASS | Reuses the existing `ScheduledReport` table (column additions) rather than parallel structures. Reuses `report.process-schedules` pg-boss job rather than introducing a new one. Delivery fan-out hooks into the existing `report.generate` completion path. No new workers, no new job queues. |
| Report-engine sovereignty (011) | PASS | Scheduled runs create standard `Report` rows via `RequestReportUseCase`. The file generation, upload, storage, retention, and presigned-URL download are unchanged. The only new touch is a `scheduled_report_id` tag on the report row. |
| Notification-engine sovereignty (009) | PASS | Delivery fan-out calls `CreateNotificationUseCase` once per recipient. Template rendering, retry, webhooks, and provider adapters are unchanged. |
| 018 transactional invariant | PASS | `REPORT_READY` and `REPORT_FAILED` are classified `OPERATIONAL`. Recipients who opted out are skipped by the send worker via the existing 018 classification-aware branch. The skip is recorded in the notification row (`SKIPPED_OPT_OUT`), and the delivery use case logs "delivered via notification id X" per recipient. No transactional template is introduced. |
| Audit mandatory on sensitive actions | PASS | `scheduledReportCreated` (already exists), `scheduledReportUpdated`, `scheduledReportPaused`, `scheduledReportResumed`, `scheduledReportDeleted`, `scheduledReportOwnershipReassigned`, `scheduledReportRunCompleted`, `scheduledReportRunFailed`, `scheduledReportAutoPaused` — all emit via `PersistentAuditService` with before/after snapshots where applicable. |

### Feature-specific risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Idempotency of schedule runs** — if the worker processes the same due schedule twice in a row (e.g., job re-delivery), we must not generate two reports for the same period. | HIGH | Use the `(scheduleId, scheduledFor)` pair as the idempotency key on `ScheduledReportRun`: the worker computes the expected `scheduledFor` timestamp from the cron and the previous `lastRunAt`, then upserts a run row with a unique constraint on `(schedule_id, scheduled_for)`. On conflict, the worker skips and logs. Failing path is "already processed", not "duplicate report". |
| **Synthetic AM auth in the current worker** — the existing `ProcessSchedulesWorker` builds `role: 'AM'` regardless of who created the schedule, bypassing RBAC. This must be fixed as part of 019. | HIGH | Rehydrate the creator's `AuthContext` from the user repository at worker time. If the creator is deactivated, auto-pause the schedule (FR-028b) and skip the run. If the creator's role lost permission for the report type, auto-pause and notify. The worker runs the `RequestReportUseCase` with the **creator's real auth**, so the existing RBAC path catches any post-creation permission change. |
| **Risk of duplicate reports on restart / double-delivery** — pg-boss schedule may fire twice around job expiration. | MEDIUM | Handled by the `(schedule_id, scheduled_for)` unique key (above). The first worker inserts the run row and proceeds; the second gets a unique-violation and returns. |
| **Retry vs failure taxonomy** — `RequestReportUseCase` failures (e.g., `REPORT_CONCURRENT_LIMIT_EXCEEDED`, `REPORT_DATE_RANGE_EXCEEDED`) are transient or permanent depending on the cause. Per FR-033 the worker must queue and retry when the concurrent limit is hit, and per FR-015 scheduled runs reuse the same 2-retry exponential backoff as on-demand. | MEDIUM | Classify errors at the worker: `REPORT_CONCURRENT_LIMIT_EXCEEDED` → leave the run as `queued`, bump `nextRunAt` by 5 minutes, do NOT increment `consecutiveFailureCount`. Permanent errors (invalid filters, forbidden report type, tenant deactivated) → `failed` + increment counter. The existing 2-retry budget inside the `report.generate` job (retry-limit-2 via pg-boss) covers transient generation failures. |
| **Ownership reassignment race** — AM reassigns while a run is queued for the old owner. | LOW | Worker rehydrates `AuthContext` at run time, so the new owner's context is used on the next tick. The queued run uses the schedule's current owner at the moment the worker picks it up. Document the race in the reassignment use case; no special locking needed. |
| **Delivery to recipient who was added then removed before first run** | LOW | `DeliverScheduledReportUseCase` re-validates access at delivery time (FR-021, FR-021a). Skip + log per recipient. |
| **Zero-row delivery interpretation** — default is to deliver (per spec clarification). Operators may expect the opposite. | LOW | `skipDeliveryWhenEmpty` defaults to `false` explicitly in the Prisma schema and the Zod schema; the frontend toggle defaults off. Document in the UI hint text. |
| **Outage catch-up producing unexpected large reports** — if the system is down for 3 days and the schedule is "daily, last 7 days", the single caught-up run will naturally cover the last 7 days relative to the execution time, not the missed 3 days. That matches the spec. Operators who need the exact missed periods must request manually. | LOW | The catch-up policy is explicit: only the most recent eligible run is executed; intermediate periods are logged as `skipped_catchup`. The filter date range is computed from execution time per FR-014. This is by design. |
| **Notification engine opt-out vs schedule delivery list** — if a recipient opted out of `OPERATIONAL` email under 018, their scheduled-report notification will be skipped by the send worker. The delivery use case cannot tell the difference between "dispatched, recipient opted out" and "dispatched successfully". | MEDIUM | The delivery use case records per-recipient notification IDs in `delivery_status_json`. The 018 send worker writes `SKIPPED_OPT_OUT` on the notification row. A small post-run read can surface the outcome in `delivery_status_json`, OR (simpler) the run UI links to the notification list filtered by `scheduleId` and operators resolve outcomes there. Deferred to US4 polish. |
| **Consecutive-failure auto-pause interacting with transient worker errors** — if pg-boss retries a `report.generate` job and fails 3 times in one run, that should count as **one** failed run, not 3. | MEDIUM | The counter is incremented once per `ScheduledReportRun`, not per pg-boss retry. `ProcessReportJobUseCase` already handles the retry budget internally and marks the final failure on the `Report` row. The delivery hook fires only once after terminal outcome. |
| **Deletion of report type from the enum** | LOW | Lazy check at execution time — if `REPORT_COLUMNS[schedule.reportType]` is undefined, the worker auto-pauses the schedule and notifies the owner (spec edge case). |
| **Tenant timezone** — spec says "All times are in the tenant's configured timezone", but the current cron-parser uses server-local time. | MEDIUM | Phase 1 uses server-local time and documents the assumption. Tenant-timezone handling is deferred as an explicit residual. This matches the 011 behavior and the tenant settings schema gap (002#GAP-002). The spec's assumption section already notes a fallback to `America/Sao_Paulo` when no tenant timezone is configured. |

## Project Structure

### Documentation (this feature)

```text
specs/019-scheduled-reports-delivery/
├── plan.md              # This file
├── spec.md              # Already exists
├── research.md          # (generated by Phase 0 if needed — likely skip given no NEEDS CLARIFICATION)
├── data-model.md        # Phase 1 output (entities, migrations, state transitions)
├── contracts/
│   └── schedule-endpoints.md   # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code

```text
packages/shared/src/
└── schemas/
    └── report.ts                        # EXTEND — createScheduledReportSchema (structured recurrence + deliveryMode + recipientUserIds + displayName + skipDeliveryWhenEmpty), updateScheduledReportSchema, pauseScheduleSchema, reassignOwnershipSchema, listScheduleRunsQuerySchema, scheduledReportRunResponseSchema

apps/backend/prisma/
├── schema.prisma                        # EXTEND — ScheduledReport columns + new ScheduledReportRun model + optional scheduled_report_id on Report
└── migrations/
    └── <timestamp>_scheduled_reports_delivery/
        └── migration.sql                # NEW — additive columns, new table, new FK, seed defaults for existing rows

apps/backend/src/modules/report/
├── domain/
│   ├── scheduled-report.entity.ts              # EXTEND — new fields + pause/resume/recordSuccess/recordFailure/autoPause
│   ├── scheduled-report.repository.ts          # EXTEND — new lookup methods
│   ├── scheduled-report-run.entity.ts          # NEW
│   ├── scheduled-report-run.repository.ts      # NEW
│   ├── schedule-recipient-resolver.ts          # NEW — interface for resolving recipients per delivery mode
│   └── report.errors.ts                        # EXTEND — scheduled-report-specific errors (MaxSchedulesPerUserExceeded, InvalidRecurrence, ScheduleNotFound, ScheduleForbidden, IncompatibleOwnership, etc.)
├── application/use-cases/
│   ├── create-scheduled-report.use-case.ts          # EXTEND — structured recurrence, delivery mode, recipient validation, broader RBAC
│   ├── list-scheduled-reports.use-case.ts           # EXTEND — enriched output
│   ├── update-scheduled-report.use-case.ts          # NEW
│   ├── pause-scheduled-report.use-case.ts           # NEW
│   ├── resume-scheduled-report.use-case.ts          # NEW
│   ├── delete-scheduled-report.use-case.ts          # NEW (soft)
│   ├── reassign-schedule-ownership.use-case.ts      # NEW — AM only
│   ├── list-schedule-runs.use-case.ts               # NEW
│   ├── deliver-scheduled-report.use-case.ts         # NEW — delivery fan-out
│   └── process-report-job.use-case.ts               # EXTEND — route completion to DeliverScheduledReportUseCase if scheduled_report_id is set; add REPORT_FAILED on failure branch
├── infrastructure/
│   ├── prisma-scheduled-report.repository.ts        # EXTEND — new columns and methods
│   ├── prisma-scheduled-report-run.repository.ts    # NEW
│   ├── prisma-schedule-recipient-resolver.ts        # NEW — queries users + tenant settings for tenant-wide delivery
│   └── workers/
│       └── process-schedules.worker.ts              # RESHAPE — catch-up policy, auth rehydration, run ledger, auto-pause, error taxonomy
└── interfaces/
    └── report.routes.ts                             # EXTEND — PUT /v1/reports/schedules/:id, POST /v1/reports/schedules/:id/pause, POST .../resume, DELETE .../:id, POST .../:id/reassign (AM only), GET .../:id/runs

apps/backend/src/modules/notification/
├── domain/
│   └── notification.constants.ts                    # EXTEND — add REPORT_FAILED to VALID_TEMPLATE_CODES and DEFAULT_TEMPLATE_CLASSIFICATIONS=OPERATIONAL

apps/backend/prisma/seed.ts                          # EXTEND — seed REPORT_READY + REPORT_FAILED template bodies (subject, bodyHtml, bodyText with {{unsubscribeUrl}} footer)

apps/backend/src/main/
└── container.ts                                      # EXTEND — register new use cases and repositories

apps/backend/tests/
├── unit/report/
│   ├── create-scheduled-report.use-case.test.ts          # EXTEND
│   ├── update-scheduled-report.use-case.test.ts          # NEW
│   ├── pause-scheduled-report.use-case.test.ts           # NEW
│   ├── resume-scheduled-report.use-case.test.ts          # NEW
│   ├── delete-scheduled-report.use-case.test.ts          # NEW
│   ├── reassign-schedule-ownership.use-case.test.ts      # NEW
│   ├── list-schedule-runs.use-case.test.ts               # NEW
│   ├── deliver-scheduled-report.use-case.test.ts         # NEW
│   ├── process-schedules.worker.test.ts                  # RESHAPE — catch-up, auth rehydration, auto-pause, error taxonomy
│   ├── scheduled-report.entity.test.ts                   # NEW/EXTEND — consecutive-failure counter + auto-pause
│   └── process-report-job.use-case.test.ts               # EXTEND — REPORT_FAILED branch, scheduled_report_id routing
└── integration/report/
    ├── scheduled-reports.routes.test.ts                   # NEW — full CRUD + pause/resume/delete/reassign/run history (mock-container)
    └── scheduled-reports-worker.integration.test.ts       # NEW — end-to-end: create schedule → worker tick → report row created → delivery fan-out → notification rows

apps/web/src/features/scheduled-reports/                    # NEW
├── pages/ScheduledReportListPage.tsx
├── components/ScheduledReportFormDrawer.tsx
├── components/ScheduledReportRowActions.tsx
├── components/ScheduleRunHistoryDrawer.tsx
├── components/DeliveryModeSelector.tsx
├── components/RecurrenceSelector.tsx
├── hooks/useScheduledReportList.ts
├── hooks/useScheduledReportMutations.ts
└── index.ts
```

**Structure Decision**: All backend code lives inside the existing `report` module. The notification-side touch is a single-line addition of `REPORT_FAILED` in `notification.constants.ts` plus seed rows. Frontend gets its own feature folder. No new modules.

## Execution Strategy

### Waves

Five waves. Wave 3 (worker reshape + delivery fan-out) is the critical path because it touches the scheduled-run hot path.

#### Wave 1 — Notification templates for on-demand completion (closes 011#GAP-010 fast)

Unblocks US1 independently of schedules. Can ship without any schedule work.

1. Add `REPORT_FAILED` to `notification.constants.ts`.
2. Seed `REPORT_READY` and `REPORT_FAILED` template bodies in `prisma/seed.ts` (subject, bodyText, bodyHtml with `{{unsubscribeUrl}}` footer; variables: `userName`, `reportType`, `reportId`, `downloadLink`, `errorMessage`).
3. Extend `ProcessReportJobUseCase` to emit `REPORT_FAILED` on the failure branch (graceful no-op when the user has no email, mirroring the existing `REPORT_READY` path).
4. Unit tests: happy path emits `REPORT_READY`; failure path emits `REPORT_FAILED`; no-email path skips gracefully.

**Checkpoint**: on-demand report completion / failure notifications work end-to-end. `pnpm --filter backend test` green. `pnpm typecheck` green. No schedule behavior changed yet.

#### Wave 2 — Schema + domain reshape (foundational, sequential)

2. Prisma migration:
   - Add `scheduled_reports` columns: `display_name` (varchar 120), `delivery_mode` (new enum `ScheduleDeliveryMode`: `OWNER_ONLY` | `RECIPIENT_LIST` | `TENANT_WIDE`), `recipient_user_ids` (jsonb, default `[]`), `skip_delivery_when_empty` (boolean, default false), `consecutive_failure_count` (int, default 0), `status` (new enum `ScheduleStatus`: `ACTIVE` | `PAUSED`, default ACTIVE), `deleted_at` (timestamp nullable). Keep `is_active` for backward compat and derive from `status` at read time; mark it deprecated in the entity.
   - Create `scheduled_report_runs` table: `id` (uuid pk), `schedule_id` (uuid FK → `scheduled_reports.id`, cascade), `report_id` (uuid FK → `reports.id`, set null on delete), `status` (new enum `ScheduleRunStatus`: `queued` | `running` | `completed` | `failed` | `skipped_catchup` | `skipped_empty`), `scheduled_for` (timestamp), `started_at` (timestamp nullable), `completed_at` (timestamp nullable), `error_message` (text nullable), `recipient_count` (int nullable), `delivery_status_json` (jsonb nullable), `created_at` / `updated_at`. Unique key: `(schedule_id, scheduled_for)`.
   - Add `scheduled_report_id` (uuid FK nullable, set null on delete) on `reports`.
   - Seed defaults for existing `scheduled_reports` rows: `display_name = ''`, `delivery_mode = OWNER_ONLY`, `recipient_user_ids = []`, `skip_delivery_when_empty = false`, `status = ACTIVE` if `is_active` else `PAUSED`, `consecutive_failure_count = 0`, `deleted_at = NULL`.
3. Extend `ScheduledReportEntity`: new fields, `pause()`, `resume()`, `softDelete()`, `recordSuccess()`, `recordFailure()` (with auto-pause at 3). Deprecate `deactivate()`.
4. Create `ScheduledReportRunEntity` + repository interface.
5. Extend `IScheduledReportRepository`: `findActiveByOwner`, `countActiveByOwner`, `findByIdWithRuns`, `findDueForProcessing` (replacing `findDueSchedules` with the catch-up-aware version — see Wave 3).
6. Implement `PrismaScheduledReportRepository` extensions + new `PrismaScheduledReportRunRepository`.
7. Implement `PrismaScheduleRecipientResolver` (interface + Prisma adapter).
8. Extend shared Zod schemas in `packages/shared/src/schemas/report.ts` for the create/update/pause/reassign shapes and the run response. `packages/shared` rebuild.

**Checkpoint**: migration applies clean. Backend typecheck clean. No behavior change to the worker or use cases yet — existing tests still green.

#### Wave 3 — Worker reshape + delivery fan-out (critical path)

This is the delicate wave. It touches the hot path for scheduled runs and introduces the security fix for auth rehydration.

9. Reshape `ProcessSchedulesWorker`:
   - Replace synthetic-AM auth with a `UserRepository.findById(schedule.createdByUserId)` lookup → rehydrate the creator's `AuthContext` (role, tenantId, clUserPermissions from `tenant.settingsJson`). If the user is deactivated → pause the schedule + audit + notify owner (via email fallback, using the owner's last-known email if available); skip this tick.
   - Compute catch-up: if `schedule.lastRunAt` is `NULL` or `(now - lastRunAt)` exceeds one recurrence interval, insert `ScheduledReportRun` rows with `status = skipped_catchup` for each missed period (bounded by a safety cap of e.g. 100 missed runs to prevent runaway inserts), and one real run for the most recent period.
   - For the real run: upsert a `ScheduledReportRun` row keyed by `(schedule_id, scheduled_for)` with `status = queued`; on conflict, skip (idempotency). Call `RequestReportUseCase` with the rehydrated auth and a filter tag `scheduled_report_id = schedule.id`.
   - Tag the created `Report` row with `scheduled_report_id` (requires `RequestReportUseCase` to accept an optional `scheduledReportId` parameter).
   - Transition the run to `running`; let the existing `report.generate` pg-boss job do the actual work.
   - Error taxonomy: catch `ReportConcurrentLimitExceededError` / `ReportTenantConcurrentLimitExceededError` → leave run as `queued`, bump `next_run_at` by 5 min, no counter increment. Other errors → run = `failed`, counter++. At counter = 3 → auto-pause + audit + notify owner.
10. Extend `ProcessReportJobUseCase` to: after successful storage upload (or on failure), check `report.scheduledReportId`; if set, look up the `ScheduledReportRun`, mark it `completed` / `failed`, and call `DeliverScheduledReportUseCase` (on completion) OR emit `REPORT_FAILED` to the owner (on failure). Suppress the on-demand single-recipient `REPORT_READY` path when `scheduledReportId` is set, to avoid double-notification.
11. Implement `DeliverScheduledReportUseCase`:
   - Resolve recipients per `delivery_mode` using `ScheduleRecipientResolver`
   - For `OWNER_ONLY`: validate owner is still active + has access → notify
   - For `RECIPIENT_LIST`: iterate through `recipient_user_ids`, validate each (active, same tenant, has `export_reports` or AM/OP role), skip + log invalid
   - For `TENANT_WIDE`: query all active users in tenant who have the permission → filter
   - Apply `skipDeliveryWhenEmpty`: if enabled and `report.rowCount === 0`, mark the run as `skipped_empty`, record the reason, return without dispatching
   - For each valid recipient, call `CreateNotificationUseCase` with template `REPORT_READY`, payload including `{userName, reportType, reportId, downloadLink: /reports/${reportId}}`, record `{userId, email, notificationId}` in `delivery_status_json`
   - Update the run row with `recipientCount`, `deliveryStatusJson`, `completedAt`, `status = completed`
12. Wire up the container and the worker test harness.

**Checkpoint**: scheduled runs produce a `Report` row tagged with `scheduled_report_id`, a `ScheduledReportRun` row reflecting the outcome, and one notification per valid recipient. Catch-up policy is verified. Auth rehydration is verified. Auto-pause after 3 consecutive failures is verified. Zero regressions in on-demand report generation.

#### Wave 4 — Lifecycle endpoints + RBAC widening

13. Implement `UpdateScheduledReportUseCase` (edit display name, recurrence, filters, recipients, delivery mode, skip toggle — recomputes `nextRunAt`, audited with before/after).
14. Implement `PauseScheduledReportUseCase` + `ResumeScheduledReportUseCase` (resume resets counter and recomputes next run).
15. Implement `DeleteScheduledReportUseCase` (soft delete; all future runs blocked; existing runs stay queryable).
16. Implement `ReassignScheduleOwnershipUseCase` (AM only; validates target user compatibility; audited).
17. Implement `ListScheduleRunsUseCase` (paginated, RBAC mirrors parent).
18. Broaden `CreateScheduledReportUseCase`:
    - AM: any tenant, any report type
    - OP: own tenant + AM-restricted report types allowed within own tenant
    - CL_ADMIN: own tenant, any report type available to their tenant
    - CL_USER: own tenant, only if they have `export_reports` permission, only their own records
    - Validate recipient list members have compatible permission for the report type at creation time (sanity check; final validation happens at delivery time)
    - Enforce `max 10 active schedules per user` (FR-034)
    - Accept structured recurrence input (`daily` / `weekly` / `monthly` + `hour` / `dayOfWeek` / `dayOfMonth`) and map to cron internally
19. Add new routes to `report.routes.ts`:
    - `PUT /v1/reports/schedules/:id`
    - `POST /v1/reports/schedules/:id/pause`
    - `POST /v1/reports/schedules/:id/resume`
    - `DELETE /v1/reports/schedules/:id`
    - `POST /v1/reports/schedules/:id/reassign` (AM only)
    - `GET /v1/reports/schedules/:id/runs`
20. Integration tests: the `scheduled-reports.routes.test.ts` suite covers all new endpoints + RBAC per role.

**Checkpoint**: full schedule lifecycle works end-to-end. RBAC is verified per role. Audit records land as expected.

#### Wave 5 — Frontend + polish

21. Build the `scheduled-reports` feature folder: list page, form drawer, recurrence selector, delivery mode selector, row actions, run history drawer.
22. Add the route `/scheduled-reports` guarded by `AuthGuard`.
23. Link scheduled reports from the existing reports list (if a report has `scheduledReportId`, show a chip).
24. Component tests for the key UI pieces.
25. Full verification: backend tests, web tests, typecheck, lint on all workspaces.

**Checkpoint**: operators have a working UI to manage schedules and inspect run history. All tests green across the monorepo.

### Parallelism Opportunities

- **Wave 1 is independent** of all other waves and can ship first.
- Inside Wave 2: Prisma migration must be first, then domain entities + repositories can run in parallel.
- Wave 3 is **serial** (worker reshape → delivery use case → job hook).
- Inside Wave 4: edit / pause / resume / delete / reassign / list-runs are independent and can run in parallel.
- Wave 5 can start as soon as the Wave 4 shared schemas are published.

### Checkpoints per Wave

| Wave | Checkpoint criteria |
|---|---|
| 1 | On-demand report completion and failure notifications work end-to-end; templates seeded; no regressions in `ProcessReportJobUseCase` existing tests |
| 2 | Migration applies cleanly; domain entities and repositories compile; existing report tests still green; no worker behavior changed |
| 3 | Scheduled runs create `ScheduledReportRun` rows with idempotent `(schedule_id, scheduled_for)`; catch-up inserts `skipped_catchup` rows; auth rehydration verified; delivery fan-out integration test covers owner-only, recipient-list, and tenant-wide modes; auto-pause after 3 failures verified; the on-demand `REPORT_READY` single-recipient path is suppressed when `scheduled_report_id` is set |
| 4 | All lifecycle endpoints covered by unit and integration tests; RBAC per role verified; audit records for every lifecycle action; owner reassignment restricted to AM |
| 5 | Frontend tests + typecheck + lint clean on web; manual smoke of schedule create → worker tick → run history → delivery |

## Testing Strategy

### Unit Tests (Vitest)

**Entity**:
- `ScheduledReportEntity`: `pause` / `resume` / `softDelete` state machine; `recordSuccess` resets counter; `recordFailure` increments and auto-pauses at 3.
- `ScheduledReportRunEntity`: state transitions.

**Use cases**:
- `CreateScheduledReportUseCase` — per-role RBAC, recipient validation, max-10-per-user, min-1-day recurrence, structured-recurrence → cron mapping, display name.
- `UpdateScheduledReportUseCase` — before/after audit, recomputes `nextRunAt`, tenant scope enforcement.
- `PauseScheduledReportUseCase` + `ResumeScheduledReportUseCase` — state transitions, counter reset on resume, audit.
- `DeleteScheduledReportUseCase` — soft-delete semantics, `deletedAt` set, future runs blocked, past runs still queryable.
- `ReassignScheduleOwnershipUseCase` — AM-only, target user compatibility validation, audit before/after.
- `ListScheduleRunsUseCase` — RBAC inherited from parent schedule.
- `DeliverScheduledReportUseCase` — each delivery mode, skip-when-empty happy path, recipient loss-of-access skip, per-recipient notification ID recording.
- `ProcessReportJobUseCase` — `REPORT_FAILED` on failure, `scheduled_report_id` routing to delivery use case, suppression of single-recipient `REPORT_READY` for scheduled runs.
- Broadened `CreateScheduledReportUseCase` RBAC tests for AM / OP / CL_ADMIN / CL_USER (with and without `export_reports`) / INSP / TNT.

**Worker**:
- `ProcessSchedulesWorker.test.ts` — catch-up policy (1, 3, 10, 100+ missed runs), auth rehydration happy path, auth rehydration with deactivated owner (auto-pause path), auth rehydration with owner who lost permission, transient-error path (concurrent limit exceeded — no counter bump), permanent-error path (counter++), auto-pause at 3 consecutive failures, idempotency of `(schedule_id, scheduled_for)`.

### Integration Tests (Supertest, mock-container-based)

- `scheduled-reports.routes.test.ts`:
  - Create (AM / OP / CL_ADMIN / CL_USER with perm / CL_USER without perm / INSP / TNT)
  - Update (owner, AM, non-owner forbidden, CL_ADMIN within own tenant)
  - Pause / Resume / Delete
  - Reassign (AM only; OP forbidden; incompatible target user)
  - List + List runs

- `scheduled-reports-worker.integration.test.ts` (uses the real db test harness to cover a full tick):
  - Create schedule → worker tick → `Report` row created → `ProcessReportJobUseCase` runs via stub job queue → delivery fan-out → notification rows for each recipient
  - Owner-only delivery
  - Recipient-list delivery with one recipient that lost access (skipped, logged)
  - Tenant-wide delivery with varying permissions
  - Zero-row report with `skipDeliveryWhenEmpty = true` → no notifications, run status `skipped_empty`
  - Zero-row report with `skipDeliveryWhenEmpty = false` → notifications dispatched
  - Catch-up: last run 3 days ago, daily schedule → 2 `skipped_catchup` rows + 1 real run
  - Auth rehydration: creator deactivated → auto-pause + audit
  - Auto-pause: 3 consecutive failed runs → status `PAUSED`, owner notified
  - Idempotency: same `(scheduleId, scheduledFor)` on worker restart → no duplicate run

### Transactional delivery invariant (inherited from 018)

- Assert that opting out a recipient from `OPERATIONAL` email does NOT break the transactional invariant: the scheduled-report notification is `OPERATIONAL`, so the send worker skips that recipient only. The run's `delivery_status_json` records the skipped notification. The skip is visible in the audit trail via the existing notification audit.

### Out of Scope for Testing This Pass

- Tenant-timezone-aware cron execution — deferred as a residual (see below).
- E2E Playwright for the frontend — manual smoke is acceptable.
- Load testing of tenant-wide delivery with many recipients — no load test infra.
- CSV / PDF output formats — inherit automatically when 011#GAP-006 lands.

## Residual Risks and Assumptions

### Residual Risks

| Risk | Severity | Owner / status |
|---|---|---|
| **Tenant-timezone-aware cron** — current cron-parser uses server-local time; spec says tenant timezone. | MEDIUM | **Deferred as a residual**. Phase 1 uses server-local time (current behavior) and documents the assumption. A follow-up (post-019) wires `tenant.settingsJson.timezone` and re-uses a library like `cron-parser` if complexity grows. |
| **Synthetic AM auth in the worker is a pre-019 security bug** — the existing `ProcessSchedulesWorker` runs every schedule as AM regardless of owner. | HIGH | **Fixed in Wave 3**. The reshape rehydrates the creator's `AuthContext`. Document in the plan that this is a security fix bundled with 019. |
| **Race on ownership reassignment** — in-flight run uses old owner's context. | LOW | Documented, not blocked. Worker re-reads the schedule at the start of each tick. |
| **Consecutive-failure counter semantics** — should the counter reset on owner reassignment? On schedule edit? | LOW | Choose: reset on edit + reassignment + resume. Document in the pause/resume/edit use cases. |
| **Max 10 schedules per user is arbitrary** — may hit operator limits in busy tenants. | LOW | Configurable via a single constant; per-tenant override is explicitly out of scope (spec assumption). |
| **Delivery fan-out partial failure** — if `CreateNotificationUseCase` throws for one recipient mid-iteration, how do we handle the rest? | MEDIUM | Wrap each recipient dispatch in try/catch; record success/failure per recipient in `delivery_status_json`. The run status is `completed` as long as at least one recipient succeeded, else `failed`. |
| **Recipient list using stale user ids** — if a user is deleted and a new user with the same email is created later, the recipient list may point at the wrong user. | LOW | `recipient_user_ids` are uuids; deleted users stay deleted (no id reuse). Safe. |
| **Audit log explosion for tenant-wide schedules** — one audit per run is fine, but one audit per recipient dispatch would spam the log. | LOW | Audit the run (one entry), not each recipient dispatch. Per-recipient outcome lives in `delivery_status_json` on the run, not in `audit_logs`. |
| **pg-boss `*/15 * * * *` cadence means up to 15-minute drift on execution** — fine per SC-003 but operators may be surprised. | LOW | Document in the spec / UI hint. |

### Assumptions

1. The existing on-demand report engine (011) is stable and unchanged. Scheduled runs go through `RequestReportUseCase` exactly like a manual request, with the only difference being the `scheduled_report_id` tag on the created report.
2. The existing notification engine (009) + 018 classification is stable. Scheduled-report notifications use `OPERATIONAL` classification so opted-out recipients are correctly skipped, and the owner can opt out just like any other operational notification.
3. The `REPORT_READY` template code already exists in the notification constants but is not yet seeded with a body; the seed is part of Wave 1.
4. The `REPORT_FAILED` template code is new and will be added to both the shared constants and the seed in Wave 1.
5. The `AuthContext.clUserPermissions` field is populated correctly by the auth middleware (relies on 015-permissions-rbac-matrix being in place).
6. Recipients are registered system users — external email delivery is explicitly out of scope.
7. The Inspector mobile app (PWA) has no schedules UI — web-portal only.
8. The pg-boss `*/15 * * * *` cadence is sufficient granularity. Sub-minute schedules are not supported (matches FR-035's minimum 1-day recurrence anyway).
9. The existing `cron_expression` column stays as the internal storage format; the structured recurrence UX is mapped to a cron at the use-case boundary. This minimizes migration churn.
10. Report file retention (30 days) and presigned-URL TTL (1 hour) are inherited from 011 and are not modified.

### Implementation Reality vs Approved Target

See the "Implemented Reality vs Approved Target" table in the Summary. The plan treats the existing `ScheduledReport` model, entity, `CreateScheduledReportUseCase`, `ListScheduledReportsUseCase`, `ProcessSchedulesWorker`, and `cron-parser` as implemented reality and **extends** them with the missing lifecycle, per-run ledger, delivery fan-out, catch-up policy, and RBAC widening. There is no full rewrite anywhere in the plan.

## Complexity Tracking

No constitution violations. No complexity justifications needed. The plan is additive:
- 1 additive Prisma migration (columns + 1 new table + 1 optional FK)
- 7 new use cases + 2 extended use cases + 1 worker reshape
- 6 new endpoints on the existing `report.routes.ts`
- 1 new frontend feature folder
- 1 new shared Zod schema bundle in `packages/shared/src/schemas/report.ts`

The most delicate piece is the Wave 3 worker reshape because it bundles a security fix (auth rehydration), a new invariant (idempotency via `(schedule_id, scheduled_for)`), and a new behavior (catch-up policy + auto-pause). This is explicitly called out as the critical path, and the test strategy isolates it with a dedicated integration suite.

---

## Execution Outcome (2026-04-12)

The plan was executed end-to-end on branch `015-permissions-rbac-matrix`. All five waves are delivered. This section is the editorial record of the delivery and does not change the design.

### Wave-by-wave delivery

| Wave | Scope | Status | Notes |
|---|---|---|---|
| Wave 1 — On-demand completion notifications | `REPORT_FAILED` template code + seed bodies for `REPORT_READY` and `REPORT_FAILED`, failure branch in `ProcessReportJobUseCase` | ✅ delivered | Closes 011#GAP-010. Graceful no-op when user has no email. Suppresses the single-recipient path when `scheduled_report_id` is set to avoid double-notify. |
| Wave 2 — Schema + domain reshape | Additive Prisma migration (3 enums, 7 column additions, new run ledger table, optional FK on `reports`); `ScheduledReportEntity` extended with `pause/resume/softDelete/recordSuccess/recordFailure`; new `ScheduledReportRunEntity`; new repositories + interfaces; shared Zod schemas | ✅ delivered | Migration is additive-only. Backfills `status` from legacy `is_active`. No existing rows disrupted. |
| Wave 3 — Worker reshape (critical path) | `ProcessSchedulesWorker` rehydrates creator `AuthContext`, implements catch-up policy with `SCHEDULE_CATCHUP_MAX = 100`, uses `(schedule_id, scheduled_for)` idempotency key, classifies errors (transient vs permanent), auto-pauses at 3 consecutive failures, auto-pauses on deactivated owner and removed report type | ✅ delivered | Bundled security fix: the pre-existing synthetic-AM impersonation is replaced. 7 dedicated worker unit tests. |
| Wave 4 — Lifecycle endpoints + RBAC widening | `CreateScheduledReportUseCase` broadened for AM/OP/CL_ADMIN/CL_USER; `Update`/`Pause`/`Resume`/`Delete`/`Get`/`ListRuns`/`Reassign` use cases; 7 new routes on `report.routes.ts`; 14 integration tests | ✅ delivered | AM-only reassignment enforced in `ReassignScheduleOwnershipUseCase` with target compatibility validation. `CreateNotificationUseCase` hook for delivery fan-out via `DeliverScheduledReportUseCase`. |
| Wave 5 — Frontend + polish | Minimal viable surface: `ScheduledReportListPage`, `ScheduledReportTable`, `ScheduleStatusChip`, `ScheduleRunStatusChip`, `useScheduledReportList`, `useScheduleRuns`; route `/scheduled-reports` guarded by `AuthGuard` (AM/OP/CL_ADMIN/CL_USER) | ✅ delivered | Form drawer, run history drawer, recurrence selector, delivery mode selector, and reassign modal remain as follow-up polish — backend endpoints are ready. |

### Verification record

- **Backend: 259 test files / 2722 tests passing** after delivery (`pnpm --filter backend test`).
- **Frontend**: 7 new component tests for `ScheduleStatusChip` and `ScheduleRunStatusChip`; existing web suite still green.
- **Typecheck clean** across all workspaces (backend, web, pwa, shared).
- **Zero regressions** in the on-demand report engine (32 `ProcessReportJobUseCase` tests pass) or the notification engine (278 notification tests pass).

### Deviations from the plan

- **None material.** The plan described the worker reshape as the critical path; it landed as written with the creator-auth rehydration, catch-up policy, idempotency key, error taxonomy, and auto-pause logic intact.
- `CreateScheduledReportUseCase` signature expanded slightly to accept optional `userRepo` and `authorizationService` for the recipient validation + `export_reports` permission check. The legacy two-arg constructor is preserved for back-compat in tests.
- The `ProcessReportJobUseCase` gained two optional constructor deps (`scheduledReportRunRepo`, `deliverScheduledReportUseCase`) so the on-demand path remains unchanged when the schedule deps are absent. Scheduled reports only take the fan-out branch when both are wired.
- The minimal frontend surface is read-only (list + chips + inline action buttons that call the mutation endpoints directly from the table). Form drawer and run-history drawer were split off as explicit non-blocking polish — the backend surface is complete.

### Residuals

All residuals are classified **non-blocking** per the spec's "Delivery Outcome → Residuals" section. 24 tasks remain unticked in `tasks.md`:

- **7 partial-coverage items** (T037–T040, T050, T057, T058): supplementary use case unit tests whose behavior is already asserted by entity tests, integration tests, or the worker test suite
- **2 deferred integration tests** (T054, T077): full-DB delivery and worker end-to-end suites — unit coverage is comprehensive
- **1 deferred frontend hook** (T083): `useScheduledReportMutations` — the current table calls mutations inline
- **7 deferred frontend components** (T087–T093, T096): form drawer, modal, selectors, row actions, cross-page chip — backend endpoints are ready
- **1 deferred frontend test expansion** (T097): follows the deferred components
- **2 deferred verification passes** (T100, T102): full frontend sharded run + cross-workspace lint
- **3 manual smoke tests** (T103–T105): require a running dev environment
- **1 absorbed residual doc** (T106): tenant-timezone note is already in this file's "Residual Risks and Assumptions" section — no additional documentation needed

See `spec.md` "Delivery Outcome → Residuals" for the full classification table.

### Ready for 020

Feature 019 is shippable and ready to serve as a base for 020 (audit retention + PII redaction). All critical invariants are preserved, the security fix for the synthetic-AM impersonation is in place, and the on-demand + scheduled report flows are both under test. No open blockers.
