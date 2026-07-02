-- Inspector Property Invoice (spec 032): GIN index on the frozen snapshot so the web backoffice
-- agency/branch CONTENT filters (line_items_snapshot @> '[{"agencyId": ...}]') stay fast.
CREATE INDEX "inspector_invoices_line_items_snapshot_gin"
  ON "inspector_invoices" USING GIN ("line_items_snapshot" jsonb_path_ops);
