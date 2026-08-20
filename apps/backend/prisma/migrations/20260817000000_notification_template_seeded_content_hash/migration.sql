-- Records the seed content a platform template row was last written with, so
-- the startup sync can refresh untouched rows from the code catalog while
-- protecting rows edited by a human (content no longer matches the hash).
ALTER TABLE "notification_templates" ADD COLUMN "seeded_content_hash" VARCHAR(64);
