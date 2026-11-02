# Implementation Plan: Execution Density Map API

**Branch**: `049-f09-1-density-api` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/049-f09-1-density-api/spec.md`

## Summary

Add `GET /v1/map/execution-density`: a tenant-scoped read endpoint returning inspector check-in density aggregated into a fixed ~100 m grid (1000 cells/degree) over a civil-date period in `Australia/Sydney`. Aggregation happens entirely inside Postgres via `FLOOR(coordinate * 1000)` integer scaling; the domain port returns only `(latIndex, lngIndex, count)` plus valid/invalid totals — never a raw coordinate. AM/OP read platform-wide (optionally filtered by `tenantId`/`inspectorId`); CL_ADMIN/CL_USER read only their own agency (join on `appointments.tenant_id`), with `inspectorId` rejected (403), k-anonymity (cells < 3 hidden), and periods restricted to the 7/30/90-day presets ending today (so window-differencing cannot isolate a day). The contract lives in `@properfy/shared`; `openapi.json` + `api-types.ts` are regenerated for TASK-F09-2. No schema change, no migration.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24  
**Primary Dependencies**: Fastify 4, Prisma 6 (`$queryRaw` with `Prisma.sql`), Zod 3, `@properfy/shared`; `fastify-type-provider-zod` only where already wired for routes  
**Storage**: PostgreSQL (Supabase; PostGIS present but unused here — execution coords are `Decimal(10,7)`, not geometry). Read-only; no migration, no new column  
**Testing**: Vitest (unit), Supertest (route integration), testcontainers (real-DB integration suite `vitest.integration-db.config.ts`)  
**Target Platform**: Linux server (Fly.io), stateless API  
**Project Type**: Monorepo web service — backend (`apps/backend`) + shared contract (`packages/shared`). Web consumer is TASK-F09-2, out of this plan  
**Performance Goals**: A 366-day, no-agency query within ~200 ms using the existing `inspection_executions(started_at)` index + `appointments` PK join; payload capped at 5000 cells (~150 KB)  
**Constraints**: No raw inspector coordinate may ever leave Postgres; no new index/migration in this PR; Sydney-only civil-date math via shared timezone helpers; privacy invariants enforced in SQL and re-checked in the use case (defense in depth)  
**Scale/Scope**: Executions ≈ completed appointments, tens of thousands per year; ~21 changed files; backend + shared workspaces only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | `domain/execution-density-grid.ts` + `domain/execution-density.reader.ts` (port, zero deps); `application/use-cases/get-execution-density.use-case.ts` (RBAC, scope, assembly); `infrastructure/prisma-execution-density.reader.ts` (adapter); `interfaces/execution-density.routes.ts` (delivery). Dependencies point inward only. |
| II. Multi-Tenant Safety | PASS | Tenant scope resolved via `resolveAppointmentListTenantScope` + `requireTenantScope('map.execution_density')`; CL pinned to JWT tenant, requested `tenantId` ignored, `inspectorId` → 403. AM/OP cross-tenant per v1.3.0. **Read-only endpoint → no audit record required** (audit is mandatory on *sensitive mutations*, not reads) and **no idempotency key** (GET). Privacy beyond isolation: k-anonymity for CL + no raw coordinate ever returned. |
| III. TDD | PASS | Red-green-refactor across all layers: shared schema/matrix tests, pure grid unit tests, use-case unit tests (fake reader), real-DB integration test (spatial aggregation needs a real DB), route integration test. Tests written first. |
| IV. Contract-First APIs | PASS | Zod schemas in `packages/shared/src/schemas/execution-density.ts`, imported by the route; `openapi.json` + `api-types.ts` regenerated and committed; error envelope `{ error: { code, message, details } }`; `/v1` prefix; camelCase payload; `request_id` via existing middleware. Additive (expand) only. |
| V. Simplicity & Minimal Impact | PASS | One new port, one use case, one adapter, one route; reuses `resolveAppointmentListTenantScope`, `requireTenantScope`, `parseDateInTimezone`/`nextCivilDay`, the dashboard route-container pattern. No new abstraction beyond the privacy-enforcing port. Existing dashboards/`RegionHeatmap` untouched. |

**Knowledge classification**: the endpoint behavior is an **APPROVED RULE** (F09 plan + client contract codes D.1–D.4, dev decisions 2026-10-27…29). The `abandoned_at` column it reads is **IMPLEMENTED REALITY** (TASK-F03-2, merged `#1325`). No FUTURE GAP item is promoted into code.

No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/049-f09-1-density-api/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (execution-density.openapi.md)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/
│   ├── execution-density.ts          # NEW: query + response schemas, constants, isExecutionDensityPreset
│   ├── execution-density.test.ts     # NEW: S1–S15
│   └── index.ts                      # MODIFY: export the new module
├── permissions/
│   ├── role-matrix.ts                # MODIFY: add 'map.execution_density' action
│   └── role-matrix.test.ts           # MODIFY: M1, M2
└── api-types.ts                      # REGEN (P7)

packages/shared/openapi.json          # REGEN (P7)

apps/backend/src/
├── modules/inspector-execution/
│   ├── domain/
│   │   ├── execution-density-grid.ts         # NEW: cellCenter, toCellIndex, periodToInstants, minCellCountFor
│   │   └── execution-density.reader.ts       # NEW: ExecutionDensityReader port (privacy-documented)
│   ├── application/use-cases/
│   │   └── get-execution-density.use-case.ts # NEW: RBAC, scope, preset guard, k, truncation, assembly
│   ├── infrastructure/
│   │   └── prisma-execution-density.reader.ts# NEW: $queryRaw aggregate + totals
│   └── interfaces/
│       └── execution-density.routes.ts       # NEW: route + ExecutionDensityRouteContainer
├── main/
│   ├── container.ts                  # MODIFY: executionDensity container key + wiring
│   └── routes.ts                     # MODIFY: registerExecutionDensityRoutes
└── (apps/backend/CLAUDE.md, packages/shared/CLAUDE.md)  # MODIFY (P8)

apps/backend/tests/
├── unit/inspector-execution/
│   ├── execution-density-grid.test.ts            # NEW: G1–G8
│   └── get-execution-density.use-case.test.ts    # NEW: U1–U22
├── integration/
│   ├── db/execution-density.integration.test.ts  # NEW: D1–D18 (testcontainers)
│   └── inspector-execution/execution-density.routes.test.ts  # NEW: R1–R9
└── helpers/mock-container.ts         # MODIFY: executionDensity key
```

**Structure Decision**: Monorepo web service. The endpoint lives in the existing `inspector-execution` backend module (the subject is `inspection_executions`), with its Zod contract in `packages/shared`. Clean-Architecture layers map to the module's `domain/application/infrastructure/interfaces` folders. No new workspace, no new module.

## Complexity Tracking

> No constitution violations. Section intentionally empty.
