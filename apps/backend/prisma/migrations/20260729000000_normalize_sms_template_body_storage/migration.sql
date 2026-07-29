-- Normalize where an SMS template body is stored.
--
-- SMS bodies are plain text and belong in body_text with body_html NULL -- the
-- shape the platform seeder has always written (seed-platform-notification-templates.ts).
-- The template upsert use case did not follow it: for SMS it wrote the operator's
-- text into body_html AND body_text.
--
-- That mattered because the send pipeline picked its source from body_html: a
-- non-empty body_html meant the message was derived via sanitize -> html-to-text,
-- which word-wraps at 120 characters and expands hrefs into "text [url]". The
-- test-send path meanwhile rendered body_text raw. So one saved template produced
-- two different messages -- the operator previewed one and the tenant received
-- the other.
--
-- Both halves are fixed in code (upsert stores body_html NULL for SMS;
-- renderEmailBody refuses the HTML branch unless the channel is EMAIL). This
-- migration brings already-stored rows onto the same shape so that agency SMS
-- overrides saved before the fix stop being derived from HTML.
--
-- Scope: agency overrides (tenant_id IS NOT NULL) are the only rows that can
-- carry a non-NULL body_html on an SMS template, since the seeder never wrote
-- one. Platform defaults are already NULL and the second statement is a no-op
-- for them.

-- 1. Defensive backfill. The upsert wrote body_text = body_html for SMS, so the
--    text should already be present; this only rescues a row whose body_text is
--    somehow blank while body_html holds the content. Without it, step 2 would
--    destroy the only copy of the body.
UPDATE notification_templates
SET body_text = body_html
WHERE channel = 'SMS'
  AND btrim(body_text) = ''
  AND body_html IS NOT NULL
  AND btrim(body_html) <> '';

-- 2. Drop the duplicated HTML copy. body_text is now authoritative for SMS.
UPDATE notification_templates
SET body_html = NULL
WHERE channel = 'SMS'
  AND body_html IS NOT NULL;
