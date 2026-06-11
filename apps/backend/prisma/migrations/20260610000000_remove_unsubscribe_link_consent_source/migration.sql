-- Remove 'unsubscribe_link' from ConsentChangeSource (unsubscribe feature removed).
-- Postgres cannot drop an enum value in place, so: remap existing rows, then recreate the type.

UPDATE "notification_consents"
SET "change_source" = 'operator_override'
WHERE "change_source" = 'unsubscribe_link';

ALTER TYPE "ConsentChangeSource" RENAME TO "ConsentChangeSource_old";
CREATE TYPE "ConsentChangeSource" AS ENUM ('operator_override', 're_opt_in');
ALTER TABLE "notification_consents"
  ALTER COLUMN "change_source" TYPE "ConsentChangeSource"
  USING "change_source"::text::"ConsentChangeSource";
DROP TYPE "ConsentChangeSource_old";
