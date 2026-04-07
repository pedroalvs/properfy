-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "country_code" VARCHAR(2),
ADD COLUMN "device_fingerprint" VARCHAR(64);
