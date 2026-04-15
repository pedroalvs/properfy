-- CORRECTION-007 fix (2026-04-13): reconstruct the missing `password_reset_tokens`
-- migration. The table was previously provisioned out-of-band (via `prisma db push`
-- against production) without a corresponding migration committed to the repository.
-- This migration matches the current `PasswordResetToken` Prisma model exactly.
--
-- Production environments that already have this table (which is every
-- non-fresh environment) MUST mark this migration as applied without executing
-- it, via:
--
--   prisma migrate resolve --applied 20260406000000_add_password_reset_tokens
--
-- Fresh environments will apply it normally. The `IF NOT EXISTS` guards are
-- defensive: if a fresh environment somehow has the table already, the
-- migration is idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_idx" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- AddForeignKey — guarded against re-creation so `migrate resolve --applied`
-- on production does not conflict with an existing constraint.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'password_reset_tokens_user_id_fkey'
          AND table_name = 'password_reset_tokens'
    ) THEN
        ALTER TABLE "password_reset_tokens"
            ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
