-- 031 PR-3: remove the orphan tenant-invoice feature.
-- The tenant_invoices table had no file worker (file_key always null), no
-- download / mark-paid surface and no clear functional owner. The Agency
-- financial statement is served live from `financial_entries` instead.
-- Data history is a non-constraint in every environment (destructive drop).

-- DropForeignKey
ALTER TABLE "tenant_invoices" DROP CONSTRAINT "tenant_invoices_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_invoices" DROP CONSTRAINT "tenant_invoices_generated_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_invoices" DROP CONSTRAINT "tenant_invoices_previous_invoice_id_fkey";

-- DropTable
DROP TABLE "tenant_invoices";

-- DropEnum
DROP TYPE "TenantInvoiceStatus";
