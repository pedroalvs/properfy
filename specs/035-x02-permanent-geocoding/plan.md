# Implementation Plan: Permanent Geocoding Compliance

**Branch**: `035-x02-permanent-geocoding` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/035-x02-permanent-geocoding/spec.md`

## Summary

Make every geocoding **write** path request Mapbox permanent mode (`permanent=true`), record provenance with a nullable marker timestamp on `properties` and `branches`, stop auto-retrying when the account lacks the permanent entitlement (`geocoding_failure_code`), and fix the false-`MANUAL` bug (web over-sends coordinates; backend stamps `MANUAL` without comparing). Display-only geocoding (autocomplete, connection test) stays temporary. The Mapbox spike (2026-10-29) confirmed **v5** accepts `permanent=true` on the Properfy account, so the v6 contingency is not triggered. Legacy re-geocoding is a separate task (X02-2).

Technical approach: add an optional `mode` (default `permanent`) to the `IGeocodingService` port + an `MapboxPermanentGeocodingUnavailableError` raised outside the circuit breaker; two new shared helpers (`formatGeocodingQuery`/`isSameGeocodingAddress` in `shared/domain`, `geocodeWithTimeout` in the property application layer) that F01 will reuse; an expand-only migration adding the three nullable columns; and targeted changes to the property create/worker/retry/update/geocode use cases, the import verifier + commit worker, and the branch create/update use cases, all under TDD.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict, ES2022 ESM); Node.js 24  
**Primary Dependencies**: Fastify 4, Prisma 6 (PostgreSQL/Supabase, PostGIS), Zod 3, pg-boss 9, Mapbox Geocoding v5; web: React 18, openapi-fetch, react-hook-form  
**Storage**: PostgreSQL via Prisma; coordinates in `properties.lat/lng` (`Decimal(10,7)`) mirrored to `coordinates GEOMETRY(Point,4326)`; branch coordinates inside `branches.address_json`  
**Testing**: Vitest (unit), Supertest (API integration), testcontainers (real-DB integration `test:integration:db`), Playwright (web E2E — not needed here, no new screen)  
**Target Platform**: Fly.io (API, all envs), Vercel (web/pwa)  
**Project Type**: Multi-tenant B2B SaaS monorepo — backend (Fastify/Clean Architecture) + shared package + web SPA  
**Performance Goals**: synchronous geocode bounded at 4000 ms (`GEOCODE_SYNC_TIMEOUT_MS`); async paths via pg-boss; no new latency budget  
**Constraints**: Mapbox ToS — only permanent-mode coordinates may be stored; PostGIS `coordinates` must stay consistent with `lat/lng` (written only via repository); `permanent` costs ~US$ 0.005/request (no free tier)  
**Scale/Scope**: ~10s of thousands of properties; a handful of touched use cases/workers; well under the 150-file PR cap

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture (NON-NEGOTIABLE)** — PASS. The port (`IGeocodingService`, mode option, error class) and the shared formatter live in `domain`; the timeout helper and the use-case changes in `application`; the Mapbox adapter, dynamic provider, repositories and workers in `infrastructure`; routes untouched in `interfaces`. Dependencies point inward only. The two exported helpers introduce no cross-module imports (`property`/`shared` do not import `tenant`/`inspector`/`appointment`), so no cycle.
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — PASS. No new cross-tenant platform entity: the three new columns live on the already tenant-scoped `properties` and `branches` tables. Branch routes keep their RBAC (AM/OP any tenant; CL_ADMIN own; others 403). Property/branch repositories keep tenant-scoped reads/writes; the X02-2 CAS backfill is out of scope here. New audit metadata (`property.geocoding_failed.metadata.code`) carries no coordinate leak; the `coordinates` column is never widened to agency roles. The §7.9 inspector-GPS rule is untouched.
- **III. Test-Driven Development (NON-NEGOTIABLE)** — PASS. The spec carries an exhaustive red-first test list (adapter, dynamic provider, formatter, timeout helper, create/worker/retry/geocode/update use cases, import verifier + commit worker, branch create/update, shared schemas, web form/hooks, and real-DB PostGIS integration). Integration tests hit a real database (testcontainers), never mock Prisma.
- **IV. Contract-First APIs (NON-NEGOTIABLE)** — PASS. The only contract change is the import `found` verification gaining an optional `mode` and the branch address schema dropping `latitude/longitude`; OpenAPI + `api-types.ts` are regenerated and committed (CI `contract-freshness`). New DB columns are NOT exposed in any response. Zod schemas stay in `packages/shared`.
- **V. Simplicity and Minimal Impact** — PASS. No feature flags, no speculative abstraction. The mode option defaults to the safe value; the helpers are the minimum shared surface F01 needs. No unrelated refactor. The one accepted deviation from "don't change the API/provider" is the documented v6 adapter contingency (not triggered).

**Result**: all gates pass. No entries in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/035-x02-permanent-geocoding/
├── plan.md              # This file
├── spec.md              # Feature spec (with Clarifications + spike result)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (port + HTTP contract notes)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/backend/
├── prisma/
│   ├── schema.prisma                                   # + geocoded_permanently_at, geocoding_failure_code
│   └── migrations/<ts>_permanent_geocoding_markers/    # expand-only ADD COLUMN
├── src/
│   ├── shared/domain/
│   │   └── geocoding-address.ts                        # NEW: formatGeocodingQuery, isSameGeocodingAddress
│   └── modules/
│       ├── property/
│       │   ├── domain/geocoding.service.ts             # port: mode option + account-error class
│       │   ├── application/
│       │   │   ├── services/geocode-with-timeout.ts    # NEW: GEOCODE_SYNC_TIMEOUT_MS, geocodeWithTimeout
│       │   │   ├── services/import-geocode-verifier.ts # permanent + batch short-circuit
│       │   │   └── use-cases/{create,update,geocode}-property.use-case.ts
│       │   ├── domain/property.entity.ts               # marker + failure-code props
│       │   └── infrastructure/
│       │       ├── mapbox-geocoding.service.ts         # permanent=true, account-error outside breaker
│       │       ├── stub-geocoding.service.ts
│       │       ├── prisma-property.repository.ts       # update w/ marker, findFailedGeocoding filter, countBlockedFailedGeocoding
│       │       └── workers/{geocode,geocode-retry}.worker.ts
│       ├── integration/infrastructure/dynamic-providers.ts  # option passthrough + isConfigured()
│       ├── tenant/
│       │   ├── application/use-cases/{create,update}-branch.use-case.ts
│       │   └── infrastructure/prisma-*.repository.ts, branch.entity.ts
│       └── appointment/infrastructure/workers/appointment-import-commit.worker.ts
│   └── main/container.ts                               # wiring order (geocoder → branch use cases)
packages/shared/src/schemas/
├── address.ts                                          # branchAddressSchema drops lat/lng (stays z.object)
└── import.ts                                           # found variant gains mode?
apps/web/src/features/
├── properties/{components/PropertyFormDrawer.tsx, hooks/usePropertySave.ts}
└── tenants/hooks/useBranchSave.ts
docs/ops/pre-deploy-smoke-checklist.md                  # spike result + smoke
apps/backend/CLAUDE.md                                  # §10 N4 transition clause removed
```

**Structure Decision**: Existing monorepo (backend + `packages/shared` + `apps/web`). No new workspace or top-level directory; changes slot into the existing `property`, `tenant`, `integration`, `appointment` modules and the shared schema package, following the file map the source task verified.

## Complexity Tracking

> No constitution violations. Section intentionally empty.
