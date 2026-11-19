-- Reliability index (F07-1): the facts reader's current-DONE execution query (Q1a)
-- filters inspection_executions on finished_at, which has no index today.
-- Expand-only; no audit_logs index is added (existing (action) + (entity_type, entity_id) suffice).
CREATE INDEX "inspection_executions_finished_at_idx" ON "inspection_executions" ("finished_at");
