# Feature Specification: Property Files & Issues — Backend & Shared Foundation

**Feature Branch**: `075-f10-1-property-files-backend`  
**Created**: 2026-11-07  
**Status**: Draft  
**Input**: User description: "Backend and shared foundation for property files and property issues: the `PropertyIssue` + `PropertyFile` data model, file and issue use cases (presign → confirm → list → download → new version → delete; create issue, mark as seen, delete issue), unseen-issue counts, a `propertyFiles` key in `PlatformSetting`, a daily retention job, `hasUnseenIssues`/`fileCounts` on existing appointment/property payloads, and the role-matrix actions" (source: `fase2-etapa1/tarefas/F10-tarefas.md`, TASK-F10-1, and `fase2-etapa1/F10-anexos-midias.md`)

## Overview

This feature builds the backend (`apps/backend`) and shared-contract (`packages/shared`) foundation for the **property-centred file repository and issue log** (contract codes **C.1–C.9**, acceptance criteria **C.A1–C.A5**, plus the client-approved "Issues" additive, 2026-10-30). It is the first of four F10 tasks; TASK-F10-2 (web), TASK-F10-3 (PWA) and TASK-F10-4 (tenant portal) are pure consumers of the contract this task ships.

Every file belongs to a **property** (`property_id` + `tenant_id`) and, whenever possible, also to an **appointment** of that property. There are four file types — **Issue**, **Document**, **Report**, **Other** — surfaced as per-type sub-tabs. An **Issue** is a record of a problem: a mandatory reason plus zero or more photos (photos are `PropertyFile` rows of `type = ISSUE`). Issues can be raised by the inspector (PWA), by staff/agency (web) and by the rental tenant (portal); unseen issues drive yellow indicators in the web UI until Admin Master, Operator or Agency Admin **marks them as seen**.

The defining constraints of this task are: **tenant isolation that never leaks existence** (cross-tenant access returns **404, not 403** — C.A2); a **presign → confirm upload flow** where the real file size and real MIME are validated at confirm (the presign cannot enforce size), via `headObject` + `file-type` magic-byte sniffing (C.A5); a **relaxed CHECK constraint** so an issue photo can exist as a `PENDING` row before its issue row is created, with the issue-creation transaction linking the photos atomically (D20); and **idempotent, race-safe commands** — mark-as-seen is a compare-and-swap (D23) and version bumps rely on a `UNIQUE(version_group_id, version)` conflict + retry (D21/23505). Unlike the Phase-2 inspector entities, `PropertyIssue` and `PropertyFile` **are tenant-scoped** (they carry `tenant_id`, D5).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - File repository foundation (upload, retrieve, version, delete) (Priority: P1)

As Admin Master (AM), Operator (OP) or Agency Admin (CL_ADMIN), I upload a Document, Report or Other file to an appointment or directly to a property, list the files of a property or appointment by type with per-type counts, download a time-limited signed URL, add a **New version** of an existing file (the previous version stays accessible), and (AM/OP only) soft-delete a file — every action tenant-scoped and audited with author, date and version.

**Why this priority**: This is the core contract-C deliverable and the minimum viable product. Without the model, the presign→confirm flow, listing, download, versioning and deletion, there is no file repository for any surface to consume. It establishes the storage-key grammar, the audit shape and the tenant-scope contract that every other story depends on.

**Independent Test**: As AM, presign a PDF for an appointment, confirm it, then `GET` the property's files filtered by `propertyId` and assert the file is returned with its `appointmentId`, type `DOCUMENT`, `version = 1`, `status = READY`. Add a new version and assert both `version = 1` and `version = 2` are downloadable via distinct signed URLs. Assert the audit log carries `property_file.uploaded`, `property_file.version_added` and (after delete) `property_file.deleted` with author, timestamp and version.

**Acceptance Scenarios**:

1. **Given** an AM/OP/CL_ADMIN actor, **When** they presign an upload with an allowed MIME and then confirm it after the object exists, **Then** a `PropertyFile` is persisted `PENDING` at presign and flipped to `READY` at confirm, the confirm validates the real `sizeBytes ≤ maxFileSizeMb` and the sniffed MIME is compatible with the declared one, and a `property_file.uploaded` audit entry records the author, date and version.
2. **Given** a file uploaded through an appointment, **When** the property's files are listed by `propertyId`, **Then** the file appears with its `appointmentId` and type, and listing by `appointmentId` returns it too (C.A1).
3. **Given** an existing `READY` file, **When** a new version is added, **Then** it shares the `version_group_id`, gets `version = previousMax + 1`, both versions remain `READY` and individually downloadable, and `property_file.version_added` is audited (C.A3/C.A4).
4. **Given** two concurrent "new version" calls on the same file, **When** both attempt `version = max + 1`, **Then** the `UNIQUE(version_group_id, version)` conflict (raw 23505, not Prisma P2002) is caught and retried with a recomputed `max + 1`, so no version is lost and no duplicate `(group, version)` is written.
5. **Given** an AM/OP actor, **When** they delete a file, **Then** it is soft-deleted (`deleted_at`/`deleted_by_user_id` set), disappears from listings, and `property_file.deleted` is audited; a CL_ADMIN/CL_USER/INSP attempting delete is rejected.
6. **Given** a signed download is requested, **When** the use case issues it, **Then** the URL expires in 5 minutes and is scoped to the caller (D6/D28).

---

### User Story 2 - Property issues with photos (create, mark seen, delete) (Priority: P1)

As an issue author (INSP via PWA, AM/OP/CL_ADMIN via web, rental tenant via portal — each through its own surface), I create an issue consisting of a mandatory reason and zero or more photos; the photos are uploaded one by one (presign→confirm) first, then the issue is created and the confirmed photos are linked to it atomically. As AM/OP/CL_ADMIN I **mark an issue as seen** (idempotently), and as AM/OP I soft-delete an issue together with its photos.

**Why this priority**: Issues are the additive core of F10 and the reason the indicator/count machinery exists. The create-with-pending-photos transaction (D20) is the single most error-prone invariant in the task, and mark-as-seen/delete complete the issue lifecycle every other surface renders.

**Independent Test**: Presign + confirm two issue photos (they persist as `PENDING`, `type = ISSUE`, `issue_id = NULL`); create an issue referencing those two file IDs; assert a transaction creates the issue and flips exactly those two rows to `READY` with `issue_id` and `appointment_id` set; assert that if any referenced photo is missing/already-linked the whole create returns 409 and no issue row is written. Call mark-as-seen twice concurrently and assert exactly one call records `property_issue.seen` and the second returns `{ alreadySeen: true }` without overwriting `seen_by_user_id`.

**Acceptance Scenarios**:

1. **Given** issue photos confirmed as `PENDING` `type = ISSUE` rows with `issue_id = NULL`, **When** an issue is created referencing them, **Then** a single transaction inserts the issue and runs an `UPDATE … SET issue_id, appointment_id, status = 'READY' WHERE id = ANY(:ids) AND status = 'PENDING' AND type = 'ISSUE' AND issue_id IS NULL AND tenant_id = :tenant`, requiring **every** referenced row to update (otherwise 409 and rollback), and audits `property_issue.created`.
2. **Given** an issue created with a non-null `appointmentId`, **When** the use case validates it, **Then** the `appointmentId` MUST belong to the same `property_id` and `tenant_id`, else the request is rejected.
3. **Given** an issue may legitimately have zero photos, **When** it is created with reason only, **Then** it is persisted and later rendered as "No photos".
4. **Given** an unseen issue, **When** AM/OP/CL_ADMIN marks it as seen, **Then** a CAS `UPDATE … SET seen_at = now(), seen_by_user_id = :user WHERE id = :id AND seen_at IS NULL AND deleted_at IS NULL` runs; 1 row affected → audit `property_issue.seen`; 0 rows → return `{ alreadySeen: true }` and do not re-audit or overwrite the original seer.
5. **Given** an AM/OP actor, **When** they delete an issue, **Then** the issue and its `issue_id` photos are soft-deleted together and `property_issue.deleted` is audited; CL roles and INSP cannot delete.
6. **Given** the same `Idempotency-Key` is replayed on issue creation or upload confirmation (phone retry after timeout), **When** the command runs again, **Then** no duplicate issue or file is created (D24).

---

### User Story 3 - Tenant isolation and role-based access across five roles (Priority: P1)

As the platform, I guarantee that file and issue access is scoped by tenant and role: AM/OP read/write across agencies via `requireTenantScope`; CL_ADMIN/CL_USER are pinned to their own tenant via `assertTenantScope`; an inspector sees only files/issues of appointments assigned to them (respecting the existing T-1 visibility predicate); the rental tenant sees only its own portal submissions; and any attempt to reach another agency's file, issue or download returns **404** without revealing that the resource exists.

**Why this priority**: This is contract code **C.A2** and the privacy guarantee. Shipping the file repository without watertight isolation would leak cross-tenant documents and the existence of other agencies' issues. It is as critical as the features it protects.

**Independent Test**: Seed a file and an issue in agency T1. As a CL actor of agency T2, request the file metadata, the issue and a signed download and assert each returns 404 (never 403, never a body revealing existence). As a CL_USER, attempt a presign and assert 403. As INSP A, request files of an appointment assigned to INSP B and assert they are not returned; request files of an appointment assigned to INSP A but outside the T-1 visibility window and assert the existing predicate hides them.

**Acceptance Scenarios**:

1. **Given** a file/issue owned by agency T1, **When** a CL actor of agency T2 requests it (metadata, download or the issue), **Then** the response is **404** with no indication the resource exists (C.A2).
2. **Given** an OP actor (cross-tenant), **When** they read/write files or issues, **Then** scope is resolved with `requireTenantScope` (not an `if (tenantId)` that silently drops the filter), so OP is never pinned to its own tenant.
3. **Given** a CL_USER actor, **When** they attempt to presign/upload, create an issue, add a version, delete, or mark as seen, **Then** the request is rejected (CL_USER may only read/download within its tenant).
4. **Given** an INSP actor, **When** they list files/issues, **Then** only files/issues of appointments visible to that inspector under the **existing inspector↔appointment visibility predicate** (T-1 window) are returned — never a loose `inspector_id = me` that would ignore the window (D28).
5. **Given** the role matrix, **When** any file/issue action runs, **Then** the role gate derives from `ROLE_ACTION_MATRIX` keys (`property_file.read/upload/version/delete`, `property_issue.create/mark_seen/delete`, `property_issue.unseen_count`), proven by a test that the accepted roles equal the matrix entry.

---

### User Story 4 - Unseen-issue indicators and payload fields (Priority: P2)

As AM, OP or CL_ADMIN, I see where unseen issues exist: a lightweight count endpoint tells me how many appointments and how many properties (without an appointment) have unseen issues; list payloads carry `hasUnseenIssues` to drive a row border; detail payloads carry `fileCounts`; and both lists support a `withIssues` filter. CL_USER and INSP never see these indicators.

**Why this priority**: These fields feed the web indicators (TASK-F10-2: sidebar dots, row borders, filters). They are a refinement layered on the issue model (US2) and the tenant scope (US3), so they rank below them but must ship in the same contract so F10-2 can consume them.

**Independent Test**: Create an unseen issue linked to an appointment; call `GET /v1/property-issues/unseen-count` as CL_ADMIN and assert `appointmentsWithUnseenIssues ≥ 1`; create an unseen issue on a property with no appointment and assert `propertiesWithUnseenIssues ≥ 1`. Call `GET /v1/appointments` and assert the row has `hasUnseenIssues: true`; mark the issue seen and assert it flips to `false`. Call as CL_USER/INSP and assert `hasUnseenIssues` is `false` regardless of data. Apply `withIssues` to both lists and assert only rows with (unseen) issues remain.

**Acceptance Scenarios**:

1. **Given** AM/OP/CL_ADMIN, **When** they call `GET /v1/property-issues/unseen-count`, **Then** they receive `{ appointmentsWithUnseenIssues, propertiesWithUnseenIssues }` computed via the partial indexes, scoped to the caller's tenant rules.
2. **Given** `GET /v1/appointments`, **When** the payload is built, **Then** each row carries `hasUnseenIssues` meaning "an unseen, non-deleted issue linked to this appointment exists" (D26); for CL_USER and INSP the field is always `false`.
3. **Given** `GET /v1/properties`, **When** the payload is built, **Then** each row's `hasUnseenIssues` means "any unseen, non-deleted issue of this property exists (with or without appointment)" (D26); `false` for CL_USER/INSP.
4. **Given** `GET /v1/appointments/:id` and `GET /v1/properties/:id`, **When** the detail payload is built, **Then** it carries `fileCounts: { total, issues, documents, reports, other }` of non-deleted `READY` files.
5. **Given** the `withIssues` filter on either list, **When** applied, **Then** only records with a (non-deleted) issue are returned; the filter distinguishes "has any issue" from "has an unseen issue" per the task's test matrix.

---

### User Story 5 - Configuration and retention job (Priority: P2)

As a platform operator, I configure allowed MIME types, max file size, issue-photo MIME types, max photos per issue, active-file retention and deleted-file retention through one `propertyFiles` platform-settings key; a daily background job purges the storage objects of files deleted beyond `deletedRetentionDays`, of active files beyond `retentionDays`, and of orphaned `PENDING` uploads older than 24 hours — all audited.

**Why this priority**: Configuration (C.2) and retention (C.8) are contract requirements but operate on top of the file model. The orphan-PENDING purge (D22) is the safety valve that prevents presigned-but-never-confirmed objects from lingering forever in the bucket.

**Independent Test**: Add the `propertyFiles` key to the registry with the six documented defaults and assert `usePlatformSetting`-style reads return them. Run the retention job after moving a deleted file's `deleted_at` beyond `deletedRetentionDays`, an active file's `created_at` beyond a non-null `retentionDays`, and an unconfirmed `PENDING` file's `created_at` beyond 24 h; assert `IStorageService.deleteObject` is called for each, `purged_at` is set, and `property_file.purged` is audited.

**Acceptance Scenarios**:

1. **Given** the `PLATFORM_SETTINGS_REGISTRY`, **When** the `propertyFiles` key is read, **Then** it exposes a Zod object of six fields — `allowedMimes`, `maxFileSizeMb` (int 5–200, default 20), `issueImageMimes`, `maxPhotosPerIssue` (int 1–20, default 10), `retentionDays` (int|null, default null), `deletedRetentionDays` (int 30–3650, default 365) — under `section: 'Property files'`.
2. **Given** a file soft-deleted beyond `deletedRetentionDays` and still `READY` with `purged_at` null, **When** the daily job runs, **Then** its storage object is deleted, `purged_at` is set, and `property_file.purged` is audited.
3. **Given** `retentionDays` is non-null and an active file's `created_at` is older than it, **When** the job runs, **Then** the object is purged and audited; a purged issue photo leaves the issue intact (the card later shows "Photo removed (retention)", D27).
4. **Given** a `PENDING` file older than 24 h with `purged_at` null, **When** the job runs, **Then** `deleteObject` is called (not-found ignored), the row is soft-deleted and `purged_at` set, and the purge is audited (D22) — no presigned-but-abandoned object lingers.
5. **Given** storage is not configured (`UnconfiguredStorageService` → 503), **When** any upload/presign/confirm/download is attempted, **Then** the API returns 503 and the shared `FILE_STORAGE_UNAVAILABLE_MESSAGE` is surfaced, not a broken response (D16).

---

### Edge Cases

- **Presign of a file larger than the limit**: the presign cannot enforce size; the oversize file is caught at **confirm** by `headObject` `sizeBytes > maxFileSizeMb` → rejected with a clear message (C.A5, risk note).
- **Spoofed content-type**: confirm sniffs real bytes with `file-type`; a declared `image/png` whose magic bytes are not an allowed type is rejected (C.A5).
- **HEIC from iPhone**: accepted at upload (`image/heic` in `allowedMimes`/`issueImageMimes`); no preview guarantee — downstream surfaces fall back to a generic icon + download (D13). The backend does not transcode.
- **Issue photo confirmed but issue never created**: it remains a `PENDING` `type = ISSUE`, `issue_id = NULL` row and is swept by the retention job's step 3 after 24 h (D20/D22).
- **Issue created referencing a photo already linked to another issue, soft-deleted, or belonging to another tenant**: the all-or-nothing `UPDATE` affects fewer rows than requested → 409, whole create rolled back.
- **Deleting an issue with a `READY` photo**: issue + photos soft-deleted together (D27); a later retention purge removes the photo object but not the issue.
- **Mark-as-seen race**: two CL_ADMINs click simultaneously → CAS ensures exactly one audit and one `seen_by_user_id` (D23).
- **New-version race**: two uploads of the next version → one wins the unique index, the other retries at `max + 1` (D21).
- **Appointment on a different property than the file's property**: issue/file creation with an `appointmentId` that does not belong to the file's property+tenant is rejected (D1).
- **Cross-tenant read of any kind**: 404 everywhere — metadata, issue, download — never 403, never an existence-revealing body (C.A2/D6).
- **Storage key collision**: `UNIQUE(storage_key)` guarantees no two rows share a key; the confirm validates the key ↔ row via the shared key grammar, not a fixed `.jpg` (D25).

## Requirements *(mandatory)*

### Functional Requirements

**Data model & migration**

- **FR-001**: The system MUST add two tenant-scoped tables in a single migration: `property_issues` (`id`, `tenant_id` NOT NULL → `tenants`, `property_id` NOT NULL → `properties`, nullable `appointment_id` → `appointments`, `reason` TEXT 1–1000 chars, `source` ∈ `INSPECTOR|STAFF|RENTAL_TENANT_PORTAL`, nullable `created_by_user_id` → `users`, nullable `cant_do_event_id` → `inspector_field_events`, `seen_at`/`seen_by_user_id`, `deleted_at`/`deleted_by_user_id`, timestamps) and `property_files` (`id`, `tenant_id` NOT NULL, `property_id` NOT NULL, nullable `appointment_id`, nullable `issue_id` → `property_issues`, `type` ∈ `ISSUE|DOCUMENT|REPORT|OTHER`, `version_group_id` UUID NOT NULL, `version` INT default 1, `file_name`, `mime`, `size_bytes` BIGINT, `storage_key`, `status` ∈ `PENDING|READY` default `PENDING`, nullable `uploaded_by_user_id`, `deleted_at`/`deleted_by_user_id`, `purged_at`, timestamps). Both carry `tenant_id` (D5) and are **not** platform-scoped.
- **FR-002**: `property_files` MUST enforce `CONSTRAINT issue_id_matches_type CHECK (status = 'PENDING' OR (type = 'ISSUE' AND issue_id IS NOT NULL) OR (type <> 'ISSUE' AND issue_id IS NULL))` — the CHECK is **relaxed while `PENDING`** so an issue photo can exist before its issue (D20) — plus `UNIQUE(version_group_id, version)` and `UNIQUE(storage_key)`.
- **FR-003**: The migration MUST create the partial indexes needed by the indicators and the retention job (in raw SQL, since Prisma does not represent partial indexes and the drift check does not drop them): on `property_issues` — `(tenant_id, appointment_id) WHERE seen_at IS NULL AND deleted_at IS NULL`, `(tenant_id, property_id) WHERE appointment_id IS NULL AND seen_at IS NULL AND deleted_at IS NULL`, and `(tenant_id, property_id) WHERE seen_at IS NULL AND deleted_at IS NULL` (D26); on `property_files` — `(property_id, type) WHERE deleted_at IS NULL`, `(appointment_id, type) WHERE deleted_at IS NULL`, `(issue_id) WHERE deleted_at IS NULL`, `(created_at) WHERE status = 'PENDING' AND purged_at IS NULL`, and `(deleted_at) WHERE deleted_at IS NOT NULL AND purged_at IS NULL`.
- **FR-004**: The migration MUST be a single file for this PR; its timestamp MUST be regenerated on rebase, and it MUST apply cleanly twice against a fresh PostGIS database (CI `prisma migrate deploy` gate). The Prisma schema MUST model both tables and their relations (with the partial indexes left in raw SQL only).

**Shared contract**

- **FR-005**: `packages/shared` MUST add **one** `propertyFiles` key to `PLATFORM_SETTINGS_REGISTRY` in `src/schemas/platform-settings.ts` — a single Zod **object** of six fields (not six flat keys), `section: 'Property files'` (D29) — with the defaults in FR-033. The registry's "one key per feature" shape (`{ schema, defaults, section }`) MUST be preserved by **appending** (parallel-safe with F07-1).
- **FR-006**: `packages/shared` MUST export: `PORTAL_MAX_PHOTOS_PER_ISSUE = 5` (the portal-effective max is `min(5, maxPhotosPerIssue)`), `FILE_STORAGE_UNAVAILABLE_MESSAGE` (one string reused by web/PWA/portal), and the storage-key grammar helpers `buildPropertyFileStorageKey({ tenantId, propertyId, fileId, ext }) → files/{tenantId}/{propertyId}/{fileId}.{ext}` and `buildPortalIssueStorageKey({ tenantId, appointmentId, fileId, ext }) → files/{tenantId}/tenant-issues/{appointmentId}/{fileId}.{ext}` (D25), both in the `inspection-assets` bucket.
- **FR-007**: `packages/shared` MUST export the request/response schemas for the new routes (presign, confirm, list, download, create/mark-seen/delete issue, unseen-count) and the new payload fields (`hasUnseenIssues`, `fileCounts`), and the generated `openapi.json` + `api-types.ts` MUST be regenerated with `pnpm generate:api` and committed so TASK-F10-2/3/4 can consume them. Conflicts in `api-types.ts` MUST be resolved by **regenerating**, never by hand.

**File use cases** (`property-file` module, `application/use-cases/`)

- **FR-008**: `PresignPropertyFileUploadUseCase` MUST validate the declared MIME against `allowedMimes` (or `issueImageMimes` when it is an issue photo), build the storage key via the shared grammar, call `IStorageService.createSignedUploadUrl` against the `inspection-assets` bucket, persist a `PropertyFile` with `status = PENDING`, and return `{ fileId, uploadUrl }`. It MUST reject a disallowed MIME with a clear message (C.A5, presign side). It MUST be allowed for AM/OP/CL_ADMIN (any type) and for INSP **only** when `type = ISSUE` and the target appointment is assigned to that inspector and T-1 visible; CL_USER MUST be rejected (403).
- **FR-009**: `ConfirmPropertyFileUploadUseCase` MUST call `headObject` (expecting `{ exists, sizeBytes }`), sniff the real MIME with `file-type` and require it compatible with the declared MIME, require `sizeBytes ≤ maxFileSizeMb`, set `status = READY` (for non-issue files; issue photos flip to `READY` only inside issue creation, D20), audit `property_file.uploaded` (author, date, version), and require an `Idempotency-Key` (D24). A size or magic-byte violation MUST be rejected with a clear message (C.A5, confirm side).
- **FR-010**: `ListPropertyFilesUseCase` MUST list by `(propertyId, type?)` and by `(appointmentId, type?)`, filtering `deleted_at IS NULL` and `status = READY`, returning total and per-type counts, and MUST honour the INSP T-1 visibility predicate (D28).
- **FR-011**: `GetPropertyFileDownloadUrlUseCase` MUST issue a `createSignedDownloadUrl` with a 5-minute TTL and MUST enforce tenant/visibility scope (D6/D28) — cross-tenant → 404.
- **FR-012**: `AddPropertyFileVersionUseCase` MUST insert a new row in the same `version_group_id` with `version = currentMax + 1`; on a `UNIQUE(version_group_id, version)` race it MUST catch the raw 23505 (not Prisma P2002) and retry with a recomputed max; it MUST audit `property_file.version_added` (author, date, version).
- **FR-013**: `DeletePropertyFileUseCase` MUST soft-delete (set `deleted_at`/`deleted_by_user_id`), be restricted to AM/OP, and audit `property_file.deleted`.

**Issue use cases** (`property-file` module, `application/use-cases/`)

- **FR-014**: `CreatePropertyIssueUseCase` MUST validate that any supplied `appointmentId` belongs to the same `property_id` and `tenant_id`, run a transaction that inserts the issue and executes the all-or-nothing `UPDATE property_files SET issue_id = :issueId, appointment_id = :appointmentId, status = 'READY' WHERE id = ANY(:fileIds) AND status = 'PENDING' AND type = 'ISSUE' AND issue_id IS NULL AND tenant_id = :tenantId` (every referenced row must update, else 409 + rollback), require an `Idempotency-Key` (D24), and audit `property_issue.created`. An issue with zero photos MUST be allowed.
- **FR-015**: `MarkPropertyIssueAsSeenUseCase` MUST perform a CAS `UPDATE property_issues SET seen_at = now(), seen_by_user_id = :userId WHERE id = :id AND seen_at IS NULL AND deleted_at IS NULL`, branch on rows affected (1 → audit `property_issue.seen`; 0 → return `{ alreadySeen: true }` without re-auditing or overwriting the original seer), and be limited to AM/OP/CL_ADMIN (D23).
- **FR-016**: `DeletePropertyIssueUseCase` MUST soft-delete the issue **and** its `issue_id` photos together, be restricted to AM/OP, and audit `property_issue.deleted` (D27 — the issue itself is not deleted by retention purges of its photos).
- **FR-016b**: `ListPropertyIssuesUseCase` MUST list non-deleted issues by `propertyId` and/or `appointmentId`, each with its non-deleted `READY` photos, applying the same tenant scope and INSP T-1 visibility as FR-010 (CL_USER may read within its tenant; cross-tenant → 404). It is exposed as `GET /v1/property-issues` and is the source the web/PWA issue cards render.

**Counts, payload fields & filters**

- **FR-017**: The system MUST expose `GET /v1/property-issues/unseen-count` (AM/OP/CL_ADMIN) returning `{ appointmentsWithUnseenIssues, propertiesWithUnseenIssues }` computed via the partial indexes and scoped to the caller's tenant rules. The route MUST be a static, unambiguous path within the issues module.
- **FR-018**: `GET /v1/appointments` and `GET /v1/properties` MUST each carry `hasUnseenIssues: boolean` per D26 — appointment: an unseen, non-deleted issue **linked to the appointment**; property: **any** unseen, non-deleted issue of the property (with or without appointment). The field MUST be `false` for CL_USER and INSP (they cannot mark as seen).
- **FR-019**: `GET /v1/appointments/:id` and `GET /v1/properties/:id` MUST each carry `fileCounts: { total, issues, documents, reports, other }` counting non-deleted `READY` files.
- **FR-020**: `GET /v1/appointments` and `GET /v1/properties` MUST accept a `withIssues` filter that returns only records having a (non-deleted) issue; the test matrix MUST cover "has any issue" vs "has an unseen issue".
- **FR-021**: All four modified payloads (two lists + two details) MUST have their test fixtures updated to the new shape, and the contract regeneration (FR-007) MUST be committed alongside.

**RBAC, scope & storage**

- **FR-022**: Tenant scope MUST be resolved with `requireTenantScope` (OP, cross-tenant) / `assertTenantScope` (CL, pinned), never an `if (tenantId)` that silently drops the filter. Cross-tenant access to a file, issue or download MUST return **404**, never 403, and never reveal existence (C.A2/D6).
- **FR-023**: The RBAC matrix MUST be: AM/OP — read/upload/version/delete/create-issue/mark-seen/delete-issue, cross-tenant; CL_ADMIN — all of the above except file/issue **delete**, within own tenant; CL_USER — read/download only, within own tenant (**no presign**, no create, no version, no delete, no mark-seen); INSP — read/download of assigned appointments (T-1) and create an issue (including presign/confirm of its **ISSUE photos**) on own, T-1-visible appointments; no Document/Report/Other upload, no new version, no delete, no mark-seen, no unseen-count; rental tenant (token) — only its own portal submissions (portal routes are TASK-F10-4, not this task). A test MUST prove CL_USER cannot presign and INSP cannot read another inspector's appointment files.
- **FR-024**: `packages/shared/src/permissions/role-matrix.ts` MUST register (by **appending**, parallel-safe with F07-1) the actions `property_file.read`, `property_file.upload`, `property_file.version`, `property_file.delete`, `property_issue.create`, `property_issue.mark_seen`, `property_issue.delete`, `property_issue.unseen_count`, each with its allowed roles; the use cases' role gates MUST derive from these entries (proven by a test, precedent F09-1 `map.execution_density`).
- **FR-025**: The backend MUST import the existing `IStorageService` port from `apps/backend/src/modules/inspector-execution/domain/storage.service.ts` **without moving the file** (D11) and use the already-provisioned private bucket `inspection-assets` (D10) — no new bucket, no port relocation.
- **FR-026**: Idempotency MUST be enforced (`Idempotency-Key` header, §7.7) on issue creation and upload confirmation (D24), following the F02-2 precedent.

**Retention job**

- **FR-027**: A daily pg-boss job (`property-file-retention.worker.ts`) MUST, in three steps, each audited `property_file.purged`: (1) for files `deleted_at < now() - deletedRetentionDays`, `status = READY`, `purged_at IS NULL` → `deleteObject` + set `purged_at`; (2) when `retentionDays` is non-null, for active files `created_at < now() - retentionDays` → `deleteObject` + `purged_at` (a purged issue photo follows D27); (3) for `status = PENDING`, `created_at < now() - 24h`, `purged_at IS NULL` → `deleteObject` (ignoring not-found) + soft-delete + `purged_at` (D22). All "now" cut-offs use `PLATFORM_TIMEZONE`.

**Docs & CLAUDE.md**

- **FR-028**: The stale `InspectionAsset` documentation (a model that never existed in schema v1) MUST be updated or removed in `docs/database-schema.md`, `docs/runbooks/inspection-asset-retention.md` and the `specs/008-*` references (achado 1b).
- **FR-029**: This PR MUST update `apps/backend/CLAUDE.md` and `packages/shared/CLAUDE.md` (and the root `CLAUDE.md` "Active Technologies" entry by **appending**) to record the two tables, the `propertyFiles` setting key, the new routes and payload fields, the retention job, the new role-matrix actions, the storage-key grammar, and the tenant-scoped (non-platform) nature of the two entities.

**Testing (contract codes map to Success Criteria)**

- **FR-030**: Unit tests MUST cover: MIME/size validation; the relaxed CHECK (a `PENDING` `type = ISSUE` row with `issue_id = NULL` passes, a `READY` `type = ISSUE` row with `issue_id = NULL` fails); mark-as-seen CAS (two concurrent calls → one audit); sequential `version` + the `UNIQUE` race; and cross-tenant 404 for file, issue and download.
- **FR-031**: Integration tests (Supertest + real-database for the DB-dependent paths) MUST cover: RBAC across all five roles including **INSP cannot read another inspector's appointment files/issues** and **CL_USER cannot presign**; the presign→confirm flow with a storage stub; the retention job (advance `created_at`/`deleted_at`, assert `deleteObject` called + `purged_at` set); **C.A4** asserts on the `property_file.uploaded/.version_added/.deleted` audit payloads (author, date, version); **C.A1** upload-via-appointment → `GET files?propertyId` returns the file with `appointmentId`; **C.A3** signed URLs for v1 and v2; **C.A5** confirm refuses `sizeBytes > max` and a divergent magic byte; and the `withIssues` filter on both lists (has-issue vs has-unseen-issue).

**Defaults**

- **FR-032**: Timezone handling MUST follow the Sydney-only rule: the retention job's "now" cut-offs run on `PLATFORM_TIMEZONE`; `created_at`/`deleted_at`/`purged_at`/`seen_at` are UTC instants; no civil-date business field is introduced by this task.
- **FR-033**: The `propertyFiles` defaults MUST be: `allowedMimes = ['image/jpeg','image/png','image/heic','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']`; `maxFileSizeMb = 20` (int 5–200); `issueImageMimes = ['image/jpeg','image/png','image/heic','image/webp']`; `maxPhotosPerIssue = 10` (int 1–20); `retentionDays = null` (int|null — null keeps everything); `deletedRetentionDays = 365` (int 30–3650).

### Key Entities *(include if feature involves data)*

- **PropertyIssue** (new table `property_issues`, tenant-scoped): a problem record. Belongs to a `property` and a `tenant`, optionally to an `appointment` (which must match the property+tenant). Carries a 1–1000-char `reason`, a `source` (`INSPECTOR|STAFF|RENTAL_TENANT_PORTAL`), optional `created_by_user_id` (null for the rental tenant), optional `cant_do_event_id` (FK to the F03-2 `inspector_field_events` table), seen (`seen_at`/`seen_by_user_id`) and soft-delete (`deleted_at`/`deleted_by_user_id`) columns.
- **PropertyFile** (new table `property_files`, tenant-scoped): a stored file of one of four `type`s. Belongs to a `property` and `tenant`, optionally an `appointment`; `issue_id` is required for a `READY` `ISSUE` photo, null for other types, and relaxed-null while `PENDING` (D20). Versioned by `(version_group_id, version)` (unique). Has `status` (`PENDING|READY`), `storage_key` (unique), file metadata, `uploaded_by_user_id`, soft-delete and `purged_at`.
- **PlatformSetting `propertyFiles`** (existing `platform_settings` registry, F03-1): one new key — a Zod object of six fields (FR-033) under `section: 'Property files'`. The registry row is platform-scoped (no `tenant_id`), unchanged by this task.
- **IStorageService** (existing port, `inspector-execution/domain/storage.service.ts`): `createSignedUploadUrl`, `headObject`, `createSignedDownloadUrl`, `deleteObject` — imported, not moved (D11). `UnconfiguredStorageService` returns 503.
- **InspectorFieldEvent** (existing table `inspector_field_events`, F03-2): the `cant_do` event a portal-/inspector-raised issue may reference via `cant_do_event_id`. Not modified.
- **Appointment / Property / Tenant / User** (existing): scope and FK targets; the two lists and two details are **modified** to carry `hasUnseenIssues` / `fileCounts` and accept `withIssues` (payload-only; no new business columns).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (C.A1)**: A file of any type uploaded on an appointment appears in the appointment's Files listing **and** in the correct property's Files listing, in the same type sub-tab, carrying the appointment reference (proven by a backend integration test: upload via appointment → `GET files?propertyId` returns the file with `appointmentId`).
- **SC-002 (C.A2)**: A user of another agency receives **404** on the file, the issue and the download — never 403, never a body revealing existence.
- **SC-003 (C.A3)**: "New version" preserves the previous version, and both versions can be downloaded (distinct signed URLs for v1 and v2).
- **SC-004 (C.A4)**: The audit records author, date and version on upload, on new version and on deletion (`property_file.uploaded/.version_added/.deleted`).
- **SC-005 (C.A5)**: A format or size outside the configuration is refused with a clear message, **in the presign and in the confirm** (MIME at presign; real size + magic bytes at confirm).
- **SC-006 (additive — indicators)**: An unseen issue is detectable via `hasUnseenIssues: true` on the relevant list payload and via the unseen-count endpoint; marking it seen records who and when (`seen_at`/`seen_by_user_id`) and flips the indicators off for everyone (the field becomes `false`).
- **SC-007 (additive — filter)**: The `withIssues` filter lists only records that have an issue, on both the appointments and the properties lists.
- **SC-008 (additive — retention)**: A deleted file disappears from the UI immediately and its storage object is purged after `deletedRetentionDays` (default 365); an orphaned `PENDING` upload is purged after 24 h; both are audited.
- **SC-009 (RBAC/matrix)**: The eight `property_file.*` / `property_issue.*` role-matrix actions exist and match the roles each use case accepts; CL_USER cannot presign and INSP cannot read another inspector's appointment files (proven by tests).
- **SC-010 (idempotency/concurrency)**: Replaying an `Idempotency-Key` on issue creation or confirm creates no duplicate; concurrent mark-as-seen audits once; concurrent new-version writes lose no version.
- **SC-011 (storage unavailability)**: With storage unconfigured, every upload path returns 503 and surfaces `FILE_STORAGE_UNAVAILABLE_MESSAGE`, not a broken response.

## Assumptions

- **Tenant-scope — these entities ARE tenant-scoped (documented exception's inverse, CLAUDE.md §7.1)**: unlike the Phase-2 inspector entities (`DayPlan`, `InspectorNotice`, `PlatformSetting`, index snapshots, goals, awards — all platform-scoped, no `tenant_id`), `PropertyIssue` and `PropertyFile` **carry `tenant_id`** because their subject is an agency-owned property/appointment (D5). The `PlatformSetting propertyFiles` key itself remains platform-scoped. An integration test proves a CL actor of one agency cannot read another agency's files/issues/downloads (C.A2 / FR-022).
- **Dependencies merged on `develop`**, verified at `origin/develop @ df0ff94e` (2026-11-07): **TASK-F03-1** (`platform_settings` + the `PLATFORM_SETTINGS_REGISTRY` shape this key appends to) and **TASK-F03-2** (`inspector_field_events`, the FK target of `property_issues.cant_do_event_id`). Without F03-2 the FK does not compile; it MUST NOT be dropped to ship earlier.
- **Storage reuse (D10/D11)**: the `IStorageService` port and the private `inspection-assets` bucket both pre-exist; this task imports the port in place and uses the bucket. The bucket's operational config in the Supabase dashboard (images-only / 30 MB) is an operational item already tracked in the DEV checklist and is **out of this PR's scope** — the code only uses the bucket; `allowedMimes`/`maxFileSizeMb` govern application-level validation.
- **Parallel with Onda 5 / TASK-F07-1** (running concurrently): both touch `role-matrix.ts`, `PLATFORM_SETTINGS_REGISTRY`, `schema.prisma` and `api-types.ts`. The merge rule is **append** for the role matrix and the settings registry, **one migration per PR** with the timestamp regenerated on rebase, and **always regenerate** `api-types.ts` (never hand-merge); whoever merges second rebases. The root `CLAUDE.md` "Active Technologies" list keeps every entry.
- **No pending product decision for this task**: F10 decisions were closed with the client on 2026-10-30 and the engineering decisions D20–D29 on 2026-11-07; D1–D29 in `fase2-etapa1/tarefas/F10-tarefas.md` resolve every validation finding, so this spec records no `[NEEDS CLARIFICATION]`. Q2/Q4/Q6/Q12 concern other features and do not affect F10-1.
- **Sydney-only timezone** (`PLATFORM_TIMEZONE = Australia/Sydney`): the retention job's cut-offs run on the platform timezone; all stored instants are UTC; this task introduces no civil-date business field.
- **This task ships without a UI consumer**: TASK-F10-2/3/4 consume the contract. The backend+shared slice can reach production alone (code + one migration + one settings key + one job; no new env beyond the existing storage config).
- **PR size**: this is a large task (two modules, four modified payloads + their fixtures, one migration, a retention job, role-matrix and settings entries, docs). The 150-changed-file cap MUST be verified with `git diff --stat origin/develop... | tail -1` before opening the PR; if exceeded, the coordinator is asked to decide a split rather than silently cutting scope.
