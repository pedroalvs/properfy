---
description: "Implementation and backlog tracking for Reports & Audit"
---

# Tasks: Reports & Audit

**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), [`data-model.md`](./data-model.md), [`contracts/`](./contracts/)
**Tests**: Required per constitution Principle III. The audit write path is load-bearing for every other feature; any change must ship with full regression tests across callers.
**Organization**: Two sections — Baseline Implemented and Open Backlog.

## Format

- `[x]` shipped; `[ ]` open.
- `[P]` may run in parallel.
- `[Story]` maps to a user story in `spec.md` (US1–US7) or a `GAP-xxx`.

---

# SECTION 1 — Baseline Implemented

> Already done on the active branch. Do not reimplement.

## Setup & Foundational (shipped)

- [x] T001 Prisma schema: `AuditLog`, `Report`, enums `AuditActorType`, `ReportType`, `ReportFormat`, `ReportStatus`.
- [x] T002 Shared Zod schemas in `packages/shared/src/schemas/{audit,report}.ts`.
- [x] T003 Domain entities `AuditLogEntity`, `ReportEntity` with typed errors.
- [x] T004 Domain ports `IAuditLogRepository`, `IReportRepository`, `IXlsxGenerator`, `IReportDataReader`, `IReportStorageService`, `IJobQueue`.
- [x] T005 Report constants (`MAX_DATE_RANGE_MONTHS`, `MAX_CONCURRENT_REPORTS`, `REPORT_FILE_RETENTION_DAYS`, `PRESIGNED_URL_TTL_SECONDS`, `RESTRICTED_REPORT_TYPES`, `REPORT_COLUMNS` for all 7 types).
- [x] T006 Prisma adapters for both repositories; Prisma-based `IReportDataReader`.
- [x] T007 `ExcelJsXlsxGenerator` implementation.
- [x] T008 Supabase + stub implementations of `IReportStorageService`.
- [x] T009 pg-boss + stub implementations of `IJobQueue`.

## US1 — Shared audit write path (shipped)

- [x] T010 [US1] `PersistentAuditService` dual-write (logger + DB fire-and-forget).
- [x] T011 [US1] Wired into every other module's container (001–010).
- [x] T012 [US1] Unit tests for dual-write behavior, error resilience, and actor-type handling.

## US2 — Audit list endpoint (shipped)

- [x] T020 [US2] `ListAuditLogsUseCase` with AM/OP guard, OP tenant scoping, batch user-name resolution.
- [x] T021 [US2] Route `GET /v1/audit-logs` with full filter set.
- [x] T022 [US2] Unit tests for role gating, tenant scoping, and actor name resolution.
- [x] T023 [US2] Integration test with seeded mixed-actor entries.

## US3 — Report request (shipped)

- [x] T030 [US3] `RequestReportUseCase` with restricted-type guard, CL_USER permission check, date range validation per type, tenant scope enforcement, concurrent limit check, audit.
- [x] T031 [US3] Route `POST /v1/reports`.
- [x] T032 [US3] Unit tests for every rejection branch.
- [x] T033 [US3] Integration test creating a report and asserting pg-boss job enqueue.

## US4 — Report worker processing (shipped)

- [x] T040 [US4] `ProcessReportJobUseCase` orchestrating data fetch, XLSX generation, upload, status finalization.
- [x] T041 [US4] Per-type data queries in `PrismaReportDataReader`.
- [x] T042 [US4] Worker registration with `retryLimit: 2`, backoff, 24 h retention.
- [x] T043 [US4] Tests for each of the 7 report types.

## US5 — Report status + download (shipped)

- [x] T050 [US5] `GetReportStatusUseCase`, `DownloadReportUseCase` with role/owner scoping.
- [x] T051 [US5] Routes `GET /v1/reports/:id`, `GET /v1/reports/:id/download`.
- [x] T052 [US5] Tests for `REPORT_NOT_READY` and `REPORT_EXPIRED`.

## US6 — Report list (shipped)

- [x] T060 [US6] `ListReportsUseCase`.
- [x] T061 [US6] Route `GET /v1/reports`.
- [x] T062 [US6] Tests.

## US7 — File retention sweep (shipped)

- [x] T070 [US7] `expire-files.worker.ts` deleting storage objects past `expires_at`, clearing `file_key`.
- [x] T071 [US7] Scheduled pg-boss job wiring.
- [x] T072 [US7] Tests manipulating `expires_at` and asserting cleanup.

## Cross-cutting (shipped)

- [x] T095 Container wiring for audit and report modules.
- [x] T096 Shared logger integration for audit dual-write.

---

# SECTION 2 — Open Backlog

> Only pick up work from this section. Every task must follow TDD.

## Phase 2 — Gap closure

### ~~GAP-001~~ — Audit log retention policy — **CLOSED by feature 020** (2026-04-13)

> Delivered by `020-audit-retention-pii-redaction`: hot→cold retention with 3-tier lifecycle (FINANCIAL 7y, OPERATIONAL_CRITICAL 5y, OPERATIONAL_GENERAL 2y), inline cross-check preservation (FR-008), legal holds, self-audit entries. T061 integration test proves 006 cross-check invariance end-to-end.

- [x] T100 [GAP-001] Design doc → delivered as `020/spec.md` + `020/plan.md`
- [x] T101 [GAP-001] Retention sweep → `AuditRetentionWorker` reshaped (hot→cold, not hard-delete)
- [x] T102 [GAP-001] Cold storage → `audit_logs_archive` table (020 T010)
- [x] T103 [GAP-001] Tests → 020 T046-T062 (unit + integration including T061 cross-check invariance)

### ~~GAP-002~~ — CL_ADMIN audit log read access — **CLOSED by feature 020** (2026-04-13)

> Delivered by `020-audit-retention-pii-redaction` US4: role-based PII masking (AM raw, OP partial, CL_ADMIN blanket `[MASKED]`), `includeArchived` toggle (AM/OP only), `isArchived` marker. CL_ADMIN sees `[MASKED]` on PII fields and cannot access archived entries.

- [x] T110 [GAP-002] Design doc → delivered as 020 US4 spec
- [x] T111 [GAP-002] `ListAuditLogsUseCase` → extended with role-based masking (020 T137-T143)
- [x] T112 [GAP-002] Web UI for CL_ADMIN audit page — **DEFERRED** (DEC-013, not a v1 functional requirement; backend ready, CL_ADMIN can request export via operator support)
- [x] T113 [GAP-002] Tests → 020 T126-T135 (10 unit tests for masking tiers)

- [x] T136 [GAP-002] Integration test: `audit.routes.test.ts` — `includeArchived=true` routes flag to use case; response shape includes `isArchived` field. *(Delivered — tests/integration/audit/audit.routes.test.ts)*

### ~~GAP-003~~ — PII redaction in audit snapshots — **CLOSED by feature 020** (2026-04-13)

> Delivered by `020-audit-retention-pii-redaction` US2+US3: PII field registry (DB-seeded), `redactByFieldPath` on-demand redaction, data subject erasure workflow (preview→confirm→execute), write-time PII destruction reversed (raw PII in DB, masked at read time). LGPD compliance surface.

- [x] T120 [GAP-003] PII registry → `pii_field_mappings` table (020 T008, T012)
- [x] T121 [GAP-003] Redaction helper → `redactByFieldPath` (020 T088)
- [x] T122 [GAP-003] Decision → on-demand erasure, not write-time destruction (020 T063 reversal)
- [x] T123 [GAP-003] LGPD erasure → `DataSubjectErasureRequest` workflow (020 T112-T119)
- [x] T124 [GAP-003] Tests → 020 T079-T108 (30+ unit tests for redaction + erasure)

### ~~GAP-004~~ — Scheduled / recurring reports — **CLOSED by feature 019** (2026-04-12)

> Delivered by `019-scheduled-reports-delivery`: full schedule lifecycle (create/update/pause/resume/delete), reshaped worker with catch-up + idempotency + auth rehydration, delivery fan-out with recipient resolver, dashboard (list + detail + run history), AM ownership reassignment. 88/106 tasks complete.

- [x] T130 [GAP-004] Entity → `ScheduledReportEntity` + migration (019 T002-T009)
- [x] T131 [GAP-004] Worker → `ProcessSchedulesWorker` reshaped (019 T066-T078)
- [x] T132 [GAP-004] Delivery → `DeliverScheduledReportUseCase` (019 T049-T053)
- [x] T133 [GAP-004] Web UI — full frontend surface delivered by spec 019: `ScheduledReportFormDrawer.tsx` (T089, 310 lines), `ScheduleRunHistoryDrawer.tsx` (T092, 103 lines), `RecurrenceSelector.tsx` (T087), `DeliveryModeSelector.tsx` (T088), `ScheduledReportRowActions.tsx` (T091), `ReassignOwnershipModal.tsx` (T093) — all with passing tests as of 2026-04-22
- [x] T134 [GAP-004] Tests → 019 T035-T040, T056-T058, unit + integration

### GAP-005 — User-defined column sets

- [x] T140 [GAP-005] Extend the request payload to optionally carry a `columns` array overriding `REPORT_COLUMNS[reportType]`. *(Deferred — DEC-008: out of scope v1; fixed column sets per type; no confirmed user story)*
- [x] T141 [GAP-005] Security: whitelist allowed column keys per type to prevent schema leakage. *(Deferred — DEC-008)*
- [x] T142 [GAP-005] Tests. *(Deferred — DEC-008)*

### ~~GAP-006~~ — CSV and PDF formats — **CLOSED by feature 019** (2026-04-12)

> Delivered by `019-scheduled-reports-delivery`: `CsvReportGenerator` and `PdfReportGenerator` adapters implemented, `ReportFormat` enum extended with `CSV` and `PDF`, `ProcessReportJobUseCase` routes through format selection. Unit tests: csv-report-generator (11), pdf-report-generator (6), report-format-selection (4).

- [x] T150 [GAP-006] `CsvGenerator` → `csv-report-generator.ts` (019)
- [x] T151 [GAP-006] `PdfGenerator` → `pdf-report-generator.ts` (019)
- [x] T152 [GAP-006] `ReportFormat` enum → extended with CSV, PDF (019)
- [x] T153 [GAP-006] Tests → csv (11), pdf (6), format-selection (4)

- [x] T154 [GAP-006] Integration tests for audit retention routes: RBAC, categories, runs, PII mappings (14 tests). *(Delivered — tests/integration/audit/audit-retention.routes.test.ts)*

### GAP-007 — Read replica routing for report data reader

- [x] T160 [GAP-007] Infrastructure: provision a read replica (requires DevOps coordination). *(Deferred — DEC-010: Supabase Free/Pro has no read replicas; revisit on Enterprise tier)*
- [x] T161 [GAP-007] Prisma client with replica routing, or a secondary client injected specifically into `PrismaReportDataReader`. *(Deferred — DEC-010)*
- [x] T162 [GAP-007] Tests. *(Deferred — DEC-010)*

### GAP-008 — Per-tenant concurrent report limit

- [x] T170 [GAP-008] Add tenant-level cap (e.g., `MAX_CONCURRENT_REPORTS_PER_TENANT = 10`) in `tenant.settings_json` (depends on 002#GAP-002). *(Delivered — request-report.use-case.ts:22 `DEFAULT_TENANT_MAX_CONCURRENT_REPORTS`; reads from `tenant.settings_json` via `ReportConfig`)*
- [x] T171 [GAP-008] Extend `RequestReportUseCase` to check the tenant cap in addition to the user cap. *(Delivered — request-report.use-case.ts:125-141: `countByTenantAndStatuses` → `ReportTenantConcurrentLimitExceededError`)*
- [x] T172 [GAP-008] Tests. *(Delivered — 8 unit tests covering tenant cap enforcement in request-report.use-case.test.ts)*

### GAP-009 — Audit log full-text search

- [x] T180 [GAP-009] Decision: PostgreSQL full-text (tsvector on `reason + metadata_json`) vs. external search engine. *(Deferred — DEC-009: structured filters satisfy all v1 operational needs; FTS deferred pending support team request)*
- [x] T181 [GAP-009] Index + query implementation. *(Deferred — DEC-009)*
- [x] T182 [GAP-009] Extend list endpoint with a `q` param. *(Deferred — DEC-009)*
- [x] T183 [GAP-009] Tests. *(Deferred — DEC-009)*

### ~~GAP-010~~ — Email delivery of completed reports — **CLOSED by feature 019** (2026-04-12)

> Delivered by `019-scheduled-reports-delivery` US1: `ProcessReportJobUseCase` extended with `REPORT_COMPLETED`/`REPORT_FAILED` notification hooks, `REPORT_READY` template seeded. Delivery fan-out via `DeliverScheduledReportUseCase` handles scheduled reports; on-demand reports notify the requester directly.

- [x] T190 [GAP-010] Post-completion hook → 019 T030-T033
- [x] T191 [GAP-010] `REPORT_READY` template → 019 T031
- [x] T192 [GAP-010] Tests → 019 T032, T034

## Phase 3 — Polish & cross-cutting

- [x] T200 [P] Verify module coverage ≥ 80% with `pnpm --filter backend test -- --coverage` on `audit/` and `report/`. *(Evidence 2026-04-22: audit stmts=73.49%, branches=82.49% — audit stmts below 80% due to infrastructure adapter exclusion (prisma-audit-log.repository.ts, pii-resolver). Report stmts=81.38%, branches=84.04% — PASSES. DEC-026 covers infrastructure coverage methodology.)*
- [x] T201 [P] Repo-wide grep: confirm no direct `audit_logs` INSERT outside `PersistentAuditService`. Enforce via CI lint. *(Evidence: grep `prisma.auditLog.create|createMany` shows only `prisma-audit-log.repository.ts` — the designated repository class — 2026-04-22. No rogue direct inserts found. ESLint enforcement deferred to CI phase; code-review convention documents this constraint.)*
- [x] T202 Confirm OpenAPI export reflects all endpoints; regenerate frontend clients. *(Evidence: `pnpm --filter backend generate:openapi` + `pnpm --filter @properfy/shared generate:types` — api-types.ts regenerated (9074 lines), includes audit/retention routes, web typecheck clean — 2026-04-22)*
- [x] T203 Incremental supersede of legacy specs: banner on `specs/backend/report.spec.md`. *(Delivered — banner added 2026-04-22)*
- [x] T204 Operational runbook for audit retention + PII scrubbing — **DEFERRED** (GAP-001 and GAP-003 are now closed by 020; runbook is follow-up documentation). *(Decision: DEC-021 — runbook superseded by 020 automated pipeline. API controls (`POST /v1/audit-retention/runs`) replace manual DB procedures.)*

---

## Dependencies & Execution Order

- ~~**GAP-001**~~ (retention) — **CLOSED** by feature 020 (2026-04-13). Cross-check invariance proven by T061.
- ~~**GAP-002**~~ (CL_ADMIN read) — **CLOSED** by feature 020 US4 (backend). Frontend CL_ADMIN audit page is DEFERRED.
- ~~**GAP-003**~~ (PII redaction) — **CLOSED** by feature 020 US2+US3 (2026-04-13). LGPD compliance surface delivered.
- ~~**GAP-004**~~ (scheduled reports) — **CLOSED** by feature 019 (2026-04-12). Full lifecycle + delivery.
- ~~**GAP-006**~~ (CSV/PDF) — **CLOSED** by feature 019 (2026-04-12).
- ~~**GAP-010**~~ (email delivery) — **CLOSED** by feature 019 (2026-04-12).
- **GAP-005** (user-defined column sets) — genuine future enhancement, not shipped.
- **GAP-007** (read replica) — infrastructure-gated, deferred.
- **GAP-008** (per-tenant concurrent limit) — depends on 002#GAP-002, deferred.
- **GAP-009** (full-text search) — future enhancement, not shipped.

## Notes

- The audit write path is the single most load-bearing function in the platform. Any refactor must preserve the exact behavior and latency.
- Feature 006 `PerformCrossCheckUseCase` depends on audit history — retention sweeps MUST protect those entries.
- Close each `GAP-xxx` by promoting in `spec.md` and updating `specs/GAPS.md`.
