# Database Runbook

## Overview

- **ORM:** Prisma
- **Database:** PostgreSQL (hosted on Supabase)
- **Connection pooling:** PgBouncer (Supabase-managed)
- **Migrations:** Prisma Migrate with expand/contract strategy

---

## Connection Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Application connection string. Points to PgBouncer (`?pgbouncer=true`). Used by Prisma Client at runtime. |
| `DIRECT_URL` | Direct PostgreSQL connection (bypasses PgBouncer). Used by Prisma Migrate for DDL operations. |

PgBouncer does not support DDL statements or advisory locks required by `prisma migrate`. Always use `DIRECT_URL` for migrations.

### Prisma schema datasource configuration

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

---

## Running Migrations

### Development

```bash
# Create a new migration
pnpm prisma migrate dev --name <migration_name>

# Apply pending migrations
pnpm prisma migrate dev

# Generate Prisma Client (after schema changes)
pnpm prisma generate
```

### Staging and Production

```bash
# Apply all pending migrations (non-interactive, safe for CI/CD)
pnpm prisma migrate deploy
```

**Rules:**

1. Always apply migrations to **staging first**, validate, then promote to production.
2. Never edit or delete already-applied migration files.
3. Use the **expand/contract pattern** for breaking schema changes (see below).

### Expand/Contract Pattern

For changes that would break existing code (e.g., renaming a column, changing a type):

1. **Expand:** Add the new column/table alongside the old one. Deploy application code that writes to both.
2. **Migrate data:** Backfill the new column from the old one.
3. **Contract:** Remove the old column/table once all code references are updated. Deploy.

This ensures zero-downtime deployments where old and new application versions can coexist during rolling deploys.

---

## Key Indexes

The following indexes are critical for query performance on high-traffic tables:

| Table | Indexed Columns | Purpose |
|---|---|---|
| `appointments` | `tenant_id` | Multi-tenant isolation |
| `appointments` | `status` | Filtering by state |
| `appointments` | `scheduled_date` | Date range queries, reminder scheduling |
| `appointments` | `service_type_id` | Service type lookups |
| `appointments` | `inspector_id` | Inspector schedule queries |
| `appointments` | `branch_id` | Branch-scoped queries |
| `financial_entries` | `tenant_id` | Multi-tenant isolation |
| `notifications` | `tenant_id`, `status` | Retry polling, status queries |

If query performance degrades, check for missing indexes with:

```sql
-- Find slow queries (if pg_stat_statements is enabled)
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

---

## Backup and Recovery

Backups are managed by Supabase:

- **Automatic backups:** Daily, managed by Supabase infrastructure.
- **Point-in-time recovery:** Available on Supabase Pro plans.
- **Manual backup:** Use `pg_dump` via the direct connection URL if needed.

```bash
pg_dump "$DIRECT_URL" --format=custom --file=backup_$(date +%Y%m%d_%H%M%S).dump
```

### Restoring from Backup

```bash
pg_restore --dbname="$DIRECT_URL" --clean --if-exists backup_YYYYMMDD_HHMMSS.dump
```

After restoring, run `pnpm prisma migrate deploy` to ensure migration state is consistent.

---

## Health Checks

### Application-Level

The API exposes two health endpoints:

**`GET /health`** -- Checks DB connectivity with a 2-second timeout.

```json
// Healthy
{ "status": "ok", "db": "connected", "timestamp": "..." }

// Unhealthy
{ "status": "degraded", "db": "disconnected", "timestamp": "..." }
```

**`GET /ready`** -- Readiness probe, checks DB readiness.

```json
// Ready
{ "status": "ready", "checks": { "db": "ready" }, "timestamp": "..." }

// Not ready (returns 503)
{ "status": "not_ready", "checks": { "db": "not_ready" }, "timestamp": "..." }
```

### Direct DB Connectivity Check

```bash
# Test via psql
psql "$DATABASE_URL" -c "SELECT 1;"

# Test direct connection (bypassing PgBouncer)
psql "$DIRECT_URL" -c "SELECT 1;"
```

---

## Troubleshooting

### Connection Pool Exhaustion

Symptoms: `FATAL: too many connections` or timeouts on DB queries.

1. Check active connections:
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();
   ```

2. Check connection state distribution:
   ```sql
   SELECT state, count(*)
   FROM pg_stat_activity
   WHERE datname = current_database()
   GROUP BY state;
   ```

3. Kill idle-in-transaction connections older than 5 minutes:
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle in transaction'
     AND state_change < NOW() - INTERVAL '5 minutes';
   ```

### Checking pg-boss Schema Health

pg-boss manages its own tables. If jobs are not processing:

```sql
-- Verify pg-boss tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'pgboss'
ORDER BY table_name;

-- Check for locks on pg-boss tables
SELECT relation::regclass, mode, granted
FROM pg_locks
WHERE relation IN (
  SELECT oid FROM pg_class WHERE relnamespace = 'pgboss'::regnamespace
);
```

### Long-Running Queries

```sql
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > INTERVAL '5 minutes'
  AND state != 'idle'
ORDER BY duration DESC;
```

To terminate a long-running query:

```sql
SELECT pg_cancel_backend(<pid>);    -- graceful
SELECT pg_terminate_backend(<pid>); -- forceful
```

---

## Migration Validation (CI)

The CI pipeline runs `prisma migrate diff` as a dry-run to validate that migrations are consistent with the schema. If this fails:

1. Ensure `prisma/schema.prisma` matches the latest migration.
2. Run `pnpm prisma generate` to update the client.
3. If the schema was modified without a migration, create one: `pnpm prisma migrate dev --name <name>`.
