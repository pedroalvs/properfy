# Implementation Plan: Inspectors & Execution

**Branch**: `008-inspectors-execution` | **Date**: 2026-04-05 | **Spec**: [spec.md](./spec.md)
**Feature Status**: IMPLEMENTED (Phase 1) — Phase 2/3 gaps tracked in [tasks.md](./tasks.md).

## Summary

Own the contractor (inspector) lifecycle and the field execution flow. Operators manage the Inspector entity, availability slots, and user-account linking. Inspectors use the PWA to view their daily schedule, start inspections with geolocation, upload photos and signatures via presigned URLs, and finish the inspection — which routes the `SCHEDULED → DONE` transition through feature 006's sovereign state machine. Financial entries remain deferred until operator cross-check.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.

**Primary Dependencies**

- Backend: Fastify, Prisma, Zod, shared `AuditService`, `IIdempotencyService`, pg-boss workers (`expire-assets.worker.ts`, `notify-stuck.worker.ts`).
- Storage: `IStorageService` (real `SupabaseStorageService` + `StubStorageService` for tests). Bucket `inspection-assets`, 15 min presigned URL TTL.
- Cross-module ports: `IAppointmentRepository` + `ExecuteStatusTransitionUseCase` (006), `IInspectorAppointmentChecker` (owned by the inspector module, queries appointments), `IServiceTypeReader` (004 adapter), `IAuditLogRepository` (011 for cross-check lookup).
- Shared: Zod schemas and enums (`InspectorStatus`, `AvailabilitySlotStatus`, `InspectionAssetKind`, `InspectionAssetStatus`).
- Web (operator): `apps/web/src/features/inspectors/`.
- PWA (inspector): `apps/pwa/src/features/{schedule,offers}/`.

**Storage**

- PostgreSQL (Supabase). Tables: `inspectors`, `inspector_availability_slots`, `inspection_executions`, `inspection_assets`, `idempotency_keys` (shared). Writes into `audit_logs`.
- Supabase Storage: `inspection-assets` bucket; objects under `inspections/<tenantId>/<appointmentId>/<assetId>.<ext>`.

**Testing**

- Unit: Vitest — every use case, `T1VisibilityService`, `InspectionTimeWindowService`, MIME type matrix, idempotency cache.
- Integration: Supertest + real Postgres — inspector CRUD, availability slots, full execution flow with stub storage.
- Frontend: Vitest + RTL for operator and PWA pages.

**Target Platform**: Backend on Fly.io. Web on static CDN. PWA installable (mobile Safari + Android Chrome primary).
**Project Type**: Monorepo — backend API + web SPA + PWA + shared package.
**Performance Goals**: Schedule load p95 < 300 ms. Start/finish p95 < 600 ms. Asset request p95 < 200 ms. Background worker lag < 5 min.
**Constraints**: Idempotency mandatory on start/finish. T-1 rule must be enforced consistently. Finish must go through the sovereign state transition. Presigned URLs expire in 15 min.
**Scale/Scope**: Phase 1 target: hundreds of inspectors, thousands of inspections per week.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | Two modules with standard layering. Domain services (`T1VisibilityService`, `InspectionTimeWindowService`) are pure functions. Cross-module reads via ports. The finish use case depends on `ExecuteStatusTransitionUseCase` — documented as a justified cross-module dependency in Complexity Tracking. |
| II. Multi-Tenant Safety | PASS | Inspectors are intentionally cross-tenant (`client_eligibility_json` lists allowed tenants). Execution endpoints scope by `inspectorId` from JWT — an inspector can only act on appointments assigned to them. Cross-tenant reads by CL roles return `NOT_FOUND` rather than leaking existence. **Note**: `regions_json` on the inspector is legacy/transitional — the canonical region coverage source is `inspector_regions` → tenant-scoped `ServiceRegion` (CORRECTION-004 / GAP-002). |
| III. Test-Driven Development | PARTIAL | Unit and integration coverage present. Worker-level tests exist for both scheduled sweeps. Verify 80%+ during review. |
| IV. Contract-First APIs | PASS | Zod schemas in `packages/shared/src/schemas/{inspector,inspector-execution}.ts`. Human projection in [contracts/](./contracts/). |
| V. Simplicity & Minimal Impact | PASS | Each use case maps to one PWA action. No speculative abstractions. The stub storage service exists solely for deterministic tests. |
| VI. State Machine Sovereignty | PASS | `FinishInspectionUseCase` routes `SCHEDULED → DONE` through `ExecuteStatusTransitionUseCase`. Direct DB writes to `appointment.status` are forbidden in this module. Reviewers must reject any future change that bypasses this. |

**Gate result**: PASS for Phase 1 as implemented.

## Project Structure

### Documentation (this feature)

```text
specs/008-inspectors-execution/
├── spec.md
├── plan.md
├── data-model.md
├── contracts/
│   ├── README.md
│   ├── inspector-endpoints.md
│   └── execution-endpoints.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/backend/src/modules/
├── inspector/
│   ├── domain/
│   │   ├── inspector.entity.ts
│   │   ├── inspector.repository.ts           # port
│   │   ├── availability-slot.entity.ts
│   │   ├── availability-slot.repository.ts   # port
│   │   ├── inspector-appointment-checker.ts  # port used by deactivate
│   │   └── inspector.errors.ts
│   ├── application/use-cases/                # CRUD + slots + link + deactivate
│   ├── infrastructure/                       # prisma repos + appointment checker
│   └── interfaces/inspector.routes.ts
└── inspector-execution/
    ├── domain/
    │   ├── inspection-execution.entity.ts
    │   ├── inspection-execution.repository.ts
    │   ├── inspection-asset.entity.ts
    │   ├── inspection-asset.repository.ts
    │   ├── allowed-mime-types.ts              # matrix per asset kind
    │   ├── t1-visibility.service.ts           # pure
    │   ├── inspection-time-window.service.ts  # pure
    │   ├── service-type-reader.ts             # cross-module adapter port
    │   ├── storage.service.ts                 # port
    │   ├── idempotency.service.ts             # port
    │   └── inspection-execution.errors.ts
    ├── application/use-cases/
    │   ├── get-inspector-schedule.use-case.ts
    │   ├── get-appointment-detail.use-case.ts
    │   ├── start-inspection.use-case.ts
    │   ├── finish-inspection.use-case.ts
    │   ├── request-asset-upload.use-case.ts
    │   └── confirm-asset-upload.use-case.ts
    ├── infrastructure/
    │   ├── prisma-inspection-execution.repository.ts
    │   ├── prisma-inspection-asset.repository.ts
    │   ├── prisma-idempotency.service.ts
    │   ├── prisma-service-type-reader.ts
    │   ├── supabase-storage.service.ts
    │   ├── stub-storage.service.ts
    │   └── workers/
    │       ├── expire-assets.worker.ts
    │       └── notify-stuck.worker.ts
    └── interfaces/inspector-execution.routes.ts
```

**Structure Decision**: Two Clean-Architecture modules colocated under `apps/backend/src/modules/`. They share consumers (marketplace, billing, appointments) and a release cadence; migrating them as a single spec-kit feature keeps cross-references readable. A future split is possible if either grows significantly.

## Cross-Feature Dependencies

- **Feature 001-identity-access** — INSP login and JWT. The token carries `inspectorId`, which every PWA endpoint reads to scope operations.
- **Feature 002-tenants-branches** — Tenant active-status check via auth middleware. Inspector deactivation uses `IInspectorAppointmentChecker` which queries appointments scoped by tenant.
- **Feature 004-service-catalog** — `IServiceTypeReader` adapter reads checklist config (`minPhotos`, `requiresSignature`) and `flow_type` for the T-1 rule. Region assignment shares the `InspectorRegion` join table.
- **Feature 005-service-groups-marketplace** — `GetMarketplaceOffersUseCase` is aliased at `/v1/inspector/offers` here for PWA convenience. Inspector `clientEligibilityJson` and `serviceTypesJson` drive marketplace filtering.
- **Feature 006-appointments** — The execution flow is the primary consumer of appointments. `FinishInspectionUseCase` calls `ExecuteStatusTransitionUseCase` for the `SCHEDULED → DONE` transition. `T1VisibilityService` reads `tenant_confirmation_status` and `key_required` from appointments.
- **Feature 007-tenant-portal** — Reschedule use case reads `IInspectionExecutionRepository` to block reschedule when an execution is active.
- **Feature 010-billing-ledger** — Reads inspector payment settings and consumes the `SCHEDULED → DONE` transition (via feature 006) to create `INSPECTOR_PAYOUT` entries after cross-check.
- **Feature 011-reports-audit** — Consumes `inspection_execution.*` audit records.

## Security & Operational Notes

- **Presigned URL TTL is 15 minutes**: short enough to minimize leakage risk. The client must upload immediately after receiving the URL. Expired URLs fail with `ASSET_UPLOAD_EXPIRED`.
- **MIME type whitelist per asset kind**: defined in `allowed-mime-types.ts`. PHOTO accepts `image/jpeg`, `image/png`, `image/heic`, `image/webp`. SIGNATURE accepts `image/svg+xml`, `image/png`. DOCUMENT accepts `application/pdf`, image formats. Any mismatch fails with `ASSET_MIME_TYPE_NOT_ALLOWED`.
- **Storage key layout**: `inspections/<tenantId>/<appointmentId>/<assetId>.<ext>`. Tenant-first prefix enables bucket-level access control policies in Supabase.
- **Geolocation is advisory**: coordinates are captured on start/finish but NOT verified against the property location in Phase 1. Operators cannot detect a remote start today. Tracked as GAP-001.
- **Stuck inspection worker**: `notify-stuck.worker.ts` runs on a schedule and surfaces executions that have been started but not finished within an expected window. This is a safety net for operators, not an automatic state change.
- **Asset retention**: photos live forever in storage in Phase 1. No retention policy (GAP-008).
- **Idempotency is mandatory** on start/finish — enforced by routes throwing `IDEMPOTENCY_KEY_MISSING` on empty header. The retention is 24 h under scopes `start` and `finish`.
- **Cross-module dependency on feature 006** is a deliberate violation of strict decoupling — documented in Complexity Tracking because state-machine sovereignty requires the finish flow to call through the canonical use case.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `FinishInspectionUseCase` directly invokes `ExecuteStatusTransitionUseCase` from feature 006 | The sovereign state transition must run through its canonical use case (Principle VI). Calling it directly is the simplest way to enforce this. | Emitting a domain event and having feature 006 subscribe would decouple but forces the finish call to return before the transition is confirmed, complicating the PWA response shape. |
| Two-step asset upload (request presigned URL, then confirm) | Direct browser → Supabase uploads avoid streaming large files through the backend; the confirm step verifies the object actually landed. | Uploading through the backend would bottleneck the server on mobile uploads of 10+ MB photos. |
| `T1VisibilityService` consumed in two places (schedule list, start use case) | Both need the same rule; duplicating the logic is worse. | Centralizing in a repository method adds a port; acceptable trade-off but tracked as GAP-004 for later. |
| Stub storage service alongside real Supabase adapter | Tests must not make real S3 calls. | Inline mocks drift from the real adapter's interface. |
| Idempotency key required on start/finish | These are money-impact actions on a flaky mobile network; a duplicate retry could create double executions or double state transitions. | Best-effort retries without idempotency would produce duplicate audit trails and break downstream billing. |

## Execution Strategy

> Detailed task definitions in [`tasks.md`](./tasks.md).

### Phase 2 — Gap Closure

#### Wave 1: Quick Fixes + Infrastructure (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 1a | GAP-001 — Geolocation verification | T100–T103 | Distance check using PostGIS (003#GAP-003 done). |
| 1b | GAP-004 — Centralize T-1 rule | T130–T132 | Refactor to single consumption point. |
| 1c | GAP-008 — Asset retention runbook | T170–T171 | Documentation only. |
| 1d | GAP-009 — Typed inspector JSON fields | T180–T183 | Schema enforcement. |

#### Wave 2: Booking + Time Window (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 2a | GAP-002 — Region data consolidation | T110–T113 | Decision + cleanup. |
| 2b | GAP-003 — Availability slot booking | T120–T123 | Capacity management. |
| 2c | GAP-005 — Configurable time window | T140–T143 | Uses tenant settings (002#GAP-002 done). |
| 2d | GAP-010 — Extract time-window service | T190–T192 | Shared service for 006 reuse. |

#### Wave 3: Execution UX (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 3a | GAP-006 — Pause/auto-save | T150–T152 | New endpoint + PWA integration. |
| 3b | GAP-007 — Re-open finished execution | T160–T162 | Decision + implementation. |

```
Wave 1:  GAP-001 ══╗
         GAP-004 ══╬══ (parallel)
         GAP-008 ══╝
         GAP-009 ══╝

Wave 2:  GAP-002 ══╗
         GAP-003 ══╬══ (parallel)
         GAP-005 ══╝
         GAP-010 ══╝

Wave 3:  GAP-006 ══╗
         GAP-007 ══╝ (parallel)
```
| Inspector as cross-tenant entity | Inspectors are contractors; they work for multiple tenants. | Per-tenant inspector records would require duplicate profiles and complicate marketplace matching. |

Phase 1 deviations above are justified. Phase 2 items must add rows here if they introduce new ones.
