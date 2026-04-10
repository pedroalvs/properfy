# Research: Invoice Payment Reconciliation

**Feature**: 017-invoice-payment-reconciliation
**Date**: 2026-04-10

## Research Summary

This research verifies the actual state of the billing module against the spec's assumptions. Several components assumed "not implemented" in the spec turned out to already exist, changing the scope of what 017 must build.

---

## R1: Existing Mark-as-Paid Implementation

**Decision**: Extend the existing `MarkInvoicePaidUseCase` rather than build a new one.

**Finding**: `apps/backend/src/modules/billing/application/use-cases/mark-invoice-paid.use-case.ts` already exists and handles the `CLOSED → PAID` transition with `paidAt`, AM/OP role check, audit logging, and `InvoiceNotClosedError` handling. The canonical endpoint `POST /v1/billing/invoices/:id/mark-paid` is exposed in `billing.routes.ts` and uses `markInvoicePaidSchema` from `packages/shared/src/schemas/billing.ts`.

**Rationale**: Rewriting would break 2567 passing backend tests. Extending preserves the existing contract and adds only the new concerns (`paymentReference`, `paidByUserId`, future-date / before-generatedAt validations).

**Alternatives considered**:
- Rewrite the use case — rejected: regression risk, wasted work
- Add a new `recordPayment` use case alongside — rejected: confusing, two parallel paths for the same intent

---

## R2: Missing Columns on `InspectorInvoice`

**Decision**: Add two new nullable columns via a pure expand-only migration.

**Finding**:
- `paid_at` — already exists in Prisma schema
- `paid_by_user_id` — **missing**
- `payment_reference` — **missing**

**Migration plan**:
```sql
ALTER TABLE "inspector_invoice"
  ADD COLUMN "paid_by_user_id" UUID,
  ADD COLUMN "payment_reference" VARCHAR(255),
  ADD CONSTRAINT "inspector_invoice_paid_by_user_id_fkey"
    FOREIGN KEY ("paid_by_user_id") REFERENCES "user"("id");
```

Both columns are nullable — existing rows are unaffected. No index on these columns initially; reconciliation queries will use `status` + `generated_at` filters which are already indexed.

**Alternatives considered**:
- JSONB payment metadata column — rejected: less queryable, poorer audit trail
- Separate `invoice_payment` table — rejected: overkill for single-payment-per-invoice model; spec GAP-001 (partial payments) explicitly defers the multi-payment model

---

## R3: Batch Mark-as-Paid Semantics

**Decision**: Process invoices individually inside a single use case call, collecting per-invoice results. Continue on skip (PAID/OPEN), fail on hard errors.

**Rationale**: Per FR-008, batch must skip already-paid or non-CLOSED invoices without aborting the whole batch. This matches the spec's "continue on skip" semantics. Per FR-009, each processed invoice must produce its own audit record, so batch can't be a single SQL statement — it's a loop that calls the single-invoice logic N times inside one HTTP request.

**Shape**:
```typescript
interface BatchMarkResult {
  processed: Array<{ id: string; status: 'PAID' }>;
  skipped: Array<{ id: string; reason: 'ALREADY_PAID' | 'NOT_CLOSED' | 'NOT_FOUND' }>;
}
```

**Concurrency**: Each invoice transition is atomic at the DB level via Prisma's `update` with a `where: { id, status: 'CLOSED' }` clause (Prisma 5+ supports conditional updates). If two operators race, the second call returns zero updated rows and the use case logs a skip.

**Alternatives considered**:
- Fail the whole batch on any skip — rejected: contradicts FR-008
- Delegate batching to the caller (frontend loops over single calls) — rejected: N HTTP round-trips, no atomicity per batch for audit correlation

---

## R4: Payment Reversal Semantics

**Decision**: Dedicated `ReverseInvoicePaymentUseCase` that transitions `PAID → CLOSED`, clears payment fields, and requires a mandatory reason.

**Finding**: Spec FR-010 through FR-013 define the reversal contract. No existing code handles this. The use case is net-new.

**Invariants**:
- Mandatory `reason` — validation at Zod schema level (min length 1)
- Only AM/OP — `AuthorizationService.assertRoles(['AM', 'OP'], ...)`
- Only from `PAID` status — throws `InvoiceNotPaidError` otherwise
- Clears `paid_at`, `paid_by_user_id`, `payment_reference` on reversal
- Audit record includes before/after states and the reason

**Edge case handled**: If reversal happens on an invoice that was already reversed once and re-marked paid, the new payment metadata is whatever was set on the most recent mark-as-paid — the audit trail captures the history. The invoice itself only stores current state.

---

## R5: Reconciliation Summary Aggregation

**Decision**: Single aggregation query using Prisma `groupBy` on `inspector_invoice` with filters. No materialized view.

**Rationale**: Spec FR-014 requires aggregated totals (invoiced, paid, unpaid) and counts for a date range with optional inspector filter. At expected scale (~100 invoices/tenant/month), a direct `SELECT SUM(total_amount), COUNT(*) FROM inspector_invoice WHERE ... GROUP BY status` is fast enough.

**Query shape**:
```typescript
const rows = await prisma.inspectorInvoice.groupBy({
  by: ['status'],
  where: {
    inspectorId: filter.inspectorId,
    generatedAt: { gte: filter.from, lte: filter.to },
    status: { in: ['CLOSED', 'PAID'] },
  },
  _sum: { totalAmount: true },
  _count: { _all: true },
});
```

Then reshape into the response:
```typescript
{
  totalInvoicedAmount: paidSum + unpaidSum,
  totalPaidAmount: paidSum,
  totalUnpaidAmount: unpaidSum,
  paidCount,
  unpaidCount,
  currency: <frozen — see R6>,
}
```

**Ambiguity flagged**: The spec says "date range" but doesn't specify whether it filters by `generatedAt` or by invoice period (`periodStart`/`periodEnd`). Default to `generatedAt` — matches the natural "reconciliation for the billing run that happened in X" operator mental model. If pushed back, add a second parameter.

**Alternatives considered**:
- Materialized view refreshed hourly — rejected: premature, adds ops overhead
- Loop over `list-invoices` and sum in application code — rejected: pulls unbounded rows, wrong layer

---

## R6: Multi-Currency in Reconciliation Summary

**Decision**: Scope reconciliation summary to a single currency per query. Return the currency alongside totals.

**Rationale**: Invoices freeze currency at generation time. A tenant may theoretically have invoices in multiple currencies, but in practice tenants operate in one currency (`AUD` for the current market). Summing across currencies is meaningless.

**Approach**:
- First query fetches distinct currencies in scope
- If more than one, return an error/warning with the list of currencies
- Otherwise, aggregate and return with that currency

This is a conservative default. If a future tenant needs multi-currency, the summary endpoint can be split per currency — but that's a future enhancement.

---

## R7: Frontend Permission Gating

**Decision**: Use `usePermissions()` from 015 to hide mark-as-paid and reverse-payment actions for non-AM/OP actors.

**Finding**: The `usePermissions()` hook was added in the 015 closure (`apps/web/src/hooks/usePermissions.ts`) and exposes `hasRole()` and `canPerform()`. The shared role matrix already lists `financial.mark_paid` and `financial.reverse_payment` implicitly through the `financial.*` permissions, but these specific action keys don't exist yet in the matrix.

**Plan**:
- Use `hasRole('AM', 'OP')` for UI gating (simple, explicit)
- Do NOT add new action keys to the matrix in this pass — backend is the authoritative gate
- Hide, not disable, per 014 FR-008

---

## R8: Legacy `/v1/invoices/*` Routes

**Decision**: New endpoints go under canonical `/v1/billing/invoices/*` only. Legacy routes stay frozen at their existing surface until the November 2026 sunset.

**Rationale**: Deprecation headers are already in place on legacy routes. Mirroring new endpoints under the legacy prefix would grow the deprecated surface without benefit. Frontend consumes the canonical prefix.

---

## R9: Idempotency for Write Endpoints

**Decision**: Support `Idempotency-Key` header on mark-paid, batch-mark-paid, and reverse-payment — reuse the existing `IIdempotencyService` already used by `CreateFinancialEntriesOnDoneUseCase`, `CreateRefundUseCase`, etc.

**Rationale**: Constitution requires idempotency on critical commands. Payment recording is unambiguously a critical command. Reuse the existing pattern rather than reinventing.

**Approach**:
- Route layer reads `Idempotency-Key` from request headers (optional — warn in logs if missing)
- Use case receives the key, looks up prior result, or records the new result
- Same pattern as `approve-financial-entry.use-case.ts`

---

## R10: Reconciliation Summary — GET vs POST

**Decision**: Use `GET /v1/billing/invoices/reconciliation-summary` with query parameters.

**Rationale**: It's a read operation. Query parameters are sufficient for `inspectorId`, `from`, `to`. No large request body. Cacheable at the HTTP layer in the future.

---

## Unknowns Resolved / Remaining

| Unknown | Status |
|---------|--------|
| Does `MarkInvoicePaidUseCase` already exist? | Resolved: yes, partial |
| Are `paid_by_user_id` and `payment_reference` columns present? | Resolved: no, migration needed |
| How are legacy routes handled? | Resolved: frozen, new endpoints canonical-only |
| Is concurrent mark-as-paid handled atomically? | Resolved: Prisma conditional update |
| Should summary filter by `generatedAt` or `period`? | **Flagged**: default `generatedAt`; open for pushback |
| Multi-currency in summary? | Resolved: error on multi-currency scope |

No unresolved `NEEDS CLARIFICATION` items block implementation.
