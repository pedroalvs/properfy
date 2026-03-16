# Notification Module — Implementation Spec

**Module:** `src/modules/notification/`
**Version:** 1.0
**Status:** Ready for implementation
**Last updated:** 2026-03-15

This document is self-contained. A developer can implement the entire Notification module from this spec alone without consulting any other documentation.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Model](#2-data-model)
3. [Use Cases](#3-use-cases)
4. [API Contracts](#4-api-contracts)
5. [Business Rules](#5-business-rules)
6. [Authorization Matrix](#6-authorization-matrix)
7. [Domain Events](#7-domain-events)
8. [Queue Jobs](#8-queue-jobs)
9. [External Integrations](#9-external-integrations)
10. [Test Scenarios](#10-test-scenarios)

---

## 1. Overview

The Notification module manages all outbound communications (email, SMS, WhatsApp) in the Properfy platform. It is event-driven: domain events from other modules trigger notification jobs that are processed asynchronously via pg-boss queues.

**Key responsibilities:**

- Store every notification record with full lifecycle tracking (PENDING → SENT → DELIVERED / FAILED)
- Process and dispatch notifications via external providers (Resend for email, Twilio/Zenvia for SMS/WhatsApp)
- Manage tenant-specific and platform-default templates
- Handle retries with exponential backoff and a dead-letter queue (DLQ) after max attempts
- Expose operator APIs for querying and manually retrying failed notifications
- Receive delivery status webhooks from providers and update records accordingly
- Schedule reminder jobs based on appointment dates

**Module boundaries:**

- This module is the authoritative owner of `notifications` and `notification_templates` tables.
- This module does NOT trigger its own notifications — it responds to events from the appointment module, service group module, and scheduled jobs.
- Template rendering is an internal concern; no external rendering service.

**Clean Architecture layers:**

```
src/modules/notification/
├── domain/
│   ├── entities/Notification.ts
│   ├── entities/NotificationTemplate.ts
│   ├── enums/NotificationChannel.ts
│   ├── enums/NotificationStatus.ts
│   ├── ports/INotificationRepository.ts
│   ├── ports/INotificationTemplateRepository.ts
│   ├── ports/IEmailProvider.ts
│   ├── ports/ISmsProvider.ts
│   └── ports/IWhatsAppProvider.ts
├── application/
│   ├── use-cases/SendNotificationUseCase.ts
│   ├── use-cases/RetryNotificationUseCase.ts
│   ├── use-cases/ListNotificationsUseCase.ts
│   ├── use-cases/GetNotificationUseCase.ts
│   ├── use-cases/HandleProviderWebhookUseCase.ts
│   ├── use-cases/UpsertNotificationTemplateUseCase.ts
│   └── services/TemplateRendererService.ts
├── infrastructure/
│   ├── repositories/PrismaNotificationRepository.ts
│   ├── repositories/PrismaNotificationTemplateRepository.ts
│   ├── providers/ResendEmailProvider.ts
│   ├── providers/TwilioSmsProvider.ts
│   └── providers/ZenviaSmsProvider.ts
├── workers/
│   ├── NotificationSendWorker.ts
│   └── NotificationReminderWorker.ts
└── interfaces/
    ├── http/routes/notification.routes.ts
    ├── http/routes/webhook.routes.ts
    └── http/schemas/
```

---

## 2. Data Model

### 2.1 Prisma Schema

```prisma
// ─── Enums ───────────────────────────────────────────────────────────────────

enum NotificationChannel {
  EMAIL
  SMS
  WHATSAPP
}

enum NotificationStatus {
  PENDING
  SENT
  DELIVERED
  FAILED
}

// ─── Notification ─────────────────────────────────────────────────────────────

model Notification {
  id                   String             @id @default(cuid())
  tenant_id            String
  appointment_id       String?
  recipient            String             // email address or E.164 phone number
  channel              NotificationChannel
  template_code        String
  status               NotificationStatus @default(PENDING)
  provider_name        String?            // "resend" | "twilio" | "zenvia"
  provider_message_id  String?            // external ID from provider
  sent_at              DateTime?
  delivered_at         DateTime?
  failed_at            DateTime?
  failure_reason       String?            @db.Text
  payload_json         Json               // snapshot of template variables at send time
  retry_count          Int                @default(0)
  next_retry_at        DateTime?
  created_at           DateTime           @default(now())
  updated_at           DateTime           @updatedAt

  // Relations
  tenant               Tenant             @relation(fields: [tenant_id], references: [id])
  appointment          Appointment?       @relation(fields: [appointment_id], references: [id])

  @@index([tenant_id])
  @@index([appointment_id])
  @@index([status])
  @@index([template_code])
  @@index([provider_message_id])
  @@index([next_retry_at])
  @@map("notifications")
}

// ─── NotificationTemplate ─────────────────────────────────────────────────────

model NotificationTemplate {
  id             String              @id @default(cuid())
  tenant_id      String?             // null = platform default template
  template_code  String              // e.g. "INSPECTION_NOTICE"
  channel        NotificationChannel
  subject        String?             // email subject line (EMAIL channel only)
  body_html      String?             @db.Text  // HTML body (EMAIL channel only)
  body_text      String              @db.Text  // plain text / SMS / WhatsApp body
  variables_json Json                // string[] of variable names e.g. ["property_address", "inspection_date"]
  is_active      Boolean             @default(true)
  created_at     DateTime            @default(now())
  updated_at     DateTime            @updatedAt

  tenant         Tenant?             @relation(fields: [tenant_id], references: [id])

  @@unique([tenant_id, template_code, channel])
  @@index([template_code, channel])
  @@index([tenant_id])
  @@map("notification_templates")
}
```

### 2.2 TypeScript Domain Entities

```typescript
// domain/entities/Notification.ts
export interface NotificationEntity {
  id: string;
  tenantId: string;
  appointmentId: string | null;
  recipient: string;
  channel: NotificationChannel;
  templateCode: string;
  status: NotificationStatus;
  providerName: string | null;
  providerMessageId: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  payloadJson: Record<string, string>;
  retryCount: number;
  nextRetryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// domain/entities/NotificationTemplate.ts
export interface NotificationTemplateEntity {
  id: string;
  tenantId: string | null;
  templateCode: string;
  channel: NotificationChannel;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string;
  variablesJson: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### 2.3 Template Variables Reference

The following dynamic variables are available for use in templates. Variable names must be wrapped in `{{` and `}}` in template bodies.

| Variable | Description | Example |
|----------|-------------|---------|
| `{{property_address}}` | Full address of the property | `123 Main St, Bondi NSW 2026` |
| `{{inspection_date}}` | Formatted scheduled date | `Tuesday, 1 April 2026` |
| `{{time_window}}` | Inspection time window | `8:00 AM – 12:00 PM` |
| `{{agency_name}}` | Name of the real estate agency (tenant) | `XYZ Realty` |
| `{{portal_link}}` | Full URL to tenant portal | `https://app.properfy.com.au/portal/abc123` |
| `{{tenant_name}}` | Name of the property tenant | `Jane Smith` |
| `{{inspector_name}}` | Name of the assigned inspector | `John Doe` |
| `{{cancellation_reason}}` | Reason for cancellation (INSPECTION_CANCELLED) | `Tenant unavailable` |
| `{{new_inspection_date}}` | New date after rescheduling (INSPECTION_RESCHEDULED) | `Wednesday, 2 April 2026` |
| `{{new_time_window}}` | New time window after rescheduling | `1:00 PM – 5:00 PM` |

### 2.4 The 9 Mandatory Template Codes

| # | Template Code | Channel | Trigger Event / Condition |
|---|--------------|---------|--------------------------|
| 1 | `INSPECTION_NOTICE` | EMAIL | Appointment transitions to `AWAITING_INSPECTOR` (initial scheduling notice to tenant) |
| 2 | `REMINDER_7_DAYS` | EMAIL | Scheduled job: 7 days before `scheduled_date` |
| 3 | `REMINDER_5_DAYS` | EMAIL | Scheduled job: 5 days before `scheduled_date` |
| 4 | `REMINDER_3_DAYS` | EMAIL | Scheduled job: 3 days before `scheduled_date` |
| 5 | `PROPERTY_MANAGER_ESCALATION` | EMAIL | Scheduled job / manual trigger when tenant has not responded after 5-day reminder |
| 6 | `TENANT_SMS_ALERT` | SMS | Urgent trigger (same day or manually by OP) |
| 7 | `INSPECTION_CONFIRMED` | EMAIL | Tenant confirms via portal OR appointment transitions to `SCHEDULED` |
| 8 | `INSPECTION_RESCHEDULED` | EMAIL | Appointment is rescheduled (date or time changes) |
| 9 | `INSPECTION_CANCELLED` | EMAIL | Appointment transitions to `CANCELLED` |

### 2.5 Database Indexes (migration notes)

```sql
-- Performance indexes
CREATE INDEX idx_notifications_tenant_status ON notifications(tenant_id, status);
CREATE INDEX idx_notifications_appointment_channel ON notifications(appointment_id, channel);
CREATE INDEX idx_notifications_pending_retry ON notifications(status, next_retry_at) WHERE status = 'PENDING';
CREATE INDEX idx_templates_lookup ON notification_templates(template_code, channel, tenant_id);
```

---

## 3. Use Cases

### 3.1 SendNotification

**Name:** `SendNotificationUseCase`
**Actor:** SYS (invoked by queue worker, not via HTTP)
**File:** `application/use-cases/SendNotificationUseCase.ts`

This use case is the core dispatch logic. It is invoked by the `NotificationSendWorker` when processing a `notification.send` job.

**Input DTO:**

```typescript
interface SendNotificationInput {
  notificationId: string;  // existing Notification record in PENDING status
  requestId: string;
}
```

**Process:**
1. Load notification by `notificationId`; assert `status = PENDING`.
2. Load template: look up `notification_templates` by `(tenant_id, template_code, channel)`. If not found, fall back to `(null, template_code, channel)` (platform default). If neither found, fail with `TEMPLATE_NOT_FOUND`.
3. Render template: replace all `{{variable}}` placeholders in `body_html`, `body_text`, and `subject` using `notification.payload_json` values. Unknown variables are replaced with an empty string.
4. Dispatch to provider based on `channel`:
   - `EMAIL`: call `IEmailProvider.send(to, subject, bodyHtml, bodyText)`
   - `SMS`: call `ISmsProvider.send(to, bodyText)`
   - `WHATSAPP`: call `IWhatsAppProvider.send(to, bodyText)`
5. On provider success:
   - Update notification: `status = SENT`, `sent_at = now()`, `provider_name`, `provider_message_id`.
6. On provider failure:
   - Increment `retry_count`.
   - If `retry_count < 6`: compute `next_retry_at` using exponential backoff, set `status = PENDING`.
   - If `retry_count >= 6`: set `status = FAILED`, `failed_at = now()`, `failure_reason = error.message`. Enqueue to DLQ. Emit `notification.failed.v1` event. Trigger operator alert.

**Retry backoff schedule (delays before next attempt):**

| Attempt | Delay |
|---------|-------|
| 1 | 15 seconds |
| 2 | 45 seconds |
| 3 | 2 minutes |
| 4 | 5 minutes |
| 5 | 15 minutes |
| 6 (final) | — move to FAILED/DLQ |

**Jitter:** Add ±10% random jitter to each delay to prevent thundering herd.

**Output:** None (side-effect only — updates notification record).

**Errors:**

| Code | Condition |
|------|-----------|
| `NOTIFICATION_NOT_FOUND` | No notification with given ID |
| `NOTIFICATION_INVALID_STATUS` | Notification is not in `PENDING` status |
| `TEMPLATE_NOT_FOUND` | No template found for `template_code + channel` in tenant or platform |
| `PROVIDER_ERROR` | External provider returned non-success; triggers retry |

---

### 3.2 RetryNotification

**Name:** `RetryNotificationUseCase`
**Actor:** OP, AM (via HTTP API)
**File:** `application/use-cases/RetryNotificationUseCase.ts`

Manual retry of a `FAILED` notification by an operator.

**Preconditions:**
- Actor has role `OP` or `AM`
- Notification `status = FAILED`
- Notification's `tenant_id` is within actor's scope

**Input DTO:**

```typescript
interface RetryNotificationInput {
  notificationId: string;
  actorId: string;
  actorRole: string;
  requestId: string;
}
```

**Process:**
1. Load notification; assert `status = FAILED`.
2. Reset: `status = PENDING`, `retry_count = 0`, `next_retry_at = null`, `failed_at = null`, `failure_reason = null`.
3. Enqueue a new `notification.send` job with `notificationId`.
4. Write audit log: `action = NOTIFICATION_MANUALLY_RETRIED`.

**Output:**

```typescript
interface RetryNotificationOutput {
  notificationId: string;
  status: 'PENDING';
  retriedAt: string;
}
```

**Errors:**

| Code | HTTP | Condition |
|------|------|-----------|
| `NOTIFICATION_NOT_FOUND` | 404 | Notification not found in tenant scope |
| `NOTIFICATION_INVALID_STATUS` | 422 | Notification is not `FAILED` |

---

### 3.3 ListNotifications

**Name:** `ListNotificationsUseCase`
**Actor:** AM, OP
**File:** `application/use-cases/ListNotificationsUseCase.ts`

**Preconditions:**
- Actor has role `AM` or `OP`
- `OP` is scoped to their tenant context

**Input DTO:**

```typescript
interface ListNotificationsInput {
  tenantId?: string;          // AM only
  appointmentId?: string;
  channel?: NotificationChannel;
  status?: NotificationStatus;
  templateCode?: string;
  fromDate?: string;          // ISO date
  toDate?: string;            // ISO date
  page: number;
  pageSize: number;
  sortBy?: 'created_at' | 'sent_at' | 'status';
  sortOrder?: 'asc' | 'desc';
}
```

**Output:**

```typescript
interface ListNotificationsOutput {
  data: NotificationSummary[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface NotificationSummary {
  id: string;
  tenantId: string;
  appointmentId: string | null;
  recipient: string;
  channel: NotificationChannel;
  templateCode: string;
  status: NotificationStatus;
  providerName: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  retryCount: number;
  createdAt: string;
}
```

---

### 3.4 GetNotification

**Name:** `GetNotificationUseCase`
**Actor:** AM, OP
**File:** `application/use-cases/GetNotificationUseCase.ts`

Returns full notification detail including `payload_json` (template variables snapshot).

**Input DTO:**

```typescript
interface GetNotificationInput {
  notificationId: string;
}
```

**Output:** `NotificationDetail` — all fields including `payloadJson`, `providerMessageId`.

---

### 3.5 HandleProviderWebhook

**Name:** `HandleProviderWebhookUseCase`
**Actor:** SYS (webhook from external provider)
**File:** `application/use-cases/HandleProviderWebhookUseCase.ts`

Processes delivery status callbacks from email/SMS providers.

**Input DTO:**

```typescript
interface HandleProviderWebhookInput {
  provider: 'resend' | 'twilio' | 'zenvia';
  providerMessageId: string;
  event: 'delivered' | 'failed' | 'bounced' | 'clicked' | 'opened';
  occurredAt: string;
  rawPayload: unknown;
}
```

**Process:**
1. Look up notification by `provider_message_id`.
2. If `event = 'delivered'`: set `status = DELIVERED`, `delivered_at = occurredAt`.
3. If `event = 'failed'` or `'bounced'`: set `status = FAILED`, `failed_at = occurredAt`, `failure_reason`.
4. Other events (`clicked`, `opened`): log but do not change status.
5. Return HTTP 200 to provider (webhook acknowledgment).

---

### 3.6 UpsertNotificationTemplate

**Name:** `UpsertNotificationTemplateUseCase`
**Actor:** AM (platform templates), CL_ADMIN (tenant-specific templates)
**File:** `application/use-cases/UpsertNotificationTemplateUseCase.ts`

Create or update a notification template for a tenant or platform.

**Input DTO:**

```typescript
interface UpsertNotificationTemplateInput {
  tenantId: string | null;    // null = platform default (AM only)
  templateCode: string;       // one of the 9 mandatory codes
  channel: NotificationChannel;
  subject?: string;
  bodyHtml?: string;
  bodyText: string;
  isActive: boolean;
  actorId: string;
}
```

**Process:**
1. Validate `templateCode` is a known code.
2. If `tenantId = null`, assert actor is `AM`.
3. Upsert: `ON CONFLICT (tenant_id, template_code, channel) DO UPDATE`.
4. Validate `bodyText` and `bodyHtml` contain only known variables (from `{{property_address}}`, etc.).

---

## 4. API Contracts

### 4.1 GET /v1/notifications

**Auth:** Bearer JWT
**Roles:** AM, OP
**Rate limit:** 60 req/min per user

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `tenantId` | string | No (AM only) | Filter by tenant |
| `appointmentId` | string | No | Filter by appointment |
| `channel` | string | No | `EMAIL\|SMS\|WHATSAPP` |
| `status` | string | No | `PENDING\|SENT\|DELIVERED\|FAILED` |
| `templateCode` | string | No | e.g. `INSPECTION_NOTICE` |
| `fromDate` | string | No | ISO date `YYYY-MM-DD` |
| `toDate` | string | No | ISO date `YYYY-MM-DD` |
| `page` | integer | No | Default: 1 |
| `pageSize` | integer | No | Default: 20, max: 100 |
| `sortBy` | string | No | `created_at\|sent_at\|status` |
| `sortOrder` | string | No | `asc\|desc` |

**Success Response 200:**

```json
{
  "data": [
    {
      "id": "cldnot1",
      "tenantId": "cldten1",
      "appointmentId": "cldapt1",
      "recipient": "tenant@example.com",
      "channel": "EMAIL",
      "templateCode": "INSPECTION_NOTICE",
      "status": "DELIVERED",
      "providerName": "resend",
      "sentAt": "2026-03-15T08:00:00.000Z",
      "deliveredAt": "2026-03-15T08:00:05.000Z",
      "failedAt": null,
      "failureReason": null,
      "retryCount": 0,
      "createdAt": "2026-03-15T08:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**Errors:**

| Code | HTTP | Scenario |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Role not `AM` or `OP` |

---

### 4.2 GET /v1/notifications/:notificationId

**Auth:** Bearer JWT
**Roles:** AM, OP
**Rate limit:** 120 req/min per user

**Path Parameters:** `notificationId` (string, cuid)

**Success Response 200:**

```json
{
  "id": "cldnot1",
  "tenantId": "cldten1",
  "appointmentId": "cldapt1",
  "recipient": "tenant@example.com",
  "channel": "EMAIL",
  "templateCode": "INSPECTION_NOTICE",
  "status": "DELIVERED",
  "providerName": "resend",
  "providerMessageId": "re_abc123",
  "sentAt": "2026-03-15T08:00:00.000Z",
  "deliveredAt": "2026-03-15T08:00:05.000Z",
  "failedAt": null,
  "failureReason": null,
  "payloadJson": {
    "property_address": "123 Main St, Bondi NSW 2026",
    "inspection_date": "Tuesday, 1 April 2026",
    "time_window": "8:00 AM – 12:00 PM",
    "agency_name": "XYZ Realty",
    "portal_link": "https://app.properfy.com.au/portal/abc123",
    "tenant_name": "Jane Smith"
  },
  "retryCount": 0,
  "createdAt": "2026-03-15T08:00:00.000Z",
  "updatedAt": "2026-03-15T08:00:10.000Z"
}
```

**Errors:**

| Code | HTTP | Scenario |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Role not `AM` or `OP` |
| `NOTIFICATION_NOT_FOUND` | 404 | Notification not found in tenant scope |

---

### 4.3 POST /v1/notifications/:notificationId/retry

**Auth:** Bearer JWT
**Roles:** OP, AM
**Rate limit:** 20 req/min per user

**Path Parameters:** `notificationId` (string, cuid)

**Request Body:** None required.

**Success Response 200:**

```json
{
  "notificationId": "cldnot1",
  "status": "PENDING",
  "retriedAt": "2026-03-15T10:00:00.000Z"
}
```

**Errors:**

| Code | HTTP | Scenario |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Role not `OP` or `AM` |
| `NOTIFICATION_NOT_FOUND` | 404 | Notification not found in tenant scope |
| `NOTIFICATION_INVALID_STATUS` | 422 | Notification is not `FAILED` |

---

### 4.4 POST /v1/webhooks/resend

**Auth:** Webhook signature verification (HMAC-SHA256 with `RESEND_WEBHOOK_SECRET`)
**Roles:** None (SYS)
**Rate limit:** Not user-rate-limited; protected by signature

**Request Body:** Resend webhook payload (varies by event type)

**Process:** Calls `HandleProviderWebhookUseCase` with `provider = 'resend'`.

**Success Response 200:**

```json
{ "received": true }
```

**Errors:**

| Code | HTTP | Scenario |
|------|------|---------|
| `INVALID_SIGNATURE` | 401 | HMAC signature mismatch |

---

### 4.5 POST /v1/webhooks/twilio

**Auth:** Twilio signature verification (X-Twilio-Signature header)
**Roles:** None (SYS)

**Process:** Calls `HandleProviderWebhookUseCase` with `provider = 'twilio'`.

**Success Response 200:** `{ "received": true }`

---

### 4.6 POST /v1/webhooks/zenvia

**Auth:** Zenvia webhook token verification
**Roles:** None (SYS)

**Process:** Calls `HandleProviderWebhookUseCase` with `provider = 'zenvia'`.

**Success Response 200:** `{ "received": true }`

---

### 4.7 GET /v1/notification-templates

**Auth:** Bearer JWT
**Roles:** AM, CL_ADMIN
**Rate limit:** 30 req/min per user

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `tenantId` | string | No | AM can filter by tenant; CL_ADMIN sees own tenant only |
| `templateCode` | string | No | Filter by code |
| `channel` | string | No | Filter by channel |
| `includeDefaults` | boolean | No | Include platform defaults (tenant_id = null) |

**Success Response 200:**

```json
{
  "data": [
    {
      "id": "cldtmp1",
      "tenantId": "cldten1",
      "templateCode": "INSPECTION_NOTICE",
      "channel": "EMAIL",
      "subject": "Inspection scheduled for {{property_address}}",
      "bodyText": "Dear {{tenant_name}}, your inspection is scheduled...",
      "isActive": true,
      "variables": ["tenant_name", "property_address", "inspection_date", "time_window", "portal_link"]
    }
  ]
}
```

---

### 4.8 PUT /v1/notification-templates/:templateCode/:channel

**Auth:** Bearer JWT
**Roles:** AM (for platform defaults), CL_ADMIN (for own tenant)
**Rate limit:** 10 req/min per user

**Path Parameters:** `templateCode` (string), `channel` (`EMAIL|SMS|WHATSAPP`)

**Request Body:**

```json
{
  "subject": "Your inspection at {{property_address}}",
  "bodyHtml": "<p>Dear {{tenant_name}},</p>...",
  "bodyText": "Dear {{tenant_name}}, your inspection...",
  "isActive": true
}
```

**Zod Validation Schema:**

```typescript
const UpsertTemplateBodySchema = z.object({
  subject: z.string().min(1).max(255).optional(),
  bodyHtml: z.string().min(1).optional(),
  bodyText: z.string().min(1),
  isActive: z.boolean(),
});
```

**Success Response 200:**

```json
{
  "id": "cldtmp1",
  "tenantId": "cldten1",
  "templateCode": "INSPECTION_NOTICE",
  "channel": "EMAIL",
  "isActive": true,
  "updatedAt": "2026-03-15T10:00:00.000Z"
}
```

---

## 5. Business Rules

**BR-01 — All 9 notification events are mandatory.**
The system must support and send all 9 template codes. Missing platform-default templates for any of the 9 codes is a deployment error that must be caught at startup (validate on app boot).

**BR-02 — Retry policy: exponential backoff, max 6 attempts.**
Failed sends are retried automatically: 15s → 45s → 2min → 5min → 15min → DLQ. After 6 attempts, the notification is marked `FAILED` and moved to the DLQ queue. Jitter of ±10% is applied to prevent thundering herd.

**BR-03 — Circuit breaker on external providers.**
Each provider has a circuit breaker: 5 consecutive failures within 30 seconds opens the circuit for 60 seconds. During open circuit, jobs are not dispatched — they remain in `PENDING` with a deferred `next_retry_at`. This prevents cascading failures.

**BR-04 — DLQ after max attempts triggers operational alert.**
When a notification reaches max retries (`retry_count = 6`), the system: (a) sets status to `FAILED`, (b) job state becomes `failed` in `pgboss.job` table (DLQ equivalent), (c) emits `notification.failed.v1` domain event, (d) sends an in-platform alert to operators (OP/AM) for the tenant in question.

**BR-05 — Notifications are never lost.**
The notification record is created in `PENDING` before any send attempt. Even if the queue worker crashes, the record persists. A periodic recovery job (`notification.pending_recovery`) scans for `PENDING` notifications with `next_retry_at < now()` and re-enqueues them.

**BR-06 — Template lookup order: tenant-specific first, then platform default.**
When rendering, look up `(tenant_id, template_code, channel)`. If not found, look up `(null, template_code, channel)`. If neither found, fail with `TEMPLATE_NOT_FOUND` and mark the notification as `FAILED` immediately (no retry on this error type — it requires human intervention).

**BR-07 — payload_json is a snapshot.**
When a notification is created, all template variables must be resolved and stored in `payload_json` at creation time. This ensures the notification can be re-rendered on retry even if the appointment data changes.

**BR-08 — Delivery status is tracked per notification.**
`sent_at`, `delivered_at`, `failed_at` are tracked. `DELIVERED` status requires a webhook confirmation from the provider. `SENT` means the provider accepted the message. Operators can see all three timestamps in the notification detail.

**BR-09 — Webhook idempotency.**
Provider webhooks may deliver duplicate events. When processing a webhook, if the notification is already in the target status (e.g., already `DELIVERED`), ignore the duplicate update. Never downgrade status (e.g., do not set `PENDING` from `DELIVERED`).

**BR-10 — Reminder jobs are scheduled relative to appointment's scheduled_date.**
When an appointment transitions to `AWAITING_INSPECTOR` (or `SCHEDULED`), the system schedules four reminder pg-boss delayed jobs:
- `REMINDER_7_DAYS`: fire at `scheduled_date - 7 days` at 09:00 AM (tenant's timezone)
- `REMINDER_5_DAYS`: fire at `scheduled_date - 5 days` at 09:00 AM
- `REMINDER_3_DAYS`: fire at `scheduled_date - 3 days` at 09:00 AM
- `PROPERTY_MANAGER_ESCALATION`: fire at `scheduled_date - 2 days` at 09:00 AM (if tenant has not confirmed)

**BR-11 — Reminder jobs are cancelled when appointment is cancelled or completed.**
When an appointment transitions to `CANCELLED`, `DONE`, or `REJECTED`, any pending reminder jobs for that appointment must be cancelled/removed from the queue.

**BR-12 — Template customization is scoped to tenant.**
CL_ADMIN can customize templates only for their own tenant. AM can create/modify platform-default templates. Platform defaults are immutable by CL_ADMIN.

**BR-13 — EMAIL channel requires both bodyHtml and bodyText.**
Email notifications must include both HTML and plain text body for maximum deliverability. SMS and WHATSAPP require only `bodyText`.

**BR-14 — Recipient must be valid for the channel.**
- `EMAIL`: must be a valid email address (RFC 5322).
- `SMS` / `WHATSAPP`: must be a valid E.164 phone number (e.g., `+61412345678`).
Invalid recipients cause immediate `FAILED` status without retry.

**BR-15 — All notification creation happens in the application layer.**
No module creates `Notification` records directly. All notifications are created via the `CreateNotificationCommand` in the notification application layer, triggered by domain events from other modules.

---

## 6. Authorization Matrix

| Action | AM | OP | CL_ADMIN | CL_USER | INSP | TNT |
|--------|----|----|----------|---------|------|-----|
| List notifications | Yes | Yes (own tenant) | No | No | No | No |
| Get notification detail | Yes | Yes (own tenant) | No | No | No | No |
| Retry failed notification | Yes | Yes (own tenant) | No | No | No | No |
| List notification templates | Yes | No | Yes (own tenant) | No | No | No |
| Upsert notification template (platform default) | Yes | No | No | No | No | No |
| Upsert notification template (tenant-specific) | Yes | No | Yes (own tenant) | No | No | No |
| Receive provider webhooks | SYS | SYS | SYS | SYS | SYS | SYS |

---

## 7. Domain Events

This module both **consumes** events from other modules and **emits** its own events.

### 7.1 Events Consumed (triggers notification creation)

| Domain Event | Action |
|-------------|--------|
| `appointment.status_changed.v1` (→ `AWAITING_INSPECTOR`) | Create + enqueue `INSPECTION_NOTICE` |
| `appointment.status_changed.v1` (→ `SCHEDULED`) | Create + enqueue `INSPECTION_CONFIRMED` |
| `appointment.status_changed.v1` (→ `CANCELLED`) | Create + enqueue `INSPECTION_CANCELLED` |
| `appointment.rescheduled.v1` | Create + enqueue `INSPECTION_RESCHEDULED` |
| `service_group.accepted.v1` | Create + enqueue `INSPECTION_CONFIRMED` per appointment |
| `notification.reminder.due.v1` | Create + enqueue reminder based on `templateCode` in event |

### 7.2 notification.failed.v1

**Trigger:** `SendNotificationUseCase` — max retries reached
**Publisher:** notification module

```typescript
interface NotificationFailedEventV1 {
  eventType: 'notification.failed.v1';
  eventId: string;
  occurredAt: string;
  payload: {
    notificationId: string;
    tenantId: string;
    appointmentId: string | null;
    channel: NotificationChannel;
    templateCode: string;
    recipient: string;         // masked: first 3 chars + *** for email/phone
    failureReason: string;
    retryCount: number;
    requestId: string;
  };
}
```

**Consumers:** Operator alert service (in-platform notification to OP/AM).

### 7.3 notification.delivered.v1

**Trigger:** `HandleProviderWebhookUseCase` — delivery confirmed

```typescript
interface NotificationDeliveredEventV1 {
  eventType: 'notification.delivered.v1';
  eventId: string;
  occurredAt: string;
  payload: {
    notificationId: string;
    tenantId: string;
    appointmentId: string | null;
    channel: NotificationChannel;
    templateCode: string;
    deliveredAt: string;
    providerName: string;
    requestId: string;
  };
}
```

### 7.4 notification.reminder.due.v1

**Trigger:** `NotificationReminderWorker` processes a scheduled reminder job

```typescript
interface NotificationReminderDueEventV1 {
  eventType: 'notification.reminder.due.v1';
  eventId: string;
  occurredAt: string;
  payload: {
    appointmentId: string;
    tenantId: string;
    templateCode: 'REMINDER_7_DAYS' | 'REMINDER_5_DAYS' | 'REMINDER_3_DAYS' | 'PROPERTY_MANAGER_ESCALATION';
    scheduledDate: string;
    requestId: string;
  };
}
```

---

## 8. Queue Jobs

All jobs use pg-boss (PostgreSQL-backed, no Redis required). Queue names follow the pattern `<domain>-queue`.

### 8.1 notification.send

**Queue:** `notification-queue`
**Job name:** `notification.send`
**Priority:** Normal (escalation alerts use priority 1)

**Payload:**

```typescript
interface NotificationSendJobPayload {
  notificationId: string;
  requestId: string;
}
```

**Worker:** `NotificationSendWorker`

**Retry policy:**

```typescript
const retryPolicy = {
  attempts: 6,
  backoff: {
    type: 'custom',
    // delays in ms with ±10% jitter
    delays: [15_000, 45_000, 120_000, 300_000, 900_000],
  },
};
```

**On exhaustion:** Job state becomes `failed` in `pgboss.job` table. `HandleDlqJobWorker` sets notification to `FAILED` and emits `notification.failed.v1`.

**Idempotency:** Before dispatching to provider, check `notification.status`. If already `SENT` or `DELIVERED`, return early (no-op).

---

### 8.2 notification.reminder

**Queue:** `notification-queue`
**Job name:** `notification.reminder`
**Scheduling:** Delayed job created when appointment is scheduled (see BR-10)

**Payload:**

```typescript
interface NotificationReminderJobPayload {
  appointmentId: string;
  tenantId: string;
  templateCode: 'REMINDER_7_DAYS' | 'REMINDER_5_DAYS' | 'REMINDER_3_DAYS' | 'PROPERTY_MANAGER_ESCALATION';
  scheduledDate: string;
  requestId: string;
}
```

**Worker:** `NotificationReminderWorker`

**Process:**
1. Load appointment; if `status` is `CANCELLED`, `DONE`, or `REJECTED`, no-op.
2. For `PROPERTY_MANAGER_ESCALATION`: check if tenant's `tenant_confirmation_status` is `CONFIRMED`. If confirmed, no-op.
3. Load appointment contact (`primary_email`).
4. Create `Notification` record with `status = PENDING`.
5. Enqueue `notification.send` job.

**Retry policy:** 3 attempts; 15s, 45s, 2min. (Reminder jobs are time-sensitive; fewer retries than send jobs.)

**Cancellation:** When appointment transitions to `CANCELLED` / `DONE` / `REJECTED`, remove pending reminder jobs from queue by `jobId` pattern `reminder:{appointmentId}:*`.

---

### 8.3 notification.pending_recovery

**Queue:** `notification-queue`
**Job name:** `notification.pending_recovery`
**Scheduling:** Cron — every 5 minutes (`*/5 * * * *`)

**Payload:**

```typescript
interface PendingRecoveryJobPayload {
  requestId: string;
}
```

**Process:**
1. Query `notifications` where `status = PENDING` AND `next_retry_at < now()` AND `retry_count < 6`.
2. For each: enqueue a `notification.send` job (if not already queued — use pg-boss `singletonKey` for deduplication).
3. Log count of recovered notifications.

**Purpose:** Recover notifications that were not picked up due to worker restarts, queue failures, or clock drift.

---

## 9. External Integrations

### 9.1 Resend (Transactional Email)

**Service:** Resend
**Documentation:** https://resend.com/docs
**SDK:** `resend` npm package

**Send email:**

```typescript
// infrastructure/providers/ResendEmailProvider.ts
interface ResendEmailProvider extends IEmailProvider {
  send(params: {
    to: string;
    from: string;     // configured "From" address (e.g. noreply@properfy.com.au)
    subject: string;
    html: string;
    text: string;
    headers?: Record<string, string>;  // include X-Request-ID
  }): Promise<{ messageId: string }>;
}
```

**Environment variables:**
```
RESEND_API_KEY=re_...
RESEND_FROM_ADDRESS=noreply@properfy.com.au
RESEND_WEBHOOK_SECRET=whsec_...
```

**Webhook events to handle:**
- `email.sent` → no status change (already `SENT` from API call)
- `email.delivered` → set `DELIVERED`
- `email.bounced` → set `FAILED`, record bounce reason
- `email.complained` → set `FAILED`, record complaint

**Webhook signature verification:**
```typescript
import { Webhook } from 'svix';
const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET);
wh.verify(rawBody, headers); // throws on invalid signature
```

**Fallback:** If Resend API call fails with HTTP 5xx: trigger retry via pg-boss backoff. If circuit breaker is open: defer job with `next_retry_at = now() + 60s`.

**Circuit breaker:** 5 consecutive 5xx errors within 30s → open for 60s.

---

### 9.2 Twilio (SMS / WhatsApp)

**Service:** Twilio
**SDK:** `twilio` npm package

**Send SMS:**

```typescript
// infrastructure/providers/TwilioSmsProvider.ts
interface TwilioSmsProvider extends ISmsProvider {
  send(params: {
    to: string;       // E.164 format: +61412345678
    from: string;     // Twilio phone number or messaging service SID
    body: string;
  }): Promise<{ messageId: string }>;  // Twilio SID
}
```

**Send WhatsApp:**

```typescript
// infrastructure/providers/TwilioWhatsAppProvider.ts
// Same as SMS but `from` is prefixed with "whatsapp:" and `to` is "whatsapp:+61..."
```

**Environment variables:**
```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+61...
TWILIO_MESSAGING_SERVICE_SID=MG...  (optional, for WhatsApp)
TWILIO_WEBHOOK_AUTH_TOKEN=...       (for webhook verification)
```

**Webhook signature verification:**
```typescript
import twilio from 'twilio';
const isValid = twilio.validateRequest(
  process.env.TWILIO_AUTH_TOKEN,
  signature,       // X-Twilio-Signature header
  url,
  params
);
```

**Delivery status callbacks:** Twilio sends `MessageStatus` field: `sent`, `delivered`, `failed`, `undelivered`.

**Fallback to Zenvia:** If Twilio is unavailable (circuit breaker open), fall back to Zenvia for SMS (not WhatsApp). Log fallback occurrence. Store `provider_name = 'zenvia'` on notification.

---

### 9.3 Zenvia (SMS Fallback)

**Service:** Zenvia
**SDK:** `zenvia` npm package or REST API

**Send SMS:**

```typescript
// infrastructure/providers/ZenviaSmsProvider.ts
interface ZenviaSmsProvider extends ISmsProvider {
  send(params: {
    to: string;   // E.164 format
    body: string;
  }): Promise<{ messageId: string }>;
}
```

**Environment variables:**
```
ZENVIA_TOKEN=...
ZENVIA_FROM=Properfy   (sender ID)
```

**Note:** Zenvia is the fallback only for SMS. WhatsApp always uses Twilio.

---

## 10. Test Scenarios

### 10.1 Unit Tests

Located at: `src/modules/notification/application/use-cases/__tests__/`

**SendNotificationUseCase:**
```
[ ] Successfully sends email via Resend, updates status to SENT
[ ] Successfully sends SMS via Twilio, updates status to SENT
[ ] Successfully sends WhatsApp via Twilio, updates status to SENT
[ ] Falls back to Zenvia when Twilio circuit breaker is open (SMS only)
[ ] Renders template variables correctly from payload_json
[ ] Uses tenant-specific template when available
[ ] Falls back to platform default template when no tenant template exists
[ ] Fails immediately with TEMPLATE_NOT_FOUND when no template exists at all
[ ] Increments retry_count and sets next_retry_at on provider failure (attempts 1–5)
[ ] Sets status to FAILED and moves to DLQ at retry_count = 6
[ ] Emits notification.failed.v1 event on DLQ
[ ] Is idempotent: returns early if notification is already SENT or DELIVERED
[ ] Rejects invalid recipient (invalid email format) immediately without retry
[ ] Rejects invalid phone number (non-E.164) immediately without retry
[ ] Applies ±10% jitter to retry delays
```

**RetryNotificationUseCase:**
```
[ ] Resets FAILED notification to PENDING and enqueues send job
[ ] Rejects retry of SENT notification → NOTIFICATION_INVALID_STATUS
[ ] Rejects retry of DELIVERED notification → NOTIFICATION_INVALID_STATUS
[ ] Rejects retry of PENDING notification → NOTIFICATION_INVALID_STATUS
[ ] Creates audit log on successful manual retry
```

**HandleProviderWebhookUseCase:**
```
[ ] Updates SENT notification to DELIVERED on 'delivered' event
[ ] Updates SENT notification to FAILED on 'bounced' event
[ ] Ignores duplicate 'delivered' event when already DELIVERED (idempotent)
[ ] Does not downgrade status from DELIVERED to SENT
[ ] Logs but ignores 'opened' and 'clicked' events
```

**TemplateRendererService:**
```
[ ] Replaces all known variables correctly
[ ] Replaces unknown variables with empty string
[ ] Does not throw on template with no variables
[ ] Handles nested {{ }} gracefully (does not break)
```

**NotificationReminderWorker:**
```
[ ] Does not send reminder for CANCELLED appointment
[ ] Does not send PROPERTY_MANAGER_ESCALATION for already CONFIRMED tenant
[ ] Creates notification record before enqueuing send job
```

### 10.2 Integration Tests (Supertest)

Located at: `src/modules/notification/interfaces/http/__tests__/`

```
[ ] GET /v1/notifications — 200 with pagination as AM
[ ] GET /v1/notifications — 200 scoped to OP's tenant (no cross-tenant data)
[ ] GET /v1/notifications — 403 as CL_ADMIN
[ ] GET /v1/notifications?appointmentId=xxx — filters correctly
[ ] GET /v1/notifications?status=FAILED — returns only failed
[ ] GET /v1/notifications/:id — 200 with full payload_json as OP
[ ] GET /v1/notifications/:id — 404 for notification in other tenant (as OP)
[ ] POST /v1/notifications/:id/retry — 200 on FAILED notification as OP
[ ] POST /v1/notifications/:id/retry — 422 on SENT notification
[ ] POST /v1/notifications/:id/retry — 403 as CL_ADMIN
[ ] POST /v1/webhooks/resend — 200 with valid signature and delivered event
[ ] POST /v1/webhooks/resend — 401 with invalid signature
[ ] POST /v1/webhooks/twilio — 200 with valid Twilio signature
[ ] POST /v1/webhooks/twilio — 401 with invalid signature
```

### 10.3 Edge Cases

```
[ ] Appointment has no contact email — notification is created with FAILED status immediately
[ ] Template body contains unclosed {{ — rendered without replacement, not errored
[ ] Provider returns HTTP 429 (rate limit) — treated as retriable error (same as 5xx)
[ ] Two simultaneous webhook callbacks for same message_id and same event — second is idempotent no-op
[ ] Reminder job fires but appointment was cancelled 1 second before — no-op, no notification sent
[ ] Recovery job finds 200 stuck PENDING notifications — re-enqueues all, no duplicates (pg-boss dedup via singletonKey)
[ ] Notification created with recipient that becomes invalid later — stored as-is; failure recorded on send
[ ] Tenant has custom template with missing variable (not in payload_json) — renders as empty string
```

### 10.4 Security Tests

```
[ ] CL_ADMIN cannot list notifications from another tenant (403 or empty result)
[ ] CL_USER cannot access any notification endpoint (403)
[ ] INSP cannot access any notification endpoint (403)
[ ] TNT cannot access any notification endpoint (403)
[ ] Webhook endpoint without signature returns 401
[ ] payload_json in response does not expose internal system IDs beyond tenant scope
[ ] Recipient field in list response is shown in full only to AM/OP (not masked in this scope — confirm with product)
```
