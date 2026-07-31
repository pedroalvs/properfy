-- Guarantee the INSPECTION_CANCELLED_AGENCY platform template row EXISTS before
-- the application serves traffic.
--
-- Why a migration and not just the seeder: CreateNotificationUseCase does not
-- throw on a missing template — it leaves notification_class null and defers
-- resolution to the send worker, which marks the row FAILED/TEMPLATE_NOT_FOUND
-- with no retry. poll-retryable-notifications only heals PENDING, so those rows
-- never recover and re-seeding later does not resurrect them. Between deploy and
-- a manual seed run, every cancellation — including the daily overdue sweep —
-- would produce a permanently failed agency notice. This migration runs inside
-- `prisma migrate deploy` in the release command, closing that window.
--
-- Scope is deliberately narrow: existence only. seed-platform-notification-templates
-- remains the owner of subject/body/HTML and refreshes them on every run, so this
-- placeholder copy is replaced the first time the seeder executes.
--
-- ON CONFLICT is not usable here: the unique index is
-- (tenant_id, template_code, channel) and platform rows carry tenant_id NULL,
-- which Postgres treats as distinct — the conflict would never fire. Hence the
-- explicit NOT EXISTS with `tenant_id IS NULL`.

INSERT INTO notification_templates
  (id, tenant_id, template_code, channel, subject, body_text, body_html,
   variables_json, is_active, notification_class, created_at, updated_at)
SELECT
  gen_random_uuid(),
  NULL,
  'INSPECTION_CANCELLED_AGENCY',
  'EMAIL',
  'Inspection Cancelled - {{propertyAddress}}',
  'The inspection {{appointmentCode}} at {{propertyAddress}} scheduled for {{scheduledDate}} has been cancelled.',
  '<p>The inspection {{appointmentCode}} at {{propertyAddress}} scheduled for {{scheduledDate}} has been cancelled.</p>',
  '["propertyAddress","appointmentCode","scheduledDate"]'::jsonb,
  true,
  'TRANSACTIONAL',
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE tenant_id IS NULL
    AND template_code = 'INSPECTION_CANCELLED_AGENCY'
    AND channel = 'EMAIL'
);

-- Backfill: bring every protected template code onto TRANSACTIONAL.
--
-- Guaranteeing the row exists is not enough — the class matters too. The seeders
-- used to write notification_class only when a PLATFORM_TEMPLATES entry declared
-- it, so seeded-only rows kept the schema default OPERATIONAL even for codes the
-- shared catalogue marks protected. That is how the four appointment-action _SMS
-- legs became consent-suppressible while their email twins were not: migration
-- 20260411 (step 9) backfilled the email codes directly, and nothing ever did the
-- same for the SMS ones.
--
-- Doing it here rather than leaving it to the manual seeder run means the fix
-- lands with `prisma migrate deploy`, instead of depending on someone SSHing in.
-- Until that run, an opted-out tenant would still get SKIPPED_OPT_OUT on a
-- cancellation notice.
--
-- Deliberately unscoped by tenant, mirroring 20260411: these classes are immutable
-- by design (upsert-notification-template forces getProtectedClass on save), so a
-- tenant-level row for a protected code can only already be TRANSACTIONAL. The
-- statement therefore reverts no legitimate choice.
--
-- The `<>` guard makes re-running a true no-op and keeps updated_at honest.

UPDATE notification_templates
  SET notification_class = 'TRANSACTIONAL', updated_at = now()
  WHERE template_code IN (
    'INSPECTION_CONFIRMED',
    'INSPECTION_CONFIRMED_SMS',
    'INSPECTION_RESCHEDULED',
    'INSPECTION_RESCHEDULED_SMS',
    'INSPECTION_CANCELLED',
    'INSPECTION_CANCELLED_SMS',
    'INSPECTION_CANCELLED_AGENCY',
    'INSPECTION_UNAVAILABILITY_REPORTED',
    'INSPECTION_UNAVAILABILITY_REPORTED_SMS'
  )
  AND notification_class <> 'TRANSACTIONAL';
