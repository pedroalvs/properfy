-- Migration: require service_region_id on service_groups (NOT NULL)
--
-- BEFORE APPLYING: audit for orphan rows and backfill or clean them up:
--   SELECT id, tenant_id, name, status FROM service_groups WHERE service_region_id IS NULL;
--
-- If orphan rows exist, resolve them before running this migration.
-- Option A: backfill region from linked appointments (manual per tenant).
-- Option B: cancel/reject orphan DRAFT groups via the application (preferred).
--
-- This migration will fail at the ALTER COLUMN step if any NULL rows remain.

-- Enforce NOT NULL constraint
ALTER TABLE "service_groups" ALTER COLUMN "service_region_id" SET NOT NULL;
