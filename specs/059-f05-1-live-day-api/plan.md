# Implementation Plan: Live Day Dashboard API (F05-1)

**Branch**: `059-f05-1-live-day-api` | **Date**: 2026-11-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/059-f05-1-live-day-api/spec.md`

## Summary

Deliver a backend + shared read slice for the operations "Live Day" screen. One AM/OP endpoint (`GET /v1/dashboard/live-day`) returns, for each inspector working a civil date, a derived state, last known point, done/remaining progress, accumulated delay, plan freshness (STALE via the F04 fingerprint), seven alert types, a route-infeasibility indicator, plan stops with projected remaining times (via the shared F06 `projectStopEta`), and on-demand route geometry — all from **one aggregated SQL query with zero Mapbox calls**, with every derivation done in memory. A second endpoint (`GET /v1/dashboard/locked-time`) returns the 01.13 confirmation-rate indicator by agency and region. Alert thresholds are configurable platform-wide (`PlatformSetting.liveDayAlerts`) and per inspector (`inspectors.alert_overrides_json` + GET/PUT routes). The work lives in a new `modules/live-day/` module and touches no existing dashboard code.

Technical approach: compose the read in a new Clean-Architecture module reusing F04 pure functions (`classifyStops`, `computeDayPlanFingerprint`, the T-1 visibility predicate), the F03 `IPlatformSettingsReader` and `computeEstimatedArrivalAt`, and the F06 `projectStopEta` — importing them by fixed path, never copying. Two `$queryRaw` aggregates (live-day §1, locked-time §7) feed pure domain functions. Shared adds the `live-day` schemas/enums/colour palette and the `liveDayAlerts` setting key, and exports four previously-private wire helpers. One expand-only migration adds `alert_overrides_json`.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24
**Primary Dependencies**: Fastify 4, Prisma 6 (PostgreSQL/Supabase, PostGIS), Zod 3, `@fastify/rate-limit`; shared: Zod + the F06 `route-planning` module; reuses F03/F04 domain exports
**Storage**: PostgreSQL — reads `day_plans`, `day_plan_stops`, `appointments`, `inspection_executions`, `inspector_field_events`, `inspector_notices`, `tenants`, `service_types`, `properties`, `service_regions` (PostGIS `ST_Intersects`), `inspectors`; writes only `inspectors.alert_overrides_json` + audit
**Testing**: Vitest (domain + use cases, in-memory repo), Supertest (routes), Testcontainers (real-DB integration, serial)
**Target Platform**: Fastify API (all environments), stateless, 2 Fly machines
**Project Type**: Monorepo backend service + shared contract package (no web/PWA in this slice)
**Performance Goals**: p95 ≤ 300 ms (`includeGeometry=none`, 50 inspectors) and ≤ 800 ms (`all`); exactly 1 SQL query per endpoint; 0 external calls
**Constraints**: no Mapbox on read; response body budgets (`none` tiny, `all` < ~400 KB after Douglas–Peucker simplification); roster cap 60 for `all`; per-user rate limit; no inspector coordinates or tokens in logs
**Scale/Scope**: ~45 files; roster up to ~100 inspectors/day; 30-second client poll with several tabs per office

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Clean Architecture (NON-NEGOTIABLE)** — PASS. New `modules/live-day/` with `domain/` (pure derivation functions + the `ILiveDayReadRepository` port), `application/` (use cases, injected clock + platform-settings reader), `infrastructure/` (`$queryRaw` repository + LRU simplification cache), `interfaces/` (Fastify routes). Dependencies point inward only. F03/F04/F06 reuse is via imported pure functions, not cross-layer imports.
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — PASS **with a documented exception** (see Complexity Tracking). `live-day`/`locked-time` are cross-tenant AM/OP reads and `inspectors.alert_overrides_json` carries no `tenant_id`, on the same grounds the constitution already grants `Inspector` and `/inspector-workload`: the inspector is a cross-tenant subject and only the cross-tenant roles (AM/OP) read these rows. RBAC is enforced in the application layer (`LIVE_DAY_ROLES = ['AM','OP']`; the inspector routes use `authorizationService.assertRoles`). Audit `inspector.alert_thresholds_updated` records `tenantId null` per the Inspector precedent. No agency-facing projection exists. `locked-time` aggregates across tenants but exposes per-agency/region rows only to AM/OP.
- **III. Test-Driven Development (NON-NEGOTIABLE)** — PASS. 28 test groups specified red-first: pure domain (truth tables, alert blocks, fingerprint/`classifyStops` against the real F04 functions, ETA adapter against the real F06), use cases (RBAC, geometry modes, roster cap, log scrubbing), real-DB integration (single-query assertion, p95 budget, body-size, the 01.A4 HTTP flow driving real F03 start/finish), routes (RBAC matrix, serializer/strip, per-user rate limit), and shared schema/palette tests.
- **IV. Contract-First APIs (NON-NEGOTIABLE)** — PASS. All Zod schemas live in `packages/shared/src/schemas/live-day.ts`; OpenAPI + `api-types.ts` regenerated and committed in the same PR (contract-freshness CI). REST `/v1`, camelCase payloads, `{ error: { code, message, details } }` envelope. `dayPlanGeometrySchema` reused exactly.
- **V. Simplicity and Minimal Impact** — PASS. No new table; one expand-only column. No feature flag (D-rollout). No speculative abstraction. Existing dashboard code untouched (D12). Reuses F03/F04/F06 functions rather than reimplementing any rule.

**Appointment State Machine (Sovereign)** — N/A. This feature never transitions an appointment; it only reads status and derives state. The 01.A4 HTTP test drives real F03 transition routes, which go through the sovereign use case.

## Project Structure

### Documentation (this feature)

```text
specs/059-f05-1-live-day-api/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (endpoint contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/
│   ├── live-day.ts                 # NEW: liveDay/lockedTime/alertThresholds request+response schemas (reuses dayPlanGeometrySchema)
│   ├── platform-settings.ts        # EDIT: add `liveDayAlerts` key to PLATFORM_SETTINGS_REGISTRY
│   └── responses.ts                # EDIT: export instantStr/instantStrNullable/civilDateStr/civilDateStrNullable
├── enums/
│   └── live-day.ts                 # NEW: LiveDayInspectorState/StopProgress/AlertType/LastKnownSource + order + labels + caps
├── live-day/
│   ├── inspector-route-color.ts    # NEW: palette + FNV-1a index + color helper
│   └── inspector-route-color.test.ts
├── api-types.ts                    # REGENERATED
└── index.ts                        # EDIT: re-export the above

apps/backend/src/modules/live-day/   # NEW module
├── domain/
│   ├── live-day.read-repository.ts         # ILiveDayReadRepository port + flat row types
│   ├── derive-inspector-state.ts(.test)
│   ├── derive-stop-progress.ts(.test)
│   ├── resolve-last-known-point.ts(.test)
│   ├── compute-accumulated-delay.ts(.test)
│   ├── derive-alerts.ts(.test)
│   ├── resolve-effective-thresholds.ts(.test)
│   ├── simplify-route-geometry.ts(.test)
│   ├── build-route-fallback.ts(.test)
│   ├── plan-freshness.ts                    # resolvePlanFreshness (uses F04 computeDayPlanFingerprint)
│   ├── filter-t1-visible.ts                 # filterT1Visible (uses F04 T-1 predicate)
│   └── to-eta-inputs.ts                     # toEtaPlanInput / toEtaRealEvents (feeds F06 projectStopEta)
├── application/use-cases/
│   ├── get-live-day.use-case.ts(.test)
│   └── get-locked-time.use-case.ts(.test)
├── infrastructure/
│   ├── prisma-live-day.read-repository.ts   # the 2 $queryRaw aggregates
│   └── simplified-geometry-cache.ts         # LRU dayPlanId:version
└── interfaces/
    └── live-day.routes.ts                   # registerLiveDayRoutes (per-user rate limit)

apps/backend/src/modules/inspector/
├── application/use-cases/
│   ├── get-inspector-alert-thresholds.use-case.ts(.test)
│   └── update-inspector-alert-thresholds.use-case.ts
├── infrastructure/ (Prisma inspector repo)  # EDIT: getAlertOverrides/setAlertOverrides
├── domain/ (inspector repo port)            # EDIT: add methods
└── interfaces/inspector.routes.ts           # EDIT: GET/PUT /:id/alert-thresholds

apps/backend/src/main/
├── container.ts                             # EDIT: container.liveDay + inspector use cases
└── routes.ts                                # EDIT: registerLiveDayRoutes after line 109

apps/backend/prisma/
├── schema.prisma                            # EDIT: Inspector.alert_overrides_json Json?
└── migrations/<ts>_inspector_alert_overrides/  # NEW expand migration

apps/backend/tests/integration/db/
├── live-day.repository.integration.test.ts
├── live-day-a4.integration.test.ts          # 01.A4 over HTTP
├── locked-time.repository.integration.test.ts
└── inspector-alert-thresholds.integration.test.ts
```

**Structure Decision**: Monorepo backend module + shared contract package. New isolated `modules/live-day/` (Clean Architecture) plus additive edits to the existing `inspector` module for the threshold routes. No web/PWA code (that is TASK-F05-2/3).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `inspectors.alert_overrides_json` and the `live-day`/`locked-time` reads have **no `tenant_id`** (deviates from "every business entity carries `tenant_id`") | The subject is the **inspector**, a cross-tenant entity; the Live Day panel is an AM/OP cross-tenant operational view that spans agencies (contract 01.8/D). The constitution already grants this for `Inspector` and the `/inspector-workload` dashboard. | Adding `tenant_id` would be meaningless for a per-inspector setting and would make the cross-agency panel impossible; a per-tenant Live Day contradicts the contract. Scope is instead enforced by RBAC (AM/OP only; everyone else 403) and by the absence of any agency-facing projection. Audit records `tenantId null` per the Inspector precedent. (Decision D14; registered as the CLAUDE.md §7.1/§7.8 exception.) |
| `locked-time` aggregates appointments across all tenants in one query | 01.13 is a platform-wide confirmation-rate indicator for operations, broken down by agency and region. | A per-tenant query would require N calls and could not produce the cross-agency overall/region rollups the indicator requires. Exposure is limited to AM/OP by RBAC. |
