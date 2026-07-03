-- Service group display identity is the sequential group_number ("Group 12").
-- The free-text name field is removed entirely (product decision, 2026-07-02).
ALTER TABLE "service_groups" DROP COLUMN "name";
