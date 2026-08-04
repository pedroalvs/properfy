-- Retire the four occupant-action SMS templates.
--
-- Each one restated an email the occupant was already receiving, for an action they had
-- just taken themselves: they tap "Yes" in the portal and get both an email and an SMS
-- telling them they tapped "Yes". The email survives; the SMS twin does not. The matching
-- dispatch legs were removed from notify-on-rental-tenant-portal-action,
-- notify-on-admin-reschedule and notify-on-status-transition in the same change.
--
-- Why a migration and not just dropping them from PLATFORM_TEMPLATES: both seeders are
-- upsert-only and never delete, and refresh-demo-seed only clears tenant-scoped rows. Left
-- alone, these rows survive forever — listed in the templates UI with the raw code as their
-- label (getTemplateCodeLabel falls back to the code) and no target chip, editable by
-- nobody, sent by nothing.
--
-- Deliberately NOT scoped by tenant_id: it must take the platform defaults
-- (tenant_id IS NULL) and every agency override alike, since an agency that customised
-- one of these would otherwise keep an orphan row.
--
-- Already-sent `notifications` rows keep their template_code string. There is no foreign
-- key between the two tables, so delivery history and the occurrence dedupe that reads it
-- are unaffected.

DELETE FROM notification_templates
WHERE template_code IN (
  'INSPECTION_CONFIRMED_SMS',
  'INSPECTION_RESCHEDULED_SMS',
  'INSPECTION_CANCELLED_SMS',
  'INSPECTION_UNAVAILABILITY_REPORTED_SMS'
);
