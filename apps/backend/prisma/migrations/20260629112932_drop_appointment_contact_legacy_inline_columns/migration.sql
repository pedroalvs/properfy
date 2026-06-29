/*
  024 contract phase: drop the legacy inline contact columns on
  `appointment_contacts`, leaving the snapshot_* fields as the authoritative
  contact data.

  - Backfill snapshot_* from the legacy columns for any rows still missing a
    snapshot (expand-phase rows), so `snapshot_name` can become NOT NULL.
  - Drop `tenant_name`, `primary_email`, `secondary_email`, `primary_phone`,
    `secondary_phone`. The secondary_* columns have no snapshot equivalent and
    are intentionally not preserved (drop-secondaries decision).
*/

-- Backfill the snapshot from the legacy columns BEFORE dropping them.
UPDATE "appointment_contacts"
SET
  "snapshot_name"  = COALESCE("snapshot_name", "tenant_name"),
  "snapshot_email" = COALESCE("snapshot_email", "primary_email"),
  "snapshot_phone" = COALESCE("snapshot_phone", "primary_phone");

-- AlterTable
ALTER TABLE "appointment_contacts" DROP COLUMN "primary_email",
DROP COLUMN "primary_phone",
DROP COLUMN "secondary_email",
DROP COLUMN "secondary_phone",
DROP COLUMN "tenant_name",
ALTER COLUMN "snapshot_name" SET NOT NULL;
