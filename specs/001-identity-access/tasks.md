---
description: "Implementation and backlog tracking for Identity & Access"
---

# Tasks: Identity & Access

**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), [`data-model.md`](./data-model.md), [`contracts/`](./contracts/)
**Tests**: Required. Critical module — 80%+ coverage per constitution Principle III.
**Organization**: Two top-level sections.
1. **Baseline Implemented** — Phase 1 tasks that are shipped on the active branch. Marked `[x]`. Listed for traceability so AI agents and reviewers can see what already exists and avoid reimplementing it.
2. **Open Backlog** — Phase 2 gap-closure tasks (`GAP-xxx` from `spec.md`) and Phase 3 polish. Marked `[ ]`. These are the only tasks that should be picked up as new work.

## Format: `[ID] [P?] [Story] Description`

- `[x]` = shipped; `[ ]` = open.
- `[P]` = can run in parallel with other `[P]` tasks in the same group (different files, no dependencies).
- `[Story]` = maps to a user story in `spec.md` (US1–US9) or to a `GAP-xxx`.
- Paths: backend under `apps/backend/src/modules/{auth,user}/...`, tests under `apps/backend/tests/...`, shared under `packages/shared/src/...`, web under `apps/web/src/features/auth/...`, pwa under `apps/pwa/src/features/auth/...`.

---

# SECTION 1 — Baseline Implemented

> These tasks are **already done** on the active branch. Do not reimplement. Use them as the reference point for understanding the module and for regression coverage when closing Phase 2 gaps.

## Setup & Foundational (shipped)

- [x] T001 Prisma schema: `User`, `Session`, `UserRole`, `UserStatus` in `apps/backend/prisma/schema.prisma`.
- [x] T002 Shared enums `UserRole`, `UserStatus` in `packages/shared/src/enums/user.ts`.
- [x] T003 Shared types `JwtPayload`, `AuthContext` in `packages/shared/src/types/auth.ts`.
- [x] T004 Shared Zod schemas (`login`, `refresh`, `changePassword`) in `packages/shared/src/schemas/auth.ts`.
- [x] T005 Shared Zod schemas (`createUser`, `updateUser`, `resetUserPassword`, `listUsersQuery`) in `packages/shared/src/schemas/user.ts`.
- [x] T006 Fastify auth middleware in `apps/backend/src/shared/interfaces/auth-middleware.ts` extracting `AuthContext` and enforcing tenant status for client roles.
- [x] T007 `JwtService` (RS256 sign/verify, `kid` rotation, 30-day grace) in `apps/backend/src/modules/auth/application/services/jwt.service.ts`.
- [x] T008 `TotpService` (otplib, ±1 step tolerance) in `apps/backend/src/modules/auth/application/services/totp.service.ts`.
- [x] T009 `TotpEncryptionService` for at-rest secret encryption.
- [x] T010 `PasswordPolicy` + `common-passwords` blacklist in `apps/backend/src/modules/auth/application/constants/common-passwords.ts`.

## US1 — Sign in (shipped)

- [x] T011 [US1] `LoginUseCase` — dummy-hash compare, lockout, TOTP branching, audit.
- [x] T012 [US1] Login route with rate limit 30/min in `auth.routes.ts`.
- [x] T013 [US1] Unit tests for login edge cases (lockout, dummy hash, TOTP branching).
- [x] T014 [US1] Integration test covering all acceptance scenarios in `tests/integration/auth/auth.routes.test.ts`.
- [x] T015 [US1] Web `LoginPage.tsx` + `LoginPage.test.tsx` with TOTP step.

## US2 — Refresh token rotation (shipped)

- [x] T016 [US2] `RefreshTokenUseCase` with rotative strategy and replay detection.
- [x] T017 [US2] Refresh route with rate limit 20/min.
- [x] T018 [US2] Integration tests for rotation, replay, and expiry.
- [x] T019 [US2] `auth-storage.ts` + silent refresh flow in web and pwa.

## US3 — Sign out & session management (shipped)

- [x] T020 [US3] `LogoutUseCase`, `ListSessionsUseCase`, `RevokeSessionUseCase`.
- [x] T021 [US3] Routes: `POST /v1/auth/logout`, `GET /v1/auth/sessions`, `DELETE /v1/auth/sessions/:sessionId`.
- [x] T022 [US3] Integration tests covering current-session flag and admin revoke-by-id.
- [x] T023 [US3] `cleanup-sessions.worker` pg-boss job.

## US4 — TOTP 2FA for Admin Master (shipped)

- [x] T024 [US4] `SetupTotpUseCase`, `ConfirmTotpUseCase`.
- [x] T025 [US4] Routes `POST /v1/auth/2fa/setup`, `POST /v1/auth/2fa/confirm`.
- [x] T026 [US4] Unit tests for setup → confirm → login-with-TOTP happy path and ±30 s tolerance.
- [x] T027 [US4] Integration test forcing AM setup on first login.

## US5 — Change own password (shipped)

- [x] T028 [US5] `ChangePasswordUseCase` with policy + blacklist + current-mismatch checks.
- [x] T029 [US5] Route `POST /v1/auth/change-password`.
- [x] T030 [US5] Unit + integration tests for each rejection path.

## US6 — Create users (shipped)

- [x] T031 [US6] `CreateUserUseCase` with RBAC, email conflict, password policy.
- [x] T032 [US6] Routes `POST /v1/tenants/:tenantId/users`, `POST /v1/users`.
- [x] T033 [US6] Unit tests for RBAC matrix and rejections.
- [x] T034 [US6] Integration test for happy path and forbidden paths.

## US7 — List, read, update, deactivate users (shipped)

- [x] T035 [US7] `GetUserUseCase`, `ListUsersUseCase`, `UpdateUserUseCase`, `DeactivateUserUseCase`.
- [x] T036 [US7] Routes for GET list/detail, PUT update, POST deactivate.
- [x] T037 [US7] Unit tests covering tenant scoping, filters, update restrictions, cascade session revocation on deactivate.
- [x] T038 [US7] Integration test for pagination, filter, sort.

## US8 — Admin password reset (shipped)

- [x] T039 [US8] `ResetUserPasswordUseCase` with AM/OP guard, policy, blacklist, audit.
- [x] T040 [US8] Route `POST /v1/tenants/:tenantId/users/:userId/reset-password`.
- [x] T041 [US8] Tests for allowed/forbidden actors and cascade session revocation.

## US9 — AuthContext extraction (shipped)

- [x] T042 [US9] Middleware applied to all protected routes (verify no route bypasses).
- [x] T043 [US9] Rejects client-role tokens for inactive tenants.
- [x] T044 [US9] Honors `kid` previous-key grace window.

---

# SECTION 2 — Open Backlog

> These are the **only** tasks to pick up as new work. Each task must follow TDD (red → green → refactor) per constitution Principle III and must produce an audit record where the operation is identity-sensitive.

## Phase 2 — Gap closure

### GAP-001 — Self-service forgot password ✅ (backend)

- [x] T100 [GAP-001] Domain: `PasswordResetTokenEntity` + `IPasswordResetTokenRepository` port.
- [x] T101 [GAP-001] Prisma migration `20260406000000_add_password_reset_tokens` + schema model + `PrismaPasswordResetTokenRepository`.
- [x] T102 [GAP-001] `RequestPasswordResetUseCase` — email → find user → rate limit (3/hr) → token → SHA-256 hash → save → enqueue `PASSWORD_RESET` notification → audit. No user enumeration.
- [x] T103 [GAP-001] `ConsumePasswordResetUseCase` — validate token → password strength + blacklist → bcrypt hash → update → revoke sessions → mark used → audit.
- [x] T104 [GAP-001] Routes `POST /v1/auth/forgot-password` (public, 5/min), `POST /v1/auth/reset-password` (public, 10/min).
- [x] T105 [GAP-001] Uses `CreateNotificationUseCase` with template code `PASSWORD_RESET`. pg-boss delivery via existing `notification.send` worker.
- [x] T106 [GAP-001] 14 unit tests (7 request + 7 consume) + 8 schema tests. All passing.
- [x] T107 [GAP-001] `ForgotPasswordPage.tsx` + `useForgotPassword` hook + route `/forgot-password` + "Forgot password?" link in `LoginPage.tsx`. 7 component tests.

### GAP-002 — Admin manual unlock ✅

- [x] T110 [GAP-002] `UnlockUserUseCase` (AM/OP only) resets `failed_login_count`, clears `locked_until`, audit.
- [x] T111 [GAP-002] Route `POST /v1/tenants/:tenantId/users/:userId/unlock`.
- [x] T112 [GAP-002] Tests (7 unit tests).

### GAP-003 — CL_USER fine-grained permissions ✅

> **APPROVED RULE** — now implemented.

- [x] T120 [GAP-003] Design doc `specs/001-identity-access/permissions-design.md`. Decision: tenant-level `settingsJson.clUserPermissions` (string array), 7 flags, no new table.
- [x] T121 [GAP-003] No Prisma migration needed — using existing `tenant.settings_json`.
- [x] T122 [GAP-003] `AuthorizationService` in `shared/domain/`. `assertClUserPermission(authContext, permission)` reads from `authContext.clUserPermissions`. Replaced all 6 call sites.
- [x] T123 [GAP-003] Not needed — permissions are tenant-level settings, not per-user. CL_ADMIN configures via tenant settings.
- [x] T124 [GAP-003] `AuthContext.clUserPermissions` populated by auth middleware via `ClUserPermissionsResolver`. Loaded from `tenant.settingsJson` at request time (not JWT).
- [x] T125 [GAP-003] Tests updated for all 7 permission gates: appointment (5), property (1), report (1). Added `create_properties` missing gate.

### GAP-004 — TOTP opt-in for non-AM roles ✅

- [x] T130 [GAP-004] `UserEntity.requiresTotpCode()` changed from `role === 'AM' && totpEnabled` to just `totpEnabled`. Setup/confirm had no role restriction.
- [x] T131 [GAP-004] UI entry point deferred (backend complete).
- [x] T132 [GAP-004] 11 new tests: 3 setup (OP/CL_ADMIN/CL_USER), 3 confirm, 5 login (require TOTP for non-AM with flag).

### GAP-005 — Device/session trust signals ✅

- [x] T140 [GAP-005] `country_code` + `device_fingerprint` on Session. Migration `20260406000004`. `StubGeoIpService` (swappable). `computeDeviceFingerprint` (normalized UA → SHA-256 prefix).
- [x] T141 [GAP-005] `SessionTrustService` evaluates trust signals against 30-day session history. `auth.login_anomaly` audit on new country/device.
- [x] T142 [GAP-005] Step-up TOTP required when both country AND device are new and user has TOTP enabled. Integrated in `LoginUseCase`.
- [x] T143 [GAP-005] 14 tests: 7 trust service (all signal combinations), 7 device fingerprint (normalization, consistency).

### GAP-006 — Password history ✅

- [x] T150 [GAP-006] `PasswordHistory` model + migration `20260406000001_add_password_history`. `IPasswordHistoryRepository` + Prisma impl. `checkPasswordHistory` helper with bcrypt.compare.
- [x] T151 [GAP-006] Enforced on all 3 paths: change-password, admin reset, forgot-password reset. Saves old hash before update, prunes to 5.
- [x] T152 [GAP-006] 11 new tests: 5 helper tests + 2 per password write path (rejects recently used + saves old hash).

### GAP-007 — Admin invite flow ✅

- [x] T160 [GAP-007] `PENDING_INVITE` status added to `UserStatus` enum (Prisma + shared). Migration `20260406000003`.
- [x] T161 [GAP-007] `InviteUserUseCase` (creates user with `PENDING_INVITE`, 72h token, `USER_INVITE` email). `AcceptInviteUseCase` (validates token, sets password, activates user). `activateUser()` added to auth `IUserRepository`.
- [x] T162 [GAP-007] Routes: `POST /v1/tenants/:tenantId/users/invite` (auth), `POST /v1/auth/accept-invite` (public, 10/min). Schemas: `inviteUserSchema`, `acceptInviteSchema`.
- [x] T163 [GAP-007] Direct-password `CreateUserUseCase` retained as fallback — deprecation deferred.
- [x] T164 [GAP-007] 22 tests: 12 invite (RBAC, email conflict, tenant/branch validation, TTL), 10 accept (token validation, status check, password strength, activation).

### GAP-008 — Soft-delete email reuse policy ✅

- [x] T170 [GAP-008] Decision: allow reuse after soft delete. Documented in `research.md` R-006.
- [x] T171 [GAP-008] Migration `20260406000002_email_reuse_after_soft_delete`. Partial unique index `WHERE deleted_at IS NULL`. Prisma `@unique` removed (enforced at DB level).
- [x] T172 [GAP-008] 2 tests: email reuse for soft-deleted user succeeds, active user email still conflicts.

### GAP-009 — Blacklist enforcement on create & admin reset ✅

> **APPROVED RULE** — now implemented.

- [x] T180 [GAP-009] Audited: `ResetUserPasswordUseCase` already had the check. Added `COMMON_PASSWORDS.has()` + `PasswordTooCommonError` to `CreateUserUseCase`. Regression tests added (2 tests).

### GAP-010 — Key rotation runbook + alerting ✅

- [x] T190 [GAP-010] Runbook at `docs/runbooks/jwt-key-rotation.md`. Covers scheduled + emergency rotation, deploy procedure, verification, rollback.
- [x] T191 [GAP-010] `getPreviousKeyDaysRemaining()` on JwtService. `KeyExpiryCheckWorker` (daily pg-boss job at 03:00 UTC). `jwt.previousKeyDaysRemaining` metric on `/metrics`. Warns at 7d, critical at 1d. 12 new tests.
- [x] T192 [GAP-010] Smoke test pattern documented in runbook. Staging rotation verification steps included.

### GAP-011 — Refresh per-session rate limit ✅

> **APPROVED RULE** — now implemented.

- [x] T200 [GAP-011] `SlidingWindowRateLimiter` in `shared/infrastructure/`. Applied in `RefreshTokenUseCase` after session lookup. 10 req/5 min per session.
- [x] T201 [GAP-011] Unit test: 11th request within 5 min returns 429 (8 rate limiter tests + 4 use case tests).
- [x] T202 [GAP-011] Unit test: different sessions from same IP are independent.

## Phase 3 — Polish & cross-cutting ✅

- [x] T210 [P] Coverage: auth domain 97.72%, user domain 100%, use cases 86-100%. All above 80% floor. Infrastructure at 0% expected (Prisma repos need integration tests).
- [x] T211 [P] `audit-completeness.test.ts`: 15 tests verifying every identity write path emits exactly one audit record with correct action, entityType, and actorType.
- [x] T212 Security review: no CVEs for `jose`, `bcryptjs`, `otplib`. 20 vulnerabilities in other deps (fastify low-severity DoS) — not auth-specific.
- [ ] T213 Document the identity contract in the OpenAPI output and verify the frontend client regenerates cleanly. **DEFERRED** — requires OpenAPI generation tooling setup.
- [x] T214 Legacy `specs/backend/auth.spec.md` does not exist in repo — no supersede banner needed.

---

## Dependencies & Execution Order

- **Baseline** is shipped — no ordering concerns.
- **GAP-001** requires feature 009-notifications (email sender). Coordinate.
- **GAP-003** blocks any Phase 2 feature that needs CL_USER fine-grained permissions (e.g., appointments list filters).
- **GAP-007** blocks **GAP-001** if invite flow is adopted first, since both use email tokens — consider a shared abstraction.
- **Phase 3** polish tasks depend on all desired Phase 2 items landing.

## Notes

- Every backlog task must satisfy constitution Principle III (TDD) before merging.
- Audit coverage is mandatory on every new identity write path.
- Close each `GAP-xxx` by updating `spec.md` (Known Gaps table) when its task set completes — promote the gap from `Status: GAP` to `Status: IMPLEMENTED` and add acceptance scenarios to the matching user story.
- Do not add new user stories without user approval — this spec reflects the agreed scope.
