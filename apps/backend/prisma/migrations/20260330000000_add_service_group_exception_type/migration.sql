-- CreateEnum
CREATE TYPE "ServiceGroupExceptionType" AS ENUM ('LOW_DENSITY_REGION', 'ISOLATED_SERVICE', 'PRIORITY_CLIENT');

-- AlterTable
ALTER TABLE "service_groups"
  ADD COLUMN "exception_type" "ServiceGroupExceptionType",
  ADD COLUMN "exception_reason" TEXT;

-- Constraint: reason is required when exception_type is set, and vice versa
ALTER TABLE "service_groups"
  ADD CONSTRAINT "chk_service_groups_exception_pair"
  CHECK (
    ("exception_type" IS NULL AND "exception_reason" IS NULL)
    OR
    ("exception_type" IS NOT NULL AND "exception_reason" IS NOT NULL AND length(trim("exception_reason")) > 0)
  );
