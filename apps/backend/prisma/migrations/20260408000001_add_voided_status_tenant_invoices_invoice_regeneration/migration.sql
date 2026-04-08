-- AlterEnum: Add VOIDED to FinancialEntryStatus
ALTER TYPE "FinancialEntryStatus" ADD VALUE 'VOIDED';

-- AlterEnum: Add SUPERSEDED to InspectorInvoiceStatus
ALTER TYPE "InspectorInvoiceStatus" ADD VALUE 'SUPERSEDED';

-- AlterTable: Add void fields to FinancialEntry
ALTER TABLE "financial_entries" ADD COLUMN "voided_by_user_id" TEXT,
ADD COLUMN "voided_at" TIMESTAMP(3),
ADD COLUMN "void_reason" TEXT;

-- AlterTable: Add version chain field to InspectorInvoice
ALTER TABLE "inspector_invoices" ADD COLUMN "previous_invoice_id" TEXT;

-- CreateEnum: TenantInvoiceStatus
CREATE TYPE "TenantInvoiceStatus" AS ENUM ('OPEN', 'CLOSED', 'PAID', 'SUPERSEDED');

-- CreateTable: TenantInvoice
CREATE TABLE "tenant_invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "total_debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_refund" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_adjustment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "status" "TenantInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "file_key" TEXT,
    "previous_invoice_id" TEXT,
    "generated_by_user_id" TEXT,
    "generated_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_invoices_tenant_id_status_idx" ON "tenant_invoices"("tenant_id", "status");
CREATE INDEX "tenant_invoices_period_from_period_to_idx" ON "tenant_invoices"("period_from", "period_to");

-- Unique constraints for self-referencing chains
CREATE UNIQUE INDEX "inspector_invoices_previous_invoice_id_key" ON "inspector_invoices"("previous_invoice_id");
CREATE UNIQUE INDEX "tenant_invoices_previous_invoice_id_key" ON "tenant_invoices"("previous_invoice_id");

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_voided_by_user_id_fkey" FOREIGN KEY ("voided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inspector_invoices" ADD CONSTRAINT "inspector_invoices_previous_invoice_id_fkey" FOREIGN KEY ("previous_invoice_id") REFERENCES "inspector_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_invoices" ADD CONSTRAINT "tenant_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenant_invoices" ADD CONSTRAINT "tenant_invoices_generated_by_user_id_fkey" FOREIGN KEY ("generated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tenant_invoices" ADD CONSTRAINT "tenant_invoices_previous_invoice_id_fkey" FOREIGN KEY ("previous_invoice_id") REFERENCES "tenant_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
