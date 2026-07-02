-- Inspector Property Invoice cleanup (spec 032): remove the legacy OPEN/SUPERSEDED statuses and the
-- previous_invoice_id versioning chain now that admin generate/regenerate are gone.

-- 1. Backfill legacy statuses onto the surviving set (history is a non-constraint in every env).
UPDATE "inspector_invoices" SET "status" = 'CLOSED' WHERE "status" = 'OPEN';
UPDATE "inspector_invoices" SET "status" = 'VOID' WHERE "status" = 'SUPERSEDED';

-- 2. Drop the versioning chain (dropping the column auto-drops its FK + unique index).
ALTER TABLE "inspector_invoices" DROP COLUMN "previous_invoice_id";

-- 3. Drop the ACTIVE-only partial unique index — its WHERE predicate references the enum type, so
--    it must not exist while the type is recreated. It is rebuilt in step 5.
DROP INDEX "inspector_invoices_active_period_unique";

-- 4. Recreate InspectorInvoiceStatus without OPEN/SUPERSEDED (Postgres has no ALTER TYPE DROP VALUE).
ALTER TABLE "inspector_invoices" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "InspectorInvoiceStatus" RENAME TO "InspectorInvoiceStatus_old";
CREATE TYPE "InspectorInvoiceStatus" AS ENUM ('PENDING_REVIEW', 'CLOSED', 'PAID', 'VOID');
ALTER TABLE "inspector_invoices"
  ALTER COLUMN "status" TYPE "InspectorInvoiceStatus"
  USING "status"::text::"InspectorInvoiceStatus";
DROP TYPE "InspectorInvoiceStatus_old";

-- 5. Rebuild the ACTIVE-only partial unique index against the new type.
CREATE UNIQUE INDEX "inspector_invoices_active_period_unique"
  ON "inspector_invoices" ("inspector_id", "period_start", "period_end")
  WHERE "status" IN ('PENDING_REVIEW', 'CLOSED', 'PAID');
