-- Realign the Reports feature to the client scope: exactly 4 report types,
-- XLSX-only output, and no Scheduled Reports subsystem.
--
-- Destructive by design — report rows are not preserved (there is no data to keep
-- for this feature). Ordered to respect foreign-key and enum dependencies.

-- 1. Drop the reports -> scheduled_reports FK column first so the tables can be dropped.
ALTER TABLE "reports" DROP COLUMN IF EXISTS "scheduled_report_id";
DROP INDEX IF EXISTS "reports_scheduled_report_id_idx";

-- 2. Drop the run ledger (it FKs both scheduled_reports and reports).
DROP TABLE IF EXISTS "scheduled_report_runs";

-- 3. Drop the schedules table (its report_type also used the ReportType enum).
DROP TABLE IF EXISTS "scheduled_reports";

-- 4. Drop the report format column (XLSX is now the only, implicit, format).
ALTER TABLE "reports" DROP COLUMN IF EXISTS "format";

-- 5. Swap the ReportType enum to the 4 scoped values. `reports` is emptied first so
--    the USING cast never sees a legacy value (which is absent from the new enum).
TRUNCATE TABLE "reports";
ALTER TYPE "ReportType" RENAME TO "ReportType_old";
CREATE TYPE "ReportType" AS ENUM ('APPOINTMENTS', 'FINANCIAL', 'PERFORMANCE', 'AGENCIES');
ALTER TABLE "reports"
  ALTER COLUMN "report_type" TYPE "ReportType" USING ("report_type"::text::"ReportType");
DROP TYPE "ReportType_old";

-- 6. Drop the now-unused enums.
DROP TYPE IF EXISTS "ReportFormat";
DROP TYPE IF EXISTS "ScheduleDeliveryMode";
DROP TYPE IF EXISTS "ScheduleStatus";
DROP TYPE IF EXISTS "ScheduleRunStatus";
