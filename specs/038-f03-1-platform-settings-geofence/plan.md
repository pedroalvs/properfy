# Implementation Plan: Platform settings registry, GPS precision and configurable geofence for field execution

**Branch**: `038-f03-1-platform-settings-geofence` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/038-f03-1-platform-settings-geofence/spec.md`

## Summary

Deliver the backend + shared foundation of F03: a typed **platform-settings registry** with AM/OP-only audited read/write endpoints, a short-lived read cache, a domain event and an optional save-hook extension point; a **configurable geofence** at inspector check-in (`FLAG`/`BLOCK` with automatic fallback) reading radius/mode from the `fieldEvents` setting; and **richer field-execution capture** (GPS accuracy, device time, distance on both check-in and check-out, a check-in-window flag), plus **coordinate masking** so agency (`CL_*`) roles never read raw inspector coordinates in the audit log. No UI in this task.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM, Node.js 24
**Primary Dependencies**: Fastify 4, Prisma 6, Zod 3, `fastify-type-provider-zod`; shared package (`@properfy/shared`)
**Storage**: PostgreSQL (Supabase) via Prisma. New table `platform_settings`; new nullable/defaulted columns on `inspection_executions` (expand-only). No `tenant_id` on either.
**Testing**: Vitest (shared + backend unit), Supertest route-integration, testcontainers real-PostGIS integration (`tests/integration/db`, serial)
**Target Platform**: Linux server (Fly.io), consumed by web + PWA clients
**Project Type**: Monorepo web service (`apps/backend`) + shared contracts (`packages/shared`)
**Performance Goals**: Settings read served from a 30 s per-instance cache (no DB hit on the hot path); check-in adds one settings read + pure geofence/window math
**Constraints**: expand-only migration; response fields optional (idempotency cache compatibility); last-write-wins on `PUT`; FLAG at rollout (BLOCK dormant); diff ≤ 150 files
**Scale/Scope**: one new backend module (`platform-settings`), extensions to `inspector-execution` and `audit` modules, shared schema additions; ~14 test files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture** — PASS. New `platform-settings` module split into `domain/` (repository port, errors), `application/` (service implementing the shared reader port, use cases, save-hooks map), `infrastructure/` (Prisma repo), `interfaces/` (routes). The shared read port `IPlatformSettingsReader` lives in `shared/domain` (same pattern as `AuditService`) so other modules depend on the interface, not the module. Geofence/window/client-time are pure `domain/` services in `inspector-execution`. Dependencies point inward only.
- **II. Multi-Tenant Safety** — PASS with documented exception. `PlatformSetting` is platform configuration, not tenant business data; it deliberately carries **no `tenant_id`**, the documented exception in CLAUDE.md §7 rule 1 (precedent: `IntegrationSetting`, global `ServiceRegion`). Scope is enforced by RBAC: the API is AM/OP-only (`AuthorizationService.assertRoles`), and internal reads go through the `IPlatformSettingsReader` port (no tenant query). The `platform_setting.updated` audit carries `tenant_id: null` with the actor's tenant in `metadata.actor_tenant_id` (the affected entity has no tenant). A scoping integration test proves CL_ADMIN/CL_USER/INSP/TNT cannot read or write. `InspectionExecution` keeps having no `tenant_id` (pre-existing; unchanged). No business query loses tenant scope.
- **III. TDD** — PASS. All 14 test files (shared, backend unit, integration-db) are written first per the spec's "Tests first" list; coverage of critical paths (geofence, window, masking, RBAC) is explicit. Timezone-dependent tests pin `TZ` away from Sydney.
- **IV. Contract-First APIs** — PASS. All payloads validated with Zod schemas in `packages/shared/src/schemas`; new response fields are `optional()` (expand/contract); `openapi.json` + `api-types.ts` regenerated and committed; `/v1` REST, camelCase, standard error envelope.
- **V. Simplicity** — PASS. One registry key (`fieldEvents`), empty save-hooks map, no speculative abstractions; the registry is extensible by appending keys (a concrete need of F04/F05/F07/F08/F10, not speculative). Pure domain services, no custom framework wheels.

No violations → Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/038-f03-1-platform-settings-geofence/
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
├── enums/field-events.ts                 # NEW: GeofenceMode (F03-2 adds event enums)
├── schemas/platform-settings.ts          # NEW: registry, resolve/isKey, request+response schemas
├── schemas/inspection-execution.ts       # EXTEND: accuracy + clientOccurredAt on start/finish
├── schemas/responses.ts                  # EXTEND: start/finish/detail response fields (optional)
├── schemas/index.ts                      # EXPORT new schema module
└── api-types.ts                          # REGENERATED from openapi.json

apps/backend/src/
├── modules/platform-settings/
│   ├── domain/platform-setting.repository.ts      # IPlatformSettingRepository port
│   ├── domain/platform-settings.errors.ts         # PlatformSettingUnknownKeyError
│   ├── application/platform-settings.service.ts   # implements IPlatformSettingsReader (30 s TTL)
│   ├── application/platform-setting-save-hooks.ts  # type + empty PLATFORM_SETTING_SAVE_HOOKS
│   ├── application/use-cases/{list,get,update}-platform-setting.use-case.ts
│   └── interfaces/platform-settings.routes.ts     # GET list, GET :key, PUT :key (AM/OP)
├── shared/domain/platform-settings.ts             # IPlatformSettingsReader port (cross-module)
├── shared/application/events/domain-event-bus.ts  # EXTEND: PLATFORM_SETTING_EVENTS.UPDATED
├── modules/inspector-execution/
│   ├── domain/geofence.service.ts                 # NEW pure: evaluateGeofence
│   ├── domain/check-in-window.service.ts          # NEW pure: isOutOfCheckInWindow
│   ├── domain/client-occurred-at.ts               # NEW pure: resolveEffectiveEventTime
│   ├── domain/geolocation-distance.service.ts     # EDIT: remove GEOLOCATION_MISMATCH_THRESHOLD_METERS
│   ├── domain/inspection-execution.errors.ts      # EXTEND: GeofenceOutOfRadiusError (422)
│   ├── domain/inspection-execution.entity.ts + .repository.ts  # new fields; update() extended
│   ├── infrastructure/prisma-inspection-execution.repository.ts
│   └── application/use-cases/{start,finish,get-appointment-detail}.use-case.ts  # EXTEND
├── modules/audit/
│   ├── domain/mask-coordinate-keys.ts             # NEW pure helper
│   └── application/use-cases/list-audit-logs.use-case.ts  # EXTEND: mask for CL_ADMIN
└── main/{container,routes}.ts                     # wire the new module + routes

apps/backend/prisma/
├── schema.prisma                                  # PlatformSetting model + execution columns
└── migrations/<ts>_platform_settings_and_execution_geo/  # expand-only (timestamp regenerated)
```

**Structure Decision**: Monorepo web-service layout. A new backend module `platform-settings` owns the registry persistence and endpoints; its read capability is exposed cross-module via a port in `shared/domain` (so `inspector-execution` reads settings without importing the module). The geofence/window/client-time logic are pure domain services in `inspector-execution`. Masking is a pure helper in the `audit` module used by its list use case. Shared contracts live in `packages/shared`.

## Complexity Tracking

No constitution violations — section intentionally empty.
