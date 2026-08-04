-- Backs the Inspector Workload aggregation
-- (PrismaInspectorWorkloadRepository), which groups appointments by
-- (inspector_id, scheduled_date) over a one-week range and by scheduled_date
-- over a three-week range.
--
-- Why a new index rather than reusing an existing one: that screen is AM/OP-only
-- and therefore cross-tenant, so its queries carry no tenant_id predicate. Every
-- scheduled_date index on `appointments` today leads with tenant_id
-- (`appointments_tenant_id_scheduled_date_idx`), which Postgres cannot use for a
-- bare `scheduled_date BETWEEN` — the read would seq-scan the whole table.
--
-- Column order: scheduled_date first because it carries the range predicate;
-- inspector_id second so the per-inspector, per-day group-by can be answered
-- from the index without visiting the heap.
--
-- Expand-only: adds an index, changes no data and no existing column, so it is
-- safe to apply ahead of the code that uses it.

CREATE INDEX IF NOT EXISTS "appointments_scheduled_date_inspector_id_idx"
  ON "appointments" ("scheduled_date", "inspector_id");
