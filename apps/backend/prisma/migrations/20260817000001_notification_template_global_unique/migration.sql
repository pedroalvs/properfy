-- The composite unique (tenant_id, template_code, channel) does not deduplicate
-- rows where tenant_id IS NULL (Postgres treats NULLs as distinct), so global
-- template rows could be duplicated — e.g. by two app instances running the
-- startup sync concurrently. Resolve any existing duplicates (keep the most
-- recently updated row) and enforce uniqueness with a partial unique index.
DELETE FROM "notification_templates" a
  USING "notification_templates" b
 WHERE a.tenant_id IS NULL
   AND b.tenant_id IS NULL
   AND a.template_code = b.template_code
   AND a.channel = b.channel
   AND (a.updated_at < b.updated_at OR (a.updated_at = b.updated_at AND a.id > b.id));

CREATE UNIQUE INDEX "notification_templates_global_code_channel_key"
  ON "notification_templates" (template_code, channel)
  WHERE tenant_id IS NULL;
