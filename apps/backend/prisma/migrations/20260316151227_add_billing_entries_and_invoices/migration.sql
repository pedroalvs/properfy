-- CreateEnum
CREATE TYPE "FinancialEntryType" AS ENUM ('TENANT_DEBIT', 'INSPECTOR_PAYOUT', 'REFUND', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "FinancialEntryStatus" AS ENUM ('PENDING', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectorInvoiceStatus" AS ENUM ('OPEN', 'CLOSED', 'PAID');

-- CreateEnum
CREATE TYPE "BillingPeriodType" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "financial_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "inspector_id" TEXT,
    "entry_type" "FinancialEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "FinancialEntryStatus" NOT NULL DEFAULT 'PENDING',
    "description" VARCHAR(500) NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL,
    "initiated_by_user_id" TEXT NOT NULL,
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "reference_entry_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspector_invoices" (
    "id" TEXT NOT NULL,
    "inspector_id" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "period_type" "BillingPeriodType" NOT NULL,
    "status" "InspectorInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "file_key" TEXT,
    "generated_by_user_id" TEXT,
    "generated_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspector_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_entries_tenant_id_idx" ON "financial_entries"("tenant_id");

-- CreateIndex
CREATE INDEX "financial_entries_appointment_id_idx" ON "financial_entries"("appointment_id");

-- CreateIndex
CREATE INDEX "financial_entries_inspector_id_idx" ON "financial_entries"("inspector_id");

-- CreateIndex
CREATE INDEX "financial_entries_entry_type_idx" ON "financial_entries"("entry_type");

-- CreateIndex
CREATE INDEX "financial_entries_status_idx" ON "financial_entries"("status");

-- CreateIndex
CREATE INDEX "financial_entries_effective_at_idx" ON "financial_entries"("effective_at");

-- CreateIndex
CREATE INDEX "financial_entries_tenant_id_entry_type_status_idx" ON "financial_entries"("tenant_id", "entry_type", "status");

-- CreateIndex
CREATE INDEX "inspector_invoices_inspector_id_status_idx" ON "inspector_invoices"("inspector_id", "status");

-- CreateIndex
CREATE INDEX "inspector_invoices_period_start_period_end_idx" ON "inspector_invoices"("period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "inspector_invoices_inspector_id_period_start_period_end_key" ON "inspector_invoices"("inspector_id", "period_start", "period_end");

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_reference_entry_id_fkey" FOREIGN KEY ("reference_entry_id") REFERENCES "financial_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_invoices" ADD CONSTRAINT "inspector_invoices_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_invoices" ADD CONSTRAINT "inspector_invoices_generated_by_user_id_fkey" FOREIGN KEY ("generated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
