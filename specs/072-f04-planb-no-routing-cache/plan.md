# Implementation Plan: F04 Plan B — No Routing Result Storage

**Branch**: `072-f04-planb-no-routing-cache` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/072-f04-planb-no-routing-cache/spec.md`

## Summary

Migrate the shipped F04 day-plan routing from Plan A (Mapbox Matrix/Directions results persisted and purged nightly) to **Plan B**: never persist or cache any Mapbox result; recompute the matrix and route geometry on demand. This is **PR-A**, the non-breaking backend half of a strict A→B→C rollout. PR-A: stop persisting `route_geometry`/`routing_matrix_json`/`leg_travel_json`; recompute `geometry` and `routingInput` on demand into the **same** response fields (so the merged PWA keeps working); add `POST /v1/inspector/day-plans/:date/order/preview` (server-side reorder eval, `etaSource 'MATRIX'`, 30/min); make `PUT /order`/`PRESERVE_ORDER`/`recalculate` recompute the Matrix on demand; remove the 03:45 purge job. `routingInput` removal + `dayPlanRoutingInputSchema`/`toOptimizerInput`/`buildLegOverrides` removal + the column-drop migration are **deferred to PR-C** (after Bússola's PR-B).

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24
**Primary Dependencies**: Fastify 4, Prisma 6 (PostgreSQL/Supabase, PostGIS), Zod 3, pg-boss 9, Mapbox (Matrix + Directions v5), `fastify-type-provider-zod`
**Storage**: PostgreSQL. `day_plans` routing-result columns become unused/nullable (dropped in PR-C); no new columns, **no migration in PR-A**.
**Testing**: Vitest (unit), Supertest (routes), testcontainers (integration-db)
**Target Platform**: Fastify API (Fly.io, 2 machines)
**Project Type**: Backend web service + shared contracts package
**Performance Goals**: On-demand recompute per GET acceptable (dark feature); shared Postgres Mapbox rate limiter caps provider calls; preview endpoint 30 req/min per inspector.
**Constraints**: develop MUST never break (expand/contract); no Mapbox result persisted (ToS); GET must not fail when rate-limited (degrade to stub).
**Scale/Scope**: Backend + shared only. ~1 module (`day-plan`) + shared `day-plan` schema. No web/pwa changes (PR-A).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture (NON-NEGOTIABLE)** — PASS. Changes stay within existing layers: domain port `IRoutingService` unchanged; application use-cases (`compute-day-plan`, new `preview-day-plan-order`) orchestrate; infrastructure (`prisma-day-plan.repository`) stops writing result columns. No domain→infra dependency introduced.
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — PASS. `DayPlan`/`DayPlanStop` remain platform-scoped (no `tenant_id`, D10 exception); INSP routes filtered by own `inspectorId`; AM/OP cross-tenant by RBAC. No new query without a scope decision. The preview endpoint resolves the plan by the caller's own `inspectorId`.
- **III. TDD (NON-NEGOTIABLE)** — PASS. Every change is red-green: tests asserting "no routing result persisted", "geometry present on GET", "preview recomputes matrix", "purge removed" are written first.
- **IV. Contract-First APIs (NON-NEGOTIABLE)** — PASS. New preview request/response Zod schemas in `packages/shared`; `pnpm generate:api` regenerates `openapi.json` + `api-types.ts` (non-breaking: geometry/routingInput retained). CI `contract-freshness` stays green.
- **V. Simplicity & Minimal Impact** — PASS. Reuse existing `plan-route.service`, rate limiter, kill switch, `evaluateSequence`. No new infrastructure. Dead purge code deleted (not flagged off).
- **Migrations (expand/contract)** — PASS. PR-A ships **no** migration; columns left nullable/unused; drop deferred to PR-C.
- **Commits / Verification** — PASS. Conventional Commits, no AI references; gates run in-worktree (incl. integration-db) before PR.

**Result: no violations. Proceed.**

## Project Structure

### Documentation (this feature)

```text
specs/072-f04-planb-no-routing-cache/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── inspector-day-plan-order-preview.md
└── tasks.md            # /speckit.tasks output
```

### Source Code (repository root)

```text
packages/shared/src/schemas/day-plan.ts        # add preview request/response schemas; keep geometry + routingInput
packages/shared/openapi.json                    # regenerated
packages/shared/src/api-types.ts                # regenerated

apps/backend/src/modules/day-plan/
├── domain/routing.service.ts                   # (unchanged) IRoutingService port
├── application/
│   ├── services/plan-route.service.ts          # on-demand matrix/geometry; no cachedMatrix reuse
│   ├── day-plan-response.builder.ts            # geometry + routingInput assembled from on-demand compute, not DB
│   ├── use-cases/
│   │   ├── compute-day-plan.use-case.ts        # stop writing routeGeometry/routingMatrix/legTravel
│   │   ├── save-day-plan-order.use-case.ts     # REORDER recomputes Matrix on demand
│   │   ├── get-my-day-plan.use-case.ts         # GET recomputes geometry + routingInput on demand (INSP)
│   │   ├── get-day-plan-for-operator.use-case.ts # GET recomputes geometry on demand (AM/OP)
│   │   ├── preview-day-plan-order.use-case.ts  # NEW: server-side reorder eval, etaSource MATRIX
│   │   └── purge-day-plan-route-data.use-case.ts # REMOVED
├── infrastructure/prisma-day-plan.repository.ts # stop writing result columns; remove purgePastRouteData
└── interfaces/day-plan.routes.ts               # add POST /:date/order/preview (INSP), 30/min

apps/backend/src/main/workers.ts                # remove day-plan.purge-route-data schedule + handler
```

**Structure Decision**: Backend + shared only (web/pwa untouched in PR-A). The `day-plan` module already owns all affected code; the single new artifact is the preview use-case + route.

## Complexity Tracking

No constitution violations; no complexity deviations to justify. The one accepted tradeoff — recomputing Directions on every GET instead of serving stored geometry — is deliberate (ToS compliance) and bounded (rate limiter + stub fallback + dark feature); a dedicated geometry-only endpoint is recorded as a future optimization, not built here.
