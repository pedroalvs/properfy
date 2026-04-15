# CORRECTION-007 — Production Reconciliation Runbook

**Status**: Pending — operator action required
**Owner**: _unassigned_
**Target environment**: Supabase production database
**Repository prereq**: the in-repo fixes from the CORRECTION-007 sprint (2026-04-13) must be deployed to `main` or `staging` before running this runbook. If the fixes are not yet merged, stop.
**Estimated duration**: 20–30 minutes of attended operator time, plus a read-only diagnostic pass beforehand
**Last reviewed**: 2026-04-13

---

## Purpose

Reconcile three out-of-band changes that exist on the Supabase production database but that the repository's `prisma/migrations/` chain did not cleanly account for until the CORRECTION-007 sprint:

1. **Failed migration row** for `20260407000003_add_tenant_id_to_service_regions` in the `_prisma_migrations` table. Since this row exists in a `finished_at IS NULL` state, every subsequent `prisma migrate deploy` against production rejects with `P3009`.
2. **The `audit_logs` GIN fulltext index** may or may not exist in production. The original migration SQL referenced the wrong table name (`"AuditLog"` instead of `"audit_logs"`) and was never successfully applied to a fresh database. Production's actual state is unknown from the repository.
3. **The `password_reset_tokens` table** exists in production (the feature is live) but had no migration until the CORRECTION-007 sprint. The new migration `20260406000000_add_password_reset_tokens` must be registered as **already applied** — it must not run, since the table already exists.

After this runbook, production and the repository migration chain will be aligned and future `prisma migrate deploy` calls will apply cleanly.

---

## Pre-flight — read-only diagnostic (run first, record output)

These commands do not modify the database. Run them before any write command and record each result in a dev notebook.

### 1. Confirm the current `_prisma_migrations` state

```sql
-- Connect to Supabase production as the service-role user.
-- Run in the Supabase SQL editor or via `psql` on a trusted workstation.

SELECT
  migration_name,
  started_at,
  finished_at,
  logs,
  rolled_back_at
FROM _prisma_migrations
WHERE migration_name IN (
  '20260406000000_add_password_reset_tokens',
  '20260407000003_add_tenant_id_to_service_regions',
  '20260407000003_add_partial_unique_index_service_price_rules_null_branch',
  '20260408000002_add_audit_logs_fulltext_index'
)
ORDER BY started_at ASC;
```

**Expected findings**:

| migration_name | expected `finished_at` | Notes |
|---|---|---|
| `20260406000000_add_password_reset_tokens` | `NULL` (row does not exist) | This is a new migration from the sprint; production has never seen its name. |
| `20260407000003_add_tenant_id_to_service_regions` | **`NULL`** with `rolled_back_at` also `NULL` | Known failed row. `logs` column will contain the failure message. |
| `20260407000003_add_partial_unique_index_service_price_rules_null_branch` | `not null` (applied successfully) | Should be fine. |
| `20260408000002_add_audit_logs_fulltext_index` | unknown — check | Record the actual state. The most likely outcome is `NULL` (also failed). |

Record the actual values. Any deviation from the expected state changes the remediation — stop and escalate if the results look nothing like the table above.

### 2. Confirm the current schema state of `service_regions`

```sql
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'service_regions'
  AND column_name = 'tenant_id';
```

**Expected**: a single row with `column_name = 'tenant_id'`, `data_type = 'text'`, `is_nullable = 'NO'`. If it comes back with `is_nullable = 'YES'` or with zero rows, the production schema has drifted further and this runbook is not sufficient — stop and escalate.

```sql
-- Confirm the composite unique index exists
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'service_regions'
  AND indexname = 'service_regions_tenant_id_name_key';

-- Confirm the FK to tenants exists
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name = 'service_regions'
  AND constraint_name = 'service_regions_tenant_id_fkey';
```

**Expected**: one row each. If both match the migration's target state, the CORRECTION-004 work **did apply** despite the failed `_prisma_migrations` row — Prisma's error was cosmetic. If either is missing, the migration needs to be re-applied (see Branch B below).

### 3. Confirm the `audit_logs` fulltext index state

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'audit_logs'
  AND indexname = 'AuditLog_fulltext_idx';
```

**Expected**: either zero rows (index does not exist) or one row (index already exists). Both states are recoverable — the remediation differs.

### 4. Confirm `password_reset_tokens` exists

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'password_reset_tokens'
ORDER BY ordinal_position;
```

**Expected**: six columns matching the schema in `prisma/schema.prisma` (`id text NOT NULL`, `user_id text NOT NULL`, `token_hash text NOT NULL`, `expires_at timestamp`, `used_at timestamp nullable`, `created_at timestamp NOT NULL default now()`). If the columns do not match, stop and escalate — the production table was hand-patched and is not compatible with the new migration.

```sql
-- Confirm the FK to users exists
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name = 'password_reset_tokens'
  AND constraint_name LIKE '%user_id%fkey%';
```

### 5. Take a logical backup (always, no exceptions)

Before any write command against `_prisma_migrations`, take a backup. Supabase provides point-in-time recovery, but a named backup is cheap insurance.

```bash
# Replace <connection-string> with the Supabase connection string.
# This is a read-only operation; no data changes.
pg_dump --schema-only "<connection-string>" > /tmp/correction-007-pre-cleanup.sql

# Also dump just _prisma_migrations for fast rollback
pg_dump --data-only --table=_prisma_migrations "<connection-string>" > /tmp/correction-007-prisma-migrations-backup.sql
```

Keep both files until at least 24 hours after the runbook completes successfully.

---

## Remediation (read Pre-flight first)

Pick the branch that matches the state you observed in the diagnostic.

### Branch A — `service_regions.tenant_id` is NOT NULL + index + FK all exist (most likely)

This means the migration's schema changes **did** apply despite the `_prisma_migrations` row being left in a failed state. The schema is fine; only the ledger is stale.

**Action 1**: mark the service_regions migration as applied.

```bash
# Run from a trusted workstation with the production DATABASE_URL.
# This writes a single row to _prisma_migrations — no schema changes.
DATABASE_URL="<supabase-production-url>" \
DIRECT_URL="<supabase-production-direct-url>" \
  npx prisma migrate resolve \
    --applied 20260407000003_add_tenant_id_to_service_regions \
    --schema apps/backend/prisma/schema.prisma
```

**Expected output**: `Migration 20260407000003_add_tenant_id_to_service_regions marked as applied.`

**Risk**: LOW. `resolve --applied` only updates `_prisma_migrations.finished_at`; it does not run any DDL. If the schema state does not match the migration's intent, future migrations will hit the mismatch — the Pre-flight step 2 exists specifically to catch this before the resolve.

**Rollback**: `DELETE FROM _prisma_migrations WHERE migration_name = '20260407000003_add_tenant_id_to_service_regions';` (restores the original failed-row state).

### Branch B — `service_regions.tenant_id` is NULL or column does not exist

This means the migration did not apply and the production schema is actually drifted. **Stop and escalate.** This runbook does not cover this branch — it requires a bespoke corrective migration generated from the actual production state via `prisma db pull`. Do not run the `migrate resolve` above; it would hide a real schema bug.

---

### Action 2 — `password_reset_tokens` migration

**Pre-condition**: Pre-flight step 4 confirmed the table exists with the expected column shape.

```bash
DATABASE_URL="<supabase-production-url>" \
DIRECT_URL="<supabase-production-direct-url>" \
  npx prisma migrate resolve \
    --applied 20260406000000_add_password_reset_tokens \
    --schema apps/backend/prisma/schema.prisma
```

**Expected output**: `Migration 20260406000000_add_password_reset_tokens marked as applied.`

**Risk**: LOW. Same as Action 1 — only the `_prisma_migrations` ledger changes. No DDL runs. If the production table does not match the migration (step 4 caught this), `resolve --applied` does nothing visible now but will let future `migrate deploy` proceed on a stale state — which is why step 4 must pass before running this command.

**Rollback**: `DELETE FROM _prisma_migrations WHERE migration_name = '20260406000000_add_password_reset_tokens';`.

---

### Action 3 — `audit_logs` fulltext index (depends on state)

**If** Pre-flight step 3 showed the index already exists in production (with the original broken name `AuditLog_fulltext_idx` but on the `audit_logs` table — which would be surprising but possible if someone patched by hand):

```bash
DATABASE_URL="<supabase-production-url>" \
DIRECT_URL="<supabase-production-direct-url>" \
  npx prisma migrate resolve \
    --applied 20260408000002_add_audit_logs_fulltext_index \
    --schema apps/backend/prisma/schema.prisma
```

**If** Pre-flight step 3 showed the index does NOT exist (most likely, since the original migration was broken):

The fixed migration SQL uses `CREATE INDEX IF NOT EXISTS`, so when `prisma migrate deploy` runs next against production, it will create the index and mark the migration as applied in the normal flow. **No `resolve` needed.** Just let the next deploy apply it.

However — if the migration is in a failed state on production (Pre-flight step 1 showed a row with NULL `finished_at` for this migration name), Prisma will refuse to apply anything else. You must first:

```bash
# Mark as rolled-back so deploy can re-run the fixed SQL
DATABASE_URL="<supabase-production-url>" \
DIRECT_URL="<supabase-production-direct-url>" \
  npx prisma migrate resolve \
    --rolled-back 20260408000002_add_audit_logs_fulltext_index \
    --schema apps/backend/prisma/schema.prisma

# Then apply the fixed migration on the next deploy
DATABASE_URL="<supabase-production-url>" \
DIRECT_URL="<supabase-production-direct-url>" \
  npx prisma migrate deploy \
    --schema apps/backend/prisma/schema.prisma
```

**Risk**: MEDIUM. `migrate deploy` will actually run the fixed SQL against production. The SQL is `CREATE INDEX IF NOT EXISTS "AuditLog_fulltext_idx" ON "audit_logs" USING GIN (...)`, which is idempotent and reversible via `DROP INDEX IF EXISTS "AuditLog_fulltext_idx"`. The index build itself is a non-blocking operation in Postgres but can take time on a large `audit_logs` table (estimate: a few seconds per 100k rows on typical hardware). If production has tens of millions of rows, consider running it in a maintenance window.

**Rollback**: `DROP INDEX IF EXISTS "AuditLog_fulltext_idx";` + `DELETE FROM _prisma_migrations WHERE migration_name = '20260408000002_add_audit_logs_fulltext_index';`.

---

## Post-flight verification

After all three actions, run `migrate status` to confirm the ledger is clean:

```bash
DATABASE_URL="<supabase-production-url>" \
DIRECT_URL="<supabase-production-direct-url>" \
  npx prisma migrate status \
    --schema apps/backend/prisma/schema.prisma
```

**Expected output**: `Database schema is up to date!` with zero pending, zero failed, zero unknown migrations.

Then run a no-op deploy to confirm it is idempotent:

```bash
DATABASE_URL="<supabase-production-url>" \
DIRECT_URL="<supabase-production-direct-url>" \
  npx prisma migrate deploy \
    --schema apps/backend/prisma/schema.prisma
```

**Expected output**: `No pending migrations to apply.`

Run a few read-only smoke queries:

```sql
-- Confirm the fulltext index exists and is on the right table
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND indexname = 'AuditLog_fulltext_idx';

-- Confirm password_reset_tokens matches the schema
SELECT COUNT(*) FROM password_reset_tokens; -- should return a number, not an error

-- Confirm the retention category seed is in place
SELECT name, retention_years FROM audit_retention_category_configs
ORDER BY name;

-- Confirm service_regions.tenant_id is still NOT NULL
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name = 'service_regions' AND column_name = 'tenant_id';
```

---

## What to do if anything goes wrong

1. **Stop.** Do not run additional commands.
2. Save the Supabase connection log and the error message.
3. Restore `_prisma_migrations` from the backup taken in Pre-flight step 5:
   ```bash
   psql "<supabase-production-url>" -c 'TRUNCATE TABLE _prisma_migrations;'
   psql "<supabase-production-url>" < /tmp/correction-007-prisma-migrations-backup.sql
   ```
4. Escalate to the on-call DBA or the repository owner. Include the diagnostic output from Pre-flight steps 1–4 and the error message from the failing command.

---

## Sign-off

When the runbook completes successfully, record the following in the runbook's change log and in `specs/GAPS.md` → CORRECTION-007:

- Date of execution
- Operator name
- Pre-flight findings (Branch A vs B)
- Which actions were required (Action 1, Action 2, Action 3 variant)
- Post-flight verification outcome
- Any anomalies

Then mark CORRECTION-007 as `RESOLVED — production reconciled (<date>)` in `specs/GAPS.md`.

## Change log

| Date | Change | Author |
|---|---|---|
| 2026-04-13 | Runbook written during CORRECTION-007 sprint. | Engineering |
