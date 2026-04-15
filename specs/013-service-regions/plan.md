# Implementation Plan: Service Regions

**Branch**: `013-service-regions` | **Date**: 2026-04-06 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `/specs/013-service-regions/spec.md`

**Note**: Phase 1 CRUD and resolution are implemented but have 2 critical divergences (missing `tenant_id`, unscoped resolve query). This plan covers the correction work and Phase 2 gap closure.

## Summary

Service Regions is the canonical geographic coverage model for Properfy. A `ServiceRegion` is a tenant-scoped polygon that defines where a tenant's inspection services operate. The feature provides region CRUD, geospatial resolution (which regions cover which appointment properties), inspector-to-region assignment, and tenant-scoped region administration. The critical correction work adds `tenant_id` to the `service_regions` table and scopes all queries by tenant. Phase 2 closes 9 gaps including legacy `regions_json` consolidation, PostGIS sync verification, and deactivation guard for published service groups.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20
**Primary Dependencies**: Fastify, Prisma ORM, Zod, PostGIS (via Supabase), shared `AuditService`
**Storage**: PostgreSQL (Supabase) with PostGIS extension. Tables: `service_regions`, `inspector_regions`. Enum: `RegionStatus`. PostGIS columns: `service_regions.geom` (Polygon SRID 4326), `properties.coordinates` (Point SRID 4326).
**Testing**: Vitest (unit), Supertest (integration). PostGIS-aware integration tests required for spatial matching.
**Target Platform**: Linux server (Fly.io staging/prod)
**Project Type**: Multi-tenant B2B SaaS backend API
**Performance Goals**: Region resolution < 200ms p95 for 25 appointments against 50 regions per tenant
**Constraints**: No Redis, pg-boss for async jobs, PostGIS available on Supabase by default
**Scale/Scope**: Typical tenant has 5-20 regions; largest tenants up to 50 regions. Up to 25 appointments per resolve batch.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | Module follows `domain/` -> `application/` -> `infrastructure/` -> `interfaces/`. Entity, repository port, use cases, Prisma adapter, and Fastify routes are properly layered. |
| II. Multi-Tenant Safety | **FAIL (known DIVERGENCE)** | `service_regions` table has no `tenant_id` column. Resolve query matches globally. Both are documented as CRITICAL gaps (GAP-001, GAP-004) and must be corrected. |
| III. Test-Driven Development | **PARTIAL** | No test files exist for the service-region module yet. Tests must be added as part of the correction work. |
| IV. Contract-First APIs | PASS | Zod schemas in `packages/shared/src/schemas/service-region.ts`. Routes derive from schemas. Contracts documented in `specs/004-service-catalog/contracts/service-region-endpoints.md` (to be moved here). |
| V. Simplicity and Minimal Impact | PASS | Single backend module, no speculative abstractions. PostGIS for spatial queries is the correct tool. |

**Gate evaluation**: Two violations exist (II, III) but both are known divergences with a documented correction plan. The purpose of this implementation plan is precisely to fix them. **Proceeding with plan — correction is the deliverable.**

**Post-Phase 1 re-check**: After tenant_id migration and test addition, all gates must pass. Any remaining violation blocks merge.

## Project Structure

### Documentation (this feature)

```text
specs/013-service-regions/
├── plan.md              # This file
├── research.md          # Phase 0 output (migration strategy, PostGIS patterns)
├── data-model.md        # Phase 1 output (ServiceRegion, InspectorRegion with tenant_id)
├── quickstart.md        # Phase 1 output (getting started guide)
├── contracts/           # Phase 1 output (region endpoints)
│   └── service-region-endpoints.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/backend/src/modules/service-region/
├── domain/
│   ├── service-region.entity.ts         # Entity with tenant_id
│   ├── service-region.errors.ts         # Domain error codes
│   └── service-region.repository.ts     # Repository port
├── application/
│   └── use-cases/
│       ├── create-service-region.use-case.ts
│       ├── update-service-region.use-case.ts
│       ├── deactivate-service-region.use-case.ts
│       ├── delete-service-region.use-case.ts
│       ├── get-service-region.use-case.ts
│       ├── list-service-regions.use-case.ts
│       └── resolve-regions.use-case.ts
├── infrastructure/
│   └── prisma-service-region.repository.ts   # Raw SQL for PostGIS
└── interfaces/
    └── service-region.routes.ts

apps/backend/tests/
├── unit/
│   └── service-region/                  # TO BE CREATED
│       ├── create-service-region.use-case.test.ts
│       ├── update-service-region.use-case.test.ts
│       ├── deactivate-service-region.use-case.test.ts
│       ├── delete-service-region.use-case.test.ts
│       ├── list-service-regions.use-case.test.ts
│       └── resolve-regions.use-case.test.ts
└── integration/
    └── service-region/                  # TO BE CREATED
        └── service-region.routes.test.ts

apps/backend/prisma/
└── migrations/
    └── YYYYMMDDHHMMSS_add_tenant_id_to_service_regions/   # TO BE CREATED

packages/shared/src/
├── schemas/
│   └── service-region.ts               # Zod schemas (exists)
└── enums/
    └── index.ts                         # RegionStatus re-export
```

**Structure Decision**: Single backend module (`service-region`) following Clean Architecture. Inspector-region assignment methods live in the service-region repository (not inspector module) because they are domain operations on region coverage. Shared Zod schemas in `packages/shared`. No frontend changes in this feature scope — frontend consumes the existing API shape.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Raw SQL for PostGIS operations | Prisma does not support PostGIS functions (`ST_GeomFromGeoJSON`, `ST_Contains`, `ST_SetSRID`) natively. Raw SQL via `$executeRaw` / `$queryRaw` is required. | Prisma's `Unsupported` type declaration handles schema generation but not query operations. No ORM wrapper avoids the raw SQL need. |
| Dual storage (`geojson` + `geom`) | `geojson` is the application/frontend source of truth (JSON-serializable). `geom` is the PostGIS binary used by `ST_Contains`. Both must exist for correctness. | Storing only `geom` would require conversion on every read for the frontend. Storing only `geojson` would prevent spatial indexing. |
