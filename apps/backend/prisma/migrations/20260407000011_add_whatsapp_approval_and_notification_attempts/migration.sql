-- CreateEnum
CREATE TYPE "WhatsAppApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationAttemptStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- AlterTable: Add WhatsApp approval fields to notification_templates
ALTER TABLE "notification_templates" ADD COLUMN "whatsapp_approval_status" "WhatsAppApprovalStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "notification_templates" ADD COLUMN "whatsapp_approval_reference" VARCHAR(255);

-- CreateTable: notification_attempts
CREATE TABLE "notification_attempts" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "NotificationAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "provider_error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "notification_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_attempts_notification_id_idx" ON "notification_attempts"("notification_id");

-- CreateIndex
CREATE INDEX "notification_attempts_notification_id_attempt_number_idx" ON "notification_attempts"("notification_id", "attempt_number");

-- AddForeignKey
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
