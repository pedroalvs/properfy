-- AlterTable
ALTER TABLE "app_credentials" ADD COLUMN     "is_default" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "app_credentials_tenant_id_is_default_idx" ON "app_credentials"("tenant_id", "is_default");
