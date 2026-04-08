# Feature Specification: Appointments

**Feature Branch**: `006-appointments`
**Created**: 2026-04-05
**Feature Status**: IMPLEMENTED (Phase 1) — pending review for Phase 2/3 gaps
**Sources**:
- Code: `apps/backend/src/modules/appointment/**`, `apps/backend/prisma/schema.prisma`, `packages/shared/src/schemas/appointment*`, `apps/web/src/features/appointments/**`, `apps/pwa/src/features/schedule/**`
- Approved rules: `.specify/memory/constitution.md`, `CLAUDE.md`, `apps/backend/CLAUDE.md`, `projeto-consolidado/state-machine-executavel.md`, `projeto-consolidado/regras-negocio-respostas-cliente.md`
- Legacy specs (to be superseded on approval): `specs/backend/appointment.spec.md` (2522 lines), `specs/web/appointments.spec.md` (1037), `specs/pwa/schedule.spec.md` (587)

> **Domain context.** Appointment is the central business entity of Properfy. Every other feature exists to support its lifecycle: tenants own it, branches scope it, properties anchor it, service types classify it, pricing rules price it, service groups batch it, inspectors execute it, tenant portal confirms it, notifications signal it, billing invoices it, audit records it. The appointment state machine is **sovereign** — per constitution Principle VI, no code path may transition an appointment except through `ExecuteStatusTransitionUseCase` (and the sibling `PerformCrossCheckUseCase` for the two-person rule). Direct database writes to `appointments.status` are forbidden outside migrations.
>
> **Reading guide.** Every user story declares `Priority`, `Status`, `Source`. Status: `IMPLEMENTED` | `APPROVED` | `GAP`. Source: `code` | `dossier` | `inferred`.

## User Scenarios & Testing

### User Story 1 — Create an appointment with structured contact, restriction, and pricing snapshot

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

An operator (AM, OP) or agency user (CL_ADMIN, CL_USER with `create_appointments` permission) creates a new appointment under an active tenant + branch. The appointment links to an existing property (or creates one inline), carries contact details (renter name, emails, phones), optional restrictions (unavailable days/hours, isHome flag), and an immutable snapshot of the resolved pricing rule. On create, the appointment starts in `DRAFT` status with `tenantConfirmationStatus = PENDING`.

**Why this priority**: Every workflow in the platform begins with an appointment row.

**Independent Test**: As CL_ADMIN with an active branch and an existing property, `POST /v1/appointments` with a complete payload. Confirm (a) the appointment is in `DRAFT`, (b) `pricingRuleSnapshotJson` contains the rule used, (c) `priceAmount` and `payoutAmount` match the rule, (d) contact + restriction rows exist, (e) an audit record is written.

**Acceptance Scenarios**:

1. **Given** an authorized actor with valid tenant and branch, **When** they `POST /v1/appointments` referencing an existing `propertyId`, **Then** an appointment is created with `status = DRAFT`, `tenantConfirmationStatus = PENDING`, the resolved pricing snapshot, linked contact row, and (optionally) restriction row.
2. **Given** the same payload with an inline `property` object instead of `propertyId`, **When** submitted, **Then** `CreatePropertyUseCase` is invoked inline and the new property is linked to the appointment atomically.
3. **Given** a branch that is not `ACTIVE` or does not belong to the resolved tenant, **When** create is attempted, **Then** the request fails with `APPOINTMENT_BRANCH_INACTIVE` or `APPOINTMENT_BRANCH_NOT_FOUND`.
4. **Given** a property that belongs to a different tenant, **When** create is attempted, **Then** the request fails with `APPOINTMENT_PROPERTY_TENANT_MISMATCH`.
5. **Given** an inactive service type, **When** create is attempted, **Then** the request fails with `APPOINTMENT_SERVICE_TYPE_INACTIVE`.
6. **Given** no active pricing rule for the (tenant, service type) combination, **When** create is attempted, **Then** the request fails with `APPOINTMENT_NO_PRICE_RULE`.
7. **Given** a `timeSlot` that is not in the effective catalog for the branch (feature `appointment-time-slot`), **When** create is attempted, **Then** the request fails with a `ValidationError`.
8. **Given** `scheduledDate` in the past and a non-AM/OP actor, **When** create is attempted, **Then** the request fails with `APPOINTMENT_PAST_DATE`. AM/OP bypass this check for backfill scenarios.
9. **Given** a CL_USER without `create_appointments` permission, **When** they call create, **Then** the request is rejected with `FORBIDDEN` (via `assertClUserPermission`).
10. **Given** an INSP or TNT actor, **When** they call create, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 2 — Update appointment metadata before release

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

Operators and agency users update mutable fields (contact details, restriction, `keyRequired`, `meetingLocation`, `keyLocation`, `notes`, `customFields`, `scheduledDate`, `timeSlot`) on appointments in `DRAFT` or `AWAITING_INSPECTOR`. Once scheduled, these fields become immutable through this endpoint — changes after `SCHEDULED` must go through tenant portal reschedule flow (feature 007) or operator-forced transitions.

**Independent Test**: Create an appointment in `DRAFT`, patch contact email and `scheduledDate`, confirm updates persist and are audited. Transition to `SCHEDULED` by publishing via feature 005, then attempt another patch → expect `APPOINTMENT_UPDATE_NOT_ALLOWED`.

**Acceptance Scenarios**:

1. **Given** an authorized actor and an appointment in `DRAFT` or `AWAITING_INSPECTOR`, **When** they `PATCH /v1/appointments/:appointmentId` with any subset of mutable fields, **Then** the fields persist and an audit record with `before`/`after` is written.
2. **Given** an appointment in `SCHEDULED`, `DONE`, `CANCELLED`, or `REJECTED`, **When** update is attempted via this endpoint, **Then** the request fails with `APPOINTMENT_UPDATE_NOT_ALLOWED`.
3. **Given** an immutable field (tenant, branch, property, service type, pricing snapshot) in the payload, **When** submitted, **Then** it is silently ignored by the schema.
4. **Given** a CL_USER without the appropriate permission, **When** update is attempted, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 3 — Execute a state transition through the sovereign endpoint

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

Every state transition on an appointment — without exception — goes through `POST /v1/appointments/:appointmentId/status-transitions` backed by `ExecuteStatusTransitionUseCase`. The use case loads the state machine matrix, validates the `(from, to, actor role)` triple, enforces reason requirements, enforces `doneCheckedBy` and inspector requirements, runs service-type-specific tenant-confirmation checks, updates the row, writes an audit record, and fires post-transition side effects (financial entries on `DONE + crossCheck`, notifications on every transition). The endpoint supports `Idempotency-Key` with 24 h retention.

**Why this priority**: The state machine is the sovereign source of truth for appointment lifecycle. Correctness here directly determines the integrity of financial entries, notifications, and SLA tracking.

**Independent Test**: Walk through one representative path end-to-end: `DRAFT → AWAITING_INSPECTOR` (OP/SYS) → group published → `SCHEDULED` (SYS/OP) → `DONE` (INSP) → cross-check (OP) → financial entries created. Confirm each step audits exactly once.

**Acceptance Scenarios**:

1. **Given** an appointment in `DRAFT`, **When** an `OP` or `SYS` actor transitions it to `AWAITING_INSPECTOR` AND the appointment is linked to a service group, **Then** the transition succeeds; without a `service_group_id`, it fails with `APPOINTMENT_SERVICE_GROUP_REQUIRED`.
2. **Given** an appointment in `AWAITING_INSPECTOR` whose service type is `ROUTINE` with `requiresTenantConfirmation = true`, **When** a transition to `SCHEDULED` is attempted with `tenantConfirmationStatus != CONFIRMED`, **Then** the request fails with `APPOINTMENT_TENANT_CONFIRMATION_REQUIRED`. For `INGOING` and `OUTGOING` services, this check is skipped.
3. **Given** a transition to `SCHEDULED` with no existing `inspector_id` on the appointment and no `inspectorId` in the payload, **When** submitted, **Then** the request fails with `APPOINTMENT_INSPECTOR_REQUIRED`.
4. **Given** a sensitive transition (any cancellation, rejection, or reopen), **When** `reason` is missing, **Then** the request fails with `APPOINTMENT_REASON_REQUIRED`.
5. **(Canonical business flow)** **Given** a transition from `SCHEDULED` to `DONE` performed by the `INSP` assigned to the appointment without `doneCheckedByUserId`, **When** submitted, **Then** the transition succeeds, and a second audit record `appointment.done_pending_crosscheck` is written flagging operator review. Financial entries are NOT yet created. The canonical path continues with US4 (explicit cross-check by a different OP/AM).
6. **(Implementation shortcut — not the canonical flow)** **Given** a transition from `SCHEDULED` to `DONE` by `OP` with `doneCheckedByUserId` referencing an AM/OP user distinct from the inspector, **When** submitted, **Then** the transition succeeds, `doneCheckedByUserId` and `doneCheckedAt` are set, and the `onDoneHandler` fires to create financial entries. `IMPLEMENTED (implementation shortcut)` — the code allows combining the DONE transition and cross-check in a single call. This respects the two-person rule (distinct user IDs required) but is not the primary business flow described in the dossiê. The canonical flow is scenario 5 followed by US4.
7. **Given** `doneCheckedByUserId` pointing to a user that is not AM or OP, **When** submitted, **Then** the request fails with `APPOINTMENT_DONE_CHECKER_INVALID_ROLE`.
8. **Given** `doneCheckedByUserId` matching the user behind the inspector that performed the work, **When** submitted, **Then** the request fails with `APPOINTMENT_DONE_CHECKER_SELF_CHECK`.
9. **Given** any transition not listed in `TRANSITION_RULES`, **When** submitted, **Then** the request fails with `APPOINTMENT_INVALID_TRANSITION`.
10. **Given** a valid transition but the caller's role is not in the rule's `allowedActors`, **When** submitted, **Then** the request fails with `APPOINTMENT_TRANSITION_NOT_PERMITTED`. Examples: `DONE → DRAFT` is AM-only; `SCHEDULED → REJECTED` is OP/SYS only.
11. **Given** a `CL_USER` attempting `CANCELLED` or `REJECTED`, **When** submitted, **Then** the request is gated by a tenant-level permission (`cancel_appointments`, `reject_appointments`) via `assertClUserPermission`.
12. **Given** an `INSP` actor, **When** they attempt any transition on an appointment not assigned to them, **Then** the request fails with `APPOINTMENT_ACCESS_DENIED`.
13. **Given** a `DONE → REJECTED` transition by AM, **When** submitted, **Then** an additional audit record `appointment.done_rejected` is written with `requiresFinancialReview: true` metadata for downstream billing review.
14. **Given** an `Idempotency-Key` header on a replay, **When** the cache has a previous result, **Then** the cached result is returned without re-running the state transition.
15. **Given** `cancellationReasonCode` or `rejectionReasonCode` in the payload, **When** transitioning to the matching terminal status, **Then** the typed code is persisted alongside the free-text `reason`.

---

### User Story 4 — Two-person cross-check on DONE appointments

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

An inspector who marks an appointment as `DONE` does not fulfil the financial invariant alone. An operator (OP or AM) must explicitly cross-check via `POST /v1/appointments/:appointmentId/cross-check-done`. The cross-check verifies that (a) the appointment is still in `DONE`, (b) the checker is not the same user who marked it DONE, (c) the inspection execution exists and is finished, (d) the uploaded asset set meets the service type's checklist (min photos, signature if required), and (e) no prior cross-check exists. Only after the cross-check does the platform create the tenant debit and inspector payout financial entries (feature 010). This is the hard precondition from constitution Principle VI.

**Independent Test**: Walk an appointment to `DONE` via the INSP (with evidence uploaded), then call cross-check as a different OP user. Confirm the appointment now has `doneCheckedByUserId` and `doneCheckedAt`, and financial entries are created. Try to cross-check from the same user that marked DONE → expect `APPOINTMENT_DONE_CROSS_CHECK_SELF_APPROVAL`.

**Acceptance Scenarios**:

1. **Given** an appointment in `DONE` with complete evidence and an OP/AM actor distinct from the user who marked it DONE, **When** they `POST /v1/appointments/:appointmentId/cross-check-done`, **Then** `doneCheckedByUserId` and `doneCheckedAt` are set, an `appointment.done_checked` audit record is written, and the `onDoneHandler` creates financial entries.
2. **Given** a non-AM/OP actor, **When** they call cross-check, **Then** the request is rejected with `APPOINTMENT_DONE_CROSS_CHECK_NOT_PERMITTED`.
3. **Given** an appointment not in `DONE`, **When** cross-check is attempted, **Then** the request fails with `APPOINTMENT_DONE_CROSS_CHECK_INVALID_STATUS`.
4. **Given** an appointment already cross-checked (`doneCheckedAt` or `doneCheckedByUserId` set), **When** cross-check is re-attempted, **Then** the request fails with `APPOINTMENT_DONE_CROSS_CHECK_ALREADY_COMPLETED`.
5. **Given** the actor is the same user who marked the appointment DONE (inferred via audit log scan), **When** cross-check is attempted, **Then** the request fails with `APPOINTMENT_DONE_CROSS_CHECK_SELF_APPROVAL`.
6. **Given** no inspection execution exists or the execution is not finished, **When** cross-check is attempted, **Then** the request fails with `APPOINTMENT_DONE_CROSS_CHECK_EVIDENCE_INCOMPLETE`.
7. **Given** uploaded assets do not satisfy the service type's checklist (`minPhotos`, `requiresSignature`), **When** cross-check is attempted, **Then** the request fails with `APPOINTMENT_DONE_CROSS_CHECK_EVIDENCE_INCOMPLETE`.
8. **Given** the audit log has no entry showing who marked DONE, **When** cross-check is attempted, **Then** the request fails with `APPOINTMENT_DONE_CROSS_CHECK_ORIGIN_NOT_FOUND`.

---

### User Story 5 — Force manual tenant confirmation

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

An operator may override the tenant portal confirmation flow and directly mark an appointment's `tenantConfirmationStatus` as `CONFIRMED` — for example, when the renter confirmed by phone or email outside the platform. A reason is required and audited. CL_USER can do this only if the tenant grants the `force_confirmation` permission.

**Independent Test**: Create an appointment with `tenantConfirmationStatus = PENDING`. Call `POST /v1/appointments/:id/force-confirmation` with `{ tenantConfirmationStatus: "CONFIRMED", reason: "Phone call" }`. Confirm the field flips and an audit record carries the reason.

**Acceptance Scenarios**:

1. **Given** an AM or OP, **When** they call force-confirmation with a reason, **Then** the field is set to `CONFIRMED` and an audit record `appointment.force_manual_confirmation` is written.
2. **Given** a CL_USER with the `force_confirmation` permission, **When** they call the endpoint, **Then** the request succeeds.
3. **Given** a CL_USER without the permission, **When** they call the endpoint, **Then** the request is rejected with `FORBIDDEN`.
4. **Given** any other role, **When** they call the endpoint, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 6 — List, filter, and read appointments

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

Any authorized user lists appointments with filters (tenant, branch, status, date range, service type, service group, inspector, search) and reads a single appointment with all its linked entities (contact, restrictions, property, etc.). AM can cross-tenant filter; OP is scoped to own tenant; client roles are locked to their own tenant. Inspectors see only appointments assigned to them.

**Independent Test**: Seed 20 appointments across 2 tenants and 3 statuses. Exercise each filter. As CL_ADMIN, verify only own tenant rows are returned. As INSP, verify only assigned rows are returned.

**Acceptance Scenarios**:

1. **Given** an AM actor, **When** they call `GET /v1/appointments` with `tenantId` and `status` filters, **Then** only matching rows are returned. OP is automatically scoped to own tenant.
2. **Given** a CL_ADMIN or CL_USER, **When** they call list, **Then** only own-tenant rows are returned regardless of `tenantId` filter.
3. **Given** an `INSP` actor, **When** they call list, **Then** only appointments with `inspector_id = actor.inspectorId` are returned.
4. **Given** any authorized actor, **When** they call `GET /v1/appointments/:appointmentId`, **Then** the detail response includes the linked property, contact, restrictions, pricing snapshot, and status.
5. **Given** a CL_USER attempting to read an appointment outside their tenant, **When** they call get-by-id, **Then** the request returns `APPOINTMENT_NOT_FOUND` (not `FORBIDDEN`, to avoid existence leakage).

---

### User Story 7 — Bulk import appointments from XLSX or CSV

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

AM, OP, or CL_ADMIN upload a spreadsheet to create many appointments at once. The endpoint mirrors the property import flow: `multipart/form-data`, mandatory `Idempotency-Key` header, rate-limited to 5 requests per minute. The file is stored in Supabase Storage, an `AppointmentImport` row is created in `PENDING`, and a worker parses rows, creates appointments (inline property creation supported), and updates progress counters + `errors_json`.

**Independent Test**: Upload a 10-row XLSX with 2 invalid rows. Poll `GET /v1/appointments/import/:importId` until `status = DONE` with `successCount = 8`, `errorCount = 2`.

**Acceptance Scenarios**:

1. **Given** an authorized actor, a valid file, and an `Idempotency-Key` header, **When** they `POST /v1/appointments/import`, **Then** the response is `202 Accepted` with `importId` and `PENDING` status, the file is uploaded to storage, and a worker is enqueued.
2. **Given** no `Idempotency-Key`, **When** the upload is attempted, **Then** the request fails with `VALIDATION_ERROR`.
3. **Given** a replayed request with the same key, **When** submitted, **Then** the cached result is returned (note: the same payload-hash verification gap exists here as in 003#GAP-006 — tracked as GAP-004 of this feature).
4. **Given** the endpoint is called more than 5 times in a minute, **When** the cap is reached, **Then** the request is rejected with `429`.
5. **Given** any authorized actor, **When** they call `GET /v1/appointments/import/:importId`, **Then** the progress counters and row-level errors are returned.

---

### Edge Cases

- **DONE without cross-check**: the appointment is persisted as `DONE` but an auxiliary audit record `appointment.done_pending_crosscheck` flags it for operator review. Financial entries are NOT created until `PerformCrossCheckUseCase` runs. This is the "pending review" state from the dossier.
- **Financial side effect failure**: if `onDoneHandler` throws after the transition is persisted, the error is swallowed — the status change remains valid and an operator can re-create the financial entry via the billing API. This prioritizes state-machine integrity over side-effect completeness.
- **Cross-check origin lookup**: the use case scans the audit log for the most recent `status_transition` whose `after.status === 'DONE'` to determine who marked it. If no record exists (seed data or audit gap), it fails with `APPOINTMENT_DONE_CROSS_CHECK_ORIGIN_NOT_FOUND` — do not guess.
- **DONE → REJECTED**: only AM can perform this, and an extra audit record flags it for financial review because the tenant may have already been debited.
- **Past dates for AM/OP**: intentionally allowed for backfill. All other roles are blocked at creation time.
- **`AWAITING_INSPECTOR` requires a service group**: direct DRAFT→AWAITING_INSPECTOR transitions are blocked unless `service_group_id` is set. The normal path is through feature 005-service-groups-marketplace which sets the link and then transitions via this use case.
- **Reason codes**: `cancellationReasonCode` and `rejectionReasonCode` are free-text columns; there is no enum validation in the database. Shared schemas treat them as opaque strings.
- **Soft delete**: appointments have a `deleted_at` column but no current use case performs the delete. Tracked as GAP-005.
- **Tenant portal reschedule**: changes to `scheduledDate` / `timeSlot` after `SCHEDULED` happen through the tenant portal flow (feature 007) which re-opens the appointment to `DRAFT` or `AWAITING_INSPECTOR` before applying the change. This feature's PATCH endpoint refuses post-schedule updates on purpose.

## Requirements

### Functional Requirements

All FRs below are `Status: IMPLEMENTED, Source: code` unless otherwise noted.

#### Creation & Update

- **FR-001**: System MUST resolve `tenantId` from the branch for AM/OP and from the JWT for CL_ADMIN/CL_USER. Client roles can never override `tenantId` via payload.
- **FR-002**: System MUST reject appointments against inactive branches, foreign-tenant properties, inactive service types, and unavailable time slots.
- **FR-003**: System MUST resolve the effective pricing rule via `resolvePricingRule` and refuse creation with `APPOINTMENT_NO_PRICE_RULE` when no active rule exists for `(tenant, service type)`.
- **FR-004**: System MUST persist an immutable `pricing_rule_snapshot_json`, `price_amount`, and `payout_amount` at creation time. Subsequent changes to the pricing rule do not affect existing appointments.
- **FR-005**: System MUST allow updates only on `DRAFT` or `AWAITING_INSPECTOR` via the PATCH endpoint; other states require a state transition to re-open the appointment.
- **FR-006**: System MUST reject creation for non-AM/OP actors when `scheduledDate < today` (UTC).

#### State Machine

- **FR-010** (**sovereign**): All state transitions MUST go through `ExecuteStatusTransitionUseCase` (plus `PerformCrossCheckUseCase` for the two-person rule). Direct DB writes to `appointments.status` are forbidden outside Prisma migrations.
- **FR-011**: System MUST enforce the 14 transitions listed in `TRANSITION_RULES` (see [`data-model.md`](./data-model.md)). Any `(from, to)` outside the matrix fails with `APPOINTMENT_INVALID_TRANSITION`.
- **FR-012**: System MUST validate `allowedActors` per transition. Any role mismatch fails with `APPOINTMENT_TRANSITION_NOT_PERMITTED`.
- **FR-013**: System MUST require `reason` for every transition marked `requiresReason = true` in the rule. Missing reason fails with `APPOINTMENT_REASON_REQUIRED`.
- **FR-014** (`Status: IMPLEMENTED (implementation decision), Source: code`): System MUST require a service group link before transitioning `DRAFT -> AWAITING_INSPECTOR` (`APPOINTMENT_SERVICE_GROUP_REQUIRED`). Note: the dossier allows `AWAITING_INSPECTOR` without a service group (e.g., for direct assignment flows); this requirement is an implementation decision in the current codebase, not a dossier mandate.
- **FR-015**: System MUST require tenant confirmation for `ROUTINE` service types with `requiresTenantConfirmation = true` before allowing `AWAITING_INSPECTOR → SCHEDULED`. `INGOING` and `OUTGOING` flow types bypass this check.
- **FR-016**: System MUST require an inspector assignment (from payload or pre-existing) for any transition into `SCHEDULED`.
- **FR-017**: System MUST enforce `CL_USER` permissions (`cancel_appointments`, `reject_appointments`) via `assertClUserPermission` for cancellation and rejection transitions.
- **FR-018**: System MUST block `INSP` actors from transitioning appointments that are not assigned to them (`APPOINTMENT_ACCESS_DENIED`).
- **FR-019**: System MUST clear `reason`, `doneCheckedByUserId`, and `doneCheckedAt` when reopening from `DONE` to `DRAFT`.
- **FR-020**: System MUST persist typed `cancellation_reason_code` / `rejection_reason_code` when provided, alongside the free-text `reason`.
- **FR-021**: System MUST honor an `Idempotency-Key` header on status transitions with 24 h retention and scope `status-transition`.

#### Two-Person Cross-Check (Hard Precondition for Finance)

- **FR-030**: System MUST restrict `PerformCrossCheckUseCase` to AM or OP.
- **FR-031**: System MUST require the appointment to be in `DONE` at cross-check time.
- **FR-032**: System MUST refuse to cross-check an appointment whose `doneCheckedByUserId` or `doneCheckedAt` is already set.
- **FR-033**: System MUST identify the user who marked the appointment `DONE` via the audit log and refuse cross-check if that user is the same as the actor (`APPOINTMENT_DONE_CROSS_CHECK_SELF_APPROVAL`).
- **FR-034**: System MUST verify the linked `InspectionExecution` exists and is finished; else fail with `APPOINTMENT_DONE_CROSS_CHECK_EVIDENCE_INCOMPLETE`.
- **FR-035**: System MUST verify the uploaded assets meet the service type's checklist (`minPhotos`, `requiresSignature`); else fail with `APPOINTMENT_DONE_CROSS_CHECK_EVIDENCE_INCOMPLETE`.
- **FR-036**: System MUST write `doneCheckedByUserId`, `doneCheckedAt`, and an `appointment.done_checked` audit record on success.
- **FR-037**: System MUST fire `onDoneHandler` after cross-check to create financial entries (feature 010). Handler failure is logged but does not fail the cross-check.

#### Force Manual Confirmation

- **FR-040**: System MUST restrict `ForceManualTenantConfirmationUseCase` to AM, OP, or CL_USER with the `force_confirmation` permission.
- **FR-041**: System MUST require a reason and audit it with action `appointment.force_manual_confirmation`.

#### List, Read, Contacts

- **FR-050**: System MUST scope list and read by tenant for client roles and by inspector assignment for INSP.
- **FR-051**: System MUST return `APPOINTMENT_NOT_FOUND` (not `FORBIDDEN`) on cross-tenant read attempts by client roles to prevent existence leakage.
- **FR-052**: System MUST expose `GET /v1/appointment-contacts` as a paginated view over all appointment contacts for operator CRM workflows, scoped by tenant.

#### Bulk Import

- **FR-060**: System MUST restrict `POST /v1/appointments/import` to AM, OP, CL_ADMIN.
- **FR-061**: System MUST require an `Idempotency-Key` header and rate-limit to 5 req/min per client.
- **FR-062**: System MUST accept `.xlsx` and `.csv` files; other extensions are rejected.
- **FR-063**: System MUST store the file at `imports/appointments/<importId>/<filename>` via `IReportStorageService`.
- **FR-064**: System MUST enqueue an `appointment.import` worker and update the `AppointmentImport` row with `status`, `successCount`, `errorCount`, `errorsJson` as processing runs.

#### Cross-cutting

- **FR-070**: System MUST audit every `appointment.created`, `appointment.updated`, `appointment.status_transition`, `appointment.done_pending_crosscheck`, `appointment.done_checked`, `appointment.done_rejected`, `appointment.force_manual_confirmation`, and `appointment.imported` event.
- **FR-071**: System MUST validate all payloads against Zod schemas in `packages/shared/src/schemas/appointment.ts`.

### Non-Functional Requirements

- **NFR-001** (`Status: APPROVED, Source: dossier`): Create, read, and list p95 < 300 ms; state transition p95 < 400 ms (including audit write); cross-check p95 < 500 ms (audit log lookup dominates).
- **NFR-002** (`Status: APPROVED, Source: dossier`): Financial entries MUST be created only after cross-check — never during the DONE transition alone. This is a hard precondition.
- **NFR-003** (`Status: APPROVED, Source: dossier`): Every mutation of `appointments.status` without an audit record is a bug, regardless of circumstance.
- **NFR-004** (`Status: IMPLEMENTED, Source: code`): All list endpoints paginate; no unbounded reads.

### Key Entities

- **Appointment** — central entity with `appointment_number` (autoincrement, unique), tenant + branch + property + service type FKs, optional inspector and service group, status, scheduled date, time slot, key/location metadata, tenant confirmation status, pricing snapshot, reason fields, `done_checked_by_user_id` + `done_checked_at`, timestamps + soft delete.
- **AppointmentContact** — one-to-one, cascades with appointment. Holds renter name, emails, phones.
- **AppointmentRestriction** — many-to-one. Captures unavailable days/hours and whether the renter is at home.
- **AppointmentImport** — bulk import job row; same shape as `PropertyImport`.
- **AppointmentStateMachine** (domain) — in-memory matrix + `validateTransition` helper.
- **appointment-pricing.service.ts** — pure functions `snapshotPricing` and `calculatePayoutAmount` used at creation time.

Full schema and invariants in [`data-model.md`](./data-model.md). HTTP contracts in [`contracts/`](./contracts/).

## Success Criteria

- **SC-001**: 100% of appointment state changes flow through `ExecuteStatusTransitionUseCase` or `PerformCrossCheckUseCase`. Verified by repo-wide grep and a code-review gate.
- **SC-002**: Every state transition produces exactly one `appointment.status_transition` audit record. Side-effect audits (`done_pending_crosscheck`, `done_rejected`) are extras and are asserted separately.
- **SC-003**: Financial entries are created iff the appointment reaches `DONE` AND `doneCheckedByUserId` is non-null. Verified by integration tests that assert the billing table is empty before cross-check and populated after.
- **SC-004**: Cross-check cannot be self-approved. An integration test where the INSP's linked user is also an AM tries to cross-check themselves → fails with `APPOINTMENT_DONE_CROSS_CHECK_SELF_APPROVAL`.
- **SC-005**: All 14 transitions in `TRANSITION_RULES` have at least one happy-path and one negative-path integration test.
- **SC-006**: `ROUTINE + requiresTenantConfirmation` is enforced on `AWAITING_INSPECTOR → SCHEDULED` and bypassed for `INGOING`/`OUTGOING` — asserted by integration tests.
- **SC-007**: Idempotent replay of status transitions returns the cached result without re-running side effects. An integration test submits the same key twice and asserts financial entries appear exactly once.

## Assumptions

- One property per appointment. Multi-property jobs are modeled as separate appointments bundled into a service group.
- `appointment_number` is an autoincrement integer — globally unique, not per tenant. Used as a human-readable reference in the UI.
- The pricing snapshot is immutable. Any pricing change after creation requires cancelling and recreating the appointment.
- Notifications are fired by `onTransitionHandler` (fire-and-forget); failure to notify does not fail the transition.
- The audit log is append-only and authoritative for cross-check origin lookup. Any future audit retention policy must not delete `appointment.status_transition` entries for appointments that still lack cross-check.
- `cancellation_reason_code` and `rejection_reason_code` are free-form strings in Phase 1; a typed enum is Phase 2 work (GAP-002).

## Known Gaps

> Summary index only. Detail in [`tasks.md`](./tasks.md) under Phase 2.

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Typed reason codes | ~~Free-form strings.~~ **IMPLEMENTED** (Wave 1). | `CancellationReasonCode` + `RejectionReasonCode` enums in shared. Zod `nativeEnum` validation. 7 schema tests. |
| GAP-002 | Financial compensation on DONE→REJECTED | ~~Manual reversal only.~~ **IMPLEMENTED** (Wave 3). | `CompensateFinancialOnDoneRejectedHandler` via `appointment.done_rejected.v1` event. Creates REFUND + MANUAL_ADJUSTMENT. Idempotent. 9 tests. |
| GAP-003 | Reschedule handoff protocol | ~~Undocumented mix of force-confirmation and updates.~~ **IMPLEMENTED** (Wave 3). | `ReopenForRescheduleUseCase` (SCHEDULED→DRAFT atomically). Design doc. SYS/AM/OP actors. 15 tests. |
| GAP-004 | Import idempotency verification | ~~Silent cache on different file.~~ **IMPLEMENTED** (Wave 2). | SHA-256 file hash + `getWithHash()`. Mismatch → 409. Same pattern as 003#GAP-006. 3 tests. |
| GAP-005 | Appointment soft-delete | ~~No delete path.~~ **IMPLEMENTED** (Wave 2). | `DeleteAppointmentUseCase` AM-only, DRAFT-only. Sets `deleted_at`. Route `DELETE /v1/appointments/:id`. 6 tests. |
| GAP-006 | Typed transition event contract | ~~Loose handler interface.~~ **IMPLEMENTED** (Wave 3). | `AppointmentTransitionEvent` in shared types. `APPOINTMENT_EVENTS` constants. Events emitted via DomainEventBus. 9 tests. |
| GAP-007 | CL_USER permission set schema | ~~Untyped strings.~~ **IMPLEMENTED** (Wave 1). | Already resolved by 001#GAP-003 (`ClUserPermission` type + `AuthorizationService`). Compile-time enforcement. |
| GAP-008 | Appointment number runbook | ~~No reset procedure.~~ **IMPLEMENTED** (Wave 1). | Runbook at `docs/runbooks/appointment-number-reset.md`. Decision: global numbering sufficient. |
| GAP-009 | done_marked_by_user_id column | ~~Audit scan for cross-check.~~ **IMPLEMENTED** (Wave 2). | Column set on DONE transition. Cross-check reads column first, falls back to audit scan. Migration + backfill. 7 tests. |
| GAP-010 | Compound DONE + cross-check | ~~Two separate calls.~~ **IMPLEMENTED** (Wave 2). | `crossCheckByUserId` on status-transition. Atomic DONE + cross-check. Self-check rejected. 6 tests. |
