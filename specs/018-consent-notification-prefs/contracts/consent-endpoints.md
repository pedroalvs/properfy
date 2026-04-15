# Contract: Consent & Unsubscribe Endpoints

**Feature**: 018-consent-notification-prefs
**Type**: REST endpoints under `/v1/notifications/*` (authenticated) and `/v1/notifications/unsubscribe` + `/v1/notifications/re-opt-in` (public)
**Status**: **DELIVERED (2026-04-11)** — all five endpoints are wired in `apps/backend/src/modules/notification/interfaces/notification.routes.ts` and covered by `tests/integration/notification/consent-endpoints.routes.test.ts`. The public POST endpoints accept both `application/json` and `application/x-www-form-urlencoded` (the form variant is used by the HTML confirmation page and routed through the inline content-type parser registered in `main/plugins.ts`).

## Overview

Five endpoints: two public (no auth), three authenticated (AM/OP only).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/notifications/unsubscribe` | Public | Render confirmation HTML page (token validation) |
| POST | `/v1/notifications/unsubscribe` | Public | Confirm opt-out (existing, extended) |
| POST | `/v1/notifications/re-opt-in` | Public | Re-subscribe via link on confirmation page |
| GET | `/v1/notifications/consents` | AM/OP | Operator lookup by recipient |
| POST | `/v1/notifications/consents/:id/override` | AM/OP | Operator override with reason |

---

## 1. GET /v1/notifications/unsubscribe (NEW, PUBLIC)

Renders the confirmation HTML page for the recipient to review before opting out.

### Request

```http
GET /v1/notifications/unsubscribe?token=<base64url>.<signature>
```

### Response (200 HTML)

```html
Content-Type: text/html; charset=utf-8

<!doctype html>
<html>
<head><title>Unsubscribe — Properfy</title>...</head>
<body>
  <h1>Unsubscribe from inspection reminders</h1>
  <p>You are about to unsubscribe <strong>renter@example.com</strong> from
     <strong>operational email</strong> notifications for <em>Agency Alpha</em>.</p>
  <form method="POST" action="/v1/notifications/unsubscribe">
    <input type="hidden" name="token" value="<token>" />
    <button type="submit">Confirm Unsubscribe</button>
  </form>
</body>
</html>
```

### Response (200 HTML — expired or invalid token)

```html
<h1>Link expired</h1>
<p>This unsubscribe link has expired or is invalid. Please contact your agency for assistance.</p>
```

Always returns 200 (even for invalid tokens) to prevent information disclosure via HTTP status codes.

---

## 2. POST /v1/notifications/unsubscribe (EXISTING, EXTENDED)

Confirms opt-out after the recipient clicked the confirmation button.

### Request

```http
POST /v1/notifications/unsubscribe
Content-Type: application/x-www-form-urlencoded OR application/json

token=<base64url>.<signature>
```

### Response (200 HTML)

```html
<h1>You have been unsubscribed.</h1>
<p>You will no longer receive operational email notifications from this agency.</p>
<p><a href="/v1/notifications/re-opt-in?token=<token>">Changed your mind? Click here to re-subscribe.</a></p>
```

### Behavior (extended in this feature)

- Validate the token via `UnsubscribeTokenService.verify()` — reject expired or invalid tokens with the same 200 HTML error page
- Look up existing consent record by `(tenantId, recipient, channel, notificationClass)`; create it if missing
- Set `optedOut = true`, `changeSource = 'unsubscribe_link'`, `changedAt = now`
- Write audit record `consent.opted_out_via_link` (actorType: `ANONYMOUS`)
- Return the confirmation HTML page

### Errors

| Condition | Response |
|-----------|----------|
| Missing token | 400 HTML "invalid link" page |
| Tampered signature | 200 HTML "expired or invalid" page (security: no distinction) |
| Expired token | 200 HTML "expired" page |
| Internal error | 500 HTML generic error page |

---

## 3. POST /v1/notifications/re-opt-in (NEW, PUBLIC)

Re-subscribes a recipient via the link on the unsubscribe confirmation page.

### Request

```http
POST /v1/notifications/re-opt-in
Content-Type: application/json

{ "token": "<base64url>.<signature>" }
```

### Response (200 HTML)

```html
<h1>You have been re-subscribed.</h1>
<p>You will resume receiving operational notifications from this agency.</p>
```

### Behavior

- Validate the token (same as unsubscribe)
- Update the consent record to `optedOut = false`, `changeSource = 're_opt_in'`, `changedAt = now`
- Write audit record `consent.re_opted_in_via_link`

---

## 4. GET /v1/notifications/consents (NEW, AM/OP)

Operator lookup by recipient (email or phone).

### Request

```http
GET /v1/notifications/consents?recipient=<email-or-phone>&tenantId=<uuid>
Authorization: Bearer <jwt>
```

### Query parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `recipient` | string | Yes | Email or phone number |
| `tenantId` | UUID | AM: optional (cross-tenant); OP: ignored (scoped to own tenant) | |
| `channel` | enum | No | Filter by channel |

### Response (200 JSON)

```json
{
  "recipient": "renter@example.com",
  "entries": [
    {
      "id": "c1",
      "tenantId": "t1",
      "channel": "EMAIL",
      "notificationClass": "OPERATIONAL",
      "optedOut": true,
      "changedAt": "2026-04-08T10:00:00.000Z",
      "changeSource": "unsubscribe_link",
      "reason": null,
      "changedByUserId": null
    },
    {
      "id": "c2",
      "tenantId": "t1",
      "channel": "SMS",
      "notificationClass": "OPERATIONAL",
      "optedOut": false,
      "changedAt": null,
      "changeSource": null,
      "reason": null,
      "changedByUserId": null
    }
  ],
  "skippedCount": 3
}
```

### Errors

| Code | HTTP | When |
|------|------|------|
| `FORBIDDEN` | 403 | Actor is not AM or OP |
| `VALIDATION_ERROR` | 400 | Missing `recipient` parameter |

---

## 5. POST /v1/notifications/consents/:id/override (NEW, AM/OP)

Operator override: re-enables delivery for a recipient. Requires mandatory reason.

### Request

```http
POST /v1/notifications/consents/<consentId>/override
Authorization: Bearer <jwt>
Content-Type: application/json

{ "reason": "Renter requested re-enrollment via phone call" }
```

### Response (200 JSON)

```json
{
  "id": "c1",
  "tenantId": "t1",
  "recipient": "renter@example.com",
  "channel": "EMAIL",
  "notificationClass": "OPERATIONAL",
  "optedOut": false,
  "changedAt": "2026-04-10T12:00:00.000Z",
  "changeSource": "operator_override",
  "reason": "Renter requested re-enrollment via phone call",
  "changedByUserId": "<actor userId>"
}
```

### Behavior

- Validate actor role (AM/OP only; others get 403)
- Look up consent record by ID
- Validate tenant scope: OP can only override records in their own tenant (enforced via `assertTenantScope`)
- Update record: `optedOut = false`, `changeSource = 'operator_override'`, `changedByUserId = actor.userId`, `reason = body.reason`, `changedAt = now`
- Write audit record `consent.override_opted_in` with the reason and actor
- Return the updated record

### Errors

| Code | HTTP | When |
|------|------|------|
| `FORBIDDEN` | 403 | Actor is not AM or OP |
| `CONSENT_NOT_FOUND` | 404 | Consent id does not exist |
| `TENANT_SCOPE_VIOLATION` | 403 | OP attempting to override a record in another tenant |
| `VALIDATION_ERROR` | 400 | Missing or empty reason |

---

## Unchanged Endpoints (impact summary)

- `GET /v1/notifications` — now returns `notificationClass` on each row (optional field in the response schema)
- `GET /v1/notifications/:id` — same
- `POST /v1/notifications/templates/:id` (upsert) — accepts new optional `notificationClass` in body; rejects invalid reclassification of protected codes

## Legacy or deprecated routes

None. All 018 endpoints are new or extensions of existing notification routes.

## Backward Compatibility

- `markInvoicePaidSchema`-style extension: all new body fields are optional; existing callers keep working
- New enum values (`SKIPPED_OPT_OUT`, `NotificationClass`, `ConsentChangeSource`) are additive
- No existing route's behavior changes except the extended `POST /v1/notifications/unsubscribe` which now writes an audit record and respects per-class scoping (old behavior was implicitly "opt out of everything on this channel"; new behavior narrows to operational, matching the previous intent since only operational notifications have unsubscribe links)
