-- Real session activity tracking (#261). Refresh-token rotation stamps
-- last_used_at so the "your sessions" list shows a genuine last-active time
-- instead of the session's creation time. Nullable until a session's first
-- refresh. Expand-only.

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "last_used_at" TIMESTAMP(3);
