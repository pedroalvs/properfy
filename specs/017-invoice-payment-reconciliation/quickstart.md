# Quickstart: Invoice Payment Reconciliation

**Feature**: 017-invoice-payment-reconciliation
**Branch**: work on `015-permissions-rbac-matrix` (continuation)

## What this feature does

Closes `010#GAP-008` (mark invoice paid) with full operational workflow. Adds batch payment, payment reversal, and a reconciliation summary. It is a purely additive layer on top of the existing billing ledger — no ledger mechanics change.

## Key files to understand first

### Backend
- `apps/backend/prisma/schema.prisma` — `InspectorInvoice` model (migration adds 2 columns)
- `apps/backend/src/modules/billing/application/use-cases/mark-invoice-paid.use-case.ts` — existing, EXTEND
- `apps/backend/src/modules/billing/domain/inspector-invoice.entity.ts` — EXTEND with new fields and reversal helpers
- `apps/backend/src/modules/billing/infrastructure/prisma-inspector-invoice.repository.ts` — EXTEND
- `apps/backend/src/modules/billing/interfaces/billing.routes.ts` — EXTEND + 3 new endpoints
- `apps/backend/src/main/container.ts` — wire new use cases

### Shared
- `packages/shared/src/schemas/billing.ts` — extend `markInvoicePaidSchema`, add 3 new schemas

### Frontend
- `apps/web/src/features/financial/pages/InvoicesPage.tsx` — wire selection, batch actions, summary
- `apps/web/src/features/financial/components/InvoiceTable.tsx` — row selection + action
- `apps/web/src/features/financial/components/InvoiceDetailDrawer.tsx` — Mark/Reverse buttons
- `apps/web/src/features/financial/components/MarkInvoicePaidModal.tsx` — NEW
- `apps/web/src/features/financial/components/ReversePaymentModal.tsx` — NEW
- `apps/web/src/features/financial/components/ReconciliationSummary.tsx` — NEW
- `apps/web/src/hooks/usePermissions.ts` — reuse for UI gating

## Implementation order (matches plan waves)

### Wave 1 — Schema & Domain (foundational)

1. Edit `apps/backend/prisma/schema.prisma` — add `paidByUserId` and `paymentReference` to `InspectorInvoice`
2. Generate migration: `pnpm --filter backend exec prisma migrate dev --name invoice_payment_reconciliation`
3. Extend `InspectorInvoiceEntity` with new fields and `canBeMarkedPaid()` / `canBeReversed()` helpers
4. Extend `IInspectorInvoiceRepository` with `findManyByIds(ids, tenantScope)`
5. Update `PrismaInspectorInvoiceRepository` to support new fields in `save` / `update`
6. Extend `packages/shared/src/schemas/billing.ts`:
   - `markInvoicePaidSchema` += `paymentReference: z.string().max(255).optional()`
   - New `batchMarkInvoicesPaidSchema`
   - New `reverseInvoicePaymentSchema`
   - New `reconciliationSummaryQuerySchema` + `reconciliationSummaryResponseSchema`
7. `pnpm --filter @properfy/shared build`
8. `pnpm --filter backend typecheck` — should be clean

### Wave 2 — Backend Use Cases

9. EXTEND `mark-invoice-paid.use-case.ts` — accept `paymentReference`, set `paidByUserId`, add validations (future date, before generatedAt). Update unit tests first.
10. NEW `batch-mark-invoices-paid.use-case.ts` + unit tests
11. NEW `reverse-invoice-payment.use-case.ts` + unit tests
12. NEW `get-reconciliation-summary.use-case.ts` + unit tests
13. `pnpm --filter backend test` — all unit tests green

### Wave 3 — Backend Endpoints

14. EXTEND `POST /v1/billing/invoices/:id/mark-paid` — new body, new response fields
15. NEW `POST /v1/billing/invoices/batch-mark-paid`
16. NEW `POST /v1/billing/invoices/:id/reverse-payment`
17. NEW `GET /v1/billing/invoices/reconciliation-summary`
18. Integration tests for all 4 endpoints (happy path, 403, 400, audit emission, idempotency)
19. `pnpm --filter backend test` — integration + unit green

### Wave 4 — Frontend

20. NEW `MarkInvoicePaidModal.tsx` (handles single + batch mode)
21. NEW `ReversePaymentModal.tsx`
22. NEW `ReconciliationSummary.tsx` + `useReconciliationSummary.ts` hook
23. EXTEND `InvoiceTable.tsx` — row selection checkbox + "Mark as Paid" action (hidden for non-AM/OP)
24. EXTEND `InvoiceDetailDrawer.tsx` — Mark as Paid button (if CLOSED) + Reverse Payment button (if PAID)
25. EXTEND `InvoicesPage.tsx` — selection state, batch action bar, reconciliation summary section
26. Component tests + page integration tests
27. `pnpm --filter web test` + `pnpm typecheck`
28. Manual smoke: mark single, mark batch, reverse, view summary

## Running locally

```bash
# Install deps
pnpm install

# Apply the migration (dev)
pnpm --filter backend exec prisma migrate dev

# Backend dev
pnpm --filter backend dev

# Frontend dev
pnpm --filter web dev

# Run backend tests
pnpm --filter backend test

# Run frontend tests
pnpm --filter web test

# Typecheck everything
pnpm typecheck
```

## Test the end-to-end flow (after implementation)

1. Generate a few invoices via the existing `POST /v1/billing/invoices/generate` endpoint
2. Log in as an OP user
3. Open `/financial/invoices` in the frontend
4. Select 2-3 CLOSED invoices → click "Mark as Paid" → confirm with a payment reference
5. Verify they appear with `PAID` status and the reference in the list
6. Open one of them → click "Reverse Payment" → provide a reason
7. Verify it returns to `CLOSED` and payment fields are cleared
8. View the reconciliation summary → verify totals match

## Key design decisions

- **No new database tables** — 2 additive columns on `inspector_invoice`
- **Existing use case extended, not replaced** — preserves backward compatibility
- **Batch = loop inside one request, not a single SQL** — required by FR-009 (per-invoice audit)
- **Reconciliation is a Prisma `groupBy`** — no materialized view at this scale
- **Canonical routes only** — legacy `/v1/invoices/*` frozen
- **Idempotency-Key supported** — reuses existing `IIdempotencyService`
- **Frontend uses `usePermissions()` from 015** — hide, not disable

## What this feature does NOT do

- Any payment gateway integration
- Any automatic payment detection
- Any partial payment tracking
- Any tenant-side invoice reconciliation
- Any ledger / financial entry mutation
- Any invoice regeneration (GAP-007)
