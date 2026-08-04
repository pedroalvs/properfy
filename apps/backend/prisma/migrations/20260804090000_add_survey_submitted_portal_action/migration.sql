-- Satisfaction survey (scope item 14): the portal records a SURVEY_SUBMITTED activity alongside
-- the existing VIEW/CONFIRM/GROUP_JOIN trail, so every portal mutation still leaves an activity row.
-- ALTER TYPE ... ADD VALUE must be isolated in its own migration (the new value cannot be used
-- in the same transaction it is added), and must be live in the environment before any code writes it.
ALTER TYPE "RentalTenantPortalAction" ADD VALUE IF NOT EXISTS 'SURVEY_SUBMITTED';
