# Feature Specification: PWA — Property Files, Report Issue & Photos on "Can't do this job"

**Feature Branch**: `077-f10-3-property-files-pwa`
**Created**: 2026-11-07
**Status**: Draft
**Input**: TASK-F10-3 (`fase2-etapa1/tarefas/F10-tarefas.md`) — the PWA slice of feature F10 (property files & issues). Contract C.1–C.9 (criteria C.A1–C.A5) **+ the "Issues" addendum**, approved by the client on 2026-10-30.

## Context & Scope boundary

This is the **inspector PWA** slice of F10. The backend + shared foundation (TASK-F10-1, merged to `develop` as `ebf1b8e7`) already provides every table, use case, route, Zod schema, shared constant and the generated OpenAPI contract this feature consumes. The web slice (TASK-F10-2) and portal slice (TASK-F10-4) are built in parallel on disjoint files.

**In scope (PWA only):**

1. A read-only **"Files" section** in the inspector's service (appointment) detail, with type subtabs (**Issues** first, then Documents, Reports, Other), download of each file, and per-type counts.
2. A **"Report issue"** flow (online-only): reason + optional photos, uploaded one photo at a time with per-photo progress and failure, then an issue is created.
3. **Optional photos** added to the existing **"Can't do this job"** sheet (from F03-3): when photos are present, declining the job also creates an issue.

**Explicitly OUT of scope for this slice** (owned by other F10 tasks, do not build here):

- Any backend, Prisma schema, migration, or `openapi.json`/`api-types.ts` change. This slice consumes the **already-committed** F10-1 contract unchanged (only TASK-F10-4 regenerates `api-types.ts`, per decision D19).
- Document/Report/Other **upload**, **"New version"**, file **deletion**, **"Mark as seen"** — these are AM/OP/CL_ADMIN actions on the web (TASK-F10-2). The inspector only reads these types and creates **issues**.
- Sidebar unseen-issue indicators, the "With issues" list filter, and the web Files panel (TASK-F10-2).
- Tenant-portal issue reporting (TASK-F10-4).
- Platform-settings editing (web, TASK-F10-2) — the PWA only *reads* the effective limits returned by the backend.
- Search-by-name inside a subtab (C.5 search is a web-only affordance in this phase; the PWA satisfies C.5 only through the per-type subtab organization).
- Offline queueing of file reads or photo uploads. Everything in this slice **requires a connection** (decision D12/task: "no offline queue").

## Multi-tenant note (root CLAUDE.md §7.1)

`PropertyFile` and `PropertyIssue` **are tenant-scoped** (they carry `tenant_id` via the property and, when applicable, the appointment — decision **D5**). They are **not** a platform-scoped exception. Scope is enforced entirely by the already-merged backend: an inspector reads/creates only through the **existing inspector↔appointment visibility predicate** (decision **D28**, respecting the T-1 assignment window), never a loose "my inspector id" filter; a resource the actor may not see returns **404** (decision **D6**, criterion **C.A2**). This slice adds no new scope decision — it surfaces the backend's scoping and never weakens it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspector views the property's files for a job (Priority: P1)

An inspector opens a scheduled job and finds a **Files** section. It shows, read-only, every file attached to that appointment, grouped by type in subtabs with **Issues** open by default (the issues raised by staff, by other inspectors, and by the rental tenant through the portal), followed by **Documents**, **Reports** and **Other**. The inspector can open or download any file to reference it in the field (e.g. an access instruction PDF, a prior issue photo). Each subtab shows its count.

**Why this priority**: Reading context about the property is the foundation of the field experience and the minimum useful slice — it delivers value even before the inspector can create anything. It also exercises the list/download contract the other stories reuse.

**Independent Test**: Log in as an inspector, open a job whose appointment has files of each type, open the Files section, switch subtabs, and download a file — all with the API stubbed. Delivers value as a standalone read-only feature.

**Acceptance Scenarios**:

1. **Given** an appointment with issues, documents and reports, **When** the inspector opens the Files section, **Then** the **Issues** subtab is active by default and lists every issue on that appointment (including staff-, tenant-portal- and other-inspector-sourced issues) with its reason, origin and date, and each issue's photos are listed with a way to open/download them. (The author name is masked for the inspector by the backend — the card shows origin, not author.)
2. **Given** the inspector is in the Files section, **When** they switch to Documents, Reports or Other, **Then** each file is shown with its name and type and offers download (image preview inline where the browser can render it; PDF opens in a new tab) — **C.4**.
3. **Given** files of several types exist, **When** the section renders, **Then** each subtab shows its count and the section reflects the appointment's file counts — **C.9**.
4. **Given** the inspector is offline, **When** they open the Files section, **Then** it shows a clear "connect to load" message and does not crash or show stale file data (file reads are **not** cached offline — only the route schema ships in the SW; decision/task: "needs connection").
5. **Given** a file or issue the inspector is not permitted to see (e.g. another agency, or outside the T-1 visibility window), **When** the backend returns 404, **Then** the app surfaces an empty/not-available state gracefully without exposing that the resource exists — **C.A2**, **D28**.

---

### User Story 2 - Inspector reports an issue with photos (Priority: P2)

From the Issues subtab, the inspector taps **"Report issue"**, writes a required reason (1–1000 characters), optionally adds one or more photos from the camera or gallery, and submits. Photos upload **one at a time** with visible per-photo progress; if a photo fails, the already-uploaded photos are kept and the inspector can retry or remove the failed one. The issue is created only once all intended photos have uploaded (or the inspector removes the failed ones). The new issue then appears in the list. This flow is **online-only**.

**Why this priority**: This is the primary interactive value of the "Issues" addendum for the inspector — recording a field problem (independent of the job's status) with evidence. It depends on nothing in US3 and can be shipped on its own.

**Independent Test**: With presign/confirm/create-issue stubbed, open "Report issue", enter a reason, attach one photo, submit, and assert the create-issue call fires and the new issue appears in the list.

**Acceptance Scenarios**:

1. **Given** the Report-issue sheet is open with an empty reason, **When** the inspector tries to submit, **Then** submission is blocked and a validation message requires a reason (1–1000 characters).
2. **Given** a reason and two selected photos, **When** the inspector submits, **Then** each photo is uploaded individually (presign → upload to the signed URL → confirm) with its own progress indicator, and the issue is created with an idempotency key only after both photos are confirmed — decisions **D12**, **D24**.
3. **Given** two photos where the first confirms and the second fails, **When** the failure occurs, **Then** the first photo stays confirmed, the failed photo shows a clear error with retry/remove, and no issue is created until the inspector either retries successfully or removes the failed photo — **D12**.
4. **Given** a photo whose type or size is outside the configured limits, **When** the inspector adds/uploads it, **Then** it is refused with a clear message (surfaced from the presign/confirm rejection) and the issue is not blocked by it — **C.A5**.
5. **Given** file storage is not configured (backend 503), **When** the inspector attempts to add a photo or submit, **Then** the app shows the shared `FILE_STORAGE_UNAVAILABLE_MESSAGE` and no broken screen — decision **D16**.
6. **Given** the inspector is offline, **When** they open "Report issue", **Then** the flow is unavailable with a "requires connection" message (no offline queue, no auto-retry) — **D12**/task.
7. **Given** a reason with no photos, **When** the inspector submits, **Then** the issue is created with zero photos (the reason alone is the minimum record) and appears in the list — decision **D27** ("No photos").

---

### User Story 3 - Inspector attaches photos when declining a job (Priority: P3)

The existing **"Can't do this job"** sheet (F03-3) gains an optional **"Add photos"** section with the same one-at-a-time upload UX. When the inspector declines with photos attached, the app first records the decline (the field event / rejection, unchanged) and then, if there are confirmed photos, creates an issue tied to that appointment and to the decline event, with the issue's reason composed from the decline reason label plus the note. If the issue creation fails, the decline still stands.

**Why this priority**: It extends US2's photo-upload machinery onto an existing flow and is the smallest addition; it depends on US2 being in place. It must not regress the F03-3 decline behavior.

**Independent Test**: With the cant-do and create-issue calls stubbed, open "Can't do this job", pick a reason, attach a photo, submit, and assert the decline call fires first and then the create-issue call fires tied to the decline.

**Acceptance Scenarios**:

1. **Given** the Can't-do sheet with a reason selected and **no** photos, **When** the inspector submits, **Then** the decline behaves exactly as before F10-3 (no issue is created) — the F03-3 contract is preserved.
2. **Given** the Can't-do sheet with a reason and one or more confirmed photos, **When** the inspector submits, **Then** the decline is recorded first, and then an issue is created with source = INSPECTOR, the decline event reference, the appointment link, and a reason composed of the decline-reason label plus the note — decision **D18**.
3. **Given** photos are attached and the decline succeeds but the subsequent issue creation fails, **When** the error occurs, **Then** the decline is **not** reverted (the critical event is the decline); the failure is reported/logged, not surfaced as a decline failure — decision **D18**.
4. **Given** photos are being added in the Can't-do sheet, **When** a photo is uploaded, **Then** it uses the same per-photo presign → upload → confirm progress/failure UX as Report issue — **D12**.

---

### Edge Cases

- **Large phone photos on mobile data**: one photo at a time with progress; a single failure never loses already-confirmed photos (decision D12).
- **HEIC photos**: accepted for upload; where the browser cannot render a thumbnail, show a generic file affordance with download (decision D13).
- **Duplicate submit / retry after timeout**: create-issue and confirm-upload carry an `Idempotency-Key` so a mobile retry after a timeout does not duplicate the issue or file (decision D24).
- **Issue with zero photos**: valid; the card shows "No photos" (decision D27).
- **A photo purged by retention**: an issue photo removed by the backend retention job no longer appears; the issue itself remains (decision D27). The PWA simply shows whatever `READY` photos the backend returns.
- **Offline mid-flow**: if the connection drops during a photo upload or submit, the app reports the failure clearly; nothing is queued for later (online-only).
- **Visibility window (T-1)**: an inspector sees only files/issues for appointments within their assignment visibility; the backend enforces this and returns 404 otherwise (decision D28, C.A2).
- **Navigation away**: leaving the sheet mid-upload abandons in-progress uploads; any `PENDING` photos never linked to an issue are cleaned up by the backend retention sweep (decision D22) — the PWA takes no special action.

## Requirements *(mandatory)*

### Functional Requirements

**Files section (US1)**

- **FR-001**: The inspector service (appointment) detail MUST present a **Files** section listing the files attached to that appointment, grouped into subtabs ordered **Issues** (default/active), **Documents**, **Reports**, **Other**.
- **FR-002**: The Issues subtab MUST list all issues on the appointment regardless of origin (inspector, staff, rental-tenant portal), each showing reason, **origin** (badge) and date, with its photos individually openable/downloadable (**C.4**). The **author name is masked (null) for the inspector** by the backend, so the card shows origin, not author; mark-as-seen status is web-only and MUST NOT be shown.
- **FR-003**: Documents, Reports and Other MUST each offer per-file download; images preview inline where renderable and PDFs open in a new tab (**C.4**). HEIC files that cannot be previewed show a generic affordance + download (D13).
- **FR-004**: Each subtab MUST show its count, consistent with the appointment's file counts (**C.9**).
- **FR-005**: The Files section MUST be **read-only** for the inspector for Document/Report/Other types (no upload, no new version, no delete, no mark-as-seen).
- **FR-006**: File/issue reads MUST require a connection (not served from the offline data cache); offline, the section MUST show a clear "connect to load" state and never stale data. Only the route schema (not responses) is bundled in the service worker.
- **FR-007**: When the backend returns 404 for a file, issue or download the inspector may not access, the app MUST show a graceful empty/not-available state without revealing existence (**C.A2**, **D28**).

**Report issue (US2)**

- **FR-008**: The Issues subtab MUST offer a **"Report issue"** action opening a sheet with a required **reason** (1–1000 characters) and an optional **"Add photos"** affordance (camera or gallery).
- **FR-009**: Photos MUST upload **one at a time** (presign → upload to signed URL → confirm) with a per-photo progress indicator and a per-photo error state offering retry/remove; a single photo's failure MUST NOT discard already-confirmed photos (**D12**).
- **FR-010**: The issue MUST be created only after all intended photos are confirmed (or the failed ones removed), and the create request MUST carry an `Idempotency-Key` (**D24**). A zero-photo issue is valid (**D27**).
- **FR-011**: Photo type/size outside the configured limits MUST be refused with a clear message surfaced from the presign/confirm rejection, without blocking the rest of the flow (**C.A5**).
- **FR-012**: A backend 503 (storage not configured) MUST surface the shared `FILE_STORAGE_UNAVAILABLE_MESSAGE`, in both the add-photo and submit paths, with no broken screen (**D16**).
- **FR-013**: The Report-issue flow MUST be **online-only** — no offline queue, no automatic retry; offline, it is unavailable with a clear message (**D12**/task).
- **FR-014**: On successful creation, the new issue MUST appear in the Issues list (via cache update/invalidation).
- **FR-022**: "Report issue" is **status-independent** (decision D4 — an issue does not block or depend on the job's state): it is available in the Issues subtab whenever the Files section renders for an appointment the inspector can access. Availability follows backend access (the PWA does not add a status gate); a backend rejection surfaces per FR-007/FR-011/FR-012.

**Photos on "Can't do this job" (US3)**

- **FR-015**: The existing "Can't do this job" sheet (F03-3) MUST gain an optional "Add photos" section using the same per-photo upload UX as Report issue (**D12**).
- **FR-016**: On submit **without** photos, the decline MUST behave exactly as before (no issue created) — the F03-3 contract is preserved.
- **FR-017**: On submit **with** confirmed photos, the app MUST record the decline first, then create an issue (source = INSPECTOR) tied to the appointment and the decline event, with reason = decline-reason label + note (**D18**).
- **FR-018**: If issue creation fails after a successful decline, the decline MUST NOT be reverted; the failure is logged/reported, not surfaced as a decline failure (**D18**).

**Cross-cutting**

- **FR-019**: All user-facing text MUST be in English; the design system primitives (`Sheet`, `Segmented`, `Button`, `Alert`, etc.) and `cn()`/tokens MUST be used (no hand-built classNames, no hard-coded colours) — `check:ds` must pass.
- **FR-020**: No backend, schema, migration, `openapi.json` or `api-types.ts` change — this slice consumes the F10-1 contract and the shared constants/schemas unchanged.
- **FR-021**: Any new authenticated API call that fires on an existing screen's render (not only at boot) MUST register a safe default stub in the E2E `BASELINE_STUBS` in the same PR, so unrelated specs that render that screen stay quiet. The Files section fetches `GET /v1/property-files` and `GET /v1/property-issues` on every appointment-detail render, so both get empty-default `BASELINE_STUBS` prefix entries (a 501 is benign per the harness, but a default keeps the suite clean); the feature's own spec overrides them.

### Key Entities *(reference only — defined by F10-1, consumed here)*

- **PropertyFile**: a file attached to a property and, when possible, an appointment; type ∈ {ISSUE, DOCUMENT, REPORT, OTHER}; carries `tenant_id`. Only `READY` files are listed. The PWA reads and downloads; it uploads only ISSUE-type photos (via presign/confirm) as part of creating an issue.
- **PropertyIssue**: a reason + 0..N issue photos; `source` ∈ {INSPECTOR, STAFF, RENTAL_TENANT_PORTAL}; carries `tenant_id`; may reference a decline (`cant_do`) event. The PWA reads issues for the appointment and creates INSPECTOR-sourced issues.
- **Platform file settings** (`propertyFiles` key, defaults in shared `DEFAULT_PROPERTY_FILES_SETTING`): issue photos are restricted to `issueImageMimes` (images only: jpeg/png/heic/webp), bounded by `maxFileSizeMb` and `maxPhotosPerIssue` (default 10). The **backend is the authority** on these limits — it validates at presign, confirm and create and returns clear rejections (**C.A5**). The PWA uses the shared defaults only to pre-filter the file picker (`accept`) and as a soft guard, and never edits settings. The portal-only `PORTAL_MAX_PHOTOS_PER_ISSUE = 5` does **not** apply to the inspector path.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An inspector can open a job and view/download any file attached to that appointment, across all four type subtabs, without leaving the app.
- **SC-002**: An inspector can report an issue with a reason and at least one photo, and see it appear in the Issues list, in a single online session.
- **SC-003**: When one of several photos fails to upload, 100% of the already-confirmed photos are retained (none re-uploaded) and the inspector can finish by retrying or removing the failed one.
- **SC-004**: Declining a job with photos attached produces exactly one decline event and exactly one linked issue; a failure creating the issue leaves the decline intact (no orphaned/duplicated decline).
- **SC-005**: Every rejection (bad type/size, storage unavailable, not-permitted) produces a clear, specific message and never a blank or broken screen.
- **SC-006**: The PWA E2E suite proves, on **Chromium and WebKit**: (a) "Report issue" with 1 photo → the create-issue call fires and the issue appears in the (stubbed) list; (b) "Can't do" with a photo → the decline call fires and then the create-issue call fires. (task acceptance)
- **SC-007**: No regression to the F03-3 decline flow when no photos are attached (existing F03-3 tests stay green).

## Assumptions

- All F10 product decisions (D1–D29, D-X01) are **closed** (client answers 2026-10-30 + validation 2026-11-07); there are no open product questions for this slice, so no clarification premises are recorded.
- TASK-F10-1 is merged to `develop` (`ebf1b8e7`) and provides the inspector-reachable routes (`GET /v1/property-files`, `POST /v1/property-files/presign`, `POST /v1/property-files/confirm`, `GET /v1/property-files/:id/download`, `GET /v1/property-issues`, `POST /v1/property-issues`), the file-type/issue-source enums, the `FILE_STORAGE_UNAVAILABLE_MESSAGE` string, and the `DEFAULT_PROPERTY_FILES_SETTING` defaults. The exact request/response shapes are pinned in `plan.md`/`contracts/` from the committed `openapi.json`/`api-types.ts`. `PORTAL_MAX_PHOTOS_PER_ISSUE` and the storage-key builders are **portal/backend-only** and are not used by this slice.
- The inspector presign/confirm is limited by the backend to **ISSUE-type photos** (confirming a staff Document/Report/Other → 404); the PWA never attempts non-issue uploads. Issue photos stay `PENDING` after confirm and are flipped to `READY` + linked atomically when the issue is created (so photos must be uploaded while the appointment is still visible, then the issue created — for cant-do, the create-issue happens after the REJECTED transition using the returned `cantDoEventId`).
- The cant-do endpoint returns `{ eventId, appointmentStatus: 'REJECTED', … }`; `useReportCantDo` (F03-3) will be changed to surface `eventId` so US3 can link the issue via `cantDoEventId`.
- TASK-F03-3 is merged and owns `CantDoSheet`/`useReportCantDo`; this slice modifies that sheet additively.
- The PWA already has the HTTP client with `Idempotency-Key` support, a bottom `Sheet` primitive, a `Segmented` control, and React Query — all reused here; no new runtime dependency is expected.
- Photo uploads PUT directly to the storage signed URL returned by presign (plain `fetch`, `Content-Type: <mime>`), mirroring the existing `AvatarUploader` precedent; the browser `File`/`Blob` is sent as-is (the backend validates magic bytes + size on confirm).
