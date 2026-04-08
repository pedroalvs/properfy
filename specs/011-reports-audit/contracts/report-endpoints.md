# Report Endpoints

**Feature**: `011-reports-audit`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/report/interfaces/report.routes.ts`, `packages/shared/src/schemas/report.ts`

All endpoints require a Bearer JWT.

---

## POST `/v1/reports`

Request an asynchronous report generation. Returns `202 Accepted` with a `reportId` — the actual XLSX is produced by a pg-boss worker.

- **Auth**: required
- **Allowed roles**: `AM` (any report type, any tenant); `OP` (any report type, own tenant only); `CL_ADMIN` (non-restricted types on own tenant); `CL_USER` (non-restricted types on own tenant AND requires `export_reports` permission in tenant settings).
- **Audit**: yes (`reportRequested`)

**Request body** (`requestReportSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `reportType` | `ReportType` | yes | One of the 7 types. |
| `format` | `XLSX` | yes | Only XLSX in Phase 1. |
| `filters.fromDate` | date (`YYYY-MM-DD`) | yes | Inclusive. |
| `filters.toDate` | date (`YYYY-MM-DD`) | yes | Inclusive. Must be within per-type maximum (12 months, or 6 for `CONFIRMATION_STATUS`). |
| `filters.tenantId` | uuid | no | CL roles: must match own tenant or be omitted. OP: auto-scoped to own tenant. AM: optional cross-tenant scoping. |
| `filters.serviceTypeId` | uuid | no | |
| `filters.branchId` | uuid | no | |
| `filters.inspectorId` | uuid | no | |
| `filters.status` | string | no | Filter appointments by status. |
| `filters.tenantConfirmationStatus` | string | no | For `CONFIRMATION_STATUS` reports. |
| `filters.search` | string | no | Free-text filter. |
| `filters.emailNotificationStatus` | string | no | For reports cross-referencing notifications. |

**Response 202** (`reportRequestedResponseSchema`)

```json
{
  "data": {
    "reportId": "<uuid>",
    "status": "PENDING",
    "reportType": "INSPECTIONS_SCHEDULED",
    "createdAt": "ISO-8601"
  },
  "message": "Report generation request accepted"
}
```

**Error codes**:

- `AUTH_FORBIDDEN` (CL/INSP without access, or missing `export_reports` permission)
- `REPORT_TYPE_FORBIDDEN` (non-AM/OP requesting a restricted type)
- `REPORT_DATE_RANGE_EXCEEDED` (date range larger than `MAX_DATE_RANGE_MONTHS[reportType]` — `implementation decision`, not a dossiê rule)
- `REPORT_TENANT_SCOPE_VIOLATION` (CL role requesting a different tenant)
- `REPORT_CONCURRENT_LIMIT_EXCEEDED` (HTTP 429 — user has 3 active reports already — `implementation decision`, not a dossiê rule)
- `VALIDATION_ERROR`

---

## GET `/v1/reports`

List the caller's reports with filters and pagination.

- **Auth**: required
- **Allowed roles**: all authenticated roles. Scoping applies: CL roles to own tenant; individual users generally see their own requests.

**Query params** (`listReportsQuerySchema`)

| Name | Type | Notes |
|---|---|---|
| `page`, `pageSize` | int | |
| `reportType` | `ReportType` | |
| `status` | `PENDING\|PROCESSING\|COMPLETED\|FAILED` | |
| `fromDate`, `toDate` | date | |
| `sortBy`, `sortOrder` | | |

**Response 200** (`reportResponseSchema`)

```json
{
  "data": [
    {
      "id": "<uuid>",
      "tenantId": "<uuid|null>",
      "reportType": "INSPECTIONS_SCHEDULED",
      "filtersJson": { "...": "..." },
      "format": "XLSX",
      "status": "COMPLETED",
      "fileKey": "reports/<tenant>/<id>.xlsx",
      "requestedByUserId": "<uuid>",
      "startedAt": "ISO-8601|null",
      "completedAt": "ISO-8601|null",
      "failedAt": "ISO-8601|null",
      "errorMessage": "string|null",
      "rowCount": 842,
      "expiresAt": "ISO-8601|null",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 17
}
```

---

## GET `/v1/reports/:reportId`

Read a single report's current status and metadata. Used by clients polling for completion.

- **Auth**: required
- **Allowed roles**: owner (`requested_by_user_id`) plus tenant-scoped roles; AM cross-tenant.

**Response 200**: same shape as list item.

**Error codes**: `REPORT_NOT_FOUND`, `AUTH_FORBIDDEN`.

---

## GET `/v1/reports/:reportId/download`

Return a presigned URL to download the generated XLSX. TTL is 1 hour (`implementation decision`).

- **Auth**: required
- **Allowed roles**: owner + tenant-scoped roles + AM cross-tenant.

**Response 200** (`reportDownloadResponseSchema`)

```json
{
  "data": {
    "url": "https://...",
    "expiresAt": "ISO-8601",
    "fileName": "inspections-scheduled-2026-04-05.xlsx"
  }
}
```

**Error codes**:

- `REPORT_NOT_FOUND`
- `AUTH_FORBIDDEN`
- `REPORT_NOT_READY` (status is not `COMPLETED`)
- `REPORT_EXPIRED` (past `expires_at` — the storage object has been reaped by the expire-files worker, HTTP 410)
