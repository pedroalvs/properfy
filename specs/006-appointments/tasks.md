---
description: "Implementation and backlog tracking for Appointments"
---

# Tasks: Appointments

**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), [`data-model.md`](./data-model.md), [`contracts/`](./contracts/)
**Tests**: Mandatory per constitution Principle III. This is a critical module — 80%+ coverage floor. The state machine, two-person cross-check, and pricing snapshot are the highest-risk surfaces and must have exhaustive coverage.
**Organization**: Two sections — Baseline Implemented (shipped) and Open Backlog (Phase 2/3).

## Format

- `[x]` shipped; `[ ]` open.
- `[P]` may run in parallel with other `[P]` tasks in the same group.
- `[Story]` maps to a user story in `spec.md` (US1–US7) or a `GAP-xxx`.

---

# SECTION 1 — Baseline Implemented

> Already done on the active branch. Do not reimplement.

## Setup & Foundational (shipped)

- [x] T001 Prisma schema: `Appointment`, `AppointmentContact`, `AppointmentRestriction`, `AppointmentImport`, `AppointmentStatus`, `TenantConfirmationStatus`, `RestrictionSource`.
- [x] T002 Shared enums and Zod schemas in `packages/shared/src/{enums,schemas}/appointment*.ts`.
- [x] T003 Domain entities (`AppointmentEntity`, `AppointmentContactEntity`, `AppointmentRestrictionEntity`, `AppointmentImportEntity`).
- [x] T004 Domain ports `IAppointmentRepository`, `IAppointmentImportRepository`.
- [x] T005 Typed domain errors (25+ classes in `appointment.errors.ts`).
- [x] T006 `AppointmentStateMachine` with `TRANSITION_RULES` matrix and `validateTransition` helper.
- [x] T007 Pricing snapshot helpers `snapshotPricing` and `calculatePayoutAmount`.
- [x] T008 `PrismaAppointmentRepository` and `PrismaAppointmentImportRepository`.
- [x] T009 Import worker `import.worker.ts` consuming `appointment.import` pg-boss jobs.

## US1 — Create appointment (shipped)

- [x] T010 [US1] `CreateAppointmentUseCase` with full cross-module validation (tenant, branch, property, service type, pricing rule, time slot, past-date guard), inline property creation, contact + restriction persistence, audit.
- [x] T011 [US1] Route `POST /v1/appointments`.
- [x] T012 [US1] Unit tests covering every rejection branch.
- [x] T013 [US1] Integration tests covering happy path, inline property creation, and CL_USER permission gating.

## US2 — Update appointment (shipped)

- [x] T020 [US2] `UpdateAppointmentUseCase` restricted to `DRAFT`/`AWAITING_INSPECTOR`.
- [x] T021 [US2] Route `PATCH /v1/appointments/:appointmentId`.
- [x] T022 [US2] Unit + integration tests covering the status-gate rejection.

## US3 — State transitions (shipped)

- [x] T030 [US3] `ExecuteStatusTransitionUseCase` with state machine validation, reason/doneCheck/inspector preconditions, tenant confirmation check, service group requirement, CL_USER permission gating, idempotency cache, side-effect wiring (`onDoneHandler`, `onTransitionHandler`).
- [x] T031 [US3] Route `POST /v1/appointments/:appointmentId/status-transitions` with `Idempotency-Key` header support.
- [x] T032 [US3] Unit tests for every one of the 14 transitions — happy path per allowed actor, negative path per disallowed actor, reason requirement per `requiresReason`.
- [x] T033 [US3] Integration test for `DONE + doneCheckedByUserId` compound flow (single call cross-check — `implementation shortcut`, not the canonical business flow).
- [x] T034 [US3] Integration test for the `DONE → REJECTED` compensation audit side effect.
- [x] T035 [US3] Integration test for idempotent replay returning the cached result without re-running side effects.
- [x] T036 [US3] Integration test for `INSP` attempting a transition on an unassigned appointment → `APPOINTMENT_ACCESS_DENIED`.
- [x] T037 [US3] Integration test for CL_USER cancellation gated by `assertClUserPermission`.

## US4 — Two-person cross-check (shipped)

- [x] T040 [US4] `PerformCrossCheckUseCase` with role check, status check, self-approval check (via audit log scan), evidence verification (execution finished + assets meet checklist), cascaded `onDoneHandler`, audit.
- [x] T041 [US4] Route `POST /v1/appointments/:appointmentId/cross-check-done`.
- [x] T042 [US4] Unit tests for every error class including `APPOINTMENT_DONE_CROSS_CHECK_ORIGIN_NOT_FOUND` and `APPOINTMENT_DONE_CROSS_CHECK_EVIDENCE_INCOMPLETE`.
- [x] T043 [US4] Integration test exercising the full sequence: mark DONE by INSP → cross-check by OP → financial entries created.

## US5 — Force manual confirmation (shipped)

- [x] T050 [US5] `ForceManualTenantConfirmationUseCase` with RBAC including `force_confirmation` permission for CL_USER.
- [x] T051 [US5] Route `POST /v1/appointments/:appointmentId/force-confirmation`.
- [x] T052 [US5] Unit + integration tests.

## US6 — List / read / contacts (shipped)

- [x] T060 [US6] `GetAppointmentUseCase`, `ListAppointmentsUseCase`, `ListAppointmentContactsUseCase` with tenant scoping and INSP filtering.
- [x] T061 [US6] Routes `GET /v1/appointments`, `GET /v1/appointments/:appointmentId`, `GET /v1/appointment-contacts`, `GET /v1/appointment-contacts/:contactId`.
- [x] T062 [US6] Unit + integration tests including existence-leakage verification on cross-tenant reads.

## US7 — Bulk import (shipped)

- [x] T070 [US7] `ImportAppointmentsUseCase` + `GetImportStatusUseCase` with RBAC, idempotency, storage upload, enqueue, status polling.
- [x] T071 [US7] Routes `POST /v1/appointments/import`, `GET /v1/appointments/import/:importId`.
- [x] T072 [US7] `import.worker.ts` parsing XLSX/CSV and creating rows via `CreateAppointmentUseCase`.
- [x] T073 [US7] Integration test for happy path, bad extensions, missing header, rate limit, and status polling.

## Frontend (shipped)

- [x] T090 Web pages under `apps/web/src/features/appointments/` — list, detail, create wizard, transition actions, contact drawer, import UI.
- [x] T091 PWA pages under `apps/pwa/src/features/schedule/` — inspector schedule list, detail, finish inspection action (which drives SCHEDULED → DONE via feature 008).
- [x] T092 Component + hook tests for the above.

## Cross-cutting (shipped)

- [x] T095 Container wiring injecting every cross-module port into the appointment container (tenant, branch, property, service type, pricing rule, inspector, user, execution, audit log, idempotency, storage, time slot, create-property use case).
- [x] T096 Rate limit plugin wired for the import endpoint.
- [x] T097 Idempotency service wired into the status transition and cross-check flows.

---

# SECTION 2 — Open Backlog

> Only pick up work from this section. Every task must follow TDD and produce an audit record on write paths.

## Phase 2 — Gap closure

### GAP-001 — Typed reason codes

- [ ] T100 [GAP-001] Design doc enumerating cancellation and rejection reason codes with product.
- [ ] T101 [GAP-001] Define `CancellationReasonCode` and `RejectionReasonCode` enums in `packages/shared/src/enums/appointment*.ts` with Zod validation.
- [ ] T102 [GAP-001] Prisma migration to change `cancellation_reason_code` / `rejection_reason_code` from varchar to enum (expand/contract with a backfill step).
- [ ] T103 [GAP-001] Update `ExecuteStatusTransitionUseCase` to validate the incoming code.
- [ ] T104 [GAP-001] Backfill script flagging free-form rows that cannot be mapped.
- [ ] T105 [GAP-001] Tests and analytics query samples.

### GAP-002 — Financial compensation on DONE → REJECTED

- [ ] T110 [GAP-002] Depends on 002#GAP-005 (domain event bus).
- [ ] T111 [GAP-002] Emit `appointment.done_rejected.v1` event from `ExecuteStatusTransitionUseCase` when the transition runs.
- [ ] T112 [GAP-002] Feature 010 consumer creates a compensating financial entry (`REFUND` type or `MANUAL_ADJUSTMENT` per dossier).
- [ ] T113 [GAP-002] Tests asserting compensation runs exactly once and is auditable.

### GAP-003 — Tenant portal reschedule handoff

- [ ] T120 [GAP-003] Design doc defining the reopen-for-reschedule protocol between features 006 and 007.
- [ ] T121 [GAP-003] Introduce `ReopenForRescheduleUseCase` (or a dedicated transition in the matrix) that feature 007 can call without mixing force-confirmation with direct updates.
- [ ] T122 [GAP-003] Update feature 007 to consume the new entry point.
- [ ] T123 [GAP-003] Tests covering the full renter-initiated reschedule round-trip.

### GAP-004 — Import idempotency payload verification

- [ ] T130 [GAP-004] Hash the uploaded file on first write (SHA-256) and persist on the `AppointmentImport` row.
- [ ] T131 [GAP-004] On replay, compare hashes — return cached result on match, `409 Conflict` on mismatch (matches 003#GAP-006 resolution shape).
- [ ] T132 [GAP-004] Tests.

### GAP-005 — Appointment soft-delete policy

- [ ] T140 [GAP-005] Decision: is deletion ever allowed? Capture in a design doc with product.
- [ ] T141 [GAP-005] If yes: implement `DeleteAppointmentUseCase` gated to AM in `DRAFT` only, with audit and cascade cleanup for contact/restriction.
- [ ] T142 [GAP-005] Tests.

### GAP-006 — Typed transition event contract

- [ ] T150 [GAP-006] Depends on 002#GAP-005 (domain event bus).
- [ ] T151 [GAP-006] Define `AppointmentTransitionEvent` typed interface in `packages/shared` covering `from`, `to`, `actorId`, `tenantId`, `appointmentId`, `reason?`, metadata.
- [ ] T152 [GAP-006] Migrate `onTransitionHandler` consumers to subscribe to typed events instead of the loose interface.
- [ ] T153 [GAP-006] Tests.

### GAP-007 — CL_USER permission set schema

> Resolved by 001#GAP-003. `ClUserPermission` union type exists in `packages/shared/src/enums/user.ts`. `AuthorizationService.assertClUserPermission` already accepts the typed `ClUserPermission` parameter. All appointment use cases pass typed string literals that are compile-time checked against the union.

- [x] T160 [GAP-007] Depends on 001#GAP-003 (fine-grained permissions design). **Resolved by 001#GAP-003.**
- [x] T161 [GAP-007] Define `ClUserPermission` union type in shared enumerating every permission the appointment module checks (`create_appointments`, `cancel_appointments`, `reject_appointments`, `force_confirmation`, etc.). **Already defined in `packages/shared/src/enums/user.ts`.**
- [x] T162 [GAP-007] Refactor `assertClUserPermission` to accept only the typed union and fail to compile on typos. **Already typed in `AuthorizationService` (`permission: ClUserPermission`).**
- [x] T163 [GAP-007] Tests. **Covered by existing use case tests that exercise CL_USER permission checks.**

### GAP-008 — Appointment number runbook

- [x] T170 [GAP-008] Write runbook `docs/runbooks/appointment-number-reset.md` describing DBA-level procedures if the global sequence is exhausted or corrupted (dev/staging only).
- [x] T171 [GAP-008] Decide whether per-tenant numbering is worth the complexity; capture decision in the runbook. **Decision: global numbering is sufficient (documented in runbook).**

### GAP-009 — `done_marked_by_user_id` column

- [ ] T180 [GAP-009] Prisma migration adding `done_marked_by_user_id` with an FK to `users`.
- [ ] T181 [GAP-009] Populate the column inside `ExecuteStatusTransitionUseCase` whenever the transition target is `DONE`.
- [ ] T182 [GAP-009] Refactor `PerformCrossCheckUseCase` to read the column instead of scanning the audit log. Keep the audit log scan as a safety net for existing rows.
- [ ] T183 [GAP-009] Backfill existing rows via a script that scans audit logs once.
- [ ] T184 [GAP-009] Tests including a negative test where the column is null and the fallback audit scan is exercised.

### GAP-010 — Compound DONE + cross-check endpoint

> **Note**: the code already supports an `implementation shortcut` where `doneCheckedByUserId` can be passed in the same status-transition call to DONE (see US3 scenario 6). This GAP proposes a **cleaner API surface** with a dedicated `crossCheckByUserId` parameter that more clearly separates the two concerns. Neither the existing shortcut nor this GAP is the canonical business flow — the canonical flow is the two-step path (US3 scenario 5 → US4 cross-check endpoint).

- [ ] T190 [GAP-010] Extend `statusTransitionSchema` to accept `crossCheckByUserId` alongside `doneCheckedByUserId`.
- [ ] T191 [GAP-010] Inside the use case, when both are present on a `* → DONE` transition, perform the cross-check atomically (reuse `PerformCrossCheckUseCase` logic).
- [ ] T192 [GAP-010] Reject the same user id in both fields with `APPOINTMENT_DONE_CHECKER_SELF_CHECK`.
- [ ] T193 [GAP-010] Tests including the happy path and the self-check rejection.

### CORRECTION — Contact endpoint returns wrong error code

> **IMPLEMENTED divergence.** `GET /v1/appointment-contacts/:contactId` currently returns `VALIDATION_ERROR` when the contact is not found. The correct behavior per the standard error convention is `404 CONTACT_NOT_FOUND`.

- [x] T195 [CORRECTION] Change the route handler to throw a proper `ContactNotFoundError` (or `NotFoundError` with code `CONTACT_NOT_FOUND`) instead of `ValidationError` when the contact lookup returns null.
- [x] T196 [CORRECTION] Integration test asserting `GET /v1/appointment-contacts/:nonExistentId` returns HTTP 404 with `code: CONTACT_NOT_FOUND`.

## Phase 3 — Polish & cross-cutting

- [ ] T200 [P] Verify appointment module coverage ≥ 80% with `pnpm --filter backend test -- --coverage`; critical module floor.
- [ ] T201 [P] End-to-end assertion: every appointment write path produces exactly the expected audit records. Dedicated integration suite covering every status transition + the cross-check.
- [ ] T202 Confirm OpenAPI export reflects all appointment endpoints and the frontend clients regenerate cleanly.
- [ ] T203 Incremental supersede of legacy specs:
  - Add a banner to `specs/backend/appointment.spec.md`, `specs/web/appointments.spec.md`, and `specs/pwa/schedule.spec.md` marking them as SUPERSEDED by `specs/006-appointments/` once this feature is approved.
  - Remove the legacy files only after the next feature migration cycle.
- [ ] T204 Audit all callers of `onDoneHandler` across the codebase to confirm nothing bypasses the cross-check rule.
- [ ] T205 Document the state machine in a diagram (e.g., Mermaid) alongside `data-model.md` for onboarding.

---

## Dependencies & Execution Order

- **GAP-002** depends on `002#GAP-005` (domain event bus).
- **GAP-006** depends on `002#GAP-005`.
- **GAP-007** depends on `001#GAP-003` (fine-grained permissions).
- **GAP-009** is a pure optimization — can land independently, but should come before any audit retention shrinkage that might remove old `status_transition` entries.
- **GAP-010** is an ergonomic add-on; does not block other work.

## Notes

- The state machine is sovereign. Reviewers must block any PR introducing a new code path that writes `appointments.status` outside `ExecuteStatusTransitionUseCase`.
- Two-person cross-check is a hard precondition for financial entries. Reviewers must block any PR that moves financial entry creation earlier in the flow.
- Close each `GAP-xxx` by promoting it in `spec.md` (Known Gaps table) and updating `specs/GAPS.md`.
