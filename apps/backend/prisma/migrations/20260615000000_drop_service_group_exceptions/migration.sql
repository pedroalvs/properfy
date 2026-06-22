-- Drop the exception-pair CHECK constraint (Prisma does not model arbitrary
-- CHECKs, so it must be dropped explicitly before the columns it references).
ALTER TABLE "service_groups"
  DROP CONSTRAINT IF EXISTS "chk_service_groups_exception_pair";

-- DropColumn
ALTER TABLE "service_groups"
  DROP COLUMN IF EXISTS "exception_type",
  DROP COLUMN IF EXISTS "exception_reason";

-- DropEnum
DROP TYPE IF EXISTS "ServiceGroupExceptionType";
