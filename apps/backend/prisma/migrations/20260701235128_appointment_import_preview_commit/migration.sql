-- Appointment-import redesign: preview/commit split.
--
-- `branch_id` is set at preview time (the operator-selected branch) and is
-- what both preview and commit derive tenant scope from for AM/OP (mirrors
-- CreateAppointmentUseCase's own branch-to-tenant resolution). `preview_json`
-- caches the full row-resolver output shown in the wizard; `results_json` is
-- written incrementally per row by the commit worker so a crash/retry
-- mid-batch resumes rather than risking a duplicate appointment. `status`
-- gains a PREVIEW value at the application level — the column is already a
-- plain VarChar(20) (see the AppointmentImport model), so no enum migration
-- is needed.
ALTER TABLE "appointment_imports"
  ADD COLUMN "branch_id" TEXT,
  ADD COLUMN "preview_json" JSONB,
  ADD COLUMN "results_json" JSONB;

ALTER TABLE "appointment_imports"
  ADD CONSTRAINT "appointment_imports_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reconciles the DB with schema.prisma's `@default("")` on
-- properties.normalized_address_key (added in the prior migration purely so
-- Prisma's generated Create input treats the field as optional — the
-- BEFORE INSERT/UPDATE trigger is what actually computes the real value).
-- A DB-level default is a harmless extra safety net for any insert path that
-- somehow bypasses both the client default and the trigger.
ALTER TABLE "properties" ALTER COLUMN "normalized_address_key" SET DEFAULT '';
