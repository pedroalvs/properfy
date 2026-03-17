-- AlterTable
ALTER TABLE "inspectors" ADD COLUMN "user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "inspectors_user_id_key" ON "inspectors"("user_id");

-- CreateIndex
CREATE INDEX "inspectors_user_id_idx" ON "inspectors"("user_id");

-- AddForeignKey
ALTER TABLE "inspectors" ADD CONSTRAINT "inspectors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
