-- AlterTable: add available_slots_json column (additive, nullable)
ALTER TABLE "appointment_restrictions" ADD COLUMN "available_slots_json" JSONB;

-- AlterEnum: add GROUP_JOIN value to TenantPortalAction
ALTER TYPE "TenantPortalAction" ADD VALUE IF NOT EXISTS 'GROUP_JOIN';
