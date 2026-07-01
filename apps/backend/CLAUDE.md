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

- **Runtime:** Node.js
- **Framework:** Fastify
- **Architecture:** Clean Architecture (monolith)
- **ORM:** Prisma
- **Database:** PostgreSQL (Supabase as infrastructure)
- **Connection pool:** PgBouncer
- **Queue:** pg-boss (PostgreSQL-backed — no Redis required)
- **Auth:** Internal JWT (RS256 with `kid` rotation)
- **Validation:** Zod
- **Tests:** Vitest (unit/integration) + Supertest (API E2E)
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

# Generate Prisma client
pnpm prisma generate

# Run migrations (dev)
pnpm prisma migrate dev

# Create migration
pnpm prisma migrate dev --name <migration_name>

# Validate migration (dry-run for CI)
pnpm prisma migrate diff

# Seed database
pnpm prisma db seed

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
│   │   ├── tenant/
│   │   ├── user/
│   │   ├── property/
│   │   ├── appointment/
│   │   ├── service-group/
│   │   ├── marketplace/
│   │   ├── rental-tenant-portal/
│   │   ├── inspector-execution/
│   │   ├── notification/
│   │   ├── billing/
│   │   ├── report/
│   │   └── audit/
│   ├── shared/
│   │   ├── domain/               # Shared domain primitives
│   │   ├── application/          # Shared use case utilities
│   │   ├── infrastructure/       # Logger, queue, storage, auth middleware
│   │   └── interfaces/           # Error handler, response helpers, plugins
│   └── main/
│       ├── server.ts             # Fastify server setup
│       ├── routes.ts             # Route registration
│       ├── plugins.ts            # Plugin registration
│       └── container.ts          # Dependency injection setup
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── ...
```

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

- **Access token:** RS256 with `kid`, TTL 15 minutes.
- **Refresh token:** rotative, 10-day validity, stored in sessions table.
- Claims: `userId`, `tenantId` (nullable for AM), `role`, `email`.

### Roles

| Role | Code | Scope |
|---|---|---|
| Admin Master | `AM` | Platform-wide |
| Operator | `OP` | Operational, cross-tenant |
| Client Admin | `CL_ADMIN` | Own tenant |
| Client User | `CL_USER` | Own tenant, configurable permissions |
| Inspector | `INSP` | Own schedule |

### Rules

- 2FA mandatory for `AM` from first version.
- Password policy: min 8 chars + uppercase + lowercase + number + special + blacklist.
- Audit: login, failure, lock, revoke, refresh, password change.
- Rate limiting on auth endpoints (see `infra-tecnologia-production-ready.md` for limits).

### Multi-tenant enforcement

1. Extract `tenantId` from JWT in middleware.
2. For tenant routes: **never** trust `tenantId` from request body/query – use JWT context.
3. Every repository method must scope by `tenantId`.
4. Super Admin (AM) can specify tenant explicitly when needed.
5. Never return or modify data of another tenant in tenant context.

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

- Error codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500)
- `request_id` mandatory on every request and job (via middleware)

### Status transition endpoint

```text
POST /v1/appointments/:appointmentId/status-transitions
Body: { targetStatus, reason? }
```

All state transitions go through this single endpoint.

---

## 7. Data model

See `projeto-consolidado/modelo-dados-executavel.md` for complete entity definitions.

**Key conventions:**

- Database: `snake_case`
- Application: `camelCase`
- All business entities: `id`, `created_at`, `updated_at`
- Multi-tenant entities: `tenant_id` mandatory
- Soft delete: `deleted_at` for operational/cadastral entities
- Audit and financial entries are immutable

**Core entities:**

1. `Tenant` – agency account
2. `Branch` – agency branch
3. `User` – internal authenticated user
4. `Inspector` – contractor
5. `Property` – property linked to tenant
6. `Appointment` – central business entity (state machine)
7. `AppointmentContact` – tenant contact info
8. `AppointmentRestriction` – scheduling constraints
9. `ServiceType` – service catalog
10. `ServicePriceRule` – pricing per client/type
11. `ServiceGroup` – grouped inspections for marketplace
12. `InspectorAvailabilitySlot` – inspector schedule
13. `RentalTenantPortalToken` – portal access token
14. `Notification` – sent notification record
15. `InspectionExecution` – execution record with geolocation
16. `InspectionAsset` – evidence files
17. `FinancialEntry` – ledger entries
18. `InspectorInvoice` – inspector payment closing
19. `AuditLog` – audit trail

**Key enums:**

- `appointment_status`: `DRAFT`, `AWAITING_INSPECTOR`, `SCHEDULED`, `REJECTED`, `CANCELLED`, `DONE`
- `rental_tenant_confirmation_status`: `PENDING`, `CONFIRMED`, `UNAVAILABLE`, `NO_RESPONSE`
- `notification_channel`: `EMAIL`, `SMS`, `WHATSAPP`
- `notification_status`: `PENDING`, `SENT`, `DELIVERED`, `FAILED`
- `financial_entry_type`: `TENANT_DEBIT`, `INSPECTOR_PAYOUT`, `REFUND`, `MANUAL_ADJUSTMENT`

---

## 8. State machine implementation

See `projeto-consolidado/state-machine-executavel.md` for the full transition table.

**Implementation rules:**

1. State machine logic lives in the `appointment` module's domain layer.
2. Use a transition validator that checks: current status → target status → actor permission → required reason.
3. Every transition MUST: validate tenant scope, check actor permissions, register audit log.
4. Side effects (notifications, financial entries, marketplace updates) are triggered via domain events in the application layer.

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
- Dedicated workers for: `notifications`, `imports`, `finance`

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

- Providers: Twilio/Zenvia (SMS), Resend (email)
- Implement via adapter pattern (easy to swap providers)
- Circuit breaker on external calls
- Fallback: keep in `pending_retry` → DLQ on exhaustion

### Maps/Geocoding

- Provider: Mapbox
- Fallback: mark `pending_geocode` for manual correction

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
- Apply migrations to `staging` first, validate, then promote to `prod`

**Rules:**

- Do not change existing applied migrations.
- For schema changes, create new migrations.
- Respect multi-tenant model (tenant_id, foreign keys, unique constraints).
- Seed: minimal for `dev` and `staging`; none in `prod`.
- **Production notification templates**: after the first deploy to a new prod environment, run the one-shot seed script to create platform-default templates (`tenant_id = NULL`):
  ```bash
  fly ssh console -a properfy-prod -C "cd /app && node apps/backend/dist/seed-platform-notification-templates.js"
  ```
  The script is idempotent (upserts by `template_code + channel`) and lives at `src/scripts/seed-platform-notification-templates.ts`.
- Critical indexes: `tenant_id`, `status`, `scheduled_date`, `service_type_id`, `inspector_id`, `branch_id`

---

## 13. Testing strategy (TDD)

- **Red-green-refactor mandatory per PR.**
- Unit tests: domain logic and use cases (Vitest)
- Integration tests: repositories, auth, queue, integrations (Vitest + Prisma test DB)
- API E2E: critical flows (Supertest)
- Mock external providers (SMS, email, maps) in tests. Never make real external calls.
- Coverage: 70% global minimum, 80%+ for `auth`, `appointments`, `finance`

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
- SAST and dependency scan mandatory in CI.

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

For complete business rules, entity definitions and API contracts, consult `projeto-consolidado/`.
