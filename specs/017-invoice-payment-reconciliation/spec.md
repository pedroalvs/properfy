# Feature Specification: Invoice Payment Reconciliation

**Feature Branch**: `017-invoice-payment-reconciliation`
**Created**: 2026-04-06
**Feature Status**: IMPLEMENTED (2026-04-10) — all 4 operational flows (single mark-as-paid, batch mark-as-paid, payment reversal, reconciliation summary) are wired end-to-end in backend and frontend. 010 ledger invariants preserved. See `plan.md` and `tasks.md` Closure Status sections for delivered scope and residual (non-blocking) items.
**Sources**:
- Code: `apps/backend/src/modules/billing/`, `apps/backend/prisma/schema.prisma` (`InspectorInvoice`, `InspectorInvoiceStatus`), `apps/web/src/features/financial/pages/InvoicesPage.tsx`
- Upstream spec: `010-billing-ledger` (ledger, entries, invoice generation, approval)
- Approved rules: `projeto-consolidado/regras-negocio-respostas-cliente.md` (financial rules), `.specify/memory/constitution.md` (financial rules section)
- Cross-feature: `015-permissions-rbac-matrix` (AM/OP financial authorization)

> **Reading guide.** This spec covers the **operational workflow for recording payments and reconciling inspector invoices**. It sits on top of `010-billing-ledger` which owns the ledger, financial entries, invoice generation, and approval flow. This spec does NOT redefine ledger mechanics — it owns the `CLOSED → PAID` transition and the reconciliation lifecycle.
>
> `Status` values: `IMPLEMENTED` (present in code), `APPROVED` (binding rule), `IMPLEMENTATION DECISION` (decided here, not from dossier), `GAP` (not yet implemented).

## Clarifications

### Session 2026-04-10

- Q: Which date column does the reconciliation summary filter on (`from`/`to` range)? → A: `generatedAt` — the operator mental model is "invoices issued in period X, and their current payment status"
- Q: How should the reconciliation summary behave when the scope contains invoices in multiple currencies? → A: Return `400 MULTI_CURRENCY_SCOPE` with the list of currencies found; caller must narrow filters to obtain a financially coherent summary
- Q: What is the `Idempotency-Key` scope on the batch mark-as-paid endpoint? → A: One key per batch request; retry returns the cached batch summary; per-invoice audit records are written only on the first successful run (matches existing billing idempotency pattern)
- Q: Which timezone does the "paidAt not in the future" validation use? → A: Server UTC with a +1h grace window to absorb clock skew; `paidAt >= generatedAt` is still enforced in addition
- Q: Does `paymentReference` have any uniqueness constraint (per inspector, per tenant, per invoice)? → A: No uniqueness — free-text operator label. Can be shared across multiple invoices (batch payment) and reused after reversal. Serves as audit context, not as an integrity key.

## User Scenarios & Testing

### User Story 1 — Operator marks an inspector invoice as paid (Priority: P1)

- **Status**: NOT IMPLEMENTED (closes 010#GAP-008)
- **Source**: data model + dossier

After an operator has processed an inspector's payment externally (bank transfer, payment platform), they return to Properfy and mark the corresponding invoice as paid. The system records the payment date, the actor who recorded it, and an optional payment reference (e.g., bank transfer ID). The invoice transitions from `CLOSED` to `PAID`. This is an operational recording action — the system does not initiate the actual payment.

**Why this priority**: This is the core gap. Without marking invoices as paid, the billing lifecycle is incomplete and operators cannot distinguish between processed and unprocessed invoices.

**Independent Test**: Generate an invoice for an inspector (via 010). Mark it as paid with a payment date and reference. Verify the invoice status is now `PAID`, `paid_at` is set, and an audit record is written. Attempt to mark it paid again — expect `INVOICE_ALREADY_PAID`.

**Acceptance Scenarios**:

1. **Given** a `CLOSED` invoice, **When** an AM or OP actor submits a mark-as-paid request with `paidAt` (date) and optional `paymentReference`, **Then** the invoice transitions to `PAID`, `paid_at` is set, the payment reference is recorded, and an audit record is written.
2. **Given** a `PAID` invoice, **When** mark-as-paid is attempted again, **Then** the request fails with `INVOICE_ALREADY_PAID`.
3. **Given** an `OPEN` invoice (if the OPEN status is ever used), **When** mark-as-paid is attempted, **Then** the request fails with `INVOICE_NOT_CLOSED` — only `CLOSED` invoices can be marked paid.
4. **Given** a CL_ADMIN, CL_USER, or INSP actor, **When** they attempt to mark an invoice as paid, **Then** the request is rejected with `FORBIDDEN`. (Per 015#role-matrix: financial operations are AM/OP only.)
5. **Given** a mark-as-paid request without `paidAt`, **When** submitted, **Then** the system defaults `paidAt` to the current timestamp.

---

### User Story 2 — Operator reviews payment status of invoices (Priority: P1)

- **Status**: PARTIALLY IMPLEMENTED (invoice list and filters exist; PAID filter works but no invoices reach PAID status)
- **Source**: code

An operator reviews the invoice list to see which invoices are paid and which are still pending payment. The invoice list supports filtering by status (`OPEN`, `CLOSED`, `PAID`), inspector, and date range. Each invoice row shows the payment status, total amount, period, and the payment date if paid. This view is the primary reconciliation dashboard.

**Why this priority**: Operators need visibility into payment status to know what has been processed and what is outstanding.

**Independent Test**: Generate 3 invoices. Mark 1 as paid. Filter by status `CLOSED` — expect 2. Filter by `PAID` — expect 1. Verify the paid invoice shows the payment date and reference.

**Acceptance Scenarios**:

1. **Given** the invoice list page, **When** filtered by status `CLOSED`, **Then** only unpaid/unprocessed invoices are shown.
2. **Given** the invoice list page, **When** filtered by status `PAID`, **Then** only paid invoices are shown with their `paidAt` date and payment reference visible.
3. **Given** an invoice detail view, **When** the invoice is `PAID`, **Then** the detail shows: payment date, payment reference (if provided), and the actor who recorded the payment.
4. **Given** an INSP actor, **When** they view their own invoices, **Then** they can see the payment status and date but cannot mark invoices as paid.

---

### User Story 3 — Operator batch-marks multiple invoices as paid (Priority: P2)

- **Status**: NOT IMPLEMENTED
- **Source**: implementation decision

When an operator processes a batch payment (e.g., pays multiple inspectors in one bank run), they should be able to select multiple `CLOSED` invoices and mark them all as paid in a single action with a shared payment date and optional reference. This reduces repetitive work for the biweekly/monthly payment cycle.

**Why this priority**: Operational efficiency — paying 20+ inspectors individually is slow. Batch processing matches the real-world payment workflow.

**Independent Test**: Generate 5 invoices for different inspectors. Select 3 on the invoice list. Click "Mark as Paid" with a shared payment date. Verify all 3 transition to `PAID`. Verify the remaining 2 are still `CLOSED`.

**Acceptance Scenarios**:

1. **Given** multiple selected `CLOSED` invoices, **When** the operator submits a batch mark-as-paid with a `paidAt` date and optional `paymentReference`, **Then** all selected invoices transition to `PAID` and individual audit records are written for each.
2. **Given** a batch that includes a `PAID` invoice (already processed), **When** submitted, **Then** the already-paid invoice is skipped (not an error) and the remaining invoices are processed. A summary indicates which were skipped.
3. **Given** a batch that includes an `OPEN` invoice, **When** submitted, **Then** the `OPEN` invoice is skipped and the remaining `CLOSED` invoices are processed.

---

### User Story 4 — Operator reverses a payment recording (Priority: P2)

- **Status**: NOT IMPLEMENTED
- **Source**: implementation decision

If an operator mistakenly marks an invoice as paid (e.g., bank transfer was rejected, wrong invoice selected), they need to reverse the payment recording. This transitions the invoice from `PAID` back to `CLOSED`, clears the `paidAt` and payment reference, and writes an audit record with a reason.

**Why this priority**: Errors happen. Without reversal, the only option is manual database intervention, which violates the audit trail.

**Independent Test**: Mark an invoice as paid. Reverse the payment with a reason. Verify the invoice is back to `CLOSED`, `paidAt` is cleared, and an audit record captures the reversal with the reason.

**Acceptance Scenarios**:

1. **Given** a `PAID` invoice, **When** an AM or OP actor submits a payment reversal with a `reason`, **Then** the invoice transitions back to `CLOSED`, `paid_at` is cleared, `payment_reference` is cleared, and an audit record with the reason is written.
2. **Given** a `CLOSED` invoice, **When** reversal is attempted, **Then** the request fails with `INVOICE_NOT_PAID`.
3. **Given** a reversal request without a reason, **When** submitted, **Then** the request fails with a validation error — reason is mandatory for reversals.

---

### User Story 5 — Operator views a reconciliation summary for a billing period (Priority: P3)

- **Status**: NOT IMPLEMENTED
- **Source**: implementation decision

An operator reviews a summary view showing: total invoiced amount for a period, total paid amount, total unpaid amount, and the count of invoices in each status. This helps the operator verify that all invoices for a billing cycle have been paid and identify any outstanding items.

**Why this priority**: Period-level visibility helps operators close billing cycles with confidence.

**Independent Test**: Generate invoices for a billing period. Mark some as paid. View the period reconciliation summary. Verify the totals match: invoiced = paid + unpaid.

**Acceptance Scenarios**:

1. **Given** a date range and optional inspector filter, **When** the operator requests a reconciliation summary, **Then** the system returns: total invoiced amount, total paid amount, total unpaid (closed) amount, count of paid invoices, count of unpaid invoices.
2. **Given** a period with all invoices paid, **When** the summary is viewed, **Then** unpaid amount is zero and unpaid count is zero — the period is fully reconciled.

---

### Edge Cases

- **Invoice with zero total**: An invoice with `totalAmount = 0` (e.g., all payouts were refunded in the period) can still be marked as paid. Zero-amount invoices are legitimate period closures.
- **Late entry approval after invoice closed**: If a payout entry is approved after the invoice covering its period was already closed, the late entry is NOT retroactively included in the closed invoice. A new invoice for the same inspector and period must be generated to capture it. (This is `010#GAP-007` — invoice regeneration is out of scope for this feature.)
- **Payment date in the future**: `paidAt` is validated against `serverUtcNow + 1h` (small grace window). Future payment dates beyond that window are rejected with `INVOICE_PAYMENT_DATE_INVALID`. No tenant or actor timezone lookup is performed.
- **Payment date before invoice generation**: `paidAt` should be validated to be on or after the invoice's `generatedAt` date. You cannot record a payment before the invoice existed.
- **Concurrent mark-as-paid**: If two operators attempt to mark the same invoice as paid simultaneously, the first succeeds and the second receives `INVOICE_ALREADY_PAID`. This is handled by the status transition being atomic.
- **Inspector views own payment status**: INSP can see their invoices' payment status and date via the existing invoice list endpoint (scoped to own invoices). They cannot trigger any payment action.
- **Batch with all invoices already paid**: If all invoices in a batch are already `PAID`, the operation succeeds with a summary indicating all were skipped — no error is returned.

## Requirements

### Functional Requirements

#### Mark as Paid

- **FR-001**: System MUST support transitioning an invoice from `CLOSED` to `PAID` via a dedicated endpoint, recording `paidAt` timestamp, `paidByUserId`, and optional `paymentReference`.
- **FR-002**: Only AM and OP actors may mark invoices as paid (per 015#role-matrix).
- **FR-003**: Marking a `PAID` invoice as paid again MUST fail with `INVOICE_ALREADY_PAID`.
- **FR-004**: Marking an `OPEN` invoice as paid MUST fail with `INVOICE_NOT_CLOSED`.
- **FR-005**: If `paidAt` is not provided, the system MUST default to the current timestamp.
- **FR-006**: `paidAt` MUST be validated against two constraints:
  1. **Not in the future**: `paidAt <= serverUtcNow + 1h` (small grace window to absorb clock skew; no tenant or actor timezone lookup).
  2. **Not before invoice generation**: `paidAt >= invoice.generatedAt`.
  Both constraints apply to single and batch mark-as-paid flows. Validation errors return `INVOICE_PAYMENT_DATE_INVALID`.

#### Batch Payment

- **FR-007**: System MUST support batch mark-as-paid for multiple invoice IDs in a single request with a shared `paidAt` and optional `paymentReference`.
- **FR-008**: In batch mode, invoices that are already `PAID` or not `CLOSED` MUST be skipped without failing the entire batch. A summary of processed vs. skipped invoices MUST be returned.
- **FR-009**: Each processed invoice in a batch MUST produce an individual audit record (on the first successful run only — see FR-009a).
- **FR-009a**: The `Idempotency-Key` header on the batch endpoint applies to **the batch request as a whole**, not per invoice. Retrying the same batch with the same key MUST return the cached batch summary without re-processing invoices and without writing additional audit records. This matches the existing idempotency pattern used by `CreateRefundUseCase` and `CreateFinancialEntriesOnDoneUseCase`.

#### Payment Reversal

- **FR-010**: System MUST support reversing a payment recording, transitioning from `PAID` back to `CLOSED`, clearing `paid_at`, `payment_reference`, and `paid_by_user_id`.
- **FR-011**: Payment reversal MUST require a `reason` (mandatory). The reason is persisted on the audit record.
- **FR-012**: Only AM and OP actors may reverse payments.
- **FR-013**: Reversing a `CLOSED` invoice MUST fail with `INVOICE_NOT_PAID`.

#### Reconciliation Summary

- **FR-014**: System MUST provide a reconciliation summary endpoint returning: total invoiced amount, total paid amount, total unpaid amount, paid count, unpaid count for a given date range. **The date range filters on the invoice's `generatedAt` column** (server timestamp of invoice generation), not on invoice period bounds or payment date. Rationale: reconciliation is "show me invoices issued between X and Y and their current payment status".
- **FR-015**: The summary MUST support optional filters: `inspectorId`, date range (`from`/`to` on `generatedAt`). Date range is mandatory; `inspectorId` is optional.
- **FR-015a**: If the resolved scope contains invoices in more than one currency, the endpoint MUST reject the request with `400 MULTI_CURRENCY_SCOPE` and include the list of currencies found in the error details. This preserves the invariant `totalInvoicedAmount === totalPaidAmount + totalUnpaidAmount`. The caller must narrow filters (e.g., by `inspectorId` or tighter date range) to obtain a financially coherent summary.

#### Invoice Lifecycle Invariants

- **FR-016**: The invoice status lifecycle is: `OPEN → CLOSED → PAID`. Reversal adds: `PAID → CLOSED`. No other transitions are valid.
- **FR-017**: This feature MUST NOT modify the underlying financial entries. Marking an invoice as paid is a status change on the invoice — the ledger entries remain immutable and APPROVED.
- **FR-018**: This feature MUST NOT integrate with any external payment gateway. Payment recording is a manual operational action.

#### Audit

- **FR-019**: Every mark-as-paid action MUST produce an audit record with: actor, invoice ID, `paidAt`, `paymentReference`, previous status, new status.
- **FR-020**: Every payment reversal MUST produce an audit record with: actor, invoice ID, reason, previous status, new status.

### Key Entities

- **InspectorInvoice** (extended, not new) — Existing entity from `010-billing-ledger`. Extended with payment fields: `paid_at` (timestamptz, nullable), `paid_by_user_id` (uuid, FK to users, nullable), `payment_reference` (varchar, nullable). Status transitions: `CLOSED → PAID` (mark) and `PAID → CLOSED` (reversal).
- **ReconciliationSummary** (runtime, not persisted) — Aggregated view for a date range showing invoiced vs. paid totals and counts.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Operators can mark an invoice as paid in under 30 seconds — verified by E2E test measuring the mark-as-paid flow.
- **SC-002**: Batch mark-as-paid processes 50 invoices in under 5 seconds — verified by load test.
- **SC-003**: Every mark-as-paid and reversal produces exactly one audit record — verified by integration test.
- **SC-004**: The invoice list correctly filters by `PAID` status and shows payment date — verified by E2E test.
- **SC-005**: Payment reversal restores the invoice to `CLOSED` with cleared payment fields — verified by integration test.
- **SC-006**: The reconciliation summary totals match the sum of individual invoices — verified by integration test with known amounts.
- **SC-007**: INSP actors can view payment status of their own invoices but cannot mark or reverse payments — verified by role-based integration test.

## Assumptions

- This feature builds on the existing `010-billing-ledger` invoice model. The `InspectorInvoice` entity already has `paid_at` (nullable) and `PAID` status — they just need to be made reachable.
- Payment is recorded manually by operators. There is no payment gateway integration, no bank API, and no automatic payment detection. The platform is a ledger, not a payment processor.
- Partial payments are **out of scope** for Phase 1. An invoice is either fully paid or not paid. Partial payment tracking would require a separate `payments` table, which is a future enhancement.
- Overpayment and underpayment are **out of scope**. The system records whether the invoice total was paid, not the exact amount transferred. Discrepancy handling is done outside the platform.
- `paymentReference` is a free-text field for the operator to record external identifiers (bank transfer ID, payment platform reference). No validation or lookup against external systems. **No uniqueness constraint**: the same reference may be shared across multiple invoices (e.g., a single bank transfer covering many inspectors in a batch payment run) and may be reused after a reversal and re-mark. It serves as an audit label, not as an integrity key.
- Inspector invoices are the only invoice type. Tenant-side invoices (rolled-up billing documents for agencies) do not exist yet (010#GAP-004) and are out of scope for this feature.
- The `OPEN` invoice status is reserved for a future draft workflow. Current invoices are created directly in `CLOSED` status. This feature handles `CLOSED → PAID` transitions.
- Currency is frozen on the invoice at generation time. Payment recording does not involve currency conversion.

## Known Gaps

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Partial payment support | M | System records full-invoice payment only. No tracking of partial amounts paid. Requires a separate `invoice_payments` table if needed. |
| GAP-002 | Payment amount recording | M | The mark-as-paid action does not record the exact amount paid — it trusts that the invoice total was paid. Discrepancy detection is manual. |
| GAP-003 | Tenant-side invoice reconciliation | M | Only inspector invoices exist. Tenant invoices (agency billing documents) are a separate future feature (010#GAP-004). |
| GAP-004 | Period lock mechanism | L | No mechanism to lock a billing period after all invoices are paid. A future enhancement could prevent new invoice generation for a closed period. |
| GAP-005 | Payment export for accounting | L | No export of payment records to external accounting systems. A CSV/XLSX export of the reconciliation summary would support bookkeeping. |
