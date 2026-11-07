-- F10 TASK-F10-1: property files & issues (two tenant-scoped tables).
-- Expand-only. This migration contains ONLY the new objects; pre-existing
-- raw-SQL-managed indexes (GIST/trgm) and constraint names are intentionally
-- left untouched (Prisma `migrate dev` reports them as drift, but they are
-- managed outside Prisma and must not be dropped here).

-- CreateEnum
CREATE TYPE "PropertyFileType" AS ENUM ('ISSUE', 'DOCUMENT', 'REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "PropertyFileStatus" AS ENUM ('PENDING', 'READY');

-- CreateEnum
CREATE TYPE "PropertyIssueSource" AS ENUM ('INSPECTOR', 'STAFF', 'RENTAL_TENANT_PORTAL');

-- CreateTable
CREATE TABLE "property_issues" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "reason" TEXT NOT NULL,
    "source" "PropertyIssueSource" NOT NULL,
    "created_by_user_id" TEXT,
    "cant_do_event_id" TEXT,
    "seen_at" TIMESTAMP(3),
    "seen_by_user_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_files" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "issue_id" TEXT,
    "type" "PropertyFileType" NOT NULL,
    "version_group_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "file_name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "status" "PropertyFileStatus" NOT NULL DEFAULT 'PENDING',
    "uploaded_by_user_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,
    "purged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_issues_property_id_idx" ON "property_issues"("property_id");

-- CreateIndex
CREATE INDEX "property_issues_appointment_id_idx" ON "property_issues"("appointment_id");

-- CreateIndex
CREATE INDEX "property_files_property_id_type_idx" ON "property_files"("property_id", "type");

-- CreateIndex
CREATE INDEX "property_files_appointment_id_type_idx" ON "property_files"("appointment_id", "type");

-- CreateIndex
CREATE INDEX "property_files_issue_id_idx" ON "property_files"("issue_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_files_version_group_version_unique" ON "property_files"("version_group_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "property_files_storage_key_unique" ON "property_files"("storage_key");

-- AddForeignKey
ALTER TABLE "property_issues" ADD CONSTRAINT "property_issues_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_issues" ADD CONSTRAINT "property_issues_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_issues" ADD CONSTRAINT "property_issues_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_issues" ADD CONSTRAINT "property_issues_cant_do_event_id_fkey" FOREIGN KEY ("cant_do_event_id") REFERENCES "inspector_field_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_files" ADD CONSTRAINT "property_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_files" ADD CONSTRAINT "property_files_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_files" ADD CONSTRAINT "property_files_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_files" ADD CONSTRAINT "property_files_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "property_issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── F10 raw SQL (not expressible in Prisma; the drift check keeps these) ─────

-- D20: an issue photo exists as a PENDING row (type=ISSUE, issue_id NULL) before
-- its issue is created; the CHECK is relaxed while PENDING. A READY ISSUE photo
-- must carry issue_id; non-ISSUE types must not.
ALTER TABLE "property_files" ADD CONSTRAINT "issue_id_matches_type" CHECK (
    "status" = 'PENDING'
    OR ("type" = 'ISSUE' AND "issue_id" IS NOT NULL)
    OR ("type" <> 'ISSUE' AND "issue_id" IS NULL)
);

-- Unseen-issue indicators (D26). Partial — index only unseen, non-deleted rows.
-- Yellow dot + border for appointments:
CREATE INDEX "property_issues_tenant_appointment_unseen_idx"
    ON "property_issues" ("tenant_id", "appointment_id")
    WHERE "seen_at" IS NULL AND "deleted_at" IS NULL;
-- Yellow dot for Properties (issues WITHOUT an appointment):
CREATE INDEX "property_issues_tenant_property_no_appt_unseen_idx"
    ON "property_issues" ("tenant_id", "property_id")
    WHERE "appointment_id" IS NULL AND "seen_at" IS NULL AND "deleted_at" IS NULL;
-- Property row border (ANY unseen issue of the property):
CREATE INDEX "property_issues_tenant_property_unseen_idx"
    ON "property_issues" ("tenant_id", "property_id")
    WHERE "seen_at" IS NULL AND "deleted_at" IS NULL;

-- Retention sweeps (D8/D22). Partial — index only the sweep's target rows.
-- Orphaned PENDING uploads (> 24 h, not yet purged):
CREATE INDEX "property_files_pending_orphan_idx"
    ON "property_files" ("created_at")
    WHERE "status" = 'PENDING' AND "purged_at" IS NULL;
-- Soft-deleted files not yet purged from storage:
CREATE INDEX "property_files_deleted_unpurged_idx"
    ON "property_files" ("deleted_at")
    WHERE "deleted_at" IS NOT NULL AND "purged_at" IS NULL;
