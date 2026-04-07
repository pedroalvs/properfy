# Property Endpoints

**Feature**: `003-properties`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/property/interfaces/property.routes.ts`, `packages/shared/src/schemas/property.ts`

---

## POST `/v1/properties`

Create a new property under an active tenant.

- **Auth**: required
- **Allowed roles**: `AM` (must supply `tenantId`); `OP`, `CL_ADMIN`, `CL_USER` (tenant from JWT)
- **Audit**: yes (`property.created`)
- **Side effects**: enqueues `property.geocode` (non-fatal on failure).

**Request body** (`createPropertySchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `tenantId` | uuid | conditional | Required for AM. Ignored for OP and CL roles (derived from JWT). |
| `branchId` | uuid | no | Optional. Must belong to the tenant and be `ACTIVE`. |
| `propertyCode` | string (1..50, trimmed) | yes | Unique within tenant. |
| `type` | `RESIDENTIAL\|COMMERCIAL\|INDUSTRIAL\|RURAL` | yes | |
| `street` | string (1..300, trimmed) | yes | |
| `addressLine2` | string (max 200, trimmed) | no | |
| `suburb` | string (1..100, trimmed) | yes | |
| `postcode` | string (1..20, trimmed) | yes | |
| `state` | string (1..100, trimmed) | yes | |
| `country` | string (2..100, trimmed) | no | Default `AU`. |
| `notes` | string (max 2000) | no | |
| `rulesJson` | object | no | Per-property rules. Shape owned by feature 006 (see GAP-007). |

**Response 201**

```json
{
  "data": {
    "id": "<uuid>",
    "tenantId": "<uuid>",
    "branchId": "<uuid|null>",
    "propertyCode": "string",
    "type": "RESIDENTIAL",
    "street": "string",
    "addressLine2": "string|null",
    "suburb": "string",
    "postcode": "string",
    "state": "string",
    "country": "string",
    "geocodingStatus": "PENDING",
    "latitude": null,
    "longitude": null,
    "notes": "string|null",
    "rulesJson": { "...": "..." },
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `TENANT_NOT_FOUND`, `TENANT_INACTIVE`, `BRANCH_NOT_FOUND`, `BRANCH_INACTIVE`, `PROPERTY_CODE_CONFLICT`, `VALIDATION_ERROR`.

---

## GET `/v1/properties`

List properties with pagination and filters.

- **Auth**: required
- **Allowed roles**: `AM` (optionally scope via `tenantId`); `OP`, `CL_ADMIN`, `CL_USER` (locked to own tenant)

**Query params** (`listPropertiesQuerySchema`)

| Name | Type | Default | Notes |
|---|---|---|---|
| `page` | int ≥ 1 | 1 | |
| `pageSize` | int 1..100 | 20 | |
| `tenantId` | uuid | — | AM only. Ignored for OP and CL roles. |
| `branchId` | uuid | — | |
| `type` | `PropertyType` | — | |
| `search` | string (max 200) | — | Matches address fields and `propertyCode`. |
| `hasCoordinates` | boolean | — | `true` returns only rows with non-null lat/lng. |
| `sortBy` | string | `createdAt` | |
| `sortOrder` | `asc|desc` | `desc` | |

**Response 200**

```json
{
  "data": [
    {
      "id": "<uuid>",
      "tenantId": "<uuid>",
      "branchId": "<uuid|null>",
      "branchName": "string|null",
      "propertyCode": "string",
      "type": "RESIDENTIAL",
      "street": "string",
      "addressLine2": "string|null",
      "suburb": "string",
      "postcode": "string",
      "state": "string",
      "country": "string",
      "latitude": null,
      "longitude": null,
      "geocodingStatus": "PENDING|SUCCESS|FAILED|MANUAL",
      "notes": "string|null",
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

## GET `/v1/properties/:propertyId`

Read a single property.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP`, `CL_ADMIN`, `CL_USER` (own tenant only)

**Path params**

| Name | Type | Notes |
|---|---|---|
| `propertyId` | uuid | |

**Response 200**: same shape as the create response.

**Error codes**: `AUTH_FORBIDDEN`, `PROPERTY_NOT_FOUND`.

---

## PATCH `/v1/properties/:propertyId`

Update a property. Address changes trigger asynchronous geocoding unless explicit coordinates are supplied in the same patch.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP`, `CL_ADMIN`, `CL_USER` (own tenant only)
- **Audit**: yes (`property.updated`)
- **Side effects**:
  - Address field change without coordinates ⇒ `geocodingStatus = PENDING`, job `property.geocode` enqueued.
  - Explicit `latitude` AND `longitude` in payload ⇒ `geocodingStatus = MANUAL`, no job enqueued.

**Request body** (`updatePropertySchema`, all fields optional)

| Field | Type | Notes |
|---|---|---|
| `branchId` | uuid \| null | Set to `null` to unassign; new branch must be `ACTIVE`. |
| `type` | `PropertyType` | |
| `street` | string (1..300) | |
| `addressLine2` | string \| null (max 200) | |
| `suburb` | string (1..100) | |
| `postcode` | string (1..20) | |
| `state` | string (1..100) | |
| `country` | string (2..100) | |
| `latitude` | number (-90..90) \| null | |
| `longitude` | number (-180..180) \| null | |
| `notes` | string \| null (max 2000) | |
| `rulesJson` | object \| null | Replaces the existing value wholesale. |

**Response 200**: same shape as create, with updated values.

**Error codes**: `AUTH_FORBIDDEN`, `PROPERTY_NOT_FOUND`, `BRANCH_NOT_FOUND`, `BRANCH_INACTIVE`, `VALIDATION_ERROR`.

---

## DELETE `/v1/properties/:propertyId`

Soft-delete a property. Blocked if the property has open appointments.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP`, `CL_ADMIN` (own tenant only)
- **Audit**: yes (`property.deleted`)

**Response 204** — no body.

**Error codes**: `AUTH_FORBIDDEN`, `PROPERTY_NOT_FOUND`, `PROPERTY_ALREADY_DELETED`, `PROPERTY_HAS_ACTIVE_APPOINTMENTS`.

---

## POST `/v1/properties/:propertyId/geocode`

Re-enqueue an asynchronous geocoding job for the property and reset its status to `PENDING`. Refuses to run on properties with `geocodingStatus = MANUAL`.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP` (own tenant only)

**Response 202**

```json
{
  "data": {
    "propertyId": "<uuid>",
    "geocodingStatus": "PENDING"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `PROPERTY_NOT_FOUND`, `PROPERTY_GEOCODING_MANUAL_OVERRIDE`.

---

## GET `/v1/address/suggestions`

Typeahead address autocomplete backed by Mapbox. Used by property and branch forms.

- **Auth**: required
- **Allowed roles**: all authenticated roles

**Query params** (`addressSuggestionQuerySchema`)

| Name | Type | Required | Notes |
|---|---|---|---|
| `q` | string | yes | Search query. |
| `limit` | int | no | Max results. |
| `country` | string (ISO alpha-2) | no | Narrow to a country. |

**Response 200**

```json
{
  "data": [
    {
      "street": "string",
      "suburb": "string",
      "state": "string",
      "postcode": "string",
      "country": "string",
      "latitude": -33.8688,
      "longitude": 151.2093,
      "formattedAddress": "string"
    }
  ]
}
```

Shape is defined by `addressSuggestionSchema` in shared; fields above are representative.

**Error codes**: `AUTH_FORBIDDEN`, `VALIDATION_ERROR`. Provider errors are swallowed and logged.
