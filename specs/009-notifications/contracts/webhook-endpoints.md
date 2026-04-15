# Provider Webhook Endpoints

**Feature**: `009-notifications`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/notification/interfaces/notification.routes.ts`

Three endpoints, one per provider. **All three are unauthenticated in Phase 1** — providers cannot carry our Bearer JWTs. Signature validation is tracked as GAP-007.

All three endpoints share the same high-level behavior:

- Parse the provider-specific payload and extract `provider_message_id` + event type.
- Map the event to an internal status (`delivered` → `DELIVERED`; `bounced`/`failed`/`rejected`/`complained` → `FAILED`).
- Delegate to `HandleProviderWebhookUseCase` which looks up the notification by `provider_message_id` and updates its row.
- **Always return `200 { received: true }`** — even when the id is unknown or the event is unmapped — to avoid provider retry storms.

---

## POST `/v1/webhooks/resend`

Receive delivery events from Resend.

- **Auth**: none
- **Rate limit**: none (provider-controlled)

**Request body** (Resend Svix payload — shape varies)

| Field | Type | Notes |
|---|---|---|
| `type` | string | Mapped events: `email.delivered`, `email.bounced`, `email.complained`. Others are ignored. |
| `data.id` | string | Resend message id matching `provider_message_id`. |

**Response 200**

```json
{ "received": true }
```

---

## POST `/v1/webhooks/mobile-message`

Receive delivery events from Mobile Message.

- **Auth**: none (provider-specific authentication/signature validation is GAP-007; exact Mobile Message webhook verification mechanism must be confirmed during implementation)

**Request body** (Mobile Message status callback — JSON)

| Field | Type | Notes |
|---|---|---|
| `message_id` | string | Mobile Message id matching `provider_message_id`. |
| `status` | string | Mapped events: `delivered`, `failed`. |
| `custom_ref` | string | Optional correlation reference. |

**Response 200**

```json
{ "received": true }
```

---

## POST `/v1/webhooks/zenvia`

Receive delivery events from Zenvia for WhatsApp messages.

- **Auth**: none (HMAC validation is GAP-007)

**Request body** (Zenvia event payload)

| Field | Type | Notes |
|---|---|---|
| `id` | string | Zenvia message id matching `provider_message_id`. |
| `status` | string | Mapped events: `delivered`, `failed`, `rejected`. |

**Response 200**

```json
{ "received": true }
```
