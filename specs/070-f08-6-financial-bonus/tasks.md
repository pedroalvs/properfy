# Tasks: Inspector bonus in ledger and invoice (Q12 addendum)

**Input**: Design documents from `/specs/070-f08-6-financial-bonus/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-contracts.md

**Tests**: REQUIRED — TDD is mandatory per PR (constitution III; spec "Testes primeiro"). Each story
phase is tests-first (red → green → refactor). Backend `tsconfig` excludes `tests/`, so grep every
`new <UseCase>(` / `implements I<Port>` in `src/` AND `tests/` when adding a ctor dep
(`project_adding_usecase_dep_breaks_untyped_test_wirings`).

**Organization**: by user story (spec priorities). Use the `run` form of pnpm scripts in this env.

## Path Conventions

Monorepo: `packages/shared/src/`, `apps/backend/src/`, `apps/backend/prisma/`, `apps/backend/tests/`,
`apps/web/src/`, `apps/pwa/src/`.

---

## Phase 1: Setup

- [ ] T001 Confirm the worktree baseline is green (already verified: typecheck+lint pass on all four workspaces; `pnpm --filter <ws> run <script>` form required).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: shared contract + data model that every user story depends on. No story can start before this phase is green.

- [ ] T002 [P] Add `INSPECTOR_BONUS` to `FinancialEntryType` and keep `AGENCY_VISIBLE_ENTRY_TYPES` = `['TENANT_DEBIT','REFUND','MANUAL_ADJUSTMENT']` (with comment) in `packages/shared/src/enums/financial.ts`; test in `packages/shared/src/enums/financial.test.ts` (FR-001).
- [ ] T003 [P] `invoiceSnapshotLineSchema.kind` (`z.enum(['SERVICE','BONUS']).default('SERVICE')`), `appointmentId`/`appointmentCode` `.nullable()` with refine (SERVICE requires both), `entryId?`/`rewardAwardId?`/`description?`; `financialEntryResponseSchema.tenantId` `.nullable()` in `packages/shared/src/schemas/responses.ts`; tests in `packages/shared/src/schemas/responses.test.ts` (FR-007, test group 1).
- [ ] T004 [P] `listFinancialEntriesQuerySchema.type` accepts `INSPECTOR_BONUS` in `packages/shared/src/schemas/billing.ts` (+ test) (FR-007).
- [ ] T005 [P] `rewardAwardResponseSchema` gains `financialEntryId`, `invoice { id, invoiceNumberDisplay, status } | null`, `voidedAfterInvoicing` in `packages/shared/src/schemas/inspector-program.ts` (+ test) (FR-011).
- [ ] T006 [P] Append `inspector_program.awards.void_invoiced` (`roles: ['AM']`) to `packages/shared/src/permissions/role-matrix.ts` (+ test) (FR-012).
- [ ] T007 Build shared (`pnpm --filter @properfy/shared run build`) so backend/web/pwa resolve the new contract from `dist`.
- [ ] T008 Prisma schema: add `INSPECTOR_BONUS` to the enum; `FinancialEntry.tenant_id` → `String?` + `tenant Tenant?`; `reward_award_id String? @unique` + `rewardAward RewardAward?`; `RewardAward.inspector_invoice_id String?` + `inspector_invoice InspectorInvoice?` + `financial_entry FinancialEntry?` back-relation + `@@index([inspector_invoice_id])`; back-relations on `Tenant`/`InspectorInvoice` in `apps/backend/prisma/schema.prisma` (FR-002/003/005).
- [ ] T009 Migration 1 `<ts>_financial_entry_type_inspector_bonus` (`ALTER TYPE … ADD VALUE 'INSPECTOR_BONUS';` alone) in `apps/backend/prisma/migrations/` (FR-006).
- [ ] T010 Migration 2 `<ts>_inspector_bonus_ledger` (DROP NOT NULL, `reward_award_id` FK+unique, both CHECKs, partial reversal unique index, `reward_awards.inspector_invoice_id` FK+index+CHECK) per data-model.md; apply locally and confirm `prisma migrate dev` does not drop the partial index (FR-003/004/005/006).
- [ ] T011 `pnpm --filter backend exec prisma generate`; `pnpm exec prisma validate`.
- [ ] T012 [P] New billing error classes `BonusEntryManagedByRewardError` (409), `InvoiceNonPositiveTotalError` (422), `InvoiceLinesChangedError` (409) in `apps/backend/src/modules/billing/domain/billing.errors.ts` (+ map to HTTP) (FR-016/017/018).
- [ ] T013 [P] Port `IBonusEntryWriter` in `apps/backend/src/modules/inspector-program/domain/bonus-entry-writer.port.ts` (createApprovedBonus / voidBonus / createReversal signatures, all take `tx`) (FR-019).
- [ ] T014 [P] Port `IRewardAwardInvoiceSync` in `apps/backend/src/modules/billing/domain/reward-award-invoice-sync.port.ts` (`linkToInvoice(tx, invoiceId, rewardAwardIds)`, `markPaidForInvoice(tx, invoiceId, paidAt)`, `revertPaidForInvoice(tx, invoiceId)`) (FR-018).
- [ ] T015 `FinancialEntry` entity `tenantId: string | null`; mapper `tenantId: row.tenant_id`; `create` writes it; keep `string` on the guarded generic-write paths (DQ12 guard precedes); drop the report "tenant_id is always set" comment and treat `INSPECTOR_BONUS` as expense in `apps/backend/src/modules/billing/domain/financial-entry.entity.ts` + `apps/backend/src/modules/billing/infrastructure/prisma-financial-entry.repository.ts` + `apps/backend/src/modules/report/infrastructure/prisma-report-data-reader.ts` (FR-007 ripple).
- [ ] T016 `RewardAward` entity gains `inspectorInvoiceId: string | null`; `canVoid` extends to allow `PAID` (AM path) in `apps/backend/src/modules/inspector-program/domain/reward-award.entity.ts`; repo reads/writes `inspector_invoice_id` + reversal-source read in `apps/backend/src/modules/inspector-program/infrastructure/prisma-reward-award.repository.ts` (FR-009/010/011).

**Checkpoint**: shared built, DB migrated, generated client present, ports + entities compile.

---

## Phase 3: User Story 1 — Approval → ledger → invoice → paid (Priority: P1)

**Goal**: approving a reward mints the bonus entry atomically; the bonus rides the period invoice; paying the invoice pays the reward; reversing returns it to APPROVED.

**Independent test**: approve a PENDING reward → one `INSPECTOR_BONUS` APPROVED entry; request+approve+pay the invoice → `Bonus` line in snapshot/total/PDF + reward PAID.

### Tests (write first, must fail)

- [ ] T017 [P] [US1] `approve-reward-award.use-case.test.ts` additions (atomic entry fields, creator-approves, insert-fails rollback, two-approvers → 1 entry, idempotency key, duplicate `reward_award_id` → 409) in `apps/backend/src/modules/inspector-program/application/use-cases/approve-reward-award.use-case.test.ts` (test group 2).
- [ ] T018 [P] [US1] Billing readers DB test (`aggregate`/`sum`/`findApprovedPayoutLinesForSnapshot` include bonus, voided bonus excluded, other inspector excluded, reversal line; `getInspectorEarningsSummary`) in `apps/backend/tests/integration/db/prisma-financial-entry.repository.integration.test.ts` (test group 4).
- [ ] T019 [P] [US1] Invoice flow tests (request only-bonus period; approve-draft links reward + 409 mismatch; mark-paid unit+batch → reward PAID same tx; reverse-payment → APPROVED; reject-draft untouched; UPDATE failure rolls back) in the relevant `apps/backend/src/modules/billing/.../*.use-case.test.ts` + `apps/backend/tests/integration/db/` (test group 5).

### Implementation

- [ ] T020 [US1] `IBonusEntryWriter` impl on `PrismaFinancialEntryRepository` (create APPROVED bonus with `initiated_by_user_id null`, `approved_by_user_id`, `effective_at`, description) in `apps/backend/src/modules/billing/infrastructure/prisma-financial-entry.repository.ts` (FR-008/019).
- [ ] T021 [US1] `BonusLedgerHook` (implements `IRewardAwardApprovalHook`) — `onApproved` creates the entry via `IBonusEntryWriter` inside the tx; builds the `"Bonus: {goalTitle} · {period}"` description in `apps/backend/src/modules/inspector-program/application/bonus-ledger.hook.ts` (FR-008).
- [ ] T022 [US1] `IRewardAwardInvoiceSync` impl (link/markPaid/revert over `prisma-reward-award.repository.ts`) in `apps/backend/src/modules/inspector-program/application/reward-award-invoice-sync.ts` (FR-018).
- [ ] T023 [US1] Billing readers include `INSPECTOR_BONUS` (`entry_type: { in: ['INSPECTOR_PAYOUT','INSPECTOR_BONUS'] }`) in the three invoice readers + `getInspectorEarningsSummary`; `findApprovedPayoutLinesForSnapshot` reads bonus via a second query and interleaves by `effective_at` (BONUS line + reversal via `reference_entry_id`) in `apps/backend/src/modules/billing/infrastructure/prisma-financial-entry.repository.ts` (FR-013).
- [ ] T024 [US1] `RequestInvoiceUseCase` → `InvoiceNonPositiveTotalError` on total ≤ 0; `PreviewInvoiceUseCase` counts bonuses in `apps/backend/src/modules/billing/application/use-cases/{request,preview}-invoice.use-case.ts` (FR-017).
- [ ] T025 [US1] `ApproveDraftInvoiceUseCase` calls `linkToInvoice` inside `assignNumberAndFreeze`'s transaction; link-count ≠ BONUS lines → rollback + `InvoiceLinesChangedError`; no-bonus invoice issues no UPDATE in `apps/backend/src/modules/billing/application/use-cases/approve-draft-invoice.use-case.ts` + `prisma-inspector-invoice.repository.ts` (FR-018).
- [ ] T026 [US1] `MarkInvoicePaidUseCase` + `BatchMarkInvoicesPaidUseCase` move the invoice write into a `$transaction` and call `markPaidForInvoice` (per-invoice in batch; new `invoiceRepo.markPaidInTransaction`); `ReverseInvoicePaymentUseCase` calls `revertPaidForInvoice` in `apps/backend/src/modules/billing/application/use-cases/{mark-invoice-paid,batch-mark-invoices-paid,reverse-invoice-payment}.use-case.ts` (FR-018).
- [ ] T027 [US1] Wire `BonusLedgerHook` (replacing the no-op) + both port impls at the composition root in `apps/backend/src/main/container.ts`; grep all `new ApproveRewardAwardUseCase(`/`new VoidRewardAwardUseCase(` call-sites in `src/` + `tests/` and update wirings (FR-008/018/019).
- [ ] T028 [US1] Approve response + award list/summary carry `financialEntryId`/`invoice`/`voidedAfterInvoicing`; `totals.paid` = PAID rewards in `apps/backend/src/modules/inspector-program/application/{mappers.ts,use-cases/list-reward-awards.use-case.ts,use-cases/get-program-period-summary.use-case.ts}` + declare new fields in the route response schemas; the `reward_award.approved` audit `after` carries `financialEntryId` (the hook returns the created entry id to `ApproveRewardAwardUseCase`) (FR-011/023, SC-008).

**Checkpoint**: US1 green (approve → entry → invoice → paid/reverse) via backend suite.

---

## Phase 4: User Story 2 — Agencies never see the bonus (Priority: P1)

**Goal**: no CL surface shows a bonus; AM sees it platform-wide, OP via `includePlatformBonus`, INSP its own.

**Independent test**: seed agency X + bonus of an inspector servicing X; every CL read surface omits the bonus.

### Tests (write first, must fail)

- [ ] T029 [P] [US2] Agency-isolation integration (Supertest): CL list/detail(404)/summary/export/dashboard-pending omit bonus; AM with/without `tenantId`; OP `includePlatformBonus`; INSP own in `apps/backend/tests/integration/billing/financial-entries-bonus-isolation.integration.test.ts` (test group 6).
- [ ] T030 [P] [US2] FINANCIAL report integration addition (AM/OP bonus as expense incl. reversal; agency-scoped → none; columns = `FINANCIAL_AGENCY_COLUMNS`) in `apps/backend/tests/integration/db/prisma-report-data-reader.integration.test.ts` (test group 9).

### Implementation

- [ ] T031 [US2] `ListFinancialEntriesUseCase`: INSP `entryTypeIn ['INSPECTOR_PAYOUT','INSPECTOR_BONUS']` + `type` restricted to those; OP `includePlatformBonus` predicate; CL unchanged (403/404) in `apps/backend/src/modules/billing/application/use-cases/list-financial-entries.use-case.ts` + repo predicate (FR-015).
- [ ] T032 [US2] `GetFinancialEntryUseCase` INSP accepts both types; CL → 404 on bonus in `apps/backend/src/modules/billing/application/use-cases/get-financial-entry.use-case.ts` (FR-015).
- [ ] T033 [US2] `getSummary` adds `totalBonuses` (separate from `totalPayouts`) in `apps/backend/src/modules/billing/infrastructure/prisma-financial-entry.repository.ts` + response schema + route (FR-014).
- [ ] T034 [US2] FINANCIAL report treats `INSPECTOR_BONUS` as expense for AM/OP, never for agency-scoped; columns unchanged in `apps/backend/src/modules/report/infrastructure/prisma-report-data-reader.ts` (FR-007/DQ8).

**Checkpoint**: US2 green — explicit non-leak test per agency reader passes.

---

## Phase 5: User Story 3 — Void with correct financial effect (Priority: P2)

**Goal**: pre-invoice void voids the entry; post-invoice void is AM-only with a negative reversal.

**Independent test**: void non-invoiced APPROVED → entry VOIDED; void invoiced as OP → 403; as AM → reversal created, original untouched.

### Tests (write first, must fail)

- [ ] T035 [P] [US3] `void-reward-award.use-case.test.ts` additions (PENDING no entry; APPROVED non-invoiced → entry VOIDED; invoiced OP → 403; AM invoiced/paid → reversal, paid_at kept, `voidedAfterInvoicing`; duplicate reversal → 1; race void×close → 409 INVOICE_LINES_CHANGED; `recoveryNote` → 400) in `apps/backend/src/modules/inspector-program/application/use-cases/void-reward-award.use-case.test.ts` (test group 3).
- [ ] T036 [P] [US3] Reversal idempotency DB test (second reversal of same original → 23505 → mapped 409) in `apps/backend/tests/integration/db/` (test group 8 subset).

### Implementation

- [ ] T037 [US3] `VoidRewardAwardUseCase` two branches: non-invoiced (AM/OP) voids entry via hook; invoiced/paid requires `inspector_program.awards.void_invoiced` (AM) else 403 "Only an Admin Master can void an invoiced reward"; preserves `paid_at`; sets `voidedAfterInvoicing` in `apps/backend/src/modules/inspector-program/application/use-cases/void-reward-award.use-case.ts` (FR-009/010).
- [ ] T038 [US3] `BonusLedgerHook.onVoided` + `IBonusEntryWriter.voidBonus`/`createReversal` (negative amount, `reference_entry_id` = original, `reward_award_id null`, `effective_at now`, "Bonus reversal: …"); map the partial-index `23505` to 409 in `apps/backend/src/modules/inspector-program/application/bonus-ledger.hook.ts` + `apps/backend/src/modules/billing/infrastructure/prisma-financial-entry.repository.ts` (FR-010, D7).
- [ ] T039 [US3] Audit `reward_award.paid` (SYSTEM, `metadata.invoiceId`), `reward_award.payment_reversed`, void `afterInvoicing: true` across the hook/invoice-sync paths (FR / SC-008).

**Checkpoint**: US3 green.

---

## Phase 6: User Story 4 — Surfacing (inspector + AM/OP) (Priority: P2)

**Goal**: web Rewards tab (invoice link/chips/AM void dialog), Financial list + invoice drawer `Bonus` line; PWA Earnings + invoice + request.

### Tests (write first, must fail)

- [ ] T040 [P] [US4] Web RTL: `RewardAwardsTable` (chips, invoice link, AM-only invoiced void + warning dialog, OP hidden, 403 message, "Voided after invoicing"), `FinancialTable` bonus chip/description/"—", `InvoiceDetailDrawer` BONUS line in `apps/web/src/features/**/__tests__/` (test group 10).
- [ ] T041 [P] [US4] PWA RTL: Earnings history (no `type`, "Bonus"/"Bonus reversal" negative), `InvoiceDetailPage` BONUS line, `RequestInvoicePage` "{n} approved items" in `apps/pwa/src/features/earnings/**/__tests__/` (test group 11).

### Implementation

- [ ] T042 [P] [US4] Web Rewards tab: Invoice column, status chips, AM invoiced-"Void" dialog with reversal warning, Paid tile reflects paid invoices, Paid-tile help copy in `apps/web/src/features/inspector-program/` (FR-021).
- [ ] T043 [P] [US4] Web Financial: `--color-fin-type-bonus` token (contrast ≥ 4.5:1), "Bonus" chip + description + Agency "—" + type filter; `InvoiceDetailDrawer` BONUS line in `apps/web/src/features/financial/*` + `apps/web/src/lib/status-colors.ts` + `apps/web/src/features/financial/constants/form-options.ts` (FR-021).
- [ ] T044 [P] [US4] PWA Earnings history (drop fixed `type`), "Bonus"/"Bonus reversal" labels + negative value; `InvoiceDetailPage` BONUS line (key `entryId ?? appointmentCode`); `RequestInvoicePage` "{n} approved items" in `apps/pwa/src/features/earnings/` (FR-022).
- [ ] T045 [US4] Invoice PDF BONUS line (Appointment "Bonus", Property = description, Service Type/Agency "-"; total unchanged) in `apps/backend/src/modules/billing/infrastructure/pdfkit-invoice-pdf.generator.ts` (FR-020).

**Checkpoint**: US4 green (web + pwa unit).

---

## Phase 7: User Story 5 — Integrity guards (Priority: P3)

**Goal**: generic billing actions blocked on a bonus; DB constraints reject malformed rows.

### Tests (write first, must fail)

- [ ] T046 [P] [US5] Generic-action guard tests (`void`/`update`/`approve`/`cancel`/`create-refund` on a bonus id → 409 `BONUS_ENTRY_MANAGED_BY_REWARD`, nothing written) in the relevant `apps/backend/src/modules/billing/application/use-cases/*.use-case.test.ts` (test group 7).
- [ ] T047 [P] [US5] DB CHECK/constraint test `financial-entries-bonus.db.test.ts` (tenant CHECK, shape CHECK, unique `reward_award_id`, FK Restrict, paid-invoice CHECK, migration-over-dump) in `apps/backend/tests/integration/db/financial-entries-bonus.db.test.ts` (test group 8).

### Implementation

- [ ] T048 [US5] Guard `INSPECTOR_BONUS` in `void`/`update`/`approve`/`cancel`/`create-refund` financial use cases → `BonusEntryManagedByRewardError` before any write in `apps/backend/src/modules/billing/application/use-cases/*.use-case.ts` (FR-016).

**Checkpoint**: US5 green.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T049 Regenerate contract: `pnpm generate:openapi` (dummy env) + `pnpm --filter @properfy/shared generate:types` + build; commit `apps/backend/openapi.json` + `packages/shared/src/api-types.ts`; verify only the F08-6 delta (FR-023).
- [ ] T050 [P] Docs: `apps/backend/CLAUDE.md` (billing: `INSPECTOR_BONUS` tenantless, agency readers never return it, only inspector-program creates/voids it; inspector-program invoice hooks + void rule), `packages/shared/CLAUDE.md` (`invoiceSnapshotLineSchema.kind`), root `CLAUDE.md` §8 (inspector goal bonus on the inspector invoice) (FR-024).
- [ ] T051 E2E web: extend the F08-3 Rewards flow — close+request+approve+pay the period invoice → "Paid" + "PINV-…"; CL_ADMIN Financial → no "Bonus" in `apps/web/tests/e2e/` (test group 12).
- [ ] T052 Full gates via a condensed subagent: shared build+test; backend typecheck+lint+test+`test:integration:db`; web typecheck+lint+test+e2e; pwa typecheck+lint+test; `git diff --stat origin/develop... | tail -1` < 150.

---

## Dependencies & Execution Order

- **Phase 2 (Foundational)** blocks everything (shared contract + migrations + ports + entity ripple).
- **US1 (P1)** is the MVP; **US2 (P1)** depends on US1's readers/entry existing; **US3 (P2)** depends on US1 (entry + invoice link); **US4 (P2)** depends on US1–US3 response fields; **US5 (P3)** depends on Phase 2 (entity/CHECKs) and the billing use cases.
- Within a phase, `[P]` tasks touch different files and can run together; tests precede implementation.
- Shared (`packages/shared`) must be **rebuilt** (T007) before backend/web/pwa consume it; **api-types regenerated** (T049) after the route schemas settle.

## Parallel opportunities

- T002–T006 (shared files) in parallel, then T007 build.
- T012–T014 (error classes + two ports) in parallel.
- Test authoring T017/T018/T019, T029/T030, T035/T036, T040/T041, T046/T047 in parallel within their phase.
- Web (T042/T043) and PWA (T044) implementation in parallel.

## MVP

US1 alone (Phase 1 + 2 + 3) is a demonstrable MVP: an approved reward becomes a ledger entry and an
invoice line, and paying the invoice pays the reward. US2 (isolation) ships in the same PR because it
is a hard privacy requirement, not a later increment.
