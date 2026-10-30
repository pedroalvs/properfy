-- F01-1: inspector base-address coordinates + app-state heartbeat columns.
-- Expand-only: all columns nullable, no default, no SQL backfill, no index.
ALTER TABLE "inspectors"
  ADD COLUMN "base_lat" DECIMAL(10,7),
  ADD COLUMN "base_lng" DECIMAL(10,7),
  ADD COLUMN "base_geocoded_at" TIMESTAMP(3),
  ADD COLUMN "app_installed_at" TIMESTAMP(3),
  ADD COLUMN "app_last_seen_at" TIMESTAMP(3),
  ADD COLUMN "push_enabled" BOOLEAN,
  ADD COLUMN "app_version" VARCHAR(40);
