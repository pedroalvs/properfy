# Property File Retention Runbook

> **Correction (F10-1):** this runbook previously described an `InspectionAsset`
> model and a manual archival process. That model **never shipped** (it was
> documented but never migrated). The real file repository is F10's
> `property_files` / `property_issues` (tenant-scoped), and retention is an
> **automated** daily pg-boss job — not a manual process.

## Overview

Property files (issue photos, documents, reports, other) are stored in the
private Supabase Storage bucket `inspection-assets`. The daily job
`property-file.retention` purges storage objects according to the configurable
`propertyFiles` platform setting, so storage does not grow unbounded.

## Storage layout

Keys follow the shared grammar (`packages/shared/src/constants/property-files.ts`):

- Authenticated files: `files/{tenantId}/{propertyId}/{fileId}.{ext}`
- Rental-tenant portal issue photos: `files/{tenantId}/tenant-issues/{appointmentId}/{fileId}.{ext}`

Each `property_files` row references its object via `storage_key` (`UNIQUE`).

## Configuration (`propertyFiles` platform setting)

Set via `PUT /v1/platform-settings/propertyFiles` (AM/OP). Relevant keys:

| Key | Default | Meaning |
|---|---|---|
| `retentionDays` | `null` | Purge **active** files older than this many days. `null` = keep everything. |
| `deletedRetentionDays` | `365` | Purge **soft-deleted** files this many days after deletion. |

(`allowedMimes`, `maxFileSizeMb`, `issueImageMimes`, `maxPhotosPerIssue` govern upload validation, not retention.)

## The job (`property-file.retention`)

Scheduled daily at **04:00 Australia/Sydney** (`main/workers.ts`), running
`PropertyFileRetentionWorker`. Three steps, each deleting the storage object,
stamping `purged_at`, and auditing `property_file.purged`:

1. **Deleted beyond retention** — soft-deleted `READY` files past
   `deletedRetentionDays`.
2. **Active beyond retention** — when `retentionDays` is non-null, active
   `READY` files past it. A purged issue photo leaves its issue intact (the card
   then shows "Photo removed (retention)").
3. **Orphaned PENDING uploads** — `PENDING` rows older than 24 h (a presigned
   upload that was never confirmed): the object is deleted (not-found ignored),
   the row soft-deleted, and `purged_at` set.

A failure on one row is logged (`property_file.purge_failed`) and never aborts
the batch. The job processes up to 50 batches of 200 rows per step per run;
anything left over is handled on the next day's run.

## Operational checks

- **Confirm the job runs:** look for `property_file.retention_completed` logs
  (with `deletedPurged` / `activePurged` / `orphansPurged` counts).
- **Audit trail:** `property_file.purged` audit entries record each purge
  (`actorType: SYSTEM`, `reason: deleted_retention | active_retention | pending_orphan`).
- **Manual trigger (if ever needed):** the job is a standard pg-boss schedule;
  there is no manual archival step.

## Hard delete (tenant / property)

Hard-delete runbooks remove `property_files` and `property_issues` rows together
with the owning tenant/property (see `tenant-hard-delete.md` /
`property-hard-delete.md`). The storage objects themselves are removed by the
retention job once the rows are purged; a full hard delete should also delete the
`files/{tenantId}/...` prefix from the bucket out of band.
