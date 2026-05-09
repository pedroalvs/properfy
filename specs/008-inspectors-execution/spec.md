# Feature Specification: Inspectors & Execution

**Feature Branch**: `008-inspectors-execution`
**Created**: 2026-04-05
**Feature Status**: IMPLEMENTED — Phase 1 shipped; Phase 2 gaps closed in commit `2226b1d` (2026-04-08, Waves 1–3). Editorial reconciliation 2026-04-13. See `specs/GAPS.md` for the gap status table.
**Sources**:
- Code: `apps/backend/src/modules/{inspector,inspector-execution}/**`, `apps/backend/prisma/schema.prisma`, `packages/shared/src/schemas/{inspector,inspector-execution}.ts`, `apps/web/src/features/inspectors/**`, `apps/pwa/src/features/{schedule,offers}/**`
- Approved rules: `.specify/memory/constitution.md`, `CLAUDE.md`, `projeto-consolidado/regras-negocio-respostas-cliente.md`
- Legacy specs (to be superseded on approval): `specs/backend/inspector-execution.spec.md`, `specs/pwa/execution.spec.md`

> **Scope note.** This feature bundles two backend modules that form one product concern:
>
> 1. **Inspector** — operator-facing CRUD for the Inspector entity, availability slots, region assignment, and linking to a user account for PWA login.
> 2. **Inspector Execution** — PWA-facing flow for inspectors to view their schedule, start an inspection, upload evidence, and finish the inspection (which then triggers the sovereign `SCHEDULED → DONE` transition on the appointment).
>
> They are kept together because the Inspector entity and the execution flow share consumers (appointments, marketplace, billing) and a release cadence.
>
> **Reading guide.** Every user story declares `Priority`, `Status`, `Source`. Status: `IMPLEMENTED` | `APPROVED` | `GAP`. Source: `code` | `dossier` | `inferred`.

## Approved Product Overrides - 2026-05-09

1. The inspector journey explicitly includes:
   - accepting offers,
   - moving accepted work into the operational schedule,
   - marking jobs `DONE`,
   - marking jobs `REJECTED` with reason where the flow allows it,
   - generating or following the inspector invoice flow for the applicable period.
2. Inspector offer visibility and assignment must respect the configured matrix of which service types the inspector may execute for each client.
3. The day-before operational cleanup remains relevant to the inspector product because unconfirmed jobs may disappear from the workable set after the `7:00 PM` cutoff on the previous day.

## User Scenarios & Testing

### User Story 1 — Onboard an inspector (operator)

- **Priority**: P1
- **Status**: IMPLEMENTED (with Feedback Round 2026-04-13 deltas pending planning — items 1 and 6)
- **Source**: code + approved feedback round

An AM or OP creates a new inspector with profile data (name, contact), compliance documents (insurance, police check, ABN, DOB), payment settings, and eligibility configuration (service types they can handle, which client tenants they are **blocked** from — see item 1 below — and regions they cover). The inspector starts in `ACTIVE` status. A user account can be linked later so the inspector can log in to the PWA.

**Independent Test**: As AM, `POST /v1/inspectors` with full payload. Confirm the row exists with the submitted JSON fields and an audit record is written.

**Acceptance Scenarios**:

1. **Given** an AM or OP actor, **When** they submit `POST /v1/inspectors` with valid payload, **Then** an inspector is created in `ACTIVE` with the submitted `serviceTypesJson`, `blockedClientsJson` (see Feedback Round 2026-04-13 item 1), `regionsJson`, `paymentSettingsJson`, and the new profile fields from Feedback Round 2026-04-13 item 6.
2. **Given** an email already in use, **When** a new inspector is created, **Then** the request fails with `INSPECTOR_EMAIL_CONFLICT`.
3. **Given** any non-AM/OP actor, **When** they call create, **Then** the request is rejected with `FORBIDDEN`.
4. **Given** `regionIds` in the payload (shortcut for populating `InspectorRegion` join rows), **When** submitted, **Then** the join rows are created atomically with the inspector insert.

**Feedback Round 2026-04-13 — item 1 (client eligibility inversion)** — APPROVED, pending planning:

- The persistent data model shifts from "eligible tenant ids" to "**blocked** tenant ids". An inspector with an empty `blockedClientsJson` is eligible for **all** tenants by default.
- The UI on `New Inspector` / `Edit Inspector` MUST replace the checkbox list of eligible clients with a **multi-select dropdown** of blocked tenants. The dropdown defaults to empty (= fully eligible).
- Marketplace filtering logic inverts accordingly: an inspector is a candidate for a tenant when the tenant's id is NOT present in the inspector's `blockedClientsJson`.
- Existing `clientEligibilityJson` data must be migrated on the plan-phase: for every inspector with a non-empty list, `blockedClientsJson` becomes the **complement** of that list against the currently-active tenant set. This is a one-time data-migration activity, not a runtime rule.
- Audit entries for inspector create/update record the new `blockedClientsJson` shape.

**Feedback Round 2026-04-13 — item 6 (inspector profile extension)** — APPROVED, obligation levels deferred:

- Added fields on the inspector row: `full_name`, `address`, `abn` (Australian Business Number), `date_of_birth`, `insurance_file_key` + `insurance_expires_at`, `police_check_file_key` + `police_check_expires_at`.
- Files are uploaded via the existing presigned-URL storage path (Supabase Storage bucket reused). No new storage integration.
- The UI surface for these fields lives in both `PWA > Profile` (self-service) and the admin `New Inspector` / `Edit Inspector` screen.
- Obligation levels (mandatory vs optional vs required-before-first-assignment) are **`OPEN QUESTION — pending decision`**. See `specs/feedback-rounds/2026-04-13-customer-feedback-round-1.md` → OQ-2.
- Expiration lifecycle (what happens when `insurance_expires_at` or `police_check_expires_at` passes) is **`OPEN QUESTION — pending decision`**. See OQ-3. The spec commits to persisting the dates and making them queryable; behavioral consequences are intentionally left open.

> **Feedback Round 2026-04-13** — see `specs/feedback-rounds/2026-04-13-customer-feedback-round-1.md` → items 1 and 6.

---

### User Story 2 — List, read, update inspectors

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

Operators browse inspectors with status and region filters, read detail pages, and update profile fields (name, phone, payment settings, service type eligibility, client eligibility, region assignment).

**Independent Test**: Seed five inspectors, call `GET /v1/inspectors` with filters, patch one's `serviceTypesJson`, confirm changes and audit.

**Acceptance Scenarios**:

1. **Given** an AM or OP actor, **When** they call `GET /v1/inspectors`, **Then** paginated results are returned with filter support. AM sees all inspectors; OP sees only inspectors eligible for their tenant.
2. **Given** an AM or OP actor, **When** they call `GET /v1/inspectors/:id`, **Then** the full inspector detail (including linked user and region count) is returned. OP can only read inspectors eligible for their tenant.
3. **Given** an AM or OP actor, **When** they call `PATCH /v1/inspectors/:id`, **Then** the supplied fields are updated and audited. OP can only update inspectors eligible for their tenant.
4. **Given** a CL_ADMIN, CL_USER, or INSP actor, **When** they attempt create, update, deactivate, or link on inspectors, **Then** the request is rejected with `FORBIDDEN`. (`implementation decision` — CL_ADMIN read access to the inspector list for their own tenant's eligible inspectors is allowed by the code but not explicitly defined in the dossiê. CL write access to inspector CRUD is not permitted.)

---

### User Story 3 — Manage inspector availability slots

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

Inspectors or operators declare the time slots an inspector is available on specific dates, with optional region and capacity. Slots are consumed by the marketplace and scheduling UIs (though the capacity counter is not wired to appointments yet — see GAP-003). Inspectors self-serve their own slots via the PWA; AM/OP can manage any inspector.

**Feedback Round 2026-04-13 — item 9 (PWA availability slots)** — ALIGNMENT, no new scope:

This US already covers the customer's request that inspectors declare availability from the PWA. The INSP self-serve path in acceptance scenario #1 (`POST /v1/availability-slots` without `inspectorId` — derived from JWT) is the exact flow requested. No new FRs are added; this is a confirmation that US3 is the correct home for the requirement. If the PWA UI for this surface is incomplete at the moment (form affordances, period selection, bulk creation), the gap is a frontend polish item rather than a new backend scope and will be captured during `/speckit.plan` when 008 enters its next iteration.

> **Feedback Round 2026-04-13** — see `specs/feedback-rounds/2026-04-13-customer-feedback-round-1.md` → item 9 (alignment).

**Independent Test**: Create a slot as an inspector for tomorrow 9-12. List via `GET /v1/availability-slots`. Patch the capacity to 2. Confirm persistence and audit.

**Acceptance Scenarios**:

1. **Given** an INSP actor, **When** they call `POST /v1/availability-slots` without an `inspectorId`, **Then** the slot is created for their own `inspectorId` (derived from JWT).
2. **Given** an AM or OP actor, **When** they submit `POST /v1/availability-slots` with `inspectorId`, **Then** the slot is created for that inspector.
3. **Given** any authorized actor, **When** they call `GET /v1/availability-slots` with optional `inspectorId` filter, **Then** paginated slots are returned (INSP locked to own, AM/OP free, CL roles scoped).
4. **Given** any authorized actor, **When** they call `PATCH /v1/availability-slots/:id`, **Then** date/time/capacity/status updates are applied.
5. **Given** any authorized actor, **When** they call the tenant-scoped variants `POST|GET|PATCH /v1/inspectors/:inspectorId/availability-slots[/:slotId]`, **Then** behavior matches the flat route with the path inspector id.

---

### User Story 4 — Link an inspector to a user account

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

To enable PWA login, an AM or OP links an Inspector record to an existing User with role `INSP`. The link is 1:1 (`users.id` unique on `inspectors.user_id`) — an inspector can be linked to at most one user at a time.

**Independent Test**: Create a user with role INSP (feature 001). Call `POST /v1/inspectors/:id/link-user` with that user id. The inspector's `userId` is set. Login as that user: the JWT now carries the `inspectorId` claim (feature 001).

**Acceptance Scenarios**:

1. **Given** an AM or OP, an inspector without a linked user, and a user with role INSP, **When** they call link, **Then** the link is established and audited.
2. **Given** an inspector already linked to a user, **When** a different link is attempted, **Then** the request fails with `INSPECTOR_ALREADY_LINKED` (or equivalent).
3. **Given** a user whose role is not INSP, **When** a link is attempted, **Then** the request fails with a validation error.

---

### User Story 5 — Deactivate an inspector

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

An AM or OP deactivates an inspector that is no longer working for the platform. Deactivation is blocked if the inspector has any open (`SCHEDULED`) appointments, matching the "do not disable with open appointments" rule from the constitution. A reason is required and audited.

**Independent Test**: Create an inspector assigned to one `SCHEDULED` appointment. Attempt deactivation → expect `INSPECTOR_HAS_OPEN_APPOINTMENTS`. Cancel the appointment → deactivate → confirm success.

**Acceptance Scenarios**:

1. **Given** an AM or OP and an inspector with no open appointments, **When** they call `POST /v1/inspectors/:id/deactivate` with a reason, **Then** `status = INACTIVE`, and an audit record is written with the reason.
2. **Given** an inspector assigned to any `SCHEDULED` appointment (via `IInspectorAppointmentChecker`), **When** deactivation is attempted, **Then** the request fails with `INSPECTOR_HAS_OPEN_APPOINTMENTS`.

---

### User Story 6 — Inspector views their daily schedule (PWA)

- **Priority**: P1
- **Status**: IMPLEMENTED (Feedback Round 2026-04-13 item 2 adds 2 display fields to the schedule-date view — no new endpoints, no new business logic)
- **Source**: code + approved feedback round

An inspector opens the PWA and sees appointments assigned to them for a given date (or the next N days). The list respects the **T-1 visibility rule**: `ROUTINE` appointments whose tenant confirmation is still `PENDING` and which do not have `keyRequired` are hidden on the day-of and day-before, to protect inspectors from showing up to an unconfirmed property. `INGOING`/`OUTGOING` appointments are always visible when `SCHEDULED`. Appointments with `UNAVAILABLE` tenant confirmation are permanently hidden.

**Feedback Round 2026-04-13 — item 2 (schedule date view extras)** — APPROVED:

Each appointment block in `PWA > Schedule > Date` MUST display:

1. **The agency name** (i.e., `tenant.name` of the appointment's owning tenant). Source of truth is the existing `Tenant.name` column; no new data persistence. The `/v1/inspector/schedule` response MUST include this field (either pre-joined or via a lightweight include) — see FR-022 addition below.
2. **A key icon** next to the appointment block when `appointment.key_required = true`. Same as the existing flag on the model; no new data persistence. The schedule response MUST include `keyRequired` in each row.

This is a display-only delta. The T-1 rule, authorization, and the existing FRs for this US are unchanged.

> **Feedback Round 2026-04-13** — see `specs/feedback-rounds/2026-04-13-customer-feedback-round-1.md` → item 2.

**Why this priority**: This is the inspector's primary daily tool. Without it, they cannot plan routes or start work.

**Independent Test**: Seed four `SCHEDULED` appointments for today with mixed flow types and tenant confirmations. As the inspector, call `GET /v1/inspector/schedule`. Verify the T-1 rule excludes the correct rows.

**Acceptance Scenarios**:

1. **Given** an INSP actor, **When** they call `GET /v1/inspector/schedule`, **Then** only appointments assigned to `actor.inspectorId` in `SCHEDULED` status are returned.
2. **Given** a `ROUTINE` appointment with `tenantConfirmationStatus = PENDING` and `keyRequired = false` scheduled for tomorrow, **When** loaded today, **Then** it is **hidden**.
3. **Given** the same appointment on the day before, **When** `tenantConfirmationStatus` becomes `CONFIRMED`, **Then** it becomes visible immediately on the next schedule fetch.
4. **Given** a `ROUTINE` appointment with `keyRequired = true`, **When** loaded, **Then** it is visible regardless of confirmation status.
5. **Given** an `INGOING` or `OUTGOING` appointment, **When** loaded in `SCHEDULED`, **Then** it is always visible.
6. **Given** any appointment with `tenantConfirmationStatus = UNAVAILABLE`, **When** loaded, **Then** it is hidden.
7. **Given** a non-INSP actor, **When** they call the schedule endpoint, **Then** the request is rejected with `FORBIDDEN`.
8. **Given** any INSP actor, **When** they call `GET /v1/inspector/appointments/:appointmentId`, **Then** the detailed view is returned (bypasses T-1 — the inspector already has the id).

---

### User Story 6a — Inspector views job details (PWA)

- **Priority**: P1 (added by Feedback Round 2026-04-13, item 3)
- **Status**: NEW — pending planning
- **Source**: approved feedback round

After tapping an appointment in their schedule, the inspector lands on a `PWA > Schedule > Job Details` screen that consolidates every piece of context they need to arrive, execute, and contact the right people. Today's job-details view is a thin placeholder; this round turns it into the main operational surface for the inspector between "I accepted this job" and "I press Start."

**Why this priority**: this screen is the single biggest time-saver for inspectors in the field. Scattering the information across multiple tabs or external documents adds friction and error risk.

**Independent Test**: Seed a `SCHEDULED` appointment with: a tenant, a non-empty primary contact (linked via feature 021 contact registry), `keyRequired = true`, a key-pickup address, a property manager contact (`appointment_contacts` junction row with `role = PROPERTY_MANAGER`), a price snapshot, and a configured inspection-app URL. As the INSP actor, call `GET /v1/inspector/appointments/:id`. Verify every Job Details section is present in the response with the expected shape.

**Contact resolution (feature 021 architectural revision)**:

- **`tenantContacts`**: resolved from `appointment_contacts` junction rows where `role != PROPERTY_MANAGER` and `role != BROKER`. The response uses **snapshot fields** (`snapshot_name`, `snapshot_email`, `snapshot_phone`) for tenant-type contacts — the inspector needs the data as it was when the appointment was created, consistent with notifications sent. Primary contact first, then insertion order.
- **`propertyManager`**: resolved from the `appointment_contacts` junction row with `role = PROPERTY_MANAGER`. For this section, the response uses **live data from the `contacts` registry** (via `contact_id` JOIN) — the inspector needs the PM's current phone number to call them on the way to the property. If `contact_id IS NULL` (legacy row), fall back to snapshot fields. The response includes `displayName`, `primaryEmail`, `primaryPhone`, and `company` from the registry.

**Acceptance Scenarios**:

1. **Given** an INSP actor assigned to the appointment, **When** they request job details, **Then** the response includes a `jobDetails` payload with 7 sections: `agency`, `tenantContacts`, `keys`, `keyLocation`, `propertyManager`, `payment`, `inspectionAppLink`.
2. **Given** `appointment.key_required = true` and a populated `key_location` (address/coordinates), **When** job details are fetched, **Then** the `keys` section includes a `mapLinkUrl` that opens in the platform's native map app (Google Maps / Apple Maps deep link).
3. **Given** an appointment with multiple tenant contacts (via feature 021 junction), **When** job details are fetched, **Then** the `tenantContacts` section returns an ordered list with the primary contact first, each entry carrying the snapshot name, snapshot email, and snapshot phone.
4. **Given** an appointment with a property manager contact (junction row with `role = PROPERTY_MANAGER` and a non-null `contact_id`), **When** job details are fetched, **Then** the `propertyManager` section includes the **live** PM name, email, phone, and company from the `contacts` registry.
5. **Given** an appointment with a pricing snapshot, **When** job details are fetched, **Then** the `payment` section shows the inspector's payout amount and currency — NOT the tenant price.
6. **Given** a tenant that has a configured inspection-app URL (third-party app link), **When** job details are fetched, **Then** the `inspectionAppLink` section returns the URL and a human-readable label for a deep-link action in the PWA.
7. **Given** an appointment without an inspection-app URL configured, **When** job details are fetched, **Then** the `inspectionAppLink` section is omitted (not `null`) and the PWA hides the affordance.

**Scope boundary — OUT OF SCOPE for this round**:

- **Per-agency / per-broker login credentials** (username + password for the inspector to log into the third-party system). This was explicitly asked for and explicitly deferred. See `specs/feedback-rounds/2026-04-13-customer-feedback-round-1.md` → OQ-1 (`pending decision`). The PWA MUST NOT surface any credential management until OQ-1 is resolved. A future spec revision will re-introduce this once the product decision lands.

> **Feedback Round 2026-04-13** — see `specs/feedback-rounds/2026-04-13-customer-feedback-round-1.md` → item 3 + OQ-1.

---

### User Story 6b — Inspector generates a draft invoice from the PWA

- **Priority**: P2 (added by Feedback Round 2026-04-13, item 5)
- **Status**: NEW — pending planning
- **Source**: approved feedback round

From the `PWA > Earnings > Draft Invoice > Select period` surface, an inspector picks a period (start + end date), previews the inspector-payout financial entries that fall in that window, and generates a draft `InspectorInvoice` which is then sent to admin for review. This is a PWA-initiated variant of an invoice flow that today only admin can drive (feature 010).

**Why this priority**: unblocks the inspector from having to email admin every period. Aligns with item 5 of the feedback round without introducing any new external financial integration.

**Independent Test**: As an INSP, seed three approved `INSPECTOR_PAYOUT` financial entries in the last 30 days for your inspector id. Call `POST /v1/inspector/invoices/draft` with `{ periodStart, periodEnd }`. Verify an `InspectorInvoice` row is created in the new `PENDING_REVIEW` status with the correct totals and audit entry. Verify admin can then approve/reject the draft via the existing billing module.

**Acceptance Scenarios**:

1. **Given** an INSP actor, **When** they `POST /v1/inspector/invoices/draft` with a valid period that contains at least one `APPROVED` `INSPECTOR_PAYOUT` financial entry assigned to the caller's inspector id, **Then** an `InspectorInvoice` is created with the aggregated total, currency, period, the list of included entry ids, and `status = PENDING_REVIEW`.
2. **Given** a period with zero eligible entries, **When** the draft is requested, **Then** the request fails with `INVOICE_EMPTY_PERIOD` (do not create an empty draft).
3. **Given** a period that overlaps an existing non-`REJECTED`, non-`CANCELLED` inspector invoice, **When** the draft is requested, **Then** the request fails with `INVOICE_PERIOD_OVERLAP` — the inspector must not create duplicate drafts.
4. **Given** a successfully generated draft, **When** admin lists inspector invoices with `status = PENDING_REVIEW`, **Then** the new row appears and is actionable via the existing admin approve / reject flow (see feature 010).
5. **Given** a non-INSP actor, **When** the draft endpoint is called, **Then** the request is rejected with `FORBIDDEN`.
6. **Given** an INSP actor without `inspectorId` linked on the token, **When** the draft endpoint is called, **Then** the request fails with `INSPECTOR_NOT_LINKED`.

**Scope boundary — what this is NOT**:
- Not a payment execution path. The draft is a **review artifact**, not a transfer. Admin still owns the approval and eventual `PAID` marking.
- Not a new ledger model. The financial entries already exist in feature 010; this round only gives the inspector a way to roll them up into a draft invoice.
- Not an external finance/gateway integration. Zero new third-party calls.

> **Feedback Round 2026-04-13** — see `specs/feedback-rounds/2026-04-13-customer-feedback-round-1.md` → item 5.

---

### User Story 7 — Inspector starts an inspection with geolocation

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

An inspector arrives at the property and taps "Start" on the PWA. The client sends their current `latitude` and `longitude`. The server creates an `InspectionExecution` row with the start coordinates. The operation is idempotent via an `Idempotency-Key` header with 24 h retention — the inspector can retry on a flaky mobile connection. Starting is blocked by the same T-1 rule and by an additional time-window rule (can't start before a reasonable buffer around the scheduled slot).

**Independent Test**: Assign an inspector to a `SCHEDULED` appointment. Call `POST /v1/inspector/appointments/:id/start` with coordinates and an idempotency key. Confirm an execution row exists, an audit record is written, and a replay with the same key returns the same response.

**Acceptance Scenarios**:

1. **Given** an INSP actor assigned to a `SCHEDULED` appointment with a valid T-1 visibility, **When** they call start with coordinates and an idempotency key, **Then** an `InspectionExecution` row is created with `startedAt`, `startLatitude`, `startLongitude`, and `finishedAt = null`.
2. **Given** an execution already in progress (not finished) for the same appointment, **When** start is called again, **Then** the existing execution is returned (idempotent — no new row, no error).
3. **Given** an execution already finished, **When** start is called again, **Then** the request fails with `EXECUTION_ALREADY_FINISHED`.
4. **Given** a missing `Idempotency-Key` header, **When** start is attempted, **Then** the request fails with `IDEMPOTENCY_KEY_MISSING`.
5. **Given** a T-1 blocked appointment (`ROUTINE` unconfirmed without key), **When** start is attempted, **Then** the request fails with `EXECUTION_T1_BLOCKED`.
6. **Given** a start attempt outside the allowed time window around the scheduled slot, **When** submitted, **Then** the request fails with `EXECUTION_TIME_WINDOW_EXCEEDED`.
7. **Given** an appointment not assigned to the caller's `inspectorId`, **When** start is attempted, **Then** the request fails with `APPOINTMENT_NOT_FOUND` (existence-leakage prevention).
8. **Given** a non-INSP actor or an INSP without `inspectorId` in the token, **When** start is attempted, **Then** the request is rejected with `FORBIDDEN` / `INSPECTOR_NOT_LINKED`.

---

### User Story 8 — Inspector uploads inspection assets (photos, documents, signature)

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

The inspector takes photos and collects a signature on the PWA. For each asset, the client requests a presigned upload URL from the server (`POST /v1/inspector/appointments/:id/assets`), uploads the file directly to Supabase Storage, and then confirms the upload (`PATCH .../assets/:assetId/confirm`) so the server marks the row as `UPLOADED`. The server validates MIME type per asset kind (photo/document/signature). The presigned URL has a 15-minute TTL.

**Independent Test**: Start an inspection. Request an upload URL for a `PHOTO` asset with `image/jpeg`. Confirm an `InspectionAsset` row exists with `status = PENDING` and `storageKey`. Simulate upload (via stub storage). Confirm the asset → `status = UPLOADED`.

**Acceptance Scenarios**:

1. **Given** an INSP actor with an in-progress execution, **When** they `POST /v1/inspector/appointments/:id/assets` with `kind`, `mimeType`, and `fileName`, **Then** a PENDING asset row is created, a presigned upload URL is returned, and `upload_expires_at` is 15 minutes from now.
2. **Given** a `mimeType` not allowed for the declared `kind` (e.g., `application/pdf` for `PHOTO`), **When** the request is made, **Then** it fails with `ASSET_MIME_TYPE_NOT_ALLOWED`.
3. **Given** an execution not started or already finished, **When** asset upload is requested, **Then** the request fails with `EXECUTION_NOT_STARTED` or `EXECUTION_ALREADY_FINISHED`.
4. **Given** a `PATCH /v1/inspector/appointments/:id/assets/:assetId/confirm` call, **When** the stored object exists and the asset is owned by the caller, **Then** the asset row flips to `UPLOADED`.
5. **Given** a confirmation call for an asset that is not found in storage, **When** submitted, **Then** the request fails with `ASSET_UPLOAD_NOT_FOUND_IN_STORAGE`.
6. **Given** a confirmation call past `upload_expires_at`, **When** submitted, **Then** the request fails with `ASSET_UPLOAD_EXPIRED`.
7. **Given** an asset not owned by the caller's inspector, **When** confirmation is attempted, **Then** the request fails with `ASSET_NOT_FOUND` (existence-leakage prevention).

---

### User Story 9 — Inspector finishes the inspection

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

When the inspection is complete, the inspector taps "Finish" on the PWA. The client sends finish coordinates, an optional checklist JSON, optional notes, and a list of `(assetId, storageKey)` pairs for the assets they want included in the execution. The server validates: (a) the execution exists and is in progress, (b) all referenced assets are UPLOADED and owned by this execution, (c) the uploaded assets meet the service type's minimum (default 1 PHOTO, plus signature if required), (d) the checklist (if provided) is non-empty. On success, the execution row is finalized and `FinishInspectionUseCase` calls `ExecuteStatusTransitionUseCase` to perform the sovereign `SCHEDULED → DONE` transition. Financial entries are **not** yet created — they wait for the operator cross-check (feature 006).

**Why this priority**: This is the money moment — finishing triggers the DONE transition, which in turn enables the two-person cross-check and financial entries.

**Independent Test**: After start + asset upload, call finish with valid coordinates and checklist. Confirm (a) `InspectionExecution.finishedAt` set, (b) appointment transitioned to `DONE`, (c) `appointment.done_pending_crosscheck` audit record exists (because INSP marked DONE without cross-check), (d) no financial entries yet.

**Acceptance Scenarios**:

1. **Given** a valid in-progress execution with sufficient uploaded assets, **When** the inspector calls `POST /v1/inspector/appointments/:id/finish` with coordinates, checklist, notes, and asset refs, **Then** the execution is finalized, `SCHEDULED → DONE` transition runs through the sovereign use case, and an audit record is written.
2. **Given** fewer photos than required by the service type checklist, **When** finish is attempted, **Then** the request fails with `EXECUTION_INSUFFICIENT_ASSETS`.
3. **Given** a required signature that is not uploaded, **When** finish is attempted, **Then** the request fails with `EXECUTION_INSUFFICIENT_ASSETS`.
4. **Given** a referenced asset that is not in `UPLOADED` status or belongs to a different execution, **When** finish is attempted, **Then** the request fails with `EXECUTION_ASSET_UPLOAD_PENDING`.
5. **Given** a checklist payload with no entries, **When** submitted, **Then** the request fails with `EXECUTION_EMPTY_CHECKLIST`.
6. **Given** an execution already finished, **When** finish is attempted, **Then** the request fails with `EXECUTION_ALREADY_FINISHED`.
7. **Given** a missing `Idempotency-Key`, **When** finish is attempted, **Then** the request fails with `IDEMPOTENCY_KEY_MISSING`.
8. **Given** a finished execution, **When** a replayed finish request arrives within 24 h with the same idempotency key, **Then** the cached response is returned without re-running the transition.

---

### Edge Cases

- **T-1 rule is at the use-case layer**: the `T1VisibilityService` is consulted in `StartInspectionUseCase` and inside the schedule list query. Both must stay in sync — changing the rule in one place without the other would break correctness. Consider centralizing (GAP-004).
- **Time window rule**: `InspectionTimeWindowService` enforces a window around the scheduled slot. The exact bounds are hardcoded in the service — not configurable per tenant yet (GAP-005).
- **Idempotency for start/finish**: every start/finish call MUST carry an `Idempotency-Key` header. Missing header is a hard error (`IDEMPOTENCY_KEY_MISSING`, 400). 24 h retention.
- **Asset upload + confirm is a two-step**: request returns a presigned URL and creates a `PENDING` row; the client uploads directly to storage; confirm flips the row to `UPLOADED`. The `expire-assets.worker.ts` reaps `PENDING` assets past their TTL.
- **Finish triggers DONE through the sovereign use case**: `FinishInspectionUseCase` does NOT write `appointment.status` directly. It calls `ExecuteStatusTransitionUseCase` so constitution Principle VI is preserved.
- **Marketplace offers endpoint alias**: `GET /v1/inspector/offers` is registered here and delegates to feature 005's `GetMarketplaceOffersUseCase`. The canonical endpoint is `GET /v1/marketplace/offers` in feature 005; this alias exists for PWA convenience.
- **`notify-stuck.worker.ts`**: scheduled worker that notifies operators when an execution has been started but not finished within a reasonable window. Provides a safety net against inspectors forgetting to tap finish.
- **Inspector region duality**: inspectors have BOTH a `regions_json` field on the entity AND `InspectorRegion` join rows (feature 004). These should be the same data but are stored in two places. See GAP-002.
- **`userId` on inspectors is nullable**: an inspector can exist without a linked user account (e.g., pre-onboarded contractor). Without a link, they cannot log in to the PWA. AM/OP still manage them via operator endpoints.
- **Signature is a separate asset kind**: `SIGNATURE` assets have a distinct MIME whitelist (SVG, PNG) and are required when the service type's checklist mandates it.

## Requirements

### Functional Requirements

All FRs below are `Status: IMPLEMENTED, Source: code` unless otherwise noted.

#### Inspector entity

- **FR-001**: System MUST allow AM and OP to create, read, update, and deactivate inspectors. OP is scoped to inspectors eligible for their own tenant (per the block-list model — see FR-006a).
- **FR-002**: System MUST enforce global uniqueness of `inspectors.email`.
- **FR-003**: System MUST support linking an inspector 1:1 to a user account via `POST /v1/inspectors/:id/link-user`. The target user MUST have role `INSP`.
- **FR-004**: System MUST block inspector deactivation if the inspector is assigned to any open appointment (checked via `IInspectorAppointmentChecker`).
- **FR-005**: System MUST audit every inspector create, update, link, and deactivate.
- **FR-006**: System MUST persist `payment_settings_json`, `service_types_json`, and `regions_json` on the inspector row. `service_types_json` drives marketplace filtering (`IMPLEMENTED`). `regions_json` is a **legacy/transitional field** (`implementation decision` — the canonical source for region coverage is the `inspector_regions` join table linked to tenant-scoped `ServiceRegion` rows; see GAP-002). `regions_json` should be treated as a denormalized cache or removed once GAP-002 lands.
- **FR-006a** (Feedback Round 2026-04-13 item 1, NEW, pending planning): System MUST persist `blocked_clients_json` — an array of tenant ids that the inspector is explicitly **blocked from**. Default is the empty array, meaning the inspector is eligible for all tenants. Marketplace filtering MUST treat absence from this list as eligibility. The previous `client_eligibility_json` field is deprecated; the migration-phase of the next plan MUST compute `blocked_clients_json` as the complement of the old eligible list against the currently active tenant set, for every existing inspector. The admin UI on `New Inspector` / `Edit Inspector` MUST render a **multi-select dropdown** of tenants for this field (not the previous checkbox list of eligible clients).
- **FR-006b** (Feedback Round 2026-04-13 item 6, NEW, pending planning): System MUST persist additional inspector profile fields: `full_name`, `address`, `abn`, `date_of_birth`, `insurance_file_key`, `insurance_expires_at`, `police_check_file_key`, `police_check_expires_at`. The two file_key columns MUST reference files stored via the existing presigned-upload pipeline (Supabase Storage, same bucket used for inspection assets or a new dedicated `inspector-documents` bucket — naming decision is part of the next plan, not part of spec scope). **Obligation levels are `OPEN QUESTION — OQ-2`** — the spec persists and validates structurally; `nullable` vs `required` is not decided here. **Expiration behavior is `OPEN QUESTION — OQ-3`** — the dates are stored and queryable; the operational consequences (block assignment, notify operator, auto-deactivate, etc.) are deferred.

#### Availability slots

- **FR-010**: System MUST allow INSP to manage only their own slots. AM can manage any inspector's slots. OP (own tenant) can manage slots for inspectors eligible for their tenant. `CL_ADMIN` and `CL_USER` slot access is `implementation decision` — the dossiê does not explicitly define CL permissions for availability-slot management; the code currently allows CL roles to read slots with scoping. CL write access should not be assumed as approved.
- **FR-011**: System MUST expose flat routes (`/v1/availability-slots` with `inspectorId` query/body) and inspector-scoped routes (`/v1/inspectors/:id/availability-slots`). Both paths share the same use cases.
- **FR-012**: System MUST support status transitions on slots (`AVAILABLE`, `BOOKED`, `CANCELLED`, etc.) via PATCH.

#### Schedule visibility (T-1 rule)

- **FR-020**: System MUST restrict `GET /v1/inspector/schedule` and `GET /v1/inspector/appointments/:id` to INSP actors with `inspectorId` in the token.
- **FR-021**: System MUST apply the T-1 visibility rule via `T1VisibilityService` when listing schedule items:
  - `INGOING` and `OUTGOING` — always visible when `SCHEDULED`.
  - `keyRequired = true` — always visible.
  - `tenantConfirmationStatus = CONFIRMED` — always visible.
  - `tenantConfirmationStatus = UNAVAILABLE` — always hidden.
  - `ROUTINE + PENDING + !keyRequired` — hidden on the day-of and day-before; visible T-2 and beyond.
- **FR-022** (Feedback Round 2026-04-13 item 2, NEW, pending planning): The `GET /v1/inspector/schedule` response MUST include `agencyName` (joined from `tenants.name` via `appointments.tenant_id`) and `keyRequired` on each row. These are display-only fields; the T-1 rule and authorization are unchanged. The PWA schedule date view consumes both fields and renders a key icon when `keyRequired = true`.
- **FR-023** (Feedback Round 2026-04-13 item 3, NEW, pending planning): The `GET /v1/inspector/appointments/:id` response MUST include a `jobDetails` payload with 7 structured sections: `agency` (tenant name + id), `tenantContacts` (ordered list including primary + any additional contacts per feature 006 FR-004a — see item 4), `keys` (key_required flag + key_location description), `keyLocation` (address + optional coordinates + platform-specific map link), `propertyManager` (name + email + phone + optional agency reference), `payment` (inspector payout amount + currency from the appointment's pricing snapshot — NOT the tenant price), and `inspectionAppLink` (deep-link URL and label when configured for the tenant; field omitted entirely when not configured). **Per-agency login credentials are explicitly out of scope** — see OQ-1.

#### Start inspection

- **FR-030**: System MUST restrict `POST /v1/inspector/appointments/:id/start` to INSP actors assigned to the appointment.
- **FR-031**: System MUST require an `Idempotency-Key` header and cache the response for 24 h under scope `start`.
- **FR-032**: System MUST apply the T-1 rule at start (same rule as schedule visibility).
- **FR-033**: System MUST apply the time-window rule via `InspectionTimeWindowService`. Starting outside the window fails with `EXECUTION_TIME_WINDOW_EXCEEDED`.
- **FR-034**: System MUST treat a repeated start on an unfinished execution as idempotent — returns the existing execution without error or side effect.
- **FR-035**: System MUST record an audit entry and a secondary `inspection.started` entry on the appointment for timeline reads.

#### Asset upload

- **FR-040**: System MUST restrict asset endpoints to the INSP assigned to the execution.
- **FR-041**: System MUST require the execution to be started and not yet finished.
- **FR-042**: System MUST validate `mimeType` against the `allowed-mime-types.ts` matrix per `kind` (`PHOTO`, `DOCUMENT`, `SIGNATURE`).
- **FR-043**: System MUST generate a storage key under `inspections/<tenantId>/<appointmentId>/<assetId>.<ext>` and request a presigned upload URL from the storage service with a 15-minute TTL.
- **FR-044**: System MUST create a `PENDING` asset row on upload request and flip it to `UPLOADED` on successful confirmation. Confirmation MUST verify the object exists in storage and the asset has not expired.
- **FR-045**: System MUST run a scheduled sweep (`expire-assets.worker.ts`) that reaps `PENDING` assets past their TTL.

#### Finish inspection

- **FR-050**: System MUST restrict finish to the INSP assigned to the execution.
- **FR-051**: System MUST require an `Idempotency-Key` header and cache for 24 h under scope `finish`.
- **FR-052**: System MUST validate the referenced assets are `UPLOADED` and owned by this execution.
- **FR-053**: System MUST validate the uploaded asset set against the service type's checklist (min photos, signature required). Note: the default 1 PHOTO minimum is a fallback when no checklist is configured; the binding rule is per-service-type evidence requirements per the dossier.
- **FR-054**: System MUST reject empty checklist payloads (`EXECUTION_EMPTY_CHECKLIST`).
- **FR-055**: System MUST finalize the execution (`finishedAt`, finish coordinates, checklist, notes) before invoking `ExecuteStatusTransitionUseCase`.
- **FR-056**: System MUST route the `SCHEDULED → DONE` transition through `ExecuteStatusTransitionUseCase` — never via direct DB write. This preserves state-machine sovereignty.
- **FR-057**: System MUST NOT create financial entries on finish. Financial entries wait for operator cross-check (feature 006).

#### PWA Earnings — inspector-initiated invoice draft

- **FR-060** (Feedback Round 2026-04-13 item 5, NEW, pending planning): System MUST expose `POST /v1/inspector/invoices/draft` to INSP actors, accepting a `{ periodStart, periodEnd }` payload. **Ownership split** (planner-critical): the HTTP route and its Fastify handler live under `apps/backend/src/modules/inspector/interfaces/http/` (feature 008 surface), but the domain use case — `DraftInspectorInvoiceUseCase` — MUST live under `apps/backend/src/modules/billing/application/use-cases/` (feature 010 domain). The 008 handler is a **thin delegation**: validate JWT → resolve `inspectorId` → call the billing use case → map the result to the HTTP response. All invoice-shape logic (period aggregation, overlap detection, status assignment, audit emission) lives in billing; 008 owns only the INSP-specific HTTP surface and the INSP actor gate. The created invoice row uses the new `PENDING_REVIEW` status (feature 010 FR-064) and carries the inspector id derived from the JWT. No cross-inspector drafts.
- **FR-061**: The draft endpoint MUST fail with `INVOICE_EMPTY_PERIOD` when the window contains zero eligible `INSPECTOR_PAYOUT` financial entries, and with `INVOICE_PERIOD_OVERLAP` when the window overlaps an existing non-`REJECTED`, non-`CANCELLED` inspector invoice for the same inspector. The overlap check MUST cover both `PENDING_REVIEW` and `APPROVED` / `PAID` invoices.
- **FR-062**: The draft endpoint MUST write a `inspector_invoice.drafted` audit entry that captures the inspector id, period, total, and the list of included financial entry ids.
- **FR-063**: The admin-side approve/reject flow for inspector invoices lives entirely in feature 010 — see feature 010 FR-066 (`POST /v1/invoices/:invoiceId/approve-draft`) and feature 010 FR-067 (`POST /v1/invoices/:invoiceId/reject-draft`). Feature 008 does NOT expose an admin-side surface for inspector invoices; the PWA only owns the draft-creation entry point.

#### Cross-cutting

- **FR-070**: System MUST audit every execution write (`inspection_execution.started`, `inspection_execution.finished`) and add a mirror entry on the appointment timeline.
- **FR-071**: System MUST validate all payloads via Zod schemas in `packages/shared/src/schemas/{inspector,inspector-execution}.ts`.
- **FR-072**: System MUST expose `GET /v1/inspector/offers` as a PWA-convenience alias for the marketplace list (delegates to feature 005).

#### Inherited UX patterns (Feedback Round 2026-04-13, sanity-check corrective pass)

- **FR-019b (pencil removal when duplicated with eye)**: the admin Inspectors list row exposes a single "view" action (eye) that opens the detail drawer where edit lives as a secondary affordance. The row-level "edit" (pencil) action MUST NOT be rendered. Inherited transversally from feature 014 FR-019b — no per-spec override.

> **Feedback Round 2026-04-13** — see `specs/feedback-rounds/2026-04-13-customer-feedback-round-1.md` → item 11 (pencil removal).

### Non-Functional Requirements

- **NFR-001** (`Status: APPROVED, Source: dossier`): PWA schedule load p95 < 300 ms (mobile networks). Start/finish p95 < 600 ms (includes asset validation and state transition).
- **NFR-002** (`Status: IMPLEMENTED, Source: code`): Presigned URL TTL 15 minutes. Longer windows are out of scope.
- **NFR-003** (`Status: APPROVED, Source: dossier`): Every start/finish call MUST be idempotent. Missing idempotency keys are a hard error.
- **NFR-004** (`Status: APPROVED, Source: dossier`): Inspection assets stored in Supabase Storage at `inspection-assets` bucket. Access controls follow per-tenant isolation.

### Key Entities

- **Inspector** — `id`, optional `user_id` (1:1 for PWA login), name, email (unique), phone, `status`, `payment_settings_json`, `regions_json` (**legacy/transitional** — canonical source is `inspector_regions`; see GAP-002), `service_types_json`, `client_eligibility_json` (**DEPRECATED by Feedback Round 2026-04-13 item 1**, replaced by `blocked_clients_json`), `blocked_clients_json` (Feedback Round 2026-04-13 item 1, NEW — array of tenant ids the inspector is blocked from; empty = fully eligible), profile fields (Feedback Round 2026-04-13 item 6, NEW — `full_name`, `address`, `abn`, `date_of_birth`), compliance-document fields (Feedback Round 2026-04-13 item 6, NEW — `insurance_file_key`, `insurance_expires_at`, `police_check_file_key`, `police_check_expires_at`), timestamps + soft delete. Obligation levels on the new profile + compliance fields are **OQ-2**; expiration lifecycle is **OQ-3**.
- **InspectorAvailabilitySlot** — declared time slots per inspector, with optional `region_json` hint (`implementation decision` — transitional; the canonical direction is to align slot regions with tenant-scoped `ServiceRegion` once GAP-002 lands) and capacity (not yet wired to booking — GAP-003).
- **InspectionExecution** — one per appointment; `started_at`, `finished_at`, start/finish coordinates (decimal 10,7), `checklist_json`, `notes`.
- **InspectionAsset** — photos, documents, signatures. Tied to execution and appointment. Includes `storage_key` (unique), `mime_type`, `kind`, `status`, `upload_expires_at`.
- **Domain services**: `T1VisibilityService`, `InspectionTimeWindowService`, `IServiceTypeReader` (cross-module adapter for checklist config).

Full schema in [`data-model.md`](./data-model.md). HTTP contracts in [`contracts/`](./contracts/).

## Success Criteria

- **SC-001**: T-1 rule is enforced consistently in both `GET /v1/inspector/schedule` and `POST /v1/inspector/appointments/:id/start` — verified by a shared test fixture for both code paths.
- **SC-002**: Idempotent start on an unfinished execution returns the same execution id twice — asserted by integration test.
- **SC-003**: Finish triggers exactly one `SCHEDULED → DONE` transition via `ExecuteStatusTransitionUseCase`. Verified by a test that spies on the use case.
- **SC-004**: Asset upload TTL is strictly 15 minutes — verified by a test that manipulates system time.
- **SC-005**: Inspector deactivation with an open appointment is blocked — verified with real `PrismaInspectorAppointmentChecker`.
- **SC-006**: Every execution write produces exactly the expected audit entries (start: 2, finish: 2 + the appointment transition entry).
- **SC-007**: Financial entries are NOT created on finish (they wait for cross-check). Verified by asserting the `financial_entries` table is empty after finish.

## Assumptions

- Inspectors are cross-tenant contractors — their `client_eligibility_json` lists which tenants they are allowed to work for (`IMPLEMENTED`). This is a policy, not a capability.
- **Data model: implemented reality vs. canonical target**:
  - `client_eligibility_json` — `IMPLEMENTED`. Array of tenant UUIDs. Drives marketplace filtering today.
  - `service_types_json` — `IMPLEMENTED`. Array of service type UUIDs. Drives marketplace filtering today.
  - `regions_json` — **legacy/transitional** (`implementation decision`). The canonical source for geographic coverage is the `inspector_regions` join table linked to tenant-scoped `ServiceRegion` rows. `regions_json` should be treated as a cache or removed (GAP-002).
  - `region_json` on availability slots — **transitional hint** (`implementation decision`). The canonical direction is to align slot regions with `ServiceRegion` once GAP-002 lands.
- **Evidence minimum for inspection finish** — the binding rule is per-service-type evidence requirements from the checklist. The "default 1 PHOTO" is a **fallback** when no checklist is configured (`implementation decision`), not a product rule.
- Geolocation is advisory — the server does not geofence or reject starts far from the property in Phase 1. This is a potential abuse vector tracked as GAP-001.
- Asset storage is Supabase S3-compatible. The stub storage service is used in tests; production wiring uses `SupabaseStorageService`.
- Checklist JSON is opaque in the database; the service type's `checklistTemplate` drives validation. Shape to be formalized as part of feature 004 work.
- Inspector availability slots do not yet participate in automatic booking (capacity counter is not cross-referenced with appointment assignment). Tracked as GAP-003.
- **CL role access to inspector data**: CL_ADMIN read access to the inspector list (filtered by own-tenant eligibility) is allowed by the code but not explicitly defined in the dossiê. CL write access (create, update, deactivate, link) is NOT permitted.

## Known Gaps

> Summary index only. Detail in [`tasks.md`](./tasks.md) under Phase 2.

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Geolocation verification at start | Coordinates are captured but never compared against the property's geocoded location. An inspector could start an inspection from anywhere. | Add a distance check (e.g., within 500m) with the property's `coordinates` column — depends on 003#GAP-003 PostGIS backfill. |
| GAP-002 | Inspector region duality | Regions are stored both in `inspectors.regions_json` and `inspector_regions` join rows. Data can drift. | Pick one as authoritative (recommend the join table, since feature 004 owns the canonical geometry) and treat the JSON as a cache or remove it. |
| GAP-003 | Availability slot booking integration | `capacity` field exists but is not decremented when appointments are assigned. Slots do not prevent double-booking today. | Decrement on assignment, restore on cancellation, enforce at SCHEDULED transitions. |
| GAP-004 | Centralize T-1 rule consumption | `T1VisibilityService` is called in two places (schedule list + start use case). Any new consumer must remember to apply it — risk of drift. | Wrap all schedule reads in a single repository method that applies the rule internally; expose it as a port. |
| GAP-005 | Time-window configurable per tenant or service type | `InspectionTimeWindowService` hardcodes bounds. Some agencies want tighter windows, some looser. | Read bounds from `tenant.settings_json` (blocked by 002#GAP-002) or from the service type row. |
| GAP-006 | Pause / resume inspection | An inspector cannot pause an inspection to, say, move between rooms on battery loss. There is no intermediate state between `started` and `finished`. | Introduce an auto-save mechanism that persists the in-progress checklist draft to the execution row every N seconds. |
| GAP-007 | Re-open finished execution | Once finished, an execution cannot be re-opened even if the inspector realizes they forgot a photo. The only path today is DONE → DRAFT via feature 006 (AM only), which loses the execution context. | Allow AM to re-open an execution explicitly, keeping the original `started_at` and adding a new `resumed_at` marker. |
| GAP-008 | Asset retention policy | Photos and documents live forever in Supabase Storage. No retention or archival policy. | Runbook + optional scheduled move to cold storage after N months. |
| GAP-009 | Inspector JSON fields unvalidated | `payment_settings_json`, `regions_json`, `service_types_json`, `client_eligibility_json` are `z.record(z.unknown())` or loose arrays — no typed schemas. | Define per-field Zod schemas, enforce on write, backfill log of offenders. |
| GAP-010 | Time-window rule shared with feature 006 | The server-side window is computed here but feature 006's `force-confirmation` and reschedule flows do not consider it. Operator actions can leave an appointment in an impossible state (e.g., confirmed after the window closed). | Extract the time-window service into a shared location and consume from both features. |
