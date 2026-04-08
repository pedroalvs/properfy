# GAP-010: Exception-Type Usage Report — Design Document

**Status**: Design specification (no code changes in this gap)
**Coordinates with**: Feature 011-reports-audit

---

## Problem

`exception_type` and `exception_reason` are captured at service group creation but never surfaced in reports or cross-tenant analytics. Operations staff cannot see how often each exception is used, by which tenant, or whether exceptions are being abused.

## Report Card Definition

### Exception-Type Usage Report

**Name**: Exception Usage Summary
**Audience**: AM, OP
**Scope**: Cross-tenant (AM) or own-tenant (OP)

#### Dimensions

| Dimension | Source |
|---|---|
| `tenant_id` / `tenant_name` | `service_groups` JOIN `tenants` |
| `exception_type` | `service_groups.exception_type` |
| Period (month/week) | `service_groups.created_at` |

#### Metrics

| Metric | Description |
|---|---|
| `total_groups` | Total service groups created in the period |
| `exception_count` | Groups created with a non-null `exception_type` |
| `exception_rate` | `exception_count / total_groups` as percentage |
| `by_type_count` | Breakdown count per `exception_type` value |
| `avg_group_size` | Average `group_size` for exception groups (vs. standard) |
| `top_reasons` | Most frequent `exception_reason` values (truncated, top 10) |

#### Filters

- Date range (required)
- Tenant (optional, AM only)
- Exception type (optional)

### SQL Query Pattern

```sql
-- Summary by tenant and exception type for a given period
SELECT
  t.id                          AS tenant_id,
  t.name                        AS tenant_name,
  sg.exception_type,
  COUNT(*)                      AS exception_count,
  ROUND(AVG(sg.group_size), 1)  AS avg_group_size,
  MIN(sg.created_at)            AS earliest,
  MAX(sg.created_at)            AS latest
FROM service_groups sg
JOIN tenants t ON t.id = sg.tenant_id
WHERE sg.exception_type IS NOT NULL
  AND sg.created_at >= :start_date
  AND sg.created_at <  :end_date
  -- Optional: AND sg.tenant_id = :tenant_id
  -- Optional: AND sg.exception_type = :exception_type
GROUP BY t.id, t.name, sg.exception_type
ORDER BY exception_count DESC;

-- Exception rate per tenant
SELECT
  t.id                          AS tenant_id,
  t.name                        AS tenant_name,
  COUNT(*)                                                          AS total_groups,
  COUNT(*) FILTER (WHERE sg.exception_type IS NOT NULL)             AS exception_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE sg.exception_type IS NOT NULL)
    / NULLIF(COUNT(*), 0),
    1
  )                                                                 AS exception_rate_pct
FROM service_groups sg
JOIN tenants t ON t.id = sg.tenant_id
WHERE sg.created_at >= :start_date
  AND sg.created_at <  :end_date
GROUP BY t.id, t.name
ORDER BY exception_rate_pct DESC;

-- Top exception reasons (for drill-down)
SELECT
  sg.exception_type,
  sg.exception_reason,
  COUNT(*) AS usage_count
FROM service_groups sg
WHERE sg.exception_type IS NOT NULL
  AND sg.created_at >= :start_date
  AND sg.created_at <  :end_date
  -- Optional: AND sg.tenant_id = :tenant_id
GROUP BY sg.exception_type, sg.exception_reason
ORDER BY usage_count DESC
LIMIT 10;
```

### Implementation Notes for Feature 011-reports-audit

1. **Report type**: Register as `EXCEPTION_USAGE` in the report type enum.
2. **Report generator**: Implement as a `ExceptionUsageReportGenerator` that receives date range, optional tenant filter, and optional exception type filter.
3. **Output format**: XLSX with three sheets — Summary, Rate by Tenant, Top Reasons.
4. **Scheduling**: This report can be scheduled (monthly recommended) or generated on demand.
5. **Access control**: AM sees all tenants; OP sees only their assigned tenants.
6. **No new indexes required**: The existing `(tenant_id, created_at)` index on `service_groups` is sufficient. If query performance degrades, add a partial index on `exception_type IS NOT NULL`.

### Exception Type Reference

| Value | Description | Size limits |
|---|---|---|
| `LOW_DENSITY_REGION` | Area with insufficient density to fill a standard group | 1..25 |
| `ISOLATED_SERVICE` | Geographically or temporally isolated appointment(s) | 1..3 |
| `PRIORITY_CLIENT` | Agency requiring expedited service | 1..8 |

### Thresholds / Alerts (Future)

Operations may want alerts when:
- A tenant's exception rate exceeds 30% in a rolling 30-day window
- A single tenant creates more than 20 exception groups in a week
- `ISOLATED_SERVICE` is used with `group_size = 1` more than 10 times per tenant per month

These thresholds are suggestions for the operational team to configure when feature 011 is implemented.
