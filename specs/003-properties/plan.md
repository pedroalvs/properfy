# Implementation Plan: Properties

**Branch**: `003-properties` | **Date**: 2026-04-05 | **Spec**: [spec.md](./spec.md)
**Feature Status**: IMPLEMENTED (Phase 1) — Phase 2/3 gaps tracked in [tasks.md](./tasks.md).

## Summary

Own the lifecycle of a real-estate property: structured address capture, tenant/branch scoping, asynchronous Mapbox-backed geocoding, address autocomplete, bulk import via XLSX/CSV with idempotency, and soft delete gated by open-appointment checks. Properties are the anchor for all appointment work.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.

**Primary Dependencies**

- Backend: Fastify, Prisma, Zod, pg-boss (geocode + import workers), Mapbox client, `@fastify/rate-limit`, `@fastify/multipart`, shared `AuditService`, `IJobQueue`, `IIdempotencyService`, `IReportStorageService` (Supabase Storage adapter reused from feature 011).
- Shared: Zod schemas, enums (`PropertyType`, `GeocodingStatus`), types.
- Web: React + Vite pages under `apps/web/src/features/properties/`.
- Cross-module domain ports: `IAppointmentChecker` (from feature 002-tenants-branches), `ITenantRepository`, `IBranchRepository` (read-only usage for validation).

**Storage**

- PostgreSQL (Supabase): tables `properties`, `property_imports`, audit records via `audit_logs`.
- PostGIS: `properties.coordinates` declared as `GEOMETRY(Point, 4326)` via `Unsupported(...)` — not populated in Phase 1 (GAP-003).
- Supabase Storage: import files under `imports/properties/<importId>/<filename>`.

**Testing**

- Unit: Vitest — 9 use-case test files in `apps/backend/tests/unit/property/`.
- Integration: Supertest against real Postgres — `apps/backend/tests/integration/property/property.routes.test.ts`. Uses stub Mapbox adapter (`StubGeocodingService`, `StubAddressLookupService`) to keep tests deterministic; the real `PrismaAppointmentChecker` is used for delete tests.
- Frontend: Vitest + React Testing Library for pages and components under `apps/web/src/features/properties/`.

**Target Platform**: Backend on Fly.io. Web on static CDN. PWA does not expose property management.
**Project Type**: Monorepo — backend API + web SPA + shared package.
**Performance Goals**: List and detail p95 < 300 ms. Create/update p95 < 250 ms (excluding geocoding, which is async). Geocode worker throughput: bounded by Mapbox rate limits; retries via pg-boss.
**Constraints**: All writes audited. Multi-tenant scoping enforced at use-case entry. Idempotency required on bulk import. Mapbox failures must not fail HTTP requests.
**Scale/Scope**: Phase 1 target: tens of thousands of properties per tenant, imports up to a few thousand rows per file.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | Module layered as `domain/`, `application/`, `infrastructure/`, `interfaces/`. Cross-module reads use domain ports (`IAppointmentChecker`, `ITenantRepository`, `IBranchRepository`) — no direct imports of foreign Prisma models. Workers live in `infrastructure/workers/`. |
| II. Multi-Tenant Safety | PASS | CL roles derive `tenant_id` from JWT only. AM/OP may cross tenants but must be explicit. Cross-tenant reads by CL return `PROPERTY_NOT_FOUND`, never leak existence. |
| III. Test-Driven Development | PARTIAL | Broad unit + integration coverage present, including worker-adjacent flows. Any Phase 2/3 change must ship with TDD. Verify 80%+ coverage on critical module during review. |
| IV. Contract-First APIs | PASS | Zod schemas in `packages/shared/src/schemas/property.ts` are authoritative. Error envelope uniform. Human-readable projection in [contracts/](./contracts/). |
| V. Simplicity & Minimal Impact | PASS | No speculative abstractions. Stub adapters exist specifically to support deterministic tests. Phase 2 additions must stay justified. |

**Gate result**: PASS for Phase 1 as implemented.

## Project Structure

### Documentation (this feature)

```text
specs/003-properties/
├── spec.md
├── plan.md
├── data-model.md
├── contracts/
│   ├── README.md
│   ├── property-endpoints.md
│   └── import-endpoints.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/backend/
├── prisma/schema.prisma                             # Property, PropertyImport, PropertyType, GeocodingStatus
└── src/
    └── modules/
        └── property/
            ├── domain/
            │   ├── property.entity.ts
            │   ├── property.repository.ts           # port
            │   ├── property-import.entity.ts
            │   ├── property-import.repository.ts    # port
            │   ├── geocoding.service.ts             # port (IGeocodingService)
            │   ├── address-lookup.service.ts        # port (IAddressLookupService)
            │   └── property.errors.ts
            ├── application/
            │   └── use-cases/
            │       ├── create-property.use-case.ts
            │       ├── get-property.use-case.ts
            │       ├── list-properties.use-case.ts
            │       ├── update-property.use-case.ts
            │       ├── delete-property.use-case.ts
            │       ├── geocode-property.use-case.ts
            │       ├── search-addresses.use-case.ts
            │       ├── import-properties.use-case.ts
            │       └── get-property-import-status.use-case.ts
            ├── infrastructure/
            │   ├── prisma-property.repository.ts
            │   ├── prisma-property-import.repository.ts
            │   ├── mapbox-geocoding.service.ts
            │   ├── mapbox-address-lookup.service.ts
            │   ├── stub-geocoding.service.ts
            │   ├── stub-address-lookup.service.ts
            │   └── workers/
            │       ├── geocode.worker.ts
            │       └── import-property.worker.ts
            └── interfaces/
                └── property.routes.ts

apps/web/src/features/properties/
├── pages/
├── components/
├── hooks/
└── types/

packages/shared/src/
├── enums/property.ts                                # PropertyType, GeocodingStatus
└── schemas/property.ts                              # createProperty, updateProperty, listPropertiesQuery, addressSuggestion

apps/backend/tests/
├── unit/property/                                   # 8 use case test files
└── integration/property/property.routes.test.ts
```

**Structure Decision**: Single Clean-Architecture module under `apps/backend/src/modules/property/`. All property-specific domain logic (including bulk import) is colocated here. Cross-cutting services (storage, idempotency, queue) come from `shared/` and are injected via ports. Mapbox adapters have stub twins so unit tests never call the real provider (NFR-004).

## Cross-Feature Dependencies

- **Feature 002-tenants-branches** — Property lookups validate `tenant.isActive()` and `branch.isActive()` via domain ports. Branch address fields (GAP-011 on 002) should eventually share a schema with property addresses (GAP-001 on this feature).
- **Feature 004-service-catalog** — Not a direct runtime dependency, but `ServicePriceRule` may scope by `branchId` that must reference the same branches used by properties.
- **Feature 006-appointments** — Primary consumer. Appointments reference `property_id`, read `property.rulesJson` for scheduling constraints (GAP-007), and produce the "open appointments" state that blocks property deletion. The `IAppointmentChecker` port implemented in feature 002 is reused here.
- **Feature 009-notifications** — No direct dependency, but appointment notifications include formatted property addresses — shape must stay stable.
- **Feature 011-reports-audit** — Writes audit records and owns `IReportStorageService` used for import file persistence.

## Security & Operational Notes

- **Import rate limit**: `POST /v1/properties/import` is capped at 5 requests/min per client. Exceeding it returns 429.
- **Import idempotency**: `Idempotency-Key` header required. Scope key is `'property.import'`; retention is 24 hours. Replaying with a different file is currently NOT detected — see GAP-006.
- **Mapbox provider**: credentials injected via environment. Failures are logged and swallowed at the adapter layer; the adapter falls back to no-op results for typeahead and to `FAILED` status for geocoding. Tests use stubs (`StubGeocodingService`, `StubAddressLookupService`) to keep CI deterministic.
- **PII**: address data is sensitive in some jurisdictions. Log redaction should strip full address from error logs.
- **PostGIS**: `coordinates` column declared but unused. Backfill and write path tracked as GAP-003; any future spatial query (e.g., feature 005 marketplace offer radius) depends on it.
- **Queue worker idempotency**: `property.geocode` job must be safe to replay. Current workers rely on `geocodingStatus` as the source of truth to decide whether to proceed.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Stub Mapbox adapters (`StubGeocodingService`, `StubAddressLookupService`) | Tests must run without network access and must be deterministic. | Inline mocks would duplicate stub logic in every test and drift from the real adapter's interface. |
| Bulk import uses a worker + idempotency service + storage service | Large imports cannot run inside a single HTTP request; failure isolation requires a job record. | A synchronous endpoint would time out on realistic file sizes and would not survive worker restarts. |
| `CreatePropertyUseCase` optional `tenantRepo` dependency | The module can function without a tenant repo in a stripped-down test harness (it just skips the active-tenant check). | Making it required would force every test to wire the full tenant module. Nonetheless, container wiring in production MUST pass the real `tenantRepo` — verify via integration tests. |

Phase 1 deviations above are justified by testability and operational needs. Phase 2 items that introduce new ports or abstractions must be justified under this table.

## Execution Strategy

> Detailed task definitions live in [`tasks.md`](./tasks.md). This section defines **ordering, dependencies, parallelization, and checkpoints**.

### Phase 2 — Gap Closure

#### Wave 1: Quick Wins + Unblocking (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 1a | GAP-001 — Shared address schema | T100–T105 | Already partially done (branchAddressSchema from 002). Extend to properties. Unblocks cross-feature consistency. |
| 1b | GAP-002 — Manual coordinate unlock | T110–T112 | Small use case change. Independent. |
| 1c | GAP-004 — Hard delete runbook | T130–T131 | Documentation only. No code risk. |

#### Wave 2: PostGIS + Geocoding (serial)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 2a | GAP-003 — PostGIS coordinates | T120–T124 | Write strategy + backfill + radius filter. Blocks service-group marketplace. |
| 2b | GAP-010 — Geocoding retry + DLQ | T190–T193 | Depends on stable geocoding flow. Best after GAP-003. |

#### Wave 3: Import Hardening (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 3a | GAP-005 — Batch audit for imports | T140–T142 | Independent. |
| 3b | GAP-006 — Idempotency payload verification | T150–T152 | Independent. |
| 3c | GAP-008 — Import error export | T170–T172 | Independent. |

#### Wave 4: Schema + Caching (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 4a | GAP-007 — rules_json schema | T160–T163 | Needs coordination with 006-appointments. |
| 4b | GAP-009 — Address autocomplete caching | T180–T182 | Independent infrastructure improvement. |

### Parallelization Summary

```
Wave 1:  GAP-001 ══╗
         GAP-002 ══╬══ (all parallel)
         GAP-004 ══╝

Wave 2:  GAP-003 → GAP-010 (serial)

Wave 3:  GAP-005 ══╗
         GAP-006 ══╬══ (all parallel)
         GAP-008 ══╝

Wave 4:  GAP-007 ══╗
         GAP-009 ══╝ (parallel)
```

### Implementation Checkpoints

#### Wave 1 Complete
- [ ] GAP-001: Property schemas use shared `branchAddressSchema` (or extended variant). Cross-feature consistency.
- [ ] GAP-002: Clearing manual coordinates resets to PENDING and enqueues geocode job.
- [ ] GAP-004: Hard-delete runbook written.

#### Wave 2 Complete
- [ ] GAP-003: `coordinates` PostGIS column populated on write. Radius filter on GET /v1/properties.
- [ ] GAP-010: Geocoding job retries with backoff. Failed jobs re-enqueued after cool-off.

#### Wave 3 Complete
- [ ] GAP-005: Batch-level audit record per completed import.
- [ ] GAP-006: Same idempotency key + different file → 409.
- [ ] GAP-008: CSV error export for imports.

#### Wave 4 Complete
- [ ] GAP-007: `propertyRulesSchema` validated on write.
- [ ] GAP-009: Address autocomplete cached and rate-limited.
