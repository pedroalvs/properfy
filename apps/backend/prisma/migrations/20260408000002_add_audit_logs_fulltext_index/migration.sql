-- Add GIN index for full-text search on audit_logs.
--
-- CORRECTION-007 fix (2026-04-13):
--   The original SQL referenced `"AuditLog"` (Prisma model name) instead
--   of `"audit_logs"` (actual table name). Prisma's `@@map("audit_logs")`
--   only affects the client; the underlying table is `audit_logs`. The
--   original index name `AuditLog_fulltext_idx` is preserved so any
--   production environment that already has the index (via a manual
--   patch) does not need it renamed.
CREATE INDEX IF NOT EXISTS "AuditLog_fulltext_idx" ON "audit_logs" USING GIN (
  to_tsvector('english', coalesce(reason, '') || ' ' || coalesce(metadata_json::text, ''))
);
