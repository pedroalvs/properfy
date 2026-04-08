# Marketplace Endpoints (Inspector)

**Feature**: `005-service-groups-marketplace`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/service-group/interfaces/marketplace.routes.ts`, `packages/shared/src/schemas/service-group.ts`

All endpoints require an authenticated `INSP` actor. The caller's `inspectorId` is read from the JWT claims by the auth middleware and injected into the use cases.

---

## GET `/v1/marketplace/offers`

List service groups eligible for the authenticated inspector. Filtered server-side by the inspector's `serviceTypesJson`, `clientEligibilityJson`, and region coverage. Cross-tenant by design.

- **Auth**: required
- **Allowed roles**: `INSP` only

**Query params** (`listMarketplaceOffersQuerySchema`)

| Name | Type | Notes |
|---|---|---|
| `page`, `pageSize` | int | Standard pagination. |
| `sortBy`, `sortOrder` | | |

> No additional filter fields in Phase 1 — the filter set is intentionally minimal to keep the mobile UX simple. See GAP-006 regarding a lightweight list view.

**Response 200**

```json
{
  "data": [
    {
      "groupId": "<uuid>",
      "tenantName": "Acme Realty",
      "serviceTypeName": "Routine Inspection",
      "groupSize": 8,
      "scheduledDate": "2026-04-12",
      "timeWindow": "09:00-12:00",
      "priorityMode": "STANDARD|PRIORITY_24H",
      "priorityExpiresAt": "ISO-8601|null",
      "suburbs": ["Surry Hills", "Paddington"],
      "payoutEstimate": 1200.00,
      "addresses": [
        "12 George St, Surry Hills, NSW 2010",
        "..."
      ],
      "keyRequired": false
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 14
}
```

**Error codes**: `AUTH_FORBIDDEN` (non-INSP actors), `INSPECTOR_NOT_FOUND`, `INSPECTOR_INACTIVE`, `VALIDATION_ERROR`.

---

## POST `/v1/marketplace/offers/:groupId/accept`

Accept an offer. Uses optimistic concurrency — only the first inspector to reach this endpoint wins. Idempotent via the shared idempotency service.

- **Auth**: required
- **Allowed roles**: `INSP` only
- **Audit**: yes (`service_group.accepted`)
- **Idempotency**: scope `accept-offer`, 24 h retention. Default key when `Idempotency-Key` header is omitted: `accept-offer:{groupId}:{inspectorId}`.

**Path params**

| Name | Type | Notes |
|---|---|---|
| `groupId` | uuid | |

**Request body**: none (`acceptOfferSchema = {}`).

**Headers**

| Name | Required | Notes |
|---|---|---|
| `Idempotency-Key` | no | Client-supplied scope. If omitted, the server derives the default key. |

**Response 200**

```json
{
  "data": {
    "groupId": "<uuid>",
    "status": "ACCEPTED",
    "assignedInspectorId": "<uuid>",
    "appointmentsScheduled": 8,
    "acceptedAt": "ISO-8601"
  }
}
```

On replay with a cached idempotency entry, the response is identical byte-for-byte to the original.

**Error codes**: `AUTH_FORBIDDEN` (non-INSP or non-eligible), `SERVICE_GROUP_NOT_FOUND`, `SERVICE_GROUP_INVALID_STATUS`, `GROUP_ALREADY_ACCEPTED`, `INSPECTOR_NOT_FOUND`, `INSPECTOR_INACTIVE`, `INSPECTOR_SERVICE_TYPE_INELIGIBLE`, `INSPECTOR_INELIGIBLE`, `PRIORITY_EXPIRED`, `APPOINTMENTS_NOT_AWAITING_INSPECTOR`.
