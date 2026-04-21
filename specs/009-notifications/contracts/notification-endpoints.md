# Notification Endpoints (Operator)

**Feature**: `009-notifications`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/notification/interfaces/notification.routes.ts`, `packages/shared/src/schemas/notification.ts`

All endpoints require a Bearer JWT.

---

## GET `/v1/notifications`

List notifications with filters and pagination.

- **Auth**: required
- **Allowed roles**: AM (any tenant); OP (own tenant only); CL_ADMIN, CL_USER (own tenant)

**Query params** (`listNotificationsQuerySchema`)

| Name | Type | Notes |
|---|---|---|
| `page`, `pageSize` | int | Standard pagination. |
| `tenantId` | uuid | AM only (OP is auto-scoped to own tenant). |
| `appointmentId` | uuid | Filter by appointment. |
| `channel` | `EMAIL\|SMS\|WHATSAPP` | |
| `status` | `PENDING\|SENT\|DELIVERED\|FAILED` | |
| `templateCode` | string | |
| `search` | string | Matches recipient substring. |
| `dateFrom`, `dateTo` | date | |
| `sortBy`, `sortOrder` | | |

**Response 200** (`notificationResponseSchema`)

```json
{
  "data": [
    {
      "id": "<uuid>",
      "tenantId": "<uuid>",
      "appointmentId": "<uuid|null>",
      "recipient": "user@example.com",
      "channel": "EMAIL",
      "templateCode": "INSPECTION_NOTICE",
      "status": "SENT|DELIVERED|FAILED|PENDING",
      "providerName": "resend|mobilemessage|zenvia|null",
      "providerMessageId": "string|null",
      "sentAt": "ISO-8601|null",
      "deliveredAt": "ISO-8601|null",
      "failedAt": "ISO-8601|null",
      "failureReason": "string|null",
      "retryCount": 2,
      "nextRetryAt": "ISO-8601|null",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 137
}
```

**Error codes**: `AUTH_FORBIDDEN`, `VALIDATION_ERROR`.

---

## GET `/v1/notifications/:notificationId`

Read a single notification.

- **Auth**: required
- **Allowed roles**: same as list

**Response 200**: same shape as list item, plus `payloadJson`.

**Error codes**: `NOTIFICATION_NOT_FOUND`.

---

## POST `/v1/notifications/:notificationId/retry`

Manually re-enqueue a failed notification.

- **Auth**: required
- **Allowed roles**: AM, OP

**Request body**: none.

**Behavior**: resets the row to `PENDING`, clears `retry_count`, `failed_at`, `failure_reason`, `next_retry_at`, and enqueues a new `notification.send` job.

**Response 200**: the updated notification.

**Error codes**: `AUTH_FORBIDDEN`, `NOTIFICATION_NOT_FOUND`, `NOTIFICATION_INVALID_STATUS` (only `FAILED` can be retried).

---

## GET `/v1/notification-templates`

List templates for the authenticated actor's scope.

- **Auth**: required
- **Allowed roles**: AM (any); OP (own tenant + platform defaults); CL_ADMIN/CL_USER (own tenant + platform defaults)

**Query params** (`listNotificationTemplatesQuerySchema`)

| Name | Type | Notes |
|---|---|---|
| `tenantId` | uuid \| null | `null` explicitly selects platform defaults. AM only for cross-tenant; OP auto-scoped to own tenant. |
| `templateCode` | string | |
| `channel` | `EMAIL\|SMS\|WHATSAPP` | |
| `isActive` | boolean | |

**Response 200**: list of templates (not paginated in Phase 1 — see GAP in [tasks.md](../tasks.md)).

---

## PUT `/v1/notification-templates/:templateCode/:channel`

Upsert a template.

- **Auth**: required
- **Allowed roles**: AM and OP (both cross-tenant per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003 — may manage any `tenant_id` including NULL for platform defaults); CL_ADMIN (own tenant only). Superseded phrasing: "OP (own tenant only … per the OP tenant-scoped rule, OP should only manage tenant-specific template overrides)".
- **Audit**: yes (`notification_template.upserted`)

**Path params**

| Name | Type | Notes |
|---|---|---|
| `templateCode` | string | Business code (e.g., `INSPECTION_NOTICE`). |
| `channel` | `EMAIL\|SMS\|WHATSAPP` | |

**Request body** (`upsertNotificationTemplateSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `tenantId` | uuid \| null | yes | `null` for platform default (AM/OP only). |
| `subject` | string (max 255) | conditional | Required for EMAIL. Ignored for SMS/WhatsApp. |
| `bodyHtml` | string | no | EMAIL only. |
| `bodyText` | string | yes | Always required. |
| `variablesJson` | object | yes | Descriptive list of expected variables. |
| `isActive` | boolean | no | Default `true`. |

**Response 200**: upserted template (`notificationTemplateResponseSchema`).

**Error codes**: `AUTH_FORBIDDEN`, `VALIDATION_ERROR`.
