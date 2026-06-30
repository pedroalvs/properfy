-- Rename the property occupant ("tenant" in the real-estate sense) to RentalTenant
-- across enum values, enum types, columns, and tables.
-- The SaaS tenant (the agency: `tenant_id` / `tenants`) is intentionally UNTOUCHED.
-- Hand-edited RENAME migration (Prisma would otherwise drop+recreate and lose data).

-- 1) Enum VALUE renames (occupant). Columns whose @default references these update automatically.
ALTER TYPE "ContactType" RENAME VALUE 'TENANT' TO 'RENTAL_TENANT';
ALTER TYPE "AppointmentContactRole" RENAME VALUE 'TENANT' TO 'RENTAL_TENANT';
ALTER TYPE "AppointmentContactRole" RENAME VALUE 'TENANT_REPRESENTATIVE' TO 'RENTAL_TENANT_REPRESENTATIVE';
ALTER TYPE "CycleConfirmationSource" RENAME VALUE 'TENANT_PORTAL' TO 'RENTAL_TENANT_PORTAL';
ALTER TYPE "CycleConfirmationSource" RENAME VALUE 'TENANT_RESCHEDULE' TO 'RENTAL_TENANT_RESCHEDULE';
ALTER TYPE "CycleInvalidatedReason" RENAME VALUE 'TENANT_RESCHEDULE' TO 'RENTAL_TENANT_RESCHEDULE';
ALTER TYPE "RestrictionSource" RENAME VALUE 'TENANT_PORTAL' TO 'RENTAL_TENANT_PORTAL';

-- 2) Enum TYPE (name) renames (occupant).
ALTER TYPE "TenantConfirmationStatus" RENAME TO "RentalTenantConfirmationStatus";
ALTER TYPE "TenantPortalTokenStatus" RENAME TO "RentalTenantPortalTokenStatus";
ALTER TYPE "TenantPortalAction" RENAME TO "RentalTenantPortalAction";

-- 3) Column renames (occupant).
ALTER TABLE "appointments" RENAME COLUMN "tenant_confirmation_status" TO "rental_tenant_confirmation_status";
ALTER TABLE "appointments" RENAME COLUMN "tenant_note" TO "rental_tenant_note";
ALTER TABLE "appointment_contacts" RENAME COLUMN "tenant_name" TO "rental_tenant_name";
ALTER TABLE "service_types" RENAME COLUMN "requires_tenant_confirmation" TO "requires_rental_tenant_confirmation";

-- 4) Table renames (occupant portal).
ALTER TABLE "tenant_portal_tokens" RENAME TO "rental_tenant_portal_tokens";
ALTER TABLE "tenant_portal_activities" RENAME TO "rental_tenant_portal_activities";
ALTER TABLE "tenant_portal_activities_archive" RENAME TO "rental_tenant_portal_activities_archive";
