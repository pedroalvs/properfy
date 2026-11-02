# Implementation Plan: F04-2b — Preview route weights endpoint

**Branch**: `071-f04-2b-preview-route-weights` | **Date**: 2026-11-02 | **Spec**: `specs/071-f04-2b-preview-route-weights/spec.md`
**Input**: Feature specification from `/specs/071-f04-2b-preview-route-weights/spec.md`

## Summary

Close the orphaned F04-2 preview contract: implement `PreviewRouteWeightsUseCase` (AM/OP only) and register `POST /v1/day-plans/preview`, consuming the already-merged shared schemas (`previewRouteWeightsRequestSchema`, `routeWeightsPreviewResponseSchema`) and error code (`DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE`). The use case computes two route variants — `current` (saved platform `routeWeights`) and `proposed` (request weights) — over the inspector's reorderable candidate stops for a date, sharing **one** travel matrix and making **zero** Directions calls (matrix-only, forward slack, `etaSource 'MATRIX'`), persisting nothing. It validates the `date` against the actor's effective timezone (today..today+14 → 422) and rate-limits at 10/min per user. Regenerate `openapi.json` + `api-types.ts`. No new entity, table, column or migration.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24
**Primary Dependencies**: Fastify 4, `fastify-type-provider-zod`, Zod 3, `@properfy/shared` (route-planning optimizer), Prisma 6 (read-only reader here)
**Storage**: PostgreSQL via Prisma — **read-only** for this feature (candidates, inspector context, platform setting). No writes, no schema change.
**Testing**: Vitest (unit use-case), Supertest (route integration), testcontainers (`test:integration:db` route + scoping test)
**Target Platform**: Linux server (Fly.io), stateless Fastify API
**Project Type**: Web service (monorepo backend `apps/backend` + shared `packages/shared`)
**Performance Goals**: Exactly 1 Matrix call, 0 Directions per request; interactive-mode routing (falls back to stub, never defers)
**Constraints**: AM/OP only; 10/min per user; `date` within today..today+14 in the actor's effective tz; platform-scoped (no `tenant_id`)
**Scale/Scope**: 1 new use case, 1 new route, 1 new `PlanRouteService` method (matrix-only preview), container wiring, api-types regen. Est. <20 changed files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture (NON-NEGOTIABLE)** — PASS. New `PreviewRouteWeightsUseCase` lives in `application/use-cases`; it depends only on ports (`IDayPlanInputReader`, `IPlatformSettingsReader`, `AuthorizationService`, `Clock`) and the application-layer `PlanRouteService`. The route (`interfaces/`) only parses, authorizes-by-role-guard-helper, calls the use case, maps the response. The matrix-only orchestration is added to `PlanRouteService` (application), importing no infrastructure. No domain→application or application→infrastructure import introduced.
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — PASS with documented exception. `day_plan` is platform-scoped (no `tenant_id`; root `CLAUDE.md` §7.1 exception — the inspector is cross-tenant). Scope is guaranteed by RBAC: `assertRoles(['AM','OP'])` runs first; `CL_*`/`INSP`/`TNT` get 403 before any inspector-subject read. A scoping integration test asserting a `CL_*` actor cannot reach another inspector's preview ships in this PR (constitution + §5.6). No business read without an explicit scope decision: the scope is "platform-scoped entity, AM/OP cross-tenant". No raw inspector coordinates are returned (the preview response carries no lat/lng).
- **III. Test-Driven Development (NON-NEGOTIABLE)** — PASS. Red-green-refactor: use-case unit test (Example 6, date-range, no-routing-on-422) and route integration test (RBAC, rate limit, route collision, scoping) written first.
- **API conventions** — PASS. `/v1` prefix, `{ data }` success envelope via `successResponseSchema`, `{ error: { code, message } }` envelope from the 422/404 domain errors, static route registered before the `:inspectorId/:date` param route.
- **Dates/timezones** — PASS. Date-range uses `AuthContext.timezone ?? PLATFORM_TIMEZONE` (the actor's effective tz), civil-date math through `civilDateInTimezone`; each preview stop reports its appointment's agency timezone. Tests pin `TZ` away from Sydney.

No violations → Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/071-f04-2b-preview-route-weights/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (no new entities; documents the read model + response shape)
├── quickstart.md        # Phase 1 output (manual verification)
├── contracts/           # Phase 1 output (endpoint contract)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/backend/
├── src/
│   ├── modules/day-plan/
│   │   ├── application/
│   │   │   ├── services/plan-route.service.ts            # + previewWeights() (matrix-only, 0 Directions)
│   │   │   └── use-cases/
│   │   │       ├── preview-route-weights.use-case.ts     # NEW: PreviewRouteWeightsUseCase
│   │   │       └── __tests__/preview-route-weights.use-case.test.ts  # NEW (red first)
│   │   └── interfaces/day-plan.routes.ts                 # + POST /v1/day-plans/preview (static, 10/min)
│   └── main/container.ts                                 # + wire previewRouteWeightsUseCase into container.dayPlan
└── tests/integration/
    ├── day-plan-preview.integration.test.ts              # NEW: RBAC, 422 range, 429, route collision (Supertest)
    └── db/ (or reuse existing day-plan db test)          # scoping test: CL_*/INSP → 403

packages/shared/
├── openapi.json                                          # regenerated (pnpm generate:api)
└── src/api-types.ts                                      # regenerated (pnpm generate:api)
```

**Structure Decision**: Backend web service in the existing `day-plan/` module. The feature is additive orchestration over existing ports; no new module, no new directory. The only non-`day-plan` touches are `main/container.ts` (wiring) and the regenerated `packages/shared` contract files.

## Complexity Tracking

> No constitution violations — section intentionally empty.
