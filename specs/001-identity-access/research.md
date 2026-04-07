# Research: Identity & Access

**Feature**: `001-identity-access`
**Date**: 2026-04-06
**Status**: Complete (retroactive documentation of Phase 1 decisions + Phase 2 research)

## Phase 1 Decisions (Implemented)

### D-001: JWT signing algorithm

- **Decision**: RS256 with `kid` header and 30-day key rotation grace window
- **Rationale**: Asymmetric signing allows frontend verification without exposing the private key. `kid` rotation supports zero-downtime key changes. 30-day grace window avoids mass session invalidation on rotation.
- **Alternatives considered**: HS256 (simpler but requires shared secret on all consumers; rejected for multi-service future), EdDSA (faster but less library ecosystem support in Node.js at time of implementation).

### D-002: Token TTL strategy

- **Decision**: 15-minute access token, 10-day refresh token, single-use rotation
- **Rationale**: Short access TTL limits exposure window of a stolen token. 10-day refresh allows persistent sessions across weekends. Single-use rotation with replay detection catches token theft.
- **Alternatives considered**: Longer access TTL (30 min, reduces refresh frequency but increases risk window), sliding refresh (complexity, harder to reason about expiration).

### D-003: Password hashing

- **Decision**: bcrypt with cost factor 12
- **Rationale**: Industry standard for password hashing. Cost 12 provides ~250ms hash time, balancing security and login latency.
- **Alternatives considered**: Argon2id (stronger but requires native bindings, complicates Fly.io deployment), scrypt (less ecosystem support in Node.js).

### D-004: TOTP implementation

- **Decision**: otplib with ±1 step tolerance (30-second window each direction), encrypted at rest via `TotpEncryptionService`
- **Rationale**: Standard TOTP per RFC 6238. ±1 step tolerance handles typical clock skew. At-rest encryption protects secrets if database is compromised.
- **Alternatives considered**: WebAuthn (better UX but requires client-side changes and hardware support, out of scope for Phase 1), SMS OTP (regulatory complexity with Twilio/Zenvia, less secure than TOTP).

### D-005: Module separation (auth vs. user)

- **Decision**: Split into `auth` (authentication concerns) and `user` (administration concerns) as separate backend modules
- **Rationale**: Authentication (login, refresh, TOTP, sessions) and user management (CRUD, RBAC, deactivation) have different access patterns and change frequencies. Separating them follows Single Responsibility and makes it clearer which repository port each use case depends on.
- **Alternatives considered**: Single `identity` module (simpler structure but larger surface area, harder to reason about dependencies).

### D-006: Rate limiting approach

- **Decision**: Hybrid rate limiting — per-IP on login (30/min) and refresh (20/min), plus per-account lockout (5 failures/15 min)
- **Rationale**: Per-IP prevents brute-force from a single source. Per-account lockout prevents credential stuffing across distributed IPs. Dummy-hash comparison on unknown emails prevents email enumeration through timing attacks.
- **Alternatives considered**: Only per-IP (insufficient against distributed attacks), only per-account (susceptible to DoS locking legitimate accounts — mitigated by the 15-min auto-unlock).

### D-007: Session storage

- **Decision**: Database-backed sessions with SHA-256 hashed refresh tokens
- **Rationale**: PostgreSQL provides strong consistency for session revocation (immediate effect). SHA-256 ensures raw tokens are never stored. No Redis dependency required.
- **Alternatives considered**: Redis-backed sessions (lower latency but adds infrastructure dependency; rejected per constitution "no Redis" constraint), JWT-only with blacklist (revocation requires a blacklist store anyway).

### D-008: Anti-enumeration on login

- **Decision**: Dummy bcrypt hash comparison for non-existent emails
- **Rationale**: Ensures consistent response time whether email exists or not. Prevents both timing-based and response-based email enumeration.
- **Alternatives considered**: Fixed delay (less accurate timing match), always return generic error without timing equalization (leaks email existence via response time).

## Phase 2 Research

### R-001: Self-service forgot password (GAP-001)

- **Decision**: Email-token flow with short TTL (1 hour), single-use, SHA-256 hashed storage
- **Rationale**: Standard pattern. Token hashed in DB (same as refresh tokens). Single-use prevents replay. 1-hour TTL limits exposure.
- **Dependency**: Feature 009-notifications (email sender via pg-boss). Must coordinate template creation.
- **Open question**: None. Pattern is well-established.

### R-002: CL_USER fine-grained permissions (GAP-003)

- **Decision**: NEEDS DESIGN DOC (tracked as T120 in tasks.md)
- **Rationale**: Multiple valid approaches — JSON column on user, separate permissions table, or bitfield. Decision depends on how many permissions exist and how often they change. Cross-feature impact (appointments, properties, etc.).
- **Alternatives to evaluate in design doc**: (a) JSON column `permissions` on `users` table (simple, no migration for new perms), (b) separate `user_permissions` table (normalized, queryable), (c) role-permission matrix with tenant-level overrides.
- **Dependency**: Blocks multiple Phase 2 features across other modules.

### R-003: Per-session refresh rate limit (GAP-011)

- **Decision**: In-memory sliding window keyed by session ID, 10 req/5 min
- **Rationale**: Per-session throttle complements per-IP. Session ID is available from the refresh token lookup. In-memory is acceptable because the limit is generous (10/5min) and the consequence of losing state on restart is minimal (attacker gets a fresh window, not a bypass).
- **Alternatives considered**: Database-backed counter (adds write on every refresh, unnecessary overhead), Redis (rejected per constitution).

### R-004: Password history (GAP-006)

- **Decision**: `password_history` table with last 5 hashes
- **Rationale**: Prevents trivial password cycling. 5 entries is a common industry default. Only checked on password write paths (change, admin reset, forgot-password reset).
- **Migration**: Expand-only — new table, no changes to `users`.

### R-006: Soft-delete email reuse policy (GAP-008)

- **Decision**: Allow email reuse after soft delete via partial unique index
- **Rationale**: The `users` table uses soft delete (`deleted_at`), but the original `@unique` constraint on `email` prevented reusing an email after a user was soft-deleted. A partial unique index (`WHERE deleted_at IS NULL`) enforces uniqueness only among active users, allowing a new account to be created with a previously soft-deleted email.
- **Implementation**: Migration drops the Prisma-managed `users_email_key` unique index and recreates it as a partial index. Prisma `@unique` removed from the `email` field (Prisma does not natively support partial unique indexes). A regular `@@index([email])` is added for query performance. Both `findByEmail` implementations (auth and user-management repositories) already filter `deleted_at: null`, ensuring only active users are returned.
- **Alternatives considered**: (a) Hard-delete users instead of soft-delete (loses audit trail, rejected), (b) Append a UUID suffix to the email on soft-delete (ugly, complicates reactivation), (c) Separate `active_email` column (unnecessary complexity).

### R-005: Admin invite flow (GAP-007)

- **Decision**: Deferred until GAP-001 (forgot-password) is implemented
- **Rationale**: Both flows use email-token patterns. Implementing forgot-password first establishes the token infrastructure. Invite flow can reuse the same token generation, hashing, and verification patterns.
- **Dependency**: GAP-001 must land first.
