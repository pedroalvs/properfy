-- Strip the operational-email unsubscribe footer from existing template bodies so
-- emails don't render a dangling "unsubscribe here:" after the feature removal.
-- Best-effort: matches the exact seeded OP_EMAIL_FOOTER literal. Agency-customized
-- bodies that altered the footer are not matched — detect leftovers afterwards with:
--   SELECT id, template_code, channel FROM notification_templates
--   WHERE body_html ILIKE '%unsubscribeUrl%' OR body_text ILIKE '%unsubscribeUrl%';

UPDATE "notification_templates"
SET
  "body_html" = REPLACE("body_html", ' If you no longer wish to receive operational notifications, you can unsubscribe here: {{unsubscribeUrl}}', ''),
  "body_text" = REPLACE("body_text", ' If you no longer wish to receive operational notifications, you can unsubscribe here: {{unsubscribeUrl}}', '')
WHERE "body_html" LIKE '%unsubscribeUrl%' OR "body_text" LIKE '%unsubscribeUrl%';
