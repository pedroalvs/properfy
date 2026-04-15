-- CreateExtension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('TENANT', 'PROPERTY_MANAGER', 'HOUSEKEEPER', 'BROKER', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactChannelType" AS ENUM ('EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "AppointmentContactRole" AS ENUM ('TENANT', 'TENANT_REPRESENTATIVE', 'HOUSEKEEPER', 'PROPERTY_MANAGER', 'BROKER', 'OTHER');

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "ContactType" NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "company" VARCHAR(200),
    "primary_email" VARCHAR(254),
    "primary_phone" VARCHAR(30),
    "additional_channels_json" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- Contacts: at-least-one-channel CHECK
ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_at_least_one_channel"
  CHECK ("primary_email" IS NOT NULL OR "primary_phone" IS NOT NULL);

-- Contacts: partial unique indexes (active contacts only, per tenant)
CREATE UNIQUE INDEX "contacts_tenant_email_active_unique"
  ON "contacts" ("tenant_id", "primary_email")
  WHERE "is_active" = true AND "primary_email" IS NOT NULL;

CREATE UNIQUE INDEX "contacts_tenant_phone_active_unique"
  ON "contacts" ("tenant_id", "primary_phone")
  WHERE "is_active" = true AND "primary_phone" IS NOT NULL;

-- Contacts: other indexes
CREATE INDEX "contacts_tenant_type_idx" ON "contacts" ("tenant_id", "type");
CREATE INDEX "contacts_tenant_active_idx" ON "contacts" ("tenant_id", "is_active");
CREATE INDEX "contacts_tenant_display_name_idx" ON "contacts" ("tenant_id", "display_name");

-- Contacts: trigram GIN index for autocomplete search
CREATE INDEX "contacts_display_name_trgm_idx" ON "contacts" USING gin ("display_name" gin_trgm_ops);

-- Contacts: FK to tenants
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AppointmentContact: drop the old unique constraint on appointment_id (was 1:1, now 1:many)
DROP INDEX IF EXISTS "appointment_contacts_appointment_id_key";

-- AppointmentContact: add new columns (additive expand phase — do NOT drop legacy columns)
ALTER TABLE "appointment_contacts" ADD COLUMN "contact_id" TEXT;
ALTER TABLE "appointment_contacts" ADD COLUMN "role" "AppointmentContactRole" NOT NULL DEFAULT 'TENANT';
ALTER TABLE "appointment_contacts" ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "appointment_contacts" ADD COLUMN "snapshot_name" VARCHAR(200);
ALTER TABLE "appointment_contacts" ADD COLUMN "snapshot_email" VARCHAR(254);
ALTER TABLE "appointment_contacts" ADD COLUMN "snapshot_phone" VARCHAR(30);

-- AppointmentContact: backfill snapshot fields from legacy columns (idempotent)
UPDATE "appointment_contacts"
SET
  "snapshot_name" = "tenant_name",
  "snapshot_email" = "primary_email",
  "snapshot_phone" = "primary_phone"
WHERE "snapshot_name" IS NULL;

-- AppointmentContact: FK to contacts
ALTER TABLE "appointment_contacts" ADD CONSTRAINT "appointment_contacts_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AppointmentContact: new indexes
CREATE INDEX "appointment_contacts_appointment_id_idx" ON "appointment_contacts" ("appointment_id");
CREATE INDEX "appointment_contacts_contact_id_idx" ON "appointment_contacts" ("contact_id");

-- AppointmentContact: partial unique for exactly-one-primary per appointment
CREATE UNIQUE INDEX "appointment_contacts_appointment_primary_unique"
  ON "appointment_contacts" ("appointment_id")
  WHERE "is_primary" = true;

-- AppointmentContact: prevent same contact linked twice to same appointment
CREATE UNIQUE INDEX "appointment_contacts_appointment_contact_unique"
  ON "appointment_contacts" ("appointment_id", "contact_id")
  WHERE "contact_id" IS NOT NULL;
