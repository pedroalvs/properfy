-- Feature 018: Consent & Notification Preferences
-- Additive migration: extends notification_templates, notifications, and notification_consents
-- with classification, audit trail, and per-class opt-out scoping.
-- No existing rows are lost. Enum additions are pure expand.

-- 1. CreateEnum: NotificationClass
CREATE TYPE "NotificationClass" AS ENUM ('TRANSACTIONAL', 'OPERATIONAL', 'MARKETING');

-- 2. CreateEnum: ConsentChangeSource
CREATE TYPE "ConsentChangeSource" AS ENUM ('unsubscribe_link', 'operator_override', 're_opt_in');

-- 3. AlterEnum: add SKIPPED_OPT_OUT to NotificationStatus
ALTER TYPE "NotificationStatus" ADD VALUE 'SKIPPED_OPT_OUT';

-- 4. Extend notification_templates with mandatory classification
ALTER TABLE "notification_templates"
  ADD COLUMN "notification_class" "NotificationClass" NOT NULL DEFAULT 'OPERATIONAL';

-- 5. Extend notifications with optional classification (stamped at create time)
ALTER TABLE "notifications"
  ADD COLUMN "notification_class" "NotificationClass";

-- 6. Extend notification_consents with classification and audit fields
ALTER TABLE "notification_consents"
  ADD COLUMN "notification_class" "NotificationClass" NOT NULL DEFAULT 'OPERATIONAL',
  ADD COLUMN "change_source"      "ConsentChangeSource",
  ADD COLUMN "changed_at"          TIMESTAMP(3),
  ADD COLUMN "changed_by_user_id"  TEXT,
  ADD COLUMN "reason"              TEXT;

-- 7. Replace the old unique constraint with the per-class one
ALTER TABLE "notification_consents"
  DROP CONSTRAINT IF EXISTS "notification_consents_recipient_channel_tenant_id_key";

ALTER TABLE "notification_consents"
  ADD CONSTRAINT "notification_consents_recipient_channel_tenant_id_notification_class_key"
  UNIQUE ("recipient", "channel", "tenant_id", "notification_class");

-- 8. FK: changed_by_user_id references the operator who performed an override
ALTER TABLE "notification_consents"
  ADD CONSTRAINT "notification_consents_changed_by_user_id_fkey"
  FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- 9. Data migration: seed TRANSACTIONAL classification on protected template codes
UPDATE "notification_templates"
  SET "notification_class" = 'TRANSACTIONAL'
  WHERE "template_code" IN (
    'INSPECTION_CONFIRMED',
    'INSPECTION_RESCHEDULED',
    'INSPECTION_CANCELLED',
    'INSPECTION_UNAVAILABILITY_REPORTED'
  );
