# Implementation Plan: Identity & Access

**Branch**: `001-identity-access` | **Date**: 2026-04-06 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `/specs/001-identity-access/spec.md`

**Note**: Phase 1 is fully implemented on the active branch. This plan documents the existing architecture and defines the roadmap for Phase 2 (gap closure) and Phase 3 (polish).

## Summary

Identity & Access provides authentication (email + password + TOTP 2FA), session management (JWT + refresh token rotation), user CRUD with RBAC, and multi-tenant context extraction for every protected request. Phase 1 covers sign-in, refresh, logout, session management, TOTP for AM, password management, and user administration. Phase 2 closes 11 known gaps including self-service password reset, admin unlock, fine-grained CL_USER permissions, TOTP opt-in for non-AM roles, and per-session refresh rate limiting.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20
**Primary Dependencies**: Fastify, Prisma ORM, Zod, bcryptjs, jose (JWT RS256), otplib (TOTP), shared `AuditService`
**Storage**: PostgreSQL (Supabase). Tables: `users`, `sessions`. Enums: `UserRole`, `UserStatus`.
**Testing**: Vitest (unit), Supertest (integration). Coverage target: 80%+ (critical module).
**Target Platform**: Linux server (Fly.io staging/prod)
**Project Type**: Multi-tenant B2B SaaS backend API + web SPA + PWA
**Performance Goals**: Auth endpoints < 300 ms p95 (excluding bcrypt cost)
**Constraints**: Stateless JWT (RS256 with `kid` rotation), no Redis, pg-boss for async jobs
**Scale/Scope**: Multi-tenant with 5 user roles (AM, OP, CL_ADMIN, CL_USER, INSP) + 2 runtime actors (TNT, SYS)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | Modules follow `domain/` -> `application/` -> `infrastructure/` -> `interfaces/` with inward dependencies. Auth module: entities + ports in `domain/`, use cases + services in `application/`, Prisma repos + workers in `infrastructure/`, Fastify routes in `interfaces/`. User module follows the same pattern. |
| II. Multi-Tenant Safety | PASS | `tenant_id` on `users` (null only for AM). JWT carries `tenant_id` + `role`. Auth middleware populates `AuthContext`. Repositories scoped by tenant. RBAC in use cases. OP documented as tenant-scoped per constitution v1.2.0. |
| III. Test-Driven Development | PASS | Unit tests for every use case + service. Integration tests for routes. Schema validation tests in shared package. 80%+ coverage target for this critical module. |
| IV. Contract-First APIs | PASS | Zod schemas in `packages/shared/src/schemas/{auth,user}.ts`. Routes derive from schemas. Contracts documented in `contracts/{auth-endpoints,user-endpoints}.md`. |
| V. Simplicity and Minimal Impact | PASS | No speculative abstractions. Clean separation between auth (authentication) and user (administration) modules. |

**Post-Phase 1 re-check**: All gates pass. No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/001-identity-access/
├── plan.md              # This file
├── research.md          # Phase 0 output (decisions and rationale)
├── data-model.md        # Phase 1 output (User, Session entities)
├── quickstart.md        # Phase 1 output (getting started guide)
├── contracts/           # Phase 1 output
│   ├── README.md
│   ├── auth-endpoints.md
│   └── user-endpoints.md
└── tasks.md             # Phase 2 output (baseline + open backlog)
```

### Source Code (repository root)

```text
apps/backend/src/modules/
├── auth/
│   ├── domain/
│   │   ├── user.entity.ts
│   │   ├── session.entity.ts
│   │   ├── user.repository.ts          # Port
│   │   ├── session.repository.ts       # Port
│   │   ├── auth.errors.ts
│   │   └── password-policy.ts
│   ├── application/
│   │   ├── use-cases/
│   │   │   ├── login.use-case.ts
│   │   │   ├── refresh-token.use-case.ts
│   │   │   ├── logout.use-case.ts
│   │   │   ├── list-sessions.use-case.ts
│   │   │   ├── revoke-session.use-case.ts
│   │   │   ├── change-password.use-case.ts
│   │   │   ├── setup-totp.use-case.ts
│   │   │   ├── confirm-totp.use-case.ts
│   │   │   └── get-me.use-case.ts
│   │   ├── services/
│   │   │   ├── jwt.service.ts
│   │   │   └── totp.service.ts
│   │   ├── dtos/
│   │   │   ├── login.dto.ts
│   │   │   ├── refresh.dto.ts
│   │   │   └── change-password.dto.ts
│   │   └── constants/
│   │       └── common-passwords.ts
│   ├── infrastructure/
│   │   ├── prisma-user.repository.ts
│   │   ├── prisma-session.repository.ts
│   │   ├── totp-encryption.service.ts
│   │   └── workers/
│   │       └── cleanup-sessions.worker.ts
│   └── interfaces/
│       └── auth.routes.ts
├── user/
│   ├── domain/
│   │   ├── user-management.repository.ts   # Port
│   │   └── user-management.errors.ts
│   ├── application/
│   │   └── use-cases/
│   │       ├── create-user.use-case.ts
│   │       ├── get-user.use-case.ts
│   │       ├── list-users.use-case.ts
│   │       ├── update-user.use-case.ts
│   │       ├── deactivate-user.use-case.ts
│   │       └── reset-user-password.use-case.ts
│   ├── infrastructure/
│   │   └── prisma-user-management.repository.ts
│   └── interfaces/
│       └── user.routes.ts

apps/backend/tests/
├── unit/
│   ├── auth/                    # 13 test files
│   │   ├── login.use-case.test.ts
│   │   ├── refresh-token.use-case.test.ts
│   │   ├── logout.use-case.test.ts
│   │   ├── change-password.use-case.test.ts
│   │   ├── setup-totp.use-case.test.ts
│   │   ├── confirm-totp.use-case.test.ts
│   │   ├── get-me.use-case.test.ts
│   │   ├── revoke-session.use-case.test.ts
│   │   ├── jwt.service.test.ts
│   │   ├── totp.service.test.ts
│   │   ├── password-policy.test.ts
│   │   ├── auth-rate-limit.test.ts
│   │   └── auth-middleware.test.ts
│   └── user/                    # 4 test files
│       ├── create-user.use-case.test.ts
│       ├── list-users.use-case.test.ts
│       ├── update-user.use-case.test.ts
│       └── reset-user-password.use-case.test.ts

packages/shared/src/
├── schemas/
│   ├── auth.ts          # login, refresh, changePassword schemas
│   └── user.ts          # createUser, updateUser, resetPassword, listUsersQuery
├── enums/
│   └── user.ts          # UserRole, UserStatus
└── types/
    └── auth.ts          # JwtPayload, AuthContext

apps/web/src/features/auth/   # LoginPage, auth-storage, silent refresh
apps/pwa/src/features/auth/   # Inspector auth flow
```

**Structure Decision**: Two backend modules (`auth` for authentication, `user` for administration) following Clean Architecture with strict layer separation. Shared schemas, types, and enums in `packages/shared`. Frontend auth features in `apps/web` and `apps/pwa`.

## Complexity Tracking

No constitution violations. No complexity justifications needed.

## Execution Strategy

> Detailed task definitions live in [`tasks.md`](./tasks.md). This section defines **ordering, dependencies, parallelization, and checkpoints** — not task-level detail.

### Phase 2 — Gap Closure

#### Wave 1: Approved Rules + Quick Wins (serial prerequisites first, then parallel)

These are either binding business rules that should already be implemented, or small-scope items that unblock later work.

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 1a (serial) | GAP-009 — Blacklist on create & admin reset | T180 | **APPROVED RULE.** Audit-only — may already be implemented. Quick verification or one-line fix. Zero risk, zero dependencies. Ship first to close a compliance gap. |
| 1b (serial) | GAP-011 — Refresh per-session rate limit | T200–T202 | **APPROVED RULE.** Self-contained change in refresh route/middleware. No schema migration. No cross-feature impact. |
| 1c (parallel with 1b) | GAP-002 — Admin manual unlock | T110–T112 | Small scope (one use case + route + tests). No dependencies. Can run in parallel with GAP-011. |

**Why this order**: Closes all three approved-but-unimplemented rules first. These are compliance debts, not enhancements. GAP-009 is likely a one-task verification. GAP-011 and GAP-002 are independent and can run in parallel.

#### Wave 2: Self-Service Auth Foundation (serial)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 2 | GAP-001 — Self-service forgot password | T100–T107 | Establishes the email-token infrastructure (token entity, hashing, pg-boss email job). **Depends on**: feature 009-notifications for email delivery. **Blocks**: GAP-007 (invite flow reuses the same token pattern). |

**Why serial**: This is the largest single gap (8 tasks). It introduces a new entity (`PasswordResetToken`), a Prisma migration, and a cross-feature dependency on 009-notifications. It must land and stabilize before the invite flow builds on top of it.

#### Wave 3: Permission System (serial, high-impact)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 3 | GAP-003 — CL_USER fine-grained permissions | T120–T125 | **APPROVED RULE.** Highest cross-feature impact — blocks multiple Phase 2 features in other modules (appointments list filters, report access, etc.). Requires a design doc (T120) before implementation. |

**Why serial**: The permission model (storage, enforcement API, JWT/AuthContext propagation) is an architectural decision that ripples across every module. The design doc (T120) must be approved before any implementation tasks begin. Other modules cannot close their own permission-dependent gaps until this lands.

**Dependency note**: Does not depend on Wave 1 or Wave 2. Could theoretically start earlier, but the design doc (T120) should be written early and reviewed while Wave 1/2 are executing. Implementation (T121–T125) follows after design approval.

#### Wave 4: UX Enhancements (parallel)

These are independent improvements with no cross-dependencies.

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 4a (parallel) | GAP-004 — TOTP opt-in for non-AM roles | T130–T132 | Extends existing TOTP use cases. No schema migration. No cross-feature impact. |
| 4b (parallel) | GAP-006 — Password history | T150–T152 | New table (expand-only migration). Enforced on existing password write paths. Independent. |
| 4c (parallel) | GAP-008 — Soft-delete email reuse | T170–T172 | Requires a decision (T170) then a migration. Independent of other gaps. |

**Why parallel**: All three touch different code paths with no overlap. They can be developed, reviewed, and merged independently.

#### Wave 5: Invite Flow (serial, depends on Wave 2)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 5 | GAP-007 — Admin invite flow | T160–T164 | Replaces admin-set initial password with email invite. **Depends on**: GAP-001 (email-token infrastructure). Reuses token generation, hashing, and verification patterns from forgot-password. |

**Why last in functional gaps**: This is the only gap with a hard dependency on another gap (GAP-001). It also deprecates the current create-user flow, which requires a migration period and user confirmation (T163). Lower urgency than permission system or compliance fixes.

#### Wave 6: Security Hardening (parallel, after Waves 1–5)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 6a (parallel) | GAP-005 — Device/session trust signals | T140–T143 | Adds geo/ASN capture, anomaly detection, step-up auth. Depends on stable session management (no changes pending from earlier waves). |
| 6b (parallel) | GAP-010 — Key rotation runbook + alerting | T190–T192 | Operational hardening. No code dependencies — a runbook, a metric, and a smoke test. Can run anytime but best after all auth code changes have landed. |

### Parallelization Summary

```
Wave 1:  GAP-009 ──→ GAP-011 ═══╗
                      GAP-002 ═══╝ (parallel)

Wave 2:  GAP-001 (serial, 8 tasks, depends on 009-notifications)

Wave 3:  GAP-003 design doc ──→ GAP-003 implementation
         (design doc can start during Wave 1/2)

Wave 4:  GAP-004 ═══╗
         GAP-006 ═══╬═══ (all parallel)
         GAP-008 ═══╝

Wave 5:  GAP-007 (serial, depends on Wave 2)

Wave 6:  GAP-005 ═══╗
         GAP-010 ═══╝ (parallel, after Waves 1–5)
```

### Phase 3 — Polish & Cross-Cutting

Phase 3 tasks (T210–T214) are non-blocking for feature delivery. They should run after all Phase 2 waves land.

| Task | Category | Notes |
|------|----------|-------|
| T210 — Coverage verification | Hardening | Run `--coverage`, remediate gaps to hit 80%+ floor. Best done after all new code is written. |
| T211 — Audit record assertion | Hardening | End-to-end test that every identity write path emits exactly one audit record. Catches regressions from Phase 2 changes. |
| T212 — Dependency security audit | Security | `pnpm audit` + CVE check on `jose`, `bcryptjs`, `otplib`. Non-blocking but should happen before production release. |
| T213 — OpenAPI documentation | Cleanup | Ensure all identity routes are in the OpenAPI output and the frontend client regenerates cleanly. |
| T214 — Legacy spec supersede | Cleanup | Banner on old `specs/backend/auth.spec.md`. Deletion only after user confirmation. |

**Phase 3 is not gated on all Phase 2 waves completing.** T210 and T211 can run after each wave to catch issues incrementally. T212–T214 are best done once, at the end.

### Implementation Checkpoints

#### Wave 1 Complete

- [ ] GAP-009: `CreateUserUseCase` and `ResetUserPasswordUseCase` both reject common-password blacklist entries (verified by test).
- [ ] GAP-011: Per-session refresh rate limit enforced at 10 req/5 min. Integration test confirms per-IP and per-session limits are independent.
- [ ] GAP-002: AM/OP can unlock a locked user. Locked user can log in immediately after unlock.
- [ ] All three gaps updated to `Status: IMPLEMENTED` in `spec.md` Known Gaps table.

#### Wave 2 Complete

- [ ] GAP-001: Full forgot-password flow works end-to-end (request → email → reset → login with new password).
- [ ] Email template created and integrated with 009-notifications.
- [ ] Unknown-email requests return the same response shape and timing as known-email requests (no enumeration).
- [ ] Token reuse and expiry are rejected.

#### Wave 3 Complete

- [ ] GAP-003: Design doc approved by user.
- [ ] Permission enforcement works for at least one cross-feature use case (e.g., appointment list filtering by CL_USER permissions).
- [ ] `AuthContext` or equivalent carries permission data for downstream use cases.
- [ ] Existing RBAC tests updated to cover new permission checks.

#### Wave 4 Complete

- [ ] GAP-004: Non-AM users can enable TOTP via profile UI. Login enforces TOTP for opted-in users.
- [ ] GAP-006: Password change, admin reset, and forgot-password reset all reject last 5 passwords.
- [ ] GAP-008: Decision documented. Email reuse policy enforced consistently (test covers both soft-deleted and active user paths).

#### Wave 5 Complete

- [ ] GAP-007: New users receive an invite email instead of admin-set password.
- [ ] Invite token flow (generate → email → accept → set password) works end-to-end.
- [ ] Direct-password creation path deprecated (or behind a flag, per user decision on T163).

#### Wave 6 Complete

- [ ] GAP-005: Session creation captures geo/ASN. Anomaly heuristic fires on new-country login. Step-up auth triggers TOTP re-verification.
- [ ] GAP-010: Runbook written. Alert fires when previous key enters last 7 days of grace. Smoke test passes in staging.

#### Phase 3 Complete

- [ ] Coverage ≥ 80% for auth and user modules.
- [ ] Every identity write path emits exactly one audit record (assertion test passes).
- [ ] No high/critical CVEs in auth dependencies.
- [ ] OpenAPI output includes all identity routes. Frontend client regenerates cleanly.
- [ ] Legacy spec marked as superseded.
