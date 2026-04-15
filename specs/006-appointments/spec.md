# Feature Specification: Appointments

**Feature Branch**: `006-appointments`
**Created**: 2026-04-05
**Feature Status**: IMPLEMENTED — Phase 1 shipped; Phase 2 gaps + 1 correction closed in commit `1c6aa70` (2026-04-07, Waves 1–3). The 006 cross-check origin lookup invariant is preserved end-to-end by feature 020 (non-disableable inline preservation rule in `AuditRetentionWorker.isCrossCheckPreserved`). Editorial reconciliation 2026-04-13. See `specs/GAPS.md` for the gap status table.
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
- **Status**: IMPLEMENTED (Feedback Round 2026-04-13 item 4 extends the contact model — pending planning)
- **Source**: code + approved feedback round

An operator (AM, OP) or agency user (CL_ADMIN, CL_USER with `create_appointments` permission) creates a new appointment under an active tenant + branch. The appointment links to an existing property (or creates one inline), carries **one or more contacts from the tenant's contact registry** (feature 021), optional restrictions (unavailable days/hours, isHome flag), and an immutable snapshot of the resolved pricing rule. On create, the appointment starts in `DRAFT` status with `tenantConfirmationStatus = PENDING`.

**Feedback Round 2026-04-13 — item 4 (multiple tenant contacts) + feature 021 architectural revision** — APPROVED, pending planning:

- Contacts are now a **per-tenant registry** (feature 021). The appointment contact model moves from embedded inline fields to a **junction + snapshot** pattern:
  - Each contact in the appointment payload is either a `contactId` reference to an existing registry contact, or an `inline` object that creates a new registry contact and links it in a single request.
  - On linkage, `display_name`, `primary_email`, and `primary_phone` are frozen into snapshot fields on the junction row. These snapshots are the audit-safe record of who was contacted at appointment creation time.
  - Each junction row carries a contextual `role` (enum: `TENANT | TENANT_REPRESENTATIVE | HOUSEKEEPER | PROPERTY_MANAGER | BROKER | OTHER`) and an `is_primary` flag.
  - Exactly one contact per appointment MUST be `is_primary = true`.
- **Multiple channels** (additional emails and phones) are stored on the `contacts` registry entity (feature 021), NOT on the appointment junction. The junction snapshot captures only the primary channel per contact.
- The appointment detail response, appointment list, tenant-portal token delivery, and PWA Job Details (feature 008 FR-023) all read the contact list in `is_primary = true, then insertion order` order.
- Tenant portal notifications are sent to the **primary** contact's `snapshot_email` only by default. Whether operators can opt to send to all contacts is a product question tracked as GAP-011 (below) — not blocking this round.
- Feature 007 (tenant portal) token generation retains its current shape: one token per appointment, bound to the primary contact. Separate per-contact tokens are out of scope.
- **Migration strategy**: see `specs/006-appointments/data-model.md` and `specs/021-contacts/data-model.md` for the coordinated expand/contract plan.

> **Feedback Round 2026-04-13** — see `specs/feedback-rounds/2026-04-13-customer-feedback-round-1.md` → item 4.
> **Feature 021** — see `specs/021-contacts/spec.md` for the contact registry architecture.

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
- **Status**: IMPLEMENTED (Feedback Round 2026-04-13 item 10 adds a sticky search filter — pending planning; it is a UX delta on an existing surface, no new backend semantics)
- **Source**: code + approved feedback round

Any authorized user lists appointments with filters (tenant, branch, status, date range, service type, service group, inspector, search) and reads a single appointment with all its linked entities (contact, restrictions, property, etc.). AM can cross-tenant filter; OP is scoped to own tenant; client roles are locked to their own tenant. Inspectors see only appointments assigned to them.

**Feedback Round 2026-04-13 — item 10 (sticky top search filter)** — APPROVED, pending planning:

- The appointments list UI MUST render a full-text search field as the **first** item of the filter bar (before tenant / branch / status / etc.).
- The search field + the filter row containing it MUST remain **sticky** at the top of the scroll container while the operator scrolls through results. This is a UX-level expectation, not just a visual observation: when you scroll the table, the filter row anchors and the search input stays reachable without scrolling back up.
- No change to the backend search contract — the existing `search` query parameter in `GET /v1/appointments` (feature 006 FR-050) continues to serve the feature. This is a pure frontend delta.
- Same pattern applies transversally to other major list screens via feature 014's UX pattern library (see feature 014 update).

**Inherited UX patterns from feature 014** (Feedback Round 2026-04-13, sanity-check corrective pass):

- **FR-019a (sticky search + first-filter)**: the appointments list inherits the sticky-top search pattern declared in feature 014 FR-019a. This is the backend-visible source-of-truth for item 10 above.
- **FR-019b (pencil removal when duplicated with eye)**: the appointments list row exposes a single "view" action (eye) that opens the detail drawer where edit lives as a secondary affordance. The row-level "edit" (pencil) action MUST NOT be rendered. Inherited transversally from feature 014 FR-019b — no per-spec override.

> **Feedback Round 2026-04-13** — see `specs/feedback-rounds/2026-04-13-customer-feedback-round-1.md` → item 10 (sticky search) and item 11 (pencil removal).

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
- **Status**: IMPLEMENTED (Feedback Round 2026-04-13 item 12 adds a downloadable template file on the import UI — pending planning, pure frontend delta)
- **Source**: code + approved feedback round

AM, OP, or CL_ADMIN upload a spreadsheet to create many appointments at once. The endpoint mirrors the property import flow: `multipart/form-data`, mandatory `Idempotency-Key` header, rate-limited to 5 requests per minute. The file is stored in Supabase Storage, an `AppointmentImport` row is created in `PENDING`, and a worker parses rows, creates appointments (inline property creation supported), and updates progress counters + `errors_json`.

**Feedback Round 2026-04-13 — item 12 (import template file)** — APPROVED, pending planning:

- The appointment import screen MUST expose a **"Download template"** affordance next to the file-upload control.
- The template file is a static XLSX (or CSV — both formats acceptable) whose columns match exactly what the importer expects. Columns MUST include: `branchName`, `propertyCode`, `serviceTypeCode`, `scheduledDate`, `timeSlotLabel`, `keyRequired`, `primaryContactName`, `primaryContactEmail`, `primaryContactPhone`, plus the `notes` column. After item 4 lands, the template SHOULD also include `additionalEmails` (comma-separated) and `additionalPhones` (comma-separated) columns — the importer's current contract will need to absorb those during the plan phase for item 4.
- The template does not change the importer's parser. It is a UX affordance + a committed file under a known repo path. Suggested location: `apps/web/public/templates/appointments-import-template.xlsx` (exact path is a plan-phase decision, not a spec constraint).
- Same pattern applies transversally to other import screens via feature 014's UX pattern library.

> **Feedback Round 2026-04-13** — see `specs/feedback-rounds/2026-04-13-customer-feedback-round-1.md` → item 12.

**Independent Test**: Upload a 10-row XLSX with 2 invalid rows. Poll `GET /v1/appointments/import/:importId` until `status = DONE` with `successCount = 8`, `errorCount = 2`.

**Acceptance Scenarios**:

1. **Given** an authorized actor, a valid file, and an `Idempotency-Key` header, **When** they `POST /v1/appointments/import`, **Then** the response is `202 Accepted` with `importId` and `PENDING` status, the file is uploaded to storage, and a worker is enqueued.
2. **Given** no `Idempotency-Key`, **When** the upload is attempted, **Then** the request fails with `VALIDATION_ERROR`.
3. **Given** a replayed request with the same key, **When** submitted, **Then** the cached result is returned (note: the same payload-hash verification gap exists here as in 003#GAP-006 — tracked as GAP-004 of this feature).
4. **Given** the endpoint is called more than 5 times in a minute, **When** the cap is reached, **Then** the request is rejected with `429`.
5. **Given** any authorized actor, **When** they call `GET /v1/appointments/import/:importId`, **Then** the progress counters and row-level errors are returned.

---

### User Story 8 — Bulk edit specific fields on appointments

- **Priority**: P2 (added by Feedback Round 2026-04-13, item 7)
- **Status**: NEW — pending planning
- **Source**: approved feedback round

From the appointments list, operators select multiple rows via checkbox and apply the same change to a specific set of fields in a single action. This is deliberately **not** a generic bulk edit — the list of editable fields is enumerated and each carries guardrails.

**Why this priority**: bulk edit is a high-value operational tool for operators managing many appointments per day. Scoping it narrowly reduces the risk of mass errors.

**Independent Test**: Seed 10 appointments in `DRAFT` with different branches and inspectors. Select 5 via the UI, submit a bulk edit changing `branchId` and `assignedInspectorId` in one request. Verify the 5 rows are updated, each one generates an audit record with `before`/`after`, and the other 5 are untouched.

**Acceptance Scenarios**:

1. **Given** an AM or OP actor with 10 appointment ids, **When** they `POST /v1/appointments/bulk-edit` with `{ ids, changes }` where `changes` only contains fields from the **allowed bulk-edit set** below, **Then** the changes are applied atomically per row, each row writes a distinct audit record, and the response returns a summary `{ updated, failed[] }` with per-row outcomes.
2. **Given** any appointment in the id list is in a status that does not allow the requested change (e.g., trying to bulk-change `scheduledDate` on a `DONE` appointment), **When** submitted, **Then** that specific row fails with a typed error code and is reported in `failed[]`; other rows still apply.
3. **Given** a field that is NOT in the allowed bulk-edit set (e.g., `status`, `notes`, `priceAmount`), **When** submitted, **Then** the whole request fails with `APPOINTMENT_BULK_FIELD_NOT_ALLOWED` before any row is touched.
4. **Given** `changes` affecting more than 100 appointments in a single call, **When** submitted, **Then** the request fails with `APPOINTMENT_BULK_LIMIT_EXCEEDED` (operator must split into batches).
5. **Given** a CL_ADMIN, CL_USER, INSP, or TNT actor, **When** they call bulk edit, **Then** the request is rejected with `FORBIDDEN`. CL_USER bulk-edit is explicitly deferred pending a dedicated CL_USER permission flag.
6. **Given** two concurrent bulk-edit requests touching overlapping ids, **When** both run, **Then** each appointment is updated atomically; the later writer wins per-field. No row is left in an inconsistent state.

**Allowed bulk-edit field set (initial, this round)**:

| Field | Allowed | Guardrails |
|---|---|---|
| `assignedInspectorId` | ✅ | Target inspector MUST be active and NOT in the tenant's `blocked_clients_json` (feature 008 FR-006a). Appointments already in `DONE`/`REJECTED`/`CANCELLED` are rejected with a per-row error. |
| `scheduledDate` | ✅ | Must not be in the past for non-AM/OP actors. Only applies to appointments in `DRAFT` or `AWAITING_INSPECTOR` (the existing PATCH constraint from US2 FR-005 applies). |
| `timeSlot` | ✅ | Same constraints as `scheduledDate` (same PATCH rule). The slot must belong to the branch's effective catalog. |
| `branchId` | ✅ | Only applies to appointments in `DRAFT`. Moving a branch mid-flow invalidates derived state; rows not in `DRAFT` fail with `APPOINTMENT_BULK_BRANCH_CHANGE_NOT_ALLOWED`. |
| `serviceTypeId` | ✅ | Only `DRAFT`. Requires re-resolving the pricing rule; rows where no active rule exists fail per-row with `APPOINTMENT_NO_PRICE_RULE`. The new pricing snapshot is computed and persisted. |
| `propertyManagerContactId` | ✅ | Must reference an existing active `contacts.id` (feature 021) with `type = PROPERTY_MANAGER` (or `BROKER`) belonging to the appointment's tenant. The bulk-edit use case creates or updates the `appointment_contacts` junction row with `role = PROPERTY_MANAGER`, snapshotting the contact's current name/email/phone. |
| `status` | ❌ **EXCLUDED** — `OPEN QUESTION — OQ-4` | Bulk status transitions are dangerous because each transition has per-transition guardrails (reason required, role required, side effects like financial entries). The feedback round explicitly defers this to a future decision. |
| `notes` / internal `notes` | ❌ **EXCLUDED** — `OPEN QUESTION — OQ-4` | Semantic ambiguity: append vs overwrite vs prompt-per-row. Overwrite would silently destroy existing notes, append changes the UX. Deferred. |
| All other fields | ❌ | Not in scope for this round. Any future expansion of the allowed set requires a new spec update. |

**Scope boundary — what this is NOT**:
- Not a generic "edit anything on any appointment at scale" endpoint.
- Not a background job — the initial implementation runs synchronously per row inside a single transaction per row, with the request returning when all rows are processed. If this becomes a performance problem (200+ ids), it can be moved to a worker in a follow-up round, not this one.
- Not a way to bypass the state machine. `status` is not in the allowed set specifically to enforce that.

> **Feedback Round 2026-04-13** — see `specs/feedback-rounds/2026-04-13-customer-feedback-round-1.md` → item 7 + OQ-4.

---

### User Story 9 — Reject an already-scheduled appointment (UI surface)

- **Priority**: P2 (added by Feedback Round 2026-04-13, item 8)
- **Status**: **Backend ALIGNMENT** — the state-machine transition `SCHEDULED → REJECTED` already exists in `apps/backend/src/modules/appointment/domain/appointment-state-machine.ts` (allowed actors `OP, SYS`, mandatory reason). **Frontend NEW** — the `Appointments > Scheduled > Full detail` drawer must expose a Reject affordance.
- **Source**: code (backend) + approved feedback round (frontend UI gap)

From `Appointments > Scheduled > Full detail`, an operator explicitly rejects an appointment that has already been scheduled but that can no longer proceed (e.g., property became inaccessible, inspector decommissioned, regulatory issue surfaced). This transition is `SCHEDULED → REJECTED` with a mandatory reason. Side effects mirror `DRAFT → REJECTED`: no financial entries (the appointment never reached `DONE`), marketplace cleanup if a service group was involved, a rejection notification to the tenant via feature 007.

**What's actually changing (important clarity)**:

- **Backend**: nothing. The transition is already there — `appointment-state-machine.ts` rule at `from: 'SCHEDULED', to: 'REJECTED'` with allowed actors `['OP', 'SYS']` and `requiresReason: true`. Side effects (service group cleanup, tenant portal token revocation, no financial entry) fire through the same existing handlers used by `DRAFT → REJECTED` and `AWAITING_INSPECTOR → REJECTED`.
- **Frontend**: the scheduled-appointment drawer on the web Appointments list is missing the Reject button. The plan-phase must add it. The button wires to the existing `POST /v1/appointments/:id/status-transitions` endpoint with `{ targetStatus: 'REJECTED', reason, rejectionReasonCode }`.
- **Docs**: the root-level `CLAUDE.md` transition table is cosmetic — check whether it lists the row (data-model.md already does), and update if not.

**Why this priority**: operators already have ways to cancel a scheduled appointment (`SCHEDULED → CANCELLED`), but cancellation and rejection carry different operational semantics in the dossier. Rejection flags the appointment as not-executable for a structural reason, not a cancellation-by-the-tenant.

**Independent Test**: Create a `SCHEDULED` appointment with an assigned inspector and a linked service group. As OP, `POST /v1/appointments/:id/status-transitions` with `{ targetStatus: 'REJECTED', reason: '...' }` and optionally `rejectionReasonCode`. Confirm the appointment transitions, a reason is persisted, an audit record is written, and the service group row is removed from the marketplace surface.

**Acceptance Scenarios**:

1. **Given** an appointment in `SCHEDULED` and an OP, AM, or SYS actor, **When** they submit the transition with `reason` populated, **Then** the appointment transitions to `REJECTED`, `rejection_reason_code` is persisted if provided, and an audit record is written.
2. **Given** an appointment in `SCHEDULED` and a CL_ADMIN / CL_USER / INSP / TNT actor, **When** the transition is attempted, **Then** the request fails with `APPOINTMENT_TRANSITION_NOT_PERMITTED`.
3. **Given** the transition payload is missing `reason`, **When** submitted, **Then** the request fails with `APPOINTMENT_REASON_REQUIRED` (sensitive-transition rule).
4. **Given** a rejected appointment that was linked to an active service group, **When** the transition completes, **Then** the service group cleanup handler fires the same way it does for other cancellation/rejection paths (no new side-effect code — reuses feature 005 plumbing).
5. **Given** a rejected appointment with a primary contact and an active tenant portal token, **When** the transition completes, **Then** feature 007 fires the rejection notification and revokes the token.

**Scope boundary — what this is NOT**:
- Not a re-open path. Once in `REJECTED`, existing rules apply — only AM can reopen to `DRAFT`.
- Not a financial undo. No financial entries exist yet at `SCHEDULED`, so there's nothing to reverse.
- Not a different flavour of cancellation. `CANCELLED` and `REJECTED` remain distinct semantic categories per the dossiê; this round only widens the allowed source of `REJECTED` to include `SCHEDULED`.

> **Feedback Round 2026-04-13** — see `specs/feedback-rounds/2026-04-13-customer-feedback-round-1.md` → item 8.

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
- **FR-004a** (Feedback Round 2026-04-13 item 4 + feature 021 architectural revision, NEW, pending planning): System MUST persist **one or more** `appointment_contacts` junction rows per appointment, each linking to a `contacts` registry entry (feature 021) via `contact_id` and carrying frozen snapshot fields (`snapshot_name`, `snapshot_email`, `snapshot_phone`). Exactly one junction row per appointment MUST have `is_primary = true`. Each junction row carries a contextual `role` (`AppointmentContactRole` enum). The appointment creation payload accepts contacts as `{ contactId, role, isPrimary }` (existing registry contact) or `{ inline: {...}, role, isPrimary }` (create-and-link). Snapshot fields are populated at link time from the registry contact and are NOT updated by subsequent registry edits. Tenant portal notifications (feature 007) and PWA Job Details (feature 008) read the primary contact first, then additional contacts in insertion order. Full junction schema: `specs/006-appointments/data-model.md`. Full registry schema: `specs/021-contacts/data-model.md`.

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
- **FR-022** (Feedback Round 2026-04-13 item 8, **ALIGNMENT — UI gap, not a state-machine change**): The `SCHEDULED → REJECTED` transition is **already accepted** by the backend state machine (`appointment-state-machine.ts` rule 9: allowed actors `OP, SYS`, `requiresReason: true`). The customer feedback was about the **UI affordance** — `Appointments > Scheduled > Full detail` currently has no Reject button, so operators cannot invoke the transition from the natural place. The backend FR-022 is therefore a confirmation that this transition is intentional and must remain in the matrix, plus a pointer that the web frontend needs to render the Reject action on the scheduled-appointment drawer. The root-level `CLAUDE.md` transition table may need a cosmetic update if it doesn't list the row; no code change to the backend is required.

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
- **FR-065** (Feedback Round 2026-04-13 item 12, NEW, pending planning): The appointment import UI MUST expose a "Download template" affordance next to the file-upload control. The template is a static XLSX/CSV file committed under `apps/web/public/templates/` (exact path is a plan-phase decision) whose columns mirror the importer's accepted columns — see US7 for the minimum column set.

#### Bulk Edit (Feedback Round 2026-04-13 item 7, NEW, pending planning)

- **FR-066**: System MUST expose `POST /v1/appointments/bulk-edit` accepting `{ ids: string[], changes: Partial<AllowedBulkFields> }`. Restricted to AM and OP.
- **FR-067**: `AllowedBulkFields` is the enumerated set: `{ assignedInspectorId, scheduledDate, timeSlot, branchId, serviceTypeId, propertyManagerContactId }`. Any other key in `changes` MUST fail the whole request with `APPOINTMENT_BULK_FIELD_NOT_ALLOWED`. `status` and `notes` are explicitly excluded — see OQ-4. `propertyManagerContactId` references a `contacts.id` from the tenant's contact registry (feature 021) with `type = PROPERTY_MANAGER`. The bulk-edit use case creates or updates the `appointment_contacts` junction row with `role = PROPERTY_MANAGER` for each target appointment, snapshotting the contact's current name/email/phone.
- **FR-068**: Per-row guardrails from US8's table MUST be enforced row-by-row: inactive inspectors rejected, blocked-client combinations rejected, past dates rejected for non-AM/OP, status-based eligibility rejected for branch/service-type changes, etc. Failed rows are reported in a `failed[]` array with per-row error codes; other rows still apply.
- **FR-069**: The endpoint MUST enforce a `bulk-edit` maximum of **100 ids per request** (`APPOINTMENT_BULK_LIMIT_EXCEEDED`). Operators must batch larger jobs.
- **FR-069a**: Each successful row MUST generate an individual audit record with `before`/`after`, same shape as single-appointment PATCH. A single bulk-edit of 50 rows produces 50 audit records (not one).

#### PWA Job Details (Feedback Round 2026-04-13 item 3, source of truth for feature 008 FR-023, NEW)

- **FR-080** (Feedback Round 2026-04-13 item 3 + feature 021 architectural revision, NEW, pending planning): The appointment detail read (`GET /v1/appointments/:id` for operators and `GET /v1/inspector/appointments/:id` for INSP) MUST include the fields needed for the PWA Job Details payload: all contacts from the `appointment_contacts` junction (snapshot fields for audit-safe display, plus a JOIN to `contacts` for live data when `contact_id IS NOT NULL`), key info (`key_required`, `key_location`), the property-manager contact (resolved from the junction row with `role = PROPERTY_MANAGER` — the live `contacts` record is used here since inspectors need the PM's current phone number, not the snapshot), pricing snapshot (inspector payout amount + currency), and tenant-level `inspection_app_link` if configured. Feature 008 FR-023 is the PWA-side consumer; this FR is the backend-side producer.

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
- **AppointmentContact** — junction + snapshot table (revised by feature 021). Links an appointment to a `contacts` registry entry via `contact_id` (nullable for legacy rows). Carries frozen `snapshot_name`, `snapshot_email`, `snapshot_phone`, contextual `role` (`AppointmentContactRole` enum), and `is_primary` flag. Multiple rows per appointment; exactly one primary. See `specs/006-appointments/data-model.md`.
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
| GAP-011 | Send tenant portal notifications to all contacts (not just primary) | NEW (Feedback Round 2026-04-13 item 4 sub-issue). | The multi-contact model (feature 021 junction pattern) supports multiple contacts per appointment, but by default only the primary contact's `snapshot_email` receives tenant-portal notifications. Whether operators can opt to fan-out notifications to all junction contacts is a product question deferred to a later round. Feature 021's `contacts` entity has a natural extension point for per-contact notification preferences (021#GAP-003). Not blocking. |
