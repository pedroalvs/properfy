# Service Region Endpoints

> **Extraction notice (2026-04-22):** Service region implementation details have been extracted to `specs/013-service-regions/`. This contract file is preserved for reference. Implementation tracking: `specs/013-service-regions/tasks.md`.

**Feature**: `004-service-catalog`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/service-region/interfaces/service-region.routes.ts`, `packages/shared/src/schemas/service-region.ts`

Service regions are **tenant-scoped** at the storage layer (each region has a mandatory `tenant_id`). AM and OP are both cross-tenant operators per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003 — both may manage regions for any tenant by supplying `tenantId` in the payload. They are consumed by the inspector marketplace (feature 005) and by the inspector-region mapping owned by the inspector module. Superseded phrasing: "OP manages regions within their own tenant only".

---

## POST `/v1/service-regions`

Create a new service region polygon under a tenant.

- **Auth**: required
- **Allowed roles**: `AM` (must supply `tenantId`); `OP` (own tenant, from JWT)
- **Audit**: yes (`service_region.created`)

**Request body** (`createServiceRegionSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `tenantId` | uuid | conditional | Required for AM. Ignored for OP (derived from JWT). |
| `name` | string (1..255, trimmed) | yes | Display name. |
| `geojson` | `{ type: "Polygon", coordinates: [[[lng, lat], ...]] }` | yes | Single exterior ring (+ optional holes). At least 4 coordinates per ring. MultiPolygon support is GAP-006. |
| `color` | string (max 20) | no | Hex or CSS color. Default `#3b82f6`. |

**Response 201**

```json
{
  "data": {
    "id": "<uuid>",
    "tenantId": "<uuid>",
    "name": "Sydney CBD",
    "geojson": { "type": "Polygon", "coordinates": [[[151.20, -33.87], [151.22, -33.87], [151.22, -33.85], [151.20, -33.85], [151.20, -33.87]]] },
    "color": "#3b82f6",
    "status": "ACTIVE",
    "createdAt": "ISO-8601"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `VALIDATION_ERROR`.

---

## GET `/v1/service-regions`

List regions with pagination, status filter, and search. Tenant-scoped.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant via `tenantId` filter); `OP`, `CL_ADMIN`, `CL_USER`, `INSP` (own tenant only, from JWT)

**Query params** (`listServiceRegionsQuerySchema`)

| Name | Type | Default | Notes |
|---|---|---|---|
| `page` | int ≥ 1 | 1 | |
| `pageSize` | int 1..100 | 20 | |
| `tenantId` | uuid | — | AM only. Ignored for other roles (derived from JWT). |
| `status` | `ACTIVE\|INACTIVE` | — | |
| `search` | string (max 255) | — | Matches `name`. |
| `sortBy` | string | `createdAt` | |
| `sortOrder` | `asc|desc` | `desc` | |

**Response 200**

```json
{
  "data": [
    {
      "id": "<uuid>",
      "tenantId": "<uuid>",
      "name": "string",
      "geojson": { "type": "Polygon", "coordinates": [[[...]]] },
      "color": "#RRGGBB",
      "status": "ACTIVE|INACTIVE",
      "createdByUserId": "<uuid|null>",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 12
}
```

---

## GET `/v1/service-regions/:id`

Read a single region.

- **Auth**: required
- **Allowed roles**: all authenticated roles

**Response 200**: same shape as list item.

**Error codes**: `SERVICE_REGION_NOT_FOUND`.

---

## PATCH `/v1/service-regions/:id`

Update a region.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP` (own tenant only)
- **Audit**: yes (`service_region.updated`)

**Request body** (`updateServiceRegionSchema`, all fields optional)

| Field | Type | Notes |
|---|---|---|
| `name` | string (1..255) | |
| `geojson` | Polygon (as above) | Replaces the shape. |
| `color` | string (max 20) | |
| `status` | `ACTIVE\|INACTIVE` | Direct status change is accepted here, but the recommended flow is via the dedicated `deactivate` endpoint which records a reason. |

**Response 200**: same shape as create.

**Error codes**: `AUTH_FORBIDDEN`, `SERVICE_REGION_NOT_FOUND`, `VALIDATION_ERROR`.

---

## POST `/v1/service-regions/:id/deactivate`

Deactivate a region with an audited reason.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP` (own tenant only)
- **Audit**: yes (`service_region.deactivated`, carries `reason`)

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `reason` | string (min 1) | yes | Persisted on the audit record. |

**Response 200**

```json
{
  "data": {
    "id": "<uuid>",
    "status": "INACTIVE"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `SERVICE_REGION_NOT_FOUND`, `VALIDATION_ERROR`.

---

## DELETE `/v1/service-regions/:id`

Hard-delete a region. Only inactive regions can be deleted. Cascades `inspector_regions` rows.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP` (own tenant only)
- **Audit**: yes (`service_region.deleted`)

**Response 204** — no body.

**Error codes**: `AUTH_FORBIDDEN`, `SERVICE_REGION_NOT_FOUND`, `SERVICE_REGION_STILL_ACTIVE`.

---

## POST `/v1/service-regions/resolve`

Given up to 200 appointment IDs, returns the regions matching each appointment's property location along with an inspector count per region and the list of appointments with no matching region. Region matching is **tenant-scoped** — each appointment is matched only against regions belonging to the same tenant. (`CORRECTION-004`: the code currently matches against all regions globally; this is a divergence.)

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP` (own tenant only)
- **Audit**: no (read-only query)

**Request body** (`resolveRegionsSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `appointmentIds` | string[] (1..200 UUIDs) | yes | Raised from 25 to 200 (GAP-010 closed). |

**Response 200**

```json
{
  "data": {
    "regions": [
      {
        "regionId": "<uuid>",
        "regionName": "Sydney CBD",
        "color": "#3b82f6",
        "matchedAppointmentCount": 6,
        "inspectorCount": 3
      }
    ],
    "totalAppointments": 10,
    "unmatchedAppointmentIds": ["<uuid>", "<uuid>"]
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `VALIDATION_ERROR`.
