-- DropIndex
DROP INDEX IF EXISTS "users_email_key";

-- CreateIndex (partial unique: only active users)
CREATE UNIQUE INDEX "users_email_key" ON "users"("email") WHERE "deleted_at" IS NULL;
