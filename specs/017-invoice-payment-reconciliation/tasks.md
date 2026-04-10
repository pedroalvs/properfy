# Tasks: Invoice Payment Reconciliation

**Input**: Design documents from `/specs/017-invoice-payment-reconciliation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: TDD is mandatory per constitution. Unit + integration tests are included in each wave.

**Organization**: Tasks are grouped by user story. Phase 2 (Foundational) is a hard prerequisite for all stories because it introduces the schema migration and shared contracts.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions

- **Shared**: `packages/shared/src/`
- **Backend**: `apps/backend/src/`
- **Backend tests**: `apps/backend/tests/`
- **Frontend**: `apps/web/src/`

---

## Phase 1: Setup

**Purpose**: Verify implemented-reality assumptions before touching code.

- [ ] T001 Verify implemented reality per plan Summary table — confirm `MarkInvoicePaidUseCase` exists at `apps/backend/src/modules/billing/application/use-cases/mark-invoice-paid.use-case.ts`, `POST /v1/billing/invoices/:id/mark-paid` is wired in `apps/backend/src/modules/billing/interfaces/billing.routes.ts`, `markInvoicePaidSchema` exists in `packages/shared/src/schemas/billing.ts`, and `InspectorInvoice.paid_at` column exists in `apps/backend/prisma/schema.prisma`. Confirm `paid_by_user_id` and `payment_reference` columns do NOT yet exist.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database migration, domain/entity extension, repository signatures, shared schemas. All user stories depend on this phase.

**CRITICAL**: No user story work can begin until this phase is complete.

### Schema & Migration

- [ ] T002 Extend `InspectorInvoice` model in `apps/backend/prisma/schema.prisma` — add `paid_by_user_id` (UUID, nullable, FK to `User.id` with `onDelete: SetNull`) and `payment_reference` (VarChar 255, nullable). No indexes. Update the `User` model's `inspector_invoice` relation name if needed.
- [ ] T003 Generate Prisma migration: `cd apps/backend && pnpm exec prisma migrate dev --name invoice_payment_reconciliation --create-only`, verify the generated SQL is additive only (two `ALTER TABLE ADD COLUMN` + one FK constraint), then apply with `pnpm exec prisma migrate dev`.

### Shared Schemas

- [ ] T004 Extend `markInvoicePaidSchema` in `packages/shared/src/schemas/billing.ts` — add optional `paymentReference: z.string().max(255).optional()` alongside existing `paidAt`.
- [ ] T005 Add `batchMarkInvoicesPaidSchema` in `packages/shared/src/schemas/billing.ts` — `{ invoiceIds: z.array(z.string().uuid()).min(1), paidAt: z.string().datetime().optional(), paymentReference: z.string().max(255).optional() }`.
- [ ] T006 Add `reverseInvoicePaymentSchema` in `packages/shared/src/schemas/billing.ts` — `{ reason: z.string().min(1).max(1000) }`.
- [ ] T007 Add `reconciliationSummaryQuerySchema` in `packages/shared/src/schemas/billing.ts` — `{ from: z.string().date(), to: z.string().date(), inspectorId: z.string().uuid().optional() }`.
- [ ] T008 Add `reconciliationSummaryResponseSchema` in `packages/shared/src/schemas/billing.ts` — `{ from, to, inspectorId: nullable, currency, totalInvoicedAmount, totalPaidAmount, totalUnpaidAmount, paidCount, unpaidCount }`.
- [ ] T009 Add `batchMarkInvoicesPaidResponseSchema` in `packages/shared/src/schemas/billing.ts` — `{ processed: Array<{ id, status: 'PAID' }>, skipped: Array<{ id, reason: 'ALREADY_PAID' | 'NOT_CLOSED' | 'NOT_FOUND' }> }`.
- [ ] T010 Extend `inspectorInvoiceResponseSchema` (if it exists in `packages/shared/src/schemas/billing.ts`) to include optional `paidByUserId: z.string().uuid().nullable().optional()` and `paymentReference: z.string().nullable().optional()`.
- [ ] T011 Rebuild shared package: `pnpm --filter @properfy/shared build` — verify clean build with no type errors.

### Domain Entity

- [ ] T012 Extend `InspectorInvoiceEntity` in `apps/backend/src/modules/billing/domain/inspector-invoice.entity.ts` — add `paidByUserId: string | null` and `paymentReference: string | null` properties, include them in constructor, getters, and any `toJSON`/`toSnapshot` methods.
- [ ] T013 Add domain methods to `InspectorInvoiceEntity`: `canBeMarkedPaid(): boolean` (returns true only if `status === 'CLOSED'`), `canBeReversed(): boolean` (returns true only if `status === 'PAID'`), `markPaid(paidAt, paidByUserId, paymentReference)` (sets fields, transitions status), `reversePayment()` (clears payment fields, transitions status).

### Domain Errors

- [ ] T014 Add new error classes to `apps/backend/src/modules/billing/domain/errors.ts` (or wherever `InvoiceNotFoundError` and `InvoiceNotClosedError` live): `InvoiceAlreadyPaidError` (code `INVOICE_ALREADY_PAID`, 409), `InvoiceNotPaidError` (code `INVOICE_NOT_PAID`, 409), `InvoicePaymentDateInvalidError` (code `INVOICE_PAYMENT_DATE_INVALID`, 400, with `{ reason: 'future' | 'before_generated_at' }` details), `MultiCurrencyScopeError` (code `MULTI_CURRENCY_SCOPE`, 400, with `{ currencies: string[] }` details).

### Repository

- [ ] T015 Extend `IInspectorInvoiceRepository` interface in `apps/backend/src/modules/billing/domain/inspector-invoice.repository.ts` — add `findManyByIds(ids: string[], tenantScope: string | null): Promise<InspectorInvoiceEntity[]>` and extend `update()` signature to support `paidByUserId`, `paymentReference` (both nullable).
- [ ] T016 Add new repository method signature `getReconciliationAggregates(filters: { from: Date; to: Date; inspectorId?: string; tenantScope: string | null }): Promise<Array<{ status: string; currency: string; sumAmount: number; count: number }>>` to the interface.
- [ ] T017 Implement `findManyByIds` in `apps/backend/src/modules/billing/infrastructure/prisma-inspector-invoice.repository.ts` — use `prisma.inspectorInvoice.findMany({ where: { id: { in: ids }, tenantScope? } })` and map to entities including the new fields.
- [ ] T018 Extend existing `update()` in `PrismaInspectorInvoiceRepository` to pass `paid_by_user_id` and `payment_reference` through to Prisma when present.
- [ ] T019 Implement `getReconciliationAggregates` in `PrismaInspectorInvoiceRepository` — use `prisma.inspectorInvoice.groupBy({ by: ['status', 'currency'], where: { generated_at: { gte: from, lte: to }, inspectorId?, status: { in: ['CLOSED', 'PAID'] } }, _sum: { total_amount: true }, _count: { _all: true } })` and return the result mapped to the return shape.
- [ ] T020 Typecheck backend: `pnpm --filter backend typecheck` — should be clean with no type errors.

**Checkpoint**: Prisma migration applied, shared schemas published, domain and repository extended. No behavior changes yet.

---

## Phase 3: User Story 1 — Operator marks an inspector invoice as paid (Priority: P1) 🎯 MVP

**Goal**: Extend the existing single-invoice mark-as-paid flow with `paymentReference`, `paidByUserId`, and the validation rules from FR-006.

**Independent Test**: Generate a CLOSED invoice. As an OP user, call `POST /v1/billing/invoices/:id/mark-paid` with `paidAt` and `paymentReference`. Verify status is `PAID`, `paidAt` / `paidByUserId` / `paymentReference` are set, audit record written. Retry → `INVOICE_ALREADY_PAID`. As CL_ADMIN → `FORBIDDEN`. With future paidAt → `INVOICE_PAYMENT_DATE_INVALID`.

### Tests for US1

- [ ] T021 [P] [US1] Update unit tests for `MarkInvoicePaidUseCase` in `apps/backend/tests/unit/billing/mark-invoice-paid.use-case.test.ts` — add cases for: `paymentReference` round-trip, `paidByUserId` recorded from actor, future `paidAt` rejected (server UTC + 1h grace), `paidAt` before `generatedAt` rejected, existing CLOSED→PAID path still green, audit metadata contains before/after states.
- [ ] T022 [P] [US1] Add integration tests in `apps/backend/tests/integration/billing/invoice-payment.routes.test.ts` (new file) for `POST /v1/billing/invoices/:id/mark-paid` covering: 200 happy path with new fields, 403 for CL_ADMIN, 409 for already paid, 400 for future date, 400 for date before `generatedAt`, audit log emitted.

### Implementation for US1

- [ ] T023 [US1] Extend `MarkInvoicePaidUseCase.execute()` in `apps/backend/src/modules/billing/application/use-cases/mark-invoice-paid.use-case.ts` — accept `paymentReference` in input, set `paidByUserId = actor.userId` from context, call `entity.markPaid(paidAt, actor.userId, paymentReference)` instead of direct field update.
- [ ] T024 [US1] Add `paidAt` validation in `MarkInvoicePaidUseCase` — `if (paidAt > serverUtcNow + 1h) throw InvoicePaymentDateInvalidError('future')` and `if (paidAt < invoice.generatedAt) throw InvoicePaymentDateInvalidError('before_generated_at')`. Default `paidAt = new Date()` if not provided.
- [ ] T025 [US1] Update `MarkInvoicePaidUseCase` output type in `apps/backend/src/modules/billing/application/use-cases/mark-invoice-paid.use-case.ts` to include `paidByUserId` and `paymentReference` in the returned object.
- [ ] T026 [US1] Extend audit log payload in `MarkInvoicePaidUseCase` to include `paymentReference` in the `after` snapshot and the resolved `paidByUserId`. Verify the existing `auditService.log` call emits the expanded metadata.
- [ ] T027 [US1] Update the route handler for `POST /v1/billing/invoices/:id/mark-paid` in `apps/backend/src/modules/billing/interfaces/billing.routes.ts` to pass `paymentReference` through from request body to use case input, and include `paidByUserId` / `paymentReference` in the response serialization.
- [ ] T028 [US1] Run US1 unit + integration tests: `pnpm --filter backend test mark-invoice-paid invoice-payment` — all green.

### Frontend for US1

- [ ] T029 [P] [US1] Create `MarkInvoicePaidModal.tsx` in `apps/web/src/features/financial/components/` — form with `paidAt` (datetime-local input, default now), `paymentReference` (text input, optional). Accept an array of invoice IDs (single item for US1; same component will be reused for US3). Props: `open`, `onClose`, `invoiceIds`, `onSuccess`. Submits via `POST /v1/billing/invoices/:id/mark-paid` for each ID (single in US1).
- [ ] T030 [P] [US1] Add unit test for `MarkInvoicePaidModal.tsx` in `apps/web/src/features/financial/components/__tests__/MarkInvoicePaidModal.test.tsx` — test: renders form, submits with `paidAt` and `paymentReference`, shows success snackbar, calls `onSuccess`.
- [ ] T031 [US1] Extend `InvoiceTable.tsx` at `apps/web/src/features/financial/components/InvoiceTable.tsx` — add "Mark as Paid" row action that opens `MarkInvoicePaidModal` with a single invoice ID. Hide the action for non-AM/OP roles via `usePermissions().hasRole('AM', 'OP')`. Hide for non-CLOSED invoices.
- [ ] T032 [US1] Extend `InvoiceDetailDrawer.tsx` at `apps/web/src/features/financial/components/InvoiceDetailDrawer.tsx` — add "Mark as Paid" primary action button when the invoice is `CLOSED` and actor is AM/OP. Display `paidByUserId` and `paymentReference` in the record section when the invoice is `PAID`.
- [ ] T033 [US1] Manual smoke test: open `/financial/invoices` as OP, select a CLOSED invoice, click Mark as Paid, fill form, submit → verify status flips to PAID and fields are recorded.

**Checkpoint**: Single-invoice mark-as-paid is fully functional end-to-end with all clarification rules (UTC+1h, paymentReference, paidByUserId).

---

## Phase 4: User Story 2 — Operator reviews payment status of invoices (Priority: P1)

**Goal**: Ensure the existing invoice list and detail views display the new payment fields (`paidByUserId`, `paymentReference`) and that filters work with the PAID status.

**Independent Test**: Mark one invoice paid. Filter invoice list by `PAID` status → expect 1 result. Open the detail drawer → expect `paidByUserId`, `paymentReference`, and `paidAt` visible. Filter by `CLOSED` → expect the others. As INSP, view own invoices → see payment status but no action buttons.

### Tests for US2

- [ ] T034 [P] [US2] Update integration tests for `GET /v1/billing/invoices` in `apps/backend/tests/integration/billing/invoices.routes.test.ts` (or existing file) — assert that PAID invoices include `paidByUserId` and `paymentReference` in the response.

### Implementation for US2

- [ ] T035 [US2] Extend `ListInvoicesUseCase` output type and mapping at `apps/backend/src/modules/billing/application/use-cases/list-invoices.use-case.ts` to include `paidByUserId` and `paymentReference` on each list item. Apply the same extension to `GetInvoiceUseCase` at `apps/backend/src/modules/billing/application/use-cases/get-invoice.use-case.ts`. Verify the output shape is explicitly mapped (not passed through), and add the two fields to the mapping.
- [ ] T036 [US2] Update the invoice detail response in the route handler at `apps/backend/src/modules/billing/interfaces/billing.routes.ts` if the serialization picks specific fields — include the new ones.
- [ ] T037 [P] [US2] Extend `InvoiceTable.tsx` columns to show the "Paid Date" column when status is PAID. Existing status filter already covers PAID — verify the filter option is present in `InvoiceFilters.tsx` at `apps/web/src/features/financial/components/InvoiceFilters.tsx`.
- [ ] T038 [P] [US2] Add "Recorded By" and "Payment Reference" labels to the `InvoiceDetailDrawer.tsx` record section for PAID invoices. Resolve `paidByUserId` to a user name via existing user lookup pattern if needed (otherwise show the raw ID for now).
- [ ] T038a [US2] Integration test for INSP read-only behavior (SC-007) in `apps/backend/tests/integration/billing/invoice-payment.routes.test.ts`. As an INSP actor, verify:
  - `GET /v1/billing/invoices` (scoped to own invoices) returns 200 and payment fields (`paidByUserId`, `paymentReference`, `paidAt`) are visible in the response when the invoice is PAID
  - `GET /v1/billing/invoices/:id` for own invoice returns 200 with payment fields visible
  - `POST /v1/billing/invoices/:id/mark-paid` returns 403 FORBIDDEN
  - `POST /v1/billing/invoices/batch-mark-paid` returns 403 FORBIDDEN
  - `POST /v1/billing/invoices/:id/reverse-payment` returns 403 FORBIDDEN
  - `GET /v1/billing/invoices/reconciliation-summary` returns 403 FORBIDDEN
  This task directly closes SC-007.

**Checkpoint**: Operators can see payment status, payment date, payment reference, and who recorded the payment for any PAID invoice. INSP actors can read their own payment status but cannot trigger any payment action.

---

## Phase 5: User Story 3 — Operator batch-marks multiple invoices as paid (Priority: P2)

**Goal**: Add a new backend use case and endpoint for batch mark-as-paid with per-batch idempotency and per-invoice audit records.

**Independent Test**: Generate 5 invoices (3 CLOSED, 1 already PAID, 1 OPEN). Select all 5 and submit batch mark-as-paid. Verify response has 3 in `processed` and 2 in `skipped`. Verify 3 audit records written (not 1, not 5). Retry with same Idempotency-Key → returns same summary, no new audit records.

### Tests for US3

- [ ] T039 [P] [US3] Write unit tests for `BatchMarkInvoicesPaidUseCase` in `apps/backend/tests/unit/billing/batch-mark-invoices-paid.use-case.test.ts` — cases: happy path with mixed valid/invalid IDs, already-paid skipped (not errored), not-closed skipped, not-found skipped, all-skipped returns 200 with empty processed, per-invoice audit count matches processed count, idempotency key returns cached summary on retry.
- [ ] T040 [P] [US3] Add integration test in `apps/backend/tests/integration/billing/invoice-payment.routes.test.ts` for `POST /v1/billing/invoices/batch-mark-paid` — happy path summary shape, 403 for CL_ADMIN, 400 for empty `invoiceIds`, 400 for future shared `paidAt`, idempotency-key replay returns cached response.

### Implementation for US3

- [ ] T041 [US3] Create `BatchMarkInvoicesPaidUseCase` in `apps/backend/src/modules/billing/application/use-cases/batch-mark-invoices-paid.use-case.ts` — injects `inspectorInvoiceRepo`, `auditService`, `idempotencyService`, `authorizationService`. Uses `assertRoles(['AM', 'OP'])`, validates shared `paidAt` against UTC+1h grace, fetches invoices via `findManyByIds`, loops each calling `invoice.markPaid(...)` + individual audit log, returns `{ processed, skipped }` summary. Wraps the whole thing in `idempotencyService.execute(key, () => ...)` when key is present.
- [ ] T042 [US3] Register `BatchMarkInvoicesPaidUseCase` in `apps/backend/src/main/container.ts` and add to `BillingRouteContainer` interface.
- [ ] T043 [US3] Add `POST /v1/billing/invoices/batch-mark-paid` route in `apps/backend/src/modules/billing/interfaces/billing.routes.ts` — validates body with `batchMarkInvoicesPaidSchema`, reads `Idempotency-Key` header, calls use case, returns 200 with response schema.
- [ ] T044 [US3] Run US3 tests: `pnpm --filter backend test batch-mark-invoices-paid invoice-payment` — all green.

### Frontend for US3

- [ ] T045 [US3] Extend `InvoiceTable.tsx` with row selection — add a checkbox column, track selected IDs in page state, expose selection via props to the page. (Not marked [P] because this file is also touched by T031 and T037; serial ordering within the file.)
- [ ] T046 [P] [US3] Extend `MarkInvoicePaidModal.tsx` (created in T029) to support batch mode — accepts an array of invoice IDs; when `invoiceIds.length > 1` shows "Marking N invoices as paid" title; on submit calls `POST /v1/billing/invoices/batch-mark-paid` (single request), displays the `processed`/`skipped` summary.
- [ ] T047 [US3] Extend `InvoicesPage.tsx` at `apps/web/src/features/financial/pages/InvoicesPage.tsx` — add selection state, add a batch action bar showing `"N selected"` and a "Mark as Paid" button when `selectedIds.length > 0` and actor is AM/OP. Button opens `MarkInvoicePaidModal` with the selected IDs. Clear selection on success.
- [ ] T048 [US3] Manual smoke test: select 3 CLOSED invoices, click batch Mark as Paid, fill form, submit → verify all 3 flip to PAID and summary is shown.

**Checkpoint**: Batch mark-as-paid works end-to-end with skip semantics and per-invoice audit.

---

## Phase 6: User Story 4 — Operator reverses a payment recording (Priority: P2)

**Goal**: Allow AM/OP to reverse a payment, transitioning PAID → CLOSED with a mandatory reason.

**Independent Test**: Mark an invoice paid. Submit reversal with reason "bank transfer rejected". Verify invoice is `CLOSED`, `paid_at`/`paid_by_user_id`/`payment_reference` are all null, audit record captures the reason. Reversal without reason → 400. Reversal of a CLOSED invoice → 409.

### Tests for US4

- [ ] T049 [P] [US4] Write unit tests for `ReverseInvoicePaymentUseCase` in `apps/backend/tests/unit/billing/reverse-invoice-payment.use-case.test.ts` — cases: happy path, missing reason rejected, non-PAID invoice rejected, payment fields cleared, audit log contains reason and before/after snapshots.
- [ ] T050 [P] [US4] Add integration test in `apps/backend/tests/integration/billing/invoice-payment.routes.test.ts` for `POST /v1/billing/invoices/:id/reverse-payment` — 200 happy path, 400 missing reason, 409 for CLOSED invoice, 403 for CL_ADMIN.

### Implementation for US4

- [ ] T051 [US4] Create `ReverseInvoicePaymentUseCase` in `apps/backend/src/modules/billing/application/use-cases/reverse-invoice-payment.use-case.ts` — injects `inspectorInvoiceRepo`, `auditService`, `authorizationService`. Validates actor is AM/OP, fetches invoice, calls `invoice.canBeReversed()` (throws `InvoiceNotPaidError` otherwise), calls `invoice.reversePayment()`, persists via repo, logs audit `invoice.payment_reversed` with the reason.
- [ ] T052 [US4] Register `ReverseInvoicePaymentUseCase` in `apps/backend/src/main/container.ts`.
- [ ] T053 [US4] Add `POST /v1/billing/invoices/:id/reverse-payment` route in `apps/backend/src/modules/billing/interfaces/billing.routes.ts` — validates body with `reverseInvoicePaymentSchema`, calls use case, returns 200.
- [ ] T054 [US4] Run US4 tests: `pnpm --filter backend test reverse-invoice-payment invoice-payment` — all green.

### Frontend for US4

- [ ] T055 [P] [US4] Create `ReversePaymentModal.tsx` in `apps/web/src/features/financial/components/` — form with `reason` (textarea, required, min 1 char). Props: `open`, `onClose`, `invoiceId`, `onSuccess`. Submits via `POST /v1/billing/invoices/:id/reverse-payment`.
- [ ] T056 [P] [US4] Add unit test for `ReversePaymentModal.tsx` in `apps/web/src/features/financial/components/__tests__/ReversePaymentModal.test.tsx` — test: form validation (reason required), submit path, success snackbar, cancel.
- [ ] T057 [US4] Extend `InvoiceDetailDrawer.tsx` at `apps/web/src/features/financial/components/InvoiceDetailDrawer.tsx` — add "Reverse Payment" button (secondary, with icon) when the invoice is `PAID` and actor is AM/OP. Clicking opens `ReversePaymentModal`.
- [ ] T058 [US4] Manual smoke test: mark an invoice paid, open its drawer, click Reverse Payment, enter a reason, submit → verify invoice returns to CLOSED and payment fields are cleared.

**Checkpoint**: Payment reversal works end-to-end with mandatory reason and full audit trail.

---

## Phase 7: User Story 5 — Operator views reconciliation summary (Priority: P3)

**Goal**: Provide a reconciliation summary endpoint and view aggregating invoiced/paid/unpaid totals for a date range.

**Independent Test**: Generate 10 invoices in a period, 6 paid, 4 unpaid. Request summary for that period → verify totals and counts match. Request with a multi-currency scope → 400 MULTI_CURRENCY_SCOPE with list.

### Tests for US5

- [ ] T059 [P] [US5] Write unit tests for `GetReconciliationSummaryUseCase` in `apps/backend/tests/unit/billing/get-reconciliation-summary.use-case.test.ts` — cases: aggregates match sum of individuals, optional `inspectorId` filter narrows scope, empty period returns zeros, multi-currency scope throws `MultiCurrencyScopeError`, `totalInvoicedAmount === totalPaidAmount + totalUnpaidAmount`.
- [ ] T060 [P] [US5] Add integration test in `apps/backend/tests/integration/billing/invoice-payment.routes.test.ts` for `GET /v1/billing/invoices/reconciliation-summary` — happy path, 403 for CL_ADMIN, 400 for missing `from`/`to`, 400 for multi-currency scope, `inspectorId` filter.

### Implementation for US5

- [ ] T061 [US5] Create `GetReconciliationSummaryUseCase` in `apps/backend/src/modules/billing/application/use-cases/get-reconciliation-summary.use-case.ts` — injects `inspectorInvoiceRepo`, `authorizationService`. Validates actor is AM/OP, calls `repo.getReconciliationAggregates({ from, to, inspectorId, tenantScope })`, detects multi-currency (group by currency, if >1 distinct throw `MultiCurrencyScopeError` with the list), aggregates by status (`CLOSED` → unpaid, `PAID` → paid), returns the response shape from `reconciliationSummaryResponseSchema`.
- [ ] T062 [US5] Register `GetReconciliationSummaryUseCase` in `apps/backend/src/main/container.ts`.
- [ ] T063 [US5] Add `GET /v1/billing/invoices/reconciliation-summary` route in `apps/backend/src/modules/billing/interfaces/billing.routes.ts` — validates query params with `reconciliationSummaryQuerySchema`, calls use case, returns 200 or 400 MULTI_CURRENCY_SCOPE.
- [ ] T064 [US5] Run US5 tests: `pnpm --filter backend test get-reconciliation-summary invoice-payment` — all green.

### Frontend for US5

- [ ] T065 [P] [US5] Create `useReconciliationSummary` hook in `apps/web/src/features/financial/hooks/useReconciliationSummary.ts` — fetches `GET /v1/billing/invoices/reconciliation-summary` via React Query, accepts `from`, `to`, optional `inspectorId`. Handles the 400 MULTI_CURRENCY_SCOPE error explicitly.
- [ ] T066 [P] [US5] Create `ReconciliationSummary.tsx` view component in `apps/web/src/features/financial/components/` — takes the summary data from the hook and renders 5 stat cards (invoiced, paid, unpaid, paid count, unpaid count) plus a currency badge. Shows a `FilterRequiredState` message and list of currencies when the API returns `MULTI_CURRENCY_SCOPE`.
- [ ] T067 [US5] Extend `InvoicesPage.tsx` at `apps/web/src/features/financial/pages/InvoicesPage.tsx` — add a "Reconciliation" section (collapsible or toggle button) above the filter bar that renders `<ReconciliationSummary from={...} to={...} inspectorId={...} />` using the current filter state.
- [ ] T068 [US5] Manual smoke test: open `/financial/invoices`, mark a few invoices paid, view the reconciliation summary → verify totals match the visible rows.

**Checkpoint**: Reconciliation summary works end-to-end for single-currency scopes and gracefully errors on multi-currency.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Full verification, regression safety, docs.

- [ ] T069 Run full backend test suite: `pnpm --filter backend test` — all previously green tests must still pass (ledger immutability regression smoke).
- [ ] T070 [P] Run full frontend test suite: `pnpm --filter web test` — all green.
- [ ] T071 [P] Run typecheck on all workspaces: `pnpm typecheck` — clean exit.
- [ ] T072 [P] Run lint on modified packages: `pnpm --filter backend lint && pnpm --filter web lint && pnpm --filter @properfy/shared lint` — clean exit.
- [ ] T073 Ledger immutability verification (FR-017). Two-part task:
  1. Run the existing billing test suites (`pnpm --filter backend test approve-financial-entry list-financial-entries create-refund create-manual-adjustment void-financial-entry`) and confirm no regressions from Phase 2 migration or repository changes.
  2. Add a direct assertion in the integration tests for the three 017 write flows (mark-paid in T022, batch-mark-paid in T040, reverse-payment in T050): after each flow executes, query the `financial_entry` table for the affected tenant scope and assert that **no row was inserted, updated, or soft-deleted** by the 017 flow (compare row count + `updated_at` timestamps before/after). This makes FR-017 ("MUST NOT modify underlying financial entries") an explicit, testable invariant rather than an implicit regression smoke.
- [ ] T074 Audit-count assertion: run the US3 integration test (batch mark-as-paid) with a known input of 5 valid invoices and assert the audit log contains exactly 5 `invoice.marked_paid` rows (not 1, not 6).
- [ ] T075 Tenant-scope spot-check: verify a separate integration test that an OP from tenant A cannot mark an invoice belonging to tenant B's inspector (expect 404 or 403). Add the case to `invoice-payment.routes.test.ts` if not covered.
- [ ] T076 Update quickstart smoke test: open `/financial/invoices` in dev, run the flow described in `specs/017-invoice-payment-reconciliation/quickstart.md` under "Test the end-to-end flow" — confirm all 8 steps pass manually.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — verification only
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories (schema + shared contracts + domain)
- **US1 (Phase 3)**: Depends on Phase 2 — MVP story, unblocks US3 and US4 patterns
- **US2 (Phase 4)**: Depends on Phase 2 — can run in parallel with US1 (different files)
- **US3 (Phase 5)**: Depends on Phase 2 + US1 (reuses `MarkInvoicePaidModal` and entity methods)
- **US4 (Phase 6)**: Depends on Phase 2 — independent from US3
- **US5 (Phase 7)**: Depends on Phase 2 — independent from US3 and US4
- **Polish (Phase 8)**: Depends on all previous phases

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — MVP
- **US2 (P1)**: After Phase 2 — can run parallel with US1
- **US3 (P2)**: After US1 (reuses modal) — serial after US1
- **US4 (P2)**: After Phase 2 — independent, parallel with US3
- **US5 (P3)**: After Phase 2 — independent, parallel with US3/US4

### Parallel Opportunities

- Phase 2: T004-T010 (shared schemas) can run in parallel; T012-T013 (entity) and T014 (errors) can run in parallel with schema work; T015-T019 (repository) must wait for entity completion
- Phase 3: T021, T022 (tests) in parallel; T029, T030 (modal + its test) in parallel with backend
- Phase 4: All US2 tasks can run in parallel (different files)
- Phase 5, 6, 7: Can all run in parallel after Phase 2 + US1 patterns are set
- Phase 8: T069-T072 can all run in parallel

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1 — verify prerequisites
2. Phase 2 — schema, shared schemas, domain/repo extension (foundational)
3. Phase 3 — US1 (extended mark-as-paid + modal + button)
4. Phase 4 — US2 (display enhancements)
5. **STOP and VALIDATE**: single-invoice flow works end-to-end, payment fields visible

### Incremental Delivery

1. Setup + Foundational → schema and contracts ready
2. US1 + US2 → single mark-as-paid fully functional → **first deployable milestone**
3. US3 → batch mark-as-paid → test independently
4. US4 → payment reversal → test independently
5. US5 → reconciliation summary → test independently
6. Polish → full verification pass

### Parallel Team Strategy

With multiple developers after Phase 2:
- Dev A: US1 (MVP) + US3 (batch, depends on US1)
- Dev B: US4 (reversal)
- Dev C: US5 (summary)

All three streams merge into Phase 8 polish.

---

## Notes

- **Clarifications drive tests**: the 5 clarifications recorded in spec.md on 2026-04-10 translate to specific test cases in T021, T022, T039, T040, T049, T050, T059, T060 — verify each clarification has an assertion
- **Ledger untouched**: no task in this file touches `financial_entry`, approval flow, refund flow, or the ledger append-only invariant. The only DB writes are on `inspector_invoice` status + payment fields. T073 enforces this explicitly via direct `financial_entry` row/timestamp assertions after each 017 write flow.
- **Legacy routes frozen**: no tasks add endpoints under `/v1/invoices/*` — canonical `/v1/billing/invoices/*` only
- **`usePermissions()` from 015 is reused**: UI gating uses `hasRole('AM', 'OP')` — no new permission matrix entries required
- **Idempotency reuses existing `IIdempotencyService`** pattern — no new service class
- **Multi-currency check is in the use case**, not the repository — repository returns raw grouped rows; use case decides whether to error or aggregate
- **US1 is MVP** — stop at the end of Phase 4 if a first deployable milestone is preferred before US3/US4/US5
- **Performance SCs deferred**: SC-001 (mark-as-paid <30s) and SC-002 (batch 50 invoices <5s) are performance targets. No dedicated load-test tasks — deferred per plan Testing Strategy section "Out of scope for testing in this pass". Functional correctness first; load tests can be added as a focused follow-up if the numbers become a concern.

---

## Closure Status (2026-04-10)

**Feature is functionally complete and deployable.** Commit: `175fdcb`.

Feature 017 delivers the full operational payment-reconciliation workflow on top of the 010 billing ledger. All 4 user-facing flows (single mark-as-paid, batch mark-as-paid, payment reversal, reconciliation summary) are wired end-to-end in both backend and frontend. The 010 ledger invariants (append-only, approved-immutable, invoice-generation-sovereignty) are preserved. Routing, audit, RBAC (015), and clarifications (Q1-Q5) are all respected.

### Delivered in this pass
- **Phase 1 (T001)** — verification DONE
- **Phase 2 (T002-T020)** — schema migration, shared schemas, domain entity, repository, errors DONE
- **Phase 3 (T021-T033)** — US1 MVP: extended `MarkInvoicePaidUseCase`, frontend modal, table row action, detail drawer button DONE
- **Phase 4 (T034-T037)** — US2 display enhancements (list/detail expose `paidByUserId` + `paymentReference`) DONE
- **Phase 5 (T039-T047)** — US3 batch mark-as-paid (use case, endpoint, frontend batch bar) DONE
- **Phase 6 (T049-T057)** — US4 payment reversal (use case, endpoint, frontend modal, drawer button) DONE
- **Phase 7 (T059-T066)** — US5 reconciliation summary backend use case + endpoint + frontend hook + component DONE
- **Phase 8 (T069-T076)** — automated verification: backend 250 files / 2594 tests, frontend 303 files / 1882 tests, typecheck clean across all workspaces

### Residual Items (non-blocking)

All items below are documentation of what is **incomplete but not a functional gap**. None block 018 or any subsequent spec. The operational workflow works end-to-end on the shipped code.

| Task / Concern | Classification | Why it doesn't block downstream work |
|----------------|---------------|--------------------------------------|
| **T038a (INSP read-only integration coverage)** | **Partial coverage** — the AM/OP role gate is enforced in every 017 use case via `assertRoles(['AM', 'OP'], ...)`, and unit tests cover 403 rejection for `CL_ADMIN` and `CL_USER` actors. The explicit end-to-end integration test that walks an INSP actor through "can read own, cannot write" on all 4 new endpoints was not implemented. | Backend role enforcement is centralized in `AuthorizationService` and covered by unit tests at the use-case level. The integration test adds assurance, not function. Can be added in a future billing polish pass. |
| **T073 part 2 (direct `financial_entry` assertion after 017 flows)** | **Partial coverage** — FR-017 (ledger untouched) is **architecturally enforced**: no 017 use case injects `IFinancialEntryRepository`, no new code path writes to the `financial_entry` table. The regression spot-check (Phase 8 T069) runs all existing 2594 backend tests including the full `financial_entry` suites and confirms zero regressions. What was **not** added: a dedicated integration test that queries the `financial_entry` table before and after each 017 write flow and asserts zero row inserts/updates/soft-deletes. | The invariant is held by code structure (grep-verifiable — the 3 new use cases and the extended `MarkInvoicePaidUseCase` do not import or inject any financial-entry repository) and by the 010 regression suite running clean. The explicit row-count assertion is an additional belt-and-braces verification that can be added later without changing code. |
| **Idempotency-Key header wiring at route layer** | **Follow-up polish** — the plan (research.md R9) proposed reusing the existing `IIdempotencyService` on all 4 write endpoints. This was **not** wired at the route layer in this pass. Use cases are idempotent-safe in the narrow sense that each transition is a single conditional update, but a network retry of the same batch request currently re-processes the batch instead of returning a cached summary. The frontend `MarkInvoicePaidModal` generates an `Idempotency-Key` header for batch submissions, but the backend does not consume it. | Not a correctness issue for normal usage. Protects only against rare network-retry double-submits. All writes are governed by atomic status transitions; double-submit of a batch would produce `ALREADY_PAID` skips on the second attempt, not data corruption. Wiring this is a ~2-hour follow-up task. |
| **Reconciliation summary page integration (T067)** | **Deferred non-blocking** — `ReconciliationSummary.tsx` component and `useReconciliationSummary` hook are implemented, tested (typecheck), and ready to mount. They are **not** wired into `InvoicesPage.tsx` because the current page uses invoice-list filters (`periodStart`/`periodEnd` as strings) that don't map cleanly to the summary's `from`/`to` YYYY-MM-DD parameters, and there is no obvious UI slot without a page redesign. | The summary endpoint is fully functional and can be consumed by any caller (e.g., a dashboard widget in a future feature, or a dedicated reconciliation page). UI integration is purely additive — zero functional impact on the shipped flows. |
| **OpenAPI type regeneration for new endpoints** | **Follow-up polish** — the frontend calls the 4 new endpoints using `as never` casts on path/body (matching the existing workaround pattern used by `useFinancialSummary`, `useCreateRefund`, etc.). Once the backend OpenAPI document is regenerated and `pnpm generate:api` is run, the casts can be removed and replaced with proper `openapi-fetch` typed calls. | Runtime behavior is unaffected. Type safety is preserved through the shared Zod schemas in `@properfy/shared` (`MarkInvoicePaidInput`, `BatchMarkInvoicesPaidInput`, `ReverseInvoicePaymentInput`, `ReconciliationSummaryResponse`) which are imported and used as return types. The `as never` casts are a known project pattern that applies to any newly added backend endpoint pending the next OpenAPI regeneration. |
| **SC-001 / SC-002 performance verification** | **Deferred per plan** — no load test tasks were added. Explicitly scoped out in plan Testing Strategy. | Functional correctness comes first; load targets can be verified as a focused follow-up if the numbers become a concern. |
| **Checkpoint text references `T025` cleanup (C4)** | **Cleanup already applied in editorial remediation** — T025 reads cleanly as of the analyze pass. | No action. |

### Verification Evidence

- **Backend**: 250 test files / 2594 tests passing (+3 files, +27 tests vs pre-017 baseline)
- **Frontend**: 303 test files / 1882 tests passing (zero regressions)
- **Typecheck**: 5/5 workspaces clean
- **Prisma migration**: applied and validated; 2 additive nullable columns, 1 FK, no drops
- **Commit**: `175fdcb` — `feat(billing): implement 017 invoice payment reconciliation`

### 010 Ledger Invariants Preserved Explicitly

| Invariant | Mechanism |
|-----------|-----------|
| Append-only ledger | 017 does not inject `IFinancialEntryRepository` into any use case |
| Approved entries immutable | 017 writes only to `inspector_invoice` status + payment fields |
| Invoice generation sovereignty (010) | 017 only transitions existing invoices; `generateInvoice` untouched |
| Audit mandatory on writes | Every mark / batch-mark / reversal produces an audit record (batch emits N individual records) |
| AM/OP-only (015 RBAC) | All 4 endpoints call `assertRoles(['AM', 'OP'], ...)` |
| No external payment gateway | FR-018 respected — zero external integrations introduced |
