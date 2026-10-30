# Backend (Node.js API) – Guidance for Claude Code

This file gives you (Claude Code) concrete backend rules for the Properfy project.

- You are working inside **`apps/backend/`** of a monorepo.
- The root `CLAUDE.md` defines the **business domain, roles, multi-tenant rules, state machine and API contracts**.
- This file focuses on **Fastify, Clean Architecture, Prisma, pg-boss, auth, security and observability**.

You MUST:

- Respect the multi-tenant model and business rules defined in the root `CLAUDE.md`.
- Follow Clean Architecture strictly: domain → application → infrastructure → interfaces.
- Use **Zod** for input validation.
- Follow the project structure, naming and response patterns described here.

---

## 1. Tech stack

- **Runtime:** Node.js 24
- **Framework:** Fastify 4
- **Architecture:** Clean Architecture (monolith)
- **ORM:** Prisma 6
- **Database:** PostgreSQL (Supabase as infrastructure)
- **Connection pool:** PgBouncer
- **Queue:** pg-boss 9 (PostgreSQL-backed — no Redis required)
- **Auth:** Internal JWT (RS256 with `kid` rotation)
- **Validation:** Zod
- **Tests:** Vitest (unit/integration) + Supertest (API) + testcontainers (real PostGIS, `test:integration:db`)
- **Package manager:** pnpm
- **Commits:** Conventional Commits

Never change the core stack unless explicitly requested.

---

## 2. Development commands

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Lint
pnpm lint

# Typecheck
pnpm typecheck

# Generate Prisma client (required before typecheck/tests)
pnpm prisma:generate

# Create/apply a migration (dev)
pnpm prisma:migrate --name <migration_name>

# Validate the schema (CI also replays every migration twice on a fresh PostGIS DB)
pnpm exec prisma validate

# Unit / route-integration tests (default suite; excludes tests/integration/db)
pnpm test            # or test:unit / test:integration

# Real-database integration tests (testcontainers, serial)
pnpm test:integration:db

# Regenerate the OpenAPI spec (then `pnpm --filter shared generate:types`, or `pnpm generate:api` from the root)
pnpm generate:openapi

# Seed database
pnpm prisma:seed

# Build
pnpm build
```

---

## 3. Project layout

The backend follows Clean Architecture organized by domain modules:

```text
apps/backend/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── domain/           # Entities, value objects, interfaces
│   │   │   ├── application/      # Use cases, DTOs, validators
│   │   │   ├── infrastructure/   # Prisma repos, external services
│   │   │   └── interfaces/       # Fastify routes, controllers
│   │   ├── app-credential/
│   │   ├── appointment/
│   │   ├── audit/
│   │   ├── billing/
│   │   ├── contact/
│   │   ├── dashboard/
│   │   ├── fy/                     # Fy agent integration (API keys, webhooks)
│   │   ├── inspector/
│   │   ├── inspector-execution/
│   │   ├── integration/            # Integrations Hub (provider config, dynamic providers)
│   │   ├── notification/
│   │   ├── pricing-rule/
│   │   ├── property/
│   │   ├── rental-tenant-portal/
│   │   ├── report/
│   │   ├── satisfaction-survey/
│   │   ├── service-group/          # includes the marketplace routes (marketplace.routes.ts)
│   │   ├── service-region/
│   │   ├── service-type/
│   │   ├── tenant/
│   │   └── user/
│   ├── shared/
│   │   ├── domain/               # Errors, AuditService (audit.ts), requireTenantScope, idempotency, clock
│   │   ├── application/          # Unit of work (runInTransaction), domain event bus, tenant cron tick
│   │   ├── infrastructure/       # Prisma client, logger, pg-boss queue, metrics, circuit breaker, rate limiter
│   │   └── interfaces/           # Error handler, auth/api-key middleware, role guard, response helpers
│   └── main/
│       ├── server.ts             # Fastify server setup
│       ├── env.ts                # Zod-validated environment
│       ├── routes.ts             # Route registration
│       ├── plugins.ts            # Plugin registration
│       ├── container.ts          # Dependency injection setup
│       └── workers.ts            # pg-boss worker registration
├── prisma/
│   ├── schema.prisma
│   ├── migrations/             # squashed to `20260806000000_v1_baseline`; new ones `YYYYMMDDhhmmss_name` (`prisma migrate dev`)
│   └── seed.ts
├── tests/
│   ├── unit/
│   ├── integration/              # route-level tests (Supertest, in-memory/stubbed deps)
│   │   └── db/                   # real PostGIS via testcontainers — excluded from `pnpm test`, run with `pnpm test:integration:db`
│   ├── fixtures/
│   └── helpers/
└── ...
```

`tests/` is outside the backend `tsconfig` include, so `pnpm typecheck` does not type-check tests; a broken test wiring shows up only when the test runs.

**Convention per module (e.g., `appointment/`):**

- `domain/` – Entities, value objects, repository interfaces, domain events. **No external dependencies.**
- `application/` – Use cases (one class per use case), DTOs, Zod validators. Depends only on domain.
- `infrastructure/` – Prisma repositories, external service adapters. Implements domain interfaces.
- `interfaces/` – Fastify route handlers, request/response mapping. Calls use cases.

**Dependency rule:**

```text
interfaces → application → domain
infrastructure → domain (implements ports/interfaces)
```

When you add a new module, follow this same structure.

---

## 4. Clean Architecture rules

### Domain layer

- Pure business logic, no framework imports.
- Entities with behavior methods.
- Repository interfaces (ports).
- Domain events defined here.
- Value objects for complex types.

### Application layer

- One use case = one class with an `execute()` method.
- DTOs and Zod schemas for input/output.
- Orchestrates domain logic and infrastructure via interfaces.
- No direct Prisma, Fastify or pg-boss imports.

### Infrastructure layer

- Implements repository interfaces from domain.
- Prisma repositories, queue producers, storage adapters, notification adapters.
- External service clients (SMS, email, maps).

### Interfaces layer

- Fastify route definitions and handlers.
- Request parsing and validation (call Zod schemas from application).
- Response mapping.
- No business logic – just parse, validate, call use case, map response.

---

## 5. Authentication & authorization

### JWT model

- **Access token:** RS256 with `kid`, TTL `JWT_ACCESS_TOKEN_TTL_MINUTES` (default and all environments: 60 minutes).
- **Refresh token:** rotative, 10-day validity, stored in sessions table.
- Claims: `sub` (user id), `tenant_id` (null for AM, OP and INSP), `role`, `branch_id`, `inspector_id`, `sid` (session id). Mapped to `AuthContext` (`userId`, `tenantId`, `role`, …).

### Roles

| Role | Code | Scope |
|---|---|---|
| Admin Master | `AM` | Platform-wide |
| Operator | `OP` | Operational, cross-tenant |
| Client Admin | `CL_ADMIN` | Own tenant |
| Client User | `CL_USER` | Own tenant, configurable permissions |
| Inspector | `INSP` | Own schedule |
| Rental tenant | `TNT` | Portal token only |
| System | `SYS` | Jobs and automatic transitions (cross-tenant) |

### Rules

- 2FA mandatory for `AM` from first version.
- Password policy: min 8 chars + uppercase + lowercase + number + special + blacklist.
- Audit: login, failure, lock, revoke, refresh, password change.
- Rate limiting on auth endpoints: per-route `rateLimit` config in `auth/interfaces/auth.routes.ts` (see `docs/runbooks/auth-and-sessions.md`).

### Multi-tenant enforcement

1. Extract `tenantId` from JWT in middleware.
2. For tenant routes: **never** trust `tenantId` from request body/query – use JWT context.
3. Every repository method must scope by `tenantId`.
4. Cross-tenant roles (`AM`, `OP`, `SYS`) may read without a tenant predicate or target a tenant explicitly; resolve this with `requireTenantScope(actor, action)`, which throws for pinned roles without a tenant and for `INSP`/`TNT` on tenant-dispatching paths.
5. Never return or modify data of another tenant in tenant context.
6. Platform-scoped entities (no `tenant_id`; list in the root `CLAUDE.md` §7.1) are guarded by role and `inspectorId`, never by an absent tenant filter. Add the scoping integration test in the same PR as the entity.
7. Never return or audit the inspector's raw latitude/longitude to/for `CL_*` roles (root `CLAUDE.md` §7.9): expose distance, accuracy and flags only.

---

## 6. API conventions

- Style: REST, prefix `/v1`
- Success: direct response for single items; paginated with metadata for lists
- Pagination: `page`, `pageSize`, `sortBy`, `sortOrder` query params
- Error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": [{ "field": "email", "message": "Invalid email" }]
  }
}
```

- Error codes are domain-specific strings (e.g. `AUTH_FORBIDDEN`, `TENANT_SCOPE_REQUIRED`); the HTTP status comes from the error class in `shared/domain/errors.ts`: `ValidationError` 400, `UnauthorizedError` 401, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409, 422 (unprocessable), 429 (rate limit, with `retryAfter`), 503 (storage not configured), 500 otherwise.
- `request_id` mandatory on every request and job (via middleware)

### Status transition endpoint

```text
POST /v1/appointments/:appointmentId/status-transitions
Body: { targetStatus, reason? }
```

All state transitions go through this single endpoint.

---

## 7. Data model

See `prisma/schema.prisma` for complete entity definitions.

**Key conventions:**

- Database: `snake_case`
- Application: `camelCase`
- All business entities: `id`, `created_at`, `updated_at`
- Multi-tenant entities: `tenant_id` mandatory
- Soft delete: `deleted_at` for operational/cadastral entities
- Audit and financial entries are immutable

**Core entities** (authoritative list: `prisma/schema.prisma`):

- Tenancy and access: `Tenant`, `Branch`, `User`, `Session`, `ApiKey`, `IntegrationSetting`
- Inspectors: `Inspector`, `InspectorAvailabilitySlot`, `ServiceRegion`, `InspectorRegion`
- Catalog: `ServiceType`, `ServicePriceRule`, `Property`, `Contact`, `AppCredential`
- Appointments: `Appointment` (state machine), `AppointmentContact`, `AppointmentRestriction`, `AppointmentConfirmationCycle`, `AppointmentImport`, `ServiceGroup`
- Execution: `InspectionExecution` (start/finish with geolocation)
- Rental tenant portal: `RentalTenantPortalToken`, `RentalTenantPortalActivity`, `SatisfactionSurvey`
- Notifications: `Notification`, `NotificationAttempt`, `NotificationTemplate`, `NotificationConsent`
- Finance: `FinancialEntry`, `InspectorInvoice`
- Audit and compliance: `AuditLog` (+ archive, retention, legal hold), `DataSubjectErasureRequest`, `IdempotencyKey`, `Report`

**Key enums:**

- `appointment_status`: `DRAFT`, `AWAITING_INSPECTOR`, `SCHEDULED`, `REJECTED`, `CANCELLED`, `DONE`
- `rental_tenant_confirmation_status`: `PENDING`, `CONFIRMED`, `UNAVAILABLE`, `NO_RESPONSE`
- `notification_channel`: `EMAIL`, `SMS`
- `notification_status`: `PENDING`, `SENT`, `DELIVERED`, `FAILED`, `SKIPPED`, `SKIPPED_OPT_OUT`
- `financial_entry_type`: `TENANT_DEBIT`, `INSPECTOR_PAYOUT`, `REFUND`, `MANUAL_ADJUSTMENT`

### Configuration: platform vs. agency

- **Platform-wide settings** (thresholds, radii, weights, onboarding values that apply to every agency or to inspectors) go into **`PlatformSetting`**: one row per key, value validated by the typed registry in `packages/shared` (`PLATFORM_SETTINGS_REGISTRY`), read through the `IPlatformSettingsReader` port with a short cache, written only by AM/OP via `/v1/platform-settings/:key` with an audit entry (`platform_setting.updated`, `tenantId: null`). Reused by F04–F10; a feature adds configuration by appending one new key to the registry, never by repurposing an existing one. A setting write emits `platform_setting.updated.v1` (subscribe to react) and runs any key hook registered in `PLATFORM_SETTING_SAVE_HOOKS` (register to derive a field on save); neither requires editing `UpdatePlatformSettingUseCase`. Never add an env var or a hard-coded constant for a value the operation must tune.
- **Per-agency settings** stay in `tenants.settings_json`, validated by `tenantSettingsSchema` (`packages/shared/src/schemas/tenant.ts`); add new fields as optional so existing rows keep parsing. Example: `mapWindowDays` (1–90, default `MAP_WINDOW_DAYS_DEFAULT = 14`) — the default map period window.
- **`PATCH /v1/tenants/:id` RBAC & the `mapWindowDays` exception** (`update-tenant.use-case.ts`): AM edits any field; a tenant-pinned `CL_ADMIN` edits only its own tenant; **`OP` is cross-tenant but may write only `settings.mapWindowDays`** — the use case keeps an `OP_EXTRA_SETTINGS_KEYS` allowlist and rejects any top-level field or non-allowlisted settings key from OP with `Forbidden` (the RBAC matrix stays coarse: `tenant.update` with the per-key scope enforced here, not in the matrix). `mapWindowDays` is re-validated against the shared schema shape before the write. **Empty-PATCH guard:** after `findById` (so a missing tenant still 404s), if permission filtering leaves nothing to change the use case returns the current tenant unchanged — no update, no audit entry, no event.
- A per-inspector override, when a feature needs one, lives on the inspector record and falls back to the platform value.

---

## 8. State machine implementation

See `src/modules/appointment/domain/appointment-state-machine.ts` (`TRANSITION_RULES`) for the full transition table.

**Implementation rules:**

1. State machine logic lives in the `appointment` module's domain layer.
2. Use a transition validator that checks: current status → target status → actor permission → required reason.
3. Every transition MUST: validate tenant scope, check actor permissions, register audit log.
4. Side effects (notifications, financial entries, marketplace updates) are triggered via domain events in the application layer.

### Composing a transition into your own transaction

`ExecuteStatusTransitionUseCase` has two entry points:

- **`execute(input)`** — the default. Writes, then runs the side effects. Use it
  unless you have a transaction of your own.
- **`executeInTransaction(input, tx?)`** — the write phase only. Returns the
  output plus a `runAfterCommit()` handle. Use it when the transition has to
  commit or roll back together with your own writes; `runInTransaction`
  (`shared/application/unit-of-work.ts`) collects the handles via `defer` and
  flushes them once the outermost transaction commits.

Two rules that are easy to get wrong and fail silently:

1. **Pass `tx` to every read.** The transition's guards read `serviceGroupId`,
   `inspectorId` and `rentalTenantConfirmationStatus`. If your transaction wrote
   any of them and the read lands on the global client, it sees pre-write values
   and the transition fails with a misleading error. This is why
   `IAppointmentRepository.findById` takes a `tx`.
2. **Never pull the side effects into the transaction.** They mint and *revoke*
   portal tokens, enqueue pg-boss jobs over a different connection, and wake a
   `STATUS_TRANSITION` subscriber that writes to `service_groups` — the row a
   portal join holds `FOR UPDATE`. Awaiting them inside the transaction
   deadlocks until Prisma's 5s timeout; rolling back after them leaves effects
   that cannot be recalled.

Repositories follow the `type DbClient = PrismaClient | Prisma.TransactionClient`
+ `private db(tx?)` idiom (see `prisma-confirmation-cycle.repository.ts`). `tx` is
always the **last, optional** parameter so no existing call site shifts — which
also means a missed call site shows up as a failing test, never a type error,
because `tests/` is outside the backend `tsconfig` include.

**Service type confirmation rules:**

- `Routine Inspection`: requires tenant confirmation. T-1 rule applies.
- `Ingoing Inspection`: no tenant confirmation needed. `SCHEDULED` = operationally confirmed.
- `Outgoing Inspection`: no tenant confirmation needed. `SCHEDULED` = operationally confirmed.

**T-1 exceptions:** `key_required = true`, manual OP confirmation, Ingoing/Outgoing in `SCHEDULED`.

---

## 9. Queue and jobs (pg-boss)

- Technology: **pg-boss** (PostgreSQL-backed job queue — no Redis, no extra infra)
- Uses the same PostgreSQL database (Supabase). pg-boss manages its own `pgboss.*` schema tables.
- Job naming convention: `domain.action` (e.g., `notification.send`, `import.process`, `finance.close`)
- Internal events: versioned (e.g., `appointment.created.v1`)
- Workers: all `boss.work(...)` registrations live in `src/main/workers.ts` (one worker process per app instance), wrapped with `withJobMetrics`. Recurring jobs that run per agency use `shared/application/tenant-cron-tick.ts`.

**pg-boss usage pattern:**
```typescript
// Send a job
await boss.send('notification.send', { notificationId }, { retryLimit: 6, retryBackoff: true })

// Register a worker
await boss.work('notification.send', async (job) => { ... })

// Schedule a recurring job
await boss.schedule('notification.reminder', '0 8 * * *', {})
```

**Retry baseline:**

1. Immediate first attempt
2. Backoff: exponential (`retryBackoff: true`), approx sequence: `15s`, `45s`, `2min`, `5min`, `15min`
3. Max attempts: 6 (`retryLimit: 6`)
4. After limit: job state becomes `failed` in `pgboss.job` table → operational alert

**DLQ equivalent (pg-boss):**

- Failed jobs (state=`failed`) persist in `pgboss.job` per domain queue
- Alert on accumulation above configured limit (query `pgboss.job WHERE state='failed'`)
- Reprocessing: call `boss.resume(jobId)` only with idempotency active
- Retention: `deleteAfterDays: 30` (configurable per queue)

**Idempotency:**

- Required for: mass import/creation, offer acceptance, start/finish inspection, notifications, financial entries
- HTTP: `Idempotency-Key` header
- Jobs: unique `event_id` + operation type
- Same key + same payload → same result; same key + different payload → `409 Conflict`
- Persistence: idempotency table with `key`, `scope`, `status`, `result_ref`, `expires_at`

---

## 10. Integrations

### SMS/Email

- Providers: MobileMessage (SMS), Resend (email)
- Implement via adapter pattern (easy to swap providers)
- Circuit breaker on external calls
- Fallback: keep in `pending_retry` → DLQ on exhaustion

### Maps/Geocoding

- Provider: Mapbox
- Fallback: `GeocodingStatus` `PENDING` → `SUCCESS`/`FAILED` via the `property.geocode` and `property.geocode-retry` jobs; `MANUAL` when the user types lat/lng.
- `MAPBOX_ACCESS_TOKEN` is called server-to-server: it must have **no browser URL restriction**. It is a distinct credential from the frontend's `VITE_MAPBOX_TOKEN` (which is legitimately URL-restricted). A URL-restricted token used here fails every call with 403, since Mapbox's restriction checks the `Referer` header, which server-side requests never send.
- **Every coordinate written to the database comes from permanent geocoding** (`permanent=true`, Mapbox terms). Temporary geocoding (the default mode, and the address autocomplete in `mapbox-address-lookup.service.ts`) is for display only and must never be persisted. Clients never send autocomplete coordinates (`createPropertySchema` strips them; the web branch/property forms do not post them); the backend geocodes the address in permanent mode. A latitude/longitude in an **update** body is user input: stored as `MANUAL` only when it differs from the stored pair at 7 decimal places, otherwise the current status is kept (null/null on a non-`MANUAL` property, and incomplete pairs, are ignored — never `MANUAL` without a coordinate). A stored coordinate is permanent iff `geocoded_permanently_at` is set. If the account rejects permanent mode (`MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE`), store no coordinate, set `FAILED` with `geocoding_failure_code`, and do not re-enqueue (the retry sweep skips coded failures). The port `IGeocodingService.geocode(address, { mode })` defaults to `permanent`; `temporary` is display-only (autocomplete, connection test) and never persisted. An import-preview `found` verification carries `mode: 'permanent'`; a `found` without a mode (a pre-deploy preview) is committed as PENDING and re-geocoded. Branches geocode their address on save via the same port and store coordinates in `address_json` with a `branches.geocoded_permanently_at` marker. Shared helpers `formatGeocodingQuery`/`isSameGeocodingAddress` (`src/shared/domain/geocoding-address.ts`) and `geocodeWithTimeout`/`GEOCODE_SYNC_TIMEOUT_MS` (`src/modules/property/application/services/geocode-with-timeout.ts`) are the geocoding query/timeout contract reused by F01.

### Routing

- Provider: **Mapbox**, behind a routing port (`IRoutingService`, created by F04) with a haversine stub for tests, wired through the Integrations Hub `mapbox` config like geocoding.
- **Matrix** (`driving-traffic` up to 10 coordinates, `driving` above) is used **only to choose the stop order**. **Directions** (GA) computes the final ETAs and the geometry, **one call per leg with `depart_at`** = that leg's planned departure.
- **No beta APIs:** no Matrix `depart_at`, no Optimization API v2.
- **Server-side token only**, resolved per call from the Integrations Hub `mapbox` config (`IntegrationConfigResolver.getConfig('mapbox')`, stub when unset); `MAPBOX_ACCESS_TOKEN` is only the bootstrap default for that config, never read directly by adapters. Never expose it to the PWA — geometry reaches clients as GeoJSON from the backend.
- **Google is a measured exit, not an option.** Google Route Optimization's terms forbid using its output with a non-Google map, so switching means replacing the routing adapter **and** both route maps (PWA route and web Live Day) with Google Maps. It happens only if the measured ETA error (planned stop time vs. actual start) averages above 10 minutes over 30 days. Do not mix providers.

### Storage

- Provider: Supabase Storage (S3-compatible)
- Upload via signed URLs
- Validate MIME type and size on backend
- Fallback: mark `upload_failed`, allow retry

---

## 11. Observability

### Logging

- Structured JSON logs with fields: `timestamp`, `level`, `service`, `env`, `request_id`, `trace_id`, `tenant_id`, `user_id`, `route`, `method`, `status_code`, `duration_ms`
- Dev/staging: full logs to terminal
- Prod: errors and essential logs only to terminal
- **Never log secrets, passwords, tokens or credentials in clear text**

### Metrics

- API: latency (p50/p95/p99), error rate (4xx/5xx), throughput
- Workers/queue: queue size, message age, retries, failures, DLQ
- Notifications: sent, delivered, failed, avg delivery time

### Tracing

- OpenTelemetry for API and workers on critical flows
- Correlate `trace_id` with logs

### Alerts

- 5xx increase
- Latency above threshold
- Queue stopped/accumulated
- Continuous failure in external provider

---

## 12. Database & migrations

- ORM: Prisma
- Migrations: `prisma/migrations/`
- Strategy: expand/contract (never breaking changes directly)
- Migrations run in each Fly app's `release_command` (`prisma migrate deploy`): DEV (from `develop`) first, then STAGING, then PROD. CI proves a fresh replay plus idempotence (`prisma-migrate-check`).

**Rules:**

- Do not change existing applied migrations.
- For schema changes, create new migrations.
- Respect multi-tenant model (tenant_id, foreign keys, unique constraints).
- Seed: minimal for `dev` and `staging`; none in `prod`.
- **Production notification templates**: after the first deploy to a new prod environment, run the one-shot seed script to create platform-default templates (`tenant_id = NULL`):
  ```bash
  fly ssh console -a properfy-api -C "cd /app && node apps/backend/dist/seed-platform-notification-templates.js"
  ```
  The script is idempotent (upserts by `template_code + channel`) and lives at `src/scripts/seed-platform-notification-templates.ts`. Production access only on explicit request.
- Critical indexes: `tenant_id`, `status`, `scheduled_date`, `service_type_id`, `inspector_id`, `branch_id`

---

## 13. Testing strategy (TDD)

- **Red-green-refactor mandatory per PR.**
- Unit tests: domain logic and use cases (Vitest)
- Integration tests: repositories, auth, queue, integrations (Vitest + Prisma test DB)
- API E2E: critical flows (Supertest)
- Mock external providers (SMS, email, maps) in tests. Never make real external calls.
- Coverage target (not enforced by CI today): 70% global, 80%+ for `auth`, `appointments`, `finance`

**Critical E2E flows:**

1. Service creation
2. Grouping/offer/acceptance
3. Tenant confirmation
4. Execution/finalization
5. Financial entry and notification

---

## 14. Security

- Application is **stateless** (no in-memory sessions).
- Secrets via `process.env` (managed by provider, no `.env` in staging/prod).
- Secret rotation: every 6 months for critical keys.
- Signed URLs for upload/download.
- Rate limit: hybrid policy (edge + application rules per endpoint).
- SAST and dependency scanning are **not wired into CI today** (no such job in `.github/workflows`). PRs get an automated review from CodeRabbit (`.coderabbit.yaml`). Do not claim a scan ran.

---

## 15. Conventions for Claude Code

When you (Claude Code) implement or refactor backend code:

1. **Respect Clean Architecture layers** – business logic in domain/application, never in interfaces.
2. **One use case per file** – keep use cases focused and testable.
3. **Use Zod for all validation** – define schemas in the application layer.
4. **Maintain multi-tenant safety** – always scope by `tenantId`.
5. **Write tests first** – TDD is mandatory.
6. **Use domain events** for cross-module side effects.
7. **Keep handlers thin** – parse, validate, call use case, map response.
8. **Don't introduce new patterns** without justification – reuse the existing module structure.
9. **Idempotency on critical operations** – always check before implementing financial, notification or acceptance logic.
10. **Audit critical actions** – status changes, financial operations, permission changes.

For complete business rules, entity definitions and API contracts, see the root `CLAUDE.md`, `prisma/schema.prisma` and `packages/shared/openapi.json`.
