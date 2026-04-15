-- Feature 020: Audit Retention and PII Redaction
-- Additive migration: new enums, 4 new columns on audit_logs, 3 new columns on
-- tenant_portal_activities, 5 new models, 2 archive tables, seeds for
-- AuditRetentionCategoryConfig and PiiFieldMapping.

-- ─── Step 1: new enums ───────────────────────────────────────────────────────

CREATE TYPE "AuditRetentionCategory" AS ENUM ('FINANCIAL', 'OPERATIONAL_CRITICAL', 'OPERATIONAL_GENERAL');

CREATE TYPE "AuditRedactionStatus" AS ENUM ('NONE', 'PARTIAL', 'FULL', 'IN_PROGRESS');

CREATE TYPE "PreservationRuleType" AS ENUM ('CROSS_CHECK', 'ACTIVE_DISPUTE', 'LEGAL_HOLD');

CREATE TYPE "ErasureRequestStatus" AS ENUM (
  'PENDING',
  'SCANNING',
  'PREVIEW',
  'CONFIRMED',
  'EXECUTING',
  'COMPLETED',
  'FAILED'
);

-- ─── Step 2: extend audit_logs ───────────────────────────────────────────────

ALTER TABLE "audit_logs"
  ADD COLUMN "retention_category"   "AuditRetentionCategory",
  ADD COLUMN "redaction_status"     "AuditRedactionStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "cold_storage"         BOOLEAN                NOT NULL DEFAULT false,
  ADD COLUMN "preservation_rule_id" TEXT;

CREATE INDEX "audit_logs_retention_category_created_at_idx"
  ON "audit_logs"("retention_category", "created_at");

CREATE INDEX "audit_logs_redaction_status_idx"
  ON "audit_logs"("redaction_status");

-- ─── Step 3: extend tenant_portal_activities ────────────────────────────────

ALTER TABLE "tenant_portal_activities"
  ADD COLUMN "retention_category" "AuditRetentionCategory",
  ADD COLUMN "redaction_status"   "AuditRedactionStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "cold_storage"       BOOLEAN                NOT NULL DEFAULT false;

CREATE INDEX "tenant_portal_activities_redaction_status_idx"
  ON "tenant_portal_activities"("redaction_status");

-- ─── Step 4: new audit_retention_category_configs table ─────────────────────

CREATE TABLE "audit_retention_category_configs" (
  "id"                   TEXT                     NOT NULL,
  "name"                 "AuditRetentionCategory" NOT NULL,
  "retention_years"      INTEGER                  NOT NULL,
  "hard_delete_enabled"  BOOLEAN                  NOT NULL DEFAULT false,
  "description"          TEXT,
  "action_patterns_json" JSONB                    NOT NULL DEFAULT '[]'::jsonb,
  "created_at"           TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3)             NOT NULL,
  CONSTRAINT "audit_retention_category_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "audit_retention_category_configs_name_key"
  ON "audit_retention_category_configs"("name");

-- ─── Step 5: new audit_preservation_rules table ─────────────────────────────

CREATE TABLE "audit_preservation_rules" (
  "id"                 TEXT                   NOT NULL,
  "name"               VARCHAR(200)           NOT NULL,
  "rule_type"          "PreservationRuleType" NOT NULL,
  "entity_type"        VARCHAR(100),
  "entity_id"          TEXT,
  "tenant_id"          TEXT,
  "is_active"          BOOLEAN                NOT NULL DEFAULT true,
  "created_by_user_id" TEXT                   NOT NULL,
  "created_at"         TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3)           NOT NULL,
  CONSTRAINT "audit_preservation_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_preservation_rules_rule_type_is_active_idx"
  ON "audit_preservation_rules"("rule_type", "is_active");

CREATE INDEX "audit_preservation_rules_entity_type_entity_id_idx"
  ON "audit_preservation_rules"("entity_type", "entity_id");

-- FK back to audit_logs.preservation_rule_id
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_preservation_rule_id_fkey"
  FOREIGN KEY ("preservation_rule_id") REFERENCES "audit_preservation_rules"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Step 6: new audit_legal_holds table ────────────────────────────────────

CREATE TABLE "audit_legal_holds" (
  "id"                  TEXT         NOT NULL,
  "entity_type"         VARCHAR(100) NOT NULL,
  "entity_id"           TEXT         NOT NULL,
  "tenant_id"           TEXT,
  "reason"              TEXT         NOT NULL,
  "placed_by_user_id"   TEXT         NOT NULL,
  "placed_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "released_by_user_id" TEXT,
  "released_at"         TIMESTAMP(3),
  "is_active"           BOOLEAN      NOT NULL DEFAULT true,
  CONSTRAINT "audit_legal_holds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_legal_holds_entity_type_entity_id_is_active_idx"
  ON "audit_legal_holds"("entity_type", "entity_id", "is_active");

CREATE INDEX "audit_legal_holds_tenant_id_idx"
  ON "audit_legal_holds"("tenant_id");

-- ─── Step 7: new pii_field_mappings table ───────────────────────────────────

CREATE TABLE "pii_field_mappings" (
  "id"                     TEXT         NOT NULL,
  "action_pattern"         VARCHAR(200) NOT NULL,
  "json_field_path"        VARCHAR(500) NOT NULL,
  "classification"         VARCHAR(50)  NOT NULL,
  "requires_manual_review" BOOLEAN      NOT NULL DEFAULT false,
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pii_field_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pii_field_mappings_action_pattern_json_field_path_key"
  ON "pii_field_mappings"("action_pattern", "json_field_path");

CREATE INDEX "pii_field_mappings_classification_idx"
  ON "pii_field_mappings"("classification");

-- ─── Step 8: new data_subject_erasure_requests table ────────────────────────

CREATE TABLE "data_subject_erasure_requests" (
  "id"                               TEXT                   NOT NULL,
  "subject_identifier_type"          VARCHAR(20)            NOT NULL,
  "subject_identifier_value"         VARCHAR(500)           NOT NULL,
  "resolved_pii_values_json"         JSONB,
  "status"                           "ErasureRequestStatus" NOT NULL DEFAULT 'PENDING',
  "entries_found_count"              INTEGER,
  "entries_redacted_count"           INTEGER,
  "entries_flagged_for_review_count" INTEGER,
  "completion_report_json"           JSONB,
  "initiated_by_user_id"             TEXT                   NOT NULL,
  "initiated_at"                     TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at"                     TIMESTAMP(3),
  CONSTRAINT "data_subject_erasure_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "data_subject_erasure_requests_status_idx"
  ON "data_subject_erasure_requests"("status");

CREATE INDEX "data_subject_erasure_requests_initiated_by_user_id_idx"
  ON "data_subject_erasure_requests"("initiated_by_user_id");

-- ─── Step 9: new audit_logs_archive table (cold tier) ───────────────────────

CREATE TABLE "audit_logs_archive" (
  "id"                   TEXT                    NOT NULL,
  "tenant_id"            TEXT,
  "actor_type"           "AuditActorType"        NOT NULL,
  "actor_id"             TEXT,
  "entity_type"          VARCHAR(100)            NOT NULL,
  "entity_id"            TEXT,
  "action"               VARCHAR(200)            NOT NULL,
  "reason"               TEXT,
  "before_json"          JSONB,
  "after_json"           JSONB,
  "request_id"           VARCHAR(100),
  "ip_address"           VARCHAR(45),
  "metadata_json"        JSONB,
  "created_at"           TIMESTAMP(3)            NOT NULL,
  "retention_category"   "AuditRetentionCategory",
  "redaction_status"     "AuditRedactionStatus"  NOT NULL DEFAULT 'NONE',
  "cold_storage"         BOOLEAN                 NOT NULL DEFAULT true,
  "preservation_rule_id" TEXT,
  "archived_at"          TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_archive_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_archive_entity_type_entity_id_idx"
  ON "audit_logs_archive"("entity_type", "entity_id");

CREATE INDEX "audit_logs_archive_actor_id_idx"
  ON "audit_logs_archive"("actor_id");

CREATE INDEX "audit_logs_archive_action_idx"
  ON "audit_logs_archive"("action");

CREATE INDEX "audit_logs_archive_tenant_id_idx"
  ON "audit_logs_archive"("tenant_id");

CREATE INDEX "audit_logs_archive_created_at_idx"
  ON "audit_logs_archive"("created_at");

CREATE INDEX "audit_logs_archive_archived_at_idx"
  ON "audit_logs_archive"("archived_at");

-- ─── Step 10: new tenant_portal_activities_archive table (cold tier) ─────────

CREATE TABLE "tenant_portal_activities_archive" (
  "id"                     TEXT                    NOT NULL,
  "appointment_id"         TEXT                    NOT NULL,
  "tenant_portal_token_id" TEXT                    NOT NULL,
  "action"                 "TenantPortalAction"    NOT NULL,
  "previous_values_json"   JSONB,
  "new_values_json"        JSONB,
  "ip_address"             TEXT,
  "user_agent"             TEXT,
  "created_at"             TIMESTAMP(3)            NOT NULL,
  "retention_category"     "AuditRetentionCategory",
  "redaction_status"       "AuditRedactionStatus"  NOT NULL DEFAULT 'NONE',
  "cold_storage"           BOOLEAN                 NOT NULL DEFAULT true,
  "archived_at"            TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_portal_activities_archive_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tenant_portal_activities_archive_appointment_id_idx"
  ON "tenant_portal_activities_archive"("appointment_id");

CREATE INDEX "tenant_portal_activities_archive_tenant_portal_token_id_idx"
  ON "tenant_portal_activities_archive"("tenant_portal_token_id");

CREATE INDEX "tenant_portal_activities_archive_action_idx"
  ON "tenant_portal_activities_archive"("action");

CREATE INDEX "tenant_portal_activities_archive_created_at_idx"
  ON "tenant_portal_activities_archive"("created_at");

CREATE INDEX "tenant_portal_activities_archive_archived_at_idx"
  ON "tenant_portal_activities_archive"("archived_at");

-- ─── Step 11: seed AuditRetentionCategoryConfig ─────────────────────────────
-- Three canonical tiers matching the current hardcoded constants in
-- apps/backend/src/modules/audit/domain/audit-retention.ts. hard_delete_enabled
-- is false by default on every category per FR-034.

INSERT INTO "audit_retention_category_configs"
  ("id", "name", "retention_years", "hard_delete_enabled", "description", "action_patterns_json", "created_at", "updated_at")
VALUES
  (
    gen_random_uuid(),
    'FINANCIAL',
    7,
    false,
    'Financial / fiscal audit entries (billing, refund, invoice, manual adjustment). 7-year retention per Brazilian fiscal legislation.',
    '["financial.","billing.","invoice.","refund.","manualAdjustment."]'::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'OPERATIONAL_CRITICAL',
    5,
    false,
    'Appointment status transitions, cross-check actions, user/inspector lifecycle, permission changes. 5-year retention per Brazilian Civil Code general prescription period.',
    '[]'::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'OPERATIONAL_GENERAL',
    2,
    false,
    'Read access logs, auth success events, portal views. 2-year retention for high-volume low-value audit entries.',
    '["auth.loginSuccess","auth.refreshToken","auth.tokenVerified","portal.view","read."]'::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

-- ─── Step 12: seed PiiFieldMapping ──────────────────────────────────────────
-- Combines the existing PII_REGISTRY in pii-redaction.ts (22 entries) with the
-- five FR-012 additions that are NOT in the existing registry.

INSERT INTO "pii_field_mappings"
  ("id", "action_pattern", "json_field_path", "classification", "requires_manual_review", "created_at", "updated_at")
VALUES
  -- ─── Source (a): existing PII_REGISTRY entries ───────────────────────────
  (gen_random_uuid(), 'user.',        'email',                      'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'user.',        'phone',                      'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'user.',        'name',                       'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'inspector.',   'email',                      'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'inspector.',   'phone',                      'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'inspector.',   'name',                       'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'auth.',        'email',                      'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'auth.',        'phone',                      'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'auth.',        'name',                       'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'portal.',      'primaryEmail',               'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'portal.',      'primaryPhone',               'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'portal.',      'email',                      'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'portal.',      'phone',                      'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'portal.',      'name',                       'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'appointment.', 'contact.tenantName',         'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'appointment.', 'contact.primaryEmail',       'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'appointment.', 'contact.primaryPhone',       'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'appointment.', 'tenantName',                 'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'appointment.', 'tenantEmail',                'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'appointment.', 'tenantPhone',                'direct', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- ─── Source (b): FR-012 additions not in the existing registry ───────────
  (gen_random_uuid(), 'inspector.',           'paymentSettingsJson',      'sensitive_financial', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'appointment.status_transition', 'metadata.inspectorName', 'direct',       false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'appointment.',         'customFieldsJson',         'unstructured',        true,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'portal.',              'secondaryEmail',           'direct',              false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'portal.',              'secondaryPhone',           'direct',              false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ─── Step 13: post-seed verification ────────────────────────────────────────
-- Assert that the seed landed 20 existing + 5 additions = 25 rows minimum.
-- Fail the migration if the count is lower (developer ran a stale seed script).

DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM "pii_field_mappings";
  IF row_count < 25 THEN
    RAISE EXCEPTION 'pii_field_mappings seed verification failed: expected >= 25 rows, got %', row_count;
  END IF;
END $$;
