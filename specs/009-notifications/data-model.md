# Data Model: Notifications

**Feature**: `009-notifications`
**Status**: IMPLEMENTED
**Source**: `apps/backend/prisma/schema.prisma` (`Notification`, `NotificationTemplate`, `NotificationChannel`, `NotificationStatus`), `apps/backend/src/modules/notification/domain/**`

All timestamps are `timestamptz`. All IDs are UUID v4. Column names follow `snake_case`; Prisma exposes them as `camelCase`.

## Enums

### `NotificationChannel`

```
EMAIL | SMS | WHATSAPP
```

- `EMAIL` → Resend provider.
- `SMS` → Mobile Message provider (approved target; current code still uses Twilio until migration).
- `WHATSAPP` → Zenvia provider.

Provider selection is hardcoded per channel in Phase 1.

### `NotificationStatus`

```
PENDING | SENT | DELIVERED | FAILED
```

State machine (not using the central sovereign state machine from feature 006 — this is a small, self-contained lifecycle):

```
PENDING ─── send attempt succeeds ──▶ SENT
PENDING ─── send attempt fails, retry budget left ──▶ PENDING (with next_retry_at)
PENDING ─── send attempt fails, budget exhausted ──▶ FAILED
SENT ────── provider webhook event: delivered ──▶ DELIVERED
SENT ────── provider webhook event: bounced/rejected ──▶ FAILED
FAILED ──── manual retry ──▶ PENDING
```

## Entities

### `notifications`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `tenant_id` | uuid | no | — | FK → `tenants.id`. Required even for portal-link notifications. |
| `appointment_id` | uuid | yes | — | FK → `appointments.id`. Optional (some notifications are not appointment-scoped). |
| `recipient` | varchar(320) | no | — | Email or phone number. PII — never log at production levels. |
| `channel` | `NotificationChannel` | no | — | |
| `template_code` | varchar(100) | no | — | Looked up against `notification_templates`. |
| `status` | `NotificationStatus` | no | `PENDING` | |
| `provider_name` | varchar(50) | yes | — | Set on `SENT` (e.g., `resend`, `mobilemessage`, `zenvia`). Current code still persists `twilio` for SMS until migration. |
| `provider_message_id` | varchar(200) | yes | — | Used by webhooks to correlate delivery events. |
| `sent_at` | timestamptz | yes | — | Set on `SENT`. |
| `delivered_at` | timestamptz | yes | — | Set on `DELIVERED`. |
| `failed_at` | timestamptz | yes | — | Set on `FAILED`. |
| `failure_reason` | text | yes | — | Latest provider error message — only the most recent attempt is preserved (GAP-009). |
| `payload_json` | jsonb | no | — | Template variables (`{ tenantName, scheduledDate, ... }`). |
| `retry_count` | int | no | `0` | Incremented on each failed attempt. |
| `next_retry_at` | timestamptz | yes | — | When set, the poll worker re-enqueues a `notification.send` job. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes**

- `(tenant_id)`
- `(appointment_id)`
- `(status)`
- `(template_code)`
- `(provider_message_id)`
- `(next_retry_at)` — used by the poll sweep.

**Invariants**

- `status = SENT` ⇒ `sent_at IS NOT NULL AND provider_message_id IS NOT NULL`.
- `status = DELIVERED` ⇒ `delivered_at IS NOT NULL` AND was previously `SENT`.
- `status = FAILED` ⇒ `failed_at IS NOT NULL AND failure_reason IS NOT NULL`.
- `retry_count ≤ MAX_RETRY_COUNT (6)`.
- `next_retry_at` is only meaningful when `status = PENDING`; the poll worker ignores non-pending rows.

### `notification_templates`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `tenant_id` | uuid | yes | — | FK → `tenants.id`. Null for platform default. |
| `template_code` | varchar(100) | no | — | Business code (e.g., `INSPECTION_NOTICE`). |
| `channel` | `NotificationChannel` | no | — | |
| `subject` | varchar(255) | yes | — | Used for EMAIL. Ignored for SMS/WhatsApp. |
| `body_html` | text | yes | — | Used for EMAIL when present. |
| `body_text` | text | no | — | Always required. Used as the primary body for SMS/WhatsApp and as fallback for EMAIL. |
| `variables_json` | jsonb | no | — | Descriptive list of expected variables — informational in Phase 1 (GAP-004). |
| `is_active` | boolean | no | `true` | |
| `created_at`, `updated_at` | timestamptz | no | | |

**Indexes**

- `UNIQUE (tenant_id, template_code, channel)` — platform default has `tenant_id = NULL`.
- `(template_code, channel)`
- `(tenant_id)`

**Invariants**

- One default (`tenant_id IS NULL`) per `(template_code, channel)` at most. Postgres allows multiple NULLs in the unique constraint — the application must enforce.
- Tenant overrides must reference an existing tenant id.
- Template lookup at send time: tenant-specific first (`tenant_id = notification.tenantId`), fall back to default (`tenant_id IS NULL`). Missing both → `TEMPLATE_NOT_FOUND`.

## Domain Services

### `TemplateRendererService`

Pure function. Simple `{{variable}}` substitution with the notification's `payload_json` as the variable source. Missing variables render as empty strings. No HTML escaping, conditionals, or loops in Phase 1 (GAP-005).

### `providers.ts`

Three port interfaces:

- `IEmailProvider.send(recipient, subject, bodyHtml, bodyText) → { messageId }`
- `ISmsProvider.send(recipient, bodyText) → { messageId }`
- `IWhatsAppProvider.send(recipient, bodyText) → { messageId }`

Real implementations: `ResendEmailProvider`, `MobileMessageSmsProvider` (approved target; current code still uses `TwilioSmsProvider`), `ZenviaWhatsAppProvider`. Stubs: `StubEmailProvider`, `StubSmsProvider`, `StubWhatsAppProvider`.

### Constants

- `MANDATORY_TEMPLATE_CODES` — 10 codes required for platform operation. **9 are dossiê-mandated** (`Source: dossier — regras-negocio:270-304`):
  - `INSPECTION_NOTICE`
  - `REMINDER_7_DAYS`
  - `REMINDER_5_DAYS`
  - `REMINDER_3_DAYS`
  - `PROPERTY_MANAGER_ESCALATION`
  - `TENANT_SMS_ALERT`
  - `INSPECTION_CONFIRMED`
  - `INSPECTION_RESCHEDULED`
  - `INSPECTION_CANCELLED`
  - **1 is an implementation addition** (`deployment baseline`): `INSPECTION_UNAVAILABILITY_REPORTED` (tenant portal unavailability flow — operationally important, especially for late/urgent unavailability after cutoff)
- `RETRY_DELAYS = [15_000, 45_000, 120_000, 300_000, 900_000]` milliseconds (`implementation decision` — values from infrastructure spec, not a domain rule).
- `MAX_RETRY_COUNT = 6` attempts (`implementation decision`).
- `JITTER_FACTOR = 0.1` (`implementation decision`).
- `JITTER_FACTOR = 0.1` (±10%).

## Ports (domain interfaces)

### `INotificationRepository`

- `save(notification)` — insert.
- `update(notification)` — upsert by id (used by send worker and webhook handler).
- `findById(id)`
- `findByProviderMessageId(provider, messageId)` — used by webhooks.
- `findRetryable(now, limit)` — used by poll sweep.
- `findAll(filters, pagination)` / `count(filters)` — operator list.
- `existsByAppointmentAndTemplate(appointmentId, templateCode)` — idempotency guard for dispatchers.

### `INotificationTemplateRepository`

- `save(template)` — insert.
- `update(template)` — used by upsert.
- `findByTenantCodeChannel(tenantId | null, templateCode, channel)` — the core lookup with fallback.
- `findAll(filters)` — operator list.

## Relationships

```
tenants (1) [feature 002]
  ├── notifications (0..*)
  └── notification_templates (0..*, overrides for tenant-specific copy)

appointments (0..*) [feature 006]
  └── notifications (0..*, optional FK)

platform default templates: rows with tenant_id = NULL, at most one per (code, channel)
```

## Audit Linkage

- Template upserts produce audit records (`notification_template.upserted`).
- Notification rows themselves are NOT audit-written — they serve as their own audit trail. Consumers query `notifications` directly for delivery history.
- Handler-driven notifications (from features 006/007) do not emit additional audit entries beyond the notification row itself.

## Side Effects Summary

| Use case | Writes | Job enqueue | External calls |
|---|---|---|---|
| `CreateNotificationUseCase` | Insert notification row | `notification.send` (retryLimit: 0) | — |
| `SendNotificationUseCase` | Update row with send result or retry state | — (job completes; retries via poll sweep) | Provider send (Resend / Mobile Message / Zenvia) |
| `RetryNotificationUseCase` | Reset row to `PENDING` | `notification.send` | — |
| `PollRetryableNotificationsUseCase` | — | `notification.send` for each overdue row | — |
| `DispatchRemindersUseCase` | — (delegates to Create) | via Create | — |
| `DispatchEscalationsUseCase` | — (delegates to Create) | via Create | — |
| `HandleProviderWebhookUseCase` | Update row status (`DELIVERED` / `FAILED`) | — | — |
| `UpsertNotificationTemplateUseCase` | Insert or update template row | — | — |

## Migration History

Phase 1 schema applied in `apps/backend/prisma/migrations/`. Phase 2 additions (GAP-001 consent tracking, GAP-009 per-attempt history table, GAP-002 WhatsApp approval state) require expand/contract migrations.
