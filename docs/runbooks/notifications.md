# Notifications Runbook

## Provider Configuration

### Resend (Email)

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` | Sender email address (e.g., `noreply@properfy.com.br`) |

### MobileMessage (SMS)

| Variable | Description |
|---|---|
| `MOBILE_MESSAGE_API_KEY` | API username (HTTP Basic auth) |
| `MOBILE_MESSAGE_PASSWORD` | API password (HTTP Basic auth) |
| `MOBILE_MESSAGE_SENDER_ID` | Registered Sender ID |
| `MOBILE_MESSAGE_WEBHOOK_TOKEN` | Shared secret for the delivery webhook `?token=` query param |

All four are required in staging/production (startup fails without them). API docs: <https://mobilemessage.com.au/api-documentation>.

**Send behavior** (`MobileMessageSmsProvider`):

- `POST /v1/messages` with a 10s timeout, wrapped in a circuit breaker (5 failures / 60s reset).
- `Idempotency-Key: <notificationId>-<attemptNumber>` — provider-side retries never duplicate sends.
- `custom_ref = notificationId` — provider records correlate back to `notifications.id`.
- Recipient is normalized to E.164 (`+61...`) at send time; unnormalizable numbers fail immediately with `INVALID_RECIPIENT_PHONE` (no retries).
- Bodies are truncated at the provider hard limit (1,530 GSM-7 chars / 670 UCS-2); `enable_unicode` is set automatically for non-GSM-7 content.
- A 2xx response without a `message_id`, or a per-message `status: "error"`, throws — a fake provider id is never persisted.

**Delivery status** (two complementary paths):

1. **Webhook** `POST /v1/webhooks/mobile-message?token=<MOBILE_MESSAGE_WEBHOOK_TOKEN>`. MobileMessage does not sign requests, so the token is mandatory — with no token configured the endpoint returns 401 for everything. Unmatched `message_id`s are logged as `notification.webhook_unmatched`.
2. **Reconciliation poll** `notification.sms-delivery-poll` (every 10 minutes): sweeps `SENT` SMS rows 10 minutes–72 hours old and queries `GET /v1/messages?message_id=` for the authoritative status (`delivered` → `DELIVERED`, `failed`/`cancelled` → `FAILED`). Rows older than 72h stay `SENT`.

```sql
-- SMS stuck in SENT beyond the reconciliation window (investigate at the provider)
SELECT id, recipient, provider_message_id, sent_at
FROM notifications
WHERE channel = 'SMS' AND status = 'SENT'
  AND sent_at < NOW() - INTERVAL '72 hours'
ORDER BY sent_at DESC LIMIT 20;
```

### Zenvia (WhatsApp)

| Variable | Description |
|---|---|
| `WHATSAPP_API_KEY` | Zenvia API key |
| `WHATSAPP_API_URL` | Zenvia API base URL |

All provider variables are optional. If a provider is not configured, notifications for that channel will fail gracefully and be marked for retry.

---

## Circuit Breaker (Email)

The Resend email provider is wrapped in a circuit breaker with these settings:

| Parameter | Value |
|---|---|
| Failure threshold | 5 consecutive failures |
| Reset timeout | 60 seconds |
| States | CLOSED (normal) -> OPEN (blocking) -> HALF_OPEN (testing) |

**Behavior:**

- **CLOSED:** All requests pass through normally. Failures are counted.
- **OPEN:** After 5 consecutive failures, the circuit opens. All email sends immediately throw `Circuit breaker OPEN for resend-email`. This prevents cascading failures.
- **HALF_OPEN:** After 60 seconds, the next request is allowed through as a test. If it succeeds, the circuit closes. If it fails, it reopens.

**During an outage:** Notifications that fail due to the open circuit breaker are left in a retryable state and will be picked up by the `notification.retry-poll` job.

The circuit breaker state is in-memory and resets on application restart.

---

## Notification Lifecycle

1. A notification record is created in the `notifications` table with status `PENDING`.
2. A `notification.send` job is enqueued to pg-boss.
3. The worker picks up the job and attempts delivery via the configured provider.
4. On success: status is updated to `SENT` (or `DELIVERED` if the provider confirms).
5. On failure: the job retries per pg-boss config (6 attempts, exponential backoff). If all retries fail, the notification remains in a retryable state for the polling job.

---

## Retry Flow

The `notification.retry-poll` job runs every 5 minutes (`*/5 * * * *`). It:

1. Queries the `notifications` table for notifications in a retryable state.
2. Re-enqueues each as a new `notification.send` job.
3. Logs the count of re-enqueued notifications.

### Checking Retryable Notifications

```sql
SELECT id, channel, status, recipient, created_at, updated_at, retry_count
FROM notifications
WHERE status IN ('PENDING', 'FAILED')
  AND retry_count < 6
ORDER BY created_at DESC
LIMIT 20;
```

### Checking Notification Status by Channel

```sql
SELECT channel, status, count(*)::int AS total
FROM notifications
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY channel, status
ORDER BY channel, status;
```

### Checking Notifications for a Specific Appointment

```sql
SELECT id, channel, status, recipient, template_code, created_at, sent_at
FROM notifications
WHERE appointment_id = '<appointment_id>'
ORDER BY created_at DESC;
```

---

## Mandatory Notification Events

These notifications are dispatched automatically based on appointment lifecycle:

| Event | Channel | Timing |
|---|---|---|
| Initial inspection notice | Email | On appointment creation/scheduling |
| Reminder (7 days) | Email | T-7 days before scheduled date |
| Reminder (5 days) | Email | T-5 days before scheduled date |
| Reminder (3 days) | Email | T-3 days before scheduled date |
| PM escalation | Email | T-2 days (property manager notified) |
| SMS alert to tenant | SMS | Per escalation rules |
| Confirmation received | Email | When tenant confirms |
| Rescheduling received | Email | When tenant requests reschedule |
| Cancellation | Email | When appointment is cancelled |

Reminders are dispatched by the `notification.dispatch-reminders` job (daily at 08:00). Escalations are dispatched by `notification.dispatch-escalations` (daily at 08:00).

---

## Template Management

Notification templates are tenant-customizable. Each template has:

- `template_code`: unique identifier (e.g., `INSPECTION_INITIAL_NOTICE`)
- `tenant_id`: NULL for global/default templates, or a specific tenant ID for overrides
- Dynamic variables: logo, custom text, signature, appointment details

### Startup Validation

At boot, `template-startup-check` validates that all mandatory template codes exist as global templates (where `tenant_id IS NULL`). Missing templates are logged as warnings but do not block startup.

### Checking Template Coverage

```sql
-- List all global (default) templates
SELECT template_code, created_at, updated_at
FROM notification_templates
WHERE tenant_id IS NULL
ORDER BY template_code;

-- Find tenants with custom template overrides
SELECT tenant_id, count(*)::int AS template_count
FROM notification_templates
WHERE tenant_id IS NOT NULL
GROUP BY tenant_id;

-- Check if a specific tenant has a custom template
SELECT *
FROM notification_templates
WHERE template_code = 'INSPECTION_INITIAL_NOTICE'
  AND (tenant_id = '<tenant_id>' OR tenant_id IS NULL)
ORDER BY tenant_id DESC NULLS LAST
LIMIT 1;
```

The query above returns the tenant-specific template if it exists, otherwise the global default (due to `NULLS LAST` ordering).

---

## Troubleshooting

### Notifications Not Being Sent

1. Check that `ENABLE_JOB_QUEUE=true` is set.
2. Verify the relevant provider env vars are configured.
3. Check pg-boss job status for `notification.send`:
   ```sql
   SELECT state, count(*)::int
   FROM pgboss.job
   WHERE name = 'notification.send'
     AND created_on > NOW() - INTERVAL '1 hour'
   GROUP BY state;
   ```
4. Check application logs for circuit breaker messages (`Circuit breaker OPEN for resend-email`).

### Reminders Not Dispatching

1. Verify the `notification.dispatch-reminders` schedule exists:
   ```sql
   SELECT * FROM pgboss.schedule WHERE name = 'notification.dispatch-reminders';
   ```
2. Check recent job history:
   ```sql
   SELECT state, created_on, completed_on, output
   FROM pgboss.job
   WHERE name = 'notification.dispatch-reminders'
   ORDER BY created_on DESC
   LIMIT 5;
   ```
3. Confirm there are appointments with scheduled dates within the reminder windows (3, 5, 7 days out).
