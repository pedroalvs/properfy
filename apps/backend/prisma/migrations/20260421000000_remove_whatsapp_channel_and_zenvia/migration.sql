-- DEC-004: Remove WhatsApp channel, drop Zenvia-related columns and enums

-- Step 1: Migrate any existing WHATSAPP rows to preserve data integrity
UPDATE notification_templates SET channel = 'EMAIL' WHERE channel = 'WHATSAPP';
UPDATE notifications SET channel = 'SMS' WHERE channel = 'WHATSAPP';
UPDATE notification_consents SET channel = 'SMS' WHERE channel = 'WHATSAPP';

-- Step 2: Drop WhatsApp-specific columns from notification_templates
ALTER TABLE notification_templates DROP COLUMN IF EXISTS whatsapp_approval_status;
ALTER TABLE notification_templates DROP COLUMN IF EXISTS whatsapp_approval_reference;

-- Step 3: Recreate NotificationChannel enum without WHATSAPP
-- (PostgreSQL doesn't support removing enum values directly)
ALTER TYPE "NotificationChannel" RENAME TO "NotificationChannel_old";
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS');
ALTER TABLE notifications ALTER COLUMN channel TYPE "NotificationChannel" USING channel::text::"NotificationChannel";
ALTER TABLE notification_templates ALTER COLUMN channel TYPE "NotificationChannel" USING channel::text::"NotificationChannel";
ALTER TABLE notification_consents ALTER COLUMN channel TYPE "NotificationChannel" USING channel::text::"NotificationChannel";
DROP TYPE "NotificationChannel_old";

-- Step 4: Drop WhatsAppApprovalStatus enum
DROP TYPE IF EXISTS "WhatsAppApprovalStatus";
