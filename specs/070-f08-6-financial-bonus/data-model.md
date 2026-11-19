# Phase 1 — Data Model

## Enum change

```prisma
enum FinancialEntryType {
  TENANT_DEBIT
  INSPECTOR_PAYOUT
  REFUND
  MANUAL_ADJUSTMENT
  INSPECTOR_BONUS            // Q12: platform↔inspector bonus; tenant_id NULL (CHECK)
}
```

## FinancialEntry (extended)

| Field | Change | Rule |
|---|---|---|
| `tenant_id` | `String` → `String?` | NULL **iff** `entry_type = 'INSPECTOR_BONUS'` (CHECK) |
| `reward_award_id` | **new** `String? @unique` | FK → `reward_awards.id`, `ON DELETE RESTRICT`; set on the **original** bonus entry only (1:1 with the reward) |
| `reference_entry_id` | existing (reused) | The **reversal** points here → the original bonus entry (no new column) |
| `appointment_id` | existing | NULL for a bonus |
| `inspector_id` | existing | NOT NULL for a bonus |
| `initiated_by_user_id` | existing (nullable) | NULL for a bonus (system-minted; PR #1229) |
| `approved_by_user_id` | existing | = the reward approver (original); the reversal is `APPROVED` with no self-approval issue |

Prisma relations added: `tenant Tenant?`, `rewardAward RewardAward? @relation(fields:
[reward_award_id], references: [id], onDelete: Restrict)`.

### Lifecycle (bonus entry)

- **original**: created `APPROVED` at reward approval → `VOIDED` if the reward is voided before
  invoicing. Once invoiced it is immutable (the reversal corrects it).
- **reversal**: created `APPROVED` at AM void-after-invoicing; never voided.

## RewardAward (extended)

| Field | Change | Rule |
|---|---|---|
| `inspector_invoice_id` | **new** `String?` | FK → `inspector_invoices.id`, `ON DELETE RESTRICT`, indexed; set at invoice **close** (`CLOSED`). "Invoiced" = not null |
| `inspector_invoice` | **new** relation | `InspectorInvoice?` |
| `financial_entry` | **new** back-relation | `FinancialEntry?` (the original bonus entry) |
| `status` | reachable set extends | `PENDING → APPROVED → PAID`; `VOID` from `PENDING`/`APPROVED` (pre-invoice) or `APPROVED`/`PAID` (AM, post-invoice) |
| `paid_at` | existing (nullable) | copied from `invoice.paid_at` on payment; cleared on payment reversal; **kept** on AM void-after-paid |

Entity (`reward-award.entity.ts`) gains `inspectorInvoiceId: string | null`. `canVoid` extends to
allow `PAID` (AM path); the use case gates the invoiced/paid branch to AM and chooses void-vs-reversal.

## InspectorInvoice snapshot line (`line_items_snapshot` JSON)

`invoiceSnapshotLineSchema` (shared `responses.ts`) gains:

| Field | Type | Rule |
|---|---|---|
| `kind` | `z.enum(['SERVICE','BONUS']).default('SERVICE')` | legacy lines (no `kind`) parse as `SERVICE` |
| `appointmentId` | `uuid` → `.nullable()` | required for `SERVICE` (refine), null for `BONUS` |
| `appointmentCode` | `string` → `.nullable()` | required for `SERVICE` (refine), null for `BONUS` |
| `entryId` | `uuid` optional | the ledger entry id (BONUS) |
| `rewardAwardId` | `uuid \| null` optional | original reward id (BONUS; the reversal carries the original's id) |
| `description` | `string \| null` optional | `"Bonus: {goal title} · {period}"` / `"Bonus reversal: …"` |

A `BONUS` line: `kind:'BONUS'`, `appointmentId:null`, `appointmentCode:null`, `serviceDate =
effective_at` civil date, `propertyAddress/serviceType/agencyId/agencyName/branchId/branchName`
null, `amount` (negative for a reversal), `entryId`, `rewardAwardId`, `description`.

## Migrations (expand-only, two files)

### Migration 1 — `<ts>_financial_entry_type_inspector_bonus`

```sql
ALTER TYPE "FinancialEntryType" ADD VALUE 'INSPECTOR_BONUS';
```

(Alone — Postgres forbids using the new value in the same transaction, and the CHECKs below cite it.)

### Migration 2 — `<ts>_inspector_bonus_ledger`

```sql
ALTER TABLE "financial_entries" ALTER COLUMN "tenant_id" DROP NOT NULL;
ALTER TABLE "financial_entries" ADD COLUMN "reward_award_id" TEXT;
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_reward_award_id_fkey"
  FOREIGN KEY ("reward_award_id") REFERENCES "reward_awards"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "financial_entries_reward_award_id_key" ON "financial_entries"("reward_award_id");
ALTER TABLE "financial_entries"
  ADD CONSTRAINT "financial_entries_bonus_tenant_chk"
    CHECK (("entry_type" = 'INSPECTOR_BONUS') = ("tenant_id" IS NULL)),
  ADD CONSTRAINT "financial_entries_bonus_shape_chk" CHECK (
    ("reward_award_id" IS NOT NULL) <= ("entry_type" = 'INSPECTOR_BONUS')
    AND (("entry_type" <> 'INSPECTOR_BONUS') OR (
      "inspector_id" IS NOT NULL AND "appointment_id" IS NULL
      AND (("reward_award_id" IS NOT NULL) <> ("reference_entry_id" IS NOT NULL))
      AND (("reward_award_id" IS NOT NULL) = ("amount" > 0))
      AND (("reference_entry_id" IS NOT NULL) = ("amount" < 0)))));
CREATE UNIQUE INDEX "financial_entries_bonus_reversal_unique"
  ON "financial_entries"("reference_entry_id") WHERE "entry_type" = 'INSPECTOR_BONUS';
ALTER TABLE "reward_awards" ADD COLUMN "inspector_invoice_id" TEXT
  REFERENCES "inspector_invoices"("id") ON DELETE RESTRICT;
CREATE INDEX "reward_awards_inspector_invoice_id_idx" ON "reward_awards"("inspector_invoice_id");
ALTER TABLE "reward_awards" ADD CONSTRAINT "reward_awards_paid_invoice_chk"
  CHECK (("status" = 'PAID') <= ("inspector_invoice_id" IS NOT NULL));
```

**Drift note**: the partial unique index is not expressible in `schema.prisma` — verify `prisma
migrate dev` does not drop it (memory `project_prisma_drift_drops_unsupported_indexes`) and apply
locally (memory `feedback_migration_apply_locally`). No backfill; the `tenant_id` NULL is permanent
for the type (no contract migration).

## Integrity constraints summary (test 8, testcontainers)

- `financial_entries_bonus_tenant_chk`: bonus with tenant → violation; old type with NULL tenant → violation.
- `financial_entries_bonus_shape_chk`: bonus without `inspector_id`, with `appointment_id`, with both
  `reward_award_id` and `reference_entry_id`, original amount ≤ 0, reversal amount ≥ 0 → violation;
  `reward_award_id` on a non-bonus type → violation.
- `financial_entries_reward_award_id_key`: duplicate `reward_award_id` → `23505`/`P2002`.
- `financial_entries_bonus_reversal_unique`: second reversal of same original → `23505` (raw → 409).
- `reward_awards_inspector_invoice_id_fkey`: `ON DELETE RESTRICT`.
- `reward_awards_paid_invoice_chk`: `PAID` without an invoice link → violation.
- Migration over a dump with existing entries: no row altered; every legacy `tenant_id` stays set.
