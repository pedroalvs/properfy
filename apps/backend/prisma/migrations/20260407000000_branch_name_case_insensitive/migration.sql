-- Drop the existing case-sensitive unique index on (tenant_id, name)
DROP INDEX IF EXISTS "branches_tenant_id_name_key";

-- Create case-insensitive unique index using lower(name)
CREATE UNIQUE INDEX "branches_tenant_id_name_key" ON "branches"("tenant_id", lower("name"));
