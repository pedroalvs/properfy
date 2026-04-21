# Feature Specification: Identity & Access

**Feature Branch**: `001-identity-access`
**Created**: 2026-04-05
**Feature Status**: IMPLEMENTED — Phase 1 shipped; Phase 2 gaps closed in commit `33039b8` (2026-04-07, Waves 1–6) with Phase 3 audit polish in `8c9e7af`. Gap 001#GAP-003 (CL_USER fine-grained permissions) was further consolidated into the centralized AuthorizationService by feature 015 (`48a6a3d`, 2026-04-09). Editorial reconciliation 2026-04-13. See `specs/GAPS.md` for the gap status table.
**Sources**:
- Code: `apps/backend/src/modules/{auth,user}`, `apps/backend/src/shared/interfaces/auth-middleware.ts`, `apps/backend/prisma/schema.prisma`, `packages/shared/src/{schemas,enums,types}`, `apps/web/src/features/auth`
- Approved rules: `.specify/memory/constitution.md`, `CLAUDE.md`
- Legacy spec (to be superseded on approval): `specs/backend/auth.spec.md`

> **Reading guide.** Every user story declares `Priority`, `Status`, and `Source`.
> `Status` values: `IMPLEMENTED` (reality on the active branch), `APPROVED` (binding rule, implementation may be partial or absent), `GAP` (not yet approved, candidate for a future phase).
> `Source` values: `code` (verified against source files), `dossier` (from constitution / `projeto-consolidado/` / approved decision), `inferred` (derived from surrounding context; must be upgraded to `code` or `dossier` during review).

## User Scenarios & Testing

### User Story 1 — Sign in with email and password

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

A registered user opens the portal (Master Admin, Agency, or Inspector PWA), enters their email and password, and gains an authenticated session. Admin Master users must also present a TOTP code after the first setup. Failed attempts are rate-limited and accumulate toward a temporary lockout.

**Why this priority**: Without sign-in no other feature is reachable. This is the MVP entry point for every portal.

**Independent Test**: Seed a user of each role, hit `POST /v1/auth/login` with correct and incorrect credentials, confirm token issuance, lockout after 5 failures, and TOTP prompt for AM role.

**Acceptance Scenarios**:

1. **Given** an active user with correct credentials, **When** they submit `POST /v1/auth/login`, **Then** the response contains `accessToken`, `refreshToken`, and user profile, and a session row is created.
2. **Given** an AM user who has never set up 2FA, **When** they submit correct credentials, **Then** the response indicates `totpSetupRequired` and no tokens are issued until TOTP is confirmed.
3. **Given** an AM user with 2FA enabled, **When** they submit credentials without `totpCode`, **Then** the response indicates `totpRequired`. Resubmitting with a valid 6-digit code issues tokens.
4. **Given** any user, **When** they submit wrong credentials 5 times in a row, **Then** the account locks for 15 minutes and further attempts return `AccountLocked` without revealing whether the email exists.
5. **Given** a non-existent email, **When** the client attempts login, **Then** response timing and shape are indistinguishable from a wrong-password response (dummy bcrypt hash compared).
6. **Given** more than 30 login attempts per minute from the same IP, **When** the next request arrives, **Then** it is rejected with `429 Too Many Requests`.

---

### User Story 2 — Keep session alive with refresh token rotation

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

A signed-in user keeps working past the 15-minute access-token TTL. The client silently calls `POST /v1/auth/refresh` with the stored refresh token and receives a new pair; the old refresh token is invalidated.

**Why this priority**: Required for any session longer than 15 minutes; without it users would be logged out constantly.

**Independent Test**: Log in, wait until the access token expires (or force it), call refresh, confirm the old refresh token stops working and the new pair authorizes protected endpoints.

**Acceptance Scenarios**:

1. **Given** a valid refresh token, **When** the client calls `POST /v1/auth/refresh`, **Then** a new `accessToken` + `refreshToken` pair is returned and the previous session row is marked revoked.
2. **Given** a refresh token that has already been rotated, **When** it is replayed, **Then** the request is rejected with `SessionRevoked`.
3. **Given** a refresh token older than 10 days, **When** used, **Then** it is rejected with `SessionExpired`.
4. **Given** more than 20 refresh attempts per minute from the same IP, **When** the next arrives, **Then** it is rate-limited (429).

---

### User Story 3 — Sign out and manage active sessions

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

A user signs out from one device or reviews all devices currently holding a session and revokes any that look suspicious.

**Why this priority**: Baseline security feature; required for any role but critical for AM/OP.

**Independent Test**: Open two browser sessions, list sessions from one, revoke the other, confirm the revoked session can no longer refresh or call protected endpoints.

**Acceptance Scenarios**:

1. **Given** an authenticated request, **When** the user calls `POST /v1/auth/logout`, **Then** the current session is marked revoked and subsequent use of that refresh token fails.
2. **Given** an authenticated user, **When** they call `GET /v1/auth/sessions`, **Then** the response lists their active sessions with IP, user agent, created/expires timestamps, and a `current` flag.
3. **Given** a user with multiple sessions, **When** they call `DELETE /v1/auth/sessions/:sessionId` for one they own, **Then** that session is revoked and the target token stops working.
4. **Given** an AM or OP (own tenant only), **When** they revoke a session belonging to a user in their scope, **Then** the operation succeeds and an audit record is written.

---

### User Story 4 — Enforce TOTP 2FA for Admin Master

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

Admin Master users are required to enable TOTP on first login. Operators and client roles may enable it later (tracked as GAP-004).

**Why this priority**: Required by platform security policy; AM has cross-tenant access and is the highest-value attacker target.

**Independent Test**: Create a new AM user, log in, confirm setup response contains `otpauth://` URI, scan with an authenticator, confirm with a valid code, log out, log back in, confirm TOTP is required.

**Acceptance Scenarios**:

1. **Given** an AM user without `totp_enabled`, **When** they log in with correct credentials, **Then** response contains `totpSetupRequired: true` and a setup URI from `POST /v1/auth/2fa/setup`.
2. **Given** a valid TOTP setup session, **When** the user calls `POST /v1/auth/2fa/confirm` with a correct 6-digit code, **Then** `totp_enabled` flips to true, the secret is encrypted at rest, and tokens are issued.
3. **Given** an AM user with `totp_enabled`, **When** they log in without `totpCode`, **Then** response is `totpRequired: true` (no tokens issued).
4. **Given** a code skewed by ±30 seconds from server time, **When** validated, **Then** it is accepted (±1 step tolerance).

---

### User Story 5 — Change own password

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

A signed-in user updates their own password. The new password must satisfy the strength policy and must not match the current one or a common-password blacklist.

**Independent Test**: Authenticate, call `POST /v1/auth/change-password` with current + new passwords, confirm acceptance with valid input and rejections with each violation (wrong current, weak new, blacklisted new, identical to current).

**Acceptance Scenarios**:

1. **Given** a valid current password and a strong new password, **When** submitted, **Then** the password hash is updated and the operation is audited.
2. **Given** a wrong current password, **When** submitted, **Then** the request fails with `InvalidCredentials`.
3. **Given** a new password under 8 chars or missing any class (upper/lower/digit/special), **When** submitted, **Then** it fails with `PasswordTooWeak`.
4. **Given** a new password on the common-password blacklist, **When** submitted, **Then** it fails with `PasswordTooCommon`.

---

### User Story 6 — Admin creates and manages users

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

AM creates internal (platform-wide) or tenant users; OP creates users within their own tenant only; CL_ADMIN creates users within their own tenant **only if the agency explicitly enables user management in tenant settings** (APPROVED RULE per dossiê — see `002#GAP-002` for the settings schema). The creator specifies name, email, role, optional branch, and an initial password meeting the policy.

**Independent Test**: As AM, create one user of each supported role; as CL_ADMIN, create a CL_USER and confirm an attempt to create an AM is rejected.

**Acceptance Scenarios**:

1. **Given** an AM actor, **When** they call `POST /v1/tenants/:tenantId/users` with valid payload, **Then** a new user is created scoped to that tenant.
2. **Given** an AM actor, **When** they call `POST /v1/users` for an internal user (AM/OP), **Then** a user with `tenant_id = null` is created. OP cannot create internal users — blocked by the privilege-escalation rule (`OP` may only create `CL_ADMIN` / `CL_USER`), not by tenant scope. OP and AM are both platform-wide per CLAUDE.md §6 and `specs/DECISIONS.md` DEC-003.
3. **Given** a CL_ADMIN actor, **When** they attempt to create a user outside their own `tenant_id` or with a non-client role, **Then** the request is rejected with `Forbidden`.
4. **Given** a CL_ADMIN actor whose tenant has NOT enabled user management in settings, **When** they attempt to create a user, **Then** the request is rejected with `Forbidden` (`APPROVED RULE — not yet fully enforced; depends on 001#GAP-003 fine-grained permissions and 002#GAP-002 tenant settings`).
5. **Given** any actor, **When** creating a user with an email already in use, **Then** the request fails with `UserEmailConflict`.
5. **Given** an initial password that fails the policy, **When** creating a user, **Then** the request fails with `PasswordTooWeak`.

---

### User Story 7 — List, read, update, and deactivate users

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

Admins and tenant admins browse a paginated, filterable list of users; update name, phone, branch, or role (within their authority); and deactivate users when required.

**Independent Test**: Seed ten users, call `GET /v1/tenants/:tenantId/users` with filters and pagination, then update and deactivate one, confirming sessions are revoked on deactivation.

**Acceptance Scenarios**:

1. **Given** an authorized actor, **When** they call `GET /v1/tenants/:tenantId/users`, **Then** the response is paginated with `status`, `role`, and text search filters honored.
2. **Given** an authorized actor and a user in their scope, **When** they call `PUT /v1/tenants/:tenantId/users/:userId`, **Then** provided fields are updated and an audit record is written.
3. **Given** an AM or OP actor (both cross-tenant per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003), **When** they call `POST /v1/tenants/:tenantId/users/:userId/deactivate`, **Then** `status` becomes `INACTIVE`, all sessions for that user are revoked, and an audit record is written. Superseded phrasing: "AM or OP (own tenant only)".
4. **Given** a CL_ADMIN, **When** they attempt to deactivate a user of another tenant, **Then** the request is rejected with `Forbidden`.

---

### User Story 8 — Admin resets a user's password

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

An AM or OP (within their own tenant) resets another user's password when the user is locked out, has forgotten credentials, or needs a forced rotation. The new password follows the standard policy.

**Independent Test**: As AM, call `POST /v1/tenants/:tenantId/users/:userId/reset-password` with a valid new password, confirm the target user can now sign in with the new credentials and that sessions are revoked.

**Acceptance Scenarios**:

1. **Given** an AM or OP actor (both cross-tenant per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003), **When** they submit a valid new password, **Then** the target user's password hash is updated, sessions are revoked, and the action is audited. Superseded phrasing: "AM or OP (own tenant only)".
2. **Given** a non-AM/OP actor, **When** they call this endpoint, **Then** the request is rejected with `Forbidden`.
3. **Given** a password that fails the policy, **When** submitted, **Then** the request fails with `PasswordTooWeak`.

---

### User Story 9 — Multi-tenant context extraction for every protected request

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

Every protected endpoint receives an `AuthContext` carrying `userId`, `tenantId`, `role`, `branchId`, and `inspectorId`. Client roles (CL_ADMIN, CL_USER) are rejected if their tenant is inactive or deleted.

**Independent Test**: Call a protected endpoint with a client-role token belonging to a deactivated tenant — the request must be rejected before reaching the handler.

**Acceptance Scenarios**:

1. **Given** a valid JWT, **When** the auth middleware runs, **Then** `request.authContext` is populated with the decoded claims.
2. **Given** a client-role token for an inactive tenant, **When** the auth middleware runs, **Then** the request is rejected with `TenantInactive`.
3. **Given** an AM or OP token (both `tenant_id = null` per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003), **When** the auth middleware runs, **Then** the tenant status check is skipped — these are platform-wide roles. Client-role tokens (CL_ADMIN, CL_USER) with `tenant_id` set still undergo the tenant status check. Superseded phrasing: "For OP tokens (`tenant_id` set), the tenant status check applies the same way as for client roles".
4. **Given** a token signed with a previous key (within the 30-day grace period), **When** verified, **Then** it is accepted; beyond the grace period it is rejected.

---

### Edge Cases

- Clock skew between client and server beyond ±30 s breaks TOTP — users see `TotpInvalid`.
- A deactivated tenant retains user rows but client-role and OP tokens for that tenant stop working; AM can still access for cleanup.
- A user deactivated while holding an active session cannot refresh, but the access token remains valid until its 15-minute TTL expires (accepted risk).
- Key rotation: tokens signed with the previous `kid` are honored during the 30-day grace window; afterward they are rejected even if not expired by `exp`.
- Email is stored lowercase and uniquely; collisions across tenants are not allowed (global unique).
- Soft-deleted users (`deleted_at` set) cannot log in; the uniqueness index does not exclude them — reusing an email is blocked until hard delete (policy tracked as GAP-008).

## Requirements

### Functional Requirements

All FRs below are `Status: IMPLEMENTED, Source: code` unless otherwise noted.

- **FR-001**: System MUST authenticate users via email and password, hashing with bcrypt cost 12.
- **FR-002**: System MUST issue RS256-signed JWT access tokens with 15-minute TTL including claims `sub`, `tenant_id`, `role`, `branch_id`, `inspector_id`, and a `kid` header.
- **FR-003**: System MUST issue opaque refresh tokens with 10-day TTL, store only their SHA-256 hash, and rotate them on every refresh.
- **FR-004**: System MUST lock any account after 5 consecutive failed login attempts for 15 minutes, auto-unlocking afterwards.
- **FR-005**: System MUST apply hybrid rate limiting: `POST /v1/auth/login` at 30 req/min per IP **and** 5 failed attempts per account/email within 15 min (triggers lockout per FR-004); `POST /v1/auth/refresh` at 20 req/min per IP. (`Status: IMPLEMENTED, Source: code`)
- **FR-005b** (`Status: IMPLEMENTED, Source: code`): `POST /v1/auth/refresh` additionally enforces 10 req/5 min **per session** via `SlidingWindowRateLimiter` (GAP-011 closed).
- **FR-006**: System MUST prevent email enumeration by comparing a dummy bcrypt hash when the email does not exist so that timing and response shape match the invalid-password path.
- **FR-007**: System MUST require TOTP 2FA for Admin Master (AM) users, forcing setup on first login and verification on every subsequent login.
- **FR-008**: System MUST encrypt TOTP secrets at rest.
- **FR-009**: System MUST enforce password policy of at least 8 characters with uppercase, lowercase, digit, and special character, and reject entries on the common-password blacklist.
- **FR-010**: System MUST support server-side session revocation (self, admin, or cascade on deactivate) and list-own-sessions with IP, user agent, timestamps, and `current` flag.
- **FR-011**: System MUST extract `AuthContext` in a Fastify preHandler middleware for every protected route and reject tokens issued to users whose tenant is inactive or deleted (client roles only).
- **FR-012**: System MUST apply RBAC rules in use cases — AM may create any role for any tenant; OP may create users within their own tenant only; CL_ADMIN may create/manage users of their own tenant (client roles only: CL_ADMIN, CL_USER) **only if the agency explicitly enables user management** in tenant settings (see `002#GAP-002` for the settings schema); INSP is managed through the Inspector module, not through the user CRUD endpoints.
- **FR-013**: System MUST scope every user query by `tenant_id` except for AM listings. OP queries are scoped to their own tenant.
- **FR-014**: System MUST audit login successes, failures, lockouts, logouts, session revocations, password changes, admin resets, and user CRUD operations.
- **FR-015**: System MUST support JWT signing key rotation with `kid` header lookup and a 30-day grace window for the previous key.
- **FR-016**: System MUST revoke all sessions belonging to a user when they are deactivated or when their password is reset.
- **FR-017**: System MUST validate all auth and user payloads against Zod schemas in `packages/shared`.
- **FR-018** (`Status: APPROVED, Source: dossier`): System MUST audit refresh token rotation events alongside other auth events.
- **FR-019** (`Status: APPROVED, Source: dossier`): System MUST apply rate limiting as hybrid: per IP AND per account/email on login (5 failures per email/15 min → lockout, tied to FR-004/FR-005); per IP AND per session on refresh (10 req/5 min per session — per-session throttle not yet implemented, see FR-005b / GAP-011). Non-existent emails MUST follow the same timing as valid emails (dummy-hash comparison per FR-006) so per-account throttle does not leak email existence.
- **FR-020** (`Status: APPROVED, Source: dossier`): Password policy includes "no forced periodic expiration" -- passwords do not expire on a schedule.

### Non-Functional Requirements

- **NFR-001** (`Status: APPROVED, Source: dossier`): Auth endpoints MUST respond within 300 ms p95 under nominal load, excluding bcrypt cost (which is the dominant factor).
- **NFR-002** (`Status: IMPLEMENTED, Source: code`): Password hashes, TOTP secrets, and JWT private keys MUST never appear in logs, errors, or API responses.
- **NFR-003** (`Status: APPROVED, Source: dossier`): Auth-related integration tests MUST run against a real PostgreSQL instance (no Prisma mocks).

### Key Entities

- **User** — Represents a human actor. Attributes: `id`, `tenant_id` (nullable for AM only; mandatory for OP), `branch_id` (nullable), `role` (enum), `name`, `email` (unique, lowercase), `phone`, `status` (`ACTIVE|INACTIVE|LOCKED`), `password_hash`, `totp_secret` (encrypted, nullable), `totp_enabled`, `failed_login_count`, `locked_until`, `last_login_at`, `created_at`, `updated_at`, `deleted_at`.
- **Session** — Represents an active refresh-token grant. Attributes: `id`, `user_id`, `refresh_token_hash` (SHA-256), `ip_address`, `user_agent`, `expires_at`, `revoked_at`, `created_at`.
- **AuthContext** (request-scoped, not persisted) — `userId`, `tenantId`, `role`, `branchId`, `inspectorId`, derived from JWT on every request.
- **JwtPayload** (shared contract) — `sub`, `tenant_id`, `role`, `branch_id`, `inspector_id`, `kid`, `iat`, `exp`.

Full field list, types, indexes, and invariants are in [`data-model.md`](./data-model.md). HTTP contracts are in [`contracts/`](./contracts/).

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of authenticated endpoints receive a valid `AuthContext` or reject the request before reaching business logic (zero routes bypass middleware).
- **SC-002**: Every auth event (login success/failure, lockout, logout, password change, admin reset, session revoke, user CRUD) produces exactly one audit record.
- **SC-003**: Account lockout triggers on the 5th consecutive failure and releases automatically 15 minutes later, measured by integration tests.
- **SC-004**: Refresh token reuse detection rejects any replayed token within the same test session.
- **SC-005**: TOTP validation tolerates ±30 s skew and no more — verified in unit tests.
- **SC-006**: Multi-tenant enforcement test suite passes: no query returns rows from a tenant other than the caller's.
- **SC-007**: Integration test coverage for auth and user modules ≥ 80% (critical-module floor from the constitution).

## Assumptions

- Email is a reasonable global unique identifier for users across tenants in Phase 1; a future phase may relax this.
- TOTP is the only 2FA factor; SMS/WebAuthn are out of scope for Phase 1.
- Password reset flow is admin-mediated only; self-service forgot-password by email link is NOT in Phase 1 scope (tracked as GAP-001).
- Service accounts and API keys are out of scope — all traffic is human-initiated via JWT.
- OAuth, SAML, and SSO are out of scope.
- Audit sink is the shared `AuditService` writing to the audit table (see feature 011-reports-audit).
- JWT private/public keys are injected via environment; rotation is operational, not runtime-automated.
- The platform runs with a single Postgres instance (Supabase), so session revocation is strongly consistent.

## Known Gaps

> Summary index only. Operational detail for each gap lives in [`tasks.md`](./tasks.md) under Phase 2. Each gap carries `Status: GAP` until promoted to an approved rule.

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Self-service forgot password | ~~Users depend on admins to reset passwords.~~ **IMPLEMENTED** (Wave 2, backend). Web UI deferred to T107. | `RequestPasswordResetUseCase` + `ConsumePasswordResetUseCase`. Routes: `POST /v1/auth/forgot-password`, `POST /v1/auth/reset-password`. Email via 009-notifications (`PASSWORD_RESET` template). |
| GAP-002 | Admin manual unlock | ~~Locked users wait 15 min even when an admin is available.~~ **IMPLEMENTED** (Wave 1). | `UnlockUserUseCase` + `POST /v1/tenants/:tenantId/users/:userId/unlock`. AM/OP (own tenant). |
| GAP-003 | CL_USER fine-grained permissions | ~~Client admins cannot restrict what their team members see/do.~~ **IMPLEMENTED** (Wave 3). | `AuthorizationService` centralized. 7 flags: `create_appointments`, `cancel_appointments`, `reject_appointments`, `reschedule_appointments`, `force_confirmation`, `create_properties`, `export_reports`. Tenant-level via `settingsJson.clUserPermissions`. Loaded into `AuthContext` at middleware time. |
| GAP-004 | TOTP opt-in for non-AM roles | ~~OP, CL_ADMIN, CL_USER cannot enable 2FA.~~ **IMPLEMENTED** (Wave 4). | `UserEntity.requiresTotpCode()` now checks `totpEnabled` for any role. AM still forced on first login. 11 new tests. |
| GAP-005 | Device/session trust signals | ~~IP and user agent not used for anomaly detection.~~ **IMPLEMENTED** (Wave 6). | `SessionTrustService` evaluates country + device fingerprint against 30-day history. Step-up TOTP on new country + new device. `StubGeoIpService` (swappable). `auth.login_anomaly` audit. Session stores `country_code` + `device_fingerprint`. |
| GAP-006 | Password history | ~~Users can cycle back to a previously used password.~~ **IMPLEMENTED** (Wave 4). | `password_history` table (last 5 hashes). Enforced on change-password, admin reset, forgot-password reset. `PasswordRecentlyUsedError`. |
| GAP-007 | Admin invite flow | ~~Admin sets initial password directly.~~ **IMPLEMENTED** (Wave 5). | `InviteUserUseCase` + `AcceptInviteUseCase`. `PENDING_INVITE` status. 72h invite token via `PasswordResetToken`. Routes: `POST /v1/tenants/:tenantId/users/invite`, `POST /v1/auth/accept-invite`. Direct-password `CreateUserUseCase` retained as fallback. |
| GAP-008 | Soft-delete email reuse policy | ~~Unique index does not exclude `deleted_at`.~~ **IMPLEMENTED** (Wave 4). | Partial unique index `WHERE deleted_at IS NULL`. Email reuse allowed after soft delete. |
| GAP-009 | Blacklist on create & admin reset | ~~Common-password blacklist unconfirmed for create and admin reset.~~ **IMPLEMENTED** (Wave 1). | `CreateUserUseCase` now checks `COMMON_PASSWORDS`. `ResetUserPasswordUseCase` already had the check. Regression tests added. |
| GAP-010 | Key rotation runbook + alerting | ~~No operational guide or alerting.~~ **IMPLEMENTED** (Wave 6). | Runbook at `docs/runbooks/jwt-key-rotation.md`. `getPreviousKeyDaysRemaining()` on JwtService. `KeyExpiryCheckWorker` (daily pg-boss job). `jwt.previousKeyDaysRemaining` metric. Warns at 7 days, critical at 1 day. |
| GAP-011 | Refresh per-session rate limit | ~~Dossiê requires 10 req/5 min per session on refresh.~~ **IMPLEMENTED** (Wave 1). | `SlidingWindowRateLimiter` in `RefreshTokenUseCase`. Per-session throttle (10 req/5 min) applied after session lookup. Per-IP (20/min) remains independent. |
