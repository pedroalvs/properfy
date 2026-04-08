# Implementation Plan: Tenant Portal

**Branch**: `007-tenant-portal` | **Date**: 2026-04-05 | **Spec**: [spec.md](./spec.md)
**Feature Status**: IMPLEMENTED (Phase 1) — Phase 2/3 gaps tracked in [tasks.md](./tasks.md).

## Summary

Own the renter-facing surface for confirming and adjusting an upcoming inspection. Operators generate a unique tokenized link; the renter accesses a stateless portal without an account; every action is rate-limited, audited, and logged as an activity with IP + user agent. The feature is the only place in the platform where `actorType = ANONYMOUS` is valid in the audit log.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.

**Primary Dependencies**

- Backend: Fastify, Prisma, Zod, `@fastify/rate-limit`, shared `AuditService`. No pg-boss workers for renter actions (notifications are delegated via `CreateNotificationUseCase`); a background worker `expire-tokens.worker.ts` handles stale token cleanup.
- Cross-module ports: `IAppointmentRepository` (006), `IServiceTypeRepository` (004), `IInspectionExecutionRepository` (inspector-execution), `ITenantRepository` (002), `CreateNotificationUseCase` (009).
- Shared: Zod schemas and enums in `packages/shared/src/schemas/tenant-portal.ts`.
- Web: React + Vite pages under `apps/web/src/features/tenant-portal/` (renter-facing; no JWT, uses token in URL path).

**Storage**

- PostgreSQL (Supabase). Tables: `tenant_portal_tokens`, `tenant_portal_activities`, plus writes into `appointments`, `appointment_contacts`, `appointment_restrictions` (owned by feature 006) and `audit_logs` (feature 011).

**Testing**

- Unit: Vitest — every use case, the `TokenService` (including DST edge cases — GAP-010), the portal middleware.
- Integration: Supertest + real Postgres — every route. Token lifecycle tests (ACTIVE → EXPIRED, revocation cascade on reschedule). Rate limit tests.
- Frontend: Vitest + RTL for renter-facing pages including expired/revoked states.

**Target Platform**: Backend on Fly.io. Web on static CDN (renter portal runs at a public URL without JWT).
**Project Type**: Monorepo — backend API + web SPA + shared package.
**Performance Goals**: Portal GET p95 < 200 ms (mobile network users). Mutations p95 < 400 ms (dominated by audit + notification enqueue).
**Constraints**: Stateless — no cookies, no client sessions. Raw tokens never persisted or logged. Rate limit 30/min per client on every endpoint.
**Scale/Scope**: Phase 1 target: thousands of concurrent renters per day, few active tokens per appointment (should always be 0 or 1).

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | Module split into `domain/`, `application/`, `infrastructure/`, `interfaces/`. `TokenService` lives in `domain/` as a stateless helper. Middleware is in `interfaces/` because it is a framework concern. Cross-module reads go through ports. |
| II. Multi-Tenant Safety | PASS | The portal is intentionally token-scoped to a single appointment — it does not expose a "tenant context" in the usual sense. Cross-tenant reads are impossible because tokens encode the appointment id. AM/OP token generation scopes the appointment lookup by the operator's own tenant (AM bypasses). |
| III. Test-Driven Development | PARTIAL | Unit and integration coverage present. DST transition tests are a known gap (GAP-010). Verify 80%+ coverage during review. |
| IV. Contract-First APIs | PASS | Zod schemas in `packages/shared/src/schemas/tenant-portal.ts` are authoritative. Human projection in [contracts/](./contracts/). |
| V. Simplicity & Minimal Impact | PASS | The feature does one thing well. Six use cases mapped to six endpoints. `TokenService` is ~50 lines. No speculative abstractions. |
| VI. State Machine Sovereignty | PASS | This feature does NOT mutate `appointment.status` directly. It only writes `tenantConfirmationStatus`, `scheduledDate`, `timeSlot`, `contact`, and restrictions — tenant-facing fields owned by the appointment entity but not part of its status machine. Reviewers should reject any future change that adds a status transition from here — the correct path is through feature 006. |

**Gate result**: PASS for Phase 1 as implemented.

## Project Structure

### Documentation (this feature)

```text
specs/007-tenant-portal/
├── spec.md
├── plan.md
├── data-model.md
├── contracts/
│   ├── README.md
│   └── portal-endpoints.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/backend/
├── prisma/schema.prisma                                 # TenantPortalToken, TenantPortalActivity, TenantPortalTokenStatus, TenantPortalAction
└── src/
    └── modules/
        └── tenant-portal/
            ├── domain/
            │   ├── tenant-portal-token.entity.ts
            │   ├── tenant-portal-token.repository.ts     # port
            │   ├── tenant-portal-activity.entity.ts
            │   ├── tenant-portal-activity.repository.ts  # port
            │   ├── tenant-portal.errors.ts
            │   └── token.service.ts                      # generateRawToken, hashToken, computeExpiresAt
            ├── application/
            │   └── use-cases/
            │       ├── generate-portal-token.use-case.ts   # operator
            │       ├── get-portal-data.use-case.ts         # renter GET
            │       ├── confirm-appointment.use-case.ts
            │       ├── reschedule-request.use-case.ts
            │       ├── update-contact.use-case.ts
            │       └── report-unavailability.use-case.ts
            ├── infrastructure/
            │   ├── prisma-tenant-portal-token.repository.ts
            │   ├── prisma-tenant-portal-activity.repository.ts
            │   └── workers/
            │       └── expire-tokens.worker.ts             # scheduled sweep
            └── interfaces/
                ├── tenant-portal.routes.ts                 # 5 renter routes + 1 operator route
                └── portal-token-middleware.ts              # token → portalContext

apps/web/src/features/tenant-portal/                        # renter-facing pages (no JWT)
packages/shared/src/schemas/tenant-portal.ts

apps/backend/tests/
├── unit/tenant-portal/
└── integration/tenant-portal/
```

**Structure Decision**: Single Clean-Architecture module under `apps/backend/src/modules/tenant-portal/`. The web side is unusual: the renter pages live under a dedicated feature folder and do NOT use the standard auth provider — they consume the token from the URL path directly.

## Cross-Feature Dependencies

- **Feature 001-identity-access** — Only for operator token generation (AM/OP via JWT). Renter endpoints bypass JWT entirely and use the portal token middleware.
- **Feature 002-tenants-branches** — Reads `ITenantRepository` to fetch the tenant timezone for expiry computation. Blocked by `002#GAP-002` for per-tenant cutoff policy (GAP-007 here).
- **Feature 004-service-catalog** — Reads `IServiceTypeRepository` to enforce the `ROUTINE`-only reschedule rule.
- **Feature 006-appointments** — Writes `tenantConfirmationStatus`, `scheduledDate`, `timeSlot`, `contact`, and restrictions on appointments via `IAppointmentRepository`. Does NOT call `ExecuteStatusTransitionUseCase`. Cross-feature handoff contract is formalized by GAP-001 (matching 006#GAP-003).
- **Feature 008-inspector-execution** — Reads `IInspectionExecutionRepository` to block reschedule when an execution is already in progress.
- **Feature 009-notifications** — Calls `CreateNotificationUseCase` directly to send the portal link (EMAIL + SMS). Will migrate to typed domain events under GAP-002 (depends on 002#GAP-005).
- **Feature 011-reports-audit** — Consumes the audit records. This feature is the only caller that writes `actorType = ANONYMOUS`.

## Security & Operational Notes

- **Raw tokens are return-once**: the `GeneratePortalTokenUseCase` returns `rawToken` to the caller once. The database stores only the SHA-256 hash. No code path should ever log, return, or forward the raw token after that.
- **Middleware re-hashes on lookup**: every incoming request to a portal endpoint re-hashes the URL parameter for DB lookup. The `token_hash` column has a unique index.
- **Token expiry cutoff** is 7 PM on the day before the scheduled date in the tenant's timezone. Computed via `Intl.DateTimeFormat` to handle DST — reviewers touching `computeExpiresAt` must add fixture-based tests for both DST transitions (GAP-010).
- **Restricted mode for expired tokens** (not fully "read-only"): the GET endpoint loads an expired token so the renter sees context. Confirm, reschedule, and contact update reject with `PORTAL_ACTION_BLOCKED`. **Exception**: `POST /unavailable` is permitted after cutoff as a late emergency signal (`Source: dossier — regras-negocio:241-243`), flagged as `urgentMode = true`, triggering immediate operator/inspector notification. The portal does not decide the appointment's final outcome — `OP/AM` triages.
- **Rate limit 30/min per IP**: enforced via `@fastify/rate-limit` config on every endpoint. Tight enough to discourage scraping without impeding legitimate use.
- **`last_accessed_at` telemetry**: updated on every successful middleware lookup. Useful for analytics; not yet exposed (GAP-009).
- **Anonymous audit records**: this feature is the only caller writing `actorType: 'ANONYMOUS'`. Audit consumers (feature 011) must handle this actor type.
- **DST correctness**: the current `computeExpiresAt` implementation uses `Intl.DateTimeFormat` to measure the UTC offset at the candidate instant, then adjusts. It works but is subtle. Treat changes here as high-risk.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Separate `tenant_portal_activities` table alongside `audit_logs` | Activities carry IP + user agent + previous/new snapshots at a finer grain than audit logs and are exposed to renters (indirectly) and to support staff. Mixing them into the shared audit table would overload that schema. | Single-table approach would force the audit table to grow renter-side columns and complicate retention policies. |
| Restricted mode for EXPIRED tokens (not fully read-only) | Renters need to see what happened after their link expired AND report late unavailability as an emergency exception (dossiê-mandated). Blocking all mutations would prevent the late emergency signal. | Full read-only would block the unavailability exception required by the dossiê. |
| Cutoff expiry in local-time 7 PM day-before | Renters expect the deadline to land in local-time evening, not at midnight UTC. | A simple `scheduledDate - 12h` rule would drift across DST and timezones. |
| Middleware at the route level (not a global plugin) | Only portal routes use portal tokens; the rest of the app uses JWT auth. Registering globally would conflict with JWT middleware on other routes. | A global plugin would need a "skip" list that drifts when routes are added. |

Phase 1 deviations above are justified. Phase 2 items introducing new abstractions must add rows here.

## Execution Strategy

> Detailed task definitions in [`tasks.md`](./tasks.md).

### Phase 2 — Gap Closure

#### Wave 1: Quick Fixes + Independent Items (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 1a | GAP-001 — Reschedule handoff | T100–T103 | Mirrors 006#GAP-003 (already done). Migrate portal to use it. |
| 1b | GAP-005 — Portal activity export | T140–T143 | Simple read endpoint. No dependencies. |
| 1c | GAP-010 — DST correctness tests | T190–T191 | Tests only. No code changes expected. |

#### Wave 2: Events + Token Improvements (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 2a | GAP-002 — Domain events | T110–T113 | Emit typed portal events via DomainEventBus. |
| 2b | GAP-003 — Token replay detection | T120–T122 | Security improvement. |
| 2c | GAP-004 — Auto-generate token on reschedule | T130–T132 | UX fix. |

#### Wave 3: Tenant Configuration (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 3a | GAP-007 — Configurable cutoff | T160–T162 | Uses tenant settings (002#GAP-002 done). |
| 3b | GAP-008 — Configurable reschedule window | T170–T172 | Same. |

#### Wave 4: UX + Telemetry (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 4a | GAP-006 — Expired token UX | T150–T151 | Frontend + notification. |
| 4b | GAP-009 — Telemetry dashboard | T180 | Report design doc. |

```
Wave 1:  GAP-001 ══╗
         GAP-005 ══╬══ (parallel)
         GAP-010 ══╝

Wave 2:  GAP-002 ══╗
         GAP-003 ══╬══ (parallel)
         GAP-004 ══╝

Wave 3:  GAP-007 ══╗
         GAP-008 ══╝ (parallel)

Wave 4:  GAP-006 ══╗
         GAP-009 ══╝ (parallel)
```
