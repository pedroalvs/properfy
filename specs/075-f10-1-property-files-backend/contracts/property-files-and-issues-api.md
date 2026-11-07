# API Contract — Property Files & Issues (TASK-F10-1)

REST, prefix `/v1`, camelCase payloads, Bearer JWT, error envelope `{ error: { code, message, details? } }`, `request_id` via existing middleware. All Zod schemas live in `packages/shared/src/schemas/property-files.ts` (+ `responses.ts` edits) and drive the regenerated `openapi.json` / `api-types.ts`. Portal (`/v1/portal/:token/...`) routes are **TASK-F10-4**, not this task.

Legend — roles that may call (base-role gate from `role-matrix`; runtime refinements noted): **AM**, **OP** (cross-tenant), **CL_ADMIN**, **CL_USER**, **INSP**.

## Files

### POST `/v1/property-files/presign`
- **Roles**: AM, OP, CL_ADMIN (any type); INSP (only `type=ISSUE`, on an appointment assigned + T-1 visible). CL_USER → 403.
- **Body**: `{ propertyId, appointmentId?, type, fileName, mime, sizeBytes? }`. `mime` ∈ `allowedMimes` (non-issue) or `issueImageMimes` (`type=ISSUE`), else 400 `VALIDATION_ERROR` (C.A5 presign side). `appointmentId` must match `propertyId`+tenant.
- **201**: `{ fileId, uploadUrl, storageKey, expiresAt }`. Persists a `PENDING` row; key via `buildPropertyFileStorageKey`.
- **Errors**: 400 (bad MIME / mismatch), 403 (role / cross-tenant write), 404 (property/appointment not in scope), 503 `FILE_STORAGE_UNAVAILABLE_MESSAGE` (storage unconfigured).

### POST `/v1/property-files/confirm`
- **Roles**: same as presign. **Header**: `Idempotency-Key` (required, D24).
- **Body**: `{ fileId }` (or `{ storageKey }`) identifying the `PENDING` row.
- **Behavior**: `headObject` (exists + `sizeBytes`) → `getObjectBytes` prefix → `file-type` sniff → `isDetectedMimeCompatible(declared, detected)` → `sizeBytes ≤ maxFileSizeMb`. On success flips non-issue files to `READY` and audits `property_file.uploaded`. Issue photos stay `PENDING` until issue creation (D20).
- **200**: the confirmed file DTO (`{ id, type, version, status, fileName, mime, sizeBytes, appointmentId, issueId, createdAt, uploadedByUserId }`).
- **Errors**: 400 (size over max / magic-byte mismatch — C.A5 confirm side), 404 (object missing or row not in scope), 409 (idempotency payload mismatch), 503.

### GET `/v1/property-files`
- **Roles**: AM, OP, CL_ADMIN, CL_USER (own tenant); INSP (T-1-visible appointments only, D28).
- **Query**: `propertyId?`, `appointmentId?`, `type?` (one of the four). At least one of propertyId/appointmentId required. Filters `deleted_at IS NULL AND status = READY`.
- **200**: `{ files: FileDTO[], counts: { total, issues, documents, reports, other } }`. A file uploaded via an appointment is returned by both `propertyId` and `appointmentId` queries, carrying its `appointmentId` (C.A1).
- **Errors**: 403 (role), 404 (scope), 400 (no selector).

### GET `/v1/property-files/:id/download`
- **Roles**: same read set as list; INSP via T-1.
- **200**: `{ url, expiresAt }` — signed URL, TTL 5 min.
- **Errors**: 404 (cross-tenant / not visible — never 403, C.A2), 410/404 if `purged_at` set, 503.

### POST `/v1/property-files/:id/versions`
- **Roles**: AM, OP, CL_ADMIN. **Body**: `{ fileName, mime, sizeBytes? }` (then confirm as a normal upload) — or a presign/confirm pair scoped to the existing `version_group_id`. New row `version = max+1` (23505 retry). Audits `property_file.version_added`. Previous version stays `READY` + downloadable (C.A3).
- **Errors**: 403, 404, 503.

### DELETE `/v1/property-files/:id`
- **Roles**: AM, OP only. Soft-delete (`deleted_at`/`deleted_by_user_id`); audits `property_file.deleted` (author/date/version — C.A4). Disappears from listings; storage object purged later by retention (SC-008).
- **Errors**: 403 (CL/INSP), 404 (scope).

## Issues

### POST `/v1/property-issues`
- **Roles**: AM, OP, CL_ADMIN (→ `source=STAFF`); INSP (→ `source=INSPECTOR`, own+T-1 appointment). CL_USER → 403. **Header**: `Idempotency-Key` (required, D24).
- **Body**: `{ propertyId, appointmentId?, reason (1–1000), photoFileIds?: string[], cantDoEventId? }`. `source`, `createdByUserId` are **server-derived** (R11). `photoFileIds` ≤ `maxPhotosPerIssue`. `cantDoEventId` accepted only on the INSP path (D18).
- **201**: the issue DTO (`{ id, propertyId, appointmentId, reason, source, createdByUserId, seenAt, createdAt, photos: FileDTO[] }`). Transaction creates the issue and links every referenced `PENDING` photo (D20) — all must link.
- **Errors**: 400 (reason/photo count), 403, 404 (property/appointment scope), 409 (a referenced photo missing/already-linked/foreign — D20; or idempotency mismatch), 503.

### POST `/v1/property-issues/:id/seen`
- **Roles**: AM, OP, CL_ADMIN. CAS (D23). 
- **200**: `{ seen: true, seenAt, seenByUserId }` on the winning call, or `{ alreadySeen: true }` (no re-audit, original seer preserved). Audits `property_issue.seen` only on 1-row effect.
- **Errors**: 403 (CL_USER/INSP), 404 (scope / deleted).

### DELETE `/v1/property-issues/:id`
- **Roles**: AM, OP only. Soft-deletes the issue **and** its `issue_id` photos (D27); audits `property_issue.deleted`.
- **Errors**: 403, 404.

### GET `/v1/property-issues`
- **Roles**: AM, OP, CL_ADMIN, CL_USER (own tenant); INSP (T-1 appointments).
- **Query**: `propertyId?`, `appointmentId?` (at least one). Returns non-deleted issues (+ their non-deleted `READY` photos; shows "No photos"/"Photo removed" per D27 downstream).
- **200**: `{ issues: IssueDTO[] }`.

### GET `/v1/property-issues/unseen-count`
- **Roles**: AM, OP, CL_ADMIN only (CL_USER/INSP → 403).
- **200**: `{ appointmentsWithUnseenIssues: number, propertiesWithUnseenIssues: number }` — computed via the partial indexes, scoped to the caller's tenant rules (D26).

## Modified existing payloads (expand — additive)

- `GET /v1/appointments` → list items gain `hasUnseenIssues: boolean` (unseen, non-deleted issue linked to the appointment; `false` for CL_USER/INSP). New query filter `withIssues?: boolean`.
- `GET /v1/properties` → list items gain `hasUnseenIssues: boolean` (any unseen, non-deleted issue of the property; `false` for CL_USER/INSP). New query filter `withIssues?: boolean`.
- `GET /v1/appointments/:id`, `GET /v1/properties/:id` → gain `fileCounts: { total, issues, documents, reports, other }`.

## Role-matrix actions (appended to `ROLE_ACTION_MATRIX`)

| Action | Roles |
|---|---|
| `property_file.read` | AM, OP, CL_ADMIN, CL_USER, INSP |
| `property_file.upload` | AM, OP, CL_ADMIN, INSP *(INSP runtime-refined: issue photos on own+T-1 appointment only)* |
| `property_file.version` | AM, OP, CL_ADMIN |
| `property_file.delete` | AM, OP |
| `property_issue.create` | AM, OP, CL_ADMIN, INSP *(source server-derived)* |
| `property_issue.mark_seen` | AM, OP, CL_ADMIN |
| `property_issue.delete` | AM, OP |
| `property_issue.unseen_count` | AM, OP, CL_ADMIN |

*(Portal/TNT issue creation is token-authenticated at the route level in TASK-F10-4; `TNT` is a runtime actor, not a matrix base role.)*
