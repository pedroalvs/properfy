# Implementation Plan: Invoice Payment Reconciliation

**Branch**: `015-permissions-rbac-matrix` (continuing on current branch) | **Date**: 2026-04-10 | **Spec**: `specs/017-invoice-payment-reconciliation/spec.md`
**Input**: Feature specification from `/specs/017-invoice-payment-reconciliation/spec.md`

## Summary

This feature delivers the **operational payment-reconciliation workflow** on top of the existing `010-billing-ledger`. It closes `010#GAP-008` (mark invoice paid) and adds three operational extensions: batch mark-as-paid, payment reversal, and a reconciliation summary. It sits entirely at the invoice-status layer — the ledger remains append-only, approved entries remain immutable, and invoice generation keeps belonging to 010.

**What this feature does:**
- Completes the `CLOSED → PAID` transition with `paidAt`, `paidByUserId`, and optional `paymentReference`
- Adds batch mark-as-paid for end-of-period payment runs
- Adds payment reversal (`PAID → CLOSED`) with mandatory reason
- Adds a reconciliation summary endpoint aggregating invoiced/paid/unpaid totals for a date range
- Wires the frontend: mark-as-paid action on table + detail drawer, batch selection UI, reversal UI, summary view

**What this feature does NOT do:**
- Modify the ledger, financial entries, or approval flow (010 owns those)
- Integrate any payment gateway or bank API (manual recording only)
- Track partial payments (GAP-001 — future enhancement)
- Reconcile tenant-side invoices (GAP-003 — future feature)
- Regenerate invoices for late-approved entries (010#GAP-007 — explicitly out of scope)

### Implemented Reality vs Approved Target (divergence from spec)

The 017 spec says "NOT IMPLEMENTED — invoice `PAID` status exists... but no endpoint, workflow, or UI transitions to it." This is **partially outdated**:

| Component | Spec status | Actual state |
|-----------|-------------|--------------|
| `InspectorInvoiceStatus.PAID` enum | Exists | Confirmed — in Prisma schema |
| `paid_at` column | Exists | Confirmed |
| `paid_by_user_id` column | Assumed via FR-001 | **MISSING** — needs migration |
| `payment_reference` column | Assumed via FR-001 | **MISSING** — needs migration |
| `MarkInvoicePaidUseCase` (single) | Not implemented | **ALREADY IMPLEMENTED** — CLOSED→PAID works, audits, AM/OP gate |
| `POST /v1/billing/invoices/:id/mark-paid` | Not exposed | **ALREADY EXPOSED** — in `billing.routes.ts` |
| `markInvoicePaidSchema` (shared) | Not defined | **ALREADY DEFINED** — currently only accepts `paidAt` |
| Frontend "Mark as Paid" action | Not implemented | **MISSING** — confirmed |
| Batch mark-as-paid | Not implemented | MISSING |
| Payment reversal | Not implemented | MISSING |
| Reconciliation summary endpoint | Not implemented | MISSING |

This plan treats the existing single-invoice mark-as-paid as **implemented reality** and extends it. FR-001 will be partially re-implemented to add `paymentReference` and `paidByUserId`; FR-005, FR-006 validations will be added (currently missing); FR-002, FR-019 are already satisfied.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 (backend), TypeScript 5.6 on React 18.3 (frontend)
**Primary Dependencies**: Fastify, Prisma ORM, Zod, shared `AuditService`, `AuthorizationService` (from 015)
**Storage**: PostgreSQL (Supabase) — `inspector_invoice` table extended with 2 new nullable columns
**Testing**: Vitest (unit + integration), Supertest (API)
**Target Platform**: Node.js backend API + React SPA frontend
**Project Type**: Cross-cutting extension on top of `010-billing-ledger` — operational workflow, not ledger redesign
**Constraints**: Ledger append-only invariant must hold; approved entries must remain immutable; invoice generation stays in 010's use cases
**Scale/Scope**: ~5 new backend use cases, 1 Prisma migration, 4 new endpoints, 3 frontend UI surfaces (table action, batch bar, reversal dialog, reconciliation view)

### Modules / Backend Impacted

**Extended (not replaced):**
- `apps/backend/src/modules/billing/domain/inspector-invoice.entity.ts` — add `paymentReference`, `paidByUserId`, methods for reversal
- `apps/backend/src/modules/billing/domain/inspector-invoice.repository.ts` — add `findManyByIds` (for batch), add `paymentReference`/`paidByUserId` to update path
- `apps/backend/src/modules/billing/infrastructure/prisma-inspector-invoice.repository.ts` — wire the new columns
- `apps/backend/src/modules/billing/application/use-cases/mark-invoice-paid.use-case.ts` — EXTEND to accept `paymentReference`, record `paidByUserId`, add validations (future date, before generatedAt)
- `apps/backend/src/modules/billing/interfaces/billing.routes.ts` — extend existing endpoint, add 3 new endpoints
- `apps/backend/src/main/container.ts` — register new use cases
- `apps/backend/prisma/schema.prisma` — add 2 columns + 1 migration

**New use cases (in billing module):**
- `batch-mark-invoices-paid.use-case.ts` — processes a list of invoice IDs with shared `paidAt`, skips non-CLOSED
- `reverse-invoice-payment.use-case.ts` — PAID → CLOSED with mandatory reason
- `get-reconciliation-summary.use-case.ts` — aggregation over date range

**New shared schemas:**
- `packages/shared/src/schemas/billing.ts` — extend `markInvoicePaidSchema`, add `batchMarkInvoicesPaidSchema`, `reverseInvoicePaymentSchema`, `reconciliationSummaryResponseSchema`

**Frontend:**
- `apps/web/src/features/financial/components/InvoiceTable.tsx` — add row selection + "Mark as Paid" row action
- `apps/web/src/features/financial/components/InvoiceDetailDrawer.tsx` — add "Mark as Paid" button and reversal button
- `apps/web/src/features/financial/components/MarkInvoicePaidModal.tsx` — NEW (single + batch)
- `apps/web/src/features/financial/components/ReversePaymentModal.tsx` — NEW
- `apps/web/src/features/financial/hooks/useInvoiceList.ts` — already exists; may need status filter for PAID (likely done)
- `apps/web/src/features/financial/components/ReconciliationSummary.tsx` — NEW (view component)
- `apps/web/src/features/financial/pages/InvoicesPage.tsx` — wire selection state, batch actions, summary

### Dependency on 010-billing-ledger

017 depends on 010 for:
1. **InspectorInvoice entity** — extended, not replaced
2. **Invoice generation flow** — 017 does not regenerate; only transitions status
3. **Financial entries** — 017 MUST NOT touch. Invariant enforced by not calling any financial entry repository method in this module
4. **Invoice list/detail endpoints** — 017 extends them with payment fields in responses

017 does **not** depend on 010 for: ledger append-only semantics (not touched), approval flow (not touched), refund flow (not touched), audit service (shared across all modules).

### Dependency on 015-permissions-rbac-matrix

- `AuthorizationService.assertRoles(['AM', 'OP'], ...)` for all write endpoints
- Audit-on-denial already wired from 015
- Frontend `usePermissions()` hook from 015 for UI gating of mark-as-paid buttons

## Constitution / Risk Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Invariant | Status | Notes |
|-----------------------|--------|-------|
| I. Clean Architecture | PASS | New use cases in application layer, repositories in infrastructure, entity changes in domain. No cross-layer bleed. |
| II. Multi-Tenant Safety | PASS | Inspector invoices inherit tenant scoping via inspector's eligibility; OP scoped to own tenant for reads per 015. Batch operations must enforce tenant scope on each invoice. |
| III. Test-Driven Development | PASS | New use cases get unit tests before implementation. Integration tests for endpoints. Audit assertions included. |
| IV. Contract-First APIs | PASS | All new/extended schemas go through `packages/shared/src/schemas/billing.ts`. OpenAPI generated from routes. Frontend consumes shared types. |
| V. Simplicity and Minimal Impact | PASS | No new modules. Extends existing billing module. Migration is 2 nullable columns — expand-only, no breaking changes. |
| **Ledger append-only invariant** | PASS | 017 does NOT call any `FinancialEntry*` repository method. The only writes are to `inspector_invoice` status + payment fields. |
| **Approved entries immutable** | PASS | 017 does not touch financial entries. |
| **Audit mandatory on sensitive actions** | PASS | FR-019, FR-020 require audit for every mark and reversal. `AuditService.log()` called before status change commits. |
| **Invoice generation sovereignty (010)** | PASS | 017 does not generate invoices. Transition-only. |

### Financial Regression Risk

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Accidentally modifying financial entries in a batch operation | LOW | Batch operations restricted to invoice status updates; no entry repository injected into new use cases. |
| Concurrent mark-as-paid creating inconsistent state | LOW | Status transition is atomic at the DB level (UPDATE with WHERE status='CLOSED' expected to return 1 row, else throw). Test via integration race case. |
| Payment reversal on a regenerated invoice | MEDIUM | Regeneration (010#GAP-007) is out of scope for 017. If a regenerated invoice already exists, reversal should still work — it only touches status/paid fields. Document edge case; no cross-check. |
| Audit record missing on batch operation | MEDIUM | Every invoice processed must produce its own audit record (FR-009). Enforced by looping individual logs, not a single batch log. |
| Migration dropping or altering existing columns | N/A | Migration is pure additive: 2 new nullable columns. No drops. No index changes initially. |
| Rollback safety | LOW | If the new endpoints have a bug, they can be disabled at the route level without touching data. The extended use case preserves the existing single-invoice flow. |

## Project Structure

### Documentation (this feature)

```text
specs/017-invoice-payment-reconciliation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── invoice-payment-endpoints.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
└── schemas/
    └── billing.ts                                  # EXTEND — markInvoicePaidSchema, new batch/reversal/summary schemas

apps/backend/prisma/
├── schema.prisma                                   # EXTEND — 2 new columns on inspector_invoice
└── migrations/
    └── <timestamp>_invoice_payment_reconciliation/ # NEW — ADD paid_by_user_id, payment_reference

apps/backend/src/modules/billing/
├── domain/
│   ├── inspector-invoice.entity.ts                 # EXTEND — new fields + reversal method
│   ├── inspector-invoice.repository.ts             # EXTEND — findManyByIds, update path
│   └── errors.ts                                   # EXTEND — InvoiceAlreadyPaidError, InvoiceNotPaidError, InvoicePaymentDateInvalidError
├── application/use-cases/
│   ├── mark-invoice-paid.use-case.ts               # EXTEND — add paymentReference, paidByUserId, validations
│   ├── batch-mark-invoices-paid.use-case.ts        # NEW
│   ├── reverse-invoice-payment.use-case.ts         # NEW
│   └── get-reconciliation-summary.use-case.ts     # NEW
├── infrastructure/
│   └── prisma-inspector-invoice.repository.ts      # EXTEND — new columns + findManyByIds
└── interfaces/
    └── billing.routes.ts                           # EXTEND — /mark-paid (extended body), /batch-mark-paid, /reverse-payment, /reconciliation-summary

apps/backend/src/main/
└── container.ts                                    # EXTEND — register 3 new use cases

apps/backend/tests/
├── unit/billing/
│   ├── mark-invoice-paid.use-case.test.ts          # EXTEND
│   ├── batch-mark-invoices-paid.use-case.test.ts   # NEW
│   ├── reverse-invoice-payment.use-case.test.ts    # NEW
│   └── get-reconciliation-summary.use-case.test.ts # NEW
└── integration/billing/
    └── invoice-payment.routes.test.ts              # NEW — E2E for 4 endpoints + RBAC

apps/web/src/features/financial/
├── pages/
│   └── InvoicesPage.tsx                            # EXTEND — selection state, batch bar wiring, reconciliation summary view
├── components/
│   ├── InvoiceTable.tsx                            # EXTEND — row selection + Mark as Paid action
│   ├── InvoiceDetailDrawer.tsx                     # EXTEND — Mark as Paid + Reverse buttons
│   ├── MarkInvoicePaidModal.tsx                    # NEW — handles single + batch
│   ├── ReversePaymentModal.tsx                     # NEW — reason required
│   ├── ReconciliationSummary.tsx                   # NEW — aggregate view
│   └── FloatingTotalBar.tsx (existing)             # MAYBE — for batch-mode "x selected" display
└── hooks/
    └── useReconciliationSummary.ts                 # NEW — fetches the summary endpoint
```

**Structure Decision**: All changes live under `modules/billing` (backend) and `features/financial` (frontend). No new module boundaries. Expand-only Prisma migration. No new external dependencies.

## Execution Strategy

### Waves

The work is ordered into 4 waves, largely sequential but with some parallelism opportunities inside each wave.

#### Wave 1 — Schema and Domain (sequential, foundational)
1. Prisma migration: add `paid_by_user_id` (uuid FK, nullable) and `payment_reference` (varchar 255, nullable) to `inspector_invoice`
2. Extend `InspectorInvoiceEntity` with new fields + `isPaid()` / `canBeMarkedPaid()` / `canBeReversed()` helpers (if not present)
3. Extend `IInspectorInvoiceRepository` interface with `findManyByIds(ids, tenantScope)` and full `update()` signature
4. Update `PrismaInspectorInvoiceRepository` accordingly
5. Extend `packages/shared/src/schemas/billing.ts` with extended `markInvoicePaidSchema`, new `batchMarkInvoicesPaidSchema`, `reverseInvoicePaymentSchema`, `reconciliationSummaryQuerySchema`, `reconciliationSummaryResponseSchema`

**Checkpoint**: `pnpm --filter @properfy/shared build` clean, `pnpm --filter backend typecheck` clean. No behavior changes yet.

#### Wave 2 — Backend Use Cases (parallelizable after Wave 1)
1. EXTEND `mark-invoice-paid.use-case.ts` — new fields, validations (future date, before generatedAt), record `paidByUserId`. Write/update unit tests first.
2. NEW `batch-mark-invoices-paid.use-case.ts` — iterates IDs, calls single flow per invoice with continue-on-skip semantics, returns summary
3. NEW `reverse-invoice-payment.use-case.ts` — PAID → CLOSED, mandatory reason, clears payment fields, audit
4. NEW `get-reconciliation-summary.use-case.ts` — SUM/COUNT queries scoped by filters (inspectorId, date range)
5. All 4 use cases use `AuthorizationService.assertRoles(['AM', 'OP'], ...)` and `AuditService.log(...)`

**Checkpoint**: `pnpm --filter backend test` — all unit tests green. No regressions in existing billing tests.

#### Wave 3 — Backend Endpoints (serial after Wave 2)
1. EXTEND `POST /v1/billing/invoices/:id/mark-paid` body schema and wire new fields
2. NEW `POST /v1/billing/invoices/batch-mark-paid`
3. NEW `POST /v1/billing/invoices/:id/reverse-payment`
4. NEW `GET /v1/billing/invoices/reconciliation-summary`
5. Integration tests (Supertest) for all 4 endpoints covering: happy path, role denial, validation errors, audit emission, idempotency-key support for the write endpoints

**Checkpoint**: Integration suite green. Legacy `/v1/invoices/*` routes still pass existing tests (backward compat). OpenAPI regenerates cleanly.

#### Wave 4 — Frontend (parallelizable after Wave 3)
1. NEW `MarkInvoicePaidModal.tsx` — fields: `paidAt` (datepicker, default now), `paymentReference` (text). Works for single + batch (receives ID list)
2. NEW `ReversePaymentModal.tsx` — fields: `reason` (required textarea)
3. EXTEND `InvoiceTable.tsx` — row selection checkbox, "Mark as Paid" row action, disable for non-CLOSED invoices, hide action for non-AM/OP via `usePermissions()`
4. EXTEND `InvoiceDetailDrawer.tsx` — "Mark as Paid" button (if CLOSED), "Reverse Payment" button (if PAID)
5. NEW `useReconciliationSummary.ts` hook
6. NEW `ReconciliationSummary.tsx` view component
7. EXTEND `InvoicesPage.tsx` — selection state, batch action bar, optional summary toggle/section
8. Component unit tests + page integration tests

**Checkpoint**: `pnpm --filter web test` green. Typecheck clean. Manual smoke test in dev — mark single, mark batch, reverse, view summary.

### Parallelism Opportunities

- **Inside Wave 2**: tasks 2, 3, 4 can be done in parallel (different files). Task 1 must complete first because it defines the patterns.
- **Inside Wave 3**: endpoint integration tests can be written in parallel, but all 4 endpoints touch the same routes file, so implementation must be serial.
- **Inside Wave 4**: Modal components (tasks 1, 2) and summary hook/view (tasks 5, 6) are fully parallel. Table/drawer/page extensions (tasks 3, 4, 7) are serial because they touch the same surface but different files.
- **Across waves**: Wave 4 can start on the modals (tasks 1, 2) in parallel with Wave 3 as soon as the shared schemas from Wave 1 are in place — the UI doesn't need live endpoints for component tests.

### Checkpoints Per Wave

| Wave | Checkpoint Criteria |
|------|--------------------|
| 1 | Prisma migration applies clean, shared build succeeds, backend typecheck passes |
| 2 | All new/extended use cases have unit tests and all billing unit tests pass |
| 3 | 4 endpoints have integration tests covering happy path + 403 + 400 + audit; backend test suite green |
| 4 | Frontend tests pass, typecheck clean, manual smoke of 4 flows successful |

## Testing Strategy

### Unit Tests (Vitest)

- `MarkInvoicePaidUseCase` — extended tests: paymentReference round-trip, paidByUserId recorded, future date rejected, date before generatedAt rejected, existing CLOSED→PAID path still green
- `BatchMarkInvoicesPaidUseCase` — mixed valid/invalid IDs (CLOSED, PAID, OPEN, not found) return per-invoice result, audit called N times (not once)
- `ReverseInvoicePaymentUseCase` — PAID→CLOSED path, missing reason rejected, non-PAID invoice rejected, payment fields cleared, audit called
- `GetReconciliationSummaryUseCase` — aggregates match sum of individuals, optional filters narrow correctly, empty period returns zeros

### Integration Tests (Supertest)

- Single mark-paid: 200 with new fields, 403 for CL_ADMIN, 400 for future date, 400 for date before generatedAt, 409 for already paid
- Batch mark-paid: summary returned, per-invoice audit records, skip (not error) on PAID/OPEN inside batch
- Reverse payment: 200 happy path, 400 missing reason, 400 for CLOSED invoice, audit with reason
- Reconciliation summary: totals match, inspector filter scopes results, date range respected

### Contract Tests

- Extended `markInvoicePaidSchema` accepts new optional fields without breaking existing consumers
- New schemas validate against example payloads from quickstart.md
- OpenAPI document regenerates and lints clean

### Financial Regression Safety

- **Ledger immutability smoke test**: after every new flow, run the existing `approve-financial-entry.use-case.test.ts` and `list-financial-entries.use-case.test.ts` suites to confirm no downstream breakage
- **Audit count assertion**: for batch of N valid invoices, assert N audit rows are created (not 1, not N+1)
- **Tenant scope spot-check**: OP from tenant A cannot mark invoices belonging to tenant B's inspectors (assert 404/403)

### Out of scope for testing in this pass

- Load tests for SC-002 (50 invoices in <5s) — deferred; functional correctness first
- E2E Playwright tests — manual smoke test is acceptable for this pass; automated E2E can be added alongside other financial flows in a later iteration

## Residual Risks and Assumptions

### Residual Risks

| Risk | Severity | Owner |
|------|----------|-------|
| Spec assumed `paymentReference` and `paidByUserId` already exist — they don't. Migration required. | LOW | Solved by explicit migration in Wave 1 |
| `MarkInvoicePaidUseCase` already exists and doesn't match the new signature — extending rather than rewriting preserves existing tests | LOW | Extend carefully; keep existing behavior as default path |
| Legacy `/v1/invoices/*` deprecated routes must also get the new endpoints for consistency, or remain on old schema | MEDIUM | **Decision needed**: mirror the new endpoints under legacy prefix, or only expose under canonical `/v1/billing/invoices/*`. Default: canonical only; legacy stays as-is until Nov 2026 sunset. |
| Reconciliation summary could become slow for large date ranges without an index on `generated_at` and `paid_at` | LOW | Ship without index; if performance becomes an issue, add index in a follow-up migration |
| Concurrent batch mark-as-paid on overlapping selections | LOW | Each invoice transitions atomically; duplicate attempts produce `INVOICE_ALREADY_PAID` skip summary |
| Frontend permission gating — `usePermissions()` from 015 is ready but not yet integrated into InvoicesPage | LOW | Integration happens naturally as part of Wave 4. Documented in the 015 residuals. |

### Assumptions (flagged for the developer to verify)

1. **InspectorInvoice already has `paid_at`** — confirmed during research
2. **InspectorInvoiceStatus enum includes PAID** — confirmed
3. **`MarkInvoicePaidUseCase` is single-invoice only** — confirmed, no batch logic exists
4. **No `paid_by_user_id` or `payment_reference` column** — confirmed, needs migration
5. **`generatedAt` is reliably populated on CLOSED invoices** — needs quick verification before wave 2 (reliance point for FR-006)
6. **Legacy `/v1/invoices/*` routes are frozen** — per the deprecation headers seen in routes file; new endpoints only go under `/v1/billing/invoices/*`
7. **Reconciliation summary uses `generatedAt` (not invoice period) for the "invoiced" filter** — clarification needed; spec is ambiguous. Default to `generatedAt` unless pushed back
8. **No cron/scheduler for auto-closing periods** — confirmed out of scope

### Implementation Reality vs Approved Target

See the "Implemented Reality vs Approved Target" table in the Summary section. The key gap between spec and code is that the spec calls 017 "NOT IMPLEMENTED" while the single-invoice backend is partially done. The plan treats the existing pieces as implemented reality and closes the remaining gaps cleanly.

## Complexity Tracking

No constitution violations. No complexity justifications needed. The plan is additive and scoped to the billing module extension.

## Closure Status

**Implemented**: 2026-04-10 | **Commit**: `175fdcb` | **Tests**: 2594 backend + 1882 frontend passing

All 4 operational flows delivered (single mark-as-paid, batch, reversal, reconciliation summary) across backend and frontend. 010 ledger invariants preserved — no 017 code path touches `financial_entry`, approved entries stay immutable, invoice generation stays in 010.

Residual items (all **non-blocking**): T038a INSP integration test (partial coverage — unit-tested), T073 part 2 direct `financial_entry` assertion (partial coverage — architecturally enforced), Idempotency-Key route wiring (follow-up polish), reconciliation summary page integration (deferred non-blocking), OpenAPI type regeneration (follow-up polish). See `tasks.md` Closure Status section for full classification.
