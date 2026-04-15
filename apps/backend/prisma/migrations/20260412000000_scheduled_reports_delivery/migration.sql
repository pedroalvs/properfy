-- Feature 019: Scheduled Reports and Delivery
-- Additive migration: new enums, column additions on scheduled_reports,
-- new scheduled_report_runs table, optional scheduled_report_id on reports.

-- ─── Step 1: new enums ───────────────────────────────────────────────────────

CREATE TYPE "ScheduleDeliveryMode" AS ENUM ('OWNER_ONLY', 'RECIPIENT_LIST', 'TENANT_WIDE');

CREATE TYPE "ScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED');

CREATE TYPE "ScheduleRunStatus" AS ENUM (
  'queued',
  'running',
  'completed',
  'failed',
  'skipped_catchup',
  'skipped_empty'
);

-- ─── Step 2: extend scheduled_reports ────────────────────────────────────────

ALTER TABLE "scheduled_reports"
  ADD COLUMN "display_name"              VARCHAR(120),
  ADD COLUMN "delivery_mode"             "ScheduleDeliveryMode" NOT NULL DEFAULT 'OWNER_ONLY',
  ADD COLUMN "recipient_user_ids"        JSONB                  NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "skip_delivery_when_empty"  BOOLEAN                NOT NULL DEFAULT false,
  ADD COLUMN "consecutive_failure_count" INTEGER                NOT NULL DEFAULT 0,
  ADD COLUMN "status"                    "ScheduleStatus"       NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "deleted_at"                TIMESTAMP(3);

-- Backfill: derive status from the legacy is_active flag
UPDATE "scheduled_reports"
  SET "status" = CASE WHEN "is_active" THEN 'ACTIVE'::"ScheduleStatus" ELSE 'PAUSED'::"ScheduleStatus" END;

CREATE INDEX "scheduled_reports_status_next_run_at_idx"
  ON "scheduled_reports"("status", "next_run_at");

-- ─── Step 3: new scheduled_report_runs table ─────────────────────────────────

CREATE TABLE "scheduled_report_runs" (
  "id"                   TEXT                NOT NULL,
  "schedule_id"          TEXT                NOT NULL,
  "report_id"            TEXT,
  "status"               "ScheduleRunStatus" NOT NULL,
  "scheduled_for"        TIMESTAMP(3)        NOT NULL,
  "started_at"           TIMESTAMP(3),
  "completed_at"         TIMESTAMP(3),
  "error_message"        TEXT,
  "recipient_count"      INTEGER,
  "delivery_status_json" JSONB,
  "created_at"           TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3)        NOT NULL,
  CONSTRAINT "scheduled_report_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scheduled_report_runs_schedule_id_scheduled_for_key"
  ON "scheduled_report_runs"("schedule_id", "scheduled_for");

CREATE INDEX "scheduled_report_runs_schedule_id_created_at_idx"
  ON "scheduled_report_runs"("schedule_id", "created_at");

CREATE INDEX "scheduled_report_runs_report_id_idx"
  ON "scheduled_report_runs"("report_id");

CREATE INDEX "scheduled_report_runs_status_idx"
  ON "scheduled_report_runs"("status");

ALTER TABLE "scheduled_report_runs"
  ADD CONSTRAINT "scheduled_report_runs_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "scheduled_reports"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scheduled_report_runs"
  ADD CONSTRAINT "scheduled_report_runs_report_id_fkey"
  FOREIGN KEY ("report_id") REFERENCES "reports"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Step 4: add scheduled_report_id to reports ──────────────────────────────

ALTER TABLE "reports"
  ADD COLUMN "scheduled_report_id" TEXT;

CREATE INDEX "reports_scheduled_report_id_idx"
  ON "reports"("scheduled_report_id");

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_scheduled_report_id_fkey"
  FOREIGN KEY ("scheduled_report_id") REFERENCES "scheduled_reports"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
