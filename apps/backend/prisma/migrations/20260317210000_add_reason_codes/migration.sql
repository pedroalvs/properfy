-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "cancellation_reason_code" VARCHAR(50),
ADD COLUMN "rejection_reason_code" VARCHAR(50);
