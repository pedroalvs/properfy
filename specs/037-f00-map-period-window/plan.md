# Implementation Plan: Default Map Period Window + per-agency mapWindowDays (F00)

**Branch**: `037-f00-map-period-window` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/037-f00-map-period-window/spec.md`

## Summary

Add an optional tenant setting `mapWindowDays` (1–90, platform default 14) and make `/map` open on a
`today … today+N` window in both modes. AM/OP can remove the window via a chip (visible even with the
filter panel closed) and can edit `mapWindowDays` on any agency; OP's write is a narrow cross-tenant
path limited to that one key. CL roles get a fixed, clamped window with a static label. A deliberate
empty-PATCH guard skips update/audit/event when nothing remains after permission filtering. Spans
`packages/shared` (schema + regenerated api-types), `apps/backend` (use case + docs) and `apps/web`
(pure lib, hook, drawer field, chip, out-of-panel indicator). No migration. One PR, ~27 files.

## Technical Context

**Language/Version**: TypeScript 5.6 strict ESM; Node 24 (CI); React 18  
**Primary Dependencies**: backend Fastify 4 + Prisma 6 + Zod 3; shared Zod 3 + openapi; web React Router 6 + TanStack Query 5 + `@properfy/shared` helpers (`todayInTzDateString`, `addCivilDays`, `isValidIanaTimezone`, `PLATFORM_TIMEZONE`)  
**Storage**: existing `Tenant.settings_json` JSONB — one new optional key, **no migration**  
**Testing**: Vitest (shared/web unit), Supertest (backend integration, use case mocked), Testing Library (web)  
**Target Platform**: web SPA + Node API  
**Project Type**: Web application (3 workspaces: shared → backend → web)  
**Performance Goals**: the window is a query *reduction* (bounded date range); no new load  
**Constraints**: `--max-warnings 0` lint (all three workspaces); api-types must be regenerated and committed (CI `contract-freshness`); first `/map` appointments request must already carry the window (`enabled: windowReady`); never use `user.timezone` for the window  
**Scale/Scope**: 1 schema key, 1 use-case RBAC path + guard, 1 pure lib, 1 hook, 1 drawer field, 1 chip component, ~27 files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | **PASS** | The RBAC path and empty-PATCH guard live in `update-tenant.use-case.ts` (application layer); the route only validates the body and delegates. No domain→infra leak; the schema is in `packages/shared`. |
| II. Multi-Tenant Safety | **PASS (with justification)** | AM/OP are cross-tenant roles per the constitution (§RBAC, v1.3.0); OP writing `mapWindowDays` on any agency is consistent with that model. The widening is **minimized**: `OP_EXTRA_SETTINGS_KEYS = ['mapWindowDays']` — any other key/field is 403, no silent discard. CL_ADMIN/CL_USER stay pinned to their own `tenantId`. Every successful write records `tenant.updated` with the resolved target `tenantId` (§Audit). The real gate is the use-case unit tests (B1–B16, N1–N8); route tests with a mocked use case must not assert the old OP-403. Checklist (feedback `rbac_changes`): `role-matrix` scope comment (no new `canPerform`), 3 canonical RBAC docs updated (P2b), PWA N/A. |
| III. Test-Driven Development | **PASS** | Red→green per the spec's P1–P7 tables (schema S1–S5; use case B1–B16 + N1–N8; route R1–R4; drawer W1–W12; lib L1–L12; hook H1–H18; page M1–M5; chip/indicator C1–C13). |
| IV. Contract-First APIs | **PASS** | The schema change flows through OpenAPI; `pnpm generate:api` regenerates `openapi.json` + `api-types.ts`, both committed (CI freshness gate). No new endpoint; `PATCH /v1/tenants/:tenantId` keeps its shape. |
| V. Simplicity & Minimal Impact | **PASS** | Reuses the existing use-case flow, `FilterDateRange`, `useTenantAdminDetail`, `deepMerge`; adds one pure lib, one hook, one small component. The 1.5k-line `AppointmentMapPage` only gains ~20 wiring lines; the dead `DEFAULT_MAP_FILTERS` is left untouched (not edited, not removed). |

**Deliberate behavior change (approved 2026-10-27):** the empty-PATCH guard (FR-004) stops `tenant.updated`
being written for PATCHes that leave nothing after permission filtering. Documented in the PR and in
`tenant-endpoints.md` (P2b). Narrow guard: equal values still write and audit.

**Knowledge classification:** every FR is an APPROVED RULE (closed task decisions). The cited current
behavior (OP 403 on PATCH; dead `(CL_ADMIN||OP) && actor.tenantId===tenantId` branch; `/map` opens
unbounded) is IMPLEMENTED REALITY, verified by reading the files/tests. No FUTURE GAP is promoted.

## Project Structure

### Documentation (this feature)

```text
specs/037-f00-map-period-window/
├── plan.md · spec.md · research.md · data-model.md · quickstart.md · tasks.md
```
No `contracts/` dir: the only API change is an added optional field on the existing `PATCH /v1/tenants/:tenantId`,
captured in `data-model.md` and the regenerated `openapi.json`.

### Source Code (repository root)

```text
packages/shared/src/schemas/tenant.ts (+.test.ts)      # mapWindowDays + MAP_WINDOW_DAYS_DEFAULT
packages/shared/openapi.json · src/api-types.ts        # regenerated (pnpm generate:api)
apps/backend/src/modules/tenant/application/use-cases/update-tenant.use-case.ts (+ unit/integration tests)
specs/002-tenants-branches/contracts/tenant-endpoints.md · specs/015-permissions-rbac-matrix/spec.md · specs/backend/tenant.spec.md
packages/shared/src/permissions/role-matrix.ts         # scope comment only
apps/web/src/features/appointments/lib/map-period-window.ts (new, +.test)
apps/web/src/features/appointments/hooks/useMapPeriodWindow.ts (new, +.test) · hooks/index.ts
apps/web/src/features/appointments/components/{AppointmentMapFilterPanel,MapWindowChip(new)}.tsx (+tests)
apps/web/src/features/appointments/pages/AppointmentMapPage.tsx (+test)   # ~20 wiring lines
apps/web/src/components/filters/FilterDateRange.tsx (+test)               # min/max + helperText
apps/web/src/features/tenants/{components/TenantFormDrawer,hooks/useTenantAdminSave,hooks/useTenantAdminDetail,types/index}.ts (+tests)
apps/{backend,web}/CLAUDE.md · packages/shared/CLAUDE.md                  # §13.11 workspace docs
```

**Structure Decision**: Stacked within one PR in dependency order shared → backend → web, because the
web code consumes the regenerated `@properfy/shared` types from `dist/` (so `pnpm --filter @properfy/shared build`
runs after P1 and before backend/web). The RBAC widening and the web window are independent slices that
share only the schema key.

## Phase 0 — Research

See [research.md](./research.md). No `NEEDS CLARIFICATION` remained; the non-obvious decisions (timezone
source, empty-PATCH guard, the dead OP branch, `Today + N` vs F09's preset) are recorded there.

## Phase 1 — Design & Contracts

- **data-model.md**: the `mapWindowDays` setting shape + the PATCH RBAC matrix (no relational model).
- **contracts/**: omitted (additive optional field on an existing route; see `openapi.json`).
- **quickstart.md**: the 4-profile browser smoke (P8) + the local gate commands.
- **Agent context**: the three workspace `CLAUDE.md` files are updated as part of the implementation
  (§13.11), not by the generic script.

## Phase 2 — Task ordering (preview; generated by /speckit.tasks)

P1 (shared schema + regen) → build shared → P2/P2a (backend use case + guard) + P2b (docs) → P3 (drawer)
‖ P4 (lib) → P5 (hook) → P6 (page wiring) → P7 (chip + CL clamp) → P7b (out-of-panel indicator) → P8 (QA).
Everything TDD (red test before impl).

## Complexity Tracking

No constitution violations — intentionally empty. (The RBAC widening is justified inline in the
Constitution Check and is the minimal possible scope, so it needs no deviation entry.)
