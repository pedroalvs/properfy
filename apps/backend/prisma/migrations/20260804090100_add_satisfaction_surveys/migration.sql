-- Satisfaction survey (scope item 14 / doc §6.2, §7.6, §4.5).
--
-- One immutable response per appointment. The unique index on appointment_id is what makes the
-- submit path idempotent: a duplicate insert raises P2002 and the repository re-reads and returns
-- the existing row instead of overwriting it.
--
-- The CHECK constraint is deliberate: Prisma cannot express it, and the 1..5 bound must not depend
-- on Zod validation alone — a direct insert from a script or a future code path must fail too.
--
-- Foreign keys use RESTRICT: a survey is a record of what a person said, so it must not disappear
-- as a side effect of deleting the appointment, agency or inspector it refers to.
CREATE TABLE "satisfaction_surveys" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "inspector_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "satisfaction_surveys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "satisfaction_surveys_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "satisfaction_surveys_appointment_id_key" ON "satisfaction_surveys"("appointment_id");

-- Supports the per-inspector average/count aggregation on the inspector list and detail.
CREATE INDEX "satisfaction_surveys_inspector_id_idx" ON "satisfaction_surveys"("inspector_id");

-- Supports the agency-scoped read of individual responses.
CREATE INDEX "satisfaction_surveys_tenant_id_idx" ON "satisfaction_surveys"("tenant_id");

ALTER TABLE "satisfaction_surveys" ADD CONSTRAINT "satisfaction_surveys_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "satisfaction_surveys" ADD CONSTRAINT "satisfaction_surveys_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "satisfaction_surveys" ADD CONSTRAINT "satisfaction_surveys_inspector_id_fkey"
    FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
