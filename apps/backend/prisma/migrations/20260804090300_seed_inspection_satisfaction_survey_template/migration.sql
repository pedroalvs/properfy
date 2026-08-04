-- Guarantee the INSPECTION_SATISFACTION_SURVEY platform template row EXISTS before
-- the application serves traffic.
--
-- Why a migration and not just the seeder: CreateNotificationUseCase does not throw
-- on a missing template — it defers resolution to the send worker, which marks the
-- row FAILED/TEMPLATE_NOT_FOUND with no retry. poll-retryable-notifications only
-- heals PENDING, so those rows never recover.
--
-- The second-order effect is what makes this a release blocker rather than a
-- cosmetic gap: the survey invite dedupes on `existsByAppointmentAndTemplate`,
-- which counts every row except SKIPPED_OPT_OUT. A FAILED row therefore
-- permanently locks that appointment out of the invite — re-running the seeder
-- later does NOT resurrect it. Between deploy and a manual seed run, every
-- appointment marked DONE would be silently and irreversibly excluded.
--
-- Scope is deliberately narrow: existence only. seed-platform-notification-templates
-- remains the owner of subject/body/HTML and refreshes them on every run, so this
-- placeholder copy is replaced the first time the seeder executes.
--
-- ON CONFLICT is not usable here: the unique index is
-- (tenant_id, template_code, channel) and platform rows carry tenant_id NULL,
-- which Postgres treats as distinct — the conflict would never fire. Hence the
-- explicit NOT EXISTS with `tenant_id IS NULL`. Same shape as
-- 20260730120000_seed_inspection_cancelled_agency_template.

INSERT INTO notification_templates
  (id, tenant_id, template_code, channel, subject, body_text, body_html,
   variables_json, is_active, notification_class, created_at, updated_at)
SELECT
  gen_random_uuid(),
  NULL,
  'INSPECTION_SATISFACTION_SURVEY',
  'EMAIL',
  'How did your inspection go?',
  'Your inspection has been completed. Tell us how it went: {{surveyLink}}',
  '<p>Your inspection has been completed. Tell us how it went: <a href="{{surveyLink}}">Rate your inspection</a></p>',
  '["surveyLink"]'::jsonb,
  true,
  'OPERATIONAL',
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE tenant_id IS NULL
    AND template_code = 'INSPECTION_SATISFACTION_SURVEY'
    AND channel = 'EMAIL'
);
