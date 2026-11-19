# Implementation Plan: Early Offer Access by Inspector Level (backend + shared)

**Branch**: `066-f08-2-early-offer-access` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/066-f08-2-early-offer-access/spec.md`

## Summary

Make the marketplace honour the `inspectorProgram.earlyAccess` platform setting on all four inspector-facing offer paths (list, count, detail, accept): while a freshly-published group is in its first-H-hours window and at least one qualified-eligible inspector exists, hide it from under-levelled inspectors (list/count/detail) and refuse their accept with `403 OFFER_EARLY_ACCESS_ONLY`; a level-≥-X inspector is unaffected. Start-safe (off by default, never today/D+1, never without a qualified-eligible, never for offers published before activation) with a server-owned `earlyAccess.enabledAt`. No migration, no new entity: pure read/accept-path logic plus a settings save hook wired at the composition root.

**Technical approach.** A pure domain module (`service-group/domain/early-access.ts`) owns the decision (`resolveEarlyAccessParams`, `isGroupInEarlyAccess`, `formatOpensAt`); a domain port `IOfferEarlyAccessPolicy` is implemented by an inspector-program adapter that composes the existing F08-1 `hasEarlyAccess` + F07 snapshot date + `minScoreForLevel`. The repository gains one `Prisma.Sql` exclusion fragment (sibling to `inspectorEligibilitySql`) threaded through `findEligibleGroupIds` / `countPublishedForInspector` / `findPublishedOfferDetail` and a new `findEarlyAccessStateForGroup` for accept. The three marketplace use cases resolve the policy once and pass the params; accept checks before `acceptOptimistic`. `enabledAt` is derived by `prepareInspectorProgramSettingForSave` registered into the already-live `PLATFORM_SETTING_SAVE_HOOKS` seam at the container.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24 (CI baseline — the dev shell may run Node 26; lint/typecheck follow Node 24, see `project_eslint_consistent_type_imports_node_drift`).
**Primary Dependencies**: Fastify 4, Prisma 6 (PostgreSQL/Supabase, PostGIS), Zod 3, `fastify-type-provider-zod`; `@properfy/shared` (consumed from `dist/`).
**Storage**: PostgreSQL. **No schema change, no migration.** Reads `service_groups.published_at`, `inspectors` (`service_types_json`, `blocked_clients_json`), `inspector_regions`, `service_regions` (PostGIS `ST_Intersects`), `inspector_reliability_snapshots` (F07-2).
**Testing**: Vitest (unit + route-integration via Supertest), Testcontainers real PostGIS (`test:integration:db`). TDD, red→green→refactor.
**Target Platform**: Linux server (Fly.io); PWA/web consume the contract (web config is TASK-F08-3, out of scope here).
**Project Type**: Monorepo backend + shared package (`apps/backend`, `packages/shared`).
**Performance Goals**: The early-access `EXISTS` (spatial qualified-eligible check) is evaluated only for the few groups that are recently-published AND not today/D+1; it reuses the existing GiST indexes behind `ST_Intersects`. The policy resolves at most once per request.
**Constraints**: Privacy — no inspector coordinate/name/token in the 403, logs, or the qualified-eligible check (a boolean only). Timezone — civil dates/windows in `PLATFORM_TIMEZONE` (Sydney), instants in UTC, conversions only via shared helpers; tz-dependent tests pin `TZ` away from Sydney. ≤ 150 changed files.
**Scale/Scope**: ~19 files touched (per task estimate). One shared contract regen (`api-types`) for the accept 403.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture (NON-NEGOTIABLE)** — PASS. Decision logic is pure `domain/` (no deps). The port `IOfferEarlyAccessPolicy` lives in service-group `domain/`; the adapter lives in inspector-program `application/`; the use cases depend only on the port. The save-hook function is pure; cross-module wiring happens only at the composition root (`container.ts`). No layer violation; `platform-settings` does **not** import `inspector-program`.
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — PASS. No new entity, no `tenant_id` change. The four paths stay inspector-scoped (authenticated INSP, filtered by own regions/types/denylist). The policy reads the platform-scoped `inspectorProgram` setting (D12) and the platform-scoped reliability snapshots (D9) — documented cross-tenant exceptions — and returns only a boolean "a qualified inspector is eligible", never another inspector's identity. `CL_*`/`TNT` never reach the marketplace routes. Audit of the setting change is produced by F03 (`platform_setting.updated`, `tenantId: null`), satisfying 03.A5.
- **III. TDD (NON-NEGOTIABLE)** — PASS. Red→green→refactor; tests enumerated per the task (domain, settings hook, policy, three use cases, real-DB, route). Integration DB tests hit real PostGIS, never mock Prisma.
- **IV. Contract-First APIs (NON-NEGOTIABLE)** — PASS. The only contract change is the accept route's new `403 OFFER_EARLY_ACCESS_ONLY`; declared in the Fastify route schema and regenerated via `pnpm generate:api` (`openapi.json` + `api-types.ts` committed, never hand-edited). The `earlyAccess.enabledAt` field already exists in the shared schema (F08-1). List/count/detail request/response shapes unchanged.
- **V. Simplicity & Minimal Impact** — PASS. No new table, enum, or migration; no new abstraction beyond the one port the use cases need to stay module-independent; the dead per-agency `priorityOfferHours` stays dead (not reused). Change is confined to the four offer paths, one settings hook, one error, and the regen.

**No violations — Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/066-f08-2-early-offer-access/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (value object + setting shape; no DB change)
├── quickstart.md        # Phase 1 output (how to verify)
├── contracts/           # Phase 1 output (403 + settings contract notes)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/backend/src/modules/service-group/
├── domain/
│   ├── early-access.ts                 # NEW — pure: resolveEarlyAccessParams, isGroupInEarlyAccess, formatOpensAt, EarlyAccessParams
│   ├── offer-early-access.policy.ts    # NEW — port IOfferEarlyAccessPolicy { resolve(inspectorId, now) }
│   ├── service-group.errors.ts         # EDIT — add OfferEarlyAccessOnlyError (extends ForbiddenError)
│   └── service-group.repository.ts     # EDIT — add earlyAccess param to 4 signatures + findEarlyAccessStateForGroup
├── application/use-cases/
│   ├── get-marketplace-offers.use-case.ts        # EDIT — inject policy, resolve once, pass params to list+count
│   ├── get-marketplace-offer-detail.use-case.ts  # EDIT — inject policy, resolve once, pass params
│   └── accept-offer.use-case.ts                  # EDIT — inject policy (optional, last), check before acceptOptimistic
└── infrastructure/
    └── prisma-service-group.repository.ts        # EDIT — earlyAccessExclusionSql + qualifiedEligibleExistsSql fragments + findEarlyAccessStateForGroup

apps/backend/src/modules/inspector-program/application/
├── offer-early-access.policy.ts        # NEW — OfferEarlyAccessPolicy implements the service-group port
└── prepare-inspector-program-setting-for-save.ts  # NEW — pure save hook

apps/backend/src/modules/reliability/application/
└── reliability-index.reader.ts         # EDIT — expose findLatestSnapshotDate() (thin delegate to the snapshot repo)

apps/backend/src/modules/service-group/interfaces/
└── marketplace.routes.ts               # EDIT — declare 403 OFFER_EARLY_ACCESS_ONLY on the accept route

apps/backend/src/main/
└── container.ts                        # EDIT — build policy, inject into 3 use cases, register save hook into the hooks map

packages/shared/
├── openapi.json                        # REGEN (pnpm generate:api)
└── src/api-types.ts                    # REGEN (pnpm generate:api)

apps/backend/tests/
├── unit/ ... (domain + policy + hook + 3 use-case specs)
├── integration/marketplace-early-access.routes.test.ts   # NEW (Supertest)
└── integration/db/marketplace-early-access.db.test.ts     # NEW (Testcontainers + PostGIS)

apps/backend/CLAUDE.md                  # EDIT — marketplace early-access window + settings save-hook note
packages/shared/CLAUDE.md               # (no change — earlyAccess.enabledAt already documented by F08-1)
```

**Structure Decision**: Existing Clean-Architecture module layout. The decision logic is a new pure file in `service-group/domain/`; the port is in `service-group/domain/` and its adapter in `inspector-program/application/` (so the use cases stay independent of inspector-program). The repository gets one sibling SQL fragment. All cross-module wiring is at the composition root.

## Complexity Tracking

No constitution violations — section intentionally empty.
