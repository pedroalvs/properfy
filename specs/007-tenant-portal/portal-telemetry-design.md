# Portal Telemetry Dashboard — Design Document

**Feature**: `007-tenant-portal` / GAP-009
**Status**: DESIGN
**Depends on**: feature 011-reports-audit (report card integration)
**Data sources**: `tenant_portal_tokens`, `tenant_portal_activities`

## Overview

This document defines the metrics, SQL query patterns, and integration points for a "Portal Engagement" report card that surfaces how renters interact with portal links. The goal is to give AM and OP users visibility into link effectiveness and renter responsiveness, enabling proactive follow-up on no-response appointments.

## Metrics

### M1 — Links Generated

Total portal tokens created within the reporting period.

**Source**: `tenant_portal_tokens.created_at`

```sql
SELECT
  COUNT(*)                                        AS total_links_generated,
  COUNT(*) FILTER (WHERE status = 'ACTIVE')       AS currently_active,
  COUNT(*) FILTER (WHERE status = 'EXPIRED')      AS expired,
  COUNT(*) FILTER (WHERE status = 'REVOKED')      AS revoked
FROM tenant_portal_tokens
WHERE created_at BETWEEN :period_start AND :period_end
  AND appointment_id IN (
    SELECT id FROM appointments WHERE tenant_id = :tenant_id
  );
```

### M2 — Links Opened

Tokens that were actually accessed by the renter (`last_accessed_at IS NOT NULL`).

**Source**: `tenant_portal_tokens.last_accessed_at`

```sql
SELECT
  COUNT(*)                                                    AS total_links_generated,
  COUNT(*) FILTER (WHERE last_accessed_at IS NOT NULL)        AS links_opened,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE last_accessed_at IS NOT NULL) / NULLIF(COUNT(*), 0),
    1
  )                                                           AS open_rate_pct
FROM tenant_portal_tokens
WHERE created_at BETWEEN :period_start AND :period_end
  AND appointment_id IN (
    SELECT id FROM appointments WHERE tenant_id = :tenant_id
  );
```

### M3 — Actions Taken

Breakdown of renter actions recorded in the activity log (excluding VIEW).

**Source**: `tenant_portal_activities.action`

```sql
SELECT
  action,
  COUNT(*) AS count
FROM tenant_portal_activities tpa
JOIN tenant_portal_tokens tpt ON tpt.id = tpa.tenant_portal_token_id
WHERE tpa.action IN ('CONFIRM', 'RESCHEDULE', 'UNAVAILABLE_REPORTED', 'CONTACT_UPDATED')
  AND tpa.created_at BETWEEN :period_start AND :period_end
  AND tpa.appointment_id IN (
    SELECT id FROM appointments WHERE tenant_id = :tenant_id
  )
GROUP BY action
ORDER BY count DESC;
```

### M4 — No-Response Rate

Tokens that were generated but never accessed AND the appointment reached or passed the cutoff without a renter action. This is the highest-signal metric for operational follow-up.

**Source**: cross-join of `tenant_portal_tokens` and `tenant_portal_activities`

```sql
WITH token_actions AS (
  SELECT
    tpt.id                       AS token_id,
    tpt.appointment_id,
    tpt.last_accessed_at,
    tpt.expires_at,
    tpt.status                   AS token_status,
    COUNT(tpa.id) FILTER (
      WHERE tpa.action IN ('CONFIRM', 'RESCHEDULE', 'UNAVAILABLE_REPORTED')
    )                            AS action_count
  FROM tenant_portal_tokens tpt
  LEFT JOIN tenant_portal_activities tpa
    ON tpa.tenant_portal_token_id = tpt.id
  WHERE tpt.created_at BETWEEN :period_start AND :period_end
    AND tpt.appointment_id IN (
      SELECT id FROM appointments WHERE tenant_id = :tenant_id
    )
  GROUP BY tpt.id
)
SELECT
  COUNT(*)                                                            AS total_tokens,
  COUNT(*) FILTER (WHERE last_accessed_at IS NULL AND action_count = 0) AS never_opened,
  COUNT(*) FILTER (WHERE last_accessed_at IS NOT NULL AND action_count = 0) AS opened_no_action,
  COUNT(*) FILTER (WHERE action_count > 0)                            AS acted_on,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE action_count = 0) / NULLIF(COUNT(*), 0),
    1
  )                                                                   AS no_response_rate_pct
FROM token_actions;
```

### M5 — Time to First Action

Measures how quickly renters respond after opening the link.

**Source**: `tenant_portal_tokens.last_accessed_at`, `tenant_portal_activities.created_at`

```sql
WITH first_action AS (
  SELECT
    tpa.tenant_portal_token_id,
    MIN(tpa.created_at) AS first_action_at
  FROM tenant_portal_activities tpa
  WHERE tpa.action IN ('CONFIRM', 'RESCHEDULE', 'UNAVAILABLE_REPORTED')
    AND tpa.created_at BETWEEN :period_start AND :period_end
  GROUP BY tpa.tenant_portal_token_id
)
SELECT
  PERCENTILE_CONT(0.50) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM fa.first_action_at - tpt.last_accessed_at)
  ) / 60                                     AS median_minutes_to_action,
  PERCENTILE_CONT(0.90) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM fa.first_action_at - tpt.last_accessed_at)
  ) / 60                                     AS p90_minutes_to_action,
  AVG(EXTRACT(EPOCH FROM fa.first_action_at - tpt.last_accessed_at)) / 60 AS avg_minutes_to_action
FROM first_action fa
JOIN tenant_portal_tokens tpt ON tpt.id = fa.tenant_portal_token_id
WHERE tpt.last_accessed_at IS NOT NULL
  AND tpt.appointment_id IN (
    SELECT id FROM appointments WHERE tenant_id = :tenant_id
  );
```

## Report Card: "Portal Engagement"

### Integration with Feature 011-reports-audit

The portal engagement report card should be registered as a report type in the existing report system:

- **Report type code**: `PORTAL_ENGAGEMENT`
- **Allowed roles**: AM, OP, CL_ADMIN
- **Scoping**: CL_ADMIN sees only their own tenant; AM/OP can filter by tenant or view platform-wide
- **Format**: XLSX and on-screen summary card
- **Filters**: `periodStart`, `periodEnd`, `tenantId` (optional for AM/OP)

### Summary Card Layout

The on-screen card (for the dashboard or report list) should display:

| Metric | Value | Visual |
|---|---|---|
| Links Generated | count | -- |
| Open Rate | percentage | progress bar |
| Confirmed | count | green badge |
| Rescheduled | count | yellow badge |
| Unavailable | count | orange badge |
| No Response | count + percentage | red badge if > 20% |
| Median Response Time | minutes | -- |

### XLSX Report Columns

The exported XLSX should include one row per token with the following columns:

| Column | Source |
|---|---|
| Appointment Code | `appointments.code` (via join) |
| Property Address | `properties.street + suburb` (via join) |
| Tenant Name | `appointment_contacts.tenant_name` (via join) |
| Token Created At | `tenant_portal_tokens.created_at` |
| Token Expires At | `tenant_portal_tokens.expires_at` |
| Token Status | `tenant_portal_tokens.status` |
| Link Opened | `last_accessed_at IS NOT NULL` (boolean) |
| First Opened At | `tenant_portal_tokens.last_accessed_at` |
| Action Taken | latest action from `tenant_portal_activities` or `NONE` |
| Action At | `tenant_portal_activities.created_at` for the latest action |
| Minutes to Action | difference between `last_accessed_at` and first action `created_at` |

### Implementation Steps

1. Add `PORTAL_ENGAGEMENT` to the `ReportType` enum in `packages/shared`.
2. Create `PortalEngagementReportWorker` in `apps/backend/src/modules/report/infrastructure/workers/` following the existing worker pattern.
3. Register the worker in the pg-boss setup alongside existing report workers.
4. The worker executes the SQL queries above (parameterized by tenant and period), builds an XLSX using the existing XLSX utility, uploads to Supabase Storage, and updates the report record.
5. Add the summary card query as a dedicated use case (`GetPortalEngagementSummaryUseCase`) consumed by the dashboard endpoint.

### Indexes

The following indexes are already present and sufficient for the queries above:

- `tenant_portal_tokens(appointment_id)`
- `tenant_portal_tokens(status)`
- `tenant_portal_activities(appointment_id)`
- `tenant_portal_activities(tenant_portal_token_id)`
- `tenant_portal_activities(action)`
- `tenant_portal_activities(created_at)`

No additional indexes are needed. If platform-wide (AM) queries show slow performance due to the `appointments.tenant_id` subquery, consider a denormalized `tenant_id` column on `tenant_portal_tokens` (expand/contract migration).

## Open Questions

1. **Retention window**: Should the report card cover the last 30 days by default, or match the configurable billing period? Recommendation: default to 30 days, allow custom range.
2. **Real-time vs. batch**: The summary card can query live data (NFR-001 performance target does not apply here since this is an admin route). The XLSX export should go through the async report queue.
3. **Notification escalation**: Should the no-response metric trigger automatic escalation notifications (e.g., when a token has been generated for 48h with no access)? This is a separate feature (overdue appointment handling) and should not be conflated with the telemetry dashboard.
