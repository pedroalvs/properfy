# Data Model: Reports & Audit

**Feature**: `011-reports-audit`
**Status**: IMPLEMENTED
**Source**: `apps/backend/prisma/schema.prisma` (`AuditLog`, `Report`, `AuditActorType`, `ReportType`, `ReportFormat`, `ReportStatus`), `apps/backend/src/modules/{audit,report}/domain/**`

All timestamps are `timestamptz`. All IDs are UUID v4. Column names follow `snake_case`; Prisma exposes them as `camelCase`.

## Enums

### `AuditActorType`

```
USER | SYSTEM | ANONYMOUS
```

- `USER` — authenticated human action. `actor_id` references `users.id`.
- `SYSTEM` — automated flow (scheduled jobs, auto-generated financial entries, workers). `actor_id` is null or `SYSTEM_USER_ID`.
- `ANONYMOUS` — tenant portal action (feature 007). `actor_id` is null; `ip_address` is the only identity signal.

### `ReportType`

```
INSPECTIONS_SCHEDULED | INSPECTIONS_DONE | INSPECTIONS_CANCELLED | INSPECTIONS_REJECTED |
INSPECTOR_PERFORMANCE | CONFIRMATION_STATUS | FINANCIAL_SERVICES
```

- The first four share the `INSPECTION_COLUMNS` layout, differing only in the status filter applied by the data reader.
- `INSPECTOR_PERFORMANCE` aggregates by inspector.
- `CONFIRMATION_STATUS` cross-references appointment + tenant portal activity data.
- `FINANCIAL_SERVICES` cross-references appointments + financial entries for revenue reporting.

### `ReportFormat`

```
XLSX
```

Phase 1 only. `ReportFormat` is declared as an enum for future expansion (CSV, PDF — GAP-006).

### `ReportStatus`

```
PENDING | PROCESSING | COMPLETED | FAILED
```

Simple lifecycle driven by the worker. No operator transitions except via re-request.

## Entities

### `audit_logs`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `tenant_id` | uuid | yes | — | FK → `tenants.id`. Null for platform-level actions (e.g., internal user management). |
| `actor_type` | `AuditActorType` | no | — | |
| `actor_id` | uuid | yes | — | FK → `users.id` when `actor_type = USER`. Null otherwise. No FK constraint (kept loose for historical integrity if a user is hard-deleted). |
| `entity_type` | varchar(100) | no | — | Name of the domain entity (`Appointment`, `Tenant`, `FinancialEntry`, ...). |
| `entity_id` | uuid | yes | — | Id of the affected entity when applicable. |
| `action` | varchar(200) | no | — | Dot-separated action code (e.g., `appointment.status_transition`, `tenant_portal.appointment_confirmed`). |
| `reason` | text | yes | — | User-supplied reason for sensitive transitions. |
| `before_json` | jsonb | yes | — | Pre-change snapshot. |
| `after_json` | jsonb | yes | — | Post-change snapshot. |
| `request_id` | varchar(100) | yes | — | Correlates audit entries to a single HTTP request or job run. |
| `ip_address` | varchar(45) | yes | — | IPv4/IPv6. Populated for user and anonymous actions. |
| `metadata_json` | jsonb | yes | — | Additional context (e.g., `{ pendingOperatorCrossCheck: true }`). |
| `created_at` | timestamptz | no | `now()` | |

**Indexes**

- `(entity_type, entity_id)` — most common query pattern (entity history).
- `(actor_id)`
- `(action)`
- `(tenant_id)`
- `(created_at)` — pagination + retention sweeps.

**Invariants**

- `actor_type = USER` ⇒ `actor_id IS NOT NULL` (but no FK — entries survive user deletion).
- `actor_type = ANONYMOUS` ⇒ `actor_id IS NULL` (tenant portal, feature 007).
- `action` is an open string — no enum enforcement. Consumers must handle unknown actions gracefully.
- `before_json` and `after_json` are stored verbatim — they may contain PII. See GAP-003.
- Audit rows are append-only. Retention/deletion is a scheduled operational activity that does NOT delete `appointment.status_transition` entries while the cross-check is still pending on the target appointment (NFR-005).

### `reports`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `tenant_id` | uuid | yes | — | FK → `tenants.id`. Null for platform-wide reports requested by AM. |
| `report_type` | `ReportType` | no | — | |
| `filters_json` | jsonb | no | — | Request parameters (date range, tenant id, status filter, service type, etc.). |
| `format` | `ReportFormat` | no | `XLSX` | |
| `status` | `ReportStatus` | no | `PENDING` | |
| `file_key` | text | yes | — | Supabase Storage object key once the worker completes. |
| `requested_by_user_id` | uuid | no | — | FK → `users.id`. |
| `started_at` | timestamptz | yes | — | Set when worker flips the row to `PROCESSING`. |
| `completed_at` | timestamptz | yes | — | Set on `COMPLETED`. |
| `failed_at` | timestamptz | yes | — | Set on `FAILED`. |
| `error_message` | text | yes | — | Set on `FAILED`. |
| `row_count` | int | yes | — | Row count of the generated file. |
| `expires_at` | timestamptz | yes | — | `completed_at + 30 days`. Driven by `REPORT_FILE_RETENTION_DAYS`. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes**

- `(tenant_id)`
- `(report_type)`
- `(status)` — used by worker + concurrent-limit queries.
- `(requested_by_user_id)` — used by concurrent-limit check.
- `(created_at)`
- `(expires_at)` — used by the expire-files worker.

**Invariants**

- `status = COMPLETED` ⇒ `file_key IS NOT NULL AND completed_at IS NOT NULL AND expires_at IS NOT NULL`.
- `status = FAILED` ⇒ `failed_at IS NOT NULL AND error_message IS NOT NULL`.
- A user cannot have more than 3 reports in `PENDING` or `PROCESSING` simultaneously (`MAX_CONCURRENT_REPORTS`) — `implementation decision`, not a dossiê rule.
- `expires_at - completed_at` is always `REPORT_FILE_RETENTION_DAYS` (30 days) — `implementation decision`, not a dossiê rule.
- After `expires_at`, the expire-files worker clears `file_key` to null but retains the row for historical reference.

## Domain Services

### `PersistentAuditService`

The canonical audit write path. Called by every other module. Signature: `log(entry: AuditLogEntry): void` — returns synchronously; DB write is fire-and-forget.

Dual write (the two destinations are NOT functionally equivalent):

1. **DB (source of truth)**: `IAuditLogRepository.save(AuditLogEntity)` without awaiting the caller — errors caught and logged at `ERROR`. This is the authoritative, queryable record for operator tooling and compliance.
2. **Structured log (fallback/safety net)**: application logger with `{ audit: true, action, actorType, actorId, entityType, entityId, tenantId, requestId, ipAddress, before, after, reason, metadata }`. This survives DB outages but is not queryable by operator tooling — it is a backup for log aggregators.

### `IXlsxGenerator` / `ExcelJsXlsxGenerator`

Renders report data (array of rows) into an XLSX buffer using the column definitions in `REPORT_COLUMNS[reportType]`.

### `IReportDataReader`

Cross-module read adapter. Exposes typed query methods per report type. Production implementation is `PrismaReportDataReader` which issues read-only Prisma queries against the primary DB.

### `IReportStorageService`

Thin wrapper around Supabase Storage. Provides `upload(key, buffer, contentType)` and `createPresignedDownloadUrl(key, ttl)`. Shared with the import workers (features 003 and 006).

### `IJobQueue`

Narrow view over pg-boss used by `RequestReportUseCase` to enqueue `report.generate` with `{ retryLimit: 2, retryBackoff: true, retentionHours: 24 }`. Stub implementation available for tests.

### Constants

- `MAX_DATE_RANGE_MONTHS` — per-type ceilings (12 months for most, 6 for `CONFIRMATION_STATUS`).
- `MAX_CONCURRENT_REPORTS = 3` — per user.
- `REPORT_FILE_RETENTION_DAYS = 30`.
- `PRESIGNED_URL_TTL_SECONDS = 3600` (1 hour).
- `RESTRICTED_REPORT_TYPES` — `['INSPECTOR_PERFORMANCE', 'CONFIRMATION_STATUS', 'FINANCIAL_SERVICES']` — AM/OP only.
- `REPORT_COLUMNS` — map of `ReportType → ReportColumn[]`. See `report.constants.ts` for the definitive column lists.

## Ports (domain interfaces)

### `IAuditLogRepository`

- `save(entity)` — insert. Called fire-and-forget by the audit service.
- `findAll(filters, pagination)` / `count(filters)` — used by list endpoint.
- `findByEntityAction(entityType, entityId, action, limit)` — used by feature 006 `PerformCrossCheckUseCase` to locate who marked DONE.

### `IReportRepository`

- `save(report)` / `update(id, partial)` — insert and status transitions.
- `findById(id)`
- `findAll(filters, pagination)` / `count(filters)` — operator list.
- `countByUserAndStatuses(userId, statuses)` — used by concurrent-limit check.
- `findExpired(now)` — used by expire-files worker.

## Relationships

```
tenants (0..*) [feature 002]
  ├── audit_logs (0..*, optional FK)
  └── reports (0..*, optional FK)

users (1) [feature 001]
  ├── audit_logs (0..*, via actor_id when actor_type = USER)
  └── reports (0..*, requested_by_user_id)

audit_logs ─── (logical reverse FK) ──▶ appointments (via entity_type = 'Appointment', entity_id)
  └── Used by feature 006 PerformCrossCheckUseCase for origin lookup.
```

No hard FKs from audit_logs to other entities — entity references are open strings for flexibility.

## Audit Linkage

- **This feature** writes audits for its own actions:
  - `reportRequested` — when a user requests a new report.
- **Every other feature** writes its audits through `PersistentAuditService` — the list is in each feature's own spec.

## Side Effects Summary

| Use case | Writes | Jobs enqueued | Audit |
|---|---|---|---|
| `PersistentAuditService.log()` | Insert `audit_logs` row (fire-and-forget) | — | (self — this IS the audit) |
| `ListAuditLogsUseCase` | — | — | — (read-only) |
| `RequestReportUseCase` | Insert `reports` row | `report.generate` | `reportRequested` |
| `ProcessReportJobUseCase` (worker) | Update report status, file_key, row_count, expires_at | — | — (worker actions are not audited in Phase 1) |
| `GetReportStatusUseCase` | — | — | — |
| `DownloadReportUseCase` | — | — | — |
| `ListReportsUseCase` | — | — | — |
| `expire-files.worker.ts` | Delete storage object, clear `file_key` | — | — |

## Migration History

Phase 1 schema applied in `apps/backend/prisma/migrations/`. Future expansions — notably retention policies (GAP-001), PII redaction (GAP-003), scheduled reports (GAP-004), and per-tenant concurrent limits (GAP-008) — require expand/contract migrations.
