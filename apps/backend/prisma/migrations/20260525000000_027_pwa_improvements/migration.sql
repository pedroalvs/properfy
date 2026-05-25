-- Migration: 027_pwa_improvements
-- Additive DDL only. No backfill UPDATE (per research.md D3 revised).

-- A1: Inspector weekly availability template (JSONB)
ALTER TABLE "inspectors"
  ADD COLUMN "availability_template_json" JSONB NOT NULL DEFAULT '{}';

-- A2: Operator-override marker on availability slots (BOOLEAN)
-- Default FALSE: pre-existing slots are not retroactively marked as operator overrides.
-- Going forward: slots created via operator-facing endpoints set this to TRUE at insert time.
ALTER TABLE "inspector_availability_slots"
  ADD COLUMN "is_operator_override" BOOLEAN NOT NULL DEFAULT false;
