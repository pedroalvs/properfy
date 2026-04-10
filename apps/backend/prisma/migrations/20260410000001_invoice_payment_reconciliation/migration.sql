-- Feature 017: Invoice Payment Reconciliation
-- Additive migration: adds payment recording fields to inspector_invoices.
-- No existing rows are affected. Both columns are nullable.

-- AlterTable: Add payment tracking fields to InspectorInvoice
ALTER TABLE "inspector_invoices"
  ADD COLUMN "paid_by_user_id"   TEXT,
  ADD COLUMN "payment_reference" VARCHAR(255);

-- AddForeignKey: paid_by_user_id references the user who recorded the payment
ALTER TABLE "inspector_invoices"
  ADD CONSTRAINT "inspector_invoices_paid_by_user_id_fkey"
  FOREIGN KEY ("paid_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
