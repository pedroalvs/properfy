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
│   │   ├── inspector-notice/        # F02-1: notices + Web Push + SMS fallback (platform-scoped)
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

### Inspector field events (F03-2)

Two inspector actions from the PWA, both `Idempotency-Key`-required and INSP-only:

```text
POST /v1/inspector/appointments/:appointmentId/cant-do    → 200  "Can't do this job"
POST /v1/inspector/appointments/:appointmentId/late-notice → 201  "Running late"
```

- **cant-do** records an `InspectorFieldEvent` (`CANT_DO`) and, in the same transaction, runs `SCHEDULED → REJECTED` as **SYS** with reason code `INSPECTOR_UNABLE` (`ReportCantDoUseCase`); the existing reject side effects (unlink group, release inspector, `INSPECTION_REJECTED_AGENCY` email) run on commit. After commit it also audits (`inspector_field_event.cant_do`), alerts every active OP/AM by email (`INSPECTOR_UNABLE_ALERT` via `NotifyInspectorUnableService`) and emits `inspector_field_event.recorded.v1`. A check-in open at the time is marked `abandoned_at` (all execution readers then treat it as not started; a later `start` restarts the same row). `INSPECTOR_UNABLE` is **system-assigned only** — `SYSTEM_ONLY_REJECTION_CODES`, enforced in `execute-status-transition.use-case.ts`.
- **late-notice** records a `LATE_NOTICE` event and returns a server-computed `estimatedArrivalAt = max(reference, effectiveNoticeAt) + minutesLate` (`ReportLateNoticeUseCase` + `domain/late-notice.ts`). `reference` is the published-plan stop start when one exists, else the booked window start, read through the `IPublishedStopStartReader` port — F03 registers `NullPublishedStopStartReader` (always window start); TASK-F04-2 wires the real adapter. Allowed only on the job's civil day (agency tz) and only before check-in. No transition, no notification.

Field activity is read back through the appointment module:

```text
GET /v1/appointments/:appointmentId/field-activity  → 200  execution + field events
```

Same tenant scope as `GET /v1/appointments/:appointmentId`, but **INSP has no access (403)**. Agency roles (`CL_ADMIN`/`CL_USER`) never receive the inspector's raw lat/lng — `GetAppointmentFieldActivityUseCase` omits the coordinate keys for them (only distances/accuracy/flags remain). The appointment list/detail flatten the latest `CANT_DO` onto `inspectorIssue` (one batched `DISTINCT ON` query per page, no N+1) for AM/OP/CL only — `GetAppointmentUseCase` returns it as `null` for an INSP actor, since it carries another inspector's name/id (the list use case already excludes INSP from its roles). The inspector's own appointment detail (PWA) carries `lastFieldIssue` only when the latest `CANT_DO` is the actor's own (D28). The rental-tenant portal refuses "change time" for a `REJECTED` + `INSPECTOR_UNABLE` appointment (`isPortalChangeTimeBlocked`, `rental-tenant-portal/domain/portal-statuses.ts`) — only operations re-offer it.

### Execution density map (F09-1)

```text
GET /v1/map/execution-density?fromDate&toDate[&tenantId][&inspectorId]  → 200  check-in density grid
```

Inspector **check-in** (`inspection_executions.start_latitude/longitude`) density aggregated into a fixed ~100 m grid (`EXECUTION_DENSITY_GRID_SCALE = 1000` cells/degree), in module `inspector-execution/` (route `execution-density.routes.ts`, container key `executionDensity`). **Tenant-scoped** — unlike the platform-scoped inspector entities — through the `appointments.tenant_id` join (`inspection_executions` has no `tenant_id`). AM/OP read platform-wide and may filter by `tenantId`/`inspectorId`; `CL_ADMIN`/`CL_USER` are pinned to their JWT tenant, have `tenantId` ignored and `inspectorId` rejected (403), and may only request the **7/30/90-day presets ending today-Sydney** (`isExecutionDensityPreset`; a non-preset is 400 `PERIOD_NOT_A_PRESET`). RBAC key `map.execution_density`; the role gate runs **before** `requireTenantScope` (which throws a 500-shaped error for INSP/TNT).

Privacy rules (do not regress):

- **Density never returns an individual coordinate.** Aggregation happens **in the SQL** (`PrismaExecutionDensityReader`); the port `ExecutionDensityReader` has no method returning raw rows/coordinates — do not add one or fetch-then-aggregate in memory. Each cell is the fixed **center** (`cellCenter`), never the mean. The response schema strips any undeclared cell key (second barrier).
- **Cell index by integer scaling:** `FLOOR(start_latitude * ${scale}::int)::int` in `numeric`, never `/ 0.001` (a JS float binds `float8` and misplaces grid-line points). The TS mirror `toCellIndex` (decimal-string integer math) must stay exact against the SQL (tests G5a/D16).
- **k-anonymity for CL:** cells with `< MIN_CELL_COUNT_CL (3)` check-ins are hidden (AM/OP use `MIN_CELL_COUNT_GLOBAL = 1`); the floor is chosen by **scope type** (pinned tenant → 3), applied in SQL `HAVING` and re-filtered in the use case. CL is restricted to the fixed presets because a per-query `HAVING` does not survive a window-difference attack; the residual risk (differencing the 7/30/90 presets reveals day-band aggregates, never a single day) is accepted and documented.
- **The layer measures check-ins recorded, not services completed:** a `DONE → REJECTED` (`DONE_REJECTED`) appointment and a reopened one both **count** (a reopened one counts once, at the original `started_at` cell). Abandoned (`abandoned_at` set) and soft-deleted appointments are excluded; `(0,0)`/out-of-range coordinates count only in `excludedWithoutCoordinates`.

No schema change, no migration (reads `abandoned_at` from F03-2). The web consumer is TASK-F09-2.

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
- Execution: `InspectionExecution` (start/finish with geolocation; `abandoned_at` for a post-check-in can't-do), `InspectorFieldEvent` (`CANT_DO` / `LATE_NOTICE`; has `tenant_id` of the appointment)
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
- `InspectorFieldEventType`: `CANT_DO`, `LATE_NOTICE` (reason/late enums + labels in `packages/shared/src/enums/field-events.ts`)
- `RejectionReasonCode` includes `INSPECTOR_UNABLE` (system-assigned only; `SYSTEM_ONLY_REJECTION_CODES`)

### Inspector notices (F02-1, module `inspector-notice/`)

`InspectorNotice`, `InspectorNoticeRecipient`, `InspectorPushSubscription` are **platform-scoped — no `tenant_id`** (the subject is the cross-tenant inspector; documented exception to §5.6 / root `CLAUDE.md` §7.1, with the scoping test in `tests/integration/db/inspector-notice.integration.test.ts`). Scope is by role (AM/OP publish/read across inspectors) and by JWT `inspectorId` (INSP box queries filter `inspector_id`).

- **Routes:** AM/OP `POST|GET /v1/inspector-notices`, `GET /v1/inspector-notices/:id`, `POST /v1/inspector-notices/:id/archive`; INSP `GET /v1/inspectors/me/notices(+/unread-count,/:id,/:id/read)`, `GET /v1/inspectors/me/push-config`, `POST /v1/inspectors/me/push-subscriptions(+/unsubscribe)` (10/min rate-limited). No edit/delete of a published notice (archive only).
- **Publish idempotency:** manual publish requires an `Idempotency-Key`, serialized with `pg_advisory_xact_lock` inside the tx (`repo.acquirePublishLock`) + `getWithHash`/`set(..., tx)`; audit + delivery enqueue run post-commit via `defer`.
- **Delivery (`inspector-notice.deliver`):** Web Push via `IPushSender` (`WebPushSender` when VAPID set, else `DisabledPushSender`); critical-only SMS fallback through `CreateNotificationUseCase` with platform template `INSPECTOR_NOTICE_SMS` (TRANSACTIONAL, `tenantId=null`, deterministic id so retries don't duplicate). `inspectors.push_enabled` = "has an active subscription" (recomputed on every subscription write; the F01 heartbeat no longer writes it). Deactivating an inspector revokes its subscriptions.
- **Internal contracts (no HTTP route):** `container.inspectorNotice.publishSystemInspectorNoticeUseCase` (F03/F04/F08; `critical` from the type, idempotent by `dedupeKey`, `targetPath` allowlisted by `INSPECTOR_NOTICE_TARGET_PATTERNS`) and `hasRecentSystemNoticeUseCase` (F08 7-day guard).
- **Jobs & env:** `inspector-notice.deliver`; cron `inspector-notice.delivery-sweep` (`*/5 * * * *`, pauses 22:00–06:00 Sydney); cron `inspector-notice.auto-archive` (`45 3 * * *`). Env: `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (optional; absent ⇒ SMS fallback only), `INSPECTOR_NOTICE_SMS_DAILY_CAP` (default 500, `none`=unlimited), `INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS` (default 30).

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
- Workers: all `boss.work(...)` registrations live in `src/main/workers.ts` (one worker process per app instance), wrapped with `withJobMetrics`. Recurring jobs that run per agency use `shared/application/tenant-cron-tick.ts`. Adding a worker means a new positional arg to `registerWorkers` — update its call site in `server.ts` AND the mock list in `src/main/__tests__/workers.test.ts` (plus its `EXPECTED_SCHEDULES`).
- F03 03.16 completion reminder: cron `inspection-execution.completion-reminder` (`*/15 * * * *`, Sydney) → `SendCompletionRemindersUseCase`. For each SCHEDULED job whose window closed today (agency tz) more than `fieldEvents.completionReminderMinutesAfterWindowEnd` ago without a check-out, it publishes a critical `COMPLETION_REMINDER` inspector notice through F02's `PublishSystemInspectorNoticeUseCase` (idempotent by `buildCompletionReminderDedupeKey`). Suppressed when the inspector is mid-job elsewhere; audited (`inspection.completion_reminder_sent`) only when F02 reports `created`. Body is locked-screen-safe (service code + address only).

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
- **SMS cost observability (F06-1):** every dispatched SMS logs `notification.sms_dispatched { notificationId, tenantId, templateCode, parts, encoding, length, truncated }` (no recipient, measured on the prepared body) and feeds `MetricsCollector.addSmsParts(templateCode, parts)` → `/metrics` `notification.smsPartsByTemplate` (L-F06-11). Email and provider-failure paths do neither.
- **New rental-tenant template codes (F06-1):** a customizable tenant-facing code is **one code with two channel rows** (EMAIL + SMS) like `TENANT_PORTAL_LINK` — **never an `_SMS` twin** (the `templateFamily()` fold in `notify-on-status-transition.handler.ts` would cross-suppress). The `TENANT_ETA_{MORNING,ON_THE_WAY,DELAY}` seeds live in `platform-notification-templates.ts`; SMS bodies are GSM-7 only (no en dash / apostrophe).
- **`UpsertNotificationTemplateUseCase` required-var guard (F06-1, L-F06-09):** a template whose code has `required` vars in the shared `TEMPLATE_VARIABLES` is rejected (`ValidationError` 400 `Missing required variables: …`, `field 'bodyHtml'`) when `subject + bodyHtml` omits one — the same `findTemplateVariableIssues` the web editor uses (only `missing` applied). So "never a notice without a time" holds for API-saved templates too.
- **`TENANT_ETA_*` are pinned OPERATIONAL (F06-1 D2/Q21):** the upsert forces these codes to `OPERATIONAL` and rejects any other `notificationClass` (`ValidationError`, `field 'notificationClass'`). A `TRANSACTIONAL` class bypasses consent (`isBlockedByConsent` returns early), so without this pin an operator — including a `CL_ADMIN` editing its own override — could reclassify an arrival-notice template and defeat the tenant's opt-out.
- **`CreateNotificationOutput.created` (F06-1):** `{ notificationId, created }` — `created: false` means the deterministic id already existed (no job enqueued), the dedupe signal F06-2's triggers rely on. No existing caller reads it.

### Tenant arrival-notice prediction & consent opt-out (F06-1, module `tenant-eta/`)

- **No sends, no migration** — this task only builds what TASK-F06-2 (triggers) and F05 consume. `domain/`: `computeEtaBand`/`formatEtaBand`/`wallTimeHHmm` (±30-min band, agency tz, GSM-7); `getTenantEtaNotificationId` (UUID v5, fixed namespace, dedupe by kind+appointment+date+channel); `ITenantEtaPlanReader` + `infrastructure/prisma-tenant-eta-plan.reader.ts` (`loadPlan`/`findPlanByInspectorDate`/`listSweepCandidates`, builds the shared `EtaPlanInput`/`EtaRealEvents` + a `stopMeta` confirmation map). Exposed as `container.tenantEta.planReader`.
- **Cross-tenant read exception (D9, §5.6 / root §7.1):** the reader deliberately reads a whole inspector plan (stops of several agencies) with no `tenant_id` filter, only to compute times; **no HTTP route returns the plan**, and F06-2 creates each notification with the appointment's own `tenant_id`. The scoping proof is `tests/integration/db/tenant-eta-plan.reader.integration.test.ts` (two agencies coexist; reassigned/deleted stops drop out).
- **`IInspectorFieldEventRepository.findLatestLateNoticeByAppointmentIds(ids, since)`** (DISTINCT ON, `type='LATE_NOTICE'`) feeds the predictor's D18 floor.
- **Manual AM/OP opt-out (L-F06-03):** `RecordConsentOptOutUseCase` + `POST /v1/notifications/consents/opt-out` (AM/OP, `assertTenantScope` like `…/:consentId/override`) writes an `operator_override` opt-out (reuses the existing enum — **no migration**), normalizing the recipient to match the send pipeline, which compares `notification.recipient` verbatim (E.164 phone — unparseable SMS is rejected; email trimmed and matched as-entered, never lowercased, since contacts are not lowercased) so it actually blocks. **Compliance stance:** arrival-time notices are factual-service `OPERATIONAL` messages with **no "reply STOP" footer**; the manual opt-out is the stop mechanism. Idempotent.

### Maps/Geocoding

- Provider: Mapbox
- Fallback: `GeocodingStatus` `PENDING` → `SUCCESS`/`FAILED` via the `property.geocode` and `property.geocode-retry` jobs; `MANUAL` when the user types lat/lng.
- `MAPBOX_ACCESS_TOKEN` is called server-to-server: it must have **no browser URL restriction**. It is a distinct credential from the frontend's `VITE_MAPBOX_TOKEN` (which is legitimately URL-restricted). A URL-restricted token used here fails every call with 403, since Mapbox's restriction checks the `Referer` header, which server-side requests never send.
- **Every coordinate written to the database comes from permanent geocoding** (`permanent=true`, Mapbox terms). Temporary geocoding (the default mode, and the address autocomplete in `mapbox-address-lookup.service.ts`) is for display only and must never be persisted. Clients never send autocomplete coordinates (`createPropertySchema` strips them; the web branch/property forms do not post them); the backend geocodes the address in permanent mode. A latitude/longitude in an **update** body is user input: stored as `MANUAL` only when it differs from the stored pair at 7 decimal places, otherwise the current status is kept (null/null on a non-`MANUAL` property, and incomplete pairs, are ignored — never `MANUAL` without a coordinate). A stored coordinate is permanent iff `geocoded_permanently_at` is set. If the account rejects permanent mode (`MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE`), store no coordinate, set `FAILED` with `geocoding_failure_code`, and do not re-enqueue (the retry sweep skips coded failures). The port `IGeocodingService.geocode(address, { mode })` defaults to `permanent`; `temporary` is display-only (autocomplete, connection test) and never persisted. An import-preview `found` verification carries `mode: 'permanent'`; a `found` without a mode (a pre-deploy preview) is committed as PENDING and re-geocoded. Branches geocode their address on save via the same port and store coordinates in `address_json` with a `branches.geocoded_permanently_at` marker. Shared helpers `formatGeocodingQuery`/`isSameGeocodingAddress` (`src/shared/domain/geocoding-address.ts`) and `geocodeWithTimeout`/`GEOCODE_SYNC_TIMEOUT_MS` (`src/modules/property/application/services/geocode-with-timeout.ts`) are the geocoding query/timeout contract reused by F01. **Legacy backfill (X02-2):** `src/scripts/regeocode-permanent.ts` re-geocodes legacy properties and branches in permanent mode, detects/restores false-`MANUAL` rows from the `property.updated` audit (two proofs: address unchanged in the transition + current pin within tolerance of a fresh permanent geocode), strips temporary coordinates from committed import `preview_json`, and bulk-resumes account-blocked rows (`--retry-failed-permanent`). It is **dry-run by default** and its execution is a gated OPS step (run only after X02-1 is deployed — see `docs/runbooks/regeocode-permanent.md`), never a recurring job. Its DB methods live on the script-scoped port `ILegacyRegeocodeRepository` (`modules/property/domain/legacy-regeocode.repository.ts`) implemented by `PrismaPropertyRepository` (reusing its `syncCoordinates`, so PostGIS stays consistent); every coordinate write is a compare-and-set on `updated_at`, and a `null` legacy result sets `geocoding_status = FAILED` + `geocoding_failure_code = 'LEGACY_PERMANENT_NO_RESULT'` while keeping the coordinate (an accepted residual). **F01-1 inspector base address:** `geocodeInspectorBase(geocoder, address, logger, clock)` (`modules/inspector/application/services/geocode-inspector-base.ts`) wraps that contract in permanent mode and never throws (`{lat,lng,geocodedAt}` or `{failed: 'no_results'|'error'|'timeout'|'permanent_unavailable'}`); the inspector create/OP-update/self-update use cases geocode the base **before** any write and a failure saves the address with null coordinates + `baseGeocodeFailed`. The geocoding port stays in `property/domain` (imported cross-module; not moved). The one-off `scripts/backfill-inspector-base-coords.ts` backfills existing addresses (dry-run offline; `--apply` CAS-writes, aborts if Mapbox unconfigured; `container.geocodingService` is exposed for it).

### Routing

- Provider: **Mapbox**, behind a routing port (`IRoutingService`) with a haversine stub for tests, wired through the Integrations Hub `mapbox` config like geocoding.
- **Routing engine (F04-1, module `day-plan/`).** `IRoutingService` (`domain/routing.service.ts`) + `MapboxRoutingService`/`StubRoutingService` (`infrastructure/routing/`) + `DynamicRoutingService` (in `integration/infrastructure/dynamic-providers.ts`, resolves the `mapbox` token per call). A shared Postgres token bucket `routing_rate_limit_buckets` (**no `tenant_id`** — platform infra like `cron_job_runs`; one bucket per profile, atomic `UPDATE … RETURNING` with `clock_timestamp()` serializes the two Fly machines, `PostgresRoutingRateLimiter`) caps the per-token/per-environment Mapbox rate (D16/D17). Kill switch env `DAY_PLAN_ROUTING_PROVIDER=mapbox|stub` (default `mapbox`, validated at boot) forces the stub without stopping the publication job; `metrics.recordRoutingProviderCall` adds `routingProviderFailuresByCode` to `/metrics` (L-F04-09). `PlanRouteService.compute` (`application/services/`, `container.dayPlan.planRouteService`) orchestrates matrix → pure optimizer (`@properfy/shared` `route-planning`) → final per-leg Directions pass (`depart_at` ≥ now+60 s; <10 m legs skip Directions) → geometry; interactive mode falls back to the stub with `approximate`, strict (job) mode throws `RoutingDeferredError`. TASK-F04-2 persists the plan (minus routing results since Plan B) and consumes this service. **Plan B (072/074): `compute` results are never persisted** — the read path recomputes **geometry only** on demand via `recomputeRoutingForRecord` (`application/recompute-routing.ts`, PRESERVE_ORDER, interactive+non-strict) / `ComputeDayPlanUseCase.routingFor`. **Directions-only GET (PR-C 074):** `resolveMatrix`'s `needsProviderMatrix` is `OPTIMIZE || forceProviderMatrix`, so PRESERVE_ORDER (the GET geometry recompute) no longer calls the Mapbox Matrix (stub-seeded timeline, overwritten by the per-leg Directions pass). `PlanRouteService.previewOrder` passes `forceProviderMatrix: true` and evaluates a candidate order on a fresh matrix (0 Directions, `etaSource 'MATRIX'`) for the preview endpoint.
- **19:30 publish job (F04-2, `day-plan/`).** `day-plan.publish` (`'30 * * * *'`, Sydney, singleton `teamSize/teamConcurrency 1` + `singletonKey`, `expireInMinutes 30`) is registered by `registerDayPlanPublishWorker` (`src/main/day-plan-publish.worker.ts`), not inline in `workers.ts`. The handler runs `tenantCronTick.runDue('day-plan.publish', 19, gate)` — the gate releases the `day-plan.publish` claim of any tenant whose T-1 (`appointment.reject-unconfirmed`) has not run yet via the read-only `ICronJobRunRepository.hasClaim` (TenantCronTick itself is unchanged) — then `PublishDayPlansUseCase.execute({ attempt, budgetMs: 25*60_000 })`. The due set is `repo.loadPublishDue()` (claims → `plan_date = local_date + 1`, pure `deriveDueInspectors`: every active agency claimed, not already published+notified). Processing is sequential: compute+`SCHEDULED_PUBLISH` publish, freeze published ETAs, send one critical `ROUTE_PUBLISHED` notice (F02, dedupe `route-published:{inspectorId}:{date}`). Attempts 1–2 defer on `RoutingDeferredError` (stop the batch, `continuation` → `boss.send({attempt+1}, startAfter 120)`); attempt 3 publishes approximate with an explicit reason. Kill switch env `DAY_PLAN_PUBLISH_ENABLED` (default `true`; `'false'` unschedules). `publish_completed` logs at `error` when approximate≠NO_PROVIDER or a deferral on attempt 3; `metrics.incrementDayPlansApproximate` adds `routing.dayPlansApproximateTotal` to `/metrics` (L-F04-09). `withJobMetrics` now lives in `src/main/with-job-metrics.ts` (shared by `workers.ts` and this worker).
- **Route sheet, metric & purge (F04-2, `day-plan/`).** The route sheet (`GET /v1/inspector/day-plans/:date/sheet` INSP 20/min, `GET /v1/day-plans/:inspectorId/:date/sheet` AM/OP 20/min; `?format=pdf|xlsx`, `csv`→400) recomputes through the same read use case as the GET (so INSP gets the L-F04-01 no-routing STALE clear), then `DayPlanSheetRenderer` (`infrastructure/day-plan-sheet.renderer.ts`) renders XLSX (shared `ExcelJsXlsxGenerator.generate(cols, rows, { sheetName, preamble })`, worksheet "Route") or PDF (`PdfKitDayPlanSheetGenerator`, built-in Helvetica → no font assets). Both formats share `buildDayPlanSheetRows` so they never drift. INSP downloads are limited to the last 30 days (`DAY_PLAN_SHEET_TOO_OLD`, AM/OP unlimited); each delivered sheet writes a `day_plan.exported` audit with **no** personal data (`{ format, date, stops, actorRole }`); times carry a short tz suffix (`08:00 AWST`) only when agencies differ; the filename slug transliterates the inspector name (NFKD) with an `inspector` fallback (L-F04-10). The "Route ETA accuracy" metric (`GET /v1/day-plans/eta-accuracy?days=7..90` AM/OP 60/min, `GetRouteEtaAccuracyUseCase`) is the mean absolute error between each stop's **frozen published** start and the actual check-in over a `days`-long window ending today (Sydney), dropping outliers >180 min and classifying `INSUFFICIENT_DATA`/`OK`/`ABOVE_THRESHOLD` against a 10-min threshold / 30-sample floor; the repo query (`getEtaAccuracySamples`) owns the published-vs-latest / approximate / abandoned / status-join exclusions (L-F04-15, FR-014). Static `/v1/day-plans/eta-accuracy` is registered so Fastify prefers it over `/:inspectorId/:date`. **Plan B (072) removed the `day-plan.purge-route-data` job**; **PR-C (074) dropped the four dead columns** (`route_geometry`, `routing_matrix_json`, `leg_travel_json`, `geometry_purged_at`; migration `20261107000000_drop_day_plan_route_columns`) and removed the transitional PR-A cleanup (`ClearStoredRouteDataUseCase`, `repo.clearStoredRouteData()`, the worker invocation and the one-time `boss.unschedule('day-plan.purge-route-data')`). `published_*` are untouched (the metric still reads them).
- **Plan B — no routing result persisted (072/073/074, `day-plan/`).** Routing results (geometry, matrix, per-leg durations) are **never written** to `day_plans`; **PR-C (074) dropped** the four dead columns and removed `routingInput` from the contract. `GET` responses recompute **geometry only** on demand via `recomputeRoutingForRecord` / `ComputeDayPlanUseCase.routingFor` (PRESERVE_ORDER, interactive+non-strict), **Directions-only** (no provider Matrix — `resolveMatrix` only calls Matrix for `OPTIMIZE` or when `forceProviderMatrix`); a degraded recompute (rate-limited/provider error) ORs `approximate`/`approximateReason` so the client never treats a stub line as real. Past-day GETs skip the recompute (geometry null); the AM/OP operator GET returns the stored record **without** calling Mapbox. `POST /v1/inspector/day-plans/:date/order/preview` (INSP, own `inspectorId`, 30/min, `PreviewDayPlanOrderUseCase` → `PlanRouteService.previewOrder` with `forceProviderMatrix: true`, `etaSource 'MATRIX'`, 0 Directions, persists nothing; 404 / 409 version-or-nothing-to-reorder / 400 `DAY_PLAN_ORDER_MISMATCH`) — **it serves a started day too**, reordering the not-started tail from the last executed stop (effective `LAST_STOP` origin), matching `PUT /order` (D18; F04-tarefas.md line 725/726). `PUT /order`/`recalculate`/`origin` recompute on demand. `routingInput`/`dayPlanRoutingInputSchema`/`toOptimizerInput`/`buildLegOverrides` are **removed** (PR-C); `DAY_PLAN_ALREADY_STARTED` now applies only to the **origin** endpoints (L-F04-07), not reorder/preview.
- **Route-weights preview (F04-2b, `day-plan/`).** `POST /v1/day-plans/preview` (AM/OP, 10/min, `PreviewRouteWeightsUseCase`) is an AM/OP what-if on the platform `routeWeights`: it computes two variants — `current` (saved `routeWeights` via `IPlatformSettingsReader`) and `proposed` (request weights) — for one inspector on one upcoming day over a **single shared travel matrix** (`PlanRouteService.previewWeights`: **1 Matrix call, 0 Directions**, matrix-only ETAs with forward slack, `etaSource 'MATRIX'`), persisting nothing. RBAC is in the use case (`assertRoles(['AM','OP'])`, action `day_plan.preview_weights` — a freeform audit label, not a role-matrix key). Guard order role→date-range→inspector: `date` outside today..today+14 **in the actor's effective tz** (`AuthContext.timezone ?? PLATFORM_TIMEZONE`) → `422 DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` before any routing; unknown inspector → `404 INSPECTOR_NOT_FOUND`. Origin = the inspector's geocoded base (→ none), never a saved override or `LAST_STOP`; executed stops excluded via `classifyStops`. Consumes the F04-2 shared contract (`previewRouteWeightsRequestSchema`/`routeWeightsPreviewResponseSchema`); no schema/migration. Static route — radix prefers it over `/:inspectorId/:date` (L-F04-14).
- **Inspector onboarding slice (F04-2, 00.2).** `inspectors.onboarding_completed_at` (`DateTime?`, no `tenant_id`) is stamped once by the heartbeat: `inspectorAppStateSchema.onboardingCompleted` (`z.literal(true).optional()`) flows through `RecordInspectorAppStateUseCase` into the single `$executeRaw` of `recordAppState()` as `CASE WHEN $onboardingCompleted THEN COALESCE(onboarding_completed_at, $now) ELSE onboarding_completed_at END` (R-F01-02, never a separate write). `GET /v1/inspectors/me` and the AM/OP detail return `onboardingCompletedAt`; `applyInspectorFieldVisibility` strips it for CL_* (visible to AM/OP and the inspector itself, like the base-address group).
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
