# Report Module – Implementation Spec

**Version:** 1.0
**Module path:** `apps/backend/src/modules/report`
**Last updated:** 2026-03-15

---

## 1. Overview

### Purpose

The Report module provides operators, agencies, and admin master users with on-demand XLSX exports of appointment and financial data. All reports are generated asynchronously via pg-boss jobs. The module owns the lifecycle of a report request: from creation (PENDING), through processing (PROCESSING), to availability (READY) or failure (FAILED).

Reports are stored in Supabase Storage (S3-compatible) and made available via time-limited presigned download URLs. Access is enforced by tenant scope and role-based authorization.

### Report types

| Code | Name | Audience |
|---|---|---|
| `INSPECTIONS_SCHEDULED` | Inspections Scheduled | OP, AM, CL_ADMIN, CL_USER (with perm) |
| `INSPECTIONS_DONE` | Inspections Executed | OP, AM, CL_ADMIN, CL_USER (with perm) |
| `INSPECTIONS_CANCELLED` | Inspections Cancelled | OP, AM, CL_ADMIN, CL_USER (with perm) |
| `INSPECTIONS_REJECTED` | Inspections Rejected | OP, AM, CL_ADMIN, CL_USER (with perm) |
| `INSPECTOR_PERFORMANCE` | Inspector Performance | OP, AM only |
| `CONFIRMATION_STATUS` | Confirmation Status | OP, AM only |
| `FINANCIAL_SERVICES` | Financial Services Executed | OP, AM only |

### Actors

| Actor | Access |
|---|---|
| AM | All report types; all tenants |
| OP | All report types; all tenants |
| CL_ADMIN | Inspection report types (SCHEDULED/DONE/CANCELLED/REJECTED); own tenant only |
| CL_USER | Same as CL_ADMIN if `exportReports` permission enabled on their user profile |

### Domain Boundaries

- Owns: `Report` entity
- Reads: `Appointment`, `AppointmentContact`, `AppointmentRestriction`, `Property`, `ServiceType`, `Inspector`, `Tenant`, `Branch`, `FinancialEntry`, `Notification`
- Produces: XLSX file in Supabase Storage
- Emits: `report.ready`, `report.failed` events
- Consumes: pg-boss job `report.generate`

---

## 2. Data Model

### 2.1 Enums

#### `ReportType`

```prisma
enum ReportType {
  INSPECTIONS_SCHEDULED
  INSPECTIONS_DONE
  INSPECTIONS_CANCELLED
  INSPECTIONS_REJECTED
  INSPECTOR_PERFORMANCE
  CONFIRMATION_STATUS
  FINANCIAL_SERVICES
}
```

#### `ReportStatus`

```prisma
enum ReportStatus {
  PENDING     // Created, job not yet picked up
  PROCESSING  // Job is running
  READY       // File generated and available in S3
  FAILED      // Generation failed; error_message set
}
```

#### `ReportFormat`

```prisma
enum ReportFormat {
  XLSX  // Only format supported in v1
}
```

### 2.2 Entity: `Report`

**Table:** `reports`

| Field | Prisma Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| id | String | No | `uuid()` | PK |
| tenant_id | String | Yes | — | FK → tenants.id; null for AM-scoped platform reports |
| report_type | ReportType | No | — | enum |
| filters_json | Json | No | — | all applied filters as a JSON object |
| format | ReportFormat | No | `XLSX` | enum |
| status | ReportStatus | No | `PENDING` | enum |
| file_key | String | Yes | — | S3 key; null until READY |
| requested_by_user_id | String | No | — | FK → users.id |
| started_at | DateTime | Yes | — | when job started processing |
| completed_at | DateTime | Yes | — | when file was successfully uploaded |
| failed_at | DateTime | Yes | — | when job permanently failed |
| error_message | String | Yes | — | technical error detail for operator review |
| row_count | Int | Yes | — | number of data rows in generated file |
| expires_at | DateTime | Yes | — | when file is deleted from S3 (default: +30 days from completed_at) |
| created_at | DateTime | No | `now()` | |
| updated_at | DateTime | No | `now()` | auto-updated |

```prisma
model Report {
  id                     String       @id @default(uuid())
  tenant_id              String?
  report_type            ReportType
  filters_json           Json
  format                 ReportFormat @default(XLSX)
  status                 ReportStatus @default(PENDING)
  file_key               String?
  requested_by_user_id   String
  started_at             DateTime?
  completed_at           DateTime?
  failed_at              DateTime?
  error_message          String?
  row_count              Int?
  expires_at             DateTime?
  created_at             DateTime     @default(now())
  updated_at             DateTime     @updatedAt

  tenant                 Tenant?      @relation(fields: [tenant_id], references: [id])
  requestedBy            User         @relation(fields: [requested_by_user_id], references: [id])

  @@index([tenant_id])
  @@index([report_type])
  @@index([status])
  @@index([requested_by_user_id])
  @@index([created_at])
  @@index([expires_at])
  @@map("reports")
}
```

### 2.3 Report filters schema

The `filters_json` column stores the full set of filters applied at request time. Structure:

```typescript
interface ReportFilters {
  fromDate: string;         // YYYY-MM-DD, required
  toDate: string;           // YYYY-MM-DD, required
  tenantId?: string;        // AM/OP can specify; CL forced to own
  serviceTypeId?: string;
  branchId?: string;
  inspectorId?: string;
  status?: string;          // AppointmentStatus enum value(s), comma-separated
  tenantConfirmationStatus?: string;  // TenantConfirmationStatus enum value
  search?: string;          // Free-text search: address, tenant name, phone
  emailNotificationStatus?: string;   // NotificationStatus enum value
}
```

---

## 3. Use Cases

### 3.1 `requestReport`

**Actor:** AM, OP, CL_ADMIN, CL_USER (with `exportReports` permission)
**Input:** JWT, `{ reportType, filters, format }`

**Steps:**

1. Validate actor role is permitted to request `reportType` (see Authorization Matrix).
2. Validate `filters.fromDate` and `filters.toDate` are present and `fromDate <= toDate`.
3. Validate date range does not exceed maximum allowed span (see Business Rule 4).
4. Enforce tenant scope:
   - AM/OP: may set any `tenantId` in filters; if omitted, report covers all tenants (AM) or all accessible tenants (OP).
   - CL_ADMIN/CL_USER: `filters.tenantId` is forced to JWT `tenantId`; any provided `tenantId` not matching is rejected with `REPORT_TENANT_SCOPE_VIOLATION`.
5. Validate `reportType` against restricted types (INSPECTOR_PERFORMANCE, CONFIRMATION_STATUS, FINANCIAL_SERVICES require AM/OP role).
6. Create `Report` record with `status = PENDING`, store `filters_json`.
7. Enqueue pg-boss job `report.generate` with `{ reportId }`.
8. Write audit log entry: `reportRequested` action, actor, reportType, filters, tenantScope.
9. Return `{ reportId, status: "PENDING" }`.

### 3.2 `getReportStatus`

**Actor:** AM, OP (any report), CL/INSP (own reports only)
**Input:** JWT, `reportId`

**Steps:**

1. Load `Report` by `reportId`.
2. Validate access: AM/OP can access any report; others can only access reports where `requested_by_user_id = jwt.userId`.
3. Return status, `createdAt`, `startedAt`, `completedAt`, `failedAt`, `rowCount`, `expiresAt`, `errorMessage` (AM/OP only).

### 3.3 `downloadReport`

**Actor:** AM, OP (any report), CL/INSP (own reports only)
**Input:** JWT, `reportId`

**Steps:**

1. Load `Report` by `reportId`; apply same access control as `getReportStatus`.
2. If `status != READY` → `REPORT_NOT_READY`.
3. If `expires_at < now()` → `REPORT_EXPIRED`.
4. If `file_key IS NULL` → `REPORT_FILE_NOT_FOUND` (shouldn't occur if status is READY; defensive check).
5. Generate presigned GET URL from Supabase Storage (TTL: 60 minutes).
6. Return `{ downloadUrl, expiresAt }`.

### 3.4 `listReports`

**Actor:** AM, OP, CL_ADMIN, CL_USER
**Input:** JWT, filters: `reportType`, `status`, `fromDate`, `toDate`

**Steps:**

1. Apply actor scope:
   - AM/OP: see all reports.
   - CL_ADMIN/CL_USER: see only their own reports (`requested_by_user_id = jwt.userId` AND `tenant_id = jwt.tenantId`).
2. Apply filters, paginate (default pageSize 20, max 50).
3. Return list without `error_message` for CL roles.

### 3.5 `processReportJob` (internal — pg-boss worker)

**Input:** `{ reportId }`

**Steps:**

1. Load `Report` by `reportId` where `status = PENDING`.
2. If not found or not PENDING → abort (idempotent).
3. Update `status = PROCESSING`, `started_at = now()`.
4. Dispatch to the correct data extractor based on `report_type`:
   - `INSPECTIONS_SCHEDULED` → query appointments with status `SCHEDULED`
   - `INSPECTIONS_DONE` → query appointments with status `DONE`
   - `INSPECTIONS_CANCELLED` → query appointments with status `CANCELLED`
   - `INSPECTIONS_REJECTED` → query appointments with status `REJECTED`
   - `INSPECTOR_PERFORMANCE` → aggregate query per inspector
   - `CONFIRMATION_STATUS` → query appointments with tenant confirmation breakdown
   - `FINANCIAL_SERVICES` → query financial entries joined with appointments
5. Apply all `filters_json` to the query.
6. Generate XLSX using `exceljs`:
   - Row 1: column headers (see Section 4 per report type)
   - Rows 2+: data rows
   - Freeze top row
   - Auto-width columns
7. Upload XLSX to Supabase Storage at key `reports/{tenantId ?? 'platform'}/{reportType}/{reportId}.xlsx`.
8. Update `Report`: `status = READY`, `file_key`, `completed_at`, `row_count`, `expires_at = completed_at + 30 days`.
9. Emit `report.ready` domain event.
10. On any uncaught error:
    - Update `Report`: `status = FAILED`, `failed_at = now()`, `error_message = error.message`.
    - Emit `report.failed` domain event.

---

## 4. API Contracts

All endpoints require `Authorization: Bearer {JWT}`.

### 4.1 `POST /v1/reports`

**Purpose:** Request async report generation.

**Request body (Zod schema):**

```typescript
const RequestReportSchema = z.object({
  reportType: z.enum([
    "INSPECTIONS_SCHEDULED",
    "INSPECTIONS_DONE",
    "INSPECTIONS_CANCELLED",
    "INSPECTIONS_REJECTED",
    "INSPECTOR_PERFORMANCE",
    "CONFIRMATION_STATUS",
    "FINANCIAL_SERVICES",
  ]),
  filters: z.object({
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
    toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
    tenantId: z.string().uuid().optional(),
    serviceTypeId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    inspectorId: z.string().uuid().optional(),
    status: z.string().optional(),
    tenantConfirmationStatus: z.string().optional(),
    search: z.string().max(200).optional(),
    emailNotificationStatus: z.string().optional(),
  }).refine(
    (f) => new Date(f.toDate) >= new Date(f.fromDate),
    { message: "toDate must be >= fromDate", path: ["toDate"] }
  ),
  format: z.literal("XLSX").default("XLSX"),
});
```

**Response 202:**

```json
{
  "reportId": "uuid",
  "status": "PENDING",
  "reportType": "INSPECTIONS_DONE",
  "createdAt": "2026-03-21T08:00:00.000Z",
  "message": "Report generation queued. Poll GET /v1/reports/{reportId} for status."
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 403 | `FORBIDDEN` | Role not permitted for this reportType |
| 403 | `REPORT_TENANT_SCOPE_VIOLATION` | CL providing a tenantId other than their own |
| 422 | `VALIDATION_ERROR` | Missing fromDate/toDate or invalid format |
| 422 | `REPORT_DATE_RANGE_EXCEEDED` | Date range exceeds maximum allowed span |

### 4.2 `GET /v1/reports`

**Query params:**

| Param | Type | Required | Description |
|---|---|---|---|
| reportType | string | No | ReportType enum value |
| status | string | No | ReportStatus enum value |
| fromDate | string | No | YYYY-MM-DD; filter by created_at >= |
| toDate | string | No | YYYY-MM-DD; filter by created_at <= |
| page | number | No | default 1 |
| pageSize | number | No | default 20, max 50 |

**Response 200:**

```json
{
  "data": [
    {
      "id": "uuid",
      "reportType": "INSPECTIONS_DONE",
      "status": "READY",
      "format": "XLSX",
      "filters": {
        "fromDate": "2026-03-01",
        "toDate": "2026-03-15",
        "tenantId": "uuid"
      },
      "rowCount": 142,
      "requestedBy": { "id": "uuid", "name": "Alice OP" },
      "createdAt": "2026-03-16T07:00:00.000Z",
      "completedAt": "2026-03-16T07:00:45.000Z",
      "expiresAt": "2026-04-15T07:00:45.000Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 8, "totalPages": 1 }
}
```

### 4.3 `GET /v1/reports/:reportId`

**Response 200:**

```json
{
  "id": "uuid",
  "reportType": "INSPECTIONS_DONE",
  "status": "READY",
  "format": "XLSX",
  "filters": { "fromDate": "2026-03-01", "toDate": "2026-03-15" },
  "rowCount": 142,
  "requestedBy": { "id": "uuid", "name": "Alice OP" },
  "createdAt": "2026-03-16T07:00:00.000Z",
  "startedAt": "2026-03-16T07:00:02.000Z",
  "completedAt": "2026-03-16T07:00:45.000Z",
  "expiresAt": "2026-04-15T07:00:45.000Z",
  "errorMessage": null
}
```

**Note:** `errorMessage` is only included in the response for AM/OP roles.

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 404 | `REPORT_NOT_FOUND` | Not found or out of scope |

### 4.4 `GET /v1/reports/:reportId/download`

**Response 200:**

```json
{
  "downloadUrl": "https://supabase-storage.../signed-url...",
  "fileName": "inspections-done-2026-03-01-to-2026-03-15.xlsx",
  "expiresAt": "2026-03-21T09:00:00.000Z"
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 404 | `REPORT_NOT_FOUND` | Not found or out of scope |
| 409 | `REPORT_NOT_READY` | Status is not READY |
| 410 | `REPORT_EXPIRED` | Report file has been deleted |

---

## 5. Business Rules

1. **All reports are generated asynchronously:** No report is generated inline during the HTTP request. Every `POST /v1/reports` call enqueues a pg-boss job and returns `202 Accepted`. There are no synchronous reports.

2. **Required filters: fromDate and toDate:** Every report request must include both `fromDate` and `toDate`. Requests without these fields return `422 VALIDATION_ERROR`.

3. **toDate must be >= fromDate:** If the date range is invalid, return `422 VALIDATION_ERROR` with message on the `toDate` field.

4. **Maximum date range per report type:**

   | Report Type | Max Date Range |
   |---|---|
   | INSPECTIONS_SCHEDULED | 12 months |
   | INSPECTIONS_DONE | 12 months |
   | INSPECTIONS_CANCELLED | 12 months |
   | INSPECTIONS_REJECTED | 12 months |
   | INSPECTOR_PERFORMANCE | 12 months |
   | CONFIRMATION_STATUS | 6 months |
   | FINANCIAL_SERVICES | 12 months |

   Requests exceeding the maximum return `422 REPORT_DATE_RANGE_EXCEEDED`.

5. **Tenant scope enforcement:**
   - AM: can generate reports for any tenant or for all tenants (no `tenantId` filter = platform-wide).
   - OP: same as AM.
   - CL_ADMIN: report scope is always locked to their own `tenantId`. Any request providing a different `tenantId` returns `403 REPORT_TENANT_SCOPE_VIOLATION`.
   - CL_USER: same as CL_ADMIN, plus must have `exportReports` permission flag on their user profile.

6. **Restricted report types:** `INSPECTOR_PERFORMANCE`, `CONFIRMATION_STATUS`, and `FINANCIAL_SERVICES` are only accessible by AM and OP. CL_ADMIN or CL_USER requesting these return `403 FORBIDDEN`.

7. **Report format:** Only `XLSX` is supported in v1. Requests with other format values return `422 VALIDATION_ERROR`.

8. **Report retention:** Reports are stored in S3 for 30 days from `completed_at`. After `expires_at`, the file is deleted from S3 (via a scheduled cron job) and the `Report.status` remains `READY` but `file_key` may be cleared. Requests to download after expiry return `410 REPORT_EXPIRED`.

9. **Access control on download:** Only the user who requested the report OR an AM/OP can download it. CL_ADMIN cannot download another CL_USER's report from the same tenant.

10. **Audit on every request:** Every call to `POST /v1/reports` must write an audit log entry with: `actorId`, `reportType`, `filters` (full copy), `tenantScope`, `requestId`, `timestamp`. This audit log is immutable.

11. **Error message visibility:** The `error_message` field on a FAILED report is only returned in API responses to AM/OP roles. CL users see only that the report failed, not the technical details.

12. **Job retries:** The `report.generate` job retries up to 2 times (total 3 attempts) with exponential backoff (5s, 30s). After all retries exhausted, the job state becomes `failed` in the `pgboss.job` table and the report `status` is set to `FAILED`.

13. **Concurrent report limit:** A single user may have at most 3 reports in `PENDING` or `PROCESSING` status simultaneously. Attempting to create a 4th returns `429 REPORT_CONCURRENT_LIMIT_EXCEEDED`.

14. **XLSX column specifications per report type:**

    **INSPECTIONS_SCHEDULED / DONE / CANCELLED / REJECTED:**
    `Appointment ID | Service Type | Branch | Property Address | Suburb | Postcode | State | Scheduled Date | Time Slot | Status | Tenant Name | Tenant Email | Tenant Phone | Inspector | Confirmation Status | Key Required | Created At`

    **INSPECTOR_PERFORMANCE:**
    `Inspector Name | Inspector Email | Total Scheduled | Total Done | Total Cancelled | Total Rejected | Completion Rate % | Avg Duration (min) | Period`

    **CONFIRMATION_STATUS:**
    `Appointment ID | Service Type | Property Address | Scheduled Date | Tenant Name | Tenant Phone | Confirmation Status | Initial Notice Sent | Last Reminder Sent | Portal Last Accessed | Notes`

    **FINANCIAL_SERVICES:**
    `Appointment ID | Service Type | Tenant (Agency) | Branch | Property Address | Inspector | Scheduled Date | Done Date | Price Amount | Payout Amount | Currency | Tenant Debit Status | Inspector Payout Status`

15. **Search filter:** The `search` field performs a case-insensitive partial match against: property street address, property suburb, appointment contact `tenantName`, appointment contact `primaryPhone`, appointment contact `primaryEmail`.

16. **`emailNotificationStatus` filter:** Filters appointments based on whether the initial inspection notice notification (template `INITIAL_NOTICE`) was successfully delivered (`status = DELIVERED`), failed, or not sent.

---

## 6. Authorization Matrix

| Report Type | AM | OP | CL_ADMIN | CL_USER (with perm) | INSP |
|---|---|---|---|---|---|
| INSPECTIONS_SCHEDULED | All tenants | All tenants | Own tenant | Own tenant | Denied |
| INSPECTIONS_DONE | All tenants | All tenants | Own tenant | Own tenant | Denied |
| INSPECTIONS_CANCELLED | All tenants | All tenants | Own tenant | Own tenant | Denied |
| INSPECTIONS_REJECTED | All tenants | All tenants | Own tenant | Own tenant | Denied |
| INSPECTOR_PERFORMANCE | All tenants | All tenants | Denied | Denied | Denied |
| CONFIRMATION_STATUS | All tenants | All tenants | Denied | Denied | Denied |
| FINANCIAL_SERVICES | All tenants | All tenants | Denied | Denied | Denied |

| Endpoint | AM | OP | CL_ADMIN | CL_USER | INSP |
|---|---|---|---|---|---|
| POST /v1/reports | Allowed | Allowed | Allowed (restricted types) | Allowed (if perm) | Denied |
| GET /v1/reports | All | All | Own only | Own only | Denied |
| GET /v1/reports/:id | Any | Any | Own only | Own only | Denied |
| GET /v1/reports/:id/download | Any | Any | Own only | Own only | Denied |

---

## 7. Domain Events

### `report.ready`

```typescript
{
  event: "report.ready",
  payload: {
    reportId: string,
    reportType: ReportType,
    requestedByUserId: string,
    tenantId: string | null,
    rowCount: number,
    fileKey: string,
    completedAt: string,
    expiresAt: string,
  }
}
```

**Consumers:** Notifications module (optionally notify the requesting user that their report is ready via email or in-app notification); Audit log.

### `report.failed`

```typescript
{
  event: "report.failed",
  payload: {
    reportId: string,
    reportType: ReportType,
    requestedByUserId: string,
    tenantId: string | null,
    failedAt: string,
    errorMessage: string,
  }
}
```

**Consumers:** Notifications module (notify requesting user of failure); Audit log; Operations alerting (if repeated failures of same type).

---

## 8. Queue Jobs

### `report.generate` (async — pg-boss)

**Trigger:** `POST /v1/reports` endpoint.

**Payload:**

```typescript
{
  jobName: "report.generate",
  payload: {
    reportId: string,
  }
}
```

**Queue options (pg-boss):**

```typescript
await boss.send('report.generate', { reportId }, {
  retryLimit: 2,      // 3 total attempts
  retryBackoff: true, // exponential backoff
  retentionHours: 24, // keep completed jobs for 24h
});
```

**Worker registration:**

```typescript
await boss.work('report.generate', async (job) => { /* processReportJob logic */ });
```

**Worker logic:** See Use Case 3.5 (`processReportJob`) for full step-by-step.

**Dead letter queue:** Failed jobs have state `failed` in the `pgboss.job` table. Use `boss.resume(jobId)` to reprocess. Worker should emit `report.failed` event on exhaustion.

### `report.expire-files` (scheduled cron)

**Purpose:** Delete expired report files from Supabase Storage.

**Schedule:** Daily at 03:00 UTC.

**Logic:**

1. Query `Report` where `status = READY` AND `expires_at < now()` AND `file_key IS NOT NULL`.
2. For each record: delete object from Supabase Storage at `file_key`.
3. Update `Report.file_key = NULL` (keep record; status stays READY to show it existed).
4. Log count of cleaned records.

---

## 9. External Integrations

### Supabase Storage (S3-compatible)

**Bucket:** `reports` (configurable via `STORAGE_BUCKET_REPORTS` env var).

**Key pattern:** `reports/{tenantId ?? 'platform'}/{reportType}/{reportId}.xlsx`

**Presigned GET URL TTL:** 60 minutes.

**Object deletion:** Performed by cron job using storage client `remove()`.

### ExcelJS (XLSX generation library)

```typescript
import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Report');

// Set column headers
sheet.columns = reportColumns.map(col => ({
  header: col.label,
  key: col.key,
  width: col.width ?? 20,
}));

// Freeze header row
sheet.views = [{ state: 'frozen', ySplit: 1 }];

// Style header row
sheet.getRow(1).font = { bold: true };

// Add rows
rows.forEach(row => sheet.addRow(row));

// Write to buffer
const buffer = await workbook.xlsx.writeBuffer();
```

---

## 10. Test Scenarios

### Unit Tests (Vitest)

#### `requestReport` use case

- Creates `Report` record with `status = PENDING` and correct `filters_json`.
- Enqueues `report.generate` pg-boss job with `reportId`.
- Writes audit log entry.
- Rejects CL_ADMIN requesting INSPECTOR_PERFORMANCE → `FORBIDDEN`.
- Rejects CL_ADMIN with `tenantId` != own tenant → `REPORT_TENANT_SCOPE_VIOLATION`.
- Rejects `fromDate > toDate` → `VALIDATION_ERROR` on `toDate`.
- Rejects missing `fromDate` → `VALIDATION_ERROR`.
- Rejects date range > maximum → `REPORT_DATE_RANGE_EXCEEDED`.
- Returns existing in-progress report count; rejects 4th concurrent → `REPORT_CONCURRENT_LIMIT_EXCEEDED`.

#### `getReportStatus` use case

- AM can access any report by ID.
- CL_ADMIN can only access own reports; accessing another user's report → `REPORT_NOT_FOUND`.
- FAILED report includes `errorMessage` for AM/OP; null for CL.

#### `downloadReport` use case

- Returns presigned URL for READY report with valid `file_key`.
- Returns `REPORT_NOT_READY` for PENDING/PROCESSING/FAILED status.
- Returns `REPORT_EXPIRED` when `expires_at < now()`.

#### `processReportJob` — INSPECTIONS_DONE report

- Applies all filters (fromDate, toDate, tenantId, serviceTypeId, branchId, status, search).
- Generates correct column headers for INSPECTIONS_DONE.
- Uploads XLSX to correct S3 key path.
- Sets `status = READY`, `row_count`, `completed_at`, `expires_at`.
- Emits `report.ready` event.

#### `processReportJob` — INSPECTOR_PERFORMANCE report

- Aggregates per inspector: total scheduled, done, cancelled, completion rate.
- Applies date range and tenantId filters.

#### `processReportJob` — failure handling

- On DB query error: sets `status = FAILED`, `error_message`, `failed_at`.
- On S3 upload failure: same failure handling.
- Emits `report.failed` event.

#### Tenant scope enforcement unit tests

- AM with no `tenantId` filter → query has no tenant constraint.
- AM with `tenantId` filter → query scoped to that tenant.
- CL_ADMIN → `tenant_id` always = jwt tenantId, even if filter provides different value.

### Integration Tests (Supertest)

#### Full report flow

1. `POST /v1/reports` with valid body → 202, `reportId` returned.
2. `GET /v1/reports/{reportId}` → status `PENDING`.
3. Trigger pg-boss worker (test runner processes job synchronously in tests).
4. `GET /v1/reports/{reportId}` → status `READY`, `rowCount` set.
5. `GET /v1/reports/{reportId}/download` → 200, `downloadUrl` returned.
6. Verify `report.ready` event emitted.
7. Verify audit log entry created with correct actor and filters.

#### Role enforcement

- CL_ADMIN requesting `FINANCIAL_SERVICES` → 403 FORBIDDEN.
- CL_USER without `exportReports` permission → 403 FORBIDDEN.
- CL_USER with `exportReports` permission → 202 for allowed types.
- INSP calling `POST /v1/reports` → 403 FORBIDDEN.

#### Tenant scope

- CL_ADMIN provides `tenantId = other_tenant_id` in filters → 403 REPORT_TENANT_SCOPE_VIOLATION.
- CL_ADMIN provides own `tenantId` → 202 accepted.
- CL_ADMIN omits `tenantId` → 202 accepted; scope automatically set to own tenant.

#### Concurrent limit

- Create 3 reports in PENDING state for one user.
- Create 4th → 429 REPORT_CONCURRENT_LIMIT_EXCEEDED.
- Process one job (status → READY).
- Create new report → 202 accepted (back under limit).

#### Download after expiry

- Report in READY status, `expires_at = past`.
- `GET /download` → 410 REPORT_EXPIRED.

#### `report.expire-files` cron

- Insert report with `expires_at = yesterday`, `file_key` set.
- Run cron job.
- Verify `file_key = NULL` in DB.
- Verify S3 delete was called.

### Edge Cases

- Report with 0 rows (no data matches filters) → XLSX generated with header row only; `row_count = 0`; status = READY.
- Very large report (100,000+ rows): job completes without timeout; stream to S3 rather than buffering entirely in memory.
- Report requested for deleted tenant (soft-deleted) → filters may return 0 rows; no error.
- `search` filter with special characters (apostrophe, SQL injection attempt) → Prisma parameterized queries prevent injection; test explicitly.
- Same `reportId` processed twice (duplicate job delivery) → idempotency check: if `status != PENDING`, abort and return without re-processing.
- `expires_at` cron runs while download is in progress → S3 presigned URL was already issued; download completes successfully even if file is deleted moments later.
