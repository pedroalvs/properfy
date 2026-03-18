# Queue and Jobs Runbook

## Architecture

Properfy uses **pg-boss** as its job queue, backed by PostgreSQL. There is no Redis or external message broker. pg-boss manages its own schema (`pgboss.*`) in the same database used by the application.

- Jobs are stored in the `pgboss.job` table.
- Schedules are stored in the `pgboss.schedule` table.
- The queue is enabled via `ENABLE_JOB_QUEUE=true` environment variable.
- On shutdown, the application drains the queue with a 30-second timeout before exiting.

---

## Registered Jobs

### On-demand Jobs (enqueued by application code)

| Job Name | Payload | Description |
|---|---|---|
| `report.generate` | `{ reportId }` | Generate XLSX report file |
| `notification.send` | `{ notificationId }` | Send a single notification via configured channel |
| `property.geocode` | `{ propertyId }` | Geocode a property address via Mapbox |
| `appointment.import` | `{ importId }` | Process bulk appointment import |
| `property.import` | `{ importId }` | Process bulk property import |
| `billing.generate-invoice-file` | `{ invoiceId }` | Generate invoice PDF/file |

### Scheduled Jobs (cron)

| Job Name | Cron | Description |
|---|---|---|
| `notification.retry-poll` | `*/5 * * * *` | Every 5 min: re-enqueue retryable failed notifications |
| `notification.dispatch-reminders` | `0 8 * * *` | Daily 08:00: dispatch tenant reminders (7/5/3 days before) |
| `notification.dispatch-escalations` | `0 8 * * *` | Daily 08:00: dispatch PM escalations and SMS alerts |
| `auth.cleanup-sessions` | `0 2 * * *` | Daily 02:00: purge sessions older than 30 days |
| `report.expire-files` | `0 3 * * *` | Daily 03:00: expire old report files from storage |
| `tenant-portal.expire-tokens` | `*/15 * * * *` | Every 15 min: expire stale portal tokens |
| `inspection-execution.mark-assets-expired` | `*/5 * * * *` | Every 5 min: mark expired inspection assets |
| `inspection-execution.notify-not-started` | `0 * * * *` | Every hour: alert about inspections not started on time |
| `system.dlq-monitor` | `*/5 * * * *` | Every 5 min: check for accumulated failed jobs |

---

## Retry Configuration

Default retry settings for on-demand jobs:

- `retryLimit: 6` (6 total attempts including the first)
- `retryBackoff: true` (exponential backoff)
- Approximate retry schedule: ~15s, ~45s, ~2min, ~5min, ~15min
- `deleteAfterDays: 30` (completed/failed jobs are purged after 30 days)

After all retries are exhausted, the job state becomes `failed` and remains in `pgboss.job` for inspection.

---

## Monitoring Failed Jobs

### Count Failed Jobs by Queue

```sql
SELECT name, count(*)::int AS failed_count
FROM pgboss.job
WHERE state = 'failed'
GROUP BY name
ORDER BY failed_count DESC;
```

### View Recent Failures with Error Details

```sql
SELECT id, name, state, data, output, created_on, completed_on, retry_count
FROM pgboss.job
WHERE state = 'failed'
ORDER BY completed_on DESC
LIMIT 20;
```

The `output` column contains the error message or stack trace from the last attempt.

### Check Job History for a Specific Entity

```sql
-- Example: find all jobs related to a specific notification
SELECT id, name, state, data, created_on, completed_on, retry_count
FROM pgboss.job
WHERE name = 'notification.send'
  AND data->>'notificationId' = '<notification_id>'
ORDER BY created_on DESC;
```

---

## DLQ Monitor

The `system.dlq-monitor` job runs every 5 minutes. It queries `pgboss.job` for failed jobs grouped by queue name. When any queue has 10 or more failed jobs (configurable `threshold`), it logs an error-level alert:

```
DLQ alert: queue "notification.send" has 15 failed jobs (threshold: 10)
```

Queues with fewer failures (but > 0) are logged at warn level. Monitor application logs for `DLQ alert` messages.

---

## Resuming Failed Jobs

pg-boss allows resuming failed jobs, which re-enqueues them for processing:

```typescript
// In application code or a maintenance script
const boss = await getQueue();
await boss.resume('<job_id>');
```

Before resuming, verify:

1. The root cause has been resolved (provider outage fixed, data corrected, etc.).
2. The operation is idempotent -- resuming a `notification.send` job should not send duplicate notifications.
3. Check the `data` payload to confirm it is still valid.

### Bulk Resume for a Queue

```sql
-- Find all failed job IDs for a specific queue
SELECT id FROM pgboss.job
WHERE name = 'notification.send' AND state = 'failed';
```

Then resume each one programmatically, or use pg-boss's built-in methods.

---

## Checking Scheduled Job Registration

```sql
SELECT name, cron, data, created_on, updated_on
FROM pgboss.schedule
ORDER BY name;
```

If a scheduled job is missing, it will be re-registered on the next application restart (schedules are set up in `registerWorkers()`).

---

## Clearing Stuck Jobs

If jobs are stuck in `active` state (e.g., after a crash):

```sql
-- View stuck active jobs (older than 1 hour)
SELECT id, name, state, started_on, created_on
FROM pgboss.job
WHERE state = 'active'
  AND started_on < NOW() - INTERVAL '1 hour';
```

pg-boss has built-in expiration handling. If a worker crashes, jobs will automatically expire based on the `expireInSeconds` setting and be retried. Avoid manually modifying job state unless pg-boss's built-in recovery is insufficient.

---

## Queue Health Checks

### Verify pg-boss Is Running

The application logs `pg-boss workers registered: ...` on successful startup. If this message is absent and `ENABLE_JOB_QUEUE=true`, check for startup errors.

### Check Queue Backlog

```sql
SELECT name, state, count(*)::int AS job_count
FROM pgboss.job
WHERE state IN ('created', 'active', 'retry')
GROUP BY name, state
ORDER BY name, state;
```

A growing `created` count with no `active` jobs indicates workers are not consuming. Restart the application or check for errors in the worker registration.
