-- Add unique constraint on service_type name (case-sensitive at DB level;
-- application layer enforces case-insensitive via findByName).
CREATE UNIQUE INDEX "service_types_name_key" ON "service_types"("name");
