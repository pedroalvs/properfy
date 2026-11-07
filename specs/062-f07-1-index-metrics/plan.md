# Implementation Plan: Reliability Index Metrics (backend + shared)

**Branch**: `062-f07-1-index-metrics` | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/062-f07-1-index-metrics/spec.md`

## Summary

Build the pure measurement engine for the inspector reliability index. Shared gains the eight `ReliabilityMetricKey`s with English labels, the `reliabilityIndex` platform setting (weights, `minimumVolume`, `volumeReferenceOverride`, `minimumRatings`), the `reliabilityMetricResultSchema`, and two new `RejectionReasonCode`s (`INSPECTOR_NO_SHOW`, `NOT_EXECUTED`) with a per-origin `allowedRejectionCodesFrom` helper. Backend gains a `reliability` module: a facts reader that loads a period's entire service universe in a fixed seven queries (independent of inspector count, never selecting any coordinate), pure domain functions for each metric + normalization + pro-rata + volume reference + score, and a `ReliabilityMetricsService` exposing `computeMetric`/`computeAll`/`computeAllWith`. The status-transition use case gains a transition-origin guard for the two new codes and writes `metadata.rejectionReasonCode`. One expand-only index (`inspection_executions(finished_at)`) is added. No HTTP endpoint, no job, no UI — those are TASK-F07-2/3.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24
**Primary Dependencies**: Backend — Prisma 6 (`$queryRaw`), Zod 3, Fastify (existing transition route only). Shared — Zod 3. No new runtime dependency.
**Storage**: PostgreSQL (Supabase); reads `inspection_executions`, `appointments`, `tenants`, `service_types`, `inspector_field_events`, `satisfaction_surveys`, `day_plans`/`day_plan_stops`, `audit_logs`. One new index `inspection_executions(finished_at)`; no new table.
**Testing**: Vitest (unit/domain/application), Testcontainers (`test:integration:db` for the facts reader). Domain suite also runs with `TZ=America/Los_Angeles`.
**Target Platform**: Linux server (Fly.io); engine invoked in-process by the F07-2 job and F08.
**Project Type**: Monorepo — backend module (`apps/backend`) + shared contracts (`packages/shared`).
**Performance Goals**: Fixed query count (7) regardless of inspector count; volume-reference median computed once per run from loaded facts (or one extra `loadCompletedCounts` query for the filtered/single paths).
**Constraints**: No inspector latitude/longitude selected into facts, results, failures, or logs (D12 / F03 D10). Pure domain layer (no Prisma import) so F08 can reuse it. 4-decimal rates, 1-decimal half-up score from unrounded rates.
**Scale/Scope**: ~32 files, < 150 changed files. Periods from 1 to 92+ days. Reader validated at 50 inspectors × 20 services with no query growth.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture (NON-NEGOTIABLE)** — PASS. `domain/` holds pure metric math and the `IReliabilityFactsReader` port (zero external deps, no Prisma import). `application/` holds `ReliabilityMetricsService` orchestrating the port + `IPlatformSettingsReader`. `infrastructure/` holds `PrismaReliabilityFactsReader`. Dependencies point inward only.
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — PASS **with documented exception** (see Complexity Tracking). No new business table is added. The facts reader queries operational data scoped by **`inspectorId`** (a cross-tenant subject, D9), never per tenant; it reads `appointments.tenant_id` only to resolve the agency timezone. This matches CLAUDE.md §7.1 rule 8 ("documented platform-scoped scope decision: `inspectorId`") and the precedents `Inspector`, global `ServiceRegion`, `DayPlan`, `PlatformSetting`. The engine is consumed only by AM/OP/SYS; row-level tenant isolation is replaced by RBAC (CL/INSP/TNT → 403 at the F07-2 API) and privacy-by-construction (no coordinate selected). The status-transition change keeps all five existing RBAC sources and the audit requirement.
- **III. Test-Driven Development (NON-NEGOTIABLE)** — PASS. Every file is driven red→green from the test tables in the task (shared enums/schemas, domain per-metric suites, application service with fake reader + fake settings, and the Testcontainers facts-reader suite). Critical path (appointments transition guard, metric math) tested first.
- **IV. Contract-First APIs (NON-NEGOTIABLE)** — PASS. New Zod schemas (`reliabilityIndex` setting, `reliabilityMetricResultSchema`) live in `packages/shared/src/schemas/` and `enums/`; the transition error uses the `{ error: { code, message, details } }` envelope with code `REJECTION_CODE_NOT_ALLOWED`. No new endpoint. `pnpm generate:api` is re-run; a diff in `api-types.ts` appears only if the setting schema is OpenAPI-typed, and is committed with the generated spec.
- **V. Simplicity and Minimal Impact** — PASS. Pure functions, no speculative abstraction, no feature flag. `STUCK_THRESHOLD_HOURS` is moved (not duplicated) to a shared backend module. Untouched: `prisma-inspector-rating.reader.ts`, `getPerformanceRows`, the PERFORMANCE report, all dashboards.

**Result**: Gate PASS. The one deviation (no `tenant_id`) is a sanctioned platform-scoped exception, tracked below.

## Project Structure

### Documentation (this feature)

```text
specs/062-f07-1-index-metrics/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (exported TS contracts, no HTTP)
│   └── reliability-metrics.contract.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── enums/
│   ├── reliability.ts            # NEW: ReliabilityMetricKey, keys, labels, descriptions, ScoreStatus, constants
│   ├── reliability.test.ts       # NEW
│   ├── reason-codes.ts           # EDIT: + INSPECTOR_NO_SHOW, NOT_EXECUTED, REJECTION_CODES_BY_ORIGIN, allowedRejectionCodesFrom
│   ├── reason-codes.test.ts      # EDIT: count + per-origin
│   ├── field-events.ts           # (read-only reference: FieldIssueReason CANT_ATTEND)
│   └── index.ts                  # EDIT: export reliability
├── schemas/
│   ├── platform-settings.ts      # EDIT: reliabilityIndexSettingSchema + registry entry
│   ├── platform-settings.test.ts # EDIT
│   ├── reliability.ts            # NEW: reliabilityMetricResultSchema
│   └── index.ts                  # EDIT: export reliability schema
└── utils/
    └── reason-code-label.ts      # EDIT: + two labels

apps/backend/src/
├── modules/
│   ├── reliability/
│   │   ├── domain/
│   │   │   ├── service-fact.ts            # NEW: ServiceFact + row types
│   │   │   ├── build-service-facts.ts     # NEW: dedupe/annotate raw rows → facts
│   │   │   ├── service-weight.ts          # NEW
│   │   │   ├── punctuality.ts             # NEW
│   │   │   ├── geofence-compliance.ts     # NEW
│   │   │   ├── no-stuck.ts                # NEW
│   │   │   ├── late-notice.ts             # NEW
│   │   │   ├── volume-reference.ts        # NEW: computeVolumeReference
│   │   │   ├── volume-prorata.ts          # NEW: activeDaysInPeriod
│   │   │   ├── metric-failures.ts         # NEW: failures + detail strings
│   │   │   ├── metrics.ts                 # NEW: computeMetricFromFacts
│   │   │   ├── score.ts                   # NEW: computeReliabilityScore, roundHalfUp
│   │   │   ├── reliability-facts.reader.ts# NEW: IReliabilityFactsReader port
│   │   │   └── __fixtures__/service-facts.ts # NEW: buildFact(overrides)
│   │   ├── application/
│   │   │   └── reliability-metrics.service.ts # NEW: ReliabilityMetricsService + exported contracts
│   │   └── infrastructure/
│   │       └── prisma-reliability-facts.reader.ts # NEW: Q1–Q7 + loadCompletedCounts
│   ├── inspector-execution/domain/
│   │   └── stuck-execution.ts            # NEW: export const STUCK_THRESHOLD_HOURS = 6
│   ├── inspector-execution/infrastructure/workers/
│   │   └── notify-stuck.worker.ts        # EDIT: import STUCK_THRESHOLD_HOURS
│   └── appointment/application/use-cases/
│       └── execute-status-transition.use-case.ts # EDIT: guard + metadata.rejectionReasonCode
├── main/
│   └── container.ts                      # EDIT: container.reliability.metricsService
└── prisma/
    ├── schema.prisma                     # EDIT: @@index([finished_at]) on InspectionExecution
    └── migrations/<ts>_inspection_executions_finished_at_idx/migration.sql # NEW

apps/backend/tests/integration/db/
└── reliability-facts.reader.db.test.ts   # NEW (Testcontainers)
```

**Structure Decision**: Backend Clean-Architecture module `apps/backend/src/modules/reliability` + shared contracts in `packages/shared`. The metric math lives entirely in `domain/` (Prisma-free) so TASK-F07-2 (job/snapshot) and F08 (goals) reuse it through the application service and the exported pure functions.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Reliability facts/metrics carry **no `tenant_id`** (deviates from §II "every business entity carries `tenant_id`") | The subject is the inspector, who is cross-tenant (D9): one inspector serves many agencies, and the index must aggregate all of their services. Adding `tenant_id` would make the index per-agency, contradicting the product. Precedents already sanctioned by CLAUDE.md §7.1: `Inspector`, global `ServiceRegion`, `DayPlan`, `PlatformSetting`. | A per-tenant reliability index was rejected by the plan (D4/D9): agencies never see the index or ranking; only AM/OP do. Isolation is provided by RBAC (CL/INSP/TNT → 403 at the F07-2 API, with a scope test there) and by privacy-by-construction here (no coordinate ever selected), which this slice proves with a privacy test. |
| Raw `$queryRaw` SQL in the facts reader instead of Prisma query-builder | Attribution must read `audit_logs.metadata_json` (`releasedInspectorId`, `rejectionReasonCode`), do agency-timezone civil-date conversion (`AT TIME ZONE`), pair audits by nearest `created_at`, and keep a fixed query count for any inspector count — none expressible in the Prisma client. | The Prisma fluent API cannot express timezone-casted date filters, lateral audit pairing, or the `UNION ALL` branches; an N+1 per-inspector approach would violate the fixed-query-count requirement (SC-003). |

*No other deviations. All remaining choices (pure domain, one index, 2-PR backend split) satisfy §V Simplicity.*
