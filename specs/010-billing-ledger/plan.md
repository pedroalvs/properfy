# Implementation Plan: 010-billing-ledger (Draft Invoice Admin Review Delta)

**Branch**: `010-billing-ledger` | **Date**: 2026-04-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feedback Round 2026-04-13 item 5 — admin approve/reject endpoints for inspector-initiated draft invoices (FR-064..FR-069).
**Dependencies**: Feature 008 (IMPLEMENTED — `DraftInspectorInvoiceUseCase`, `PENDING_REVIEW` enum, `drafted_by_inspector_id` column)

> **Scope boundary**: this plan covers ONLY the admin review delta for inspector-drafted invoices. The core billing ledger (entry creation, approval, refund, manual adjustment, operator-initiated invoicing, reconciliation) is already implemented and tested. This plan does NOT rewrite billing — it completes the draft-review cycle started in 008.

## Summary

Feature 008 delivered the inspector-initiated draft invoice flow: inspectors call `POST /v1/inspector/invoices/draft` to create an `InspectorInvoice` in `PENDING_REVIEW` status. What's missing is the **admin side** — two endpoints for operators to approve or reject the draft.

| Item | Nature | Backend | Frontend |
|---|---|---|---|
| **FR-066** — Approve draft | New endpoint | ✅ Use case + route | ✅ Button in invoice detail |
| **FR-067** — Reject draft | New endpoint | ✅ Use case + route | ✅ Button + reason modal |
| **FR-068** — 017 reconciliation guard | Status check already handles it | ✅ Verify only | — |
| **FR-069** — PENDING_REVIEW in list filter | Filter value addition | ✅ Trivial | ✅ Dropdown option |

**What is already done (no work needed):**
- `PENDING_REVIEW` enum value in Prisma schema (from 008's migration)
- `drafted_by_inspector_id` column on `InspectorInvoice` (from 008's migration)
- `DraftInspectorInvoiceUseCase` (from 008's delivery — creates drafts)
- `billing.generate-invoice-file` pg-boss worker (existing — produces PDF from CLOSED invoices)
- `canBeMarkedPaid()` returns `false` for `PENDING_REVIEW` (only `CLOSED` passes) — FR-068 already enforced by the existing entity method
- `batch-mark-paid` + `reverse-payment` check `CLOSED`/`PAID` status — `PENDING_REVIEW` blocked implicitly

**What still needs work:**
1. `ApproveDraftInvoiceUseCase` — transition PENDING_REVIEW → CLOSED + enqueue PDF worker
2. `RejectDraftInvoiceUseCase` — hard-delete the draft row + audit
3. Two new route handlers
4. `PENDING_REVIEW` as valid filter value in invoice list
5. Frontend: approve/reject buttons in invoice detail view

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 + Fastify
**Primary Dependencies**: Prisma ORM, Zod, pg-boss (existing worker), shared AuditService
**Storage**: PostgreSQL (Supabase) — no new migration needed (008 covered schema)
**Testing**: Vitest (unit + integration)

### Implemented Reality vs Approved Target

| Aspect | Current Code | Target (this plan) |
|---|---|---|
| Approve draft endpoint | Does not exist | `POST /v1/billing/invoices/:invoiceId/approve-draft` |
| Reject draft endpoint | Does not exist | `POST /v1/billing/invoices/:invoiceId/reject-draft` |
| PENDING_REVIEW filter | Not in list query filter | Add as valid `status` value in `listInvoicesQuerySchema` |
| 017 reconciliation guard | Already handled: `canBeMarkedPaid()` only accepts CLOSED | Verify via test — no code change |

### Key Architectural Decisions

1. **Approve = PENDING_REVIEW → CLOSED**: the approval transitions the invoice to `CLOSED`, NOT to `OPEN`. This aligns with the existing operator-initiated path where invoices are created directly as `CLOSED`. The `billing.generate-invoice-file` worker is enqueued on approval (same payload as operator path). After approval, the invoice follows the normal CLOSED → PAID flow via feature 017.

2. **Reject = hard-delete**: no `REJECTED` status is introduced. Rejection removes the draft row entirely. The ledger is unaffected (draft invoices don't create financial entries — they only aggregate existing approved payouts). Audit is emitted BEFORE the delete.

3. **Conditional UPDATE for concurrency**: the approve path uses `WHERE status = 'PENDING_REVIEW'` to guarantee exactly-one approval under concurrent requests. If two admins click approve simultaneously, the second gets `INVOICE_NOT_PENDING_REVIEW`.

4. **No new migration**: 008 already added `PENDING_REVIEW` to the enum and `drafted_by_inspector_id` to the model. Zero schema changes in this plan.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| **I. Clean Architecture** | ✅ | Use cases in `billing/application/use-cases/`. Routes in `billing/interfaces/`. |
| **II. Multi-Tenant Safety** | ✅ | OP scoped to own tenant's invoices. AM can access any. |
| **III. TDD** | ✅ | Unit + integration tests for both endpoints. |
| **IV. Contract-First** | ✅ | Zod schemas for approve/reject payloads. |
| **V. Simplicity** | ✅ | 2 use cases, 2 routes, 1 filter addition. No new worker, no new schema. |
| **Audit** | ✅ | `inspector_invoice.approved` + `inspector_invoice.draft_rejected` actions. |
| **Ledger invariant** | ✅ | Rejection does NOT touch financial entries. Approval does NOT create entries — it only closes the aggregation and generates the PDF. |

## Project Structure

```text
# BACKEND — new use cases + routes
apps/backend/src/modules/billing/
├── application/use-cases/
│   ├── approve-draft-invoice.use-case.ts     # NEW
│   └── reject-draft-invoice.use-case.ts      # NEW
├── domain/
│   └── billing.errors.ts                     # Add InvoiceNotPendingReviewError
└── interfaces/
    └── billing.routes.ts                     # 2 new route handlers + filter update

# SHARED
packages/shared/src/schemas/
└── billing.ts                                # Add approve/reject schemas + PENDING_REVIEW to list filter

# FRONTEND (Web Admin — billing/invoices view)
apps/web/src/features/billing/
└── components/
    └── InvoiceDetailDrawer.tsx               # Approve/Reject buttons for PENDING_REVIEW
```

## Execution Strategy

### Phase 1 — Backend: Approve + Reject Use Cases

**Small and focused. 2 use cases + 2 routes.**

| Step | What |
|---|---|
| 1.1 | Add `InvoiceNotPendingReviewError` to `billing.errors.ts` (409, `INVOICE_NOT_PENDING_REVIEW`) |
| 1.2 | Create `ApproveDraftInvoiceUseCase`: find invoice by ID, verify tenant scope (OP), verify `status = PENDING_REVIEW` (else throw), conditional UPDATE to `CLOSED` with `WHERE status = PENDING_REVIEW`, stamp `generatedByUserId` + `generatedAt`, enqueue `billing.generate-invoice-file` worker, emit `inspector_invoice.approved` audit |
| 1.3 | Create `RejectDraftInvoiceUseCase`: find invoice by ID, verify tenant scope, verify `status = PENDING_REVIEW`, emit `inspector_invoice.draft_rejected` audit (BEFORE delete — captures invoiceId, period, total, reason), hard-delete the invoice row, return success |
| 1.4 | Add `approveDraftSchema` (empty body or minimal) and `rejectDraftSchema` (`{ reason: z.string().min(10) }`) to shared schemas |
| 1.5 | Add 2 route handlers in `billing.routes.ts`: `POST /v1/billing/invoices/:invoiceId/approve-draft` and `POST /v1/billing/invoices/:invoiceId/reject-draft`. AM/OP only. |
| 1.6 | Wire both use cases in DI container |
| 1.7 | Add `PENDING_REVIEW` to `listInvoicesQuerySchema` status filter |
| 1.8 | Verify FR-068: write a test confirming `markInvoicePaid` rejects `PENDING_REVIEW` invoices (already enforced by `canBeMarkedPaid()` — just add the test case) |
| 1.9 | Integration tests: approve happy path, reject happy path, approve on non-PENDING_REVIEW → 409, reject without reason → 400, concurrent approve → only one succeeds, PENDING_REVIEW in list filter |

**Checkpoint**: both endpoints work. PDF worker enqueued on approval. Draft deleted on rejection. Ledger untouched.

### Phase 2 — Frontend: Admin Buttons

| Step | What |
|---|---|
| 2.1 | Invoice detail view: when `status === 'PENDING_REVIEW'`, show "Approve" and "Reject" buttons. Approve calls the approve endpoint. Reject opens a reason modal (min 10 chars) then calls the reject endpoint. |
| 2.2 | Invoice list: add `PENDING_REVIEW` to the status filter dropdown |

### Phase 3 — Verification

| Step | What |
|---|---|
| 3.1 | `pnpm typecheck` all workspaces |
| 3.2 | `pnpm --filter backend test` — all pass |
| 3.3 | Verify no new Prisma migration needed |

## Testing Strategy

### Unit Tests
- `ApproveDraftInvoiceUseCase`: happy path (PENDING_REVIEW → CLOSED, generatedByUserId stamped, worker enqueued, audit emitted), non-PENDING_REVIEW → error, invoice not found → error
- `RejectDraftInvoiceUseCase`: happy path (audit emitted BEFORE delete, row deleted, reason persisted in audit), non-PENDING_REVIEW → error, missing reason → error
- FR-068 verification: `MarkInvoicePaidUseCase` rejects PENDING_REVIEW (already enforced, just add test)

### Integration Tests
- Approve route: 201, AM/OP only, CL → 403, already-approved → 409
- Reject route: 200, reason required (min 10), CL → 403
- List filter: `?status=PENDING_REVIEW` returns only draft invoices
- Concurrent approve: two simultaneous calls → one succeeds, other gets 409

## Residual Risks & Assumptions

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Hard-delete on reject loses data | Low | Audit emitted BEFORE delete. The audit record captures all invoice metadata. The financial entries are untouched (never modified by the draft). |
| Worker enqueue on approve fails | Low | Same risk as operator-initiated path. Worker retry handles transient failures. |

### Assumptions

1. **008 delivered everything needed**: `PENDING_REVIEW` enum, `drafted_by_inspector_id`, `DraftInspectorInvoiceUseCase`. No schema changes needed.
2. **The existing `billing.generate-invoice-file` worker handles CLOSED invoices regardless of origin** (operator-generated vs inspector-drafted-then-approved). The worker reads the invoice row, aggregates entries, generates XLSX — no origin check.
3. **No new pg-boss queue**. The approval enqueues the same `billing.generate-invoice-file` job as the operator path.
4. **FR-068 is already enforced** by `canBeMarkedPaid()` returning `false` for non-CLOSED invoices. A test confirms this.

### Scope Fences

| What | Why |
|---|---|
| DraftInspectorInvoiceUseCase | Feature 008 — already delivered |
| Entry creation/approval/refund | Core billing — already implemented |
| Operator-initiated invoice generation | Already implemented |
| Payment reconciliation (mark-paid, batch, reverse) | Feature 017 — already implemented |
| Invoice PDF template | Existing worker — no change |
| REJECTED status for invoices | Spec explicitly excludes: "no REJECTED status introduced in this round" |
