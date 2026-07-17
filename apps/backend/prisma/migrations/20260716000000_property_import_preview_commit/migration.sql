-- Property-import redesign: preview/commit split, mirroring the
-- appointment-import migration (20260701235128). `preview_json` caches the
-- full row-resolver output shown in the wizard (including per-address
-- geocode verification, reused at commit so addresses are never geocoded
-- twice); `results_json` is written incrementally per row by the commit
-- worker so a crash/retry mid-batch resumes rather than risking duplicate
-- properties. `status` gains a PREVIEW value at the application level — the
-- column is already a plain VarChar(20), so no enum migration is needed.
ALTER TABLE "property_imports"
  ADD COLUMN "preview_json" JSONB,
  ADD COLUMN "results_json" JSONB;
