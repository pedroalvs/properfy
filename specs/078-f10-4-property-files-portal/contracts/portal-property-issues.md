# Contract: Portal property issue routes

All routes are token-authenticated via `createPortalTokenMiddleware` (preHandler `portalAuth`); the token param pins the appointment. Error envelope `{ error: { code, message, details? } }`. Instants are UTC ISO. No JWT.

Shared schemas added in `packages/shared/src/schemas/property-files.ts` (portal section) and re-exported from the barrel:

- `portalPresignIssuePhotoSchema` (body)
- `portalPresignIssuePhotoResponseSchema` — `{ fileId, uploadUrl, expiresAt }` (presign response; **no `storageKey`** — it embeds the agency `tenantId` and is not returned to the anonymous tenant)
- `portalConfirmIssuePhotoSchema` (body) — `{ fileId }`
- `portalIssuePhotoResponseSchema` — `{ id, fileName, mime, status, createdAt }` (confirm response AND the issue `photos[]` element)
- `portalCreatePropertyIssueSchema` (body) — `{ reason, photoFileIds? }`
- `portalPropertyIssueResponseSchema` / `portalPropertyIssuesResponseSchema` (list + create response)

---

## 1. `POST /v1/rental-tenant-portal/:token/property-issues/presign`

Presign one issue photo for upload.

- **Auth**: portal token (not read-only).
- **Rate limit**: **12 / token / hour** — `keyGenerator` = hashed token (`tokenService.hashToken`), IP fallback. (The generic 30/min per-IP applies to the other issue routes.)
- **Body** (`portalPresignIssuePhotoSchema`):
  ```json
  { "fileName": "string(1..255)", "mime": "string", "sizeBytes": 12345 }
  ```
  `sizeBytes` optional. No `propertyId`/`appointmentId`/`type` — all derived from the token (type is always `ISSUE`).
- **201** (`portalPresignIssuePhotoResponseSchema`): `{ fileId, uploadUrl, expiresAt }` (no `storageKey`).
- **Errors**: `400` invalid body; MIME not in `issueImageMimes` → clear message (C.A5, presign side); `403`/`410`-style read-only token refusal; `429` rate-limited (retryAfter); `503` storage unconfigured (`FILE_STORAGE_UNAVAILABLE_MESSAGE`).

Server behaviour: resolve `{propertyId, tenantId}` from the token's appointment; build key via `buildPortalIssueStorageKey`; `createSignedUploadUrl`; create `PENDING` ISSUE `PropertyFile` with `issueId=null`, `uploadedByUserId=null`.

## 2. `POST /v1/rental-tenant-portal/:token/property-issues/confirm-upload`

Confirm a presigned photo (verify it really landed and is valid).

- **Auth**: portal token (not read-only).
- **Headers**: `Idempotency-Key` **required** (D24).
- **Rate limit**: generic portal 30/min per IP.
- **Body** (`portalConfirmIssuePhotoSchema`): `{ "fileId": "uuid" }`.
- **200** (`portalIssuePhotoResponseSchema`): `{ id, fileName, mime, status: "PENDING", createdAt }`.
- **Errors**: `400` missing `Idempotency-Key` / invalid body; `404` file not found OR not this token's appointment/tenant OR not `type=ISSUE` (no disclosure, C.A2); `413`/`422`-style too-large → clear message (C.A5); content-mismatch (magic bytes) → clear message (C.A5); `409` idempotency-key reuse with different payload; `503` storage.

Server behaviour: load file; assert `file.appointmentId == token.appointmentId && file.tenantId == scope.tenantId && file.type == ISSUE`; `headObject` exists; `sizeBytes ≤ maxFileSizeMb`; magic-byte sniff `isDetectedMimeCompatible`; re-parse `storageKey` via `parsePortalIssueStorageKey` and assert embedded tenant/appointment match; `confirmUpload(id, size, setReady=false, now)` (keeps PENDING, sets `confirmed_at`); audit `property_file.uploaded` (ANONYMOUS).

## 3. `POST /v1/rental-tenant-portal/:token/property-issues`

Create the issue from a reason + the confirmed photos.

- **Auth**: portal token (not read-only).
- **Headers**: `Idempotency-Key` **required** (D24).
- **Rate limit**: generic portal 30/min per IP.
- **Body** (`portalCreatePropertyIssueSchema`):
  ```json
  { "reason": "string(1..1000, trimmed)", "photoFileIds": ["uuid", "..."] }
  ```
  `photoFileIds` optional; max `min(PORTAL_MAX_PHOTOS_PER_ISSUE=5, maxPhotosPerIssue)`.
- **201** (`portalPropertyIssueResponseSchema`): the created issue in portal DTO shape (`{ id, reason, createdAt, photos[] }`).
- **Errors**: `400` missing `Idempotency-Key` / invalid reason / too many photos; `409` a referenced photo could not be linked (missing/unconfirmed/foreign/already-linked) → rollback (D20), or idempotency mismatch; `422` the token's appointment has no property; `403`/read-only refusal; `503` storage.

Server behaviour (transaction): create `PropertyIssue` (`source=RENTAL_TENANT_PORTAL`, `createdByUserId=null`, token's `tenantId/propertyId/appointmentId`); `linkPendingIssuePhotos` (all-or-409); `listReadyPhotosByIssueIds`; audit `property_issue.created` (ANONYMOUS); return the portal DTO.

## 4. `GET /v1/rental-tenant-portal/:token/property-issues`

List the tenant's own submitted reports for this appointment.

- **Auth**: portal token (read-only allowed).
- **Rate limit**: generic portal 30/min per IP.
- **200** (`portalPropertyIssuesResponseSchema`): `{ issues: PortalPropertyIssue[] }`, newest first, only `source=RENTAL_TENANT_PORTAL` issues of the token's appointment, mapped to the privacy-reduced DTO (no reviewer identity / seen status).
- **Errors**: `503` storage not relevant (DB read); standard portal token errors.

Server behaviour: `issueRepo.listByAppointment(token.appointmentId, scope.tenantId)` → filter `source === RENTAL_TENANT_PORTAL` → `listReadyPhotosByIssueIds` → portal DTO.
