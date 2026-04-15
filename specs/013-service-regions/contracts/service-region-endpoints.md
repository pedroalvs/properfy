# Service Region Endpoints

**Feature**: `013-service-regions`
**Status**: IMPLEMENTED (with DIVERGENCE — tenant scoping incomplete)
**Source**: `apps/backend/src/modules/service-region/interfaces/service-region.routes.ts`, `packages/shared/src/schemas/service-region.ts`

Service regions are **tenant-scoped** (each region has a mandatory `tenant_id`). AM can manage regions for any tenant; OP manages regions within their own tenant only. CL_ADMIN and CL_USER can read regions for their own tenant. INSP can read only their assigned regions.

> **Note**: This contract was extracted from `specs/004-service-catalog/contracts/service-region-endpoints.md`. This is now the canonical location.

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
| `name` | string (1..255, trimmed) | yes | Display name. Must be unique within the tenant. |
| `geojson` | `{ type: "Polygon", coordinates: [[[lng, lat], ...]] }` | yes | Single exterior ring (+ optional holes). At least 4 coordinates per ring, first == last. |
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
    "createdByUserId": "<uuid>",
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `REGION_NAME_CONFLICT`, `VALIDATION_ERROR`.

---

## GET `/v1/service-regions`

List regions with pagination, status filter, and search. Tenant-scoped.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant via `tenantId` filter); `OP`, `CL_ADMIN`, `CL_USER` (own tenant from JWT); `INSP` (own assigned regions only)

**Query params** (`listServiceRegionsQuerySchema`)

| Name | Type | Default | Notes |
|---|---|---|---|
| `page` | int >= 1 | 1 | |
| `pageSize` | int 1..100 | 20 | |
| `tenantId` | uuid | -- | AM only. Ignored for other roles (derived from JWT). |
| `status` | `ACTIVE\|INACTIVE` | -- | |
| `search` | string (max 255) | -- | Matches `name`. |
| `sortBy` | string | `createdAt` | |
| `sortOrder` | `asc\|desc` | `desc` | |

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

**INSP behavior**: When the caller is INSP, the result is filtered to only include regions the inspector is assigned to via `InspectorRegion`. Pagination and filters still apply within that subset.

---

## GET `/v1/service-regions/:id`

Read a single region.

- **Auth**: required
- **Allowed roles**: all authenticated roles (tenant-scoped; INSP only if assigned to this region)

**Response 200**: same shape as list item.

**Error codes**: `SERVICE_REGION_NOT_FOUND`, `AUTH_FORBIDDEN`.

---

## PATCH `/v1/service-regions/:id`

Update a region.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP` (own tenant only)
- **Audit**: yes (`service_region.updated`, with `before`/`after`)

**Request body** (`updateServiceRegionSchema`, all fields optional)

| Field | Type | Notes |
|---|---|---|
| `name` | string (1..255) | Must remain unique within tenant. |
| `geojson` | Polygon (as above) | Replaces the shape. Also updates `geom` column. |
| `color` | string (max 20) | |

**Response 200**: same shape as create.

**Error codes**: `AUTH_FORBIDDEN`, `SERVICE_REGION_NOT_FOUND`, `REGION_NAME_CONFLICT`, `VALIDATION_ERROR`.

---

## POST `/v1/service-regions/:id/deactivate`

Deactivate a region with an audited reason. Blocked if any published service group references the region.

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

**Error codes**: `AUTH_FORBIDDEN`, `SERVICE_REGION_NOT_FOUND`, `SERVICE_REGION_HAS_PUBLISHED_GROUPS`, `VALIDATION_ERROR`.

---

## DELETE `/v1/service-regions/:id`

Hard-delete a region. Only inactive regions with no service group references can be deleted. Cascades `inspector_regions` rows.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP` (own tenant only)
- **Audit**: yes (`service_region.deleted`)

**Response 204** -- no body.

**Error codes**: `AUTH_FORBIDDEN`, `SERVICE_REGION_NOT_FOUND`, `SERVICE_REGION_STILL_ACTIVE`, `SERVICE_REGION_IN_USE`.

---

## POST `/v1/service-regions/resolve`

Given up to 25 appointment IDs, returns the regions matching each appointment's property location along with an inspector count per region and the list of unmatched appointments. Region matching is **tenant-scoped** -- each appointment is matched only against regions belonging to the same tenant.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP` (own tenant only)
- **Audit**: no (read-only query)

**Request body** (`resolveRegionsSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `appointmentIds` | string[] (1..25 UUIDs) | yes | Hard cap at 25. |

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
