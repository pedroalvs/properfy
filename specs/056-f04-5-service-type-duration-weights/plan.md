# Implementation Plan: Service Type Duration + Route Weights (web)

**Branch**: `056-f04-5-service-type-duration-weights` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/056-f04-5-service-type-duration-weights/spec.md`

## Summary

Flip `ServiceType.defaultDurationMinutes` from a transitional `.default(45)` to a **required** create-body field (shared schema + backend route validation + regenerated api-types + backend tests), collect it in the web `ServiceTypeFormDrawer`, and add a "Route planning" section to the web Platform settings page: three `routeWeights` and a before-you-save preview against a real inspector/day via the already-merged `POST /v1/day-plans/preview`. Pure consumer of merged F04-1/F04-2/F04-2b/F03-4 contracts; no new endpoint, entity, migration, or RBAC key.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24; pnpm 9 + Turborepo
**Primary Dependencies**: web — React 18, Vite 5, TanStack Query 5, `openapi-fetch`, Tailwind 3; shared — Zod 3; backend — Fastify 4, Zod 3 (route validation only; no new code path)
**Storage**: N/A for web; backend unchanged (DB column + `DEFAULT 45` already exist from F04-1)
**Testing**: Vitest + React Testing Library (web/shared), Supertest integration (backend), Playwright E2E (web, API stubbed)
**Target Platform**: Web admin SPA (Portal Master Admin) — AM/OP
**Project Type**: Monorepo web application (`apps/web`, `apps/backend`, `packages/shared`)
**Performance Goals**: inspector search debounced 300 ms; preview rate-limited 10/min (server)
**Constraints**: no `as any`; generated api-types committed (CI contract-freshness); PR < 40 files; dates in effective timezone, never browser tz
**Scale/Scope**: 2 user stories; ~1 shared file + 1 shared test, backend test adjustments, ~2 web features touched (service-types, platform-settings), 2 E2E specs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture** — PASS. No backend domain/application change beyond a type becoming required (the use case already consumes `defaultDurationMinutes`). Web layering (feature components/hooks) preserved.
- **II. Multi-Tenant Safety** — PASS. No new entity. The two platform-scoped surfaces read (`routeWeights` `PlatformSetting`, `day_plan` preview) carry **no `tenant_id`** by documented exception and are role-scoped (AM/OP) by the backend; the web adds no tenant predicate and leaks no cross-tenant/cross-inspector data. Preview exposes no inspector GPS coordinates (schema carries only suburb + windows + ETAs).
- **III. Test-Driven Development** — PASS. Red-green-refactor: shared schema test, drawer test, save-hook test, section test, preview test, page test, 2 E2E, backend route test all written first.
- **IV. Contract-First APIs** — PASS. The only contract change (remove `.default(45)`) regenerates `openapi.json` + `api-types.ts` (`pnpm generate:api`), committed; no hand-edited types; no `as any`.
- **V. Simplicity and Minimal Impact** — PASS. Reuse `usePlatformSetting`, `FieldEventsSettingsSection` layout, `AgencySelect`/`useAgencySearch` pattern, `DateInput`, `useEffectiveTimezone`. New searchable picker is feature-local, not a shared-primitive change.

No violations → Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/056-f04-5-service-type-duration-weights/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── consumed-contracts.md
└── tasks.md            # /speckit.tasks output
```

### Source Code (repository root)

```text
packages/shared/src/schemas/
├── service-type.ts            # remove .default(45) on create (make required)
└── service-type.test.ts       # absent → invalid; 5/480 ok; 4/481/45.5/'45'/null invalid
packages/shared/
├── openapi.json               # regenerated (pnpm generate:api)
└── src/api-types.ts           # regenerated

apps/backend/
├── src/modules/service-type/… # CreateServiceTypeInput required (type only, no rule change)
└── tests/integration/service-type/service-type.routes.test.ts  # 400 w/o field; route-creating tests send it

apps/web/src/features/service-types/
├── types/index.ts             # ServiceTypeFormData + ServiceType gain defaultDurationMinutes
├── hooks/useServiceTypeSave.ts (+ .test)   # convert + send field; validate bounds
└── components/ServiceTypeFormDrawer.tsx (+ .test)  # required FormField after Flow Type

apps/web/src/features/platform-settings/
├── pages/PlatformSettingsPage.tsx (+ .test)   # render Route planning after Field events
├── components/RouteWeightsSettingsSection.tsx (+ .test)
├── components/RouteWeightsPreview.tsx (+ .test)
├── components/InspectorSelect.tsx             # feature-local searchable combobox (ASSUMPTION-2)
└── hooks/
    ├── useInspectorSearch.ts                  # debounced server search
    └── useRouteWeightsPreview.ts              # useMutation POST /v1/day-plans/preview

apps/web/tests/e2e/
├── route-weights.spec.ts
└── service-type-duration.spec.ts
```

**Structure Decision**: Monorepo web application. The change spans `packages/shared` (one required-field flip + test + regenerated contract), `apps/backend` (type becomes required + integration-test adjustments, no new code path), and `apps/web` (service-types drawer + a new Platform-settings "Route planning" section with preview). No new backend module, route, entity, or migration.

## Complexity Tracking

*No constitution violations — not applicable.*
