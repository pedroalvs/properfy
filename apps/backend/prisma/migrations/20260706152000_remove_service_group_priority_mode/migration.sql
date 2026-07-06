ALTER TABLE "service_groups"
  DROP COLUMN "priority_expires_at",
  DROP COLUMN "priority_mode";

DROP TYPE "PriorityMode";
