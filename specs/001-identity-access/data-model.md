# Data Model: Identity & Access

**Feature**: `001-identity-access`
**Status**: IMPLEMENTED
**Source**: `apps/backend/prisma/schema.prisma` (User, Session, UserRole, UserStatus)

All timestamps are `timestamptz`. All IDs are UUID v4. Column names follow `snake_case`; the Prisma client exposes them as `camelCase` to application code.

## Enums

### `UserRole`

```
AM | OP | CL_ADMIN | CL_USER | INSP
```

- `AM` — Admin Master (platform-wide).
- `OP` — Operator (platform-wide, operational team).
- `CL_ADMIN` — Client Admin (tenant/agency admin).
- `CL_USER` — Client User (tenant/agency user; permissions will be configurable, see GAP-003).
- `INSP` — Inspector. Created through the Inspector module; the User row with role `INSP` is the authentication principal for inspectors.

Additionally, the shared package exposes two runtime-only values that are **not** stored as users in the database:

- `TNT` — tenant portal principal (inquilino) authenticated via unique-link tokens, not JWT users. Owned by feature 007-tenant-portal.
- `SYS` — system actor used for automated transitions and audit attribution.

### `UserStatus`

```
ACTIVE | INACTIVE | LOCKED
```

- `ACTIVE` — Default on creation. Can authenticate.
- `INACTIVE` — Deactivated by an admin; cannot authenticate; sessions revoked on transition.
- `LOCKED` — Temporarily locked due to consecutive failed logins. `locked_until` holds the release timestamp; auto-transitions back to `ACTIVE` on successful login after the lock expires.

## Entities

### `users`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `tenant_id` | uuid | yes | — | FK → `tenants.id`. Null for AM and OP (both cross-tenant per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003). Superseded phrasing: "Null for AM only. OP has mandatory `tenant_id`". |
| `branch_id` | uuid | yes | — | FK → `branches.id`. Optional even for tenant users. |
| `role` | `UserRole` | no | — | |
| `name` | varchar(200) | no | — | Display name. |
| `email` | varchar(254) | no | — | **Globally unique**. Stored lowercase; application normalizes before insert. |
| `phone` | varchar(20) | yes | — | E.164 recommended but not enforced at DB level. |
| `status` | `UserStatus` | no | `ACTIVE` | |
| `password_hash` | text | no | — | bcrypt cost 12. Never serialized. |
| `totp_secret` | text | yes | — | Encrypted at rest by `TotpEncryptionService`. Null until first setup. |
| `totp_enabled` | boolean | no | `false` | |
| `failed_login_count` | int | no | `0` | Reset on successful login. |
| `locked_until` | timestamptz | yes | — | When set in the future, account is `LOCKED`. |
| `last_login_at` | timestamptz | yes | — | |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | — | Soft delete. |

**Indexes**

- `UNIQUE (email)` — global. See GAP-008 for the soft-delete reuse policy.
- `(tenant_id)`
- `(tenant_id, role)`
- `(tenant_id, status)`
- `(branch_id)`
- `(deleted_at)`

**Invariants**

- `tenant_id IS NULL` ⇔ `role IN (AM, OP)` (both platform-wide roles per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003). Superseded phrasing: "`tenant_id IS NULL` ⇔ `role = AM`. OP must have a non-null `tenant_id`".
- `totp_enabled = true` ⇒ `totp_secret IS NOT NULL`.
- `status = LOCKED` ⇒ `locked_until > now()` at the moment the lock is applied.
- `deleted_at IS NOT NULL` ⇒ user cannot authenticate, cannot be listed, cannot be updated.
- Email is stored lowercase — insertion path must normalize before write.
- `password_hash` is required; no user is created without a password hash (admin invite flow in GAP-007 would relax this by introducing an invite token instead).

### `sessions`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `user_id` | uuid | no | — | FK → `users.id`. |
| `refresh_token_hash` | text | no | — | SHA-256 of the raw refresh token. The raw token is never persisted. |
| `ip_address` | varchar(45) | yes | — | IPv4 or IPv6 of the client at session creation. |
| `user_agent` | varchar(500) | yes | — | Client UA at session creation. |
| `expires_at` | timestamptz | no | `created_at + 10d` | |
| `revoked_at` | timestamptz | yes | — | Set on explicit logout, admin revoke, user deactivation, or password reset. |
| `created_at` | timestamptz | no | `now()` | |

**Indexes**

- `(user_id)`
- `(refresh_token_hash)` — used on refresh lookup; should be covering.
- `(expires_at)` — used by cleanup worker.
- `(user_id, revoked_at)`

**Invariants**

- A session is **valid** iff `revoked_at IS NULL AND expires_at > now()`.
- Refresh token rotation: on successful refresh, the current session is marked `revoked_at = now()` and a new session row is created. The old refresh token becomes permanently unusable.
- Deactivating a user MUST set `revoked_at` on all their non-revoked sessions.
- Admin password reset MUST set `revoked_at` on all the target user's non-revoked sessions.
- The cleanup worker may delete rows where `expires_at < now() - <retention>` (retention defined in the worker).

## Runtime-only Types (not persisted)

These live in `packages/shared/src/types/auth.ts` and travel over JWT claims or in-process request state.

### `JwtPayload`

Encoded into the JWT access token body; signed with RS256 using a key identified by `kid` in the header.

| Field | Type | Notes |
|---|---|---|
| `sub` | string (uuid) | User id. |
| `tenant_id` | string (uuid) \| null | Null for AM and OP (both cross-tenant per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003). Superseded phrasing: "Null for AM only. OP always has a `tenant_id`". |
| `role` | `UserRole` | |
| `branch_id` | string (uuid) \| null | |
| `inspector_id` | string (uuid) \| null | Populated for INSP role; null otherwise. |
| `kid` | string | JWT key id (in header; mirrored into payload for convenience). |
| `iat` | number | Unix seconds. |
| `exp` | number | `iat + 15 minutes`. |

### `AuthContext`

Request-scoped value produced by the auth middleware and attached to the Fastify request. Every protected handler reads from this and must not re-decode the JWT.

| Field | Type | Notes |
|---|---|---|
| `userId` | string (uuid) | |
| `tenantId` | string (uuid) \| null | |
| `role` | `UserRole` | |
| `branchId` | string (uuid) \| null | |
| `inspectorId` | string (uuid) \| null | |

## Relationships

```
tenants (feature 002) ─┐
                       ├── users (0..*)
branches (feature 002) ┘      │
                              │
                              └── sessions (0..*)
```

- `users.tenant_id → tenants.id` — nullable. Deleting a tenant requires resolving user rows first (cascade policy tracked in feature 002).
- `users.branch_id → branches.id` — nullable. Deleting a branch nullifies `users.branch_id` (tracked in feature 002).
- `sessions.user_id → users.id` — deleting a user must first revoke and then delete their sessions.

## Audit Linkage

Identity operations write records to the shared `audit_logs` table (owned by feature 011-reports-audit). The identity module does not store audit rows; it only produces them via `AuditService`.

## Migration History

Phase 1 schema for this feature is already applied in `apps/backend/prisma/migrations/`. Any change to the entities above must go through an expand/contract Prisma migration generated alongside the code change (see constitution Principle III and the CLAUDE.md migrations rule).
