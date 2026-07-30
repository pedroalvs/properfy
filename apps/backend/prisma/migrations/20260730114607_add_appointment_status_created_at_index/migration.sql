-- Backs the daily overdue auto-cancel sweep (`appointment.cancel-overdue`), which is
-- cross-tenant and filters on exactly (status, created_at). Every other index on
-- `appointments` leads with tenant_id, so none of them can serve that query.
--
-- CreateIndex
CREATE INDEX "appointments_status_created_at_idx" ON "appointments"("status", "created_at");
