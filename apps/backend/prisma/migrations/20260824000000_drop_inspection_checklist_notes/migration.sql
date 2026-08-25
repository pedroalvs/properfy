-- Remove the half-wired inspection checklist/notes capture. The checklist feature
-- was never configurable (no question templates) and out of the client scope, which
-- defines inspector finish as geolocation + timestamp only. Both columns held only
-- seed/demo data — no successful PWA finish ever wrote real checklist content.

-- AlterTable
ALTER TABLE "inspection_executions" DROP COLUMN "checklist_json",
DROP COLUMN "notes";
