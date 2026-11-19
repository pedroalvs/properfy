# Phase 1 Data Model: Portal property issue

**No new tables, columns, enums, or migrations.** This task reuses the tenant-scoped `property_issues` and `property_files` tables delivered by TASK-F10-1, and the `PropertyIssueSource` enum value `RENTAL_TENANT_PORTAL`.

## Entities (reused)

### PropertyIssue (reused)

Created by this feature with these portal-specific field values:

| Field | Portal value |
|---|---|
| `tenant_id` | resolved from the token's appointment (`findAppointmentScope`) |
| `property_id` | resolved from the token's appointment (must be non-null — else reject) |
| `appointment_id` | the token's appointment id (always set) |
| `reason` | tenant-entered, trimmed, 1–1000 chars |
| `source` | `RENTAL_TENANT_PORTAL` (fixed) |
| `created_by_user_id` | `null` (no authenticated user) |
| `cant_do_event_id` | `null` |
| `seen_at` / `seen_by_user_id` | `null` at creation (staff may mark seen later via F10-1) |

### PropertyFile (reused, `type = ISSUE`)

Created `PENDING` at presign, `confirmed_at` set at confirm (still `PENDING`), flipped to `READY` when the issue is created:

| Field | Portal value |
|---|---|
| `tenant_id` | token's resolved tenant |
| `property_id` | token's resolved property |
| `appointment_id` | token's appointment id (always set) |
| `issue_id` | `null` until the issue is created, then the new issue id |
| `type` | `ISSUE` (fixed) |
| `storage_key` | `files/{tenantId}/tenant-issues/{appointmentId}/{fileId}.{ext}` (`buildPortalIssueStorageKey`) |
| `status` | `PENDING` → (issue created) → `READY` |
| `uploaded_by_user_id` | `null` |
| `mime` / `file_name` / `size_bytes` | declared at presign; `size_bytes` verified at confirm |

### RentalTenantPortalToken (reused, read-only here)

The authorization + scope source. Pins exactly one `appointment_id`. `isReadOnly` (expired/superseded) gates all writes.

## Read-back projection (portal DTO)

The portal list returns a **privacy-reduced** projection — never the F10-1 full issue DTO:

```
PortalPropertyIssue {
  id: uuid
  reason: string
  createdAt: instant
  photos: PortalIssuePhoto[]
}
PortalIssuePhoto {
  id: uuid
  fileName: string
  mime: string
  status: "PENDING" | "READY"
  createdAt: instant
}
```

`PortalIssuePhoto` is the single photo shape used by both the confirm response (where `status` is `PENDING`) and the issue `photos[]` (where it is `READY`).

Excluded on purpose: `source`, `createdByUserId`, `seenAt`, `seenByUserId`, `cantDoEventId`, `appointmentId`, `propertyId`, `storageKey`, `uploadedByUserId`, `version*`. The portal presign response also omits `storageKey` (it embeds the agency's `tenantId` UUID — not returned to the anonymous tenant): `portalPresignIssuePhotoResponseSchema = { fileId, uploadUrl, expiresAt }`.

## State transitions (photo lifecycle)

```
(presign)   → PENDING, issue_id=null, confirmed_at=null
(confirm)   → PENDING, confirmed_at=now      [headObject + size + magic-byte + key↔row checks]
(create issue, atomic) → READY, issue_id=<new issue>   [linkPendingIssuePhotos: all-or-409]
(never submitted, >24h) → purged by F10-1 retention job (no change here)
```

## Scope & isolation rules

- Every write/read uses the `tenantId`/`appointmentId`/`propertyId` resolved from the token — never client input.
- A file/issue not belonging to the token's appointment+tenant is treated as not found (C.A2).
- `property_id = null` on the token's appointment → create-issue rejected (a property issue needs a property).
