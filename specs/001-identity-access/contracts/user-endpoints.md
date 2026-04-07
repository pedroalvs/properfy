# User Endpoints

**Feature**: `001-identity-access`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/user/interfaces/user.routes.ts`, `packages/shared/src/schemas/user.ts`

All endpoints require authentication via the standard `authMiddleware`. RBAC checks are enforced at the use-case layer, not the route.

---

## POST `/v1/tenants/:tenantId/users`

Create a user scoped to a tenant.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant), `OP` (own tenant only), `CL_ADMIN` (own tenant only, client roles only, **conditional on tenant enabling user management** — APPROVED RULE per dossiê, depends on `001#GAP-003` + `002#GAP-002`)
- **Audit**: yes

**Path params**

| Name | Type | Notes |
|---|---|---|
| `tenantId` | uuid | |

**Request body** (`createUserSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string (max 200) | yes | |
| `email` | string (email) | yes | Stored lowercase; globally unique. |
| `password` | string | yes | Policy applies. |
| `role` | `UserRole` | yes | CL_ADMIN may only set `CL_ADMIN` or `CL_USER`. Never `AM`, `OP`, or `INSP` via this endpoint. |
| `branchId` | uuid | no | Must belong to the path tenant. |
| `phone` | string | no | |

**Response 201**

```json
{
  "id": "<uuid>",
  "tenantId": "<uuid>",
  "role": "CL_ADMIN|CL_USER",
  "name": "string",
  "email": "string",
  "status": "ACTIVE",
  "createdAt": "ISO-8601"
}
```

**Error codes**: `Forbidden`, `TenantNotFound`, `BranchNotFound`, `UserEmailConflict`, `PasswordTooWeak`, `PasswordTooCommon`, `ValidationError`.

---

## POST `/v1/users`

Create an internal (platform-wide) user — AM only. `tenant_id` is null on the created row. OP cannot use this endpoint because OP is tenant-scoped and cannot create users with `tenant_id = null`.

- **Auth**: required
- **Allowed roles**: `AM`
- **Audit**: yes

**Request body** (`createUserSchema`, role constrained to `AM` or `OP`)

Same fields as above; `branchId` is ignored. `role` must be `AM` or `OP`.

**Response 201**: same shape as the tenant variant, with `tenantId: null`.

**Error codes**: `Forbidden`, `UserEmailConflict`, `PasswordTooWeak`, `PasswordTooCommon`, `ValidationError`.

---

## GET `/v1/tenants/:tenantId/users`

List users within a tenant scope, paginated and filtered.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant), `OP` (own tenant only), `CL_ADMIN` (own tenant only)

**Query params** (`listUsersQuerySchema`)

| Name | Type | Default | Notes |
|---|---|---|---|
| `page` | int ≥ 1 | 1 | |
| `pageSize` | int 1..100 | 20 | |
| `status` | `UserStatus` | — | Optional filter. |
| `role` | `UserRole` | — | Optional filter. |
| `search` | string | — | Matches name or email substring. |
| `sortBy` | string | `createdAt` | Sorting is client-side by default per project convention; server supports it optionally. |
| `sortOrder` | `asc|desc` | `desc` | |

**Response 200**

```json
{
  "items": [ { /* user summary */ } ],
  "page": 1,
  "pageSize": 20,
  "total": 42
}
```

**Error codes**: `Forbidden`, `TenantNotFound`, `ValidationError`.

---

## GET `/v1/tenants/:tenantId/users/:userId`

Read a single user.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant), `OP` (own tenant only), `CL_ADMIN` (own tenant only)

**Response 200**: user detail (same shape as create response, plus `branchId`, `phone`, `lastLoginAt`, `totpEnabled`).

**Error codes**: `Forbidden`, `UserNotFound`.

---

## PUT `/v1/tenants/:tenantId/users/:userId`

Update a user's mutable fields.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant), `OP` (own tenant only), `CL_ADMIN` (own tenant only)
- **Audit**: yes

**Request body** (`updateUserSchema`, all fields optional)

| Field | Type | Notes |
|---|---|---|
| `name` | string | |
| `phone` | string \| null | |
| `branchId` | uuid \| null | Must belong to the tenant. |
| `role` | `UserRole` | Restricted by actor role. CL_ADMIN cannot promote to non-client roles. |

**Response 200**: updated user detail.

**Error codes**: `Forbidden`, `UserNotFound`, `BranchNotFound`, `ValidationError`.

---

## POST `/v1/tenants/:tenantId/users/:userId/deactivate`

Deactivate a user. Sets `status = INACTIVE` and revokes all of the user's sessions.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant), `OP` (own tenant only)
- **Audit**: yes

**Request body**: none.

**Response 204** — no body.

**Error codes**: `Forbidden`, `UserNotFound`, `UserAlreadyInactive`.

---

## POST `/v1/tenants/:tenantId/users/:userId/reset-password`

Admin resets another user's password. Policy applies. All of the target user's sessions are revoked on success.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant), `OP` (own tenant only)
- **Audit**: yes

**Request body** (`resetUserPasswordSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `newPassword` | string | yes | Policy applies. |

**Response 204** — no body.

**Error codes**: `Forbidden`, `UserNotFound`, `PasswordTooWeak`, `PasswordTooCommon`, `PasswordSameAsCurrent`.
