-- F05 per-inspector Live Day alert overrides (expand-only). Nullable, no backfill,
-- no tenant_id (D14 — inspector is cross-tenant). null = platform defaults.
ALTER TABLE "inspectors" ADD COLUMN "alert_overrides_json" JSONB;
