-- Inspector Property Invoice (spec 032): replace the status-agnostic uniqueness on
-- (inspector_id, period_start, period_end) with a PARTIAL unique index over ACTIVE statuses only.
-- This lets a VOID (rejected) invoice coexist with a fresh PENDING_REVIEW request for the same
-- period, while still preventing two active invoices for one period. The prior status-agnostic
-- unique guaranteed no duplicates exist, so this strictly-weaker index cannot conflict with data.

DROP INDEX "inspector_invoices_inspector_id_period_start_period_end_key";

CREATE UNIQUE INDEX "inspector_invoices_active_period_unique"
  ON "inspector_invoices" ("inspector_id", "period_start", "period_end")
  WHERE "status" IN ('PENDING_REVIEW', 'CLOSED', 'PAID');
