# Properfy — Fy Agent API

Integration handoff for **AutoLabs** (Fy WhatsApp agent). This document is the authoritative contract; it supersedes the draft endpoint spec ("Properfy Fy Endpoints Spec") wherever they differ.

- **Audience:** the n8n workflow powering the Fy agent.
- **Base URL:** `https://<api-host>/v1/integrations/fy`
  - Staging: `https://api-properfy.pedroalvs.com/v1/integrations/fy`
  - Production: provided separately.
- **Format:** JSON, UTF-8, **camelCase** field names.
- **Timestamps:** ISO 8601. `scheduledDate` is a plain date (`YYYY-MM-DD`); time slots are `HH:mm` strings in the agency's local timezone (returned as `agency.timezone`, default `Australia/Sydney`).

## Naming differences vs the draft spec

Properfy domain naming applies:

| Draft spec | This API |
|---|---|
| `real_estate` / realty agency | `agency` |
| `realty` (the property) | `propertyAddress` / property |
| `visitor` | `contact` (the rental tenant) |
| `OPEN` status | `AWAITING_INSPECTOR` (the query filter still accepts `OPEN` as an alias) |
| snake_case fields | camelCase fields |

Appointment statuses: `DRAFT`, `AWAITING_INSPECTOR`, `SCHEDULED`, `DONE`, `CANCELLED`, `REJECTED`.

## Authentication

Every request must carry an API key issued from the Properfy Integrations Hub:

```
X-API-Key: pfy_<random>
```

- The key is **scoped to `bot:fy`** — it can call only the routes in this document, nothing else in the Properfy API.
- It is shown exactly once at creation; store it securely. It can be revoked or expired at any time from the Properfy admin.
- No JWT, no refresh flow — the key is the whole credential.

Failures: `401` (missing/invalid/revoked/expired key), `403` with code `AUTH_FORBIDDEN_SCOPE` (key lacks the `bot:fy` scope).

## Rate limits

- **60 requests/minute per API key** on Fy routes (HTTP `429`, code `RATE_LIMIT_EXCEEDED`).
- A global 200 requests/minute per IP also applies.

## Response envelope

Success responses wrap the payload in `data`:

```json
{ "data": { ... } }
```

Errors use:

```json
{ "error": { "code": "APPOINTMENT_NOT_FOUND", "message": "Appointment not found", "details": {} } }
```

| HTTP | Codes you will see |
|---|---|
| 400 | `VALIDATION_ERROR` (details include the offending field, e.g. an invalid `phone`) |
| 401 | `AUTH_UNAUTHORIZED` |
| 403 | `AUTH_FORBIDDEN_SCOPE` |
| 404 | `NO_ACTIVE_APPOINTMENTS`, `APPOINTMENT_NOT_FOUND`, `AGENCY_NOT_FOUND` |
| 409 | `VIOLATES_NOTICE_PERIOD`, `NO_PRIMARY_CONTACT`, `INVALID_APPOINTMENT_STATUS` |
| 429 | `RATE_LIMIT_EXCEEDED` |

## Design philosophy (unchanged from the briefing)

- **Fy never confirms, cancels or reschedules directly.** Those actions belong to the tenant, via the unique `confirmationLink`. Fy's job is to hand over that link.
- Fy has **no access to inspection reports** — those go to the Property Manager only.
- Notes added by Fy are visible to the inspector in the mobile app.
- `available-dates` is an informative fallback only; the link remains the action path.

---

## Endpoints

### 1. `GET /appointments/by-contact-phone`

Entry point — identify the tenant by WhatsApp number and list their appointments.

Query params:

| Param | Type | Required | Notes |
|---|---|---|---|
| `phone` | string | yes | AU number; E.164 (`+61412345678`) or local (`0412 345 678`) accepted |
| `statusIn` | string | no | Comma-separated statuses. Default `AWAITING_INSPECTOR,SCHEDULED` **plus** `DONE` finished in the last 48h. `OPEN` accepted as alias. |

`200`:

```json
{
  "data": {
    "contact": { "name": "John Smith", "email": "john@example.com", "phone": "+61412345678" },
    "appointments": [
      {
        "id": "6f8b3a4e-…",
        "code": "INS-0042",
        "status": "SCHEDULED",
        "serviceType": { "id": "…", "name": "Routine Inspection" },
        "scheduledDate": "2026-08-10",
        "timeSlotStart": "09:00",
        "timeSlotEnd": "12:00",
        "propertyAddress": "12 George St, Sydney NSW 2000",
        "agency": { "id": "…", "name": "Belle Property St George" }
      }
    ]
  }
}
```

`404 NO_ACTIVE_APPOINTMENTS` when nothing matches — respond politely and escalate to a human.
Multiple appointments → ask the tenant which one (use `code`, address and date).

### 2. `GET /appointments/{id}`

Full detail, including the tenant action link.

`200` (`data`):

```json
{
  "id": "6f8b3a4e-…",
  "code": "INS-0042",
  "status": "SCHEDULED",
  "serviceType": { "id": "…", "name": "Routine Inspection" },
  "scheduledDate": "2026-08-10",
  "timeSlotStart": "09:00",
  "timeSlotEnd": "12:00",
  "propertyAddress": "12 George St, Apt 8B, Sydney NSW 2000",
  "keyRequired": false,
  "meetingLocation": "Front entrance",
  "keyLocation": "Ground floor lockbox",
  "inspector": { "id": "…", "name": "Kez Anderson" },
  "agency": { "id": "…", "name": "Belle Property St George", "timezone": "Australia/Sydney" },
  "contact": { "name": "John Smith", "email": "john@example.com", "phone": "+61412345678", "confirmed": false },
  "notes": "[Fy 2026-07-09T10:00:00.000Z] Call tenant 30 min before arrival",
  "rentalTenantNote": null,
  "confirmationLink": {
    "url": "https://properfy.pedroalvs.com/portal/abc123…",
    "expiresAt": "2026-08-09T09:00:00.000Z"
  }
}
```

About `confirmationLink`:

- Same unique link the tenant receives by email/SMS. Covers **confirm, cancel and reschedule**.
- `url: null` means no active link, expired link, or link unavailable — **escalate to a human** (or trigger `resend-notice`).

`inspector` is `null` while the appointment is `AWAITING_INSPECTOR`.

### 3. `GET /agencies/{id}`

Agency (real estate) contact card — use the `agency.id` from an appointment.

`200` (`data`):

```json
{
  "id": "…",
  "name": "Belle Property St George",
  "timezone": "Australia/Sydney",
  "branches": [
    { "id": "…", "name": "St George", "email": "info@belleproperty.com.au", "address": "45 Kent St, St George, NSW, 2217" }
  ]
}
```

Note: phone/website are not tracked per agency today; direct the tenant to the branch email.

### 4. `GET /appointments/{id}/available-dates?limit=5`

Informative fallback when the tenant asks for dates before clicking the link. Dates come from existing inspection runs (service groups) in the property's area that the appointment could join.

| Param | Type | Notes |
|---|---|---|
| `limit` | int | default 5, max 10 |

Business rules baked in:

- Weekdays only (no Saturday/Sunday).
- Slots within 08:00–20:00 only.
- Minimum 7-day notice (Residential Tenancies Act 2010). If candidate dates exist but **all** breach the notice window → `409 VIOLATES_NOTICE_PERIOD`.

`200` (`data`):

```json
{
  "availableDates": [
    { "date": "2026-08-12", "timeSlots": [ { "start": "08:00", "end": "12:00" }, { "start": "13:00", "end": "17:00" } ] },
    { "date": "2026-08-14", "timeSlots": [ { "start": "09:00", "end": "13:00" } ] }
  ]
}
```

An empty list is a valid answer ("no runs scheduled in the area yet — use the link or we'll arrange assistance").

### 5. `POST /appointments/{id}/notes`

Add an operational note visible to the inspector (e.g. "Call me 30 minutes before arrival", "There's a dog on the property").

Body:

```json
{ "content": "Tenant requested a call 30 minutes before arrival. Contact: +61412345678." }
```

Max 2000 characters. No `created_by`/`visibility` fields — authorship (`Fy` + timestamp) and inspector visibility are applied server-side and the write is audit-logged.

`201` (`data`):

```json
{ "content": "Tenant requested a call 30 minutes before arrival. Contact: +61412345678.", "createdAt": "2026-07-09T10:00:00.000Z" }
```

### 6. `PATCH /appointments/{id}/contact`

Correct the tenant's contact details on the appointment. Send only what changes:

```json
{ "name": "John A. Smith", "email": "john.smith@example.com", "phone": "+61412345678" }
```

- `phone` must be a valid AU number; it is normalised to E.164.
- At least one field is required.
- Changes are audit-logged with the Fy service account as actor. For the sensitive cases in the FAQ (31, 36), still escalate to a human after registering.

`200` (`data`):

```json
{ "contact": { "name": "John A. Smith", "email": "john.smith@example.com", "phone": "+61412345678" } }
```

`409 NO_PRIMARY_CONTACT`-style `404 CONTACT_NOT_FOUND` when the appointment has no primary contact.

### 7. `POST /appointments/{id}/resend-notice`

Re-send the formal notice (portal link) to the tenant when they say they never received it. No body required.

- Re-issues the unique link and queues the email/SMS notification.
- Only valid while the appointment is `AWAITING_INSPECTOR` or `SCHEDULED` (`409 INVALID_APPOINTMENT_STATUS` otherwise).
- `409 NO_PRIMARY_CONTACT` if there is no primary contact to notify.

`202` (`data`):

```json
{ "status": "QUEUED" }
```

Still escalate to a human for guarantee, per the FAQ 12 flow.

---

## Webhooks (Properfy → Fy)

Properfy POSTs events to the n8n URL configured in the Properfy Integrations Hub ("Fy Agent" tab).

- **Headers:** `X-Webhook-Secret: <shared secret>` (validate it!), `X-Fy-Event: <event name>`, `Content-Type: application/json`.
- **Delivery:** respond `2xx` quickly. Non-2xx (or timeout >10s) is retried **5 times with exponential backoff**; after that the event is dropped into the failed-jobs queue for operator attention.
- Duplicates are possible (at-least-once delivery) — de-duplicate on `data.appointmentId` + `event` + `timestamp` if needed.

### `inspector.accepted` (required flow)

One event **per appointment** when an inspector accepts a service group — the trigger for Fy's first proactive WhatsApp message.

```json
{
  "event": "inspector.accepted",
  "timestamp": "2026-07-09T10:00:00.000Z",
  "data": {
    "appointmentId": "6f8b3a4e-…",
    "appointmentCode": "INS-0042",
    "inspector": { "id": "…", "name": "Kez Anderson" }
  }
}
```

Follow with `GET /appointments/{id}` to fetch the tenant's phone and the confirmation link.

### `appointment.status_changed`

```json
{
  "event": "appointment.status_changed",
  "timestamp": "2026-07-09T10:00:00.000Z",
  "data": { "appointmentId": "6f8b3a4e-…", "fromStatus": "SCHEDULED", "toStatus": "DONE" }
}
```

Useful for future flows (e.g. satisfaction survey on `toStatus: "DONE"`).

---

## Example conversation flow

Tenant: *"Hi, I need to reschedule my inspection tomorrow, I'll be overseas."*

1. `GET /appointments/by-contact-phone?phone=%2B61412345678` → one `SCHEDULED` appointment, code `INS-0042`.
2. `GET /appointments/6f8b3a4e-…` → full context + `confirmationLink.url`.
3. Fy replies: *"Thank you for letting us know, Mr. Smith. You can reschedule using your inspection link: https://…/portal/abc123. If no suitable dates appear, let me know so I can arrange assistance."*
4. If the tenant answers "no dates work" → escalate to a human operator in Chatwoot. Optionally check `GET /appointments/{id}/available-dates` first to inform the conversation.

## Operational checklist for AutoLabs

- [ ] Receive the `pfy_…` API key (shown once) from the Properfy admin.
- [ ] Provide the n8n webhook URL + choose a shared secret (≥16 chars); Properfy configures both in the Integrations Hub.
- [ ] Validate `X-Webhook-Secret` on every inbound webhook.
- [ ] Respect the 60 req/min budget; back off on `429`.
- [ ] Escalate to a human whenever `confirmationLink.url` is `null`, on any `5xx`, or per the FAQ escalation rules.
