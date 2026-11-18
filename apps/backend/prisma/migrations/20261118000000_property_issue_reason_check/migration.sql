-- F10-1 defense-in-depth: enforce the property_issues.reason length bound at the
-- DB level. The shipped `20261108000100_property_files_and_issues` migration
-- created `reason TEXT NOT NULL` WITHOUT the CHECK the spec required
-- (`reason TEXT NOT NULL CHECK (char_length BETWEEN 1 AND 1000)`); length was
-- enforced only in Zod (PROPERTY_ISSUE_REASON_MAX). This adds the missing CHECK
-- so a raw insert cannot store an empty or over-long reason.
--
-- Expand-only. A CHECK is not expressible in schema.prisma; like the F10
-- `issue_id_matches_type` CHECK and the partial indexes, it is managed in raw
-- migration SQL (Prisma `migrate dev` reports it as drift but must not drop it).
ALTER TABLE "property_issues"
    ADD CONSTRAINT "property_issues_reason_length_chk"
        CHECK (char_length("reason") BETWEEN 1 AND 1000);
