-- Inspector notices (F02-1). Platform-scoped: no tenant_id on any of the three tables.
-- Expand-only: three new tables + one cheap data UPDATE of inspectors.push_enabled.

-- CreateTable
CREATE TABLE "inspector_notices" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "audience_json" JSONB NOT NULL,
    "system_type" VARCHAR(40),
    "dedupe_key" VARCHAR(200),
    "target_path" VARCHAR(200),
    "author_user_id" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),
    "delivery_started_at" TIMESTAMP(3),
    "delivery_completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspector_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspector_notice_recipients" (
    "notice_id" TEXT NOT NULL,
    "inspector_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "delivery_processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspector_notice_recipients_pkey" PRIMARY KEY ("notice_id","inspector_id")
);

-- CreateTable
CREATE TABLE "inspector_push_subscriptions" (
    "id" TEXT NOT NULL,
    "inspector_id" TEXT NOT NULL,
    "endpoint" VARCHAR(2048) NOT NULL,
    "p256dh" VARCHAR(255) NOT NULL,
    "auth" VARCHAR(255) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" VARCHAR(20),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspector_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inspector_notices_dedupe_key_key" ON "inspector_notices"("dedupe_key");

-- CreateIndex
CREATE INDEX "inspector_notices_published_at_idx" ON "inspector_notices"("published_at");

-- CreateIndex
CREATE INDEX "inspector_notices_archived_at_idx" ON "inspector_notices"("archived_at");

-- CreateIndex
CREATE INDEX "inspector_notice_recipients_inspector_id_read_at_idx" ON "inspector_notice_recipients"("inspector_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "inspector_push_subscriptions_endpoint_key" ON "inspector_push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "inspector_push_subscriptions_inspector_id_revoked_at_idx" ON "inspector_push_subscriptions"("inspector_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "inspector_notices" ADD CONSTRAINT "inspector_notices_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_notice_recipients" ADD CONSTRAINT "inspector_notice_recipients_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "inspector_notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_notice_recipients" ADD CONSTRAINT "inspector_notice_recipients_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_push_subscriptions" ADD CONSTRAINT "inspector_push_subscriptions_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- D10: push_enabled stops reflecting the browser permission (F01 D9). No one has a
-- subscription yet, so every existing TRUE becomes FALSE. NULL (never reported) stays NULL.
UPDATE "inspectors" SET "push_enabled" = FALSE WHERE "push_enabled" = TRUE;
