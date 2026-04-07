-- CreateIndex
-- Partial unique index to prevent duplicate tenant-level pricing rules (where branch_id IS NULL).
-- PostgreSQL unique constraints allow multiple NULLs by default, so the standard
-- @@unique([tenant_id, service_type_id, branch_id]) does not enforce uniqueness
-- when branch_id is NULL. This partial index closes that gap.
CREATE UNIQUE INDEX "service_price_rules_tenant_service_type_no_branch_key"
ON "service_price_rules"("tenant_id", "service_type_id")
WHERE "branch_id" IS NULL;
