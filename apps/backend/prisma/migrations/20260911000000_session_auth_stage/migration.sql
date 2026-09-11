-- Staged (setup-only) authentication sessions (#115). The 15-minute session
-- issued so an AM can complete mandatory TOTP enrollment records its stage here
-- ('totp_setup'); every normal session leaves this NULL. Refresh-token rotation
-- reads it to refuse extending a setup session. Expand-only, nullable.

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "auth_stage" VARCHAR(16);
