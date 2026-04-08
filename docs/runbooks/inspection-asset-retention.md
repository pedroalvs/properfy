# Inspection Asset Retention Runbook

## Overview

Inspection assets (photos, documents, signatures) are stored in Supabase Storage with no automated retention policy. Over time, completed inspections accumulate large volumes of binary data that increase storage costs without providing operational value.

This runbook describes the recommended manual process for archiving old inspection assets. Automated scheduled jobs are deferred to a future phase.

## Storage layout

Assets are stored in the Supabase Storage bucket under paths following the pattern:

```
inspections/{executionId}/{assetType}/{filename}
```

Asset types include `PHOTO`, `DOCUMENT`, and `SIGNATURE`, as defined by the `InspectionAssetType` enum.

Each `InspectionAsset` record in the database references its storage path via the `file_key` column.

## Retention policy

| Age | Action |
|---|---|
| 0-12 months | Active storage (hot tier, no action) |
| 12-24 months | Move to cold storage bucket or Supabase Storage archive tier |
| 24+ months | Evaluate deletion based on legal/contractual requirements |

**Important:** Only assets belonging to **completed** executions (status `DONE`) are eligible for archiving. Never archive assets for executions in progress or linked to open/disputed appointments.

## Pre-archive checklist

1. **Verify execution status.** Query `inspection_executions` to confirm `status = 'DONE'` and the parent appointment is also `DONE`.
2. **Verify age threshold.** Only process assets where `inspection_executions.completed_at` is older than 12 months.
3. **Check for active disputes or audits.** If the appointment has any unresolved financial adjustments, refunds, or audit flags, skip it.
4. **Confirm backup.** Ensure Supabase point-in-time recovery is active and recent.

## Archive procedure

### 1. Identify eligible assets

```sql
SELECT ia.id, ia.file_key, ie.completed_at
FROM inspection_assets ia
JOIN inspection_executions ie ON ie.id = ia.execution_id
JOIN appointments a ON a.id = ie.appointment_id
WHERE ie.status = 'DONE'
  AND a.status = 'DONE'
  AND ie.completed_at < NOW() - INTERVAL '12 months'
ORDER BY ie.completed_at ASC;
```

### 2. Copy assets to cold storage

Use the Supabase CLI or S3-compatible tooling to copy files from the active bucket to the archive bucket:

```bash
# Example using s3cmd or aws CLI with Supabase S3 endpoint
aws s3 cp s3://active-bucket/inspections/{executionId}/ \
          s3://archive-bucket/inspections/{executionId}/ \
          --recursive \
          --endpoint-url $SUPABASE_S3_ENDPOINT
```

### 3. Verify copy integrity

Compare checksums between source and destination for each file before proceeding.

### 4. Update database references (optional)

If the archive bucket uses a different base URL, update the `file_key` or add an `archived_at` timestamp to the `inspection_assets` table:

```sql
UPDATE inspection_assets
SET archived_at = NOW()
WHERE id IN (...archived asset IDs...);
```

### 5. Remove from active storage

Only after successful verification:

```bash
aws s3 rm s3://active-bucket/inspections/{executionId}/ \
          --recursive \
          --endpoint-url $SUPABASE_S3_ENDPOINT
```

### 6. Log the operation

Record the archive operation in the audit log with:
- Number of assets archived
- Execution IDs affected
- Operator who performed the action
- Date and time

## Cascade order

1. Check appointment status is `DONE`
2. Check execution status is `DONE`
3. Check no active disputes/adjustments
4. Copy assets to cold storage
5. Verify copy
6. Update database records
7. Remove from active storage

## Rollback

If issues are discovered after archiving:

1. Copy files back from the archive bucket to the active bucket.
2. Revert any `archived_at` timestamps in the database.
3. Verify application access to restored files.

## Frequency

Recommended: quarterly review. Run the identification query monthly to monitor growth.

## Future automation (Phase 3+)

A pg-boss scheduled job (`asset.archive`) can automate steps 1-6 with idempotency keys per execution ID. This is deferred from Phase 2 to avoid introducing complexity before the retention policy is validated operationally.
