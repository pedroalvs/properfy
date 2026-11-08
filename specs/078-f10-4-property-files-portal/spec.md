# Feature Specification: Portal — rental tenant reports a property problem before confirming

**Feature Branch**: `078-f10-4-property-files-portal`
**Created**: 2026-11-07
**Status**: Draft
**Input**: TASK-F10-4 (`fase2-etapa1/tarefas/F10-tarefas.md`) — Portal: tenant pre-confirmation issue. Depends on TASK-F10-1 (merged, `ebf1b8e7`). Part of the C delivery "Mídias" (C.1–C.9 + the approved "Issues" additive, client sign-off 2026-10-30).

## Overview

A rental tenant who receives a portal link for an upcoming inspection can describe a problem with the property — optionally with photos — **before** confirming the appointment. The report is recorded as a property issue sourced `RENTAL_TENANT_PORTAL` and is visible to the operation and the agency through the already-shipped F10-1/F10-2 surfaces. The tenant acts only through the magic-link token: there is no login, so every action is scoped by the token, which pins exactly one appointment (and through it one property and one agency).

This task adds only the portal side: four token-authenticated routes, the portal UI section, the per-token rate limit, and the regenerated API contract. The data model, storage grammar, issue/file use-case primitives, retention and configuration were all delivered by TASK-F10-1 and are reused unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Report a problem with photos before confirming (Priority: P1)

A rental tenant opens the portal link, sees a "Report a problem with the property" section above the confirmation control, writes a short description, optionally attaches up to five photos, and submits the report. Submitting the report is independent from confirming the inspection — the tenant can report a problem and still confirm, or report without confirming.

**Why this priority**: This is the entire purpose of the task and the contract item ("tenant-submitted problem photos"). Without it there is no feature.

**Independent Test**: With a valid portal token, submit a report containing a description and two photos; verify a `RENTAL_TENANT_PORTAL` issue with two linked photos exists for the token's appointment and is returned by the operation/agency issue surfaces.

**Acceptance Scenarios**:

1. **Given** a valid, non-read-only portal token, **When** the tenant submits a description with two photos, **Then** a property issue with `source = RENTAL_TENANT_PORTAL`, `createdByUserId = null`, the token's `appointmentId`/`propertyId`/`tenantId`, and both photos linked (status `READY`) is created, and the operation/agency see it in their issue list.
2. **Given** a valid token, **When** the tenant submits a description with no photos, **Then** a photo-less `RENTAL_TENANT_PORTAL` issue is created (a reason is the minimal record — D27).
3. **Given** a photo upload that was presigned and confirmed, **When** the tenant submits the issue referencing that photo, **Then** the photo is atomically linked to the new issue; if any referenced photo cannot be linked (missing, unconfirmed, foreign, or already linked) the whole submission is rejected and no issue is created (D20).
4. **Given** the tenant attaches a photo whose declared type is outside `issueImageMimes`, or whose uploaded bytes exceed `maxFileSizeMb`, or whose real content does not match the declared type, **When** presign/confirm runs, **Then** it is refused with a clear message — **C.A5: a format or size outside the configuration is refused with a clear message, in the presign and in the confirm.**
5. **Given** one photo in a multi-photo report fails to upload, **When** the tenant retries, **Then** the already-confirmed photos are preserved and only the failed one is re-sent (one photo at a time, individual progress — D12).
6. **Given** file storage is unconfigured, **When** the tenant tries to add a photo, **Then** the portal shows the single shared unavailable message (`FILE_STORAGE_UNAVAILABLE_MESSAGE`) and no broken screen (D16).

---

### User Story 2 - See my submitted reports (Priority: P2)

After submitting, the tenant sees a read-only list of the reports they submitted for this appointment, so they know the problem was recorded. There is no reply, status, or notification back to the tenant — the list is a receipt of what they sent.

**Why this priority**: Confirms submission succeeded and avoids duplicate reports, but the feature delivers value even if the list is the last part built.

**Independent Test**: Submit one report, reload the portal, and verify the report (description + photo count) appears in the tenant's own list and that no staff-internal fields (reviewer identity, seen status) are shown.

**Acceptance Scenarios**:

1. **Given** the tenant submitted two reports for this appointment, **When** they view the portal, **Then** both appear newest-first with their description and photo metadata only — never the reviewer identity, seen timestamp, or any staff note.
2. **Given** issues of other sources (inspector, staff) exist on the same appointment, **When** the tenant views their list, **Then** only `RENTAL_TENANT_PORTAL` issues of **this** appointment are returned.

---

### User Story 3 - Abuse and isolation protection (Priority: P3)

The platform protects the upload surface: one token cannot flood storage, and a token can never reach another appointment's or agency's data.

**Why this priority**: Security and cost control. The feature works without it in a demo, but it must not ship without it.

**Independent Test**: Drive a single token past the presign ceiling and confirm the next presign is rejected; attempt to confirm/list a file or issue belonging to another appointment and confirm it is not revealed.

**Acceptance Scenarios**:

1. **Given** a single token has obtained the maximum allowed presigns within the hour (12), **When** it requests a 13th presign, **Then** the request is rejected with a rate-limit response carrying a retry hint (D21).
2. **Given** a photo (file) belonging to another appointment/agency, **When** the token confirms or references it, **Then** it is treated as not found — **C.A2: a user from another agency receives 404 on the file, on the issue and on the download** (the portal exposes no download route; the file/issue paths return not-found without revealing existence).
3. **Given** a token whose appointment has no associated property, **When** the tenant submits a report, **Then** it is rejected with a clear error (a property issue requires a property).
4. **Given** a read-only (expired/superseded) token, **When** the tenant tries to presign, confirm, or submit a report, **Then** the write is refused; the read-only list may still be viewed.

---

### Edge Cases

- **Duplicate submit (double tap / retry after timeout).** The create-issue and confirm commands require an `Idempotency-Key`; the same key + payload returns the same result without creating a duplicate issue or file (D24).
- **Photo presigned but issue never submitted.** The orphan `PENDING` photo is cleaned up by the F10-1 retention job (24 h sweep, object deleted from storage) — no change needed here (D22).
- **More photos than allowed.** A submission referencing more than `min(PORTAL_MAX_PHOTOS_PER_ISSUE = 5, maxPhotosPerIssue)` photos is rejected before any write.
- **Tenant offline.** The portal upload/report flow requires a connection; there is no offline queue (unlike the inspector PWA).
- **Storage key tampering.** The confirm step re-parses the stored storage key with the portal grammar and rejects a key whose embedded tenant/appointment does not match the token (D25, key ↔ row binding).

## Requirements *(mandatory)*

### Functional Requirements

**Token-scoped upload (presign → confirm)**

- **FR-001**: The portal MUST expose a token-scoped presign action that accepts a declared MIME type, file name, and optional size, validates the MIME against the `propertyFiles.issueImageMimes` configuration, builds the storage key via the shared portal grammar `buildPortalIssueStorageKey({ tenantId, appointmentId, fileId, ext })` (bucket `inspection-assets`), creates a `PENDING` property file of type `ISSUE` with `issueId = null`, `appointmentId`/`propertyId`/`tenantId` resolved from the token's appointment, and `uploadedByUserId = null`, and returns an upload URL (D9, D17, D25).
- **FR-002**: The portal MUST expose a token-scoped confirm action that: requires an `Idempotency-Key`; verifies the object exists; verifies its size ≤ `propertyFiles.maxFileSizeMb`; verifies the real content type is compatible with the declared type via a magic-byte sniff; re-parses the stored storage key with the portal grammar and verifies the embedded `tenantId`/`appointmentId` match the token; and keeps the photo `PENDING` (an issue photo becomes `READY` only when its issue is created, per D20). A violation is refused with a clear message — **C.A5**.
- **FR-003**: Presign and confirm MUST operate only on files whose `appointmentId` equals the token's appointment, `tenantId` equals the token's agency, and `type = ISSUE`. Any other file is treated as not found (no existence disclosure) — **C.A2**.

**Issue creation**

- **FR-004**: The portal MUST expose a token-scoped create-issue action that requires an `Idempotency-Key`, accepts a reason (trimmed, 1–1000 chars) and an optional list of already-confirmed photo file ids, and creates a property issue with `source = RENTAL_TENANT_PORTAL`, `createdByUserId = null`, `cantDoEventId = null`, and the token's `appointmentId`/`propertyId`/`tenantId`.
- **FR-005**: Issue creation MUST link every referenced photo atomically; if any referenced photo is missing, unconfirmed, foreign, or already linked, the submission MUST be rejected and nothing persisted (D20).
- **FR-006**: Issue creation MUST reject a submission referencing more than `min(PORTAL_MAX_PHOTOS_PER_ISSUE = 5, propertyFiles.maxPhotosPerIssue)` photos before any write.
- **FR-007**: A reason-only issue (zero photos) MUST be allowed (D27).
- **FR-008**: Issue creation MUST reject the submission with a clear error when the token's appointment has no associated property.
- **FR-009**: The system MUST write an audit entry on issue creation recording the source, appointment, and photo count (consistent with F10-1's `property_issue.created`), with `actorType = ANONYMOUS` and no actor id (matching the portal confirm/unavailable precedent, since the tenant is token-authenticated and anonymous), and `tenantId` = the token's resolved tenant. Coordinate/personal data MUST NOT be added to the audit.

**Read-back**

- **FR-010**: The portal MUST expose a token-scoped list action that returns only `RENTAL_TENANT_PORTAL` issues of the token's appointment, newest first, exposing the reason, creation time, and photo metadata only — never reviewer identity, seen status, or staff notes.
- **FR-011**: The portal list MUST never return an issue of another appointment, another agency, or another source — enforced structurally because the appointment/agency are resolved from the token, not from client input (**C.A2** isolation).

**Rate limiting & abuse control (D21)**

- **FR-012**: The portal presign action MUST be limited to at most 12 presigns per token per hour; the 13th within the window is rejected with a rate-limit response and retry hint. The limit key MUST be derived from the token (hashed, matching how the token is stored), with an IP fallback for a missing token — precedent: the per-user `keyGenerator` on the inspector-notice and Live Day alert-threshold routes.
- **FR-013**: The generic per-IP portal rate limit MUST remain in force on the confirm, create-issue, and list portal routes (the existing 30 requests/minute portal ceiling).

**Write-gating**

- **FR-014**: Presign, confirm, and create-issue MUST be refused for a read-only (expired or superseded) token; the list MAY still be served read-only.
- **FR-015**: When file storage is unconfigured, presign/confirm MUST surface the shared `FILE_STORAGE_UNAVAILABLE_MESSAGE` (503) and the portal UI MUST render it without breaking (D16).

**Portal UI**

- **FR-016**: The portal MUST present a "Report a problem with the property" section positioned **before** the confirmation control, containing a description field (up to 1000 chars) and an optional "Add photos" control (up to 5).
- **FR-017**: Photos MUST upload one at a time with individual progress/error state; a single failure MUST NOT lose already-confirmed photos (D12).
- **FR-018**: The "Submit report" action MUST be visually and functionally separate from confirming the inspection.
- **FR-019**: The portal MUST show a read-only list of the tenant's own submitted reports for this appointment, with no reply/status/notification affordance.
- **FR-020**: The report flow MUST require a connection (no offline queue).

**Contract & documentation**

- **FR-021**: The new portal routes MUST be added to the OpenAPI spec and the typed client regenerated (`openapi.json` + `api-types.ts` via `pnpm generate:api`), and all affected test fixtures updated.
- **FR-022**: The portal routes MUST be authorized solely by the portal token middleware (the tenant is the runtime-only `TNT` actor, token-authenticated and anonymous). The RBAC role matrix MUST NOT be modified by this task — the F10-1 `property_issue.*` matrix keys gate JWT roles only and do not apply to the token-authenticated portal.
- **FR-023**: Every workspace CLAUDE.md changed by this task MUST be updated in the same PR (backend, shared, web).

### Key Entities *(reused from TASK-F10-1 — no new tables)*

- **PropertyIssue**: a tenant-scoped record of a reported problem (reason + source + optional appointment + photos). This task creates issues with `source = RENTAL_TENANT_PORTAL` and `createdByUserId = null`. Has `tenant_id` (D5 — **not** a platform-scoped entity; the multi-tenant exception does not apply here).
- **PropertyFile (type ISSUE)**: a tenant-scoped photo attached to an issue. Portal photos live under the `files/{tenantId}/tenant-issues/{appointmentId}/{fileId}.{ext}` key grammar. Has `tenant_id` (D5).
- **RentalTenantPortalToken**: the existing magic-link token that pins exactly one appointment (and through it one property and one agency); it is the sole authorization and scope source for this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A rental tenant can submit a problem report with up to five photos from the portal link without logging in, in a single uninterrupted flow.
- **SC-002**: 100% of tenant-submitted reports appear to the operation and agency with the correct appointment, property, and `RENTAL_TENANT_PORTAL` source.
- **SC-003**: A tenant can never retrieve, confirm, or attach to data outside the appointment their token was issued for (cross-token/cross-agency attempts return not-found) — **C.A2**.
- **SC-004**: A single token cannot obtain more than 12 presigned uploads in any one-hour window.
- **SC-005**: Every rejected upload (wrong type, oversized, mismatched content) returns a clear, human-readable message at both presign and confirm — **C.A5**.
- **SC-006**: A duplicate submission (same idempotency key) never produces a duplicate issue or file.

## Assumptions

- **Scope.** Only the portal side ships here. The data model, storage-key grammar, issue/file use-case primitives, retention job, `propertyFiles` configuration, role-matrix base keys, and the operation/agency surfaces come from TASK-F10-1 / F10-2 and are reused unchanged. No new table, column, or migration is introduced by this task.
- **Reuse vs. new use cases.** The portal cannot call the F10-1 presign/confirm/create-issue use cases directly because those require a JWT `AuthContext` (role gate, `uploadedByUserId = actor.userId`). This task adds portal-specific use cases in the `rental-tenant-portal` module that reuse the F10-1 repository ports, storage port, magic-byte compatibility helper, idempotency service, transaction unit-of-work, and the shared storage-key grammar — leaving the merged F10-1 code untouched (minimal-impact). The thin orchestration that is duplicated is justified by the genuinely different actor model (token, no user) and key grammar (tenant-issues prefix).
- **Multi-tenant model.** `PropertyIssue` and `PropertyFile` are tenant-scoped (`tenant_id`, D5); the platform-scoped exception documented for inspector entities does **not** apply to this feature.
- **Pending global decisions.** No open global decision (Q2/Q4/Q6/Q12 in `decisoes.md`) affects this portal task; the F10 decisions D1–D29 were closed (2026-10-30 / 2026-11-07) and are treated as premises here (notably D9, D12, D16, D17, D20, D21, D22, D24, D25, D27).
- **No tenant-facing download route.** The portal does not expose a file-download route; the read-back list returns photo metadata only. This keeps the token's blast radius to exactly the four write/read routes and matches the task's four-route scope.
- **No notifications.** Submitting a report produces no email/SMS/push to the tenant or staff; the operation discovers it through the existing unseen-issue indicators (F10-2).
- **Hermetic E2E.** Per the root CLAUDE.md §11, the portal Playwright suite stubs all API calls; the end-to-end proof of the backend behaviour is a backend integration (supertest) test, and the portal E2E proves the UI fires the creation call.
- **Dependency.** Requires the merged TASK-F10-1 contract on `develop` (`ebf1b8e7`). Runs in parallel with TASK-F10-2 (web) and TASK-F10-3 (PWA); because this task regenerates `api-types.ts`, it rebases and regenerates if F10-2/F10-3 merge first.
