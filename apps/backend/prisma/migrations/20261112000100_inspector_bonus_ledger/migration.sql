-- Q12 (F08-6): the inspector goal bonus becomes a ledger entry on the inspector invoice.
-- Expand-only. No backfill (no reward is approved in prod before this ships).

-- 1. financial_entries: the bonus is the ONLY entry type without a tenant (platform leg).
ALTER TABLE "financial_entries" ALTER COLUMN "tenant_id" DROP NOT NULL;

-- 2. The original bonus entry is 1:1 with its reward.
ALTER TABLE "financial_entries" ADD COLUMN "reward_award_id" TEXT;
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_reward_award_id_fkey"
  FOREIGN KEY ("reward_award_id") REFERENCES "reward_awards"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "financial_entries_reward_award_id_key" ON "financial_entries"("reward_award_id");

-- 3. Shape + tenant invariants for the bonus.
--    - tenant_id is NULL exactly for INSPECTOR_BONUS (biconditional).
--    - reward_award_id only on INSPECTOR_BONUS; a bonus has inspector_id and no appointment;
--      the original carries reward_award_id (amount > 0), the reversal carries
--      reference_entry_id (amount < 0), never both.
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

-- 4. Reversal idempotency: at most one reversal per original bonus entry. Prisma cannot
--    express a partial unique index, so it lives only here (confirm `prisma migrate dev`
--    does not drop it on a future diff).
CREATE UNIQUE INDEX "financial_entries_bonus_reversal_unique"
  ON "financial_entries"("reference_entry_id") WHERE "entry_type" = 'INSPECTOR_BONUS';

-- 5. reward_awards: link to the invoice that carries the bonus (set at close).
ALTER TABLE "reward_awards" ADD COLUMN "inspector_invoice_id" TEXT;
ALTER TABLE "reward_awards" ADD CONSTRAINT "reward_awards_inspector_invoice_id_fkey"
  FOREIGN KEY ("inspector_invoice_id") REFERENCES "inspector_invoices"("id") ON DELETE RESTRICT;
CREATE INDEX "reward_awards_inspector_invoice_id_idx" ON "reward_awards"("inspector_invoice_id");

-- 6. A reward can only be PAID once it is on an invoice.
ALTER TABLE "reward_awards" ADD CONSTRAINT "reward_awards_paid_invoice_chk"
  CHECK (("status" = 'PAID') <= ("inspector_invoice_id" IS NOT NULL));
