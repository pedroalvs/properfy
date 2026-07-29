-- Discriminates an agency-run report (CL_ADMIN / CL_USER, always scoped to its own
-- tenant) from an operator run that merely targets one agency. Every pre-existing
-- row is an operator run, so the `false` default is the correct backfill and no
-- UPDATE is required before/after this statement.

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "agency_scoped" BOOLEAN NOT NULL DEFAULT false;
