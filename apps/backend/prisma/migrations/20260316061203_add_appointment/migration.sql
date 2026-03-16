-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('DRAFT', 'AWAITING_INSPECTOR', 'SCHEDULED', 'DONE', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TenantConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'UNAVAILABLE', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "RestrictionSource" AS ENUM ('TENANT_PORTAL', 'OPERATOR', 'IMPORT');

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "service_type_id" TEXT NOT NULL,
    "inspector_id" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_date" DATE NOT NULL,
    "time_slot" VARCHAR(50) NOT NULL,
    "key_required" BOOLEAN NOT NULL DEFAULT false,
    "meeting_location" VARCHAR(500),
    "key_location" VARCHAR(500),
    "tenant_confirmation_status" "TenantConfirmationStatus" NOT NULL DEFAULT 'PENDING',
    "price_amount" DECIMAL(12,2) NOT NULL,
    "payout_amount" DECIMAL(12,2) NOT NULL,
    "pricing_rule_snapshot_json" JSONB NOT NULL,
    "notes" TEXT,
    "custom_fields_json" JSONB,
    "reason" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "done_checked_by_user_id" TEXT,
    "done_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_contacts" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "tenant_name" VARCHAR(200) NOT NULL,
    "primary_email" VARCHAR(254),
    "secondary_email" VARCHAR(254),
    "primary_phone" VARCHAR(30),
    "secondary_phone" VARCHAR(30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_restrictions" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "is_home" BOOLEAN NOT NULL,
    "unavailable_days_json" JSONB,
    "unavailable_hours_json" JSONB,
    "notes" TEXT,
    "source" "RestrictionSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_restrictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_tenant_id_status_idx" ON "appointments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_branch_id_idx" ON "appointments"("tenant_id", "branch_id");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_inspector_id_idx" ON "appointments"("tenant_id", "inspector_id");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_scheduled_date_idx" ON "appointments"("tenant_id", "scheduled_date");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_service_type_id_idx" ON "appointments"("tenant_id", "service_type_id");

-- CreateIndex
CREATE INDEX "appointments_deleted_at_idx" ON "appointments"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_contacts_appointment_id_key" ON "appointment_contacts"("appointment_id");

-- CreateIndex
CREATE INDEX "appointment_restrictions_appointment_id_idx" ON "appointment_restrictions"("appointment_id");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_done_checked_by_user_id_fkey" FOREIGN KEY ("done_checked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_contacts" ADD CONSTRAINT "appointment_contacts_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_restrictions" ADD CONSTRAINT "appointment_restrictions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
