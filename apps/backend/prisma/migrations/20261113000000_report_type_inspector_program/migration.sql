-- F08-5 (03.14): add the INSPECTOR_PROGRAM report type.
-- Alone in its own migration: PostgreSQL cannot use a newly added enum value in the
-- same transaction that defines it. The value is only written at runtime when an
-- operator requests the report, long after this migration commits (expand-only).
ALTER TYPE "ReportType" ADD VALUE 'INSPECTOR_PROGRAM';
