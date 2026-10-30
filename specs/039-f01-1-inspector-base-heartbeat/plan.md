# Implementation Plan: Inspector geocoded base address, privacy, backfill and app-state heartbeat

**Branch**: `039-f01-1-inspector-base-heartbeat` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/039-f01-1-inspector-base-heartbeat/spec.md`

## Summary

Turn `Inspector.address` into a mandatory, validated Australian base address that is geocoded synchronously in permanent mode (reusing the X02 port/timeout/query contract), add seven nullable columns (`base_lat`, `base_lng`, `base_geocoded_at`, `app_installed_at`, `app_last_seen_at`, `push_enabled`, `app_version`), expose an INSP-only app-state heartbeat that records install/last-seen/push/version in a single SQL statement, hide the base address and coordinates from agency roles with a field-visibility helper, emit `inspector.base_changed` on every base write, and ship a throttled one-off backfill for existing addresses. Backend + shared only; web (F01-2) and PWA (F01-3) consume the contract later. The slice is bounded by contract codes 00.3, 00.4, 00.10 and the partial 00.A5.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict, ES2022 ESM), Node.js 24
**Primary Dependencies**: Fastify 4, Prisma 6 (PostgreSQL/Supabase), Zod 3, `@fastify/rate-limit`, `fastify-type-provider-zod`; reuses the X02 geocoding port (`IGeocodingService`), `geocodeWithTimeout`/`GEOCODE_SYNC_TIMEOUT_MS`, `formatGeocodingQuery`/`isSameGeocodingAddress`/`GeocodableAddress`
**Storage**: PostgreSQL via Prisma; `inspectors` table extended with 7 nullable columns (expand-only migration); coordinates `Decimal(10,7)` mapped ↔ `number`
**Testing**: Vitest (unit + route-integration with Supertest), testcontainers (real PostGIS, `test:integration:db`, serial)
**Target Platform**: Linux server (Fly.io); clients out of scope for this task
**Project Type**: Web service (monorepo backend + shared package)
**Performance Goals**: Synchronous geocode bounded at 4000 ms; heartbeat is a single UPDATE; backfill throttled at ~4 req/s (`--delay-ms` 250)
**Constraints**: No stale coordinates (atomic write of both or neither); per-user rate limit 10/min on `/me/app-state` and `PATCH /me`; permanent-mode-only writes (Mapbox terms); legacy addresses never normalized; PR ≤ 150 files
**Scale/Scope**: `inspectors` has tens of rows; no new index needed (a `base_lat IS NULL` scan is cheap). Scope: ~1 migration, 1 shared schema set, 1 new service, 1 new use case, 1 new event, 1 new route, 1 backfill script, field-visibility helper, contract regen

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture (NON-NEGOTIABLE)** — PASS. New domain event (`inspector/domain/inspector-events.ts`), application service (`application/services/geocode-inspector-base.ts`) and use case (`application/use-cases/record-inspector-app-state.use-case.ts`), infrastructure repo change (`$executeRaw` in `prisma-inspector.repository.ts`), interfaces route (`inspector.routes.ts`). The geocoding port stays in `property/domain` and is imported across modules (D4) — an inward-pointing dependency on a domain port, no layer violation.
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — PASS. `Inspector` is a documented cross-tenant entity (constitution §II line 31, §RBAC "Cross-tenant entities — visibility on a per-tenant basis"); the seven new columns add no `tenant_id`. The feature *tightens* isolation: it removes the current leak of `address` to CL roles and keeps coordinates CL-invisible. A scoping integration test proves a CL_*/INSP actor cannot read another inspector's base/coordinates/adoption. Audits for the base carry no raw lat/lng (§Audit + root §7.9).
- **III. TDD (NON-NEGOTIABLE)** — PASS. Every unit/integration/db test listed in the spec is written red-first; the backend full suite (unit + integration + integration-db) is the gate.
- **IV. Contract-First APIs (NON-NEGOTIABLE)** — PASS. All payloads validated by Zod schemas in `packages/shared/src/schemas`; `openapi.json` + `api-types.ts` regenerated via `generate:openapi` → `generate:types`; expand-only (new fields optional, columns nullable).
- **V. Simplicity & Minimal Impact** — PASS. Reuses the existing `address` column and the X02 port/helpers; no new index, no CHECK constraint, no second query formatter, no own `Promise.race`. No speculative abstraction (the event bus and save-hook patterns already exist).

**Result: PASS — no violations. Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/039-f01-1-inspector-base-heartbeat/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (endpoint + schema contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/
│   ├── address.ts            # + AU_STATES, inspectorBaseAddressSchema (derived from branchAddressSchema)
│   ├── inspector.ts          # create/update/self-update.address; inspectorAppStateSchema; listInspectorsQuerySchema.missingBaseAddress
│   └── responses.ts          # inspectorResponseSchema + base/adoption/baseGeocodeFailed optional fields
└── index.ts                  # re-exports if the barrel does not already cover them

apps/backend/
├── prisma/
│   ├── schema.prisma         # Inspector: +7 columns
│   └── migrations/2026…_inspector_base_coords_app_state/migration.sql   # expand-only
└── src/
    ├── modules/inspector/
    │   ├── domain/
    │   │   ├── inspector.entity.ts         # base/adoption fields
    │   │   ├── inspector.repository.ts     # InspectorFilters.missingBaseAddress; update() base fields; recordAppState()
    │   │   └── inspector-events.ts         # NEW: INSPECTOR_EVENTS.BASE_CHANGED
    │   ├── application/
    │   │   ├── inspector-field-visibility.ts               # NEW: applyInspectorFieldVisibility(dto, actor)
    │   │   ├── services/geocode-inspector-base.ts          # NEW
    │   │   └── use-cases/
    │   │       ├── create-inspector.use-case.ts            # geocode + order + event
    │   │       ├── update-inspector.use-case.ts            # same-address + geocode + event
    │   │       ├── update-inspector-self-profile.use-case.ts
    │   │       ├── get-inspector.use-case.ts               # visibility
    │   │       ├── list-inspectors.use-case.ts             # visibility + missingBaseAddress + address for AM/OP
    │   │       └── record-inspector-app-state.use-case.ts  # NEW
    │   ├── infrastructure/prisma-inspector.repository.ts   # Decimal↔number; $executeRaw heartbeat; Prisma.DbNull
    │   └── interfaces/inspector.routes.ts                  # app-state route; PATCH /me passes address; per-user rate limit
    ├── main/container.ts                                   # wire geocoder into inspector use cases + app-state use case
    └── scripts/backfill-inspector-base-coords.ts (+ .test.ts)  # NEW
```

**Structure Decision**: Monorepo web-service layout. All backend work stays inside `apps/backend/src/modules/inspector/*` (plus `main/container.ts` and `scripts/`), and all contract work inside `packages/shared/src/schemas/*`. No new module is introduced — the inspector module already exists.

## Complexity Tracking

> No constitution violations. This section intentionally left empty.
