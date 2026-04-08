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

### GAP-001 — Audit log retention policy (HIGH)

- [ ] T100 [GAP-001] Design doc: legal retention per action type (7 years financial, 5 years general) + operational retention (N days for high-volume entries like login successes).
- [ ] T101 [GAP-001] Scheduled sweep that deletes eligible rows while **preserving all `appointment.status_transition` entries for appointments still in `DONE` without `done_checked_by_user_id`** (feature 006 dependency — NFR-005).
- [ ] T102 [GAP-001] Optional: move old rows to cold storage table before delete.
- [ ] T103 [GAP-001] Tests including the feature 006 cross-check safety guard.

### GAP-002 — CL_ADMIN audit log read access

- [ ] T110 [GAP-002] Design doc: which fields are visible to CL_ADMIN (likely not `beforeJson`/`afterJson` on cross-tenant leakage risks).
- [ ] T111 [GAP-002] `ListAuditLogsUseCase` adapted with a CL_ADMIN scope that forces `tenant_id = actor.tenantId` and strips risky fields.
- [ ] T112 [GAP-002] Web UI for CL_ADMIN audit page.
- [ ] T113 [GAP-002] Tests.

### GAP-003 — PII redaction in audit snapshots (HIGH, compliance)

- [ ] T120 [GAP-003] Define a PII registry: which fields in each entity are PII (email, phone, address, etc.).
- [ ] T121 [GAP-003] Add a redaction helper that masks PII fields in `beforeJson`/`afterJson` before persist.
- [ ] T122 [GAP-003] Decision: mask at write time (irreversible) or store separately and restrict access (reversible). Product + legal input required.
- [ ] T123 [GAP-003] GDPR/LGPD data subject deletion workflow: how to scrub past audit rows that reference a deleted user.
- [ ] T124 [GAP-003] Tests.

### GAP-004 — Scheduled / recurring reports

- [ ] T130 [GAP-004] New `ScheduledReport` entity + Prisma migration (cron expression, delivery target, report config).
- [ ] T131 [GAP-004] Scheduled pg-boss job that enumerates active schedules and spawns `RequestReportUseCase` invocations at the right cron tick.
- [ ] T132 [GAP-004] Delivery: email via feature 009 with the presigned URL (pair with GAP-010).
- [ ] T133 [GAP-004] Web UI for managing schedules.
- [ ] T134 [GAP-004] Tests.

### GAP-005 — User-defined column sets

- [ ] T140 [GAP-005] Extend the request payload to optionally carry a `columns` array overriding `REPORT_COLUMNS[reportType]`.
- [ ] T141 [GAP-005] Security: whitelist allowed column keys per type to prevent schema leakage.
- [ ] T142 [GAP-005] Tests.

### GAP-006 — CSV and PDF formats

- [ ] T150 [GAP-006] Implement `CsvGenerator` adapter (simple, no library beyond Node streams).
- [ ] T151 [GAP-006] Implement `PdfGenerator` via `pdfmake` or `puppeteer` for legal-grade outputs.
- [ ] T152 [GAP-006] Extend `ReportFormat` enum and plumb through `ProcessReportJobUseCase`.
- [ ] T153 [GAP-006] Tests for each format.

### GAP-007 — Read replica routing for report data reader

- [ ] T160 [GAP-007] Infrastructure: provision a read replica (requires DevOps coordination).
- [ ] T161 [GAP-007] Prisma client with replica routing, or a secondary client injected specifically into `PrismaReportDataReader`.
- [ ] T162 [GAP-007] Tests.

### GAP-008 — Per-tenant concurrent report limit

- [ ] T170 [GAP-008] Add tenant-level cap (e.g., `MAX_CONCURRENT_REPORTS_PER_TENANT = 10`) in `tenant.settings_json` (depends on 002#GAP-002).
- [ ] T171 [GAP-008] Extend `RequestReportUseCase` to check the tenant cap in addition to the user cap.
- [ ] T172 [GAP-008] Tests.

### GAP-009 — Audit log full-text search

- [ ] T180 [GAP-009] Decision: PostgreSQL full-text (tsvector on `reason + metadata_json`) vs. external search engine.
- [ ] T181 [GAP-009] Index + query implementation.
- [ ] T182 [GAP-009] Extend list endpoint with a `q` param.
- [ ] T183 [GAP-009] Tests.

### GAP-010 — Email delivery of completed reports

- [ ] T190 [GAP-010] `ProcessReportJobUseCase` post-completion hook that calls feature 009 `CreateNotificationUseCase` with the `REPORT_READY` template (new template code).
- [ ] T191 [GAP-010] New `REPORT_READY` template in shared constants and seed data.
- [ ] T192 [GAP-010] Tests.

## Phase 3 — Polish & cross-cutting

- [ ] T200 [P] Verify module coverage ≥ 80% with `pnpm --filter backend test -- --coverage` on `audit/` and `report/`.
- [ ] T201 [P] Repo-wide grep: confirm no direct `audit_logs` INSERT outside `PersistentAuditService`. Enforce via CI lint.
- [ ] T202 Confirm OpenAPI export reflects all endpoints; regenerate frontend clients.
- [ ] T203 Incremental supersede of legacy specs: banner on `specs/backend/report.spec.md`.
- [ ] T204 Operational runbook for audit retention + PII scrubbing (once GAP-001 and GAP-003 land).

---

## Dependencies & Execution Order

- **GAP-001** (retention) is HIGH priority for compliance but depends on a review of feature 006's cross-check dependency. Coordinate with feature 006 maintainers first.
- **GAP-003** (PII redaction) is HIGH priority for data subject rights. Coordinate with legal.
- **GAP-004** (scheduled reports) pairs with GAP-010 (email delivery) for a complete recurring-delivery flow.
- **GAP-007** (read replica) is infrastructure-gated and can be scheduled independently.
- **GAP-008** depends on 002#GAP-002 (tenant settings schema).

## Notes

- The audit write path is the single most load-bearing function in the platform. Any refactor must preserve the exact behavior and latency.
- Feature 006 `PerformCrossCheckUseCase` depends on audit history — retention sweeps MUST protect those entries.
- Close each `GAP-xxx` by promoting in `spec.md` and updating `specs/GAPS.md`.
