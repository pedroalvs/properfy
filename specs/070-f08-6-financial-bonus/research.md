# Phase 0 — Research & Decisions

All decisions derive from TASK-F08-6 (`fase2-etapa1/tarefas/F08-tarefas.md`), the Q12 client
decision (2026-10-30, clause 9.4) and code verified on `origin/develop` @ `3dffeccb` (F08-1 #1358,
F08-3 #1360 merged). No `NEEDS CLARIFICATION` remained after `/speckit.clarify`.

## D1 — New ledger type `INSPECTOR_BONUS` (DQ1)

**Decision**: Add `INSPECTOR_BONUS` to the Prisma `FinancialEntryType` enum and shared
`enums/financial.ts`; keep it out of `AGENCY_VISIBLE_ENTRY_TYPES`.
**Rationale**: The bonus is a distinct money movement (platform→inspector) that must be queryable
and filterable like payouts but never agency-visible.
**Alternatives**: Reusing `INSPECTOR_PAYOUT` — rejected: payouts are per-appointment with a
`tenant_id`; the bonus has no appointment and no tenant, and the Rewards/report surfaces need to
tell them apart.

## D2 — `tenant_id` NULL only for the bonus (DQ2, constitution deviation)

**Decision**: `financial_entries.tenant_id` becomes nullable with a CHECK
`(entry_type='INSPECTOR_BONUS') = (tenant_id IS NULL)`.
**Rationale**: A bonus has no agency; a total biconditional CHECK guarantees no legacy type can ever
lose its tenant and no bonus can ever carry one. Agency readers filter by `tenant_id`, so the NULL
rows fall out automatically; each reader still gets an explicit non-leak test.
**Alternatives**: A sentinel "platform tenant" row — rejected: it would make the bonus reachable by
that tenant's readers and pollute every agency query.

## D3 — Integration only at approval (DQ3, BonusLedgerHook)

**Decision**: Replace F08-1's no-op `IRewardAwardApprovalHook` with a real `BonusLedgerHook`. On
`onApproved`, create the `INSPECTOR_BONUS` `APPROVED` entry **inside the approval CAS transaction**
(`initiated_by_user_id = null`, `approved_by_user_id` = approver). On `onVoided`, void the entry or
(post-invoice) create the reversal.
**Rationale**: The F08-1 use cases already run the hook inside `runInTransaction`, so atomicity is
free; `initiated_by_user_id = null` avoids the PR #1229 FK bug (no `'SYSTEM'` user exists); the
no-self-approval CAS is the maker-checker (DV2).
**Alternatives**: A domain event after commit — rejected: a post-commit failure would leave an
approved reward with no ledger entry (silent money loss); the write must be transactional.

## D4 — Bonus on the inspector invoice (DQ4)

**Decision**: The bonus enters the invoice of the billing period (inspector cycle) that contains
the approval date (`effective_at = approved_at`), as a no-appointment snapshot line
`"Bonus: {goal title} · {period}"`, included in total and PDF.
**Rationale**: The invoice is per period (no FK entry→invoice today); the reader already sums
approved payouts in `periodEffectiveRange`, so adding the bonus type is the minimal change.
**Alternatives**: A separate bonus invoice — rejected: doubles the invoice surface for a small line.

## D5 — No manual payment; PAID via the invoice (DQ5)

**Decision**: No `mark-paid`/`paidOn`/`payment_reference`/`recovery_note` for rewards. `PAID` is set
automatically (same transaction) when the invoice is paid (unit + batch); reversing the payment
returns the reward to `APPROVED`. Rejecting a draft invoice (`PENDING_REVIEW → VOID`) leaves the
reward untouched — the bonus re-reads into the next request for the period.
**Rationale**: Q12 removed manual payment from F08-1/3; the invoice is the single payment authority,
which already has its payment rules (`mark-invoice-paid` "not in the future, not before issue").
**Alternatives**: A manual reward payment path — explicitly removed by Q12.

## D6 — Void: pre-invoice vs AM-only post-invoice reversal (DQ6, DL3)

**Decision**: Before invoicing (`inspector_invoice_id` null), voiding a `PENDING`/`APPROVED` reward
voids the ledger entry (`APPROVED → VOIDED`) in the same transaction (AM/OP). After invoicing
(`CLOSED`/`PAID`), only AM may void; the original entry is untouched and a negative reversal
(`INSPECTOR_BONUS`, `amount < 0`, `reference_entry_id` = original, `reward_award_id = null`,
`status APPROVED`, `effective_at = now`) lands on the next invoice; `paid_at` is preserved.
**Rationale**: A closed/paid invoice cannot be altered, so correction is a forward reversal (the
`REFUND` compensation precedent). `canVoid` extends to `PAID` for the AM path.
**Alternatives**: Reopening the invoice — rejected: the billing module never un-closes an invoice.

## D7 — Reversal linkage via existing `reference_entry_id` (DQ6, A5)

**Decision**: The reversal links to the original through the existing `reference_entry_id`
auto-relation; idempotency is a partial unique index
`financial_entries(reference_entry_id) WHERE entry_type='INSPECTOR_BONUS'`. `reward_award_id` stays
only on the original (1:1 unique preserved).
**Rationale**: The auto-relation already exists and is the `REFUND`-compensation pattern; a raw
`23505` from the partial index is mapped to `409` (Prisma does not raise `P2002` for a
hand-written partial index — memory `project_pricing_catalog_spec_execution`).
**Alternatives**: A new `reversed_reward_award_id` column — rejected: redundant with
`reference_entry_id`, and Prisma cannot express the partial index anyway.

## D8 — Invoice↔reward link column (DQ11, A3)

**Decision**: `reward_awards.inspector_invoice_id` (FK, nullable, indexed) written when the invoice
closes (`PENDING_REVIEW → CLOSED`) — the only invoice state that can no longer be voided. "Invoiced"
= `inspector_invoice_id IS NOT NULL`; it supplies the "Invoice PINV-…" link without scanning JSON.
**Rationale**: Close is the commit point of the snapshot; a draft (`PENDING_REVIEW`) can still be
rejected, so linking earlier would be premature.
**Alternatives**: Scanning `line_items_snapshot` JSON for the link — rejected: slow and fragile.

## D9 — Non-positive invoice total blocked (DQ13, A4)

**Decision**: `RequestInvoiceUseCase` rejects a period total ≤ 0 with `422
INVOICE_NON_POSITIVE_TOTAL`; the operator resolves it with a manual adjustment. The preview shows
the total and the PWA disables "Request".
**Rationale**: A reversal-only period would otherwise create a zero/negative invoice; rare (bonuses
are small relative to earnings). Auto carry-forward is parked.
**Alternatives**: Allowing a zero/negative invoice — rejected: breaks downstream payment assumptions.

## D10 — OP sees the platform bonus in the list (DQ10, A2, RBAC widening)

**Decision**: The OP branch of `ListFinancialEntriesUseCase` adds `includePlatformBonus`
(`OR (tenant_id IS NULL AND entry_type='INSPECTOR_BONUS')`) to its existing scope.
**Rationale**: OP approves/reconciles rewards and must see the bonus; the predicate adds only
platform bonus rows, never another agency's. Handled per the RBAC-widening checklist.
**Alternatives**: OP sees the bonus only on the Rewards tab/invoice — rejected per plan recommendation.

## D11 — Generic billing actions blocked on a bonus (DQ12)

**Decision**: `void`/`update`/`approve`/`cancel`/`refund` on an `INSPECTOR_BONUS` entry → `409
BONUS_ENTRY_MANAGED_BY_REWARD` before any write.
**Rationale**: A generic `refund` would copy the null `tenant_id` into a `REFUND` and blow the CHECK;
a generic status write with `where: { id, tenant_id }` would silently miss the bonus (0 rows). The
guard is in the use case, with a test.
**Alternatives**: Relying on the CHECK to fail — rejected: a silent 0-row update is worse than an
explicit 409.

## D12 — Cross-module ports (Clean Architecture)

**Decision**: `IBonusEntryWriter` (inspector-program `domain/`, implemented by billing) for the
ledger write/void/reversal; `IRewardAwardInvoiceSync` (billing `domain/`, implemented by
inspector-program) for `linkToInvoice`/`markPaidForInvoice`/`revertPaidForInvoice`. Both injected as
the **last optional** constructor parameter and wired at `container.ts`.
**Rationale**: Neither module imports the other's repository; mirrors F08-1 `IRegionGoalUsageChecker`
and F08-2 `IOfferEarlyAccessPolicy`. The last-optional-param rule avoids shifting existing test
wirings into type errors the backend `tsconfig` cannot see (memory
`project_adding_usecase_dep_breaks_untyped_test_wirings`) — grep every `new <UseCase>(`/`implements
I<Port>` in `src/` and `tests/`.
**Alternatives**: A shared service both import — rejected: couples the modules and breaks the
dependency rule.

## D13 — Migration ordering & drift (FR-006)

**Decision**: Two expand-only migrations — (1) `ALTER TYPE … ADD VALUE 'INSPECTOR_BONUS'` alone;
(2) nullable `tenant_id`, `reward_award_id` + FK + unique, both CHECKs, partial reversal index,
`reward_awards.inspector_invoice_id` + FK + index + CHECK. Apply locally; verify `prisma migrate
dev` does not drop the partial index (memory `project_prisma_drift_drops_unsupported_indexes`).
**Rationale**: Postgres forbids using a new enum value in the transaction that adds it; the CHECKs
reference the value, so they must be in the second migration. No backfill (no approved reward in
prod before this ships — F08-1/3/6 deploy together).
**Alternatives**: One migration — rejected: Postgres error on same-transaction enum use.
