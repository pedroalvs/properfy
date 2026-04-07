# Auth Endpoints

**Feature**: `001-identity-access`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/auth/interfaces/auth.routes.ts`, `packages/shared/src/schemas/auth.ts`

---

## POST `/v1/auth/login`

Authenticate a user with email, password, and optional TOTP code.

- **Auth**: none
- **Rate limit**: 30 req/min per IP; 5 failed attempts per account/email within 15 min triggers lockout (hybrid — see FR-005, FR-019)
- **Audit**: yes (success, failure, lockout)

**Request body** (`loginSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string (email) | yes | Case-insensitive; normalized to lowercase. |
| `password` | string | yes | Min length 1 at schema level; actual policy enforced on set. |
| `totpCode` | string (6 digits) | no | Required when the user has `totp_enabled`. |

**Response 200** — success

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<opaque>",
  "user": {
    "id": "<uuid>",
    "tenantId": "<uuid|null>",
    "role": "AM|OP|CL_ADMIN|CL_USER|INSP",
    "name": "string",
    "email": "string"
  }
}
```

**Response 200** — TOTP setup required (AM first login)

```json
{ "totpSetupRequired": true }
```

**Response 200** — TOTP code required

```json
{ "totpRequired": true }
```

**Error codes**: `InvalidCredentials`, `TotpRequired`, `TotpInvalid`, `AccountLocked`, `AccountInactive`, `TenantInactive`, `PasswordTooWeak` (legacy on policy upgrade), `TooManyRequests`.

---

## POST `/v1/auth/refresh`

Rotate a refresh token and receive a new access + refresh pair.

- **Auth**: none (authenticates via refresh token in body)
- **Rate limit**: 20 req/min per IP (IMPLEMENTED); 10 req/5 min per session (APPROVED RULE NOT YET IMPLEMENTED — see FR-005b / GAP-011)
- **Audit**: yes (refresh rotation is an auditable auth event per FR-018)

**Request body** (`refreshSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `refreshToken` | string | yes | |

**Response 200**

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<opaque>"
}
```

**Error codes**: `SessionRevoked`, `SessionExpired`, `SessionNotFound`, `UserInactive`, `TenantInactive`, `TooManyRequests`.

---

## POST `/v1/auth/logout`

Revoke the current session (the one identified by the presenting access token).

- **Auth**: required
- **Audit**: yes

**Request body**: none.

**Response 204** — no body.

**Error codes**: `Unauthorized`.

---

## GET `/v1/me`

Return the authenticated user's profile without secrets.

- **Auth**: required

**Response 200**

```json
{
  "id": "<uuid>",
  "tenantId": "<uuid|null>",
  "branchId": "<uuid|null>",
  "role": "AM|OP|CL_ADMIN|CL_USER|INSP",
  "name": "string",
  "email": "string",
  "phone": "string|null",
  "status": "ACTIVE|INACTIVE|LOCKED",
  "totpEnabled": true,
  "lastLoginAt": "ISO-8601|null"
}
```

---

## POST `/v1/auth/change-password`

Self-service password change.

- **Auth**: required
- **Audit**: yes

**Request body** (`changePasswordSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `currentPassword` | string | yes | |
| `newPassword` | string | yes | Policy: ≥ 8 chars, uppercase, lowercase, digit, special; not on common-password blacklist. |

**Response 204** — no body.

**Error codes**: `InvalidCredentials`, `PasswordTooWeak`, `PasswordTooCommon`, `PasswordSameAsCurrent`.

---

## POST `/v1/auth/2fa/setup`

Generate a new TOTP secret and setup URI for the authenticated user. Current enforcement: AM role.

- **Auth**: required (AM)
- **Audit**: yes

**Request body**: none.

**Response 200**

```json
{
  "otpauthUri": "otpauth://totp/...",
  "secretBase32": "BASE32STRING"
}
```

> `secretBase32` is the unencrypted secret, returned only at setup time so the client can build a QR code. It is never returned again after confirmation.

**Error codes**: `Forbidden`, `TotpAlreadyEnabled`.

---

## POST `/v1/auth/2fa/confirm`

Confirm a TOTP setup by verifying a 6-digit code. On success, the secret is encrypted and `totp_enabled` flips to true; the user receives their tokens.

- **Auth**: required (AM, in setup state)
- **Audit**: yes

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `totpCode` | string (6 digits) | yes | |

**Response 200** — issues fresh access + refresh tokens (same shape as login success).

**Error codes**: `TotpInvalid`, `Forbidden`.

---

## GET `/v1/auth/sessions`

List the authenticated user's sessions.

- **Auth**: required

**Response 200**

```json
{
  "sessions": [
    {
      "id": "<uuid>",
      "ipAddress": "string|null",
      "userAgent": "string|null",
      "createdAt": "ISO-8601",
      "expiresAt": "ISO-8601",
      "current": true
    }
  ]
}
```

`current: true` identifies the session tied to the presenting access token.

---

## DELETE `/v1/auth/sessions/:sessionId`

Revoke a session by id. Users can revoke their own sessions; AM/OP can revoke any session.

- **Auth**: required
- **Audit**: yes

**Path params**

| Name | Type | Notes |
|---|---|---|
| `sessionId` | uuid | |

**Response 204** — no body.

**Error codes**: `Forbidden`, `SessionNotFound`.
