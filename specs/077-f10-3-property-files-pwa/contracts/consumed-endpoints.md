# Consumed Contract (read-only reference)

This slice **adds no endpoints** and makes **no** change to `openapi.json`/`api-types.ts`. It consumes the following six F10-1 routes (merged `develop` @ `ebf1b8e7`). Shapes below are the committed generated types; the PWA imports them via `import type { paths } from '@properfy/shared'` + `openapi-fetch`. RBAC/scoping is backend-enforced; the inspector path is the only one exercised here.

## 1. `GET /v1/property-files` — list files for an appointment

- **Query**: `{ appointmentId: string(uuid) }` — INSP **must** pass `appointmentId` (a property-only query is 403 for INSP). May also pass `type?: 'ISSUE'|'DOCUMENT'|'REPORT'|'OTHER'`.
- **Response 200 `data`**: `{ files: PropertyFile[]; counts: { total; issues; documents; reports; other } }`. INSP results are masked (`uploadedByUserId: null`). Only READY, non-deleted, non-purged files.
- **Used by**: `usePropertyFiles(appointmentId)` → Documents/Reports/Other subtabs + per-type counts.

## 2. `GET /v1/property-issues` — list issues for an appointment

- **Query**: `{ appointmentId: string(uuid) }` (INSP must pass it).
- **Response 200 `data`**: `{ issues: PropertyIssue[] }`, each with `photos: PropertyFile[]`. INSP masked (`createdByUserId`/`cantDoEventId` null).
- **Used by**: `usePropertyIssues(appointmentId)` → Issues subtab (all origins).

## 3. `POST /v1/property-files/presign` — presign an issue photo

- **Body**: `{ propertyId: uuid; appointmentId?: uuid; type: 'ISSUE'; fileName: string; mime: string; sizeBytes?: number }`. INSP may presign **only `type:'ISSUE'`** on a visible appointment.
- **Response 201 `data`**: `{ fileId: uuid; uploadUrl: uri; storageKey: string; expiresAt: string }` (upload URL TTL 900 s).
- **Errors**: 503 → `FILE_STORAGE_UNAVAILABLE_MESSAGE`; 400 bad MIME (C.A5); 403/404 out-of-scope.
- **Used by**: `useIssuePhotoUpload` (step 1).

## 4. `PUT <uploadUrl>` — upload bytes to the signed URL

- **Not a `/v1` route** — a Supabase signed URL. Plain `fetch(uploadUrl, { method:'PUT', body: file, headers: { 'Content-Type': mime } })` (the presign `Content-Type` must match). Bypasses the typed `api` client (no auth header). Mirrors `AvatarUploader`.
- **Used by**: `useIssuePhotoUpload` (step 2).

## 5. `POST /v1/property-files/confirm` — confirm an uploaded photo

- **Headers**: `Idempotency-Key` **required** (D24; backend hashes `{fileId, actor}`).
- **Body**: `{ fileId: uuid }`.
- **Response 200 `data`**: the full `PropertyFile` DTO. For an issue photo (`type='ISSUE'`, not yet linked) `status` stays **`PENDING`**. INSP confirming a non-ISSUE file → **404** (never revealed).
- **Errors**: 503 → `FILE_STORAGE_UNAVAILABLE_MESSAGE`; 400 size/magic-byte mismatch (C.A5).
- **Used by**: `useIssuePhotoUpload` (step 3).

## 6. `POST /v1/property-issues` — create an issue (+ link photos)

- **Headers**: `Idempotency-Key` **required** (D24).
- **Body**: `{ propertyId: uuid; appointmentId?: uuid; reason: string(1..1000); photoFileIds?: uuid[]; cantDoEventId?: uuid }`. For INSP the backend forces `source='INSPECTOR'`, requires a visible appointment, and ownership-verifies `cantDoEventId` (must be the inspector's own `CANT_DO` for that appointment).
- **Response 201 `data`**: the `PropertyIssue` DTO (with `photos`). Linking is atomic: all `photoFileIds` must flip PENDING→READY+link or the call is **409** (`PropertyIssuePhotoLinkError`) and rolls back; too many photos → `PropertyIssueTooManyPhotosError`.
- **Used by**: `useCreatePropertyIssue` (Report-issue submit and Can't-do-with-photos submit).

## 7. `GET /v1/property-files/{id}/download` — signed download URL

- **Path**: `{ id: uuid }`. **Response 200 `data`**: `{ url: uri; expiresAt: string }` (TTL 300 s). Scope-checked; out-of-scope → 404 (C.A2).
- **Used by**: `useFileDownload(fileId)` → open the signed URL (image preview `<img>`, PDF new tab, or download).

## Also consumed (unchanged, F03-3)

- `POST /v1/inspector/appointments/:appointmentId/cant-do` → `{ eventId; appointmentId; appointmentStatus:'REJECTED'; occurredAt; executionAbandoned }`. `useReportCantDo` is changed to **return** this (for `cantDoEventId`); request body is unchanged.

## NOT consumed by this slice (other F10 tasks / roles)

`POST /v1/property-files/:id/versions`, `DELETE /v1/property-files/:id`, `GET /v1/property-issues/unseen-count`, `POST /v1/property-issues/:id/seen`, `DELETE /v1/property-issues/:id` — all AM/OP/CL_ADMIN (web, TASK-F10-2). The portal routes are TASK-F10-4.
