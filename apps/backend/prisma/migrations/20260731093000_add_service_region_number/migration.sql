-- Sequential, human-readable code for service regions, mirroring
-- service_groups.group_number.
--
-- It also settles the overlapping-region tie-break: a service group created for
-- a single appointment matches every region containing that one property, and
-- resolveRegionsForAppointments ranks by COUNT(DISTINCT appointment_id) — which
-- is 1 for all of them. Ordering by region_number makes "the region created
-- first is the canonical one" the rule. Unlike ordering by name, it cannot be
-- changed by a rename.
--
-- Note this deliberately does NOT use the plain `ADD COLUMN ... SERIAL` shortcut
-- that 20260627000000 used for group_number. SERIAL backfills existing rows in
-- physical heap order, which is arbitrary — and here the order *is* the
-- tie-break, so an arbitrary backfill would defeat the column's purpose. Rows
-- are numbered by (created_at, id) instead.

ALTER TABLE "service_regions" ADD COLUMN "region_number" INTEGER;

WITH ordered AS (
  SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS rn
    FROM "service_regions"
)
UPDATE "service_regions" sr
   SET "region_number" = ordered.rn
  FROM ordered
 WHERE sr."id" = ordered."id";

CREATE SEQUENCE "service_regions_region_number_seq" OWNED BY "service_regions"."region_number";

-- `false` => the next nextval() returns exactly this value, so numbering
-- resumes right after the backfilled maximum.
SELECT setval(
  '"service_regions_region_number_seq"',
  COALESCE((SELECT MAX("region_number") FROM "service_regions"), 0) + 1,
  false
);

ALTER TABLE "service_regions"
  ALTER COLUMN "region_number" SET DEFAULT nextval('"service_regions_region_number_seq"');

ALTER TABLE "service_regions" ALTER COLUMN "region_number" SET NOT NULL;

CREATE UNIQUE INDEX "service_regions_region_number_key" ON "service_regions"("region_number");
