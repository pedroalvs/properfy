-- Remove the email image library feature (spec 030).
-- 1. Scrub orphaned {{image:key}} placeholders from stored template bodies so
--    rendered emails never leak the raw tokens.
UPDATE notification_templates
SET body_html = regexp_replace(body_html, '\{\{image:[a-zA-Z0-9_-]+\}\}', '', 'g'),
    body_text = regexp_replace(body_text, '\{\{image:[a-zA-Z0-9_-]+\}\}', '', 'g')
WHERE body_html ~ '\{\{image:[a-zA-Z0-9_-]+\}\}'
   OR body_text ~ '\{\{image:[a-zA-Z0-9_-]+\}\}';

-- 2. Drop the feature tables (bindings first: FK to email_assets).
DROP TABLE "template_image_bindings";

DROP TABLE "email_assets";

-- 3. Drop the asset status enum.
DROP TYPE "EmailAssetStatus";
