-- Inspector Property Invoice foundation (spec 032): numbering column, snapshot, issued_at rename,
-- FORTNIGHTLY nomenclature, and per-inspector billing cycle. Additive / in-place only.

-- Rename the biweekly cadence to the Australian term. "BillingPeriodType" is used ONLY by
-- inspector_invoices.period_type; the tenant/agency billing period is a separate JSON string
-- (tenants.settings_json) and is intentionally left untouched. RENAME VALUE updates existing
-- rows in place, so no data migration is required.
ALTER TYPE "BillingPeriodType" RENAME VALUE 'BIWEEKLY' TO 'FORTNIGHTLY';

-- New invoice columns. invoice_number stays NULL until approval (assigned from a sequence in a
-- later migration); line_items_snapshot / inspector_name are frozen at approval.
ALTER TABLE "inspector_invoices" ADD COLUMN "invoice_number" INTEGER;
ALTER TABLE "inspector_invoices" ADD COLUMN "inspector_name" TEXT;
ALTER TABLE "inspector_invoices" ADD COLUMN "line_items_snapshot" JSONB;

-- generated_at is the moment an invoice is finalized/issued; rename in place (data preserved).
ALTER TABLE "inspector_invoices" RENAME COLUMN "generated_at" TO "issued_at";

-- Unique invoice number (nullable until approval).
CREATE UNIQUE INDEX "inspector_invoices_invoice_number_key" ON "inspector_invoices"("invoice_number");

-- Per-inspector billing cycle used to compute closed periods (nullable; app defaults to FORTNIGHTLY).
ALTER TABLE "inspectors" ADD COLUMN "billing_cycle" "BillingPeriodType";
