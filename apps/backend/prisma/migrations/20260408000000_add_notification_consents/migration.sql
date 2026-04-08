-- AlterEnum: add SKIPPED to NotificationStatus
ALTER TYPE "NotificationStatus" ADD VALUE 'SKIPPED';

-- CreateTable
CREATE TABLE "notification_consents" (
    "id" TEXT NOT NULL,
    "recipient" VARCHAR(320) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "opted_out" BOOLEAN NOT NULL DEFAULT false,
    "opted_out_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_consents_tenant_id_idx" ON "notification_consents"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_consents_recipient_channel_tenant_id_key" ON "notification_consents"("recipient", "channel", "tenant_id");
