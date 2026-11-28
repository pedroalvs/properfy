# Mail Bot - AutoLabs — API handoff

Read-only API access for the AutoLabs "Mail Bot" integration. It authenticates with an
inbound Properfy API key and can read appointments and contacts across all agencies.

## Authentication

- Send the key in the **`X-API-Key`** header on every request:
  `X-API-Key: pfy_…`
- The key is created by a Properfy admin (Integrations → API Keys → **Mail Bot - AutoLabs**)
  and shown **once** at creation. Store it securely; it cannot be retrieved again.
- The key acts as a cross-tenant operator (read-only): it sees every agency's data. Narrow a
  query to one agency with the `tenantId` query parameter where supported.
- A JWT (human) session is **not** used by this integration.

## Base URL

Same host as the rest of the Properfy API, under the `/v1` prefix. The staging and production
base URLs are provided separately by Properfy.

## Endpoints (all `GET`, read-only)

### `GET /v1/appointments?search=<text>`

Paginated list of appointments. Supports `search` plus the standard pagination params
(`page`, `pageSize`, `sortBy`, `sortOrder`) and the same filters as the operator list
(e.g. `tenantId`, `status`, date ranges). Response: `{ data: [...], pagination: {...} }`.

### `GET /v1/contacts?search=<text>`

Paginated list of contacts. Supports `search`, `tenantId` and the standard pagination params.
Response: `{ data: [...], pagination: {...} }`.

### `GET /v1/contacts/{id}?includeAppointments=true`

A single contact. With `includeAppointments=true` the response also carries the contact's
appointments (`appointments.data` + `appointments.pagination`). Optional paging:
`appointmentsPage`, `appointmentsPageSize`.

## Errors & limits

- `401` — missing, invalid, revoked or expired key.
- `403` — the key is present but lacks the `bot:mail` scope (e.g. a key for a different
  integration). The three routes above are the only ones this key can call; any other route
  returns `401` for a key-only request.
- `429` — rate limit exceeded; back off and retry.
- Error envelope: `{ "error": { "code", "message", "details" } }`.

## Operational checklist for AutoLabs

- [ ] Receive the `pfy_…` API key (shown once) from the Properfy admin.
- [ ] Send it in the `X-API-Key` header on every request.
- [ ] Use `tenantId` when a query should be limited to one agency.
- [ ] Back off on `429`; escalate on repeated `5xx`.
