# Implementation Plan: Reports & Audit

**Branch**: `011-reports-audit` | **Date**: 2026-04-05 | **Spec**: [spec.md](./spec.md)
**Feature Status**: IMPLEMENTED (Phase 1) — Phase 2/3 gaps tracked in [tasks.md](./tasks.md).

## Summary

Own the platform's observability spine: a shared audit write path used by every other feature, a restricted audit read endpoint, and the async report generation pipeline that produces XLSX exports for 7 business reports with per-type column sets, date range limits, concurrent limits, and 30-day file retention. This feature is a dependency of every other feature — any breaking change here ripples across the platform.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.

**Primary Dependencies**

- Backend: Fastify, Prisma, Zod, pg-boss (report generation + expire-files worker), `exceljs` (XLSX generation), shared logger.
- Storage: `IReportStorageService` with Supabase Storage implementation and stub for tests. Bucket shared with bulk imports (feature 003 / 006).
- Cross-module ports (data readers): read-only queries into appointments, inspectors, financial entries, notifications, tenant portal activities, properties — aggregated via `IReportDataReader`.
- Audit is a **write-path dependency of every other module**; there is no reverse dependency.

**Storage**

- PostgreSQL (Supabase). Tables: `audit_logs`, `reports`. Supabase Storage for generated XLSX files under `reports/<tenantId or global>/<reportId>.xlsx`.

**Testing**

- Unit: Vitest — `PersistentAuditService` dual-write behavior, `ProcessReportJobUseCase` per type, date range validation, concurrent limit, tenant scope, `ExcelJsXlsxGenerator` column rendering.
- Integration: Supertest + real Postgres — full request → process → download happy path. Retention sweep test.
- Worker tests: run the processor with a stub job queue and stub storage.

**Target Platform**: Backend on Fly.io. Operator web portal consumes the read endpoints.
**Project Type**: Monorepo — backend-only.
**Performance Goals**: Audit write < 50 ms added latency. Report list/detail p95 < 300 ms. Report generation p95 < 30 s for typical sizes.
**Constraints**: Audit is fire-and-forget for persist. Report generation is async — no long-running HTTP connections. Tenant scope strictly enforced. Date range limits enforced per type.
**Scale/Scope**: Phase 1: thousands of audit writes per day per active tenant, dozens of reports per day platform-wide.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | Standard layering. `PersistentAuditService` is in `application/services/` because it bridges to the shared logger + domain repo. Report module is a textbook module with pure domain (entities, errors, constants, column definitions) + application use cases + infrastructure (prisma, exceljs, storage, pg-boss). |
| II. Multi-Tenant Safety | PASS | Audit entries carry `tenant_id?`. Read endpoint scopes OP to their own tenant. Reports enforce tenant scope for CL roles at request time and again at data query time. |
| III. Test-Driven Development | PARTIAL | Unit and integration coverage present for every use case. Worker-level tests exist. Verify 80%+ during review. |
| IV. Contract-First APIs | PASS | Zod schemas in `packages/shared/src/schemas/{report,audit}.ts` are authoritative. Human projection in [contracts/](./contracts/). |
| V. Simplicity & Minimal Impact | PASS | Audit is deliberately a single write method. Report is deliberately one request → one worker → one download. No user-defined columns, no scheduled reports, no multi-format — all tracked as explicit gaps rather than speculative features. |

**Gate result**: PASS for Phase 1 as implemented.

## Project Structure

### Documentation (this feature)

```text
specs/011-reports-audit/
├── spec.md
├── plan.md
├── data-model.md
├── contracts/
│   ├── README.md
│   ├── audit-endpoints.md
│   └── report-endpoints.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/backend/src/modules/
├── audit/
│   ├── domain/
│   │   ├── audit-log.entity.ts
│   │   └── audit-log.repository.ts           # port
│   ├── application/
│   │   ├── services/
│   │   │   └── persistent-audit.service.ts    # the write path for every feature
│   │   └── use-cases/
│   │       └── list-audit-logs.use-case.ts
│   ├── infrastructure/
│   │   └── prisma-audit-log.repository.ts
│   └── interfaces/
│       └── audit.routes.ts                    # GET /v1/audit-logs
└── report/
    ├── domain/
    │   ├── report.entity.ts
    │   ├── report.repository.ts               # port
    │   ├── report.errors.ts
    │   ├── report.constants.ts                # column sets, limits, retention
    │   ├── xlsx-generator.ts                  # IXlsxGenerator port
    │   ├── report-data-reader.ts              # IReportDataReader port
    │   ├── report-storage.service.ts          # IReportStorageService port
    │   └── job-queue.ts                       # IJobQueue port (narrow view)
    ├── application/
    │   └── use-cases/
    │       ├── request-report.use-case.ts
    │       ├── process-report-job.use-case.ts    # worker entry point
    │       ├── get-report-status.use-case.ts
    │       ├── download-report.use-case.ts
    │       └── list-reports.use-case.ts
    ├── infrastructure/
    │   ├── prisma-report.repository.ts
    │   ├── prisma-report-data-reader.ts
    │   ├── exceljs-xlsx-generator.ts
    │   ├── supabase-report-storage.service.ts
    │   ├── stub-report-storage.service.ts
    │   ├── pgboss-job-queue.ts
    │   ├── stub-job-queue.ts
    │   └── workers/
    │       └── expire-files.worker.ts
    └── interfaces/
        └── report.routes.ts

apps/backend/src/shared/infrastructure/audit/
└── (legacy `AuditService` interface — `PersistentAuditService` implements it)
```

**Structure Decision**: Two sibling modules under `apps/backend/src/modules/`. The audit module is small but load-bearing. The report module is larger because of the XLSX pipeline and per-type column sets. Bundling them as one spec-kit feature reflects their shared audience (operators) and shared output surface (Supabase Storage + audit write).

## Cross-Feature Dependencies

**Audit as a write-path dependency for every other feature:**

- **Feature 001-identity-access** — writes login, logout, password change, role change audits.
- **Feature 002-tenants-branches** — writes tenant and branch CRUD audits.
- **Feature 003-properties** — writes property CRUD audits.
- **Feature 004-service-catalog** — writes service type, region, pricing rule audits.
- **Feature 005-service-groups-marketplace** — writes service group lifecycle audits.
- **Feature 006-appointments** — writes state transition audits (the most frequent write) including the cross-check origin lookup target.
- **Feature 007-tenant-portal** — writes `actorType = ANONYMOUS` audits for renter actions.
- **Feature 008-inspectors-execution** — writes inspector CRUD + execution audits.
- **Feature 009-notifications** — writes template upsert audits.
- **Feature 010-billing-ledger** — writes financial entry audits (including `SYSTEM` actor).

**Report as a consumer of every other feature's data:**

- Appointments, inspectors, branches, tenants, properties, notifications, tenant portal activities, financial entries — all are read-only sources for the 7 report types.

**Reverse dependency (critical)**: **Feature 006 `PerformCrossCheckUseCase`** reads `audit_logs` to find who marked an appointment `DONE`. Any audit retention policy MUST NOT delete these entries for appointments still in `DONE` without cross-check. Captured as NFR-005 and in GAP-001.

## Security & Operational Notes

- **Audit is fire-and-forget for persist**: DB outages cause audit entries to be lost from the DB but structured logs still survive. For production-grade compliance, an external log aggregator (Loki, Datadog, etc.) should consume the structured log stream and serve as a secondary store.
- **PII in audit snapshots**: `before_json` and `after_json` contain raw values. Any GDPR/LGPD data subject deletion request requires a targeted scrub or the entire audit table becomes a compliance liability. Tracked as GAP-003.
- **Report files are tenant-private**: storage keys encode the tenant id (or `global` for platform-wide reports). Presigned URLs are not guessable, but the 1-hour TTL and 30-day retention limit the blast radius of a leaked link.
- **Report data readers hit primary DB**: large reports can impact OLTP. Monitor `pg_stat_statements` for expensive queries. Tracked as GAP-007.
- **Feature 006 cross-check dependency**: the most load-bearing reverse dependency in the platform. Any change to audit retention or query semantics MUST be reviewed against `PerformCrossCheckUseCase` first.
- **Concurrent limit is per-user**: `MAX_CONCURRENT_REPORTS = 3`. Multi-user tenants can still overload the worker — add a tenant-level cap in GAP-008 if worker contention shows up.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Audit dual-write (logger + DB) | The DB is the queryable source of truth for operator tooling; the logger stream is the compliance safety net in case of DB outages. | Logger-only would lose queryability. DB-only would lose outage resilience. |
| Audit fire-and-forget persist | Blocking on DB writes for audit would couple every business operation to audit availability. Compliance-critical data still lives in the logger. | Synchronous persist would add latency and create cascading failures during DB hiccups. |
| Per-type report column sets and queries (hardcoded) | Each report type has distinct data requirements and formatting. A generic "query builder" would either be too weak or too complex. | User-defined column sets would require a formula language (risk) and a query planner (complexity). |
| Async report generation with pg-boss | XLSX generation for 10k rows can take 10–30 s — longer than an HTTP connection should be held. | Synchronous generation would time out and block a worker thread per request. |
| `IReportDataReader` port abstracting all cross-module reads | Centralizes the query patterns so they are easy to replace (e.g., with a read replica) without touching use cases. | Scattering Prisma queries across use cases would tie them to the primary DB schema directly. |
| Stub storage + stub queue adapters | Tests must run without Supabase or pg-boss. | Real adapters in tests would make CI flaky and slow. |

Phase 1 deviations above are justified. Phase 2 items (scheduled reports, user-defined columns, read replica) must add rows here.

## Execution Strategy

### Phase 2 — Gap Closure

#### Wave 1: Quick Wins + Email Delivery (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 1a | GAP-002 — CL_ADMIN audit read access | T110–T113 | Tenant-scoped, field-masked. |
| 1b | GAP-005 — User-defined column sets | T140–T142 | Schema extension, whitelisted. |
| 1c | GAP-008 — Per-tenant concurrent limit | T170–T172 | Small use case extension. |
| 1d | GAP-009 — Audit full-text search | T180–T183 | PostgreSQL tsvector. |
| 1e | GAP-010 — Email delivery on completion | T190–T192 | Pairs with 009 notifications. |

#### Wave 2: Compliance + Formats (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 2a | GAP-001 — Audit retention policy | T100–T103 | HIGH compliance. Cross-check safety guard. |
| 2b | GAP-003 — PII redaction | T120–T124 | HIGH compliance. |
| 2c | GAP-006 — CSV and PDF formats | T150–T153 | New generators. |

#### Wave 3: Advanced (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 3a | GAP-004 — Scheduled/recurring reports | T130–T134 | New entity + scheduler. |
| 3b | GAP-007 — Read replica routing | T160–T162 | Infrastructure design doc (no replica yet). |

```
Wave 1:  GAP-002 ══╗
         GAP-005 ══╬══
         GAP-008 ══╬══ (all parallel)
         GAP-009 ══╝
         GAP-010 ══╝

Wave 2:  GAP-001 ══╗
         GAP-003 ══╬══ (parallel)
         GAP-006 ══╝

Wave 3:  GAP-004 ══╗
         GAP-007 ══╝ (parallel)
```
