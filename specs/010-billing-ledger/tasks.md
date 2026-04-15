# Tasks: 010-billing-ledger (Draft Invoice Admin Review Delta)

**Input**: `specs/010-billing-ledger/spec.md`, `plan.md`
**Prerequisites**: 008-inspectors-execution IMPLEMENTED (`DraftInspectorInvoiceUseCase`, `PENDING_REVIEW` enum, `drafted_by_inspector_id` column). plan.md rewritten 2026-04-14.
**Tests**: Mandatory — TDD per constitution Principle III.

**Scope**: ONLY the admin approve/reject delta for inspector-drafted invoices (FR-066..FR-069). The core billing ledger is already shipped. This file does NOT cover entry creation, approval, refund, manual adjustment, or reconciliation.

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel
- Exact file paths included

---

## Phase 1: Backend — Approve + Reject + Filter

**Purpose**: Two new use cases, two new routes, one filter update, verification of the existing reconciliation guard. MUST complete before frontend.

**Critical path**: every frontend task depends on Phase 1.

### Error codes + schemas

- [x] T001 [P] Add `InvoiceNotPendingReviewError` to `apps/backend/src/modules/billing/domain/billing.errors.ts` — status 409, code `INVOICE_NOT_PENDING_REVIEW`, message "Invoice is not in PENDING_REVIEW status"

- [x] T002 [P] Add schemas to `packages/shared/src/schemas/billing.ts`:
  **(a)** `rejectDraftInvoiceSchema` = `z.object({ reason: z.string().min(10).max(1000) })`. Export as `RejectDraftInvoiceInput`.
  **(b)** Update `listInvoicesQuerySchema` status enum: add `PENDING_REVIEW` to the allowed values (`z.enum(['PENDING_REVIEW', 'OPEN', 'CLOSED', 'PAID', 'SUPERSEDED'])`)

### Domain/repo prerequisites (C1 + C2 + C3 from analyze)

- [x] T002a Add `draftedByInspectorId: string | null` to `InspectorInvoiceProps` and `InspectorInvoiceEntity` in `apps/backend/src/modules/billing/domain/inspector-invoice.entity.ts`. Map `row.drafted_by_inspector_id` in `mapToEntity` in `apps/backend/src/modules/billing/infrastructure/prisma-inspector-invoice.repository.ts`. This field already exists in the Prisma schema (from 008's migration) but is not read back by the entity. The approve and reject use cases need it for the audit payload.

- [x] T002b Add `deleteById(id: string): Promise<void>` to `IInspectorInvoiceRepository` interface in `apps/backend/src/modules/billing/domain/inspector-invoice.repository.ts`. Implement in `PrismaInspectorInvoiceRepository`: `await this.prisma.inspectorInvoice.delete({ where: { id } })`. The reject use case needs this to hard-delete through the domain port.

- [x] T002c Add `generatedByUserId: string | null` and `generatedAt: Date | null` to `InvoiceUpdateData` in `apps/backend/src/modules/billing/domain/inspector-invoice.repository.ts`. Update the Prisma adapter's `update` method to map these fields: `if (data.generatedByUserId !== undefined) updateData['generated_by_user_id'] = data.generatedByUserId; if (data.generatedAt !== undefined) updateData['generated_at'] = data.generatedAt;`. The approve use case needs these to stamp who approved and when.

### Approve use case (FR-066)

- [x] T003 Create `apps/backend/src/modules/billing/application/use-cases/approve-draft-invoice.use-case.ts` — constructor: `IInspectorInvoiceRepository`, `AuditService`, `AuthorizationService`, `IJobQueue` (from `shared/domain/job-queue` — same pattern as `GenerateInvoiceUseCase`, NOT raw pg-boss).
  `execute({ invoiceId, actor })`:
  (a) RBAC: AM/OP only. **OP scoping note**: follow the same pattern as `MarkInvoicePaidUseCase` — that use case does AM/OP role check only, no per-tenant scoping on invoices. Apply the same here. If the team later decides to add OP-tenant-scoping for invoices, it should be done consistently across all invoice use cases, not just this one.
  (b) Load invoice by ID via `invoiceRepo.findById()`. Not found → `InvoiceNotFoundError`.
  (c) Status check: if NOT `PENDING_REVIEW` → throw `InvoiceNotPendingReviewError`.
  (d) **Conditional UPDATE for concurrency**: call `invoiceRepo.update(invoiceId, { status: 'CLOSED', generatedByUserId: actor.userId, generatedAt: new Date() })` — BUT wrap it with a concurrency guard. Use `prisma.inspectorInvoice.updateMany({ where: { id: invoiceId, status: 'PENDING_REVIEW' }, data: { status: 'CLOSED', generated_by_user_id: actor.userId, generated_at: new Date() } })` and check `result.count === 0` → throw `InvoiceNotPendingReviewError`. This guarantees exactly-one-approval under concurrent requests. **Implementation note**: this may require a dedicated `approveConditional(id, data)` method on the repository, or the use case can call Prisma directly via an injected client for this single operation. Follow whichever pattern the team prefers — the key invariant is the `WHERE status = 'PENDING_REVIEW'` guard.
  (e) Enqueue `billing.generate-invoice-file` via `jobQueue.enqueue('billing.generate-invoice-file', { invoiceId })` — using `IJobQueue` port (same as `GenerateInvoiceUseCase`).
  (f) Emit `inspector_invoice.approved` audit with `{ inspectorId: invoice.inspectorId, invoiceId, periodStart, periodEnd, totalAmount, draftedByInspectorId: invoice.draftedByInspectorId, approvedByUserId: actor.userId }`. The `draftedByInspectorId` comes from the entity (T002a adds it).
  (g) Return `{ invoiceId, status: 'CLOSED', generatedByUserId: actor.userId, generatedAt }`.

### Reject use case (FR-067)

- [x] T004 Create `apps/backend/src/modules/billing/application/use-cases/reject-draft-invoice.use-case.ts` — constructor: `IInspectorInvoiceRepository`, `AuditService`, `AuthorizationService`.
  `execute({ invoiceId, reason, actor })`:
  (a) RBAC: AM/OP only (same scoping pattern as approve — see T003 note).
  (b) Load invoice by ID via `invoiceRepo.findById()`. Not found → `InvoiceNotFoundError`.
  (c) Status check: if NOT `PENDING_REVIEW` → throw `InvoiceNotPendingReviewError`.
  (d) **Emit audit BEFORE delete**: `inspector_invoice.draft_rejected` with `{ inspectorId: invoice.inspectorId, invoiceId, periodStart, periodEnd, totalAmount, draftedByInspectorId: invoice.draftedByInspectorId, rejectedByUserId: actor.userId, reason }`. The `draftedByInspectorId` comes from the entity (T002a). The audit survives the row deletion.
  (e) Hard-delete via `invoiceRepo.deleteById(invoiceId)` (T002b adds this method). Alternatively, use a conditional delete with `WHERE status = 'PENDING_REVIEW'` for concurrency safety — if 0 rows deleted, throw `InvoiceNotPendingReviewError`.
  (f) Do NOT touch any `FinancialEntry` rows — the draft was never a ledger write.
  (g) Do NOT enqueue any worker.
  (h) Return `{ invoiceId, status: 'DELETED' }`.

### Route handlers

- [x] T005 Add two route handlers to `apps/backend/src/modules/billing/interfaces/billing.routes.ts`:
  **(a)** `POST /v1/billing/invoices/:invoiceId/approve-draft` — preHandler: authenticate, validate `invoiceId` param (UUID). Call `ApproveDraftInvoiceUseCase`. Return 200 with result.
  **(b)** `POST /v1/billing/invoices/:invoiceId/reject-draft` — preHandler: authenticate, validate `invoiceId` param + body via `rejectDraftInvoiceSchema`. Call `RejectDraftInvoiceUseCase`. Return 200 with result.
  Both: AM/OP RBAC enforced by the use cases. CL/INSP → 403.

### DI wiring

- [x] T006 Wire `ApproveDraftInvoiceUseCase` and `RejectDraftInvoiceUseCase` in `apps/backend/src/main/container.ts` — instantiate in the billing section, inject `inspectorInvoiceRepo`, `auditService`, `authorizationService`, and `jobQueue` (`IJobQueue` — same instance used by `GenerateInvoiceUseCase`) for approve. Reject only needs repo + audit + authz. Add both to `BillingRouteContainer` interface. Update `tests/helpers/mock-container.ts` with mock entries for both use cases.

### Unit tests

- [x] T007 [P] Write unit test for `ApproveDraftInvoiceUseCase` in `apps/backend/tests/unit/billing/approve-draft-invoice.use-case.test.ts`:
  (a) Happy path: PENDING_REVIEW invoice → status becomes CLOSED, generatedByUserId stamped, worker enqueued, audit `inspector_invoice.approved` emitted. Assert audit payload includes `draftedByInspectorId`.
  (b) Non-PENDING_REVIEW invoice → `InvoiceNotPendingReviewError`.
  (c) Invoice not found → `InvoiceNotFoundError`.
  (d) Non-AM/OP actor → RBAC error.
  Minimum 4 cases.

- [x] T008 [P] Write unit test for `RejectDraftInvoiceUseCase` in `apps/backend/tests/unit/billing/reject-draft-invoice.use-case.test.ts`:
  (a) Happy path: PENDING_REVIEW invoice → audit `inspector_invoice.draft_rejected` emitted with reason, row deleted. Assert audit is emitted BEFORE delete (mock call order).
  (b) Non-PENDING_REVIEW invoice → `InvoiceNotPendingReviewError`.
  (c) Missing/short reason → validation error (handled at route level, but test that use case requires reason).
  (d) Invoice not found → `InvoiceNotFoundError`.
  Minimum 4 cases.

### FR-068 verification (reconciliation guard)

- [x] T009 **VERIFY + TEST** — Write a test case in `apps/backend/tests/unit/billing/fr-068-pending-review-guard.test.ts` confirming that `MarkInvoicePaidUseCase` rejects a `PENDING_REVIEW` invoice. Setup: mock invoice with `status = 'PENDING_REVIEW'`. Call `markInvoicePaid`. Assert `InvoiceNotClosedError` is thrown. This is already enforced by `canBeMarkedPaid()` returning false for non-CLOSED — this test confirms the invariant explicitly for the new status value. **No code change needed** — test only.

### Integration tests

- [x] T010 Write integration test in `apps/backend/tests/integration/billing/draft-invoice-admin-review.test.ts`:
  (a) Approve happy path: seed PENDING_REVIEW invoice, call `POST /v1/billing/invoices/:id/approve-draft` as AM → 200, invoice status in mock becomes CLOSED.
  (b) Reject happy path: seed PENDING_REVIEW invoice, call `POST /v1/billing/invoices/:id/reject-draft` as AM with reason → 200.
  (c) Approve on CLOSED invoice → 409 `INVOICE_NOT_PENDING_REVIEW`.
  (d) Reject without reason → 400.
  (e) CL_ADMIN calls approve → 403.
  (f) List with `?status=PENDING_REVIEW` → returns only PENDING_REVIEW invoices.
  Minimum 6 cases.

**Checkpoint**: `pnpm typecheck && pnpm --filter backend test` green. Approve transitions to CLOSED + enqueues worker. Reject hard-deletes + audits. PENDING_REVIEW filterable in list. FR-068 guard verified.

---

## Phase 2: Frontend — Admin Buttons + Filter

**Purpose**: Approve/Reject affordances in the invoice detail view. PENDING_REVIEW in the list status filter.

- [x] T011 Revise the invoice detail drawer/view in `apps/web/src/features/billing/components/` (find the component that renders invoice details — likely `InvoiceDetailDrawer.tsx` or similar). When `invoice.status === 'PENDING_REVIEW'`:
  **(a)** Show an "Approve" button (primary/green). On click → call `POST /v1/billing/invoices/:id/approve-draft`. On success → refresh invoice detail, show success toast.
  **(b)** Show a "Reject" button (danger/red). On click → open a reason modal (text area, min 10 chars). On submit → call `POST /v1/billing/invoices/:id/reject-draft` with `{ reason }`. On success → navigate back to list (invoice deleted), show success toast.
  **(c)** Both buttons hidden for non-AM/OP roles (read from auth context).

- [x] T012 [P] Add `PENDING_REVIEW` to the invoice list status filter dropdown in `apps/web/src/features/billing/` — find the filter component that renders the status select. Add `{ label: 'Pending Review', value: 'PENDING_REVIEW' }` to the options.

- [x] T013 [P] Add status chip color for `PENDING_REVIEW` in `apps/web/src/lib/status-colors.ts` (or wherever billing status colors are mapped) — use `warning` / orange styling to distinguish from `OPEN`.

**Checkpoint**: Admin can approve/reject draft invoices from the UI. PENDING_REVIEW visible in list filter.

---

## Phase 3: Verification

- [x] T014 Run `pnpm typecheck` across all workspaces — must pass
- [x] T015 Run `pnpm --filter backend test` — all pass (including T007-T010 new tests)
- [x] T016 Run `pnpm --filter web test` — all pass
- [x] T017 Verify no new Prisma migration needed — `npx prisma validate` clean. 008's migration covers all schema changes.
- [x] T018 Verify ledger invariant: grep for any code path that writes to `financial_entries` during approve or reject — must be zero. The approve path only changes invoice status + enqueues PDF worker. The reject path only deletes the invoice row.

**Checkpoint**: Feature 010 draft invoice admin review delta complete. All verifications pass.

---

## Residual Notes

### What is NOT in this task list

- `DraftInspectorInvoiceUseCase` — 008 delivered it
- Entry creation, approval, refund, manual adjustment — core billing, already shipped
- Operator-initiated invoice generation — already shipped
- Payment reconciliation (mark-paid, batch, reverse) — feature 017, already shipped
- Invoice PDF template — existing worker, no change
- `REJECTED` status for invoices — spec explicitly excludes

### What was already implicitly handled

- **FR-068** (017 reconciliation guard): `canBeMarkedPaid()` only returns `true` for `CLOSED`. `PENDING_REVIEW` is already blocked. T009 adds an explicit test to confirm.
- **FR-065** (overlap rule): the overlap check in `DraftInspectorInvoiceUseCase` (from 008) already covers `PENDING_REVIEW` as a blocking status.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Backend)**: No dependencies beyond 008 being done. **BLOCKS Phase 2.**
- **Phase 2 (Frontend)**: Depends on Phase 1 (API endpoints must exist).
- **Phase 3 (Verification)**: Depends on all.

### Critical Path

```
T001-T002 (errors + schemas) → T003-T004 (use cases) → T005-T006 (routes + DI)
→ T007-T010 (tests) → T011-T013 (frontend) → T014-T018 (verification)
```

### Parallel Opportunities

- T001 + T002 parallelizable
- T007 + T008 (unit tests) parallelizable with each other and after T003-T004
- T009 (FR-068 verification) parallelizable with T007-T008
- T012 + T013 (filter + status chip) parallelizable with T011
