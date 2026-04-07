# Branch Endpoints

**Feature**: `002-tenants-branches`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/tenant/interfaces/tenant.routes.ts`, `packages/shared/src/schemas/tenant.ts`

All endpoints require authentication. RBAC is enforced at the use-case layer. The auth middleware rejects client-role JWTs for `INACTIVE` tenants before these handlers are reached.

---

## POST `/v1/tenants/:tenantId/branches`

Create a new branch under an active tenant.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP` (own tenant only); `CL_ADMIN` (own tenant only)
- **Audit**: yes (`branch.created`)
- **Precondition**: parent tenant must be `ACTIVE`.

**Path params**

| Name | Type | Notes |
|---|---|---|
| `tenantId` | uuid | |

**Request body** (`createBranchSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string (1..200, trimmed) | yes | Unique within the tenant. |
| `address` | object | no | Freeform address shape; stored as `address_json`. |
| `contactEmail` | email (max 254) | no | |

**Response 201**

```json
{
  "data": {
    "id": "<uuid>",
    "tenantId": "<uuid>",
    "name": "string",
    "addressJson": { "...": "..." } ,
    "contactEmail": "string|null",
    "status": "ACTIVE",
    "createdAt": "ISO-8601"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `TENANT_NOT_FOUND`, `TENANT_INACTIVE`, `BRANCH_NAME_CONFLICT`, `VALIDATION_ERROR`.

---

## GET `/v1/tenants/:tenantId/branches`

List branches under a specific tenant. Tenant-scoped path variant.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP` (own tenant only); `CL_ADMIN`, `CL_USER` (own tenant only)

**Path params**

| Name | Type | Notes |
|---|---|---|
| `tenantId` | uuid | |

**Query params** (`listBranchesQuerySchema`)

| Name | Type | Default | Notes |
|---|---|---|---|
| `page` | int ≥ 1 | 1 | |
| `pageSize` | int 1..100 | 20 | |
| `status` | `ACTIVE|INACTIVE` | — | Optional filter. |
| `search` | string (max 200) | — | Matches `name` substring. |
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
      "addressJson": { "...": "..." },
      "contactEmail": "string|null",
      "status": "ACTIVE|INACTIVE",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 12
}
```

**Error codes**: `AUTH_FORBIDDEN`, `VALIDATION_ERROR`.

---

## GET `/v1/branches`

Flat variant used by the web portal. Derives tenant scope from JWT for client roles; AM/OP provide `tenantId` as a query param.

- **Auth**: required
- **Allowed roles**: all authenticated roles (AM must pass `tenantId`; OP and client roles derive tenant from JWT)

**Query params**: `listBranchesQuerySchema` plus:

| Name | Type | Notes |
|---|---|---|
| `tenantId` | uuid | Optional. For AM, used to select the tenant. For OP and client roles, ignored — tenant comes from JWT. |

**Behavior**:

- AM **with** `tenantId`: returns that tenant's branches.
- AM **without** `tenantId`: returns an empty page (`total = 0`, `data = []`). No error.
- OP / CL_ADMIN / CL_USER: returns branches of their own tenant, regardless of any `tenantId` passed.

**Response 200**: same shape as the tenant-scoped variant.

**Error codes**: `AUTH_FORBIDDEN`, `VALIDATION_ERROR`.

---

## PATCH `/v1/tenants/:tenantId/branches/:branchId`

Update a branch.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP` (own tenant only); `CL_ADMIN` (own tenant only)
- **Audit**: yes (`branch.updated`)

**Path params**

| Name | Type | Notes |
|---|---|---|
| `tenantId` | uuid | |
| `branchId` | uuid | |

**Request body** (`updateBranchSchema`, all fields optional)

| Field | Type | Notes |
|---|---|---|
| `name` | string (1..200) | Unique within tenant. |
| `address` | object | Replaces `address_json`. |
| `contactEmail` | email \| null | `null` clears the current value. |

> `status` is not mutable via PATCH — use the deactivate endpoint. Any `status` field sent is silently ignored.

**Response 200**: same shape as a branch list item, with `updatedAt` refreshed.

**Error codes**: `AUTH_FORBIDDEN`, `TENANT_NOT_FOUND`, `BRANCH_NOT_FOUND`, `BRANCH_NAME_CONFLICT`, `VALIDATION_ERROR`.

---

## POST `/v1/tenants/:tenantId/branches/:branchId/deactivate`

Deactivate a branch. Blocked if the branch has open appointments.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP` (own tenant only)
- **Audit**: yes (`branch.deactivated`, carries `reason`)

**Path params**

| Name | Type | Notes |
|---|---|---|
| `tenantId` | uuid | |
| `branchId` | uuid | |

**Request body** (`deactivateSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `reason` | string (1..500, trimmed) | yes | Persisted on the audit record. |

**Response 200**

```json
{
  "data": {
    "id": "<uuid>",
    "tenantId": "<uuid>",
    "name": "string",
    "status": "INACTIVE",
    "deactivatedAt": "ISO-8601"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `TENANT_NOT_FOUND`, `BRANCH_NOT_FOUND`, `BRANCH_ALREADY_INACTIVE`, `BRANCH_HAS_OPEN_APPOINTMENTS`, `VALIDATION_ERROR`.
