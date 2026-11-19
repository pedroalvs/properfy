# Implementation Plan: Inspector Field Events (backend + shared)

**Branch**: `043-f03-2-field-events` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/043-f03-2-field-events/spec.md`

## Summary

Introduce the `InspectorFieldEvent` record and the backend/shared behavior around "Can't do this job" (→ `REJECTED` via SYSTEM with `INSPECTOR_UNABLE`), "Running late" (`LATE_NOTICE` with server-computed `estimatedArrivalAt`), abandoned-execution handling (`abandoned_at` across 5 readers + restart), the OP/AM alert, the agency rejection-email block, the field-activity API with a CL privacy cut, the `inspectorIssue` list/detail projection (single `DISTINCT ON` query), the portal no-reoffer rule for `INSPECTOR_UNABLE`, and the completion reminder (contract 03.16) via F02. Delivered as **one PR, two authors** (Pilar: event model/enums, can't-do→REJECTED, abandoned handling, finish lock+CAS, geofence-on-finish wiring, transition-source constant; Esteio: late notice/ETA, OP/AM alert, inspectorIssue + field-activity, portal block, rejection email, completion reminder). Technical approach is fixed by the task file and the closed decisions D1–D31.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24
**Primary Dependencies**: Fastify 4, Prisma 6 (PostgreSQL/Supabase, PostGIS in CI), Zod 3, pg-boss 9, `fastify-type-provider-zod`; Resend/MobileMessage via F02; Mapbox (not touched here)
**Storage**: PostgreSQL. New table `inspector_field_events` (carries `tenant_id` = appointment's tenant); new nullable column `inspection_executions.abandoned_at`. One expand-only migration.
**Testing**: Vitest (shared + backend unit), Supertest + testcontainers (backend DB integration, serial, `test:integration:db`)
**Target Platform**: Fastify API (`apps/backend`) + shared contracts (`packages/shared`)
**Project Type**: Monorepo web backend + shared contract package (no UI in this task)
**Performance Goals**: `inspectorIssue` on a list page MUST cost exactly one extra query regardless of page size (SC-010); no N+1
**Constraints**: Clean Architecture layering; multi-tenant scope on every business query; appointment status changes only through the sovereign transition use case; no inspector raw lat/lng in any audit or CL-facing response; timezone-correct (agency tz for civil dates/windows, UTC instants, platform tz for jobs); ≤ 150 changed files
**Scale/Scope**: Two inspector-facing POST routes, one appointment GET route, three altered read paths, one platform template, one notification service, one scheduled job, one transition use-case extension, one state-machine-adjacent concurrency guard. ~ backend 4.75 dev-days.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.4.0. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| **I. Clean Architecture** | PASS | New domain entity/port (`inspector-field-event.entity.ts`, `.repository.ts`), application use cases (`report-cant-do`, `report-late-notice`, `get-appointment-field-activity`, `send-completion-reminders`), infrastructure adapter (`prisma-inspector-field-event.repository.ts`) and interfaces (routes). Dependencies point inward; `IPublishedStopStartReader` is a domain port with a null F03 adapter until F04-2 wires the real one. |
| **II. Multi-Tenant Safety** | PASS | `InspectorFieldEvent` carries `tenant_id` (the appointment's) — **not** a §7.1/§II exception, unlike `PlatformSetting`. Field-activity uses the same tenant cut as `GetAppointmentUseCase`; CL cross-tenant → 404. SYS rejection resolves `tenantId` from the appointment (`{ ...SYSTEM_ACTOR, tenantId: appointment.tenantId }`). Idempotency on both POSTs. Audits on every sensitive step; the SYS transition audit records the resolved `tenantId`. **No audit stores raw inspector lat/lng** (coordinates live only in `inspector_field_events`, served to AM/OP via field-activity). FR-008 adds the cross-tenant scoping test. |
| **III. TDD** | PASS | Red→green→refactor; 23 numbered test groups (shared, backend unit, backend DB integration) authored before implementation. Integration tests hit a real DB (testcontainers), never mock Prisma. Concurrency test (23) must fail when the lock or CAS is removed (mutation proof). |
| **IV. Contract-First APIs** | PASS | All payloads validated with Zod in `packages/shared/src/schemas`; `openapi.json` + `api-types.ts` regenerated (`pnpm generate:api`) and committed. Expand/contract: new fields (`inspectorIssue`, `canChangeTime`, `lastFieldIssue`) added as optional/nullable; `INSPECTOR_UNABLE` added to the enum without removing any. Error envelope + `request_id` unchanged. |
| **V. Simplicity & Minimal Impact** | PASS | Reuses `SYSTEM_ACTOR`, the sovereign transition use case, the `notify-stuck.worker` alert pattern, F02's notice use case, and the existing `FOR UPDATE` precedent. No new status, no new transition-RBAC source, no feature flag. `abandoned_at` sentinel avoids changing the `appointment_id @unique` constraint. No `@@index([abandoned_at])` (filtered with `finished_at: null` over few rows). |

**State machine sovereignty**: the rejection goes through `ExecuteStatusTransitionUseCase` (SYS actor, `SCHEDULED → REJECTED` already permits SYS). `appointment-state-machine.ts` and the other 4 transition-RBAC sources are untouched. No direct write to `appointments.status` except via the use case's CAS `updateMany` (still inside the use case).

**Result: PASS — no violations, Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/043-f03-2-field-events/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (endpoint + schema contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── enums/field-events.ts                 # +event/issue/late enums & labels (file created by F03-1)
├── enums/reason-codes.ts                 # +INSPECTOR_UNABLE, SYSTEM_ONLY_REJECTION_CODES
├── constants/transition-sources.ts       # NEW: TRANSITION_SOURCE_INSPECTOR_CANT_DO
├── constants/inspector-notices.ts        # +COMPLETION_REMINDER_DEDUPE_PREFIX, builder (create if F02 hasn't)
├── schemas/field-events.ts               # NEW: cantDo/lateNotice/inspectorIssue/fieldActivity schemas
├── schemas/responses.ts                  # +inspectorIssue, +canChangeTime, +lastFieldIssue
├── utils/reason-code-label.ts            # humanizer (enum-derived; +label)
└── index.ts / schemas/index.ts           # exports

apps/backend/prisma/
└── schema.prisma + migrations/<ts>_inspector_field_events/

apps/backend/src/modules/
├── appointment/
│   ├── application/use-cases/execute-status-transition.use-case.ts   # +auditMetadata, +expectedStatus (CAS), +SYSTEM_ONLY guard
│   ├── application/use-cases/get-appointment-field-activity.use-case.ts  # NEW
│   ├── application/use-cases/get-appointment.use-case.ts / list-appointments.use-case.ts  # +inspectorIssue mapping
│   ├── infrastructure/prisma-appointment.repository.ts               # +findLatestCantDoByAppointmentIds merge
│   └── interfaces/appointment.routes.ts                              # +GET /:id/field-activity
├── inspector-execution/
│   ├── domain/inspector-field-event.entity.ts / .repository.ts        # NEW entity + port (+lockAppointmentForFieldEvent)
│   ├── domain/inspection-execution.*                                   # +abandonedAt, markAbandoned, restart, isAbandoned
│   ├── domain/late-notice.ts                                           # NEW: computeEstimatedArrivalAt + IPublishedStopStartReader port
│   ├── domain/inspection-execution.errors.ts                          # +CantDoAlreadyReported/FieldEventAppointmentNotScheduled/LateNoticeNotAllowed/PayloadMismatch
│   ├── application/use-cases/report-cant-do.use-case.ts               # NEW
│   ├── application/use-cases/report-late-notice.use-case.ts           # NEW
│   ├── application/use-cases/send-completion-reminders.use-case.ts    # NEW (03.16; ships last, dep F02)
│   ├── application/services/notify-inspector-unable.service.ts        # NEW (OP/AM alert)
│   ├── application/use-cases/start/finish/get-schedule/get-detail     # +abandoned handling; finish +lock/CAS
│   ├── infrastructure/prisma-inspector-field-event.repository.ts      # NEW
│   └── interfaces/inspector-execution.routes.ts                       # +POST cant-do, +POST late-notice
├── rental-tenant-portal/
│   ├── domain/portal-statuses.ts                                      # +isPortalChangeTimeBlocked
│   └── application/use-cases/{join-group,get-available-groups,get-portal-data,report-unavailability}  # use the new guard
└── notification/
    ├── domain/platform-notification-templates.ts                      # +INSPECTOR_UNABLE_ALERT; REJECTED_AGENCY block
    └── domain/build-notification-payload.service.ts                   # +rejectedByInspector/inspectorName

apps/backend/src/main/{container.ts,routes.ts,workers.ts,server.ts}    # wiring + completion-reminder job
packages/shared/src/constants/notification-templates.ts               # +INSPECTOR_UNABLE_ALERT in the 6 shared places; +REJECTED_AGENCY optional var
```

**Structure Decision**: Monorepo backend + shared package. Shared contracts are built (`dist/`) before backend typecheck/tests. All work is additive/expand-only; no file outside `apps/backend` and `packages/shared` changes except the regenerated `openapi.json`/`api-types.ts` and the two CLAUDE.md files (backend, shared).

## Complexity Tracking

No constitutional violations — section intentionally empty.
