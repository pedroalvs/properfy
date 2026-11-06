# Implementation Plan: Tenant Arrival ETA Forecast & Templates (Foundation)

**Branch**: `057-f06-1-eta-forecast-templates` | **Date**: 2026-11-06 | **Spec**: `./spec.md`
**Input**: Feature specification from `/specs/057-f06-1-eta-forecast-templates/spec.md`
**Authoritative source**: `fase2-etapa1/tarefas/F06-tarefas.md` §TASK-F06-1 (decisions D1–D19, L-F06-01..11, all closed).

## Summary

Build the dark foundation of F06 (tenant arrival-time notices): the single shared ETA predictor `projectStopEta`, the three `TENANT_ETA_*` template codes (email + SMS) with `etaFrom`/`etaTo` and server-side required-variable validation, the `tenantEtaNotices` platform setting + web section, the per-agency `tenantEtaNoticesEnabled` flag, the manual AM/OP consent opt-out endpoint + web modal, and the plumbing F06-2/F05 consume (`CreateNotificationOutput.created`, SMS cost log/metric, `ITenantEtaPlanReader`). **No notification is sent and no migration is introduced.** The predictor is pure/deterministic and reuses F04's `evaluateSequence` so the inspector app, tenant notices and Live Day never diverge (departure rule `max(anchorEnd ?? now, now)`).

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24; pnpm 9 + Turborepo.
**Primary Dependencies**: shared — Zod 3, F04 `route-planning` (`evaluateSequence`, `DEFAULT_ROUTE_WEIGHTS`); backend — Fastify 4 + `fastify-type-provider-zod`, Prisma 6 (read-only here), existing notification/consent/audit modules; web — React 18, TanStack Query 5, `openapi-fetch`.
**Storage**: PostgreSQL (read-only joins over `day_plans`/`day_plan_stops`/`appointments`/`service_types`/`inspection_executions`/`inspector_field_events`); `notification_consents` write via existing repo. **No schema change / no migration** (FR-024).
**Testing**: Vitest (unit + backend integration), testcontainers (`test:integration:db` for the plan reader), Supertest (opt-out route), React Testing Library (web sections/modal).
**Target Platform**: Fly.io backend (all envs), Vercel web; shared `dist` consumed by backend/web.
**Project Type**: Monorepo web application — `packages/shared`, `apps/backend`, `apps/web`.
**Performance Goals**: `projectStopEta` is O(stops) pure computation (≤ ~a few dozen stops/plan); `IPlatformSettingsReader` keeps its 30 s cache; no new hot path.
**Constraints**: GSM-7-only SMS bodies (1 part with sample data); band formatting in the stop's agency timezone; epoch-only arithmetic (DST-safe); predictor coherence with live F04 contract on `develop` (Plan B removed `routingInput` — reconcile at implementation).
**Scale/Scope**: ~60 changed files estimated (bulk = the ~24 `CreateNotificationUseCase` mock updates); hard cap 150.

## Constitution Check

*GATE: Must pass before Phase 0. Re-checked after Phase 1 design.*

- **I. Clean Architecture (NON-NEGOTIABLE)** — PASS. New `tenant-eta` module splits `domain/` (pure band, id, reader port, constants) from `infrastructure/` (Prisma reader). `projectStopEta` is pure in `shared` (no I/O). Use cases (`RecordConsentOptOutUseCase`) orchestrate; the Prisma reader implements the port. No domain→infra dependency.
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — PASS with recorded exception. `DayPlan`/`DayPlanStop` and the `tenantEtaNotices` `PlatformSetting` are platform-scoped (no `tenant_id`) — the documented F04 D10 / §7.1 exception; scope is guaranteed by RBAC + **no HTTP route exposing the plan reader's cross-tenant result**. The opt-out use case calls `assertTenantScope`. A plan-reader integration test proves two agencies coexist (D9) and reassigned/deleted stops drop out. Coordinate-privacy unchanged (predictor carries no inspector lat/lng).
- **III. TDD (NON-NEGOTIABLE)** — PASS. Every slice has red-green tests enumerated in the task file (shared predictor E1–E14, band, id, templates, payload, upsert, opt-out, create-notification shape, SMS log/metric, plan-reader DB integration, web sections/modal). Tests authored before implementation.
- **IV. Contract-First APIs (NON-NEGOTIABLE)** — PASS. The opt-out route uses a Zod body schema in `packages/shared` (`recordConsentOptOutSchema`); `api-types.ts` regenerated and committed; `tenantEtaNoticesEnabled` flows through the tenant settings schema.
- **V. Simplicity and Minimal Impact** — PASS. No migration, no send, no pipeline change beyond an additive cost log; the predictor reuses F04 rather than reimplementing routing; the opt-out reuses the existing `operator_override` enum and mirrors `OverrideConsentUseCase`.

No violations → Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/057-f06-1-eta-forecast-templates/
├── plan.md              # This file
├── research.md          # Phase 0 — F04 contract reconciliation + decisions
├── data-model.md        # Phase 1 — Eta* types, config, stopMeta, output shapes
├── quickstart.md        # Phase 1 — verification recipe
├── contracts/           # Phase 1 — opt-out route + config + predictor signatures
└── tasks.md             # Phase 2 — /speckit.tasks output
```

### Source Code (repository root)

```text
packages/shared/src/
├── route-planning/
│   ├── project-stop-eta.ts            # projectStopEta, isProjectedLate, etaPlanInputFromDayPlanResponse, Eta* types
│   ├── project-stop-eta.test.ts
│   └── index.ts                       # barrel export (append)
├── constants/
│   ├── notification-templates.ts      # 6 registration points (append)
│   ├── notification-templates.test.ts
│   └── tenant-eta.ts                  # TENANT_ETA_* numeric constants
├── schemas/
│   ├── platform-settings.ts           # tenantEtaNotices key (append)
│   ├── tenant.ts                      # tenantEtaNoticesEnabled (append)
│   ├── notification-consent.ts        # recordConsentOptOutSchema (append/new)
│   └── *.test.ts
└── utils/
    ├── tenant-eta-notices.ts          # isTenantEtaNoticesEnabled
    └── *.test.ts

apps/backend/src/modules/tenant-eta/
├── domain/
│   ├── tenant-eta.constants.ts
│   ├── eta-band.ts                    # computeEtaBand, formatEtaBand, wallTimeHHmm, round/ceil5
│   ├── tenant-eta-notification-id.ts  # getTenantEtaNotificationId (UUID v5)
│   └── tenant-eta-plan.reader.ts      # ITenantEtaPlanReader port
└── infrastructure/
    └── prisma-tenant-eta-plan.reader.ts

apps/backend/src/modules/notification/
├── domain/platform-notification-templates.ts        # 6 seed entries (append)
├── domain/build-notification-payload.service.ts      # eta context
├── application/use-cases/create-notification.use-case.ts   # CreateNotificationOutput.created
├── application/use-cases/send-notification.use-case.ts     # SMS cost log + addSmsParts
├── application/use-cases/upsert-notification-template.use-case.ts  # required-var guard
├── application/use-cases/record-consent-opt-out.use-case.ts        # NEW
└── interfaces/http/notification.routes.ts            # POST /v1/notifications/consents/opt-out
apps/backend/src/modules/inspector-execution/domain/inspector-field-event.repository.ts  # findLatestLateNoticeByAppointmentIds (append)
apps/backend/src/shared/.../metrics-collector.ts      # smsPartsByTemplate

apps/web/src/features/
├── platform-settings/components/TenantEtaNoticesSection.tsx (+ .test.tsx)
├── tenants/components/TenantFormDrawer.tsx (+ types) — tenantEtaNoticesEnabled checkbox
└── notification-consents/components/ConsentOptOutModal.tsx (+ ConsentLookup button) (+ .test.tsx)

packages/shared/src/api-types.ts   # regenerated
```

**Structure Decision**: Monorepo web application. The predictor lives in `packages/shared/src/route-planning/` (single source of truth, consumed by backend F06-2 and F05 and the PWA); backend-only prediction helpers (band, id, reader) live in a new `apps/backend/src/modules/tenant-eta/` module; template/consent/metric changes are appended to existing notification code; web adds two settings surfaces and one modal.

## Complexity Tracking

No constitution violations — not applicable.
