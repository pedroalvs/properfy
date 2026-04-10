# Data Model: Invoice Payment Reconciliation

**Feature**: 017-invoice-payment-reconciliation
**Date**: 2026-04-10

## Entities

### 1. InspectorInvoice (extended)

Existing entity from 010-billing-ledger. Extended with two new payment-tracking columns.

#### Existing fields (no change)

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (pk) | |
| `inspector_id` | UUID (fk) | |
| `period_start` / `period_end` | Date | |
| `period_type` | enum (WEEKLY \| BIWEEKLY \| MONTHLY) | |
| `status` | `InspectorInvoiceStatus` | Includes `OPEN`, `CLOSED`, `PAID`, `SUPERSEDED` (all exist in enum) |
| `total_amount` | Decimal(12,2) | |
| `currency` | char(3) | frozen at generation |
| `file_key` | varchar, nullable | Supabase storage key |
| `generated_by_user_id` | UUID (fk), nullable | |
| `generated_at` | timestamptz, nullable | used by FR-006 validation |
| `paid_at` | timestamptz, nullable | **already exists** |
| `notes` | text, nullable | |
| `previous_invoice_id` | UUID (fk, unique), nullable | regeneration chain |
| `created_at` / `updated_at` | timestamptz | |

#### New fields (additive migration)

| Field | Type | Notes |
|-------|------|-------|
| `paid_by_user_id` | UUID (fk → `user.id`), nullable | Populated when status transitions to `PAID` |
| `payment_reference` | varchar(255), nullable | Free-text operator field for external references |

#### Status transitions (this feature)

```
CLOSED ──(mark-as-paid)──> PAID
PAID   ──(reverse-payment)──> CLOSED
```

- **Mark-as-paid preconditions**: current status is `CLOSED`, `paidAt` is not future, `paidAt` is on or after `generatedAt`, actor is AM or OP
- **Mark-as-paid side effects**: `status = PAID`, `paid_at = <input or now>`, `paid_by_user_id = actor.userId`, `payment_reference = <input or null>`, audit row written
- **Reverse-payment preconditions**: current status is `PAID`, `reason` is non-empty, actor is AM or OP
- **Reverse-payment side effects**: `status = CLOSED`, `paid_at = NULL`, `paid_by_user_id = NULL`, `payment_reference = NULL`, audit row written with reason

**Invariant**: Reversing does not re-assign or re-derive any financial entry. The underlying ledger is untouched.

---

### 2. ReconciliationSummary (runtime, not persisted)

Aggregated view returned by the summary endpoint.

| Field | Type | Notes |
|-------|------|-------|
| `totalInvoicedAmount` | number | Sum of `total_amount` for CLOSED + PAID invoices in scope |
| `totalPaidAmount` | number | Sum of `total_amount` for PAID invoices in scope |
| `totalUnpaidAmount` | number | Sum of `total_amount` for CLOSED invoices in scope |
| `paidCount` | integer | Count of PAID invoices in scope |
| `unpaidCount` | integer | Count of CLOSED invoices in scope |
| `currency` | string (ISO 4217) | Frozen currency of the scope |
| `from` | date | Echo of query parameter |
| `to` | date | Echo of query parameter |
| `inspectorId` | UUID, nullable | Echo of optional filter |

**Invariant**: `totalInvoicedAmount === totalPaidAmount + totalUnpaidAmount` (when scope has a single currency)

**Error case**: If the scope contains invoices in multiple currencies, the endpoint returns `400 MULTI_CURRENCY_SCOPE` with the list of currencies found.

---

### 3. Audit records (existing `audit_logs` table)

This feature writes audit records for every mark and every reversal.

**Mark-as-paid record**:
```json
{
  "action": "invoice.marked_paid",
  "actorType": "USER",
  "actorId": "<userId>",
  "entityType": "InspectorInvoice",
  "entityId": "<invoiceId>",
  "tenantId": "<tenantId>",
  "before": { "status": "CLOSED", "paidAt": null, "paidByUserId": null },
  "after":  { "status": "PAID", "paidAt": "2026-04-10T...", "paidByUserId": "<userId>", "paymentReference": "BT-12345" },
  "metadata": { "batchId": "<opt-idempotency-key>" }
}
```

**Reverse-payment record**:
```json
{
  "action": "invoice.payment_reversed",
  "actorType": "USER",
  "actorId": "<userId>",
  "entityType": "InspectorInvoice",
  "entityId": "<invoiceId>",
  "tenantId": "<tenantId>",
  "reason": "<operator-provided reason>",
  "before": { "status": "PAID", "paidAt": "...", "paidByUserId": "...", "paymentReference": "..." },
  "after":  { "status": "CLOSED", "paidAt": null, "paidByUserId": null, "paymentReference": null }
}
```

Batch operations: N individual audit records (one per processed invoice). Not a single rollup record.

---

## Relationships

```
InspectorInvoice (1) ─── paid_by_user_id ──> User (1) [new FK, nullable]
InspectorInvoice (1) ─── inspector_id    ──> Inspector (1) [existing]
InspectorInvoice (1) ─── previous_invoice_id ──> InspectorInvoice (0..1) [existing, regeneration chain]

Audit (N) ─── entity_id (invoice) ──> InspectorInvoice (1) [loose, via entityType+entityId]
```

## Validation rules

| Rule | Source FR | Enforcement layer |
|------|-----------|-------------------|
| Only CLOSED invoices can be marked paid | FR-004 | Use case (domain check), DB conditional update |
| `paidAt` not in future | FR-006 | Zod schema + use case |
| `paidAt` >= `generatedAt` | FR-006 | Use case (requires fetching invoice first) |
| Only AM/OP can mark paid or reverse | FR-002, FR-012 | `AuthorizationService.assertRoles` |
| Reversal reason mandatory and non-empty | FR-011 | Zod schema (min(1)) |
| Only PAID invoices can be reversed | FR-013 | Use case |
| Batch skips non-CLOSED; does not fail | FR-008 | Use case loop semantics |
| Every mark/reversal produces exactly one audit record | FR-019, FR-020 | Use case invokes `AuditService.log` before committing transition |

## Database Changes

### Migration: `<timestamp>_invoice_payment_reconciliation`

```sql
-- Add payment tracking columns
ALTER TABLE "inspector_invoice"
  ADD COLUMN "paid_by_user_id" UUID,
  ADD COLUMN "payment_reference" VARCHAR(255);

-- Foreign key to user for paid_by_user_id
ALTER TABLE "inspector_invoice"
  ADD CONSTRAINT "inspector_invoice_paid_by_user_id_fkey"
  FOREIGN KEY ("paid_by_user_id") REFERENCES "user"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
```

**Rollback considerations**: The migration is purely additive. Downgrade would `DROP COLUMN` for both columns — safe because they're nullable and have no data on rollback.

**Indexing**: No indexes added in this pass. Reconciliation queries use `status` + `generated_at` which are already indexed. If summary performance becomes an issue at scale, a follow-up migration can add a composite index.

## State Transitions — Invoice Lifecycle

```
        ┌──────── not implemented ─────────┐
        │                                   │
      OPEN ─── close ───> CLOSED ─── mark-paid ───> PAID
                                                     │
                                                  reverse
                                                     │
                                                     ▼
                                                  CLOSED
                                                  (can re-mark)

      SUPERSEDED is a terminal state from regeneration (010#GAP-007)
```

- `OPEN` is reserved for a future draft flow; not used by current generation path
- `SUPERSEDED` exists for invoice regeneration (010#GAP-007, out of scope for 017)
- `CLOSED ↔ PAID` is the only cycle added by 017
- Reversal does NOT create a new invoice row; it updates the existing one
