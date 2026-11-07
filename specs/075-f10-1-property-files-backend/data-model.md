# Phase 1 Data Model — Property Files & Issues (TASK-F10-1)

Two **tenant-scoped** tables in one expand-only migration. Both carry `tenant_id` (D5) — they are standard tenant-scoped entities, **not** a platform exception (contrast: `DayPlan`/`InspectorNotice`/`PlatformSetting` which have no `tenant_id`). The `PlatformSetting propertyFiles` key itself stays platform-scoped (no `tenant_id`), unchanged.

## Enums

| Enum | Values | Notes |
|---|---|---|
| `PropertyFileType` | `ISSUE`, `DOCUMENT`, `REPORT`, `OTHER` | Only `ISSUE` carries `issue_id` (when `READY`) and participates in the issue log. |
| `PropertyFileStatus` | `PENDING`, `READY` | `PENDING` at presign; `READY` after confirm (non-issue) or after issue creation (issue photos, D20). |
| `PropertyIssueSource` | `INSPECTOR`, `STAFF`, `RENTAL_TENANT_PORTAL` | Server-derived from the actor's role (R11), never client-supplied. |

(Modeled as Prisma enums or as `TEXT` + `CHECK` — follow the module precedent in `schema.prisma`; the migration SQL in the spec uses `TEXT CHECK (… IN (…))`.)

## Table: `property_issues`

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| `id` | UUID | PK, `DEFAULT gen_random_uuid()` | |
| `tenant_id` | UUID | NOT NULL → `tenants(id)` | Agency scope (D5). |
| `property_id` | UUID | NOT NULL → `properties(id)` | Owning property. |
| `appointment_id` | UUID | NULL → `appointments(id)` | Optional; if set, MUST belong to the same `property_id` + `tenant_id` (use-case validated, D1). |
| `reason` | TEXT | NOT NULL, `CHECK (char_length(reason) BETWEEN 1 AND 1000)` | The problem description. |
| `source` | TEXT | NOT NULL, `CHECK (source IN ('INSPECTOR','STAFF','RENTAL_TENANT_PORTAL'))` | Provenance (R11). |
| `created_by_user_id` | UUID | NULL → `users(id)` | Author; NULL for the rental tenant. |
| `cant_do_event_id` | UUID | NULL → `inspector_field_events(id)` | Links a PWA "Can't do" event (F03-2) when the issue was created from it (D18). |
| `seen_at` | TIMESTAMPTZ | NULL | Set by mark-as-seen (CAS, D23). |
| `seen_by_user_id` | UUID | NULL → `users(id)` | Who marked it seen. |
| `deleted_at` | TIMESTAMPTZ | NULL | Soft delete. |
| `deleted_by_user_id` | UUID | NULL → `users(id)` | |
| `created_at` | TIMESTAMPTZ | NOT NULL `DEFAULT now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL `DEFAULT now()` | |

**Lifecycle**: created (unseen) → marked seen (`seen_at`/`seen_by_user_id`, one-way CAS) → optionally soft-deleted (AM/OP). An issue may have **0** photos ("No photos", D27). Deleting an issue soft-deletes its `issue_id` photos too (D27); a retention purge of a photo does **not** delete the issue.

## Table: `property_files`

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| `id` | UUID | PK, `DEFAULT gen_random_uuid()` | |
| `tenant_id` | UUID | NOT NULL → `tenants(id)` | Agency scope (D5). |
| `property_id` | UUID | NOT NULL → `properties(id)` | Owning property. |
| `appointment_id` | UUID | NULL → `appointments(id)` | Optional in any type; equals the issue's for an issue photo (D1). |
| `issue_id` | UUID | NULL → `property_issues(id)` | Required for a `READY` `ISSUE` photo; NULL for other types; relaxed-NULL while `PENDING` (D20). |
| `type` | TEXT | NOT NULL, `CHECK (type IN ('ISSUE','DOCUMENT','REPORT','OTHER'))` | |
| `version_group_id` | UUID | NOT NULL | Groups versions of one logical file. |
| `version` | INTEGER | NOT NULL `DEFAULT 1` | Sequential within the group. |
| `file_name` | TEXT | NOT NULL | Original name. |
| `mime` | TEXT | NOT NULL | Declared MIME (validated against the sniffed one at confirm). |
| `size_bytes` | BIGINT | NOT NULL | Real size from `headObject` at confirm. |
| `storage_key` | TEXT | NOT NULL | Built via the shared grammar (D25); bucket `inspection-assets`. |
| `status` | TEXT | NOT NULL `DEFAULT 'PENDING'`, `CHECK (status IN ('PENDING','READY'))` | |
| `uploaded_by_user_id` | UUID | NULL → `users(id)` | Author; NULL for the rental tenant. |
| `deleted_at` | TIMESTAMPTZ | NULL | Soft delete. |
| `deleted_by_user_id` | UUID | NULL → `users(id)` | |
| `purged_at` | TIMESTAMPTZ | NULL | Set when the retention job removed the storage object (D8/D22/D27). |
| `created_at` | TIMESTAMPTZ | NOT NULL `DEFAULT now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL `DEFAULT now()` | |

### Constraints

```sql
-- D20: issue_id required for a READY ISSUE photo; free while PENDING; forbidden for other types
CONSTRAINT issue_id_matches_type CHECK (
  status = 'PENDING'
  OR (type = 'ISSUE' AND issue_id IS NOT NULL)
  OR (type <> 'ISSUE' AND issue_id IS NULL)
),
CONSTRAINT uq_version     UNIQUE (version_group_id, version),  -- version race → 23505 retry (R12)
CONSTRAINT uq_storage_key UNIQUE (storage_key)                 -- one row per object
```

**Lifecycle**: `PENDING` (presign) → `READY` (confirm, for non-issue; or inside issue creation for issue photos, D20) → optionally soft-deleted → `purged_at` set by retention. An issue photo confirmed but never linked to an issue stays `PENDING` and is swept after 24 h (D22).

### Partial indexes (raw SQL in the migration — Prisma can't express them; drift check won't drop them, R14)

```sql
-- property_issues: indicators / unseen-count (D26)
CREATE INDEX ON property_issues (tenant_id, appointment_id) WHERE seen_at IS NULL AND deleted_at IS NULL;
CREATE INDEX ON property_issues (tenant_id, property_id)    WHERE appointment_id IS NULL AND seen_at IS NULL AND deleted_at IS NULL; -- Properties yellow dot (no-appointment issues)
CREATE INDEX ON property_issues (tenant_id, property_id)    WHERE seen_at IS NULL AND deleted_at IS NULL;                            -- property row border (any unseen issue)
-- property_files: sub-tab listings
CREATE INDEX ON property_files (property_id, type)    WHERE deleted_at IS NULL;
CREATE INDEX ON property_files (appointment_id, type) WHERE deleted_at IS NULL;
CREATE INDEX ON property_files (issue_id)             WHERE deleted_at IS NULL;
-- retention sweeps
CREATE INDEX ON property_files (created_at) WHERE status = 'PENDING' AND purged_at IS NULL;
CREATE INDEX ON property_files (deleted_at) WHERE deleted_at IS NOT NULL AND purged_at IS NULL;
```

## Relationships

- `property_issues.property_id` → `properties` (N:1); `property_issues.appointment_id` → `appointments` (N:1, optional).
- `property_files.property_id` → `properties` (N:1); `property_files.appointment_id` → `appointments` (N:1, optional); `property_files.issue_id` → `property_issues` (N:1, optional — the photos of an issue).
- `property_issues.cant_do_event_id` → `inspector_field_events` (N:1, optional; F03-2 FK — dependency gate).
- All author/seer/deleter columns → `users`.

## Validation rules (enforced in use cases / Zod, not only the DB)

- `reason`: 1–1000 chars (Zod + DB CHECK).
- `appointmentId` (when present): must belong to `propertyId` + `tenantId` (D1).
- Presign MIME ∈ `allowedMimes` (non-issue) or `issueImageMimes` (issue photo).
- Confirm: `exists` true; `sizeBytes ≤ maxFileSizeMb`; sniffed MIME compatible with declared (R2).
- Issue creation: ≤ `maxPhotosPerIssue` photos; all referenced photos link (else 409, D20); portal effective max `min(PORTAL_MAX_PHOTOS_PER_ISSUE, maxPhotosPerIssue)` (F10-4).
- Version: `version = max(existing) + 1`, unique per group (23505 retry).
- Mark-as-seen: only when `seen_at IS NULL AND deleted_at IS NULL` (CAS).

## Platform setting `propertyFiles` (registry key, F03-1 — platform-scoped, no `tenant_id`)

| Field | Type | Default | Bounds |
|---|---|---|---|
| `allowedMimes` | `string[]` | jpeg, png, heic, webp, pdf, docx, xlsx (full MIME strings) | non-empty |
| `maxFileSizeMb` | int | `20` | 5–200 |
| `issueImageMimes` | `string[]` | jpeg, png, heic, webp | non-empty |
| `maxPhotosPerIssue` | int | `10` | 1–20 |
| `retentionDays` | int \| null | `null` | null = keep all; else ≥ 1 |
| `deletedRetentionDays` | int | `365` | 30–3650 |

Registered as a single Zod object under `section: 'Property files'` (D29), read through the existing cached `platform-settings` reader service.

## Modified payloads (no new business columns — payload-only)

- `GET /v1/appointments` (list item): `+ hasUnseenIssues: boolean` (unseen, non-deleted issue linked to the appointment; `false` for CL_USER/INSP) — added to the shared list-item schema.
- `GET /v1/properties` (list item): `+ hasUnseenIssues: boolean` (any unseen, non-deleted issue of the property; `false` for CL_USER/INSP).
- `GET /v1/appointments/:id` and `GET /v1/properties/:id`: `+ fileCounts: { total, issues, documents, reports, other }` (non-deleted `READY` files).
- Both lists accept a `withIssues` boolean query filter (has any issue; the test matrix also covers has-unseen-issue).
