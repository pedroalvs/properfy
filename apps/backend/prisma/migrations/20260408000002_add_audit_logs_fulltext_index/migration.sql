-- Add GIN index for full-text search on audit_logs
CREATE INDEX "AuditLog_fulltext_idx" ON "AuditLog" USING GIN (
  to_tsvector('english', coalesce(reason, '') || ' ' || coalesce(metadata_json::text, ''))
);
