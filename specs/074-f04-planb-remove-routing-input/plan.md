# Implementation Plan: F04 Plan B — Remove routingInput & Drop Dead Routing Columns (PR-C)

**Branch**: `074-f04-planb-remove-routing-input` | **Date**: 2026-11-03 | **Spec**: [spec.md](./spec.md)

## Summary

Contract (C) phase of F04 Plan B. Remove `routingInput` from the day-plan contract (nothing reads it after PR-B #1339), make the plan GET **Directions-only** (drop the now-pointless per-GET Matrix), drop the dead columns (`route_geometry`, `routing_matrix_json`, `leg_travel_json`, `geometry_purged_at`) and remove the PR-A transitional cleanup, and resolve the preview↔`PUT /order` mid-day-reorder asymmetry (spec-clear: preview must match `PUT /order` per D18 / F04-tarefas.md line 725/726).

## Technical Context

**Language/Version**: TypeScript 5.6 strict, Node 24 (CI; shell may run 26)
**Primary Dependencies**: Fastify 4, Prisma 6 (PostgreSQL/PostGIS), Zod 3, pg-boss 9, Mapbox (Directions v5; Matrix only for OPTIMIZE + preview after this change)
**Storage**: PostgreSQL. **One migration** drops 4 columns (after `20261106000300`).
**Testing**: Vitest, Supertest, testcontainers (integration-db)
**Project Type**: backend + shared (+ PWA test-fixture cleanup only — removing the shared field orphans fixtures that still set it; no PWA runtime change)
**Constraints**: `plan.geometry` stays on-demand (don't break PWA map); preview keeps `etaSource: 'MATRIX'`; develop never breaks.
**Scale/Scope**: `day-plan` module + shared `day-plan` schema; ~30-40 files.

## Constitution Check

- **I. Clean Architecture** — PASS. Removals stay within layers; the `resolveMatrix` change is in the application service; the migration + repo changes in infrastructure.
- **II. Multi-Tenant Safety** — PASS. `DayPlan` stays platform-scoped; no scope change; preview still resolves by the caller's own `inspectorId`.
- **III. TDD** — PASS. Each behavioural change (no-Matrix-on-GET, preview mid-day, schema removal, migration) is test-first.
- **IV. Contract-First** — PASS. Schema change → `pnpm generate:api`; committed contract fresh. Breaking removal of `routingInput`, but no consumer reads it (PR-B).
- **V. Simplicity & Minimal Impact** — PASS. Net deletion of dead code + one scoped `needsProviderMatrix` change + one preview fix.
- **Migrations (expand/contract)** — PASS. This is the **contract** step; the drop is safe because the columns are unwritten/unread since PR-A, deployed everywhere before PR-C by promotion order.

**Result: no violations.**

## Project Structure

```text
packages/shared/src/schemas/day-plan.ts        # remove routingInput field + dayPlanRoutingInputSchema + toOptimizerInput/buildLegOverrides/toIso
packages/shared/src/schemas/day-plan.test.ts   # drop/adjust tests
packages/shared/{openapi.json,src/api-types.ts}# regenerated

apps/backend/prisma/schema.prisma              # drop 4 columns (DayPlan)
apps/backend/prisma/migrations/2026110700XXXX_drop_day_plan_route_columns/migration.sql

apps/backend/src/modules/day-plan/
├── domain/day-plan.entity.ts                  # remove routeGeometry/routingMatrix/legTravel (+ DayPlanLegTravel if unused)
├── domain/day-plan.repository.ts              # remove clearStoredRouteData from the port
├── application/day-plan-response.builder.ts   # remove routingInput block; geometry from injected routing only
├── application/recompute-routing.ts           # geometry-only return (drop matrix/legs)
├── application/services/plan-route.service.ts # needsProviderMatrix = OPTIMIZE only (PRESERVE_ORDER → stub seed + Directions)
├── application/use-cases/
│   ├── preview-day-plan-order.use-case.ts     # remove DAY_PLAN_ALREADY_STARTED; LAST_STOP effective origin for a started day
│   ├── get-my-day-plan.use-case.ts            # unchanged call (routingFor now geometry-only)
│   └── clear-stored-route-data.use-case.ts    # DELETE
├── infrastructure/prisma-day-plan.repository.ts # remove read-mapping of dropped cols + clearStoredRouteData()
apps/backend/src/main/{workers.ts,container.ts,server.ts}  # remove ClearStoredRouteData wiring + boss.unschedule; fix arity
```

**Structure Decision**: backend + shared; plus PWA **test-fixture** cleanup (remove the orphaned `routingInput` from fixtures + one-line `apps/pwa/CLAUDE.md` note) — no PWA runtime change. CI typechecks all workspaces, so the shared-field removal must be reflected there.

```text
apps/pwa/src/features/day-plan/__fixtures__/day-plan.ts, RoutePage.test.tsx, useReorderDraft.test.ts, tests/e2e/.../fixtures.ts  # drop routingInput
apps/pwa/CLAUDE.md                                                                                                            # one-line note
```

## Complexity Tracking

No violations. The one non-trivial behavioural change — `PRESERVE_ORDER` no longer calling the provider Matrix — is safe because the Matrix only seeds a timeline the Directions pass overwrites; verified the **preview** path keeps its own Matrix call (`etaSource: 'MATRIX'`) independent of `needsProviderMatrix`.
