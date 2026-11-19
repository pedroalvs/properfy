# Feature Specification: Inspector bonus in ledger and invoice (Q12 addendum)

**Feature Branch**: `070-f08-6-financial-bonus`
**Created**: 2026-11-08
**Status**: Draft
**Input**: User description: "inspector bonus in ledger and invoice Q12 addendum"

## Overview

Q12 was decided by the client on 2026-10-30 (contract clause 9.4): an **approved inspector
reward** (an `inspector-program` goal payout) must become a **ledger entry** and a **line on
the inspector's invoice**, and the reward is marked `PAID` when that invoice is paid. This
feature is the single integration point between the `inspector-program` module (F08-1 goals &
rewards) and the `billing` module (spec 032 inspector invoices). The agency side of the ledger
is unaffected: an agency (`CL_ADMIN`/`CL_USER`) **never** sees a bonus on any surface.

The reward lifecycle is `PENDING → APPROVED → PAID`, with `VOID` reachable throughout:
- **Approve** mints one `INSPECTOR_BONUS` ledger entry (`APPROVED`), in the **same transaction**
  as the approval compare-and-swap.
- **Invoice** of the period that contains the approval date carries a `Bonus` line (snapshot,
  total and PDF). The reward is linked to the invoice when the invoice closes.
- **Pay** the invoice marks the reward `PAID` (same `paid_at`); **reversing** the payment returns
  it to `APPROVED`.
- **Void** before the reward is invoiced voids the ledger entry (same transaction); **after** the
  reward is invoiced, only an Admin Master may void, and a negative reversal entry lands on the
  inspector's next invoice.

## Clarifications

### Session 2026-11-08

No questions required user input: Q12 is a client decision (2026-10-30, clause 9.4) and the three
remaining open dev-decisions were resolved by adopting the plan's recommendation (recorded as
Assumptions A2–A5), per the task delegation.

- Q: Does OP see the platform bonus in the financial list, or only on the Rewards tab/invoice? → A:
  OP sees it in the list via a new `includePlatformBonus` predicate (RBAC widening, DQ10 / A2).
- Q: How is a reward linked to its invoice? → A: a new `reward_awards.inspector_invoice_id` column,
  written at invoice close (DQ11 / A3).
- Q: What happens to an invoice request whose period total is ≤ 0? → A: `422
  INVOICE_NON_POSITIVE_TOTAL`, resolved by a manual adjustment (DQ13 / A4).
- Q: How does the reversal entry link to the original? → A: the existing `reference_entry_id`
  auto-relation (no new column); `reward_award_id` stays only on the original (A5).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Approved reward flows to the ledger and the inspector invoice (Priority: P1)

An operator approves a reward on the Rewards tab. In the same transaction the platform records an
`INSPECTOR_BONUS` ledger entry (no agency, inspector only). When the inspector later requests the
invoice for the billing period that contains the approval date, the invoice includes a `Bonus`
line in its snapshot, total and PDF. When an operator marks that invoice paid, the reward becomes
`PAID` with the invoice's payment date; reversing the payment returns the reward to `APPROVED`.

**Why this priority**: This is the core of Q12 (clause 9.4) — without it the client's decision is
not delivered and approved rewards remain stuck at `APPROVED` with no money movement.

**Independent Test**: Approve a `PENDING` reward → assert exactly one `INSPECTOR_BONUS` `APPROVED`
entry exists with `tenant_id = null`, `inspector_id` set, `reward_award_id` = the reward, `amount`
= the reward amount, in the same transaction; request + approve + pay the period's invoice → the
snapshot/total/PDF show the `Bonus` line and the reward is `PAID`.

**Acceptance Scenarios**:

1. **Given** a `PENDING` reward of $30.00 for inspector `I`, **When** an AM/OP approves it,
   **Then** the reward is `APPROVED` and exactly one `INSPECTOR_BONUS` ledger entry
   (`status APPROVED`, `tenant_id null`, `appointment_id null`, `inspector_id I`,
   `reward_award_id` = the reward, `amount 30.00`, `currency AUD`, `effective_at = approved_at`,
   `initiated_by_user_id null`, `approved_by_user_id` = the approver) is created atomically, with
   audit `reward_award.approved` (carrying `after.financialEntryId`) and `financial_entry.created`.
2. **Given** the goal's creator is the approver, **When** they approve (system award, no
   self-approval check — DV2), **Then** the reward is approved and the entry is created.
3. **Given** the ledger insert fails inside the transaction, **When** approval runs, **Then** the
   whole transaction rolls back (reward stays `PENDING`), a `500` is logged, and nothing is
   swallowed by an empty `catch` (lesson of PR #1229).
4. **Given** two approvers act simultaneously, **When** both approve, **Then** one wins, the other
   gets `409 REWARD_AWARD_INVALID_STATUS` after re-read, and exactly **one** ledger entry exists.
5. **Given** an inspector on a `WEEKLY` cycle with two payouts (80 + 70) and a bonus approved in
   the same billing period, **When** the invoice is requested and approved, **Then** `total_amount`
   is 180, the snapshot has a `BONUS` line interleaved by `effective_at`, and the reward's
   `inspector_invoice_id` is set in the same transaction as the close.
6. **Given** an invoice carrying the reward's `Bonus` line, **When** it is marked paid (unit or
   batch), **Then** the reward becomes `PAID` with `paid_at = invoice.paid_at` in the same
   transaction and audit `reward_award.paid` (`actorType 'SYSTEM'`, `metadata.invoiceId`); paying
   again is a no-op.
7. **Given** a paid invoice carrying the reward, **When** the payment is reversed (`PAID → CLOSED`),
   **Then** the reward returns to `APPROVED`, `paid_at` is cleared, `inspector_invoice_id` is kept,
   and audit `reward_award.payment_reversed` is written.
8. **Given** a draft invoice (`PENDING_REVIEW`) is rejected (`→ VOID`), **When** rejection runs,
   **Then** the reward is untouched (still `APPROVED`, no invoice link) and the next request for
   the same period re-reads the bonus into a fresh invoice.

---

### User Story 2 - Agencies never see the bonus (Priority: P1)

A client-admin or client-user of any agency opens Financial, the invoice readers, the summary, the
agency export, the agency-scoped FINANCIAL report and the dashboard pending count. None of these
surfaces ever shows a bonus, even for the agency whose appointments the inspector services.

**Why this priority**: The bonus is the platform↔inspector leg (platform margin). Leaking it to an
agency is a multi-tenant/financial-confidentiality defect of the same class the ledger already
guards for `INSPECTOR_PAYOUT`.

**Independent Test**: Seed an agency `X` with a payout and a debit, plus an `INSPECTOR_BONUS` for an
inspector who services `X`. As `CL_ADMIN`/`CL_USER` of `X`, call every agency read surface and
assert the bonus is absent (list, detail `404`, summary, export, FINANCIAL report, dashboard).

**Acceptance Scenarios**:

1. **Given** an `INSPECTOR_BONUS` entry and a `CL_ADMIN`/`CL_USER` of the servicing agency, **When**
   they `GET /v1/financial/entries` (no filter, with `type=INSPECTOR_BONUS` → existing `403`, with
   `appointmentId`), **Then** the bonus never appears; `GET /v1/financial/entries/:bonusId` → `404`.
2. **Given** the same actor, **When** they read the agency summary, run the agency export
   (`export-agency-financial`) and the dashboard pending count, **Then** the bonus is absent in all.
3. **Given** the agency-scoped FINANCIAL report for `X`, **When** it is generated, **Then** it has
   no `INSPECTOR_BONUS` line and its columns equal `FINANCIAL_AGENCY_COLUMNS` (unchanged).
4. **Given** an AM, **When** they list without `tenantId`, **Then** the bonus is present; with
   `tenantId = X`, **Then** it is absent (a bonus is not an agency entry).
5. **Given** an OP, **When** they list the financial entries, **Then** the platform bonus is present
   (via `includePlatformBonus`, DQ10) and another agency's entry is absent.
6. **Given** inspector `I`, **When** they list without `type`, **Then** their own payouts and
   bonuses appear; with `type=INSPECTOR_BONUS`, only bonuses; another inspector's bonus by id →
   `404`.

---

### User Story 3 - Void a reward with the correct financial effect (Priority: P2)

An operator voids a `PENDING`/`APPROVED` reward that has not been invoiced; the ledger entry is
voided in the same transaction. Once the reward is on a closed/paid invoice, only an Admin Master
may void it, and a negative reversal entry falls on the inspector's next invoice; the original entry
is untouched and `paid_at` is preserved.

**Why this priority**: Correct handling of late data / mistaken awards is required, but it builds on
US1 (the entry and the invoice link must already exist).

**Independent Test**: Void an `APPROVED` non-invoiced reward → entry `APPROVED → VOIDED` same tx;
void an invoiced reward as OP → `403`; as AM → reward `VOID`, a `-30.00` reversal entry with
`reference_entry_id` = the original is created, original untouched.

**Acceptance Scenarios**:

1. **Given** a `PENDING` reward, **When** OP voids it, **Then** the reward is `VOID` and no ledger
   entry is touched (none exists).
2. **Given** an `APPROVED` non-invoiced reward (`inspector_invoice_id` null), **When** OP voids it,
   **Then** the reward is `VOID` and the ledger entry moves `APPROVED → VOIDED`
   (`voided_by`/`voided_at`/`void_reason`) in the same transaction.
3. **Given** an `APPROVED` reward already on a `CLOSED` invoice, **When** OP voids it, **Then**
   `403 FORBIDDEN` "Only an Admin Master can void an invoiced reward" and nothing is written.
4. **Given** an `APPROVED` invoiced reward, **When** AM voids it, **Then** the reward is `VOID`, the
   original entry is untouched, and a reversal entry (`INSPECTOR_BONUS`, `amount -30.00`,
   `tenant_id null`, `reward_award_id null`, `reference_entry_id` = original, `status APPROVED`,
   `effective_at now`) is created, with audit carrying `afterInvoicing: true`.
5. **Given** a `PAID` invoiced reward, **When** AM voids it, **Then** same as (4); `paid_at` is kept
   and the response/audit carry `voidedAfterInvoicing: true`.
6. **Given** a second void of the same original (retry / duplicate), **When** it runs, **Then** only
   **one** reversal exists (partial unique index) and the second returns `409
   REWARD_AWARD_INVALID_STATUS`.
7. **Given** a `recoveryNote` field in the body, **When** void runs, **Then** `400` (schema is
   `.strict()`, no manual payment / recovery concept exists — Q12).

---

### User Story 4 - The bonus is visible to the inspector and to AM/OP (Priority: P2)

On the web Rewards tab an AM/OP sees the invoice link, the paid/voided chips and (AM only) the
"Void" action for an invoiced/paid reward with the reversal warning. The Financial list and invoice
drawer render the `Bonus` line. On the PWA the inspector sees the bonus in Earnings history and on
the invoice.

**Why this priority**: Surfacing is required for the feature to be usable, but the money movement
(US1) and isolation (US2) are the correctness core.

**Independent Test**: Render `RewardAwardsTable` with an invoiced/paid reward → the invoice link and
chips appear; AM sees the invoiced-void dialog, OP does not. Render the PWA Earnings history with an
`INSPECTOR_BONUS` item → it shows "Bonus" with the description and a negative value for a reversal.

**Acceptance Scenarios**:

1. **Given** an `APPROVED` reward without an invoice, **When** the Rewards tab renders, **Then** the
   status reads "Approved · next invoice"; with an invoice it shows a link "PINV-000042" opening the
   invoice drawer; `PAID` shows "Paid" + link.
2. **Given** an AM, **When** a reward is `APPROVED`-invoiced or `PAID`, **Then** a "Void" action
   with the warning "This bonus is already on an invoice. Voiding it adds a reversal to the
   inspector's next invoice." is offered; an OP never sees it; a `403` renders the "Only an Admin
   Master can void an invoiced reward." message.
3. **Given** a reward voided after invoicing, **When** the Rewards tab renders, **Then** it shows a
   "Voided after invoicing" chip; no "Mark as paid" exists anywhere.
4. **Given** an `INSPECTOR_BONUS` ledger entry, **When** the web Financial list renders, **Then** it
   shows a "Bonus" type chip, the description in place of the appointment code, and agency "—".
5. **Given** an invoice with a `BONUS` line, **When** `InvoiceDetailDrawer` renders, **Then** the
   line shows "Bonus" in the Appointment column and the description; total equals the sum.
6. **Given** the PWA, **When** Earnings history renders without a `type` filter, **Then** it shows
   payouts and bonuses; a reversal renders as "Bonus reversal" with "−$30.00"; `InvoiceDetailPage`
   shows the `BONUS` line; `RequestInvoicePage` reads "{n} approved items".

---

### User Story 5 - Integrity guards (Priority: P3)

Generic billing actions cannot touch a bonus entry; a billing period whose total is ≤ 0 cannot be
invoiced; database constraints reject malformed bonus rows and duplicate reversals.

**Why this priority**: Defense-in-depth that prevents silent corruption; important but not the money
path itself.

**Acceptance Scenarios**:

1. **Given** an `INSPECTOR_BONUS` entry, **When** any of `void`/`update`/`approve`/`cancel`/`refund`
   is called on it, **Then** `409 BONUS_ENTRY_MANAGED_BY_REWARD` "Bonus entries are managed from
   Goals & rewards." and nothing is written (DQ12).
2. **Given** a billing period whose only movement is a reversal (total ≤ 0), **When** the invoice is
   requested, **Then** `422 INVOICE_NON_POSITIVE_TOTAL` "This period has no amount to invoice."
   (DQ13); the preview shows the total and the PWA disables "Request".
3. **Given** the database, **When** an `INSPECTOR_BONUS` row has a `tenant_id`, or an old type has
   `tenant_id null`, or a bonus lacks `inspector_id` / has an `appointment_id` / has both
   `reward_award_id` and `reference_entry_id` / an original with amount ≤ 0 / a reversal with amount
   ≥ 0, **Then** the CHECK constraints reject it; `reward_award_id` on a non-bonus type is rejected.
4. **Given** a second reversal of the same original, **When** inserted, **Then** the partial unique
   index raises `23505` (raw, not `P2002`) and the repository maps it to `409`.

---

### Edge Cases

- Approval at 23:30 Sydney on the last day of a billing period → `effective_at` lands in the period
  that closes (`periodEffectiveRange` decides, DR5).
- `MONTHLY`-cycle inspector → the bonus enters the invoice of the **approval month**, not the goal
  week.
- The period invoice is already `PENDING_REVIEW` when the bonus is approved → impossible (request
  needs a closed period; a bonus is born `now`, in the open period). Covered by a test (approving
  with a prior-period draft does not change the draft).
- A rejected draft (`VOID`) → reward untouched; the next request for the period includes the bonus.
- Invoice paid then reversed then paid again → reward `APPROVED → PAID` with the new `paid_at`.
- Reward voided after close but before payment → reversal on the next invoice; paying the original
  invoice does not flip the `VOID` reward to `PAID` (`WHERE status = 'APPROVED'`, 0 rows).
- Mixed-currency period (bonus AUD, payouts other currency) → the existing `InvoiceMixedCurrencyError`.
- Race: AM voids an `APPROVED` reward while OP approves the period draft → one wins; if the void
  commits first the close sees the reward `VOID`, the link count mismatches and the close fails with
  `409 INVOICE_LINES_CHANGED` "Invoice lines changed. Try again." (retry freezes without the line);
  if the close commits first the void reads `inspector_invoice_id` and takes the reversal branch.
- Legacy rows (`tenant_id` populated) are unchanged; the CHECK guarantees no old type loses its tenant.

## Requirements *(mandatory)*

### Functional Requirements

#### Shared contract & data model

- **FR-001**: The system MUST add `INSPECTOR_BONUS` to `FinancialEntryType` (Prisma enum + shared
  `enums/financial.ts`) and MUST keep it **out** of `AGENCY_VISIBLE_ENTRY_TYPES` (exactly
  `['TENANT_DEBIT','REFUND','MANUAL_ADJUSTMENT']`). (DQ1)
- **FR-002**: `financial_entries.tenant_id` MUST become nullable, and a CHECK MUST enforce
  `("entry_type" = 'INSPECTOR_BONUS') = ("tenant_id" IS NULL)` — `tenant_id` is NULL **only** for
  `INSPECTOR_BONUS`, and every other type keeps a non-null tenant. (DQ2)
- **FR-003**: `financial_entries` MUST gain `reward_award_id` (`TEXT`, FK to `reward_awards`,
  `ON DELETE RESTRICT`, `UNIQUE`) for the original bonus entry (1:1 with the reward). A shape CHECK
  MUST enforce: a bonus has `inspector_id` set and `appointment_id` null; the original carries
  `reward_award_id` (amount > 0), the reversal carries `reference_entry_id` (amount < 0), never
  both; `reward_award_id` is only valid on `INSPECTOR_BONUS`. (DQ1/DQ6)
- **FR-004**: A partial unique index on `financial_entries(reference_entry_id) WHERE entry_type =
  'INSPECTOR_BONUS'` MUST make a second reversal of the same original impossible (idempotency). (DQ6)
- **FR-005**: `reward_awards` MUST gain `inspector_invoice_id` (`TEXT`, FK to `inspector_invoices`,
  `ON DELETE RESTRICT`, indexed), set when the invoice closes; "invoiced" = `inspector_invoice_id
  IS NOT NULL`. A CHECK MUST enforce `("status" = 'PAID') <= ("inspector_invoice_id" IS NOT NULL)`.
  (DQ11)
- **FR-006**: The `INSPECTOR_BONUS` enum value MUST be added in its **own** migration (Postgres
  forbids using a new enum value in the same transaction that defines it); the column/constraint/
  index changes MUST be a second expand-only migration. No backfill.
- **FR-007**: Shared schemas MUST be updated: `financialEntryResponseSchema.tenantId` becomes
  `.nullable()`; `invoiceSnapshotLineSchema` gains `kind: z.enum(['SERVICE','BONUS']).default('SERVICE')`,
  makes `appointmentId`/`appointmentCode` `.nullable()` with a refine (`SERVICE` requires both),
  and adds `entryId?`, `rewardAwardId?`, `description?`; `listFinancialEntriesQuerySchema.type`
  accepts `INSPECTOR_BONUS`; `rewardAwardResponseSchema` gains `financialEntryId`, `invoice`,
  `voidedAfterInvoicing`. (DQ4/DQ11)

#### Reward approval & void (inspector-program)

- **FR-008**: Approving a reward MUST, in the **same transaction** as the `PENDING → APPROVED` CAS,
  create one `INSPECTOR_BONUS` `APPROVED` entry with `initiated_by_user_id = null` and
  `approved_by_user_id` = the approver (PR #1229 pattern; the no-self-approval CAS **is** the
  maker-checker). This replaces the F08-1 no-op `IRewardAwardApprovalHook` with a real
  `BonusLedgerHook`. (DQ3)
- **FR-009**: Voiding a **non-invoiced** `PENDING`/`APPROVED` reward MUST void its ledger entry
  (`APPROVED → VOIDED`) in the same transaction (a `PENDING` reward has no entry). (DQ6)
- **FR-010**: Voiding an **invoiced** (`inspector_invoice_id` not null) or `PAID` reward MUST be
  restricted to AM (`inspector_program.awards.void_invoiced`); OP → `403 FORBIDDEN` "Only an Admin
  Master can void an invoiced reward". It MUST leave the original entry untouched and create a
  negative reversal entry linked via the existing `reference_entry_id`; `paid_at` is preserved; the
  reward goes to `VOID`. (DQ6, DL3)
- **FR-011**: The reward list/detail/summary responses MUST carry `financialEntryId`, `invoice
  { id, invoiceNumberDisplay, status } | null` and `voidedAfterInvoicing`; `totals.paid` MUST equal
  the sum of `PAID` rewards. The approve response MUST carry `financialEntryId`.
- **FR-012**: `inspector_program.awards.void_invoiced` MUST be appended to `ROLE_ACTION_MATRIX`
  (AM only). This is an RBAC change — follow the RBAC-widening checklist.

#### Billing — readers, scope, invoice sync

- **FR-013**: The three invoice readers (`sumApprovedPayoutsForInspectorInPeriod`,
  `aggregateApprovedPayoutsForInspectorInPeriod`, `findApprovedPayoutLinesForSnapshot`) and
  `getInspectorEarningsSummary` MUST include `INSPECTOR_BONUS` alongside `INSPECTOR_PAYOUT`.
  `findApprovedPayoutLinesForSnapshot` MUST read bonus lines (no appointment) via a second query,
  build each `BONUS` line (`appointmentId/appointmentCode/propertyAddress/serviceType/agency*/
  branch*` all null, `amount`, `entryId`, `rewardAwardId`, `description`) and interleave by
  `effective_at`; a reversal renders as a `BONUS` line with negative amount and the original's
  `rewardAwardId` (resolved via `reference_entry_id`). (DQ9)
- **FR-014**: `getSummary` (AM) MUST report `totalBonuses` separate from `totalPayouts`.
- **FR-015**: `ListFinancialEntriesUseCase` MUST let INSP see both types (`entryTypeIn
  ['INSPECTOR_PAYOUT','INSPECTOR_BONUS']`, `type` restricted to those two) and OP see the platform
  bonus (`includePlatformBonus`: `OR (tenant_id IS NULL AND entry_type = 'INSPECTOR_BONUS')`);
  `GetFinancialEntryUseCase` INSP MUST accept both types; CL MUST continue to be refused
  (`403` on `type=INSPECTOR_BONUS`, `404` on a bonus id). (DQ9/DQ10)
- **FR-016**: Generic billing actions (`void`/`update`/`approve`/`cancel`/`refund`) on an
  `INSPECTOR_BONUS` entry MUST return `409 BONUS_ENTRY_MANAGED_BY_REWARD` before any write. (DQ12)
- **FR-017**: `RequestInvoiceUseCase` MUST reject a period whose total is ≤ 0 with `422
  INVOICE_NON_POSITIVE_TOTAL`; `PreviewInvoiceUseCase` MUST count bonuses in `payoutCount`. (DQ13)
- **FR-018**: Invoice sync MUST run through a billing-domain port `IRewardAwardInvoiceSync`
  (implemented by inspector-program, injected as the **last optional** constructor param): closing
  the draft links the period's approved rewards (`linkToInvoice` inside `assignNumberAndFreeze`'s
  transaction; link-count ≠ `BONUS` lines with an original `rewardAwardId` → rollback + `409
  INVOICE_LINES_CHANGED`); marking paid (unit and per-invoice in batch) sets the rewards `PAID`
  atomically with the invoice write; reversing payment returns them to `APPROVED`. An invoice with
  no bonus line MUST issue no reward UPDATE (zero regression). (DQ5, DQ11)
- **FR-019**: The bonus ledger write/void/reversal MUST run through an inspector-program-domain port
  `IBonusEntryWriter` (implemented by billing) so the reward module does not import the financial
  repository; wired at the composition root (`container.ts`). (cross-module-port pattern)

#### PDF, web, PWA, docs

- **FR-020**: The invoice PDF MUST render a `BONUS` line as Appointment "Bonus", Property =
  description, Service Type/Agency "-"; the total is unchanged (sum of lines).
- **FR-021**: Web MUST extend the Rewards tab (Invoice column, chips, AM-only invoiced "Void" with
  the reversal-warning dialog, Paid tile reflecting paid invoices), render the Financial list and
  the invoice drawer `BONUS` line (type chip "Bonus", description, agency "—"), and add a "Bonus"
  type token (`--color-fin-type-bonus`, contrast ≥ 4.5:1) to `status-colors`/`form-options`. No
  "Mark as paid" anywhere.
- **FR-022**: PWA MUST render the bonus in Earnings history (no fixed `type`), in `InvoiceDetailPage`
  and in `RequestInvoicePage` ("{n} approved items"); a reversal shows a negative amount.
- **FR-023**: `api-types` MUST be regenerated (`pnpm generate:api`) and committed with
  `openapi.json` (new type + invoice-line change). All new response fields MUST be declared in the
  route response schemas (the serializer strips undeclared fields and throws on a nullable value
  typed as required).
- **FR-024**: Documentation MUST be updated in the same PR: `apps/backend/CLAUDE.md` (billing:
  `INSPECTOR_BONUS` is the only tenantless entry, agency readers never return it, only
  inspector-program creates/voids it; inspector-program: invoice hooks + void rule),
  `packages/shared/CLAUDE.md` (`invoiceSnapshotLineSchema.kind`), and root `CLAUDE.md` §8 (financial
  rules: inspector goal bonus enters the inspector invoice).

### Key Entities *(include if feature involves data)*

- **FinancialEntry (`INSPECTOR_BONUS`)**: a platform-scoped ledger entry — **the only entry type
  with `tenant_id = NULL`**. The **original** carries `reward_award_id` (unique, 1:1 with the
  reward) and a positive `amount`; the **reversal** carries `reference_entry_id` (→ original) and a
  negative `amount`. `inspector_id` required, `appointment_id` null, `initiated_by_user_id` null.
- **RewardAward (extended)**: gains `inspector_invoice_id` (FK, nullable) set at invoice close;
  `paid_at` is copied from the invoice when it is paid; `status` extends its reachable set to `PAID`
  (via invoice) and `VOID`-after-paid (AM only, DL3).
- **InspectorInvoice (snapshot)**: `line_items_snapshot` gains a `kind` discriminator
  (`SERVICE`/`BONUS`); a `BONUS` line has no appointment and carries `entryId`, `rewardAwardId`,
  `description`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** (Q12, 03.A4): Approving a reward creates exactly one `INSPECTOR_BONUS` `APPROVED`
  entry (no agency) in the same transaction, and the invoice of the approval period shows the
  `Bonus` line in snapshot, total and PDF.
- **SC-002**: Paying the invoice (unit and batch) marks the reward `PAID` with the invoice's
  `paid_at`; reversing the payment returns it to `APPROVED`; rejecting a draft leaves the reward
  untouched.
- **SC-003**: Voiding before invoicing voids the ledger entry; after invoicing only AM may void,
  producing a negative reversal on the next invoice; OP gets `403`.
- **SC-004**: No agency surface (`CL_ADMIN`/`CL_USER` list, detail → `404`, summary, export,
  agency-scoped FINANCIAL report, dashboard pending count) ever shows a bonus — proven by an
  explicit test per reader.
- **SC-005**: CHECK constraints and unique indexes reject a bonus with an agency, an old type
  without an agency, a duplicate original entry and a duplicate reversal.
- **SC-006**: Idempotency & concurrency: a repeated/simultaneous approval yields one entry; a
  void-vs-close race ends in a coherent state (`409 INVOICE_LINES_CHANGED` or the reversal branch).
- **SC-007**: No manual reward-payment route or field exists; no generic billing action alters a
  bonus entry.
- **SC-008** (03.A5): Approve, void, `PAID` and payment-reversal all write an audit entry with an
  author (or `SYSTEM` for the invoice-driven hooks) and before/after state.

## Assumptions

- **A1 (Q12 decided)**: Q12 is a client decision of 2026-10-30 (clause 9.4), not an open question —
  the bonus enters the ledger and the inspector invoice; the reward is paid by the invoice; there is
  **no** manual reward payment (`mark-paid`, `paidOn`, `payment_reference`, `recovery_note`).
- **A2 (DQ10, RBAC widening, assumed per plan)**: OP sees the platform bonus in the financial list
  via a new `includePlatformBonus` predicate (OR `tenant_id IS NULL AND entry_type =
  'INSPECTOR_BONUS'`), rather than only on the Rewards tab/invoice. This widens OP visibility and is
  handled with the RBAC-widening checklist.
- **A3 (DQ11, assumed per plan)**: the reward↔invoice link is a new `reward_awards.inspector_invoice_id`
  column written at invoice close (the only invoice state that can no longer be voided).
- **A4 (DQ13, assumed per plan)**: a period whose total is ≤ 0 (reversal-only, or reversal > earnings)
  blocks the invoice request with `422 INVOICE_NON_POSITIVE_TOTAL`; the operator resolves it with a
  manual adjustment (no automatic carry-forward).
- **A5 (reversal linkage, assumed per plan)**: the reversal links to the original via the **existing**
  `reference_entry_id` auto-relation (the `REFUND` compensation pattern), not a new column;
  `reward_award_id` stays only on the original so the `UNIQUE` remains 1:1.
- **A6 (multi-tenant exception)**: `INSPECTOR_BONUS` financial entries carry **no `tenant_id`**
  (platform leg); `reward_awards` and `inspector_invoices` keep their existing scope. Agency
  isolation is enforced by the `tenant_id`/allowlist filters on every reader plus the explicit per-
  reader tests. (`reward_awards` is already platform-scoped from F08-1; `inspector_invoices` is
  inspector-scoped from spec 032.)
- **A7 (dependencies merged)**: TASK-F08-1 (`ApproveRewardAwardUseCase`, `VoidRewardAwardUseCase`,
  `IRewardAwardApprovalHook` no-op, `reward_awards.paid_at`, the `VOID`-with-`paid_at` CHECK) and
  TASK-F08-3 (Rewards tab) are merged on `develop`; the billing inspector-invoice flow (spec 032)
  exists. No backfill is needed — no reward is approved in prod before this ships (F08-1/F08-3/F08-6
  deploy together).
- **A8 (timezone, DR5)**: the billing period that receives the bonus and the bonus line's
  `serviceDate` use `PLATFORM_TIMEZONE` (`periodEffectiveRange`); instants (`effective_at`,
  `approved_at`, `paid_at`) are UTC.
- **A9 (unblocks)**: this task unblocks TASK-F08-5 (ledger/invoice columns) and precedes TASK-F08-4
  (DL14 copy); those are out of scope here.
