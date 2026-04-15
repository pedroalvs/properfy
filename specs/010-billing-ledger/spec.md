# Feature Specification: Billing & Ledger

**Feature Branch**: `010-billing-ledger`
**Created**: 2026-04-05
**Feature Status**: IMPLEMENTED — Phase 1 shipped; Phase 2 gaps closed in commit `fe8c822` (2026-04-08, Waves 1–3). Gap 010#GAP-008 (invoice PAID marking endpoint) was further closed by feature 017 (invoice payment reconciliation, 2026-04-10). Ledger invariants (append-only, approved-immutable, invoice-generation-sovereignty) are preserved end-to-end. Editorial reconciliation 2026-04-13. See `specs/GAPS.md` for the gap status table.
**Sources**:
- Code: `apps/backend/src/modules/billing/**`, `apps/backend/prisma/schema.prisma`, `packages/shared/src/schemas/billing.ts`
- Approved rules: `.specify/memory/constitution.md`, `CLAUDE.md`, `projeto-consolidado/regras-negocio-respostas-cliente.md`
- Legacy spec (to be superseded on approval): `specs/backend/billing.spec.md`, `specs/web/financial.spec.md`

> **Domain context.** Billing is the platform's append-only ledger of financial intent. Every completed appointment generates two `FinancialEntry` rows — `TENANT_DEBIT` (what the agency owes the platform) and `INSPECTOR_PAYOUT` (what the platform owes the inspector) — which become payable only after a two-person approval. Refunds and manual adjustments are also entries with explicit cross-references. Inspector invoices close a billing period by summing approved payouts. The module does NOT talk to payment processors in Phase 1 — it is a ledger, not a payment gateway. Payment reconciliation is an operator-mediated workflow on top of this data.
>
> **Reading guide.** Every user story declares `Priority`, `Status`, `Source`. Status: `IMPLEMENTED` | `APPROVED` | `GAP`. Source: `code` | `dossier` | `inferred`.

## User Scenarios & Testing

### User Story 1 — System auto-creates debit + payout entries after appointment cross-check

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

**(Canonical business flow)** When feature 006 `PerformCrossCheckUseCase` runs successfully (the explicit, separate cross-check endpoint), it invokes `CreateFinancialEntriesOnDoneUseCase.execute({ appointmentId })` via the `onDoneHandler` port. The code also supports an **implementation shortcut** where `ExecuteStatusTransitionUseCase` receives `doneCheckedByUserId` in the same DONE transition call and fires the handler inline — this is NOT the canonical flow (see feature 006 US3 scenario 6). In either path, the use case verifies the appointment is in `DONE` **and** has `doneCheckedByUserId` set, then creates one `TENANT_DEBIT` for `priceAmount` and one `INSPECTOR_PAYOUT` for `payoutAmount` — both starting in `PENDING` status and initiated by the `SYSTEM_USER_ID`. Deterministic UUIDs derived from `(appointmentId, entryType)` guarantee that retries and duplicate invocations never create duplicate rows, even if the idempotency cache is bypassed.

**Why this priority**: This is the money creation path. Correctness here directly determines the integrity of the platform's ledger. The "never without cross-check" invariant is the constitution's hard precondition.

**Independent Test**: Run an appointment through `SCHEDULED → DONE` via the inspector, then `POST /v1/appointments/:id/cross-check-done` as a different operator. Confirm (a) exactly one `TENANT_DEBIT` and one `INSPECTOR_PAYOUT` exist in `PENDING` for that appointment, (b) repeating the cross-check (through idempotency replay) does not create additional rows, (c) attempting manual invocation on an appointment without `doneCheckedByUserId` fails with `DONE_CHECK_REQUIRED`.

**Acceptance Scenarios**:

1. **Given** an appointment in `DONE` with `doneCheckedByUserId` set, **When** `CreateFinancialEntriesOnDoneUseCase` runs, **Then** exactly one `TENANT_DEBIT` (amount = `appointment.priceAmount`) and one `INSPECTOR_PAYOUT` (amount = `appointment.payoutAmount`) are created in `PENDING`, both with `initiatedByUserId = SYSTEM_USER_ID`, currency inherited from the tenant.
2. **Given** an appointment in `DONE` without `doneCheckedByUserId`, **When** the use case is invoked directly, **Then** it fails with `DONE_CHECK_REQUIRED`.
3. **Given** an appointment not in `DONE` status, **When** the use case is invoked, **Then** it returns `{debitEntryId: null, payoutEntryId: null}` silently (no-op, avoids accidental early creation).
4. **Given** the use case is invoked twice for the same appointment, **When** the second call runs, **Then** the idempotency cache returns the first result without re-inserting. If the cache is missing, the deterministic UUIDs + unique index on the row guarantee the DB rejects duplicates and the use case recovers gracefully.
5. **Given** a unique-index violation on either entry, **When** caught, **Then** the use case re-queries to confirm the row exists and proceeds; otherwise it rethrows the error.

---

### User Story 2 — Operator approves a pending financial entry (two-person rule)

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

An AM or OP reviews a `PENDING` entry and approves it. The approver MUST be a different user from the initiator (self-approval is rejected). On approval, `status = APPROVED`, `approvedByUserId`, and `approvedAt` are recorded via a transactional conditional update.

**Why this priority**: Approval is the second step of the two-person rule on money. No entry can be counted toward an invoice or be refunded until it is approved.

**Independent Test**: Create a debit entry automatically via US1. Approve it as an OP (not SYSTEM). Confirm status flips. Try to approve it again → expect `ENTRY_NOT_PENDING`. Try to approve as the initiator → expect `ENTRY_SELF_APPROVAL_NOT_ALLOWED`.

**Acceptance Scenarios**:

1. **Given** an AM or OP actor and a `PENDING` entry whose `initiatedByUserId` is different, **When** they call `POST /v1/financial/entries/:entryId/approve`, **Then** the entry transitions to `APPROVED`, `approvedByUserId = actor.userId`, `approvedAt = now`, and an audit record is written.
2. **Given** an entry in `APPROVED` or `CANCELLED`, **When** approval is attempted, **Then** the request fails with `ENTRY_NOT_PENDING`.
3. **Given** the actor is the same user who initiated the entry, **When** approval is attempted, **Then** the request fails with `ENTRY_SELF_APPROVAL_NOT_ALLOWED`.
4. **Given** a non-AM/OP actor, **When** they attempt approval, **Then** the request is rejected with `FORBIDDEN`.
5. **Given** a concurrent approval race (two operators clicking at the same time), **When** both requests hit the DB, **Then** the conditional UPDATE (`WHERE status = PENDING`) ensures exactly one succeeds — the other fails with `ENTRY_NOT_PENDING`.

---

### User Story 3 — Operator creates a manual adjustment

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

An AM or OP creates a free-form financial entry to correct the ledger — reimbursement, bonus, pricing correction, or any other one-off. Adjustments may reference another entry, an appointment, an inspector, or be pure tenant-level records. Like other entries, they start `PENDING` and require a second approver.

**Independent Test**: Create an adjustment for tenant X with a non-zero amount and a reason. Confirm the row exists in `PENDING`, the audit record carries the reason, and the currency comes from the tenant.

**Acceptance Scenarios**:

1. **Given** an AM or OP actor and a valid tenant, **When** they `POST /v1/financial/entries/adjust` with `amount`, `description`, `reason`, **Then** a `MANUAL_ADJUSTMENT` entry is created in `PENDING` with the actor as initiator. The tenant's `currency` is inherited.
2. **Given** an `appointmentId` referencing a different tenant, **When** submitted, **Then** the request fails with `AUTH_FORBIDDEN` (`Appointment belongs to a different tenant`).
3. **Given** a `referenceEntryId` referencing an entry in a different tenant, **When** submitted, **Then** the request fails with `AUTH_FORBIDDEN`.
4. **Given** an `inspectorId` not eligible for the target tenant (via `clientEligibilityJson`), **When** submitted, **Then** the request fails with `AUTH_FORBIDDEN`.
5. **Given** an inactive tenant, **When** an adjustment is attempted, **Then** the request fails with `TENANT_INACTIVE`.
6. **Given** a replayed request with the same `Idempotency-Key` under scope `manual-adjustment`, **When** submitted, **Then** the cached result is returned.

---

### User Story 4 — Operator issues a refund against an approved debit

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

When an inspection was billed but the service was not actually delivered (e.g., cross-check later revealed evidence issues), an operator creates a refund. The refund is a new `REFUND` entry referencing the original `TENANT_DEBIT`. Only one refund per debit is allowed.

**Independent Test**: Create a debit via US1, approve it via US2, then `POST /v1/financial/entries/:entryId/refund`. Confirm the refund row exists with `referenceEntryId` set. Attempt a second refund → `REFUND_ALREADY_EXISTS`. Attempt refund against a non-debit or unapproved entry → `ENTRY_NOT_REFUNDABLE`.

**Acceptance Scenarios**:

1. **Given** an AM or OP actor and an `APPROVED TENANT_DEBIT`, **When** they `POST /v1/financial/entries/:entryId/refund` with `description` and `reason`, **Then** a `REFUND` entry is created in `PENDING` with `amount = original.amount`, `referenceEntryId = original.id`, same tenant and appointment.
2. **Given** an entry that is not a `TENANT_DEBIT` or not `APPROVED`, **When** refund is attempted, **Then** the request fails with `ENTRY_NOT_REFUNDABLE`.
3. **Given** a debit that already has a refund, **When** a second refund is attempted, **Then** the request fails with `REFUND_ALREADY_EXISTS`.
4. **Given** a non-AM/OP actor, **When** they attempt refund, **Then** the request is rejected with `FORBIDDEN`.
5. **Given** a replayed request with the same `Idempotency-Key` under scope `refund`, **When** submitted, **Then** the cached result is returned.

---

### User Story 5 — List, filter, and read financial entries

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

Operators and agency finance users browse the ledger with filters (tenant, appointment, inspector, entry type, status, date range). Each row exposes all its metadata including reference entry chains. A dedicated summary endpoint reports totals by entry type and pending count for a tenant.

**Acceptance Scenarios**:

1. **Given** an authorized actor, **When** they `GET /v1/financial/entries` with filters, **Then** paginated results are returned. AM may cross-tenant; OP and client roles are scoped to their own tenant.
2. **Given** an authorized actor, **When** they `GET /v1/financial/entries/:id`, **Then** the entry detail is returned with resolved `referenceEntryId` if present.
3. **Given** an AM with optional `tenantId` or an OP (auto-scoped to own tenant), **When** they `GET /v1/financial/entries/summary`, **Then** totals for `totalDebits`, `totalPayouts`, `totalAdjustments`, `totalRefunds`, `pendingCount`, and `currency` are returned (currency is null when the result spans multiple tenants — AM only).

---

### User Story 6 — Operator generates an inspector invoice for a billing period

- **Priority**: P1
- **Status**: IMPLEMENTED (Feedback Round 2026-04-13 item 5 adds a PWA-initiated draft path with a new `PENDING_REVIEW` status — pending planning)
- **Source**: code + approved feedback round

At the end of a billing period (weekly, biweekly, or monthly — configurable per inspector), an operator generates an `InspectorInvoice` that closes the period. The use case sums all `APPROVED INSPECTOR_PAYOUT` entries for the inspector in the date range, persists an invoice row in `CLOSED` status with the total, and enqueues a `billing.generate-invoice-file` worker to produce the PDF. The same `(inspector_id, period_start, period_end)` tuple is unique — requesting it twice returns the existing invoice idempotently.

**Feedback Round 2026-04-13 — item 5 (inspector-initiated draft invoice)** — APPROVED, pending planning:

Inspectors can now initiate a draft invoice from the PWA via the endpoint owned by feature 008 (FR-060). The draft lands as an `InspectorInvoice` row with a new status `PENDING_REVIEW`, distinct from the operator-driven `OPEN` → `CLOSED` path.

- **Admin review flow**: operators see `PENDING_REVIEW` invoices in the existing invoices list (feature 017's UI inherits this automatically via the status filter). From there, the admin approves via `POST /v1/invoices/:invoiceId/approve-draft` (FR-066 — transitions to `CLOSED` and enqueues the existing `billing.generate-invoice-file` worker) or rejects via `POST /v1/invoices/:invoiceId/reject-draft` (FR-067 — hard-deletes the draft row with a mandatory reason, after writing the audit). A `REJECTED` inspector-invoice status is **not** introduced in this round — rejection removes the row.
- **No double-write on the ledger**: the draft does NOT duplicate financial entries. It aggregates existing `APPROVED INSPECTOR_PAYOUT` entries the same way the operator path does, but keeps them in the ledger as-is. Approving a `PENDING_REVIEW` draft flips it to `CLOSED`; rejecting it deletes the draft row without touching the financial entries.
- **Overlap check**: the same `INVOICE_PERIOD_OVERLAP` rule applies across `PENDING_REVIEW`, `OPEN`, `CLOSED`, and `PAID` inspector invoices for the same inspector. A draft and an operator-generated invoice for the same period cannot coexist.
- **017 reconciliation invariants** (feature 017): the new `PENDING_REVIEW` status is **NOT** a valid source for the payment-reconciliation flow. The mark-as-paid, batch mark-as-paid, and payment reversal endpoints (feature 017) continue to operate only on `CLOSED` invoices. This preserves feature 017's invariant that `financial_entry` is not touched by that module.
- **Audit**: the `inspector_invoice.drafted` audit entry (written by feature 008's FR-062) is the canonical record of the inspector-initiated draft. The admin review adds a separate `inspector_invoice.approved` or `inspector_invoice.draft_rejected` audit entry.

> **Feedback Round 2026-04-13** — see `specs/feedback-rounds/2026-04-13-customer-feedback-round-1.md` → item 5.

**Acceptance Scenarios**:

1. **Given** an AM or OP actor, an inspector, and a date range, **When** they `POST /v1/invoices/generate`, **Then** the sum of approved payouts in the range is computed, an `InspectorInvoice` is created in `CLOSED` with `totalAmount`, `generatedByUserId`, `generatedAt`, and a `billing.generate-invoice-file` job is enqueued. Response is `202 Accepted` — the PDF is generated asynchronously.
2. **Given** a request for the exact same `(inspectorId, periodStart, periodEnd)` tuple, **When** submitted again, **Then** the existing invoice is returned idempotently (no new row).
3. **Given** a request for an **overlapping** period (not exact match), **When** submitted, **Then** the request fails with `INVOICE_PERIOD_OVERLAP`.
4. **Given** no approved payouts in the range, **When** generated, **Then** the invoice is created with `totalAmount = 0` (an empty invoice is valid).
5. **Given** a non-AM/OP actor, **When** they attempt generation, **Then** the request is rejected with `FORBIDDEN`.
6. **Given** the `generate-invoice-file` worker completes, **When** it runs, **Then** the invoice's `file_key` is populated with the Supabase Storage object key.

---

### User Story 7 — Operator downloads an invoice PDF

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

An operator downloads the generated invoice PDF. The download endpoint returns a presigned URL from storage.

**Acceptance Scenarios**:

1. **Given** an authorized actor and an invoice with `fileKey` set, **When** they `GET /v1/invoices/:invoiceId/download`, **Then** a presigned URL is returned with a short TTL.
2. **Given** an invoice whose worker has not yet generated the file, **When** download is attempted, **Then** the request fails with `INVOICE_FILE_NOT_GENERATED`.
3. **Given** an invoice in `OPEN` status, **When** download is attempted, **Then** the request fails with `INVOICE_NOT_READY`.
4. **Given** an inspector actor, **When** they attempt to download a different inspector's invoice, **Then** the request fails with `AUTH_FORBIDDEN`.

---

### User Story 8 — List and read invoices

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

Operators browse invoices, filtered by inspector and period range.

**Acceptance Scenarios**:

1. **Given** an AM, OP, or the inspector themselves, **When** they `GET /v1/invoices` (or `/v1/billing/invoices`), **Then** paginated results are returned scoped by role.
2. **Given** an inspector querying another inspector, **When** filtered by a foreign `inspectorId`, **Then** only their own invoices are returned (tenant + inspector scope).
3. **Given** an authorized actor, **When** they `GET /v1/invoices/:id`, **Then** the full invoice detail is returned.

---

### Edge Cases

- **Deterministic UUIDs for auto-generated entries**: `createFinancialEntryId(appointmentId, entryType)` is SHA-1-based and produces stable UUIDs. This is a correctness guarantee, not a security guarantee — the hash protects against duplicate inserts, not against guessing.
- **`DONE_CHECK_REQUIRED` is the hard precondition**: if the appointment is in `DONE` but `doneCheckedByUserId` is null (e.g., INSP marked DONE without cross-check), the use case refuses. This mirrors constitution Principle VI / "cross-check as hard precondition for finance".
- **Financial entry failure is swallowed at the caller**: `ExecuteStatusTransitionUseCase` and `PerformCrossCheckUseCase` wrap the `onDoneHandler.execute()` call in try/catch. If the ledger write fails, the state transition remains valid and operators can re-create the entries manually. This is a deliberate tradeoff tracked as a caller-side concern.
- **Refund amount is fixed**: refund always equals the original debit amount. Partial refunds are tracked as GAP-003.
- **No cancel use case for entries**: `CANCELLED` exists as a status but there is no exposed transition. If an entry needs to be voided, the current path is to create a refund or an opposing manual adjustment.
- **Invoice period boundaries use UTC** — `parseDateOnly` interprets `YYYY-MM-DD` as midnight UTC. Inspectors in non-UTC timezones may see period shifts. Tracked as GAP-005.
- **Deep `referenceEntryId` chains** are allowed — an adjustment can reference an adjustment. Depth is not bounded; analytics tools may need to guard against cycles (theoretically not possible because rows cannot reference rows created later, but worth noting).
- **Duplicate route paths**: `/v1/invoices/*` and `/v1/billing/invoices/*` coexist — legacy of a module rename. Choose one in the frontend client; the server handles both.
- **SYSTEM_USER_ID is the initiator** on auto-created entries. Since no human user can collide with this id, self-approval guard never triggers for these — any AM/OP can approve a system-initiated entry.
- **Multi-currency aggregation** is not supported in the summary endpoint; it returns `currency: null` when rows span tenants with different currencies.
- **Approved entries are immutable**: once approved, neither `status`, `amount`, nor fields can be edited. Corrections go through refunds and adjustments.

## Requirements

### Functional Requirements

All FRs below are `Status: IMPLEMENTED, Source: code` unless otherwise noted.

#### Entry creation

- **FR-001** (**hard precondition**): System MUST refuse `CreateFinancialEntriesOnDoneUseCase` when the appointment lacks `doneCheckedByUserId`. No financial entry is ever created before the two-person cross-check.
- **FR-002**: System MUST create exactly one `TENANT_DEBIT` (using `appointment.priceAmount`) and one `INSPECTOR_PAYOUT` (using `appointment.payoutAmount`) per appointment, in `PENDING` status, initiated by `SYSTEM_USER_ID`.
- **FR-003**: System MUST derive entry ids deterministically from `(appointmentId, entryType)` to guarantee idempotency across retries and duplicate handler invocations.
- **FR-004**: System MUST inherit the `currency` from the tenant on every newly created entry.
- **FR-005**: System MUST use the shared `IIdempotencyService` for the on-done flow with scope `financial-entries-on-done` and 24 h retention.
- **FR-006**: System MUST gracefully recover from unique-index violations by re-reading the row and treating the duplicate as an idempotent result.

#### Approval (two-person rule)

- **FR-010**: System MUST restrict `approve` to AM and OP (own tenant for OP).
- **FR-011** (`implementation decision — more restrictive than dossiê`): System MUST reject self-approval on ALL entries — the approver cannot be the same user who initiated the entry (`EntrySelfApprovalNotAllowedError`). The dossiê recommends dual approval "apenas para eventos financeiros e exceções de alto impacto" (estorno, ajuste manual, reabertura), NOT universally for all entries. The code applies it universally as a stricter operational policy. This is an `IMPLEMENTED` behavior that exceeds the dossiê requirement.
- **FR-012**: System MUST use a conditional UPDATE (`WHERE status = PENDING`) to guarantee exactly one concurrent approval wins.
- **FR-013**: System MUST reject approval on entries not in `PENDING` (`ENTRY_NOT_PENDING`).
- **FR-014**: System MUST record `approvedByUserId` and `approvedAt` atomically with the status change and write an audit record.

#### Manual adjustment

- **FR-020**: System MUST restrict adjustment creation to AM and OP.
- **FR-021**: System MUST validate the target tenant is active.
- **FR-022**: System MUST validate that `appointmentId`, `referenceEntryId`, and `inspectorId` (when provided) belong to the target tenant.
- **FR-023**: System MUST inherit currency from the tenant and persist the actor-supplied `reason`.
- **FR-024**: System MUST support optional `Idempotency-Key` with scope `manual-adjustment`.

#### Refund

- **FR-030**: System MUST allow refunds only against an `APPROVED TENANT_DEBIT`.
- **FR-031**: System MUST enforce at most one `REFUND` entry per source debit (`REFUND_ALREADY_EXISTS`).
- **FR-032**: System MUST set `amount = original.amount`, `referenceEntryId = original.id`, same tenant and appointment, status `PENDING`.
- **FR-033**: System MUST restrict refund creation to AM and OP.
- **FR-034**: System MUST support optional `Idempotency-Key` with scope `refund`.

#### List, read, summary

- **FR-040**: System MUST expose `GET /v1/financial/entries` with filters (`tenantId`, `appointmentId`, `inspectorId`, `entryType`, `status`, date range) and pagination. CL roles scoped to own tenant.
- **FR-041**: System MUST expose `GET /v1/financial/entries/:id` returning the single entry.
- **FR-042**: System MUST expose `GET /v1/financial/entries/summary` returning `totalDebits`, `totalPayouts`, `totalAdjustments`, `totalRefunds`, `pendingCount`, `currency`. The currency is `null` when the summary crosses multiple tenants with different currencies.

#### Inspector invoice

- **FR-050**: System MUST allow AM and OP to generate inspector invoices via `POST /v1/invoices/generate`.
- **FR-051**: System MUST sum only `APPROVED INSPECTOR_PAYOUT` entries in the specified period for the inspector.
- **FR-052**: System MUST enforce `UNIQUE (inspector_id, period_start, period_end)` and return the existing invoice on exact-match duplicate requests.
- **FR-053**: System MUST reject overlapping-but-non-identical period requests with `INVOICE_PERIOD_OVERLAP`.
- **FR-054**: System MUST create invoices in `CLOSED` status (skipping `OPEN`) when generated via this endpoint and enqueue a `billing.generate-invoice-file` worker.
- **FR-055** (`implementation decision — dossiê lists "semanal, quinzenal ou mensal" as options but does not mandate a default; AUD is not specified as default currency`): System MUST default `periodType = BIWEEKLY` and `currency = AUD` when not provided. These are Phase 1 operational defaults, not domain rules.

#### Invoice read & download

- **FR-060**: System MUST expose `GET /v1/invoices` / `GET /v1/billing/invoices` with pagination and filters (`inspectorId`, `status`, date range).
- **FR-061**: System MUST expose `GET /v1/invoices/:id` / `GET /v1/billing/invoices/:id` returning the full invoice detail.
- **FR-062**: System MUST expose `GET /v1/invoices/:id/download` / `GET /v1/billing/invoices/:id/download` returning a presigned storage URL. The download is rejected with `INVOICE_FILE_NOT_GENERATED` if the worker hasn't completed or `INVOICE_NOT_READY` if the invoice is not `CLOSED` or `PAID`.

#### Inspector-initiated draft invoice (Feedback Round 2026-04-13 item 5, NEW)

- **FR-064** (Feedback Round 2026-04-13 item 5, NEW, pending planning): The `InspectorInvoiceStatus` enum MUST add a new value `PENDING_REVIEW` distinct from `OPEN`, `CLOSED`, and `PAID`. Semantics: the invoice was created by an inspector from the PWA (via feature 008 FR-060) and awaits admin review. It does not yet participate in the downloadable-PDF or reconciliation flows.
- **FR-065**: The overlap rule (unique `(inspector_id, period_start, period_end)` and no period overlap with active invoices) MUST treat `PENDING_REVIEW`, `OPEN`, `CLOSED`, and `PAID` as equally blocking. A draft and an operator-generated invoice for the same period cannot coexist.
- **FR-066** (admin approval endpoint, NEW): System MUST expose `POST /v1/invoices/:invoiceId/approve-draft` (alias `POST /v1/billing/invoices/:invoiceId/approve-draft`), restricted to AM and OP actors (OP scoped to the invoice's tenant). The endpoint MUST reject invoices not in `PENDING_REVIEW` with `INVOICE_NOT_PENDING_REVIEW`. On success it MUST: (a) transition the row to `CLOSED` via a conditional UPDATE (`WHERE status = PENDING_REVIEW`) to guarantee exactly-one approval under concurrency, (b) stamp `generatedByUserId` and `generatedAt` from the approver, (c) enqueue the existing `billing.generate-invoice-file` pg-boss worker (same job name and payload shape as the operator-initiated path — no new worker), (d) emit a `inspector_invoice.approved` audit action with `{ inspectorId, invoiceId, periodStart, periodEnd, totalAmount, draftedByInspectorId, approvedByUserId }`. The endpoint is NOT idempotent via natural key (approving twice returns `INVOICE_NOT_PENDING_REVIEW` on the second call); `Idempotency-Key` header is optional for retry safety under scope `inspector-invoice-approve`.
- **FR-067** (admin rejection endpoint, NEW): System MUST expose `POST /v1/invoices/:invoiceId/reject-draft` (alias `POST /v1/billing/invoices/:invoiceId/reject-draft`), restricted to AM and OP actors (OP scoped to the invoice's tenant), accepting a mandatory `{ reason: string }` body (min 10 chars). The endpoint MUST reject invoices not in `PENDING_REVIEW` with `INVOICE_NOT_PENDING_REVIEW`. On success it MUST: (a) hard-delete the invoice row (rejection removes the draft — no `REJECTED` status is introduced in this round), (b) leave all referenced `FinancialEntry` rows untouched (the ledger is unaffected — this is the append-only invariant in action; the draft was never a ledger write), (c) emit a `inspector_invoice.draft_rejected` audit action with `{ inspectorId, invoiceId, periodStart, periodEnd, totalAmount, draftedByInspectorId, rejectedByUserId, reason }` BEFORE the delete so the audit record survives the row removal, (d) NOT enqueue any worker. `Idempotency-Key` header is optional under scope `inspector-invoice-reject-draft`.
- **FR-068**: Feature 017's mark-as-paid, batch mark-as-paid, and payment reversal endpoints MUST reject `PENDING_REVIEW` invoices with an explicit error code (`INVOICE_NOT_READY_FOR_RECONCILIATION`). Feature 017's invariant — that its code path does not touch `financial_entry` — is preserved: rejecting `PENDING_REVIEW` at the reconciliation layer is a route-guard, not a ledger operation.
- **FR-069**: The `GET /v1/invoices` / `GET /v1/billing/invoices` list endpoint MUST accept `PENDING_REVIEW` as a valid `status` filter value so the admin UI can surface the draft queue. No new endpoint is needed — the admin review UI (feature 017's list) inherits this filter.

#### Cross-cutting

- **FR-070**: System MUST audit every `financial_entry.*` (created, approved, refund_created, manual_adjustment_created) and every `invoice.generated`, `inspector_invoice.drafted` (from feature 008), `inspector_invoice.approved`, and `inspector_invoice.draft_rejected` action.
- **FR-071**: System MUST validate all payloads against Zod schemas in `packages/shared/src/schemas/billing.ts`.
- **FR-072**: System MUST treat approved entries as immutable — edits are forbidden; corrections happen through refunds or adjustments.

### Non-Functional Requirements

- **NFR-001** (`Status: APPROVED, Source: dossier`): Entry list/read p95 < 300 ms. Summary p95 < 500 ms. Invoice generation p95 < 1 s for the sync response (PDF worker is async).
- **NFR-002** (`Status: APPROVED, Source: dossier`): The ledger is append-only — no hard delete of `FinancialEntry` rows outside migrations.
- **NFR-003** (`Status: IMPLEMENTED, Source: code`): All entry writes are audited. The audit trail is the authoritative history of financial intent.
- **NFR-004** (`Status: APPROVED, Source: dossier`): Amount fields use `Decimal(12,2)` — never float — to avoid rounding errors.

### Key Entities

- **FinancialEntry** — `id`, `tenant_id`, `appointment_id?`, `inspector_id?`, `entry_type` (`TENANT_DEBIT | INSPECTOR_PAYOUT | REFUND | MANUAL_ADJUSTMENT`), `amount` (Decimal 12,2), `currency`, `status` (`PENDING | APPROVED | CANCELLED`), `description`, `effective_at`, `initiated_by_user_id`, `approved_by_user_id?`, `approved_at?`, `reference_entry_id?`, `reason?`, timestamps.
- **InspectorInvoice** — `id`, `inspector_id`, `period_start`, `period_end`, `period_type` (`WEEKLY | BIWEEKLY | MONTHLY`), `status` (`PENDING_REVIEW | OPEN | CLOSED | PAID` — `PENDING_REVIEW` added by Feedback Round 2026-04-13 item 5, pending planning), `total_amount`, `currency`, `file_key?`, `generated_by_user_id?`, `generated_at?`, `drafted_by_inspector_id?` (Feedback Round 2026-04-13 item 5, NEW — populated on inspector-initiated drafts only), `paid_at?`, `notes?`, timestamps. Unique on `(inspector_id, period_start, period_end)`.
- **Domain helpers**: `createFinancialEntryId(appointmentId, entryType)` deterministic UUID, entity predicates (`isApproved`, `canBeApproved`, `isSelfApproval`).
- **Constants**: `SYSTEM_USER_ID` (shared) used as initiator for auto-generated entries.

Full schema in [`data-model.md`](./data-model.md). HTTP contracts in [`contracts/`](./contracts/).

## Success Criteria

- **SC-001**: No financial entry is ever created for an appointment without `doneCheckedByUserId`. Verified by integration test attempting direct invocation and by a defensive unit test on the use case guard.
- **SC-002**: Self-approval is impossible. Integration test attempts it and asserts `ENTRY_SELF_APPROVAL_NOT_ALLOWED`.
- **SC-003**: Deterministic id idempotency is verified by calling the on-done use case twice on the same appointment and asserting exactly two rows exist across both runs.
- **SC-004**: Concurrent approval race is handled correctly — two simultaneous approve requests for the same entry result in exactly one success and one `ENTRY_NOT_PENDING`.
- **SC-005**: Invoice generation idempotency: calling twice with the same tuple returns the same invoice id without recomputation.
- **SC-006**: Approved entries are immutable — attempts to change any field on an approved row fail at the repository layer.
- **SC-007**: Summary endpoint currency is `null` when the result spans multiple currencies, and a non-null currency when all rows share one.

## Assumptions

**Domain invariants** (approved rules — cannot be relaxed without a product decision):
- Append-only ledger: `FinancialEntry` rows are never hard-deleted in production.
- No financial entries before cross-check: `doneCheckedByUserId` is a hard precondition (FR-001).
- Approved entries are immutable: no field may be updated after `APPROVED`.
- The platform is a ledger, not a payment gateway.

**Phase 1 implementation defaults** (operational choices — may be adjusted without dossiê amendment):
- Two-person approval applied universally to ALL entries (FR-011). The dossiê recommends it "apenas para eventos financeiros e exceções de alto impacto" — the code is more restrictive.
- Invoice default `periodType = BIWEEKLY`, `currency = AUD` (FR-055).
- UTC for period boundaries. Inspectors in other timezones may see minor period offsets.
- `PAID` status exists on `InspectorInvoice` but no endpoint transitions to it in Phase 1 (GAP-008). The invoice lifecycle is incomplete: `OPEN → CLOSED → (PAID is model-ready but not operationally reachable)`.
- Refunds are always for the full debit amount. Partial refunds are not needed in Phase 1.
- Duplicate route paths (`/v1/invoices/*` and `/v1/billing/invoices/*`) — legacy of a module rename.

**Stable assumptions**:
- Currency is inherited from the tenant at entry creation time and frozen on the row. Cross-currency analytics is out of scope.
- Inspector invoices close a period; tenant-side rolled-up invoicing is out of scope (agencies reconcile via the entry list).
- The audit log is authoritative for billing disputes.
- The deterministic UUID scheme uses SHA-1 for idempotency, not security.

## Known Gaps

> Summary index only. Detail in [`tasks.md`](./tasks.md) under Phase 2.

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Cancel use case for PENDING entries | M | `CANCELLED` status exists but no code path transitions into it. Operators must create an opposing adjustment instead. Add a formal cancel endpoint for `PENDING` entries only, AM/OP only, audited. |
| GAP-002 | Automatic DONE→REJECTED compensation | H | When an appointment goes `DONE → REJECTED` (feature 006), the already-created entries should be cancelled/refunded automatically. Today operators must react manually. Pair with 006#GAP-002. |
| GAP-003 | Partial refunds | M | Refund always equals the full original debit. Real scenarios (e.g., only half the rooms inspected) need partial refund support. |
| GAP-004 | Tenant invoice rolled-up document | M | Only inspector invoices are generated. Tenants have to reconcile the entry list manually. Add a tenant invoice that rolls up `TENANT_DEBIT - REFUND + MANUAL_ADJUSTMENT` for a period. |
| GAP-005 | Tenant-timezone period boundaries | L | Period boundaries use UTC. A biweekly close on Saturday UTC is actually Sunday morning in Sydney. Inspectors may see missing or double-counted days at the boundary. Read period timezone from tenant settings (depends on 002#GAP-002). |
| GAP-006 | Void (reverse) approved entries | L | Once approved, only refunds/adjustments can correct an entry. Some legal contexts require an explicit void. Consider adding a void flow gated to AM only with a mandatory reason. |
| GAP-007 | Invoice regeneration | L | A closed invoice cannot be re-summed if late approvals change the total. Add a regeneration flow with audit trail and version tracking. |
| GAP-008 | Invoice PAID marking endpoint | M | `PAID` status exists but no endpoint moves invoices to it. Without an endpoint, operators cannot record payment in the platform. |
| GAP-009 | Summary endpoint date range | L | `GET /v1/financial/entries/summary` takes only `tenantId` — no date range. Operators cannot see month-to-date totals. |
| GAP-010 | Duplicate `/v1/invoices/*` and `/v1/billing/invoices/*` routes | L | Legacy of a module rename. Both paths serve the same handlers. Consolidate behind one canonical path and deprecate the other. |
