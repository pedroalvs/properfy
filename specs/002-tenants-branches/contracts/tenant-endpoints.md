# Tenant Endpoints

**Feature**: `002-tenants-branches`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/tenant/interfaces/tenant.routes.ts`, `packages/shared/src/schemas/tenant.ts`

---

## POST `/v1/tenants`

Create a new real-estate agency tenant in `PENDING` status.

- **Auth**: required
- **Allowed roles**: `AM`
- **Audit**: yes (`tenant.created`)
- **Side effects**: seeds two default appointment time slots for the new tenant (`09:00-12:00`, `14:00-17:00`).

**Request body** (`createTenantSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string (1..200, trimmed) | yes | Display name. |
| `legalName` | string (1..200, trimmed) | yes | Globally unique across all tenants. |
| `timezone` | string (1..60) | no | Default `Australia/Sydney`. IANA timezone. |
| `currency` | string (exactly 3) | no | Default `AUD`. ISO 4217 code. |
| `settings` | object (`tenantSettingsSchema`) | no | Strict subset — see [data-model.md](../data-model.md). |

**Response 201**

```json
{
  "data": {
    "id": "<uuid>",
    "name": "string",
    "legalName": "string",
    "status": "PENDING",
    "timezone": "string",
    "currency": "string",
    "settingsJson": { "...": "..." },
    "createdAt": "ISO-8601"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `TENANT_LEGAL_NAME_CONFLICT`, `VALIDATION_ERROR`.

---

## GET `/v1/tenants`

List tenants with pagination, status filter, and text search.

- **Auth**: required
- **Allowed roles**: `AM` only — product decision (the all-tenants list view is reserved for AM). OP is cross-tenant per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003 and reads any tenant via `GET /v1/tenants/:tenantId`. Superseded phrasing: "OP cannot list all tenants; OP sees their own tenant via `GET /v1/tenants/:tenantId`".

**Query params** (`listTenantsQuerySchema`)

| Name | Type | Default | Notes |
|---|---|---|---|
| `page` | int ≥ 1 | 1 | |
| `pageSize` | int 1..100 | 20 | |
| `status` | `PENDING|ACTIVE|INACTIVE` | — | Optional filter. |
| `search` | string (max 200) | — | Matches `name` or `legalName` substring. |
| `sortBy` | string | `createdAt` | See server list for allowed fields. |
| `sortOrder` | `asc|desc` | `desc` | |

**Response 200**

```json
{
  "data": [
    {
      "id": "<uuid>",
      "name": "string",
      "legalName": "string",
      "status": "PENDING|ACTIVE|INACTIVE",
      "timezone": "string",
      "currency": "string",
      "branchCount": 3,
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 42
}
```

**Error codes**: `AUTH_FORBIDDEN`, `VALIDATION_ERROR`.

---

## GET `/v1/tenants/:tenantId`

Read a single tenant.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP`, `CL_ADMIN`, `CL_USER` (own tenant only)

**Path params**

| Name | Type | Notes |
|---|---|---|
| `tenantId` | uuid | |

**Response 200**

```json
{
  "data": {
    "id": "<uuid>",
    "name": "string",
    "legalName": "string",
    "status": "PENDING|ACTIVE|INACTIVE",
    "timezone": "string",
    "currency": "string",
    "settingsJson": { "...": "..." },
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `TENANT_NOT_FOUND`.

---

## PATCH `/v1/tenants/:tenantId`

Update tenant profile and settings.

- **Auth**: required
- **Allowed roles**: `AM` (all fields, any tenant); `OP` (own tenant, only `name` and `settings` — `implementation decision`, see FR-007b); `CL_ADMIN` (own tenant, only `name` and `settings`)
- **Audit**: yes (`tenant.updated`)

**Request body** (`updateTenantSchema`, all fields optional)

| Field | Type | Notes |
|---|---|---|
| `name` | string (1..200) | |
| `legalName` | string (1..200) | AM only; globally unique. |
| `timezone` | string (1..60) | AM only. |
| `currency` | string (exactly 3) | AM only. |
| `settings` | partial `tenantSettingsSchema` | Deep-merged with existing `settings_json` (`implementation decision` — dossiê does not define merge semantics). |

**CL_ADMIN behavior**: fields other than `name` and `settings` are silently stripped at the use-case layer (no error) — clients must not assume the server will reject non-permitted fields.

**Response 200**: same shape as `GET /v1/tenants/:tenantId`.

**Error codes**: `AUTH_FORBIDDEN`, `TENANT_NOT_FOUND`, `TENANT_LEGAL_NAME_CONFLICT`, `VALIDATION_ERROR`.

---

## POST `/v1/tenants/:tenantId/deactivate`

Deactivate a tenant. Blocked if any of its appointments are open (status `DRAFT`, `AWAITING_INSPECTOR`, or `SCHEDULED`).

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP` (own tenant only)
- **Audit**: yes (`tenant.deactivated`, carries `reason`)

**Path params**

| Name | Type | Notes |
|---|---|---|
| `tenantId` | uuid | |

**Request body** (`deactivateSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `reason` | string (1..500, trimmed) | yes | Persisted on the audit record. |

**Response 200**

```json
{
  "data": {
    "id": "<uuid>",
    "name": "string",
    "status": "INACTIVE",
    "deactivatedAt": "ISO-8601"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `TENANT_NOT_FOUND`, `TENANT_ALREADY_INACTIVE`, `TENANT_HAS_OPEN_APPOINTMENTS`, `VALIDATION_ERROR`.
