# Contract Delta — `INSPECTOR_PROGRAM` report

No new routes. The existing report routes gain a new accepted `reportType` enum value. The OpenAPI document and `api-types.ts` are regenerated (`pnpm generate:api`) and committed.

## Enum

`ReportType` (shared `enums/misc.ts` and Prisma `enum ReportType`) gains `INSPECTOR_PROGRAM`. The Zod `requestReportSchema.reportType` / `listReportsQuerySchema.reportType` (`z.nativeEnum(ReportType)`) therefore accept it automatically.

## `POST /v1/reports`

```jsonc
// Request (AM/OP)
{
  "reportType": "INSPECTOR_PROGRAM",
  "filters": { "fromDate": "2026-01-01", "toDate": "2026-03-31" }
}
```

- **201** — `{ reportId, status: "PENDING", reportType: "INSPECTOR_PROGRAM", createdAt }`. The row is persisted with `tenant_id = null`, `agency_scoped = false`, `filters_json.dateAxisField = "period_end"` (any operator-sent `tenantId`/`branchId`/`suburb`/`status`/`groupProperties` is ignored for this type).
- **403** — `ReportForbiddenError` for `CL_ADMIN`/`CL_USER`: `{ error: { code: "AUTH_FORBIDDEN", message: "Agencies cannot generate the INSPECTOR_PROGRAM report" } }`. INSP/TNT have no access to the report surface at all (route guard).
- **422** — `ReportDateRangeExceededError(12)` when the span exceeds 12 months.
- **429** — `ReportConcurrentLimitExceededError` when 3 reports are already PENDING/PROCESSING for the user.

No new 4xx shapes are declared beyond those the report routes already expose (the error envelope is unchanged).

## `GET /v1/reports` (list), `GET /v1/reports/:id` (status), `GET /v1/reports/:id/download`

Unchanged. The list filter `reportType` accepts `INSPECTOR_PROGRAM`; status/download behave as for any other type. An agency cannot read an `INSPECTOR_PROGRAM` run (it is not agency-scoped — `assertReportReadable` already blocks a non-agency-scoped run for an agency actor).

## Generated file

`reports/platform/INSPECTOR_PROGRAM/<reportId>.xlsx` — one worksheet, `INSPECTOR_PROGRAM_COLUMNS` header, one row per reward/no-achievers/skipped closure. Empty range → header only, `READY`, `rowCount 0`.

## Freshness

CI `contract-freshness` fails if `openapi.json`/`api-types.ts` are stale after the enum addition; both are regenerated and committed in this PR.
