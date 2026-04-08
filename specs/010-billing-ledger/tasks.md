---
description: "Implementation and backlog tracking for Billing & Ledger"
---

# Tasks: Billing & Ledger

**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), [`data-model.md`](./data-model.md), [`contracts/`](./contracts/)
**Tests**: Mandatory per constitution Principle III. The hard precondition (`DONE_CHECK_REQUIRED`), self-approval guard, and deterministic UUID idempotency are the highest-risk surfaces.
**Organization**: Two sections — Baseline Implemented (shipped) and Open Backlog (Phase 2/3).

## Format

- `[x]` shipped; `[ ]` open.
- `[P]` may run in parallel.
- `[Story]` maps to a user story in `spec.md` (US1–US8) or a `GAP-xxx`.

---

# SECTION 1 — Baseline Implemented

> Already done on the active branch. Do not reimplement.

## Setup & Foundational (shipped)

- [x] T001 Prisma schema: `FinancialEntry`, `InspectorInvoice`, plus enums (`FinancialEntryType`, `FinancialEntryStatus`, `InspectorInvoiceStatus`, `BillingPeriodType`).
- [x] T002 Shared Zod schemas in `packages/shared/src/schemas/billing.ts`.
- [x] T003 Domain entities and typed errors (`EntryNotFound`, `EntryNotPending`, `EntrySelfApprovalNotAllowed`, `EntryNotRefundable`, `RefundAlreadyExists`, `InvoicePeriodOverlap`, `InvoiceNotReady`, `InvoiceFileNotGenerated`, `FinancialEntryDoneCheckRequired`, ...).
- [x] T004 Domain ports `IFinancialEntryRepository`, `IInspectorInvoiceRepository`.
- [x] T005 Deterministic UUID helper `createFinancialEntryId`.
- [x] T006 Prisma adapters for both repositories.
- [x] T007 pg-boss worker `generate-invoice-file.worker.ts` for PDF generation.
- [x] T008 Shared `SYSTEM_USER_ID` constant.

## US1 — Auto-create entries on DONE + cross-check (shipped)

- [x] T010 [US1] `CreateFinancialEntriesOnDoneUseCase` with hard precondition (`doneCheckedByUserId` required), deterministic UUIDs, graceful duplicate handling, idempotency cache, system-initiated audit.
- [x] T011 [US1] Wired into feature 006 `ExecuteStatusTransitionUseCase` and `PerformCrossCheckUseCase` via `onDoneHandler` port.
- [x] T012 [US1] Unit tests covering the `DONE_CHECK_REQUIRED` branch, idempotent re-invocation, unique-violation recovery.
- [x] T013 [US1] Integration test exercising the full flow (DONE → cross-check → entries exist).

## US2 — Two-person approval (shipped)

- [x] T020 [US2] `ApproveFinancialEntryUseCase` with AM/OP guard, self-approval rejection, conditional UPDATE.
- [x] T021 [US2] Routes `POST /v1/financial/entries/:id/approve` and the PATCH alias.
- [x] T022 [US2] Unit tests for every rejection branch.
- [x] T023 [US2] Concurrency integration test: two operators approve simultaneously, exactly one succeeds.

## US3 — Manual adjustment (shipped)

- [x] T030 [US3] `CreateManualAdjustmentUseCase` with tenant active check, appointment/inspector/reference cross-tenant guard, idempotency.
- [x] T031 [US3] Route `POST /v1/financial/entries/adjust`.
- [x] T032 [US3] Tests including cross-tenant rejections.

## US4 — Refund (shipped)

- [x] T040 [US4] `CreateRefundUseCase` with approved-debit guard, uniqueness per source, idempotency.
- [x] T041 [US4] Route `POST /v1/financial/entries/:id/refund`.
- [x] T042 [US4] Unit + integration tests.

## US5 — List, read, summary (shipped)

- [x] T050 [US5] `ListFinancialEntriesUseCase`, `GetFinancialEntryUseCase`, `GetFinancialSummaryUseCase`.
- [x] T051 [US5] Routes `GET /v1/financial/entries[/:id]`, `GET /v1/financial/entries/summary`.
- [x] T052 [US5] Tests including CL role tenant scoping and multi-currency summary edge case.

## US6 — Generate inspector invoice (shipped)

- [x] T060 [US6] `GenerateInvoiceUseCase` with AM/OP guard, exact-match idempotency, overlap detection, payout sum, worker enqueue.
- [x] T061 [US6] Routes `POST /v1/invoices/generate` and `/v1/billing/invoices/generate`.
- [x] T062 [US6] Unit tests for overlap, exact-match, empty period.

## US7 — Download invoice PDF (shipped)

- [x] T070 [US7] `DownloadInvoiceUseCase` returning presigned URL.
- [x] T071 [US7] Routes `GET /v1/invoices/:id/download` and `/v1/billing/invoices/:id/download`.
- [x] T072 [US7] Tests covering `INVOICE_NOT_READY` and `INVOICE_FILE_NOT_GENERATED`.

## US8 — List / get invoices (shipped)

- [x] T080 [US8] `ListInvoicesUseCase`, `GetInvoiceUseCase`.
- [x] T081 [US8] Routes (both path variants).
- [x] T082 [US8] Tests covering INSP scoping to own invoices.

## Cross-cutting (shipped)

- [x] T095 Container wiring injecting all ports and workers.
- [x] T096 Audit wiring for every write path.

---

# SECTION 2 — Open Backlog

> Only pick up work from this section. Every task must follow TDD.

## Phase 2 — Gap closure

### GAP-001 — Cancel use case for PENDING entries

- [ ] T100 [GAP-001] `CancelFinancialEntryUseCase` (AM/OP only) with `WHERE status = PENDING` conditional update and mandatory reason.
- [ ] T101 [GAP-001] Route `POST /v1/financial/entries/:id/cancel`.
- [ ] T102 [GAP-001] Tests asserting `PENDING → CANCELLED` only; `APPROVED` entries cannot be cancelled.

### GAP-002 — Automatic DONE→REJECTED compensation (HIGH)

- [ ] T110 [GAP-002] Pair with 006#GAP-002 (event-driven compensation).
- [ ] T111 [GAP-002] Consumer in billing subscribes to `appointment.done_rejected.v1` (depends on 002#GAP-005 bus).
- [ ] T112 [GAP-002] On event: cancel PENDING entries for the appointment OR auto-create a `REFUND` for approved `TENANT_DEBIT` + an opposing adjustment for `INSPECTOR_PAYOUT`.
- [ ] T113 [GAP-002] Tests covering both pending and approved entry scenarios.

### GAP-003 — Partial refunds

- [ ] T120 [GAP-003] Design doc: partial refund semantics (one per debit? multiple? cap at full amount?).
- [ ] T121 [GAP-003] Update `CreateRefundUseCase` to accept an optional `amount` (default full).
- [ ] T122 [GAP-003] Update uniqueness guard to allow multiple refunds as long as the sum does not exceed the original debit.
- [ ] T123 [GAP-003] Tests.

### GAP-004 — Tenant invoice rolled-up document

- [ ] T130 [GAP-004] New `TenantInvoice` entity + Prisma migration.
- [ ] T131 [GAP-004] `GenerateTenantInvoiceUseCase` summing `TENANT_DEBIT - REFUND + MANUAL_ADJUSTMENT` for a period.
- [ ] T132 [GAP-004] PDF worker + download endpoint.
- [ ] T133 [GAP-004] Web UI.

### GAP-005 — Tenant-timezone period boundaries

- [ ] T140 [GAP-005] Depends on 002#GAP-002 (rich tenant settings — read `timezone` and `billingPeriod`).
- [ ] T141 [GAP-005] Update `GenerateInvoiceUseCase` to interpret period boundaries in the tenant/inspector's timezone.
- [ ] T142 [GAP-005] Tests with fixture dates across timezone boundaries.

### GAP-006 — Void approved entries

- [ ] T150 [GAP-006] Decision: is an explicit VOID needed beyond refunds/adjustments? Capture in a design doc.
- [ ] T151 [GAP-006] If approved: add `VOIDED` enum value or reuse `CANCELLED` for this path. AM only with mandatory reason.
- [ ] T152 [GAP-006] Tests.

### GAP-007 — Invoice regeneration

- [ ] T160 [GAP-007] `RegenerateInvoiceUseCase` (AM only) that invalidates the current invoice and creates a new one with a revised total.
- [ ] T161 [GAP-007] Persist a version chain (original → regenerated).
- [ ] T162 [GAP-007] Tests.

### GAP-008 — Invoice PAID marking endpoint

- [ ] T170 [GAP-008] `MarkInvoicePaidUseCase` (AM/OP) with `WHERE status = CLOSED` conditional update, optional `paid_at` timestamp.
- [ ] T171 [GAP-008] Route `POST /v1/invoices/:id/mark-paid` (+ `/v1/billing/invoices/:id/mark-paid`).
- [ ] T172 [GAP-008] Tests.

### GAP-009 — Summary endpoint date range

- [ ] T180 [GAP-009] Extend `GetFinancialSummaryUseCase` with optional `effectiveFrom` and `effectiveTo` filters.
- [ ] T181 [GAP-009] Update route query schema.
- [ ] T182 [GAP-009] Tests covering month-to-date and year-to-date queries.

### GAP-010 — Consolidate duplicate invoice routes

- [ ] T190 [GAP-010] Deprecate `/v1/invoices/*` in favor of `/v1/billing/invoices/*`.
- [ ] T191 [GAP-010] Return `Deprecation` and `Sunset` headers on the legacy paths for one release.
- [ ] T192 [GAP-010] Migrate all frontend clients.
- [ ] T193 [GAP-010] Remove legacy routes after the deprecation window.

## Phase 3 — Polish & cross-cutting

- [ ] T200 [P] Verify module coverage ≥ 80% with `pnpm --filter backend test -- --coverage` on `billing/`.
- [ ] T201 [P] CI audit: ensure no code path writes `FinancialEntry.status = APPROVED` without running through `ApproveFinancialEntryUseCase`.
- [ ] T202 Confirm OpenAPI export reflects all endpoints; regenerate frontend clients.
- [ ] T203 Incremental supersede of legacy specs: banner on `specs/backend/billing.spec.md` and `specs/web/financial.spec.md`.
- [ ] T204 Document reconciliation workflow in the ops runbook — how operators mark invoices `PAID` after bank transfer.

---

## Dependencies & Execution Order

- **GAP-002** (auto compensation) depends on 002#GAP-005 (event bus) and pairs with 006#GAP-002.
- **GAP-004** (tenant invoice) is a significant addition and should ship with its own web UI.
- **GAP-005** (timezone periods) depends on 002#GAP-002.
- **GAP-008** (mark paid) is a small but high-value gap — prioritize early.

## Notes

- The ledger is append-only. Reviewers must block any PR that enables hard delete of `FinancialEntry` rows outside a migration.
- The two-person approval rule is non-negotiable. Any path that bypasses self-approval check is a bug.
- Financial entries are the authoritative record of money; all reports and dashboards read from this table directly.
- Close each `GAP-xxx` by promoting in `spec.md` and updating `specs/GAPS.md`.
