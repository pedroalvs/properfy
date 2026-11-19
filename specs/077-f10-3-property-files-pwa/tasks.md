# Tasks: PWA — Property Files, Report Issue & Photos on "Can't do this job"

**Input**: Design documents from `/specs/077-f10-3-property-files-pwa/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/consumed-endpoints.md

**Tests**: INCLUDED — TDD is mandatory (Constitution III, root CLAUDE.md §11). Write each test first, see it fail (red), then implement (green).

**Scope guardrails**: `apps/pwa` only. No backend/Prisma/migration/`openapi.json`/`api-types.ts` change (FR-020, D19). No nuclear PWA file (`router.tsx`, `BottomNavBar.tsx`, `sw.ts`) touched. Reuse `Sheet`/`Segmented`/`AvatarUploader` pattern/`idempotency.ts`. Every derived query value memoized (PWA §11.11). ≤150 files.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different file, no incomplete dependency)
- **[Story]**: US1 (view files) · US2 (report issue) · US3 (cant-do photos)

---

## Phase 1: Setup

- [ ] T001 Create the `apps/pwa/src/features/property-files/` folder with `components/`, `hooks/`, `lib/`, and `__tests__` subfolders, plus an `index.ts` barrel (re-exporting `PropertyFilesSection`). No logic yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: pure helpers + error mapping used by every story. No story UI can land until these exist.

**⚠️ These block US1/US2/US3.**

- [ ] T002 [P] Write failing unit tests for the error mapper in `apps/pwa/src/features/property-files/lib/__tests__/property-file-error.test.ts`: 503 → `FILE_STORAGE_UNAVAILABLE_MESSAGE` (from `@properfy/shared`), 404 → not-available copy, 409 photo-link → retry copy, bad-type/size (400/413) → clear "type/size not allowed" copy, network/offline → connect copy, default → generic.
- [ ] T003 [P] Write failing unit tests for `property-file-view` in `apps/pwa/src/features/property-files/lib/__tests__/property-file-view.test.ts`: group files by `type`, per-type counts from the list `counts`, sort newest-first, `previewKind(mime)` (image/pdf/other), issue "No photos"/"Photo removed (retention)" labels (D27), origin-badge label from `source`.
- [ ] T004 Implement `apps/pwa/src/features/property-files/lib/property-file-error.ts` (pure `ApiError → message`) to green T002.
- [ ] T005 Implement `apps/pwa/src/features/property-files/lib/property-file-view.ts` (pure grouping/sort/labels/`previewKind`) to green T003. All exported mappers are pure (memo-wrapped at the hook boundary).

**Checkpoint**: shared pure logic green and lint/typecheck clean.

---

## Phase 3: User Story 1 — View property files for a job (Priority: P1) 🎯 MVP

**Goal**: a read-only Files section in the inspector service detail: Segmented subtabs (Issues default → Documents → Reports → Other) with per-type counts, issue cards, and download (image preview / PDF new tab / generic+download). Online-only.

**Independent Test**: open a stubbed appointment detail with files of each type → Issues active by default → switch subtabs → download a document → offline shows "connect to load".

### Tests for US1

- [ ] T006 [P] [US1] Failing hook tests in `apps/pwa/src/features/property-files/hooks/__tests__/usePropertyFiles.test.ts` and `.../usePropertyIssues.test.ts`: call `GET /v1/property-files?appointmentId=` / `GET /v1/property-issues?appointmentId=`, return memoized grouped data + counts, expose loading/error/offline; never call without `appointmentId`.
- [ ] T007 [P] [US1] Failing hook test in `apps/pwa/src/features/property-files/hooks/__tests__/useFileDownload.test.ts`: `GET /v1/property-files/:id/download` returns `{url}`, opens it; 404 → not-available message (no throw to UI crash).
- [ ] T008 [P] [US1] Failing component test in `apps/pwa/src/features/property-files/components/__tests__/PropertyFilesSection.test.tsx`: Issues subtab active by default, counts render, Segmented switches subtabs, loading skeleton / empty / offline / error states.
- [ ] T009 [P] [US1] Failing component tests for `IssueCard.test.tsx` (reason/origin badge/date, photo thumbnails, "No photos", HEIC generic affordance D13) and `FileList.test.tsx` (name, download, PDF new-tab, image preview) under `apps/pwa/src/features/property-files/components/__tests__/`.

### Implementation for US1

- [ ] T010 [P] [US1] Implement `apps/pwa/src/features/property-files/hooks/usePropertyFiles.ts` and `usePropertyIssues.ts` (React Query via `apiGet`, `appointmentId`-keyed, memoized derived data, no SW cache) → green T006.
- [ ] T011 [P] [US1] Implement `apps/pwa/src/features/property-files/hooks/useFileDownload.ts` (fetch signed URL, open; map 404) → green T007.
- [ ] T012 [US1] Implement `apps/pwa/src/features/property-files/components/FileList.tsx` and `IssueCard.tsx` (read-only; download via `useFileDownload`, preview-kind from `property-file-view`) → green T009.
- [ ] T013 [US1] Implement `apps/pwa/src/features/property-files/components/IssueList.tsx` (Issues subtab list of `IssueCard`; **no** Report-issue button yet — US2 adds it) and `PropertyFilesSection.tsx` (`Segmented` subtabs + counts + loading/empty/offline/error, uses `useIsOnline`) → green T008.
- [ ] T014 [US1] Mount `<PropertyFilesSection appointmentId={appointmentId} propertyId={apt.propertyId} />` in `apps/pwa/src/features/schedule/pages/AppointmentDetailPage.tsx` (new section near `JobDetailsSection`); confirm `apt.propertyId` is surfaced by the detail payload/type.

**Checkpoint**: US1 fully functional — an inspector can view and download files; MVP shippable.

---

## Phase 4: User Story 2 — Report an issue with photos (Priority: P2)

**Goal**: a "Report issue" sheet (reason 1–1000 + optional photos) with per-photo presign→PUT→confirm progress/failure; create the issue with `Idempotency-Key` once all intended photos confirm; new issue appears in the list. Online-only.

**Independent Test**: open "Report issue", enter a reason, add 1 photo (stubbed presign/PUT/confirm/create), submit → create-issue fires with `photoFileIds` and the issue appears; a failing second photo keeps the first.

### Tests for US2

- [ ] T015 [P] [US2] Failing unit tests for `issue-photo-validation.ts` in `apps/pwa/src/features/property-files/lib/__tests__/issue-photo-validation.test.ts`: `accept` string from `DEFAULT_PROPERTY_FILES_SETTING.issueImageMimes`; soft guards (non-image rejected, oversize vs `maxFileSizeMb`, count vs `maxPhotosPerIssue` default 10) returning a clear reason; backend stays authoritative (helper only hints).
- [ ] T016 [P] [US2] Failing hook test for the per-photo state machine in `apps/pwa/src/features/property-files/hooks/__tests__/useIssuePhotoUpload.test.ts`: presign→PUT→confirm happy path sets `confirmed` + `fileId` (PENDING); one photo failing leaves others `confirmed` (failure isolation, D12); retry re-uploads; remove drops + revokes object URL; confirm sends `Idempotency-Key` (D24).
- [ ] T017 [P] [US2] Failing hook test for `useCreatePropertyIssue.test.ts`: `POST /v1/property-issues` with `{propertyId, appointmentId, reason, photoFileIds}` + `Idempotency-Key`; invalidates `['inspector','appointment',id]` + property-files/issues queries; 409 link error → mapped message; zero-photo create allowed (D27).
- [ ] T018 [P] [US2] Failing component tests `PhotoPicker.test.tsx` (per-photo progress/error rows, retry/remove, add disabled at cap) and `ReportIssueSheet.test.tsx` (reason required 1–1000; submit disabled while uploading or any failed; 503 → `FILE_STORAGE_UNAVAILABLE_MESSAGE`; offline unavailable; success closes + snackbar) under `apps/pwa/src/features/property-files/components/__tests__/`.

### Implementation for US2

- [ ] T019 [P] [US2] Implement `apps/pwa/src/features/property-files/lib/issue-photo-validation.ts` → green T015.
- [ ] T020 [US2] Implement `apps/pwa/src/features/property-files/hooks/useIssuePhotoUpload.ts` (per-photo presign via `api.POST('/v1/property-files/presign')` → plain `fetch` PUT to `uploadUrl` with `Content-Type` → `api.POST('/v1/property-files/confirm')` with `Idempotency-Key`; `LocalPhoto` state, progress, retry/remove, object-URL lifecycle) → green T016.
- [ ] T021 [P] [US2] Implement `apps/pwa/src/features/property-files/hooks/useCreatePropertyIssue.ts` (`apiPost('/v1/property-issues', body, {'Idempotency-Key'})`, invalidations) → green T017.
- [ ] T022 [US2] Implement `apps/pwa/src/features/property-files/components/PhotoPicker.tsx` (file input `accept` images + camera `capture`, per-photo rows driven by `useIssuePhotoUpload`; reusable by US3) → green its half of T018.
- [ ] T023 [US2] Implement `apps/pwa/src/features/property-files/components/ReportIssueSheet.tsx` (`Sheet` + reason textarea + `PhotoPicker`; submit = create-issue when all confirmed; per-R3 idempotency `useRef`; error mapping) → green its half of T018.
- [ ] T024 [US2] Wire the "Report issue" button into `IssueList.tsx` (status-independent, FR-022) opening `ReportIssueSheet`; on success the new issue shows via invalidation.

**Checkpoint**: US1 + US2 both work independently.

---

## Phase 5: User Story 3 — Photos on "Can't do this job" (Priority: P3)

**Goal**: the F03-3 Can't-do sheet gains optional photos; with photos, the decline also creates an INSPECTOR issue linked by `cantDoEventId`. No-photo path unchanged; a failed issue-create never reverts the decline (D18).

**Independent Test**: open "Can't do this job", pick a reason, add a photo (stubbed), submit → cant-do fires first, then create-issue fires with `cantDoEventId`; with no photo, only cant-do fires (F03-3 behavior preserved).

### Tests for US3

- [ ] T025 [P] [US3] Update `apps/pwa/src/features/field-events/hooks/__tests__/useReportCantDo.test.ts`: the mutation now **returns** `CantDoResponse` (with `eventId`) on success and `null` on swallowed `CANT_DO_ALREADY_REPORTED`; existing invalidation/purge assertions preserved (red first).
- [ ] T026 [US3] Extend `apps/pwa/src/features/field-events/components/__tests__/CantDoSheet.test.tsx`: no-photo submit = cant-do only (no create-issue, F03-3 preserved); with confirmed photo = cant-do then create-issue `{source server-forced, cantDoEventId, reason=label+note, photoFileIds}`; create-issue failure after decline → decline stands, error logged not surfaced as decline failure (D18).

### Implementation for US3

- [ ] T027 [US3] Change `apps/pwa/src/features/field-events/hooks/useReportCantDo.ts` to return `CantDoResponse | null` (surface `apiPost` data; `null` on swallowed 409) → green T025.
- [ ] T028 [US3] Add the optional `PhotoPicker` section to `apps/pwa/src/features/field-events/components/CantDoSheet.tsx` and orchestrate submit: upload photos while open (SCHEDULED) → on send, `useReportCantDo` → if photos + non-null result, `useCreatePropertyIssue` with `cantDoEventId`; D18 non-revert on issue-create failure → green T026.

**Checkpoint**: all three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting (E2E, fixtures, docs, gates)

- [ ] T029 [P] Add property-file/issue fixtures to `apps/pwa/tests/e2e/support/fixtures.ts` (mirroring the shared response schemas) and extend the strict-parse validation in `apps/pwa/src/__tests__/e2e-fixtures.test.ts`.
- [ ] T030 Add default empty prefix stubs for `GET /v1/property-files` and `GET /v1/property-issues` to `BASELINE_STUBS` in `apps/pwa/tests/e2e/support/auth.ts` (they fire whenever the detail renders; `stubJsonPrefix` like the day-plan one) so existing detail specs stay quiet; new spec overrides.
- [ ] T031 [US2][US3] Create `apps/pwa/tests/e2e/property-files.spec.ts` (hermetic, all `/v1/property-files*`/`/v1/property-issues*` + the signed-URL PUT origin stubbed; `setInputFiles`): (a) Report issue with 1 photo → create-issue fires → issue appears (SC-006a); (b) Can't do with a photo → cant-do fires then create-issue fires (SC-006b). Runs on all 4 projects (Chromium + WebKit); apply the WebKit-only residual rule only if a genuine WebKit flake appears (never a silent skip).
- [ ] T032 Update `apps/pwa/CLAUDE.md`: flip §8 (photo upload now exists for F10 issue photos), add the Files section + Report-issue + cant-do-photos to §4 (appointment detail), note online-only (no SW cache) and that `useReportCantDo` returns `CantDoResponse`.
- [ ] T033 Run the full gate set inside the worktree (via a subagent returning a condensed summary): `pnpm --filter pwa lint`, `typecheck`, `check:ds`, `test` (Vitest), `test:e2e` (4 projects). Fix any failure and re-run until green.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** block everything.
- **US1** depends only on Phase 2. **US2** depends on Phase 2 (its own upload libs/hooks are in US2). **US3** depends on **US2** (reuses `PhotoPicker` + `useIssuePhotoUpload` + `useCreatePropertyIssue`).
- **Phase 6** depends on the stories it proves (E2E after US2/US3; CLAUDE.md after all).

### Within each story (TDD)

- Tests first (red) → implement (green) → refactor. Pure `lib/` before hooks; hooks before components; components before page wiring.

### Parallel opportunities

- T002/T003 in parallel; T006/T007/T008/T009 in parallel; T015/T016/T017/T018 in parallel; T010/T011 and T019/T021 in parallel (different files).
- US3 is **not** parallel with US2 (shared files).

---

## Implementation Strategy

1. **MVP** = Phase 1 + 2 + US1 (view files). Stop, validate the read-only section.
2. Add **US2** (report issue) → validate the per-photo upload + create.
3. Add **US3** (cant-do photos) → validate the decline-then-issue orchestration.
4. **Polish**: E2E (Chromium + WebKit), fixtures, BASELINE_STUBS, CLAUDE.md, full gates.

## Notes

- `[P]` = different files, no incomplete dependency.
- Online-only: no offline queue, no SW file cache, no `INSPECTOR_API_CACHES` change.
- Backend-authoritative limits (C.A5); client guard is a soft hint only.
- Commit per task or logical group; conventional commits, no Claude/AI references.
