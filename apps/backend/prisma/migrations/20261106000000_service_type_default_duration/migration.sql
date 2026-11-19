-- Service type per-stop duration (F04 TASK-F04-1, D6).
-- Pure-expand: NOT NULL with a constant default does not rewrite the table
-- (Postgres 11+). The CHECK is not modeled in Prisma (no drift). The backfill
-- block is idempotent and bounded between the markers for the db integration test.

ALTER TABLE "service_types"
  ADD COLUMN "default_duration_minutes" INTEGER NOT NULL DEFAULT 45;

ALTER TABLE "service_types"
  ADD CONSTRAINT "service_types_default_duration_minutes_range"
  CHECK ("default_duration_minutes" BETWEEN 5 AND 480);

-- backfill:begin
WITH measured AS (
  SELECT a."service_type_id",
         count(*) AS samples,
         avg(extract(epoch FROM (e."finished_at" - e."started_at")) / 60.0) AS avg_min
  FROM "inspection_executions" e
  JOIN "appointments" a ON a."id" = e."appointment_id"
  WHERE e."finished_at" IS NOT NULL
    AND e."abandoned_at" IS NULL
    AND extract(epoch FROM (e."finished_at" - e."started_at")) BETWEEN 300 AND 28800
  GROUP BY a."service_type_id"
)
UPDATE "service_types" st
SET "default_duration_minutes" = LEAST(480, GREATEST(5, (round(m.avg_min / 5.0) * 5)::int))
FROM measured m
WHERE m."service_type_id" = st."id"
  AND m.samples >= 10;
-- backfill:end
