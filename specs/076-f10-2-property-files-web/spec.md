# Feature Specification: Property Files & Issues — Web (F10-2)

**Feature Branch**: `076-f10-2-property-files-web`  
**Created**: 2026-11-07  
**Status**: Draft  
**Input**: User description: "Web UI for property files and issues: a reusable Files panel (subtabs Issues/Documents/Reports/Other) on appointment and property detail, unseen-issue indicators (sidebar dot, row border, With issues filter), Platform settings Files section, consuming the merged F10-1 backend contract"

## Context

This is the **web-only** slice of feature F10 (property-centred file repository + issue log, contract **C.1–C.9** plus the approved "Issues" additive). It consumes the **already-merged F10-1 backend + shared contract** (PR #1351, `develop` @ `ebf1b8e7`): the `/v1/property-files/*` and `/v1/property-issues/*` routes, the `hasUnseenIssues`/`fileCounts` payload fields, the `withIssues` list filter, the `propertyFiles` PlatformSetting key, and the `property_file.*`/`property_issue.*` role-matrix actions — all present in `packages/shared/src/api-types.ts`.

**This task adds NO backend, schema, Prisma, or `api-types.ts` change.** It does not run `pnpm generate:api` (TASK-F10-4 is the only F10 task that regenerates the contract). All multi-tenant isolation (cross-tenant → **404**), INSP T-1 visibility and CL_USER read-only enforcement live in the F10-1 backend; the web layer only renders what the contract returns and gates actions by the shared role-matrix.

Depends on: **TASK-F10-1** (functional). **X01** is an ordering dependency only (merge after X01 to avoid a `Sidebar.tsx` conflict; X01 ships the canonical nav order but **no** per-item badge — this task introduces the `SidebarItemBadge` primitive, D-X01).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and download a property's files on appointment and property detail (Priority: P1)

An operator or agency user opens an appointment (or a property) and sees a **Files** tab. The tab opens on the **Issues** subtab by default and offers **Documents**, **Reports** and **Other** subtabs, each with a count. They search a subtab by file name, preview an image inline, open a PDF in a new tab, and download any file. From the appointment they jump to the property's whole file set; from the property they see which appointment each item belongs to and jump to it.

**Why this priority**: This is the core of contract C (organisation by service and property, search, view and download, counts on the record — C.4, C.5, C.9). Without it there is no file repository; everything else decorates it.

**Independent Test**: With the file/issue list endpoints stubbed, open an appointment and a property detail, confirm the Files tab, the four counted subtabs, name search, image preview, PDF-in-new-tab, per-file download, and the cross-navigation buttons work — delivering the viewable repository on its own.

**Acceptance Scenarios**:

1. **Given** an appointment with files of several types, **When** the user opens its **Files** tab, **Then** the **Issues** subtab is active by default and each subtab shows its count ("Issues (n)", "Documents (n)", "Reports (n)", "Other (n)"), matching the detail payload's `fileCounts`.
2. **(C.A1)** **Given** a file of any type uploaded against an appointment, **When** the user views the appointment's Files tab **and** the correct property's Files tab, **Then** the file appears in the same subtab on both, and on the property side it shows the appointment reference ("Appointment #{code}") and an **Open appointment** button.
3. **Given** the Files tab on an appointment, **When** the user clicks **View all property files**, **Then** the property's Files tab opens in the same browser tab on the same subtab; on the Issues subtab the equivalent action is **View all property issues**.
4. **Given** any file or issue photo, **When** the user clicks **Open**, **Then** a fresh signed URL opens in a new tab (the browser previews images and PDFs inline there); **Given** a HEIC image, **Then** the card shows a generic file icon and opening it downloads the file (D13).
5. **Given** a file name search term, **When** typed in the active subtab, **Then** only files whose name matches remain, scoped to that subtab.
6. **Given** a user without `property_file.read`, **When** they open the detail, **Then** no Files tab is shown.
7. **Given** the storage service is unavailable (HTTP 503 / `STORAGE_NOT_CONFIGURED`), **When** the user opens the Files tab or attempts a download, **Then** the standard `FILE_STORAGE_UNAVAILABLE_MESSAGE` is shown instead of a broken screen (D16).

---

### User Story 2 - Upload documents, version them, and delete files (Priority: P1)

An operator or agency admin uploads a Document, Report or Other file from the active subtab (optionally picking one of the property's appointments when uploading from the property). They add a **New version** of an existing file and browse prior versions in a **Versions** drawer, downloading each. Operators delete a file (soft delete) with a confirmation.

**Why this priority**: Upload, versioning and controlled deletion are the remaining core of contract C (C.2 formats/size, C.6 versioning, C.7 audit, C.A3, C.A5).

**Independent Test**: With presign/confirm/version/delete stubbed, upload a file, add a new version, open the Versions drawer and download both versions, and delete a file — each independently exercisable.

**Acceptance Scenarios**:

1. **Given** the Documents subtab, **When** the user uploads a file, **Then** the client presigns (`POST /v1/property-files/presign`), PUTs the bytes to the signed URL with `Content-Type` equal to the declared `mime`, confirms (`POST /v1/property-files/confirm` with an `Idempotency-Key`), and the file appears as READY in the list.
2. **(C.A5)** **Given** a file whose format or size is outside the configured limits, **When** the user tries to upload it, **Then** the rejection from presign **or** confirm is surfaced as a clear message in the UI (not a raw error or broken state).
3. **(C.A3)** **Given** an existing file, **When** the user picks **New version** and uploads, **Then** the previous version is preserved and the **Versions** drawer lists and downloads both the previous and the new version; the card shows "v{n}".
4. **Given** uploading from the property (not an appointment), **When** the user opens the upload control, **Then** they may optionally select one of that property's appointments to link the file to; leaving it blank uploads a property-only file.
5. **Given** an operator (`property_file.delete`: AM/OP), **When** they delete a file, **Then** a `ConfirmDialog` appears, the row is removed optimistically on confirm, and a failure restores it with an error message.
6. **Given** a user without `property_file.upload` (e.g. CL_USER), **When** they view a subtab, **Then** no upload/new-version/delete controls are shown (read-only).

---

### User Story 3 - Report and resolve property issues (Priority: P2)

An operator or agency admin reports an **issue** against an appointment or property: a required reason plus optional photos. Each issue is shown as a card with its reason, origin badge (Inspector / Staff / Tenant), date, photo grid and a seen status. Those who may (AM/OP/CL_ADMIN) mark an issue **as seen**, which records who and when and clears the indicators for everyone.

**Why this priority**: Issues are the approved additive — the reason a file repository becomes an operational signal. It builds on the panel (US1) and the upload flow (US2).

**Independent Test**: With the create-issue, list-issues and mark-seen endpoints stubbed, create an issue with a reason and one photo, see it appear on the Issues subtab, and mark it as seen — fully exercisable on its own.

**Acceptance Scenarios**:

1. **Given** the Issues subtab and `property_issue.create` (AM/OP/CL_ADMIN), **When** the user opens the create-issue drawer, enters a reason (1–1000 chars) and selects photos, **Then** each photo is uploaded one at a time (presign → PUT → confirm), per-photo progress/failure is shown, and the issue is created (`POST /v1/property-issues` with an `Idempotency-Key`, carrying only the confirmed photos' ids) **only** when all intended photos are confirmed or the user removes the failed ones (D12/D20).
2. **Given** an issue card, **When** rendered, **Then** it shows the reason, an origin badge ("Inspector"/"Staff"/"Tenant" from `source`), the created date/time, the photo grid, and either "Seen · {date}" or a **Mark as seen** action (AM/OP/CL_ADMIN); an issue with no visible photos shows "No photos" (the D27 retention-removed label is not derivable from the contract — A9).
3. **Given** an unseen issue and a privileged viewer, **When** they click **Mark as seen**, **Then** the call is made and the card flips to a seen state; a concurrent second click is idempotent (no overwrite of who marked it) and does not error.
4. **Given** an issue reason left empty, **When** the user tries to submit, **Then** submission is blocked with a validation message and no request is sent.
5. **Given** a photo with a disallowed type, **When** selected, **Then** it is rejected with a clear message and the other photos are unaffected.

---

### User Story 4 - See and filter unseen issues at a glance (Priority: P2)

Operators and agency admins see a small yellow dot on the sidebar icons when there are unseen issues, a yellow border on list rows that have an unseen issue, and can filter either list to only records that have an issue.

**Why this priority**: The indicators turn issues into a workflow ("someone needs to look"). They depend on the issue data (US3) and the unseen-count endpoint.

**Independent Test**: With `GET /v1/property-issues/unseen-count` and the two list endpoints stubbed, confirm the sidebar dots, the row border driven by `hasUnseenIssues`, and the "With issues" filter param — independently.

**Acceptance Scenarios**:

1. **Given** unseen issues linked to appointments, **When** an AM/OP/CL_ADMIN loads the shell, **Then** a yellow dot appears on the **Map** sidebar item (the appointments surface; see Assumptions) with an accessible label "N unseen issues"; unseen issues **without** an appointment light the dot on **Properties**.
2. **Given** a list row whose record has an unseen issue (`hasUnseenIssues: true`), **When** the list renders, **Then** that row shows a yellow left border; marking the issue seen removes the border on refresh (the mark-seen mutation invalidates the list and unseen-count queries).
3. **Given** the appointment list and the property list, **When** the user toggles the **With issues** filter, **Then** the request carries `withIssues=true` and only records with a non-deleted issue are returned.
4. **Given** a CL_USER or INSP (no `property_issue.unseen_count`), **When** the shell loads, **Then** no unseen-count request is made and no dots/borders appear (`hasUnseenIssues` is `false` for them).

---

### User Story 5 - Configure file rules in Platform settings (Priority: P3)

A platform operator adjusts the allowed MIME types, max file size, issue image MIME set, max photos per issue, and the two retention windows in a **Files** section of the existing Platform settings page.

**Why this priority**: Configuration (C.2 formats/size, C.8 retention) is real but low-frequency; the page and the generic hook already exist from F03-4, so this is a small addition.

**Independent Test**: With `GET/PUT /v1/platform-settings/propertyFiles` stubbed, open Platform settings, change a value, save, and confirm the value round-trips — independently.

**Acceptance Scenarios**:

1. **Given** AM/OP on the Platform settings page, **When** they open the **Files** section, **Then** the six `propertyFiles` fields load from `usePlatformSetting('propertyFiles')` with their current/default values.
2. **Given** an edited value within bounds (maxFileSizeMb 5–200, maxPhotosPerIssue 1–20, retentionDays ≥ 1 or "keep forever", deletedRetentionDays 30–3650, at least one allowed MIME, at least one issue image MIME), **When** the user saves, **Then** the value is PUT and the section reflects "last changed by … on …".
3. **Given** an out-of-bounds value, **When** the user edits it, **Then** a field validation message blocks saving; a server-side field error is surfaced on the field.
4. **Given** the section is dirty and the user leaves, **When** navigating away, **Then** the existing "Discard changes?" confirm fires (via the page's shared dirty tracking).

---

### Edge Cases

- **HEIC preview**: accepted on upload; when the browser cannot render it, show a generic icon + download (D13), never a broken `<img>`.
- **Partial photo upload**: if some photos fail, the confirmed ones are kept; the issue is not created until all intended photos confirm or the user removes the failed ones (D12). No offline queue, no auto-retry.
- **Storage 503**: every file action (list, upload, confirm, download, version) that returns 503/`STORAGE_NOT_CONFIGURED` shows `FILE_STORAGE_UNAVAILABLE_MESSAGE`.
- **Cross-tenant / missing file** (C.A2): the backend returns 404; the web shows a not-found/empty state, never revealing the file exists.
- **Empty subtab**: a subtab with no files shows an empty state; the active subtab still allows upload when permitted.
- **Idempotency replay**: a confirm or create-issue retried after a timeout reuses the same `Idempotency-Key` for that attempt (stable key manager) so it does not duplicate.
- **Author/seen identity**: the contract returns only user **ids**, no names; the UI never renders a raw id (see Assumptions) and shows the source label plus, for "seen", the timestamp (and "by you" when the viewer is the one who marked it).
- **Unseen-count performance**: the count query uses `staleTime` ≈ 60 s and is invalidated when an issue is marked seen, so it does not refetch on every screen.
- **Board view**: the appointment board/export share the appointment filter schema; the new `withIssues` filter must not break them (decide visibility there).

## Requirements *(mandatory)*

### Functional Requirements

**Reusable Files panel (US1)**

- **FR-001**: The system MUST provide one reusable Files panel component used on both the appointment detail and the property detail, with a **Files** tab containing subtabs **Issues** (default), **Documents**, **Reports**, **Other**, each showing a count.
- **FR-002**: Subtab count badges MUST reflect what the subtab shows: the **Issues** badge = the number of issues (issues-list length); **Documents/Reports/Other** badges = the number of distinct files (one per `versionGroupId`) of that type. These are derived client-side from the loaded issues + files, because the backend `GET /v1/property-files` returns every version as its own row and `fileCounts` counts raw rows (so `fileCounts.issues` counts issue *photos*, not issues, and the type counts are version-inflated — see Assumption A10). The Files tab label MUST show the sum of the subtab badges.
- **FR-003**: Each subtab MUST support case-insensitive search by file name, scoped to the active subtab, using the existing debounced `FilterInput` (no new search primitive).
- **FR-004**: A Document/Report/Other card MUST show the file name, a type badge, the date, size, "v{n}", and an **Open** action that fetches a fresh 5-minute signed URL (`GET /v1/property-files/{id}/download`) and opens the file in a new tab — where the browser previews images and PDFs inline and downloads HEIC/non-renderable types (D13). Eager inline thumbnails are out of scope (A11).
- **FR-005**: The appointment Files tab MUST offer **View all property files** (navigates, same browser tab, to the property's Files tab on the same subtab) and, on the Issues subtab, **View all property issues**. The property Files tab MUST show, for every item linked to an appointment, the appointment reference ("Appointment #{code}") and an **Open appointment** action. Because the file/issue DTOs carry only `appointmentId` (not the appointment code), the property-context panel MUST resolve `appointmentId → code` by reusing the property's appointments query (the same data the property's Appointments tab loads); if a linked appointment is not in that set, it MUST fall back to a plain **Open appointment** link (by id, never showing the raw id).
- **FR-006**: The Files tab MUST only be shown to roles with `property_file.read` (AM/OP/CL_ADMIN/CL_USER). All action controls MUST be gated by the shared role-matrix via `usePermissions().canPerform(...)` (hidden, not disabled).

**Upload, versioning, deletion (US2)**

- **FR-007**: Authorized users (`property_file.upload`: AM/OP/CL_ADMIN) MUST be able to upload a Document/Report/Other file from the active subtab via presign → PUT (with `Content-Type` = declared mime, a 60 s abort timeout) → confirm (`Idempotency-Key`), reusing the existing presign→PUT→confirm pattern (`useInspectorDocumentUpload`).
- **FR-008**: When uploading from the property surface, the user MUST be able to optionally select one of that property's appointments to link the file to.
- **FR-009**: The client MUST hint the file picker with an `accept` set derived from the shared `DEFAULT_PROPERTY_FILES_SETTING` (full set for Document/Report/Other; image set for issue photos), while treating the server presign/confirm rejection as the authority for the clear error message (C.A5).
- **FR-010**: Authorized users (`property_file.version`: AM/OP/CL_ADMIN) MUST be able to add a **New version** of a file (`POST /v1/property-files/{id}/versions` → presign → PUT → confirm) and browse/download every version in a **Versions** drawer; the previous version MUST remain accessible (C.A3).
- **FR-011**: Operators (`property_file.delete`: AM/OP) MUST be able to delete a file (`DELETE /v1/property-files/{id}`) behind a `ConfirmDialog`, applied optimistically with rollback + error message on failure.

**Issues (US3)**

- **FR-012**: Authorized users (`property_issue.create`: AM/OP/CL_ADMIN) MUST be able to create an issue from the Issues subtab via a drawer: a required reason (1–1000 chars) and optional photos, uploading each photo one at a time (presign → PUT → confirm) with per-photo progress/failure, then `POST /v1/property-issues` (`Idempotency-Key`) carrying only the confirmed photo ids — created only when all intended photos are confirmed or the failed ones removed.
- **FR-013**: The issue card MUST show the reason, an origin badge from `source` (INSPECTOR → "Inspector", STAFF → "Staff", RENTAL_TENANT_PORTAL → "Tenant"), the created date/time (Sydney wall-clock via the shared date helpers), the photo grid (each tile a file icon with an **Open** action that opens the signed URL in a new tab — browser previews on open, A11), and a seen state: "Seen · {date}" (+ "by you" when the viewer marked it) or a **Mark as seen** action for AM/OP/CL_ADMIN. An issue with no visible photos MUST show "No photos". (The D27 "Photo removed (retention)" state is **not** derivable from the F10-1 contract — purged photos are excluded from the list with no count/flag — and is out of F10-2 scope; see Assumption A9.)
- **FR-014**: Marking an issue as seen (`POST /v1/property-issues/{id}/seen`, `property_issue.mark_seen`: AM/OP/CL_ADMIN) MUST be idempotent in the UI (a second click does not overwrite who/when and shows no error) and MUST invalidate the issue list, the affected appointment/property lists, and the unseen-count query.
- **FR-015**: Operators (`property_issue.delete`: AM/OP) MUST be able to delete an issue (and its photos) behind a `ConfirmDialog`.

**Indicators & filters (US4)**

- **FR-016**: For AM/OP/CL_ADMIN only (`property_issue.unseen_count`), the shell MUST query `GET /v1/property-issues/unseen-count` with `staleTime` ≈ 60 s and render a yellow `SidebarItemBadge` dot on the **Map** item when `appointmentsWithUnseenIssues > 0` and on the **Properties** item when `propertiesWithUnseenIssues > 0`, each with an accessible label "N unseen issues". No query is issued for roles lacking the action.
- **FR-017**: Appointment and property list rows MUST show a yellow left border when `hasUnseenIssues` is `true`, via a new optional `rowClassName?: (row) => string | undefined` prop on the shared `DataTable` (applied to both desktop row and mobile card).
- **FR-018**: Both lists MUST expose a **With issues** boolean filter (`FilterBoolean`) wired to the `withIssues` query param, added to each list's filter schema, state, defaults and params builder (mirroring the F01-2 `missingBaseAddress` precedent).
- **FR-019**: The web `Appointment` and `Property` feature types MUST carry optional `hasUnseenIssues?: boolean` and `fileCounts?` fields (already present in `api-types.ts`).

**Platform settings (US5)**

- **FR-020**: A new `PropertyFilesSettingsSection` in `features/platform-settings/` MUST edit the six `propertyFiles` fields via the existing generic `usePlatformSetting('propertyFiles')` hook, enforce the shared schema bounds client-side, surface server field errors, and participate in the page's dirty tracking / discard confirm. It MUST be rendered on the existing `PlatformSettingsPage` (AM/OP). No change to the generic hook or page plumbing beyond adding the section + its dirty flag.

**Cross-cutting**

- **FR-021**: Every data view (panel, subtabs, settings section) MUST render loading, empty, error and no-permission states, and MUST show `FILE_STORAGE_UNAVAILABLE_MESSAGE` on 503/`STORAGE_NOT_CONFIGURED`.
- **FR-022**: The UI MUST NOT render any raw user id or storage key; author identity is shown as the source label (see Assumptions).
- **FR-023**: React Query keys MUST be domain-prefixed and nested so a parent invalidation refreshes children (e.g. `['property-files', propertyId|appointmentId, ...]`, `['property-issues', ...]`, `['property-issues','unseen-count']`); all derived values returned from hooks MUST be referentially stable (`useMemo`).
- **FR-024**: This task MUST NOT modify the backend, Prisma schema, `openapi.json` or `api-types.ts`, and MUST NOT run `pnpm generate:api`. It MUST update `apps/web/CLAUDE.md` to record the new feature, the `SidebarItemBadge` primitive and the `DataTable.rowClassName` prop.
- **FR-025**: The existing dashboard screens MUST NOT be altered.

### Key Entities *(consumed from the F10-1 contract; no new entity defined here)*

- **PropertyFile** (`propertyFileResponseSchema`): id, propertyId, appointmentId?, issueId?, type (ISSUE/DOCUMENT/REPORT/OTHER), versionGroupId, version, fileName, mime, sizeBytes, status (PENDING/READY), uploadedByUserId?, createdAt. **Tenant-scoped** (carries `tenant_id` server-side, D5).
- **PropertyIssue** (`propertyIssueResponseSchema`): id, propertyId, appointmentId?, reason, source, createdByUserId?, cantDoEventId?, seenAt?, seenByUserId?, createdAt, photos (PropertyFile[]). **Tenant-scoped**.
- **FileCounts**: { total, issues, documents, reports, other } — on appointment/property detail payloads.
- **UnseenIssueCount**: { appointmentsWithUnseenIssues, propertiesWithUnseenIssues } — drives the sidebar dots.
- **PropertyFilesSetting**: { allowedMimes, maxFileSizeMb, issueImageMimes, maxPhotosPerIssue, retentionDays|null, deletedRetentionDays } — the `propertyFiles` **platform-scoped** PlatformSetting key (read/written only by AM/OP through the existing generic hook).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (C.A1)**: A file uploaded against an appointment appears in both the appointment's and the correct property's Files tab, under the same subtab, with the appointment reference visible on the property side.
- **SC-002 (C.A3)**: Adding a new version preserves the previous version; both can be downloaded from the Versions drawer.
- **SC-003 (C.A5)**: A file whose format or size is outside the configured limits is rejected with a clear, human-readable message surfaced in the UI (from presign or confirm), with no broken state.
- **SC-004**: An unseen issue lights the correct sidebar dot and the matching row border; marking it as seen clears both for AM/OP/CL_ADMIN viewers within one refresh cycle, and recording who/when is not overwritten by a concurrent mark.
- **SC-005**: The "With issues" filter returns only appointments/properties that have a (non-deleted) issue.
- **SC-006**: A storage-unavailable response (503) shows the standard message on every file surface, never a broken screen.
- **SC-007**: No raw user id or storage key is ever shown in the UI; issue/file author is conveyed by the source label.
- **SC-008**: CL_USER and INSP never trigger the unseen-count request and never see dots or row borders.

## Assumptions

- **A1 (appointment indicator target)**: There is **no "Appointments" sidebar item** — appointments are reached via the **Map** item (`/map`), with the list as a "List view" toggle. The appointment unseen-issues dot therefore attaches to **Map**; the property dot attaches to **Properties**. (Documented premise for the plan's "Appointments icon" wording; flagged to the coordinator for veto.)
- **A2 (author display)**: The F10-1 file/issue DTOs carry only user **ids** (no names), and resolving ids → names client-side is not tenant-safe across AM/OP/CL and is out of F10-2 scope (the contract is merged; only F10-4 regenerates it). Per the plan's "build the minimal reading" rule, author is shown as the **source label** (Inspector/Staff/Tenant) and "seen" as a timestamp (+ "by you"); no raw id is rendered (project rule: no raw ids in UI).
- **A3 (client MIME hint)**: CL roles cannot read the `propertyFiles` PlatformSetting (AM/OP-only). The client uses the shared `DEFAULT_PROPERTY_FILES_SETTING` MIME lists only as a file-picker `accept` hint; the server (presign/confirm) is the authority for acceptance and the clear rejection message (C.A5).
- **A4 (filter vs. indicators scope)**: The `withIssues` list filter is role-agnostic in the backend ("has any non-deleted issue") and is offered to every list-viewing role; the row border and sidebar dots track **unseen** issues and appear only for AM/OP/CL_ADMIN (`hasUnseenIssues` is `false` otherwise).
- **A5 (shared component changes are additive)**: `DataTable` gains an optional `rowClassName`; `SidebarItem`/`NavItem` gain an optional `badge`; a new `SidebarItemBadge` primitive is added to `components/`. All are additive and must not change existing call sites' behaviour.
- **A6 (multi-tenant)**: F10 introduces no platform-scoped data entity here — `property_files`/`property_issues` are **tenant-scoped** (D5), and isolation (cross-tenant → 404), INSP T-1 visibility and CL_USER read-only are enforced by the F10-1 backend. The only platform-scoped surface touched is the `propertyFiles` PlatformSetting, read/written exclusively by AM/OP via the existing generic hook. No pending global decision (Q2/Q4/Q6/Q12) affects this web-only task.
- **A7 (contract reuse)**: All 10 F10 routes and the `hasUnseenIssues`/`fileCounts`/`withIssues` fields are already in `api-types.ts`; this task consumes them and does not regenerate the contract.
- **A8 (testing)**: Per the root CLAUDE.md §11, Playwright suites are hermetic (all API calls stubbed); there is no real cross-surface E2E. Proof is Vitest/RTL unit/component tests plus per-surface hermetic Playwright specs. Existing shell-loading specs must stub the new unseen-count endpoint to stay hermetic.
- **A9 (retention-removed photo label)**: D27's "Photo removed (retention)" issue-card state is **not** implementable from the F10-1 web contract — the list endpoints exclude purged photos entirely (no count or flag), so the web cannot distinguish "never had photos" from "all photos purged". The card shows "No photos" for both. Surfacing the retention-removed state would need the backend to return a purged-photo count (out of F10-2 scope; the contract is merged and only F10-4 regenerates it). Flagged to the coordinator.
- **A10 (versions & counts derived client-side)**: `GET /v1/property-files` returns **every version** of a file as its own READY row (no latest-per-group dedup) and has no dedicated "list versions" route; its `counts`/the detail `fileCounts` count raw rows (versions inflate them; the ISSUE count is issue photos, not issues). So the web loads the issues list + the full files list once per panel and derives everything client-side: Document/Report/Other subtabs show **one card per `versionGroupId`** (the max version), the **Versions** drawer filters the loaded rows by `versionGroupId` (every version downloadable, satisfying C.A3 without a new endpoint), and subtab badges count distinct files/issues (not raw rows). The backend `fileCounts` is therefore not used for display.
- **A11 (open-on-demand, no eager thumbnails)**: The list carries no thumbnail or file URL — only the on-demand 5-minute signed URL from `GET /v1/property-files/{id}/download`. Eager inline `<img>` thumbnails would require N short-lived signed-URL fetches per render. So files and issue photos render as icon tiles with an **Open** action that mints a fresh signed URL and opens the file in a new tab, where the browser previews images/PDFs inline and downloads HEIC/non-renderable types (D13). This satisfies "view and download" (C.4) without the signed-URL storm.
