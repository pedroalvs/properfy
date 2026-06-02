-- CreateEnum
CREATE TYPE "EmailAssetStatus" AS ENUM ('PENDING', 'UPLOADED', 'VERIFIED', 'UPLOAD_FAILED');

-- AlterEnum
BEGIN;
CREATE TYPE "PreservationRuleType_new" AS ENUM ('CROSS_CHECK', 'LEGAL_HOLD');
ALTER TABLE "audit_preservation_rules" ALTER COLUMN "rule_type" TYPE "PreservationRuleType_new" USING ("rule_type"::text::"PreservationRuleType_new");
ALTER TYPE "PreservationRuleType" RENAME TO "PreservationRuleType_old";
ALTER TYPE "PreservationRuleType_new" RENAME TO "PreservationRuleType";
DROP TYPE "PreservationRuleType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "appointment_confirmation_cycles" DROP CONSTRAINT "appointment_confirmation_cycles_appointment_id_fkey";

-- DropForeignKey
ALTER TABLE "appointment_confirmation_cycles" DROP CONSTRAINT "appointment_confirmation_cycles_portal_token_id_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_active_confirmation_cycle_id_fkey";

-- DropForeignKey
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "inspector_regions" DROP CONSTRAINT "inspector_regions_assigned_by_fkey";

-- DropForeignKey
ALTER TABLE "inspector_regions" DROP CONSTRAINT "inspector_regions_inspector_id_fkey";

-- DropForeignKey
ALTER TABLE "inspector_regions" DROP CONSTRAINT "inspector_regions_region_id_fkey";

-- DropForeignKey
ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "password_reset_tokens_user_id_fkey";

-- DropForeignKey
ALTER TABLE "service_regions" DROP CONSTRAINT "service_regions_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "service_regions" DROP CONSTRAINT "service_regions_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_portal_tokens" DROP CONSTRAINT "tenant_portal_tokens_confirmation_cycle_id_fkey";

-- DropIndex
DROP INDEX "contacts_display_name_trgm_idx";

-- DropIndex
DROP INDEX "notification_consents_recipient_channel_tenant_id_key";

-- DropIndex
DROP INDEX "properties_coordinates_idx";

-- DropIndex
DROP INDEX "service_regions_geom_gist_idx";

-- DropIndex
DROP INDEX "service_regions_geom_idx";

-- AlterTable
ALTER TABLE "appointment_confirmation_cycles" ALTER COLUMN "confirmed_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "invalidated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "inspector_regions" ALTER COLUMN "assigned_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "service_regions" ALTER COLUMN "color" SET NOT NULL;

-- CreateTable
CREATE TABLE "email_assets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "placeholder_key" VARCHAR(64) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "public_url" TEXT NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(50) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" "EmailAssetStatus" NOT NULL DEFAULT 'PENDING',
    "ever_sent" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_image_bindings" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "placeholder_key" VARCHAR(64) NOT NULL,
    "alt_text" VARCHAR(255),
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_image_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_assets_storage_key_key" ON "email_assets"("storage_key");

-- CreateIndex
CREATE INDEX "email_assets_tenant_id_idx" ON "email_assets"("tenant_id");

-- CreateIndex
CREATE INDEX "email_assets_status_idx" ON "email_assets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "email_assets_tenant_id_placeholder_key_key" ON "email_assets"("tenant_id", "placeholder_key");

-- CreateIndex
CREATE INDEX "template_image_bindings_asset_id_idx" ON "template_image_bindings"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_image_bindings_template_id_placeholder_key_key" ON "template_image_bindings"("template_id", "placeholder_key");

-- CreateIndex
CREATE INDEX "branches_tenant_id_name_idx" ON "branches"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_active_confirmation_cycle_id_fkey" FOREIGN KEY ("active_confirmation_cycle_id") REFERENCES "appointment_confirmation_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_confirmation_cycles" ADD CONSTRAINT "appointment_confirmation_cycles_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_confirmation_cycles" ADD CONSTRAINT "appointment_confirmation_cycles_portal_token_id_fkey" FOREIGN KEY ("portal_token_id") REFERENCES "tenant_portal_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_portal_tokens" ADD CONSTRAINT "tenant_portal_tokens_confirmation_cycle_id_fkey" FOREIGN KEY ("confirmation_cycle_id") REFERENCES "appointment_confirmation_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_regions" ADD CONSTRAINT "service_regions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_regions" ADD CONSTRAINT "service_regions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_regions" ADD CONSTRAINT "inspector_regions_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_regions" ADD CONSTRAINT "inspector_regions_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "service_regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_assets" ADD CONSTRAINT "email_assets_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_image_bindings" ADD CONSTRAINT "template_image_bindings_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "notification_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_image_bindings" ADD CONSTRAINT "template_image_bindings_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "email_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "appointment_confirmation_cycles_appt_cycle_num_unique" RENAME TO "appointment_confirmation_cycles_appointment_id_cycle_number_key";

-- RenameIndex
ALTER INDEX "appointment_confirmation_cycles_appt_status_idx" RENAME TO "appointment_confirmation_cycles_appointment_id_status_idx";

-- RenameIndex
ALTER INDEX "appointment_confirmation_cycles_portal_token_id_unique" RENAME TO "appointment_confirmation_cycles_portal_token_id_key";

-- RenameIndex
ALTER INDEX "appointment_time_slots_tenant_id_branch_id_start_time_end_ti_ke" RENAME TO "appointment_time_slots_tenant_id_branch_id_start_time_end_t_key";

-- RenameIndex
ALTER INDEX "contacts_tenant_active_idx" RENAME TO "contacts_tenant_id_is_active_idx";

-- RenameIndex
ALTER INDEX "contacts_tenant_display_name_idx" RENAME TO "contacts_tenant_id_display_name_idx";

-- RenameIndex
ALTER INDEX "contacts_tenant_type_idx" RENAME TO "contacts_tenant_id_type_idx";

-- RenameIndex
ALTER INDEX "inspector_regions_region_idx" RENAME TO "inspector_regions_region_id_idx";

-- RenameIndex
ALTER INDEX "notification_consents_recipient_channel_tenant_id_notification_" RENAME TO "notification_consents_recipient_channel_tenant_id_notificat_key";
