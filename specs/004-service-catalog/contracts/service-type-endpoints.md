# Service Type Endpoints

**Feature**: `004-service-catalog`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/service-type/interfaces/service-type.routes.ts`, `packages/shared/src/schemas/service-type.ts`

Service types are a **global catalog** with no `tenant_id`. Only Admin Master may mutate them.

---

## POST `/v1/service-types`

Create a new service type.

- **Auth**: required
- **Allowed roles**: `AM` only
- **Audit**: yes (`service_type.created`)

**Request body** (`createServiceTypeSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string (1..50, trimmed, uppercased) | yes | Globally unique. |
| `name` | string (1..200, trimmed) | yes | Display name. |
| `flowType` | `ROUTINE\|INGOING\|OUTGOING` | yes | Drives appointment state machine. |
| `requiresTenantConfirmation` | boolean | no | Schema default `true`. See GAP-001 for the use-case default drift. |

**Response 201**

```json
{
  "data": {
    "id": "<uuid>",
    "code": "STANDARD_INSPECTION",
    "name": "Standard Inspection",
    "flowType": "ROUTINE",
    "requiresTenantConfirmation": true,
    "status": "ACTIVE",
    "createdAt": "ISO-8601"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `SERVICE_TYPE_CODE_CONFLICT`, `VALIDATION_ERROR`.

---

## GET `/v1/service-types`

List service types with pagination, status filter, and text search.

- **Auth**: required
- **Allowed roles**: all authenticated roles

**Query params** (`listServiceTypesQuerySchema`)

| Name | Type | Default | Notes |
|---|---|---|---|
| `page` | int ≥ 1 | 1 | |
| `pageSize` | int 1..100 | 20 | |
| `status` | `ACTIVE\|INACTIVE` | — | |
| `search` | string (max 200) | — | Matches `code` or `name`. |
| `sortBy` | string | `createdAt` | |
| `sortOrder` | `asc|desc` | `desc` | |

**Response 200**

```json
{
  "data": [
    {
      "id": "<uuid>",
      "code": "string",
      "name": "string",
      "flowType": "ROUTINE|INGOING|OUTGOING",
      "requiresTenantConfirmation": true,
      "status": "ACTIVE|INACTIVE",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 7
}
```

**Error codes**: `VALIDATION_ERROR`.

---

## GET `/v1/service-types/:serviceTypeId`

Read a single service type.

- **Auth**: required
- **Allowed roles**: all authenticated roles

**Response 200**: same shape as list item.

**Error codes**: `SERVICE_TYPE_NOT_FOUND`.

---

## PATCH `/v1/service-types/:serviceTypeId`

Update a service type. No hard-delete path exists — setting `status = INACTIVE` is the only retirement mechanism.

- **Auth**: required
- **Allowed roles**: `AM` only
- **Audit**: yes (`service_type.updated`)

**Request body** (`updateServiceTypeSchema`, all fields optional)

| Field | Type | Notes |
|---|---|---|
| `name` | string (1..200) | |
| `flowType` | `ROUTINE\|INGOING\|OUTGOING` | |
| `requiresTenantConfirmation` | boolean | |
| `status` | `ACTIVE\|INACTIVE` | |

> `code` is immutable — not part of the update schema.

**Response 200**: same shape as create.

**Error codes**: `AUTH_FORBIDDEN`, `SERVICE_TYPE_NOT_FOUND`, `VALIDATION_ERROR`.
