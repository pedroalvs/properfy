-- AlterTable
ALTER TABLE "app_credentials" ADD COLUMN     "app_url" VARCHAR(1000),
ADD COLUMN     "auth_code_encrypted" TEXT,
ADD COLUMN     "branch_id" TEXT,
ADD COLUMN     "instructions_password_encrypted" TEXT,
ADD COLUMN     "instructions_url" VARCHAR(1000),
ADD COLUMN     "needs_auth_code" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "app_credentials_tenant_id_branch_id_idx" ON "app_credentials"("tenant_id", "branch_id");

-- AddForeignKey
ALTER TABLE "app_credentials" ADD CONSTRAINT "app_credentials_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
