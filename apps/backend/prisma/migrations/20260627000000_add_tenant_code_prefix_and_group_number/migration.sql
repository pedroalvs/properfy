-- Promote the appointment-code prefix to a dedicated unique column on tenants
-- (out of settings_json, so uniqueness is DB-enforced) and add a sequential
-- numeric code to service groups. Additive only (expand): no data backfill of the
-- prefix here (legacy rows stay NULL; the unique index ignores NULLs). The SERIAL
-- column backfills existing service_groups rows with sequential values.

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "appointment_code_prefix" VARCHAR(4);

-- AlterTable
ALTER TABLE "service_groups" ADD COLUMN "group_number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_appointment_code_prefix_key" ON "tenants"("appointment_code_prefix");

-- CreateIndex
CREATE UNIQUE INDEX "service_groups_group_number_key" ON "service_groups"("group_number");
