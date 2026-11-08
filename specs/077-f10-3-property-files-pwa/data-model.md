# Phase 1 — Data Model

This slice defines **no** persisted entities (all storage is backend-owned, F10-1). It (a) consumes two DTOs from the committed contract and (b) introduces one **client-side** state machine for per-photo upload.

## Consumed DTOs (from `@properfy/shared`, generated — do not redefine)

### PropertyFileResponse (`propertyFileResponseSchema`)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `propertyId` | uuid | |
| `appointmentId` | uuid \| null | the appointment the file is attached to |
| `issueId` | uuid \| null | set when `type='ISSUE'` and the photo is linked |
| `type` | `'ISSUE' \| 'DOCUMENT' \| 'REPORT' \| 'OTHER'` | `PropertyFileType` |
| `versionGroupId` | uuid | versioning (web-only concern; PWA reads latest) |
| `version` | number | |
| `fileName` | string | |
| `mime` | string | |
| `sizeBytes` | number | |
| `status` | `'PENDING' \| 'READY'` | PWA lists only READY; a freshly confirmed issue photo is PENDING until create-issue |
| `uploadedByUserId` | string \| null | **masked (null) for INSP** by the backend |
| `createdAt` | string (instant) | |

`GET /v1/property-files` response `data`: `{ files: PropertyFileResponse[]; counts: { total, issues, documents, reports, other } }`.

### PropertyIssueResponse (`propertyIssueResponseSchema`)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `propertyId` | uuid | |
| `appointmentId` | uuid \| null | |
| `reason` | string | 1–1000 chars |
| `source` | `'INSPECTOR' \| 'STAFF' \| 'RENTAL_TENANT_PORTAL'` | drives the origin badge |
| `createdByUserId` | string \| null | **masked (null) for INSP** |
| `cantDoEventId` | string \| null | **masked (null) for INSP** |
| `seenAt` / `seenByUserId` | string \| null | web "Mark as seen" only; PWA ignores |
| `createdAt` | string (instant) | |
| `photos` | `PropertyFileResponse[]` | 0..N issue photos (READY) |

`GET /v1/property-issues` response `data`: `{ issues: PropertyIssueResponse[] }`.

## Client-side upload state machine (new, `useIssuePhotoUpload`)

Each selected photo is tracked locally with this lifecycle. State lives in the sheet (Report-issue or Can't-do); it is **not** persisted (online-only, no IndexedDB).

```text
             select file
                 │
                 ▼
   ┌──────────── UPLOADING ───────────┐
   │  presign → PUT(signed) → confirm │
   └──────────────┬───────────────────┘
          success │           │ failure (4xx/5xx/network)
                  ▼           ▼
              CONFIRMED     FAILED ──(retry)──▶ UPLOADING
                  │           │
                  │           └──(remove)──▶ (dropped)
                  ▼
           (collected into photoFileIds on submit)
```

### LocalPhoto (view model)

| Field | Type | Notes |
|---|---|---|
| `localId` | string | client-generated key for the list row |
| `file` | `File` | the picked blob (kept for retry until CONFIRMED) |
| `previewUrl` | string \| null | `URL.createObjectURL(file)` for the thumbnail (revoked on remove/unmount) |
| `status` | `'uploading' \| 'confirmed' \| 'failed'` | |
| `progress` | number (0–100) \| null | per-photo progress (coarse: 0 at presign, ~50 after presign, 100 after confirm; best-effort) |
| `fileId` | uuid \| null | set on `confirmed`; collected into `photoFileIds` |
| `error` | string \| null | set on `failed` (mapped message) |

**Invariants**

- Submit is enabled only when **no** photo is `uploading` and **no** photo is `failed` (all either `confirmed` or removed) — enforces D12 ("the issue is created only when all intended photos confirm, or the user removes the failed ones").
- `photoFileIds` = the `fileId`s of all `confirmed` photos, in selection order.
- A zero-photo issue is valid (D27): submit allowed with an empty `photoFileIds` as long as the reason is valid.
- Per-issue cap: the submit/add guard uses the backend `maxPhotosPerIssue` (soft client default 10); the backend is authoritative (`PropertyIssueTooManyPhotosError`).
- `previewUrl` object URLs are revoked on remove and on unmount (no leak).

## Validation rules (client, mirroring the shared schemas)

- **reason**: required, `trim()`, 1–1000 chars (`PROPERTY_ISSUE_REASON_MAX = 1000`). Matches `createPropertyIssueSchema.reason`.
- **photo MIME**: picker `accept` from `DEFAULT_PROPERTY_FILES_SETTING.issueImageMimes`; soft guard only — backend presign is authoritative (C.A5).
- **photo size**: soft guard against `DEFAULT_PROPERTY_FILES_SETTING.maxFileSizeMb`; backend confirm is authoritative (rejects oversize + magic-byte mismatch, C.A5).

## Cant-do → issue reason composition (D18)

`reason = `${FieldIssueReasonLabel[reason]}${note ? ' — ' + note.trim() : ''}`` — the decline reason label plus the optional note, trimmed, kept within 1000 chars. `source` is forced to `INSPECTOR` by the backend (never sent by the client). `cantDoEventId = cantDoResponse.eventId`.
