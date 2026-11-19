# Tasks: Property Files & Issues — Web (F10-2)

**Input**: Design documents from `/specs/076-f10-2-property-files-web/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-contract.md, quickstart.md

**Tests**: INCLUDED — TDD is mandatory (Constitution III + project rule). Each unit/component/hook gets a Vitest/RTL test (red→green); hermetic Playwright E2E for the cross-surface flow.

**Context**: Web-only consumer of the merged F10-1 contract. No backend/schema/`api-types.ts` change; no `pnpm generate:api`. All paths are under `apps/web/` unless noted. RBAC via shared role-matrix (`usePermissions().canPerform(...)`).

## Path Conventions

- Web SPA: `apps/web/src/features/<domain>/`, shared primitives in `apps/web/src/components/`, E2E in `apps/web/tests/e2e/`.
- New feature folder: `apps/web/src/features/property-files/`.

---

## Phase 1: Setup (shared scaffolding & type plumbing)

- [ ] T001 Create the `apps/web/src/features/property-files/` folder with `components/`, `hooks/`, `lib/`, `types/` subfolders and an `index.ts` barrel exporting the public panel + settings section.
- [ ] T002 [P] Add `hasUnseenIssues?: boolean` and `fileCounts?: FileCounts` (import `FileCounts` from `@properfy/shared`) to the web `Appointment` type in `apps/web/src/features/appointments/types/index.ts`.
- [ ] T003 [P] Add `hasUnseenIssues?: boolean` and `fileCounts?: FileCounts` to the web `Property` type in `apps/web/src/features/properties/types/index.ts`.
- [ ] T004 [P] Write `apps/web/src/features/property-files/lib/file-type.test.ts` then implement `lib/file-type.ts`: `FileSubtab` type + `SUBTAB_TO_TYPE`/`TYPE_TO_SUBTAB` maps, `isImageMime`/`isPdfMime`/`canPreviewInline` (HEIC → false), and `humanizeSize(bytes)`.
- [ ] T005 [P] Write `apps/web/src/features/property-files/lib/issue-format.test.ts` then implement `lib/issue-format.ts`: `issueSourceLabel(source)` (INSPECTOR→"Inspector", STAFF→"Staff", RENTAL_TENANT_PORTAL→"Tenant"), `issueSeenText(issue, currentUserId)` ("Seen · {dd/MM HH:mm}" + "by you"; via shared Sydney date helpers), and photo-state text ("No photos" / "Photo removed (retention)"). Assert no raw id/uuid is produced.

**Checkpoint**: Types compile; lib helpers pass unit tests.

---

## Phase 2: Foundational (shared data + upload hooks — blocking for US1/US2/US3)

- [ ] T006 [P] Write `hooks/useDownloadPropertyFile.test.ts` then implement `hooks/useDownloadPropertyFile.ts`: `GET /v1/property-files/{id}/download` → opens/returns the 5-min signed URL; surfaces `FILE_STORAGE_UNAVAILABLE_MESSAGE` on 503/`STORAGE_NOT_CONFIGURED`.
- [ ] T007 [P] Write `hooks/usePropertyFiles.test.ts` then implement `hooks/usePropertyFiles.ts`: `GET /v1/property-files` by `{propertyId|appointmentId, type?}`; key `['property-files', scopeId, type?]`; returns `files` + `counts`; memoized/stable; empty/error/503 surfaced.
- [ ] T008 [P] Write `hooks/usePropertyIssues.test.ts` then implement `hooks/usePropertyIssues.ts`: `GET /v1/property-issues` by `{propertyId|appointmentId}`; key `['property-issues', scopeId]`; returns `issues` (with photos); stable; states surfaced.
- [ ] T009 Write `hooks/usePropertyFileUpload.test.ts` then implement `hooks/usePropertyFileUpload.ts`: presign (`POST /v1/property-files/presign`) → `fetch(uploadUrl, { method:'PUT', body:file, headers:{'Content-Type':file.type}, signal })` with 60 s AbortController → confirm (`POST /v1/property-files/confirm`, `Idempotency-Key` via `createIdempotencyKeyManager`). Expose `{ upload(file, {type, propertyId, appointmentId?}), status, error }`; map presign/confirm 400 to a clear message (C.A5) and 503 to `FILE_STORAGE_UNAVAILABLE_MESSAGE`. Mirrors `useInspectorDocumentUpload`.
- [ ] T010 [P] Write `components/UploadFileControl.test.tsx` then implement `components/UploadFileControl.tsx`: hidden `<input type="file" accept=…>` (accept hint from `DEFAULT_PROPERTY_FILES_SETTING`) + trigger button (`aria-label`), spinner during upload, resets `input.value` after selection; calls `usePropertyFileUpload`.

**Checkpoint**: Data + upload plumbing tested; US1–US3 can build on it independently.

---

## Phase 3: User Story 1 — Browse and download property files (Priority: P1) 🎯 MVP

**Goal**: A Files tab (Issues default + Documents/Reports/Other subtabs, counts, name search, preview/PDF/download) on appointment and property detail, with cross-navigation.

**Independent test**: With list/download endpoints stubbed, open an appointment and a property detail and verify the Files tab, counted subtabs, search, image preview, PDF-new-tab, per-file download, and the cross-navigation buttons.

- [ ] T011 [P] [US1] Write `components/PropertyFileCard.test.tsx` then implement `components/PropertyFileCard.tsx`: name, type badge, "v{n}", date; inline image preview or generic icon + download (HEIC → icon, D13); PDF opens new tab; per-file download via `useDownloadPropertyFile`; in property context, "Appointment #{code}" (code from the panel's `AppointmentCodeMap`) + **Open appointment** when `appointmentId` set, falling back to a code-less **Open appointment** link when the id is not in the map. No raw ids.
- [ ] T012 [P] [US1] Write `components/FileSubtabList.test.tsx` then implement `components/FileSubtabList.tsx`: renders `PropertyFileResponse[]` of a type with `FilterInput` name search (active subtab), empty/loading/error/503 states; renders `PropertyFileCard` items.
- [ ] T013 [P] [US1] Write `components/PropertyIssueCard.test.tsx` then implement `components/PropertyIssueCard.tsx` (view-only part): reason, origin badge (`issueSourceLabel`), date, photo grid (download per photo; icon for non-renderable; "No photos" when empty — the D27 retention-removed label is not derivable from the contract, A9), seen text (`issueSeenStatus`). No raw ids.
- [ ] T014 [US1] Write `components/IssueSubtab.test.tsx` then implement `components/IssueSubtab.tsx` (view-only part): lists `PropertyIssueCard`s from `usePropertyIssues`; name/reason search; states; placeholder slot for "Report issue" (US3) and "View all property issues" (appointment context).
- [ ] T015 [US1] Write `components/PropertyFilesPanel.test.tsx` then implement `components/PropertyFilesPanel.tsx`: a `TabsNav` of subtabs (Issues default, Documents, Reports, Other) with per-tab `badge` counts from `fileCounts`/list `counts`; `context: PanelContext`; `initialSubtab`; renders `IssueSubtab`/`FileSubtabList`; in property context, builds the `AppointmentCodeMap` from a reused `usePropertyAppointments(propertyId)` query and passes it down (also feeds the upload appointment-selector); appointment context shows **View all property files** (→ property Files tab same subtab, same browser tab) and, on Issues, **View all property issues**.
- [ ] T016 [US1] Mount the panel on appointment detail: add a `FILES_TAB` after Portal Activity in `apps/web/src/features/appointments/pages/AppointmentDetailPage.tsx` (gated by `canPerform('property_file.read')`), render `<PropertyFilesPanel context={{kind:'appointment', appointmentId, propertyId}} />`; update `AppointmentDetailPage.test.tsx` (mock the panel's hooks to avoid mockOnce-queue pollution — F03-4 lesson).
- [ ] T017 [US1] Mount the panel on property detail: add a Files tab after Appointments in `apps/web/src/features/properties/pages/PropertyDetailPage.tsx` (compute TABS with `usePermissions`, gate by `property_file.read`), render `<PropertyFilesPanel context={{kind:'property', propertyId}} />`; wire the incoming `initialSubtab` from the appointment "View all …" navigation (query param or route state); update the page test.

**Checkpoint**: US1 is independently demoable — files are viewable and downloadable on both surfaces with cross-navigation (C.A1 web side).

---

## Phase 4: User Story 2 — Upload, version, and delete files (Priority: P1)

**Goal**: Upload Document/Report/Other, add New version + browse Versions, delete (AM/OP), with clear rejection messages.

**Independent test**: With presign/confirm/version/delete stubbed, upload a file, add a version, open the Versions drawer and download both, and delete a file.

- [ ] T018 [P] [US2] Write `hooks/useAddFileVersion.test.ts` then implement `hooks/useAddFileVersion.ts`: `POST /v1/property-files/{id}/versions` (presign) → PUT → confirm (reuse `usePropertyFileUpload` internals); invalidate `['property-files', scopeId]`.
- [ ] T019 [P] [US2] Write `hooks/useDeletePropertyFile.test.ts` then implement `hooks/useDeletePropertyFile.ts`: `DELETE /v1/property-files/{id}` via `api.DELETE`; optimistic removal + rollback on error; invalidate file list + `['appointments']`/`['properties']`.
- [ ] T020 [P] [US2] Write `components/FileVersionsDrawer.test.tsx` then implement `components/FileVersionsDrawer.tsx` (`DrawerPanel` + `DrawerHeader`): lists every version in the `versionGroupId` with per-version download; preserves the previous version (C.A3).
- [ ] T021 [US2] Extend `FileSubtabList`/`PropertyFileCard`: add an upload control on the active Document/Report/Other subtab (gated `property_file.upload`), with an optional appointment selector in property context (select from the property's appointments); **New version** action (gated `property_file.version`) opening the upload + the Versions drawer; **Delete** (gated `property_file.delete`) behind `ConfirmDialog`. Update the component tests for the new actions and the C.A5 rejection message.

**Checkpoint**: US2 adds the full file lifecycle; US1 still works for read-only roles.

---

## Phase 5: User Story 3 — Report and resolve property issues (Priority: P2)

**Goal**: Create an issue (reason + photos, photo-by-photo), mark as seen, delete issue.

**Independent test**: With create/list/seen/delete stubbed, create an issue with a reason + photo, see it on the Issues subtab, mark it seen.

- [ ] T022 [P] [US3] Write `hooks/useCreatePropertyIssue.test.ts` then implement `hooks/useCreatePropertyIssue.ts`: upload each photo one at a time (presign `type:ISSUE` → PUT → confirm) tracking per-photo status; on submit `POST /v1/property-issues` (`Idempotency-Key`) with only confirmed `photoFileIds`; create only when all intended photos confirmed or failed ones removed (D12/D20); invalidate `['property-issues', scopeId]`, `['appointments']`/`['properties']`, `['property-issues','unseen-count']`.
- [ ] T023 [P] [US3] Write `hooks/useMarkIssueSeen.test.ts` then implement `hooks/useMarkIssueSeen.ts`: `POST /v1/property-issues/{id}/seen`; idempotent (second call no-op, `alreadySeen`), no error; invalidate the issue list, the affected list, and the unseen-count key.
- [ ] T024 [P] [US3] Write `hooks/useDeletePropertyIssue.test.ts` then implement `hooks/useDeletePropertyIssue.ts`: `DELETE /v1/property-issues/{id}`; invalidate issue list + lists + unseen-count.
- [ ] T025 [US3] Write `components/CreateIssueDrawer.test.tsx` then implement `components/CreateIssueDrawer.tsx` (`DrawerPanel`): required reason (1–1000, validated), photo picker (issue image MIMEs), per-photo progress/failure with remove, submit via `useCreatePropertyIssue`; in property context an optional appointment selector (same property-appointments list as uploads) so the issue may be linked or property-only; 503 message; reason-empty blocks submit.
- [ ] T026 [US3] Wire into `IssueSubtab`/`PropertyIssueCard`: "Report issue" button opening `CreateIssueDrawer` (gated `property_issue.create`); **Mark as seen** action on the card (gated `property_issue.mark_seen`) via `useMarkIssueSeen`; **Delete issue** (gated `property_issue.delete`) behind `ConfirmDialog`. Update tests (idempotent mark-seen, gating).

**Checkpoint**: Issues can be reported and resolved; indicators (US4) can now be driven.

---

## Phase 6: User Story 4 — Unseen-issue indicators and filtering (Priority: P2)

**Goal**: Sidebar dots, row borders, and the "With issues" list filter.

**Independent test**: With unseen-count + list endpoints stubbed, verify the sidebar dots, `hasUnseenIssues` row border, and the `withIssues` param.

- [ ] T027 [P] [US4] Write `components/shell/SidebarItemBadge.test.tsx` then implement `apps/web/src/components/shell/SidebarItemBadge.tsx`: a `bg-warning` dot (existing design token — the "yellow" indicator) with `aria-label={`${count} unseen issues`}`; renders nothing when `count <= 0`.
- [ ] T028 [P] [US4] Write/extend `components/data/DataTable.test.tsx` then add optional `rowClassName?: (row: T) => string | undefined` to `apps/web/src/components/data/DataTable.tsx`, applied via `cn(...)` to both the desktop `<tr>` and the mobile card; no behaviour change when omitted.
- [ ] T029 [P] [US4] Write `hooks/useUnseenIssueCount.test.ts` then implement `hooks/useUnseenIssueCount.ts`: `GET /v1/property-issues/unseen-count`; key `['property-issues','unseen-count']`; `staleTime: 60_000`; `enabled` only when `canPerform('property_issue.unseen_count')`; stable result.
- [ ] T030 [US4] Wire the sidebar: add optional `badge?: boolean`/count to `SidebarItem`/`NavItem`, wrap the icon in a `relative` span and render `SidebarItemBadge` in `apps/web/src/components/shell/SidebarItem.tsx`; in `Sidebar.tsx` feed `useUnseenIssueCount` → dot on **Map** (`appointmentsWithUnseenIssues`) and **Properties** (`propertiesWithUnseenIssues`). Update `Sidebar.test.tsx`/`SidebarItem.test.tsx` (order-by-label, no index).
- [ ] T031 [P] [US4] Add the yellow row border: `AppointmentTable.tsx` and `PropertyTable.tsx` pass `rowClassName={(r) => r.hasUnseenIssues ? 'border-l-4 border-l-warning' : undefined}` (the existing `warning` design token, same as the sidebar dot — no raw hex); update their tests.
- [ ] T032 [US4] Add the "With issues" filter to the appointment list: `withIssues` in `APPOINTMENT_FILTER_SCHEMA` + `AppointmentFiltersState`/`DEFAULT_FILTERS` (types/index.ts) + `toAppointmentListParams` (`withIssues: filters.withIssues ? 'true' : undefined`); render `FilterBoolean "With issues"` in `AppointmentFilters.tsx`; decide board `hiddenFilters`. Update `useAppointmentList`/filters tests.
- [ ] T033 [US4] Add the "With issues" filter to the property list: `withIssues` in the `FILTER_SCHEMA` + `PropertyFiltersState`/`DEFAULT_FILTERS` + params in `usePropertyList.ts`; render `FilterBoolean` (import from `@/components/filters/FilterBoolean`) in `PropertyFilters.tsx`. Update tests.

**Checkpoint**: Indicators light/clear correctly for AM/OP/CL_ADMIN; filter works for all list-viewing roles.

---

## Phase 7: User Story 5 — Configure file rules in Platform settings (Priority: P3)

**Goal**: A Files section editing the `propertyFiles` key.

**Independent test**: With `GET/PUT /v1/platform-settings/propertyFiles` stubbed, edit and save a value and confirm round-trip.

- [ ] T034 [US5] Write `features/platform-settings/components/PropertyFilesSettingsSection.test.tsx` then implement `PropertyFilesSettingsSection.tsx`: `usePlatformSetting('propertyFiles')`; form for the 6 fields (checkbox groups for `allowedMimes`/`issueImageMimes`; `NumberInput` for `maxFileSizeMb` 5–200, `maxPhotosPerIssue` 1–20, `deletedRetentionDays` 30–3650; "keep forever" toggle + number for `retentionDays`); client bounds from `propertyFilesSettingSchema`; server field errors; `onDirtyChange`; loading/error (403 message)/default-pill/last-changed-by states (F03-4 skeleton).
- [ ] T035 [US5] Render the section on `apps/web/src/features/platform-settings/pages/PlatformSettingsPage.tsx` with a new `propertyFilesDirty` state ORed into the page dirty flag (discard confirm). Update `PlatformSettingsPage.test.tsx`.

**Checkpoint**: Config round-trips; discard-changes prompt covers the new section.

---

## Phase 8: Polish & cross-cutting (E2E, stubs, docs, gates)

- [ ] T036 Add default hermetic stubs so shell/detail-loading specs stay green: in `apps/web/tests/e2e/helpers.ts` add a default `**/v1/property-issues/unseen-count` stub and default `**/v1/property-files?**` / `**/v1/property-issues?**` list stubs; add a `**/v1/platform-settings/propertyFiles` stub to `platform-settings.spec.ts` and `route-weights.spec.ts`.
- [ ] T037 Write the hermetic Playwright spec `apps/web/tests/e2e/property-files.spec.ts`: row with `hasUnseenIssues:true` → yellow border + sidebar dot → **Mark as seen** (stubbed) → border + dot clear; property panel renders "Appointment #{code}" + **Open appointment** (C.A1 web side); "With issues" filter sends `withIssues=true`.
- [ ] T038 [P] Add a privacy/guard test asserting no raw user id or storage key appears in the rendered Files panel / issue card DOM (regex guard), across AM and CL_ADMIN fixtures.
- [ ] T039 [P] Verify CL_USER read-only: a component test proving no upload/new-version/delete/create-issue/mark-seen controls render for CL_USER and no unseen-count query fires (gated).
- [ ] T040 Update `apps/web/CLAUDE.md`: record the `features/property-files/` panel, the `SidebarItemBadge` primitive, the `DataTable.rowClassName` prop, the "With issues" filter, and the Platform settings Files section (project rule §13.11). (Root CLAUDE.md already updated.)
- [ ] T041 Run gates inside the worktree (via a subagent returning a condensed summary): `pnpm --filter web typecheck`, `pnpm --filter web lint` (`--max-warnings 0`), `pnpm --filter web test`, `pnpm --filter web test:e2e`. Fix any failure and re-run until green.

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)** block everything.
- **US1 (P1)** depends on Phase 2. **US2 (P1)** depends on US1's card/subtab (T011/T012) + Phase 2 upload hook. **US3 (P2)** depends on US1's issue card/subtab (T013/T014). **US4 (P2)** depends on US3 (needs issues to indicate) + the list/sidebar primitives. **US5 (P3)** is independent of US1–US4 (platform-settings only) and may proceed any time after Setup.
- **Polish (Phase 8)** runs after the stories it tests; T041 is last.
- MVP = Setup + Foundational + **US1** (+ US2 to satisfy contract C). US3/US4 deliver the additive; US5 is config.

## Parallel Opportunities

- Phase 1: T002, T003, T004, T005 in parallel.
- Phase 2: T006, T007, T008, T010 in parallel (T009 before T010).
- US1: T011, T012, T013 in parallel; then T014, T015; then T016, T017.
- US2: T018, T019, T020 in parallel; then T021.
- US3: T022, T023, T024 in parallel; then T025, T026.
- US4: T027, T028, T029 in parallel; then T030, T031 (T031 after T028); T032, T033 in parallel.
- US5 (T034→T035) can run in parallel with US1–US4 after Setup.
- Polish: T038, T039 in parallel after their stories.

## Notes

- Single developer; `[P]` marks file-disjoint tasks that could be batched, not a mandate to parallelize.
- Keep the PR under 150 files. No `pnpm generate:api`; no backend/schema/`api-types.ts` change.
- Every data view ships loading/empty/error/no-permission + 503 states. English only; Tailwind tokens; `jsx-a11y` clean.
