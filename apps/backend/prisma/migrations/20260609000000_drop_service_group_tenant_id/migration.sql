-- Service groups are now tenant-agnostic: a group may span appointments from
-- multiple tenants (agencies). The authoritative tenant lives on each linked
-- appointment (appointments.tenant_id). Drop the single-tenant anchor.

-- Drop FK + tenant-scoped indexes, then the column.
ALTER TABLE "service_groups" DROP CONSTRAINT IF EXISTS "service_groups_tenant_id_fkey";
DROP INDEX IF EXISTS "service_groups_tenant_id_idx";
DROP INDEX IF EXISTS "service_groups_tenant_id_status_idx";
ALTER TABLE "service_groups" DROP COLUMN "tenant_id";
