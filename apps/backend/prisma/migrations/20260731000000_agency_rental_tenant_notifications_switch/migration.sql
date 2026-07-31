-- Replace the EMAIL-only agency kill switch with an occupant-scoped one, and
-- guarantee the template that mirrors a suppressed message to the agency exists.
--
-- Background: `settings_json.emailSendingEnabled` was gated on channel = EMAIL, so an
-- agency that had "turned notifications off" still SMSed the rental tenant on every
-- reminder, the T-2 alert and the portal link. It was also agency-wide rather than
-- occupant-scoped, so it additionally suppressed the property-manager escalation,
-- report-ready mail and password resets for that agency's own users.
--
-- `rentalTenantNotificationsEnabled` replaces it: scoped by notification target, so it
-- stops BOTH channels for occupant-directed templates and nothing else.

-- ── 1. Seed TENANT_NOTICE_FORWARDED_AGENCY ─────────────────────────────────────
--
-- Existence must land with `prisma migrate deploy`, not with the manual seeder run.
-- Same reasoning as 20260730120000: CreateNotificationUseCase does not throw on a
-- missing template — the send worker marks the row FAILED/TEMPLATE_NOT_FOUND with no
-- retry, and poll-retryable-notifications only heals PENDING, so those rows never
-- recover. Between deploy and a manual seed, every suppressed occupant message would
-- fail to reach the agency, which is the one guarantee this feature makes.
--
-- Scope is deliberately existence-only: seed-platform-notification-templates owns
-- subject/body/HTML and refreshes them on every run, replacing this placeholder copy.
--
-- ON CONFLICT is not usable: the unique index is (tenant_id, template_code, channel)
-- and platform rows carry tenant_id NULL, which Postgres treats as distinct, so the
-- conflict would never fire. Hence the explicit NOT EXISTS with `tenant_id IS NULL`.
--
-- TRANSACTIONAL, not OPERATIONAL: an OPERATIONAL row is consent-checked per recipient,
-- so a branch contact's opt-out would suppress the mirror — leaving neither the
-- occupant nor the agency informed.

INSERT INTO notification_templates
  (id, tenant_id, template_code, channel, subject, body_text, body_html,
   variables_json, is_active, notification_class, created_at, updated_at)
SELECT
  gen_random_uuid(),
  NULL,
  'TENANT_NOTICE_FORWARDED_AGENCY',
  'EMAIL',
  'Tenant notice not sent - {{propertyAddress}}',
  'Your agency contacts tenants directly, so Properfy did not send "{{suppressedTemplateLabel}}" for inspection {{appointmentCode}} at {{propertyAddress}} on {{scheduledDate}}. Please pass it on to the tenant.',
  '<p>Your agency contacts tenants directly, so Properfy did not send "{{suppressedTemplateLabel}}" for inspection {{appointmentCode}} at {{propertyAddress}} on {{scheduledDate}}. Please pass it on to the tenant.</p>',
  '["suppressedTemplateLabel","suppressedChannel","propertyAddress","appointmentCode","scheduledDate"]'::jsonb,
  true,
  'TRANSACTIONAL',
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE tenant_id IS NULL
    AND template_code = 'TENANT_NOTICE_FORWARDED_AGENCY'
    AND channel = 'EMAIL'
);

-- ── 2. Carry the old flag over ─────────────────────────────────────────────────
--
-- An agency that had emailSendingEnabled = false chose "do not contact my tenants",
-- so it carries over as rentalTenantNotificationsEnabled = false. The key is dropped
-- in the same statement, leaving exactly one switch behind.
--
-- Behaviour change this makes visible on promote, and it is the intended fix: these
-- agencies start receiving their OWN mail again (property-manager escalation,
-- cancellation copy, report-ready, password reset), all of which the old flag
-- suppressed as collateral.

UPDATE tenants
SET settings_json =
  (settings_json - 'emailSendingEnabled')
  || jsonb_build_object('rentalTenantNotificationsEnabled', false)
WHERE settings_json->>'emailSendingEnabled' = 'false';

-- Remaining rows had the flag at its default (true), which is also the new flag's
-- default, so the key is simply removed rather than restated. Run second: the
-- statement above already dropped the key for the agencies it migrated.

UPDATE tenants
SET settings_json = settings_json - 'emailSendingEnabled'
WHERE settings_json ? 'emailSendingEnabled';
