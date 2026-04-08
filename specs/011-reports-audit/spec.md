# Feature Specification: Reports & Audit

**Feature Branch**: `011-reports-audit`
**Created**: 2026-04-05
**Feature Status**: IMPLEMENTED (Phase 1) — pending review for Phase 2/3 gaps
**Sources**:
- Code: `apps/backend/src/modules/{report,audit}/**`, `apps/backend/src/shared/infrastructure/audit/**`, `apps/backend/prisma/schema.prisma`, `packages/shared/src/schemas/{report,audit}.ts`
- Approved rules: `.specify/memory/constitution.md`, `CLAUDE.md`, `projeto-consolidado/regras-negocio-respostas-cliente.md`
- Legacy specs (to be superseded on approval): `specs/backend/report.spec.md`

> **Scope note.** This feature bundles two cross-cutting modules that share an audience (operator dashboards) and a common output surface (files in Supabase Storage):
>
> 1. **Audit** — the platform-wide write path and read surface for security-sensitive events. Every other feature calls `PersistentAuditService.log()` to record actions; a single read endpoint exposes the log to AM and OP.
> 2. **Report** — async XLSX generation for 7 business reports, backed by pg-boss workers, with presigned-URL downloads and a 30-day retention policy.
>
> The audit module is the **most cross-cutting surface** in the platform — every other feature we've migrated (001–010) writes to it. Changes here affect the observability posture of the whole system.
>
> **Reading guide.** Every user story declares `Priority`, `Status`, `Source`. Status: `IMPLEMENTED` | `APPROVED` | `GAP`. Source: `code` | `dossier` | `inferred`.

## User Scenarios & Testing

### User Story 1 — Every feature writes audit records through a shared service

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

Every other feature in the platform (001 identity, 002 tenants, 003 properties, 004 service catalog, 005 service groups, 006 appointments, 007 tenant portal, 008 inspectors, 009 notification templates, 010 billing) calls `PersistentAuditService.log(entry)` to record actions. The service performs a dual write: (a) to the structured application logger with an `audit: true` marker for log aggregation, and (b) to the `audit_logs` database table, fire-and-forget so the caller never blocks on persistence.

**Why this priority**: This is the spine of the platform's observability and compliance story. Without it, critical actions would be invisible in incident response, billing disputes, and legal discovery.

**Independent Test**: Call `PersistentAuditService.log()` from a test harness and confirm (a) a structured log line appears with `audit: true`, (b) a row is inserted into `audit_logs` within a reasonable latency (~100ms), (c) a repository failure during persist does NOT propagate to the caller.

**Acceptance Scenarios**:

1. **Given** any domain use case completes a write that qualifies for audit, **When** it calls `PersistentAuditService.log(entry)`, **Then** a structured log line is emitted with every field (action, actor, entity, tenant, before, after, reason, metadata, requestId, ipAddress) and a `audit_logs` row is persisted asynchronously.
2. **Given** the database persist fails, **When** the error is caught, **Then** the caller's flow is NOT affected; the error is logged at `ERROR` level for operator investigation.
3. **Given** an audit entry with `actorType = SYSTEM` (auto-generated entries, pg-boss workers), **When** persisted, **Then** `actorId` may be null.
4. **Given** an audit entry with `actorType = ANONYMOUS` (tenant portal actions from feature 007), **When** persisted, **Then** `actorId` is null but `ipAddress` is captured for traceability.
5. **Given** any feature produces a `before`/`after` snapshot, **When** persisted, **Then** both JSON payloads are stored verbatim (no redaction by default — see GAP-003).

---

### User Story 2 — Operators query the audit log

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

AM and OP users open the audit log page to investigate an incident or look up the history of a specific appointment, financial entry, or user. The list endpoint supports filters (entity type, entity id, actor id, action code, date range) and paginates. Actor names are batch-resolved from the user repository for display. OP is scoped to their own tenant automatically; AM sees all tenants.

**Why this priority**: Required for every audit/billing/compliance investigation.

**Independent Test**: Seed 5 audit rows with distinct actions and actors. As AM, call `GET /v1/audit-logs` with filters. Confirm (a) pagination works, (b) actor names are resolved, (c) SYSTEM entries display as "System", (d) ANONYMOUS entries display no name.

**Acceptance Scenarios**:

1. **Given** an AM actor, **When** they `GET /v1/audit-logs`, **Then** the response is paginated with every audit row matching the filter; no tenant scoping is applied.
2. **Given** an OP actor with `tenantId` in the token, **When** they call the endpoint, **Then** only audit rows with matching `tenant_id` are returned.
3. **Given** a CL actor or INSP actor, **When** they call the endpoint, **Then** the request is rejected with `FORBIDDEN`. Audit log access is restricted to platform operators.
4. **Given** audit rows with `actorType = USER`, **When** listed, **Then** `actorName` is resolved from the user repository in a batch query (avoids N+1).
5. **Given** audit rows with `actorType = SYSTEM`, **When** listed, **Then** `actorName = "System"` is returned regardless of `actorId`.
6. **Given** audit rows with `actorType = ANONYMOUS`, **When** listed, **Then** `actorName = null` and `ipAddress` is returned for traceability.

---

### User Story 3 — Operator requests an inspection report (async generation)

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

An operator needs a spreadsheet of all `SCHEDULED` inspections for a specific tenant over the last quarter. They submit a request via `POST /v1/reports` specifying `reportType`, date range, and optional filters. The system validates the date range against the per-type maximum, enforces tenant scoping per role, checks the concurrent report limit (3 active per user), creates a `Report` row in `PENDING`, and enqueues a `report.generate` pg-boss job with retry. The response is `202 Accepted` with the report id.

**Why this priority**: Reports are a daily operator tool. Without async generation, long-running queries would time out HTTP connections.

**Independent Test**: Request an `INSPECTIONS_SCHEDULED` report for 3 months. Confirm (a) `202` response with `reportId` and `status = PENDING`, (b) a row exists in `reports`, (c) a `report.generate` job is enqueued, (d) an audit record `reportRequested` is written.

**Acceptance Scenarios**:

1. **Given** an authorized actor, **When** they submit `POST /v1/reports` with valid parameters, **Then** a report is created in `PENDING` and a job is enqueued.
2. **Given** a restricted report type (`INSPECTOR_PERFORMANCE`, `CONFIRMATION_STATUS`, `FINANCIAL_SERVICES`), **When** a non-AM/OP actor requests it, **Then** the request fails with `ReportTypeForbidden`. OP may request these only scoped to their own tenant.
3. **Given** a CL_USER without the `export_reports` permission in `tenant.settings_json.clUserPermissions`, **When** they request any report, **Then** the request fails with `FORBIDDEN`.
4. **Given** a CL_ADMIN or CL_USER with a `tenantId` filter different from their own, **When** submitted, **Then** the request fails with `REPORT_TENANT_SCOPE_VIOLATION`.
5. **Given** a date range exceeding `MAX_DATE_RANGE_MONTHS[reportType]`, **When** submitted, **Then** the request fails with `REPORT_DATE_RANGE_EXCEEDED`.
6. **Given** a user with 3 active reports already (`PENDING` or `PROCESSING`), **When** they request a 4th, **Then** the request fails with `REPORT_CONCURRENT_LIMIT_EXCEEDED` (HTTP 429).

---

### User Story 4 — Background worker generates the report file

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

When a pg-boss worker picks up a `report.generate` job, it calls `ProcessReportJobUseCase` which loads the report row, queries the data (via `IReportDataReader` with type-specific queries), renders an XLSX via `ExcelJsXlsxGenerator` using the per-type column definitions (`REPORT_COLUMNS`), uploads the file to Supabase Storage, and updates the row to `COMPLETED` with `file_key`, `row_count`, `expires_at = now + 30 days`. Failures mark the row `FAILED` with `error_message`. The worker is configured with `retryLimit: 2` and exponential backoff.

**Independent Test**: Use a stub job queue to invoke the worker directly on a seeded report. Confirm (a) the report transitions `PENDING → PROCESSING → COMPLETED`, (b) `file_key` is set, (c) `row_count` reflects the rows written.

**Acceptance Scenarios**:

1. **Given** a `PENDING` report, **When** the worker processes it, **Then** the status flips to `PROCESSING`, data is fetched, an XLSX is generated, uploaded to storage, and the row is finalized with `COMPLETED` + metadata.
2. **Given** a worker failure (data fetch or storage), **When** the error is caught, **Then** the row is marked `FAILED` with `error_message` and `failed_at`. pg-boss retries up to 2 times with backoff.
3. **Given** each of the 7 `ReportType` values, **When** processed, **Then** the appropriate column set from `REPORT_COLUMNS` is applied.

---

### User Story 5 — Operator checks report status and downloads

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

The operator polls `GET /v1/reports/:reportId` to check status. Once `COMPLETED`, they call `GET /v1/reports/:reportId/download` to receive a presigned URL with a 1-hour TTL. If the report has expired (past `expires_at`), the download fails with `REPORT_EXPIRED` (HTTP 410). The expired-files worker cleans up storage objects after retention.

**Acceptance Scenarios**:

1. **Given** an authorized actor (owner of the report, same tenant scope, AM/OP), **When** they `GET /v1/reports/:id`, **Then** the current status, metadata, and download eligibility are returned.
2. **Given** a report in `COMPLETED` status before `expires_at`, **When** download is called, **Then** a presigned URL with a 1-hour TTL is returned.
3. **Given** a report in `PENDING`, `PROCESSING`, or `FAILED` status, **When** download is called, **Then** the request fails with `REPORT_NOT_READY`.
4. **Given** a report past its `expires_at`, **When** download is called, **Then** the request fails with `REPORT_EXPIRED` (HTTP 410).
5. **Given** a non-owner actor, **When** they attempt download, **Then** the request is rejected unless they share the tenant scope (for AM cross-tenant is allowed).

---

### User Story 6 — Operator lists their reports

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

Operators browse a paginated list of their own reports, filtered by type, status, date range.

**Acceptance Scenarios**:

1. **Given** an authorized actor, **When** they `GET /v1/reports`, **Then** results scoped to their own `requested_by_user_id` are returned. AM may query all; OP sees reports within own tenant; CL roles are scoped to own tenant and typically only see their own requests.
2. **Given** filters by `reportType`, `status`, date range, **When** applied, **Then** results match the filter.

---

### User Story 7 — Scheduled file retention cleanup

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

A scheduled pg-boss job (`expire-files.worker.ts`) runs periodically to delete storage objects for reports past their `expires_at`. The DB row is retained with `file_key = null` so users can still see the historical request.

**Acceptance Scenarios**:

1. **Given** a completed report past `expires_at`, **When** the worker runs, **Then** the storage object is deleted and `file_key` is cleared.
2. **Given** a report still within retention, **When** the worker runs, **Then** it is skipped.

---

### Edge Cases

- **Audit fire-and-forget persist**: the DB write is async and errors are logged, not propagated. In a DB outage, audit entries may be lost (structured logs still survive). Mitigation: persistent log aggregation via external system (outside the spec scope).
- **Audit log grows unbounded**: there is no retention policy in Phase 1. Feature 006 cross-check origin lookup (`PerformCrossCheckUseCase`) depends on the presence of historical `appointment.status_transition` entries — any retention policy must exclude these or feature 006 breaks. Tracked as GAP-001.
- **ANONYMOUS actor for tenant portal**: the only caller writing `actorType = ANONYMOUS` is feature 007. Audit consumers (list endpoint, BI tools) must handle this actor type.
- **Report type column sets are hardcoded**: adding a new report type requires adding a column definition and a data query. There is no user-defined report builder (GAP-005).
- **Report format hardcoded to XLSX** despite the `ReportFormat` enum having placeholders. Adding CSV or PDF requires a new generator and plumbing (GAP-006).
- **Presigned URL TTL of 1 hour** is hardcoded (`PRESIGNED_URL_TTL_SECONDS = 3600`). Operators with slow downloads may see expired links; re-requesting via `/download` generates a fresh URL as long as the file still exists.
- **Concurrent limit is per-user, not per-tenant**: a tenant with 3 users can run 9 concurrent reports. Tracked as GAP-008 if contention becomes an issue.
- **CL_USER `export_reports` permission** lives in `tenant.settings_json.clUserPermissions` — depends on 002#GAP-002 for proper schema definition.
- **Audit log read is AM/OP only**: CL_ADMIN cannot view audit trail for their own tenant. Tracked as GAP-002.
- **Report data readers query primary DB**: there is no read-replica routing. Large reports can impact OLTP latency.

## Requirements

### Functional Requirements

All FRs below are `Status: IMPLEMENTED, Source: code` unless otherwise noted.

#### Audit write path

- **FR-001**: System MUST expose a single audit write entry point via `PersistentAuditService.log(entry)`. Every feature that needs to audit an action MUST use this service.
- **FR-002**: System MUST dual-write audit entries: (a) to the structured application logger with `audit: true`, and (b) to the `audit_logs` database table.
- **FR-003**: System MUST NOT block the caller on audit DB persist. Persist errors are logged but not propagated.
- **FR-004**: System MUST accept three `actorType` values: `USER` (regular user actions), `SYSTEM` (automated flows like `CreateFinancialEntriesOnDoneUseCase`), and `ANONYMOUS` (tenant portal feature 007).
- **FR-005**: System MUST preserve `before`/`after` snapshots verbatim as JSONB. Redaction is not performed automatically (GAP-003 for PII).

#### Audit read endpoint

- **FR-010** (`Phase 1 baseline — dossiê mandates audit trail but does not define the read endpoint RBAC`): System MUST restrict `GET /v1/audit-logs` to AM and OP only. CL and INSP actors are forbidden. CL_ADMIN read access is tracked as GAP-002.
- **FR-011**: System MUST scope results to `actor.tenantId` when the caller is OP (OP has mandatory `tenantId`). AM is cross-tenant (`tenantId = null`).
- **FR-012**: System MUST resolve actor names from the user repository in a single batch query to avoid N+1.
- **FR-013**: System MUST support filters: `entityType`, `entityId`, `actorId`, `action`, `fromDate`, `toDate`, plus pagination with sort.

#### Report request

- **FR-020**: System MUST expose `POST /v1/reports` accepting a typed request (`reportType`, `filters`, `format`).
- **FR-021**: System MUST enforce tenant scope: CL_ADMIN/CL_USER cannot request reports for a different tenant (`REPORT_TENANT_SCOPE_VIOLATION`).
- **FR-022** (`Source: dossier — regras-negocio:426-430; reports 5-7 are "Operador" only`): System MUST restrict `INSPECTOR_PERFORMANCE`, `CONFIRMATION_STATUS`, `FINANCIAL_SERVICES` report types to AM and OP actors (`ReportTypeForbidden`). OP is scoped to own tenant for all report types.
- **FR-023**: System MUST require `CL_USER` to have the `export_reports` permission in the tenant's configurable permissions. This depends on the permissions model (001#GAP-003) and tenant settings schema (002#GAP-002) being fully implemented. Until then, the code reads `tenant.settingsJson.clUserPermissions` directly — a functional but schema-unvalidated path.
- **FR-024** (`implementation decision — dossiê does not define date range maximums per report type`): System MUST enforce per-type date range maximums via `MAX_DATE_RANGE_MONTHS`. Current limits: 12 months for most types, 6 months for `CONFIRMATION_STATUS`. These are operational guard rails, not domain rules.
- **FR-025** (`implementation decision — dossiê does not define a concurrent report limit`): System MUST enforce a max of 3 concurrent reports per requesting user (`MAX_CONCURRENT_REPORTS`). This is an operational guard rail to protect worker throughput.
- **FR-026**: System MUST enqueue a `report.generate` pg-boss job with `retryLimit: 2`, `retryBackoff: true`, `retentionHours: 24` after creating the `PENDING` row.
- **FR-027**: System MUST audit `reportRequested` with report id, type, filters, format.

#### Report processing

- **FR-030**: System MUST process reports via `ProcessReportJobUseCase` from the pg-boss worker:
  - Load the `Report` row.
  - Transition `PENDING → PROCESSING` (`started_at = now`).
  - Query data via `IReportDataReader` with the type-specific query.
  - Generate the XLSX via `IXlsxGenerator` using `REPORT_COLUMNS[reportType]`.
  - Upload to Supabase Storage via `IReportStorageService`.
  - Update the row to `COMPLETED` with `file_key`, `row_count`, `expires_at = now + 30 days` (`REPORT_FILE_RETENTION_DAYS`).
- **FR-031**: System MUST set `FAILED` with `error_message` and `failed_at` on any processing error. pg-boss retries up to 2 times.
- **FR-032**: System MUST support all 7 report types with their defined column sets.

#### Report read, download, list

- **FR-040**: System MUST expose `GET /v1/reports/:id` returning current status and metadata.
- **FR-041**: System MUST expose `GET /v1/reports/:id/download` returning a presigned URL with 1-hour TTL (`PRESIGNED_URL_TTL_SECONDS`).
- **FR-042**: System MUST refuse download when the report is not `COMPLETED` (`REPORT_NOT_READY`) or past `expires_at` (`REPORT_EXPIRED`, HTTP 410).
- **FR-043**: System MUST expose `GET /v1/reports` paginated list filtered by the caller's scope.
- **FR-044**: System MUST scope reads by `requested_by_user_id` for non-AM actors when relevant, with tenant-level scoping for CL roles.

#### Retention

- **FR-050**: System MUST run `expire-files.worker.ts` on a schedule to delete storage objects past `expires_at`. The DB row is retained with `file_key = null`.
- **FR-051** (`implementation decision — dossiê does not specify a retention period`): File retention is 30 days from completion (`REPORT_FILE_RETENTION_DAYS`). This is an operational default.

#### Cross-cutting

- **FR-060**: System MUST validate all report payloads via Zod schemas in `packages/shared/src/schemas/report.ts`.
- **FR-061**: System MUST validate all audit list queries via Zod schemas in `packages/shared/src/schemas/audit.ts`.

### Non-Functional Requirements

- **NFR-001** (`Status: APPROVED, Source: dossier`): Audit log write (sync log + async persist) MUST add less than 50 ms to the caller's p95.
- **NFR-002** (`Status: APPROVED, Source: dossier`): Report list/detail p95 < 300 ms.
- **NFR-003** (`Status: APPROVED, Source: dossier`): Report generation p95 < 30 s for up to 10k rows. Longer runs are allowed but should stay under 5 min.
- **NFR-004** (`Status: IMPLEMENTED, Source: code`): Audit logs use `jsonb` for `before`/`after` and are queryable via Postgres JSON operators (no full-text search in Phase 1).
- **NFR-005** (`Status: APPROVED, Source: dossier`): Audit retention policy MUST NOT delete `appointment.status_transition` entries for appointments still awaiting cross-check — feature 006 depends on them.

### Key Entities

- **AuditLog** — `id`, `tenant_id?`, `actor_type` (`USER|SYSTEM|ANONYMOUS`), `actor_id?`, `entity_type`, `entity_id?`, `action`, `reason?`, `before_json?`, `after_json?`, `request_id?`, `ip_address?`, `metadata_json?`, `created_at`.
- **Report** — `id`, `tenant_id?`, `report_type`, `filters_json`, `format`, `status` (`PENDING|PROCESSING|COMPLETED|FAILED`), `file_key?`, `requested_by_user_id`, `started_at?`, `completed_at?`, `failed_at?`, `error_message?`, `row_count?`, `expires_at?`, timestamps.
- **Domain services**: `PersistentAuditService` (write path), `IXlsxGenerator` / `ExcelJsXlsxGenerator` (file generation), `IReportDataReader` (type-specific queries), `IReportStorageService` (Supabase Storage adapter), `IJobQueue` (pg-boss + stub).
- **Constants**: `MAX_DATE_RANGE_MONTHS`, `MAX_CONCURRENT_REPORTS`, `REPORT_FILE_RETENTION_DAYS`, `PRESIGNED_URL_TTL_SECONDS`, `RESTRICTED_REPORT_TYPES`, `REPORT_COLUMNS`.

Full schema in [`data-model.md`](./data-model.md). HTTP contracts in [`contracts/`](./contracts/).

## Success Criteria

- **SC-001**: Every feature 001–010 writes audit records through `PersistentAuditService`. Verified by repo-wide grep for direct `audit_logs` writes (must return zero).
- **SC-002**: Audit persist failure does not fail the caller's flow. Integration test simulates DB outage and asserts the business operation still succeeds.
- **SC-003**: Report concurrent limit is enforced per user. Integration test creates 3 PENDING reports and asserts the 4th request fails with 429.
- **SC-004**: Report date range limits are enforced per type. Unit test asserts each limit.
- **SC-005**: `RESTRICTED_REPORT_TYPES` cannot be requested by non-AM/OP actors.
- **SC-006**: Expired reports fail download with `REPORT_EXPIRED` (410). Integration test manipulates `expires_at` and confirms.
- **SC-007**: Feature 006 cross-check origin lookup continues to work after audit retention runs (requires retention policy that excludes recent `appointment.status_transition` entries — currently no retention exists, so this holds by default).

## Assumptions

**Domain rules** (dossiê-mandated):
- 7 report types are the approved list (`Source: dossier — regras-negocio:417-430`).
- XLSX is the approved export format (`Source: dossier — regras-negocio:450`).
- Reports 5-7 are operator-only (`Source: dossier — regras-negocio:426-430`).
- Async generation for large reports (`Source: dossier — regras-negocio:452-464`).
- Audit for critical actions is mandatory (`Source: dossier — regras-negocio:506-522`).

**Audit dual-write semantics**:
- **DB is the source of truth** for operator tooling (the query surface). Structured logs are a **fallback/safety net** for operational resilience — if the DB persist fails (fire-and-forget), the log stream still captures the event. The two destinations are NOT functionally equivalent: the DB is authoritative and queryable; the log is a backup.
- Audit consumers treat `ANONYMOUS` actor type as equivalent to "tenant portal user" — no further identity resolution is possible.

**Phase 1 implementation defaults** (operational choices — may be adjusted without dossiê amendment):
- Date range limits per report type (`MAX_DATE_RANGE_MONTHS`) — `implementation decision`.
- Concurrent report limit per user (`MAX_CONCURRENT_REPORTS = 3`) — `implementation decision`.
- File retention 30 days (`REPORT_FILE_RETENTION_DAYS`) — `implementation decision`, not a legal requirement.
- Presigned URL TTL 1 hour (`PRESIGNED_URL_TTL_SECONDS`) — `implementation decision`.
- Audit log read restricted to AM/OP — `Phase 1 baseline`. CL_ADMIN read access is GAP-002.
- Report data readers use the primary database. No read replica in Phase 1.
- Reports are one-shot queries. No scheduled/recurring delivery (GAP-004).
- `ReportFormat` enum has `XLSX` only. CSV/PDF are GAP-006.
- `CL_USER export_reports` permission depends on `tenant.settingsJson.clUserPermissions` which relies on 001#GAP-003 (permissions model) and 002#GAP-002 (tenant settings schema). Until those land, the code reads the JSON path directly — functional but schema-unvalidated.

## Known Gaps

> Summary index only. Detail in [`tasks.md`](./tasks.md) under Phase 2.

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Audit log retention policy | H | Audit logs grow unbounded. No retention today. Must not delete `appointment.status_transition` entries for appointments still awaiting cross-check (feature 006 dependency). Also must comply with legal retention (7 years financial, 5 years general). |
| GAP-002 | CL_ADMIN audit log read access | M | CL_ADMIN cannot view audit logs for their own tenant. Expose a tenant-scoped variant with partial field masking (no cross-tenant leakage). |
| GAP-003 | PII redaction in audit before/after snapshots | M | `before_json` and `after_json` store raw values including PII (email, phone, addresses). A retention request from a data subject cannot be fulfilled without reworking the schema. Consider field-level redaction or separate PII sub-table. |
| GAP-004 | Scheduled / recurring reports | M | No cron-based report delivery. Operators re-request the same report every Monday. Add a `ScheduledReport` entity with cron expression and email delivery. |
| GAP-005 | User-defined column sets | L | Column sets are hardcoded. Operators sometimes need custom columns (e.g., exclude the tenant email to avoid bloat). |
| GAP-006 | CSV and PDF output formats | M | Only XLSX in Phase 1. CSV is easier for data analysts; PDF is needed for legal/compliance invoices. The enum exists but no generators. |
| GAP-007 | Report data readers hit primary DB | M | Large reports can slow OLTP. Route read queries to a replica once one exists. |
| GAP-008 | Per-tenant concurrent report limit | L | Limit is per-user (3). A 10-user tenant can run 30 concurrent reports. Add a tenant-level cap to bound worker load. |
| GAP-009 | Audit log full-text search | L | Current filters are structured. Investigations sometimes need free-text search across `reason`, `metadata_json`, actor names. |
| GAP-010 | Email delivery of completed reports | M | Operators currently poll. Send a notification with the download link on completion (pair with feature 009). |
