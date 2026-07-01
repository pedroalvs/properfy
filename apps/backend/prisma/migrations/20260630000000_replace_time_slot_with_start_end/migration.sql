-- Remove the time-slot catalog feature and replace the appointment's composite
-- `time_slot` string ("09:00-12:00") with two bare HH:mm columns.
--
-- Per product decision the catalog data is disposable, so the catalog table is
-- dropped outright. The appointment columns use an expand/contract sequence
-- (add nullable -> backfill by splitting the old string -> enforce NOT NULL ->
-- drop the old column) so existing rows stay valid through the migration.

-- 1. Drop the catalog table. DROP TABLE cascades its own indexes and the
--    outgoing FKs to tenants/branches; no other table references it.
DROP TABLE IF EXISTS "appointment_time_slots";

-- 2. Expand: add the new columns as nullable.
ALTER TABLE "appointments" ADD COLUMN "time_slot_start" VARCHAR(5);
ALTER TABLE "appointments" ADD COLUMN "time_slot_end" VARCHAR(5);

-- 3. Backfill from the composite "HH:MM-HH:MM" string ('-' is the only separator;
--    ':' is internal to each time, so split_part on '-' is unambiguous).
UPDATE "appointments"
SET "time_slot_start" = split_part("time_slot", '-', 1),
    "time_slot_end"   = split_part("time_slot", '-', 2)
WHERE "time_slot" IS NOT NULL;

-- 4. Contract: enforce NOT NULL now that every row is backfilled, then drop the old column.
ALTER TABLE "appointments" ALTER COLUMN "time_slot_start" SET NOT NULL;
ALTER TABLE "appointments" ALTER COLUMN "time_slot_end" SET NOT NULL;
ALTER TABLE "appointments" DROP COLUMN "time_slot";
