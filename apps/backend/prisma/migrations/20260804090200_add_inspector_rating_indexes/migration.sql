-- Backs the two aggregation queries in `PrismaInspectorRatingReader`, which run on every
-- inspector-list page load and on the inspector detail.
--
-- 1. The completed-services count filters (inspector_id, status) with no tenant scope — the
--    figure is platform-wide. Every other index on `appointments` leads with tenant_id, so
--    none of them can serve it and the groupBy would degrade to a sequential scan as the
--    table grows. Same class of gap as `appointments_status_created_at_idx`
--    (20260730114607), which exists for the cross-tenant overdue sweep.
--
-- 2. The individual-response read filters inspector_id (+ tenant_id for an agency caller)
--    and sorts submitted_at DESC. A single composite serves the aggregate groupBy too,
--    because inspector_id leads it — so it replaces the bare inspector_id index rather
--    than adding to it.
--
-- Note: CREATE INDEX CONCURRENTLY is NOT possible here — Prisma Migrate wraps each migration
-- in a transaction (E25001 on prisma 5.22) and Postgres rejects CONCURRENTLY inside one. The
-- plain CREATE INDEX briefly blocks writes, which is acceptable: it runs in the Fly
-- release_command phase, before the new version takes traffic, and `satisfaction_surveys` is
-- empty at this point. Same reasoning as 20260730114607. If `appointments` ever grows to
-- millions of rows, create future indexes manually with CONCURRENTLY and mark the migration
-- applied via `prisma migrate resolve`.

-- CreateIndex
CREATE INDEX "appointments_inspector_id_status_idx" ON "appointments"("inspector_id", "status");

-- CreateIndex
DROP INDEX "satisfaction_surveys_inspector_id_idx";
CREATE INDEX "satisfaction_surveys_inspector_id_tenant_id_submitted_at_idx"
    ON "satisfaction_surveys"("inspector_id", "tenant_id", "submitted_at" DESC);
