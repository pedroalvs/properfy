# Auth Module – Implementation Spec

> **SUPERSEDED** by `specs/001-identity-access/` — this legacy spec is preserved for historical reference only.

**Version:** 1.0
**Module path:** `apps/backend/src/modules/auth`
**Last updated:** 2026-03-15

---

## 1. Overview

### Purpose

The Auth module handles all authentication and session management for internal users (AM, OP, CL_ADMIN, CL_USER, INSP). It issues JWT access tokens (RS256, 15 min TTL) and manages rotating refresh tokens (10 day TTL) with server-side session tracking. TNT (tenant/inquilino) users authenticate via portal tokens handled in the TenantPortal module — not here.

### Actors

| Actor | Interaction |
|---|---|
| AM | Login, logout, refresh, changePassword, getMe, revokeSession, 2FA required |
| OP | Login, logout, refresh, changePassword, getMe, revokeSession |
| CL_ADMIN | Login, logout, refresh, changePassword, getMe |
| CL_USER | Login, logout, refresh, changePassword, getMe |
| INSP | Login, logout, refresh, changePassword, getMe |

### Domain Boundaries

- Owns: `User`, `Session` entities
- Produces: JWT access token, refresh token, session record
- Does NOT own: tenant creation/management (Tenant module), inspector onboarding, property management
- Depends on: no other domain module (Auth is a foundation module)

### Dependencies

- `packages/shared`: `UserRole`, `UserStatus` enums, shared error codes
- External: RS256 key pair (loaded from environment), bcrypt for password hashing, otplib for TOTP (2FA)

---

## 2. Data Model

### 2.1 Enums

#### `UserRole`

```prisma
enum UserRole {
  AM        // Admin Master - platform-wide, all tenants
  OP        // Operator - cross-tenant operational team
  CL_ADMIN  // Client Admin - own tenant only
  CL_USER   // Client User - own tenant, configurable permissions
  INSP      // Inspector - own schedule and assignments
}
```

#### `UserStatus`

```prisma
enum UserStatus {
  ACTIVE    // Can log in and operate
  INACTIVE  // Disabled by admin; cannot log in
  LOCKED    // Temporarily locked after repeated failed login attempts
}
```

### 2.2 Entity: `User`

**Table:** `users`

| Field | Prisma Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| id | String | No | `uuid()` | PK |
| tenant_id | String | Yes | — | FK → tenants.id; null for AM/OP |
| branch_id | String | Yes | — | FK → branches.id; null unless scoped |
| role | UserRole | No | — | enum |
| name | String | No | — | max 200 chars |
| email | String | No | — | unique, lowercase, max 254 chars |
| phone | String | Yes | — | E.164 format |
| status | UserStatus | No | `ACTIVE` | enum |
| password_hash | String | No | — | bcrypt hash, never returned in API |
| totp_secret | String | Yes | — | encrypted TOTP secret for AM 2FA |
| totp_enabled | Boolean | No | `false` | true once 2FA setup complete |
| failed_login_count | Int | No | `0` | reset on successful login |
| locked_until | DateTime | Yes | — | null unless locked |
| last_login_at | DateTime | Yes | — | updated on successful login |
| created_at | DateTime | No | `now()` | |
| updated_at | DateTime | No | `now()` | auto-updated |
| deleted_at | DateTime | Yes | — | soft delete |

**Indexes:**

```prisma
@@unique([email])
@@index([tenant_id])
@@index([tenant_id, role])
@@index([tenant_id, status])
@@index([branch_id])
@@index([deleted_at])
```

### 2.3 Entity: `Session`

**Table:** `sessions`

| Field | Prisma Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| id | String | No | `uuid()` | PK |
| user_id | String | No | — | FK → users.id |
| refresh_token_hash | String | No | — | SHA-256 of the raw refresh token |
| ip_address | String | Yes | — | IPv4/IPv6 of client |
| user_agent | String | Yes | — | truncated to 500 chars |
| expires_at | DateTime | No | — | now + 10 days |
| revoked_at | DateTime | Yes | — | null unless revoked |
| created_at | DateTime | No | `now()` | |

**Indexes:**

```prisma
@@index([user_id])
@@index([refresh_token_hash])
@@index([expires_at])
@@index([user_id, revoked_at])
```

### 2.4 Complete Prisma Schema (auth module entities)

```prisma
enum UserRole {
  AM
  OP
  CL_ADMIN
  CL_USER
  INSP
}

enum UserStatus {
  ACTIVE
  INACTIVE
  LOCKED
}

model User {
  id                  String      @id @default(uuid())
  tenant_id           String?
  branch_id           String?
  role                UserRole
  name                String      @db.VarChar(200)
  email               String      @unique @db.VarChar(254)
  phone               String?     @db.VarChar(20)
  status              UserStatus  @default(ACTIVE)
  password_hash       String
  totp_secret         String?
  totp_enabled        Boolean     @default(false)
  failed_login_count  Int         @default(0)
  locked_until        DateTime?
  last_login_at       DateTime?
  created_at          DateTime    @default(now())
  updated_at          DateTime    @updatedAt
  deleted_at          DateTime?

  tenant              Tenant?     @relation(fields: [tenant_id], references: [id])
  branch              Branch?     @relation(fields: [branch_id], references: [id])
  sessions            Session[]

  @@index([tenant_id])
  @@index([tenant_id, role])
  @@index([tenant_id, status])
  @@index([branch_id])
  @@index([deleted_at])
  @@map("users")
}

model Session {
  id                  String    @id @default(uuid())
  user_id             String
  refresh_token_hash  String
  ip_address          String?   @db.VarChar(45)
  user_agent          String?   @db.VarChar(500)
  expires_at          DateTime
  revoked_at          DateTime?
  created_at          DateTime  @default(now())

  user                User      @relation(fields: [user_id], references: [id])

  @@index([user_id])
  @@index([refresh_token_hash])
  @@index([expires_at])
  @@index([user_id, revoked_at])
  @@map("sessions")
}
```

---

## 3. Use Cases

### 3.1 Login (`login`)

**Actor:** Any unauthenticated user (AM, OP, CL_ADMIN, CL_USER, INSP)

**Preconditions:**
- User exists in database with matching email
- User status is `ACTIVE` (not `INACTIVE` or `LOCKED`)
- Account is not locked (`locked_until` is null or in the past)

**Input DTO:**

```typescript
// Zod schema
const LoginInputSchema = z.object({
  email: z.string().email().max(254).transform(v => v.toLowerCase().trim()),
  password: z.string().min(1).max(128),
  totpCode: z.string().length(6).optional(), // required for AM role
});
type LoginInput = z.infer<typeof LoginInputSchema>;
```

**Step-by-step process:**

1. Validate and normalize input (lowercase email, trim).
2. Look up user by email where `deleted_at IS NULL`.
3. If user not found: increment no-op counter (do not reveal existence); return `AUTH_INVALID_CREDENTIALS` error.
4. Check rate limit: 5 failed attempts in 15 min per email → lock account for 15 min.
5. If `status = INACTIVE`: return `AUTH_USER_INACTIVE`.
6. If `status = LOCKED` and `locked_until > now()`: return `AUTH_ACCOUNT_LOCKED` with `retryAfter` timestamp.
7. If `status = LOCKED` and `locked_until <= now()`: reset `status = ACTIVE`, `failed_login_count = 0`, `locked_until = null`.
8. Compare password with `bcrypt.compare(password, user.password_hash)`.
9. If password mismatch:
   a. Increment `failed_login_count`.
   b. If `failed_login_count >= 5`: set `status = LOCKED`, `locked_until = now() + 15min`, `failed_login_count = 0`.
   c. Return `AUTH_INVALID_CREDENTIALS`.
10. If `role = AM` and `totp_enabled = true` and no `totpCode` provided: return `AUTH_TOTP_REQUIRED`.
11. If `role = AM` and `totp_enabled = true` and `totpCode` provided: verify TOTP; if invalid return `AUTH_TOTP_INVALID`.
12. If `role = AM` and `totp_enabled = false`: return `AUTH_TOTP_SETUP_REQUIRED` (first login forces 2FA setup).
13. Reset `failed_login_count = 0`, update `last_login_at = now()`.
14. Generate raw refresh token (crypto.randomBytes(48).toString('hex')).
15. Hash refresh token with SHA-256.
16. Create `Session` record: `{ user_id, refresh_token_hash, ip_address, user_agent, expires_at: now() + 10 days }`.
17. Sign JWT access token (RS256) with claims: `{ sub: user.id, tenant_id: user.tenant_id, role: user.role, branch_id: user.branch_id, kid: currentKeyId, iat, exp: now() + 15min }`.
18. Emit audit log event: `auth.login.success`.
19. Return access token, raw refresh token, and user profile.

**Output DTO:**

```typescript
{
  accessToken: string;   // signed JWT
  refreshToken: string;  // raw token (client stores securely)
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    tenantId: string | null;
    branchId: string | null;
    totpEnabled: boolean;
  };
}
```

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | Invalid email or password | Email not found or password mismatch |
| `AUTH_USER_INACTIVE` | User account is inactive | status = INACTIVE |
| `AUTH_ACCOUNT_LOCKED` | Account temporarily locked | status = LOCKED and locked_until > now() |
| `AUTH_TOTP_REQUIRED` | Two-factor authentication code required | AM with totp_enabled=true and no totpCode |
| `AUTH_TOTP_INVALID` | Invalid two-factor authentication code | TOTP code provided but invalid |
| `AUTH_TOTP_SETUP_REQUIRED` | Two-factor authentication setup required | AM with totp_enabled=false |
| `VALIDATION_ERROR` | Request payload is invalid | Zod validation failure |

**Side Effects:**
- Audit log: `{ action: "auth.login", actor_type: "USER", actor_id: user.id, entity_type: "USER", entity_id: user.id }`
- On failure: Audit log: `{ action: "auth.login_failed", actor_type: "ANONYMOUS", entity_type: "USER" }`
- On lock: Audit log: `{ action: "auth.account_locked", ... }`

---

### 3.2 Refresh Token (`refreshToken`)

**Actor:** Any authenticated user (via valid refresh token)

**Preconditions:**
- Refresh token is provided
- Matching session exists, is not revoked, and has not expired

**Input DTO:**

```typescript
const RefreshInputSchema = z.object({
  refreshToken: z.string().min(1),
});
```

**Step-by-step process:**

1. Validate input.
2. Hash the incoming refresh token with SHA-256.
3. Find session by `refresh_token_hash` where `revoked_at IS NULL` and `expires_at > now()`.
4. If not found: return `AUTH_INVALID_REFRESH_TOKEN`.
5. Load user by `session.user_id` where `deleted_at IS NULL`.
6. If user not found, `INACTIVE`, or `LOCKED`: revoke session; return `AUTH_SESSION_INVALID`.
7. Rotate refresh token: generate new raw token, hash it.
8. Update session: `refresh_token_hash = newHash`, `expires_at = now() + 10 days`.
9. Sign new JWT access token with same claims pattern.
10. Emit audit log: `auth.refresh`.
11. Return new access token and new raw refresh token.

**Output DTO:**

```typescript
{
  accessToken: string;
  refreshToken: string;
}
```

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_INVALID_REFRESH_TOKEN` | Refresh token is invalid or expired | Session not found, revoked, or expired |
| `AUTH_SESSION_INVALID` | Session is no longer valid | User inactive, locked, or deleted |
| `VALIDATION_ERROR` | Request payload is invalid | Zod validation failure |

**Side Effects:**
- Audit log: `auth.refresh`

---

### 3.3 Logout (`logout`)

**Actor:** Any authenticated user

**Preconditions:**
- Valid access token in `Authorization` header
- Active session exists for the token

**Input DTO:** None (session identified by access token claims)

**Step-by-step process:**

1. Authenticate request (verify JWT, extract `sub`).
2. Find all active sessions for the user OR just the current session (based on `sessionId` claim if present, otherwise all active sessions for the user — implementation detail: revoke current session only, identified by matching refresh token hash if provided, otherwise by session created with current access token).
3. Set `revoked_at = now()` on the session.
4. Emit audit log: `auth.logout`.
5. Return 204 No Content.

**Output:** 204 No Content

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_UNAUTHORIZED` | Authentication required | No valid JWT provided |

**Side Effects:**
- Audit log: `auth.logout`

---

### 3.4 Get Current User (`getMe`)

**Actor:** Any authenticated user

**Preconditions:**
- Valid access token in `Authorization` header

**Input DTO:** None

**Step-by-step process:**

1. Authenticate request (verify JWT).
2. Load user by `sub` claim where `deleted_at IS NULL`.
3. If user not found or `INACTIVE`: return `AUTH_UNAUTHORIZED`.
4. Return user profile (never return `password_hash`, `totp_secret`).

**Output DTO:**

```typescript
{
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  tenantId: string | null;
  branchId: string | null;
  totpEnabled: boolean;
  lastLoginAt: string | null; // ISO 8601
  createdAt: string;          // ISO 8601
}
```

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_UNAUTHORIZED` | Authentication required | No valid JWT or user not found |

---

### 3.5 Change Password (`changePassword`)

**Actor:** Any authenticated user (changing their own password)

**Preconditions:**
- Valid access token
- Current password must match

**Input DTO:**

```typescript
const ChangePasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
});
```

**Password Policy:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character
- Not in common password blacklist (top 1000 common passwords)
- New password must differ from current password

**Step-by-step process:**

1. Authenticate request.
2. Validate input with Zod schema.
3. Load user including `password_hash`.
4. Verify `currentPassword` against `password_hash`; if mismatch: return `AUTH_INVALID_CURRENT_PASSWORD`.
5. Check new password against blacklist; if found: return `AUTH_PASSWORD_TOO_COMMON`.
6. Check new password != current password; if same: return `AUTH_PASSWORD_SAME_AS_CURRENT`.
7. Hash new password with bcrypt (cost factor 12).
8. Update `user.password_hash`.
9. Revoke ALL existing sessions for the user (set `revoked_at = now()`).
10. Emit audit log: `auth.password_changed`.
11. Return 204 No Content.

**Output:** 204 No Content

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_UNAUTHORIZED` | Authentication required | No valid JWT |
| `AUTH_INVALID_CURRENT_PASSWORD` | Current password is incorrect | bcrypt mismatch |
| `AUTH_PASSWORD_TOO_COMMON` | Password is too common | Found in blacklist |
| `AUTH_PASSWORD_SAME_AS_CURRENT` | New password must differ from current | Same hash |
| `VALIDATION_ERROR` | Request payload is invalid | Zod schema failure |

**Side Effects:**
- All active sessions revoked
- Audit log: `auth.password_changed`

---

### 3.6 Revoke Session (`revokeSession`)

**Actor:** AM (any session of any user), or the session owner (own sessions only)

**Preconditions:**
- Authenticated request
- Session exists
- Actor is AM or session belongs to actor

**Input DTO:**

```typescript
// Path param
sessionId: z.string().uuid()
```

**Step-by-step process:**

1. Authenticate request.
2. Load session by `sessionId`.
3. If not found: return `SESSION_NOT_FOUND`.
4. If actor is not AM and `session.user_id != actor.id`: return `AUTH_FORBIDDEN`.
5. Set `session.revoked_at = now()`.
6. Emit audit log: `auth.session_revoked`.
7. Return 204 No Content.

**Output:** 204 No Content

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_UNAUTHORIZED` | Authentication required | No valid JWT |
| `AUTH_FORBIDDEN` | Insufficient permissions | Non-AM trying to revoke another user's session |
| `SESSION_NOT_FOUND` | Session not found | sessionId does not exist |

**Side Effects:**
- Audit log: `auth.session_revoked`

---

## 4. API Contracts

### 4.1 `POST /v1/auth/login`

**Auth:** None (public)
**Rate limit:** 30 req/min per IP; 5 failed attempts/15 min per email → 15 min account lock

**Request body:**

```json
{
  "email": "user@agency.com",
  "password": "P@ssw0rd!",
  "totpCode": "123456"
}
```

| Field | Type | Required | Rule |
|---|---|---|---|
| email | string | Yes | Valid email, max 254 chars, lowercased |
| password | string | Yes | min 1, max 128 |
| totpCode | string | No | 6-digit string; required for AM when totp_enabled=true |

**Success response (200):**

```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6InYxIn0...",
  "refreshToken": "a1b2c3d4e5f6...",
  "user": {
    "id": "uuid",
    "name": "John Smith",
    "email": "user@agency.com",
    "role": "CL_ADMIN",
    "tenantId": "uuid",
    "branchId": null,
    "totpEnabled": false
  }
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 401 | `AUTH_INVALID_CREDENTIALS` | Email not found or wrong password |
| 403 | `AUTH_USER_INACTIVE` | Account deactivated |
| 429 | `AUTH_ACCOUNT_LOCKED` | Too many failures; body includes `retryAfter` ISO timestamp |
| 403 | `AUTH_TOTP_REQUIRED` | AM with 2FA enabled but no code provided |
| 401 | `AUTH_TOTP_INVALID` | Invalid TOTP code |
| 403 | `AUTH_TOTP_SETUP_REQUIRED` | AM must set up 2FA before first use |
| 422 | `VALIDATION_ERROR` | Invalid payload |
| 429 | `RATE_LIMIT_EXCEEDED` | IP rate limit exceeded |

---

### 4.2 `POST /v1/auth/refresh`

**Auth:** None (uses refresh token in body)
**Rate limit:** 20 req/min per IP; 10 req/5 min per refresh token

**Request body:**

```json
{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

| Field | Type | Required | Rule |
|---|---|---|---|
| refreshToken | string | Yes | Non-empty string |

**Success response (200):**

```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6InYxIn0...",
  "refreshToken": "b2c3d4e5f6a1..."
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 401 | `AUTH_INVALID_REFRESH_TOKEN` | Token not found, revoked, or expired |
| 403 | `AUTH_SESSION_INVALID` | User is inactive, locked, or deleted |
| 422 | `VALIDATION_ERROR` | Invalid payload |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit exceeded |

---

### 4.3 `POST /v1/auth/logout`

**Auth:** Bearer token (JWT)
**Rate limit:** General (not specifically restricted)

**Request body:** None

**Success response:** 204 No Content

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 401 | `AUTH_UNAUTHORIZED` | No valid JWT |

---

### 4.4 `GET /v1/me`

**Auth:** Bearer token (JWT)
**Roles:** Any authenticated role

**Query params:** None

**Success response (200):**

```json
{
  "id": "uuid",
  "name": "John Smith",
  "email": "user@agency.com",
  "phone": "+61412345678",
  "role": "CL_ADMIN",
  "status": "ACTIVE",
  "tenantId": "uuid",
  "branchId": null,
  "totpEnabled": false,
  "lastLoginAt": "2026-03-15T09:00:00.000Z",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 401 | `AUTH_UNAUTHORIZED` | No valid JWT or user deleted/inactive |

---

### 4.5 `POST /v1/auth/change-password`

**Auth:** Bearer token (JWT)
**Roles:** Any authenticated role (own password only)

**Request body:**

```json
{
  "currentPassword": "OldP@ssw0rd!",
  "newPassword": "NewP@ssw0rd#2"
}
```

| Field | Type | Required | Rule |
|---|---|---|---|
| currentPassword | string | Yes | Non-empty |
| newPassword | string | Yes | min 8, max 128; uppercase + lowercase + number + special char |

**Success response:** 204 No Content

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 401 | `AUTH_UNAUTHORIZED` | No valid JWT |
| 400 | `AUTH_INVALID_CURRENT_PASSWORD` | Wrong current password |
| 400 | `AUTH_PASSWORD_TOO_COMMON` | Common password detected |
| 400 | `AUTH_PASSWORD_SAME_AS_CURRENT` | New password identical to current |
| 422 | `VALIDATION_ERROR` | Zod validation failure |

---

### 4.6 `DELETE /v1/auth/sessions/:sessionId`

**Auth:** Bearer token (JWT)
**Roles:** AM (any session), or own sessions only

**Path params:**

| Param | Type | Rule |
|---|---|---|
| sessionId | string | UUID |

**Success response:** 204 No Content

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 401 | `AUTH_UNAUTHORIZED` | No valid JWT |
| 403 | `AUTH_FORBIDDEN` | Non-AM trying to revoke another user's session |
| 404 | `SESSION_NOT_FOUND` | Session does not exist |

---

## 5. Business Rules

1. **Email uniqueness:** Email must be unique across the entire `users` table regardless of tenant.
2. **AM tenant_id:** AM users always have `tenant_id = null`. Any operation setting `tenant_id` on an AM user must be rejected.
3. **OP tenant_id:** OP users also have `tenant_id = null` (cross-tenant).
4. **Password hashing:** All passwords are stored as bcrypt hashes with cost factor 12. Raw passwords are never logged, stored, or returned.
5. **Access token TTL:** Always 15 minutes. Not configurable per user or tenant.
6. **Refresh token TTL:** 10 days. Rotation resets the clock.
7. **Refresh token rotation:** Each use of a refresh token issues a new token and invalidates the old one. Old token hash is overwritten in the session record.
8. **Session revocation:** Setting `revoked_at` on a session permanently disables it. Revoked sessions are never reactivated.
9. **Stale session cleanup:** Sessions with `expires_at < now()` are treated as invalid regardless of `revoked_at`. A background job should periodically purge sessions older than 30 days.
10. **Brute force protection:** After 5 consecutive failed logins for the same email within any 15-minute window, the account is locked for 15 minutes. `failed_login_count` is reset to 0 on any successful login.
11. **Account lock expiry:** When `locked_until <= now()`, the status is automatically reset to `ACTIVE` on the next login attempt. No manual intervention required.
12. **INACTIVE users:** `INACTIVE` users cannot log in. This status is set by an admin and requires explicit reactivation. The lock auto-expiry rule does NOT apply to `INACTIVE` — it must be manually changed.
13. **2FA for AM:** Admin Master users must have TOTP 2FA configured before any operation. A new AM user must complete 2FA setup (via a separate setup flow) before their account is fully active. The `totpCode` field is required on login for any AM user with `totp_enabled = true`.
14. **2FA setup flow:** When AM logs in with `totp_enabled = false`, the response returns `AUTH_TOTP_SETUP_REQUIRED`. The 2FA setup endpoint (outside auth module scope) generates a TOTP secret, stores it encrypted, sets `totp_enabled = true`, and issues a new session.
15. **TOTP secret storage:** TOTP secrets are encrypted at rest (application-level encryption with AES-256-GCM). The raw secret is never stored.
16. **JWT claims:** Access token must include: `sub` (user_id), `tenant_id` (null for AM/OP), `role`, `branch_id` (nullable), `kid` (key identifier), `iat`, `exp`.
17. **JWT verification:** On every authenticated request, the middleware verifies: signature (RS256), `exp`, and that the `kid` matches a known key. Key rotation is handled by maintaining a JWKS with multiple valid keys during rotation period.
18. **JWT key rotation:** Two keys are valid during rotation: the current key and the previous key (grace period of 24h). The `kid` in the token header identifies which key to use for verification.
19. **Password change invalidates sessions:** Changing a password revokes ALL sessions for the user immediately, forcing re-login on all devices.
20. **Soft delete:** `deleted_at` is set for deleted users. Soft-deleted users cannot log in. The email may NOT be reused unless explicitly released by an AM.
21. **No credential in responses:** `password_hash`, `totp_secret`, and `failed_login_count` are never included in any API response.
22. **Request_id:** Every response includes a `X-Request-Id` header with a UUID generated per request. This value is logged and included in audit records.
23. **Idempotency:** Login, refresh, and logout are not idempotent operations (each call creates/updates state). No `Idempotency-Key` is required for these endpoints.

---

## 6. Authorization Matrix

| Action | AM | OP | CL_ADMIN | CL_USER | INSP |
|---|---|---|---|---|---|
| login | Yes | Yes | Yes | Yes | Yes |
| refresh | Yes | Yes | Yes | Yes | Yes |
| logout | Yes | Yes | Yes | Yes | Yes |
| getMe | Yes | Yes | Yes | Yes | Yes |
| changePassword (own) | Yes | Yes | Yes | Yes | Yes |
| revokeSession (own) | Yes | Yes | Yes | Yes | Yes |
| revokeSession (any user) | Yes | No | No | No | No |

---

## 7. Domain Events

### `auth.login.v1`

Emitted on successful login.

```typescript
{
  eventType: "auth.login.v1",
  occurredAt: string, // ISO 8601
  payload: {
    userId: string,
    role: UserRole,
    tenantId: string | null,
    ipAddress: string | null,
    sessionId: string,
  }
}
```

**Consumers:** Audit log service

---

### `auth.login_failed.v1`

Emitted on failed login attempt.

```typescript
{
  eventType: "auth.login_failed.v1",
  occurredAt: string,
  payload: {
    email: string,
    ipAddress: string | null,
    reason: "INVALID_CREDENTIALS" | "ACCOUNT_INACTIVE" | "TOTP_INVALID",
    failedCount: number,
  }
}
```

**Consumers:** Audit log service, security monitoring

---

### `auth.account_locked.v1`

Emitted when account is locked due to brute force.

```typescript
{
  eventType: "auth.account_locked.v1",
  occurredAt: string,
  payload: {
    userId: string,
    email: string,
    lockedUntil: string, // ISO 8601
    ipAddress: string | null,
  }
}
```

**Consumers:** Audit log service, security alert system

---

### `auth.logout.v1`

```typescript
{
  eventType: "auth.logout.v1",
  occurredAt: string,
  payload: {
    userId: string,
    sessionId: string,
  }
}
```

**Consumers:** Audit log service

---

### `auth.refresh.v1`

```typescript
{
  eventType: "auth.refresh.v1",
  occurredAt: string,
  payload: {
    userId: string,
    sessionId: string,
    ipAddress: string | null,
  }
}
```

**Consumers:** Audit log service

---

### `auth.password_changed.v1`

```typescript
{
  eventType: "auth.password_changed.v1",
  occurredAt: string,
  payload: {
    userId: string,
    sessionCount: number, // how many sessions were revoked
  }
}
```

**Consumers:** Audit log service, notification service (optional: send security alert email)

---

### `auth.session_revoked.v1`

```typescript
{
  eventType: "auth.session_revoked.v1",
  occurredAt: string,
  payload: {
    sessionId: string,
    revokedByUserId: string,
    targetUserId: string,
    reason: "LOGOUT" | "PASSWORD_CHANGE" | "MANUAL_REVOKE",
  }
}
```

**Consumers:** Audit log service

---

## 8. Queue Jobs

### `auth.cleanup_expired_sessions`

**Schedule:** Daily cron at 02:00 UTC
**Purpose:** Delete sessions older than 30 days to prevent table bloat

**Payload:**

```typescript
{
  cutoffDate: string, // ISO 8601; sessions with expires_at < cutoffDate
}
```

**Process:**
1. Delete all sessions where `expires_at < cutoffDate` (bulk delete, batched).
2. Log count of deleted sessions.

**Retry policy:** Not applicable (cron job; if it fails, will retry next day)

---

## 9. External Integrations

### TOTP (otplib)

- Library: `otplib` (TOTP implementation)
- No external API call; computation is local
- Secret stored encrypted in database
- Window: ±1 step (30-second TOTP with 1 step tolerance)

### Bcrypt

- Library: `bcryptjs` or `@node-rs/bcrypt`
- Cost factor: 12
- No external calls

### JWT / RS256

- Library: `jose` (modern JWT library for Node.js)
- Keys loaded from environment at startup: `JWT_PRIVATE_KEY_PEM`, `JWT_PUBLIC_KEY_PEM`, `JWT_KEY_ID`
- During key rotation: `JWT_PREVIOUS_PUBLIC_KEY_PEM`, `JWT_PREVIOUS_KEY_ID` also loaded
- Verification: check signature + expiry + kid against loaded keys

---

## 10. Test Scenarios

### 10.1 Unit Tests (Use Cases)

#### LoginUseCase

- [ ] Should return tokens and user profile on valid credentials
- [ ] Should return `AUTH_INVALID_CREDENTIALS` when email not found
- [ ] Should return `AUTH_INVALID_CREDENTIALS` when password is wrong (not reveal which)
- [ ] Should increment `failed_login_count` on each failed attempt
- [ ] Should lock account after 5 failed attempts within 15 minutes
- [ ] Should return `AUTH_ACCOUNT_LOCKED` when account is locked and `locked_until` is in future
- [ ] Should auto-unlock account when `locked_until` has passed
- [ ] Should return `AUTH_USER_INACTIVE` for INACTIVE users
- [ ] Should return `AUTH_TOTP_REQUIRED` for AM user with totp_enabled=true and no totpCode
- [ ] Should return `AUTH_TOTP_INVALID` for AM user with invalid totpCode
- [ ] Should return `AUTH_TOTP_SETUP_REQUIRED` for AM user with totp_enabled=false
- [ ] Should reset `failed_login_count` on successful login
- [ ] Should update `last_login_at` on successful login
- [ ] Should create a new Session record on successful login
- [ ] Should hash refresh token before storing (SHA-256)
- [ ] Should not return password_hash in response

#### RefreshTokenUseCase

- [ ] Should return new token pair for valid refresh token
- [ ] Should rotate refresh token (new token, old invalidated)
- [ ] Should return `AUTH_INVALID_REFRESH_TOKEN` for unknown token
- [ ] Should return `AUTH_INVALID_REFRESH_TOKEN` for revoked session
- [ ] Should return `AUTH_INVALID_REFRESH_TOKEN` for expired session
- [ ] Should return `AUTH_SESSION_INVALID` if user is INACTIVE
- [ ] Should return `AUTH_SESSION_INVALID` if user is soft-deleted

#### LogoutUseCase

- [ ] Should set `revoked_at` on the session
- [ ] Should emit audit event

#### ChangePasswordUseCase

- [ ] Should update password hash on valid input
- [ ] Should return `AUTH_INVALID_CURRENT_PASSWORD` on wrong current password
- [ ] Should reject new password in common blacklist
- [ ] Should reject same password as current
- [ ] Should reject password without uppercase
- [ ] Should reject password without special character
- [ ] Should revoke all active sessions after password change
- [ ] Should emit audit event

#### RevokeSessionUseCase

- [ ] AM should be able to revoke any session
- [ ] User should be able to revoke their own session
- [ ] Should return `AUTH_FORBIDDEN` if non-AM tries to revoke another user's session
- [ ] Should return `SESSION_NOT_FOUND` for non-existent sessionId

### 10.2 Integration Tests (API + DB)

- [ ] `POST /v1/auth/login` → 200 with valid credentials
- [ ] `POST /v1/auth/login` → 401 with wrong password
- [ ] `POST /v1/auth/login` → 429 after 5 failed attempts
- [ ] `POST /v1/auth/login` → 403 INACTIVE user
- [ ] `POST /v1/auth/refresh` → 200 with valid refresh token
- [ ] `POST /v1/auth/refresh` → 401 with expired session
- [ ] `POST /v1/auth/refresh` → 401 after logout (revoked session)
- [ ] `POST /v1/auth/logout` → 204, subsequent refresh returns 401
- [ ] `GET /v1/me` → 200 with valid access token
- [ ] `GET /v1/me` → 401 with expired access token
- [ ] `POST /v1/auth/change-password` → 204, all existing sessions revoked
- [ ] `DELETE /v1/auth/sessions/:id` → 204 for own session
- [ ] `DELETE /v1/auth/sessions/:id` → 403 for other user's session (non-AM)
- [ ] `DELETE /v1/auth/sessions/:id` → 204 for any session when actor is AM

### 10.3 Edge Cases

- [ ] Login with email in mixed case (e.g., "User@AGENCY.COM") should be normalized and match
- [ ] Concurrent login requests for the same user do not create race condition on `failed_login_count`
- [ ] Refresh token used twice (replay attack): second use should fail after rotation
- [ ] Access token signed with unknown `kid` should be rejected
- [ ] Access token with expired `exp` should be rejected even if signature is valid
- [ ] TOTP code at window boundary (±30 seconds) should be accepted within tolerance
- [ ] Very long password (>128 chars) should be rejected at validation layer before bcrypt

### 10.4 Security / Multi-Tenant Scenarios

- [ ] JWT with tampered `tenant_id` claim should fail signature verification
- [ ] JWT with tampered `role` claim should fail signature verification
- [ ] CL_ADMIN user from tenant A cannot access resources scoped to tenant B (JWT claim enforces this at middleware level)
- [ ] AM user (tenant_id = null in JWT) must be able to access cross-tenant endpoints
- [ ] Soft-deleted user cannot log in even with correct credentials
- [ ] Race condition on account lock: simultaneous login failures should not exceed intended lock behavior (use DB-level increment)
- [ ] Audit log must be written even when login fails (for security monitoring)
- [ ] IP address and user agent must not be logged in cleartext if they contain tokens or credentials (should not happen, but test that headers are sanitized)
