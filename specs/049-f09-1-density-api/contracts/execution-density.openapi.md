# Contract: `GET /v1/map/execution-density`

The authoritative machine contract is the Zod schema in `packages/shared/src/schemas/execution-density.ts`, surfaced in `packages/shared/openapi.json` + `api-types.ts` after `pnpm generate:api`. This file is the human reference used by analyze/review.

## Request

`GET /v1/map/execution-density`

- **Auth**: Bearer JWT. Active-agency middleware (`createAuthMiddleware`), same as `dashboard.routes.ts`.
- **Query** (`executionDensityQuerySchema`, also the Fastify `schema.querystring`):

| Param | Type | Required | Rule |
|---|---|---|---|
| `fromDate` | `YYYY-MM-DD` (`civilDateSchema`) | yes | civil date in `PLATFORM_TIMEZONE` |
| `toDate` | `YYYY-MM-DD` | yes | `>= fromDate`; inclusive period ≤ 366 days. **CL**: additionally `toDate = today (Sydney)` and period ∈ {7, 30, 90} inclusive days — enforced in the use case |
| `tenantId` | uuid | no | AM/OP: restrict to agency. CL: ignored (JWT tenant used) |
| `inspectorId` | uuid | no | AM/OP: restrict to the check-in inspector. CL: 403 |

## Response 200 (`successResponseSchema(executionDensityResponseSchema)` → `{ data: … }`)

```jsonc
{
  "data": {
    "fromDate": "2026-10-01",            // echo
    "toDate": "2026-10-30",              // echo
    "gridSizeDegrees": 0.001,            // EXECUTION_DENSITY_GRID_DEGREES
    "minCellCount": 1,                   // 1 AM/OP, 3 CL (cells below this were hidden)
    "cells": [                           // ordered by count DESC, then latIndex, lngIndex
      { "lat": -33.8685, "lng": 151.2095, "count": 3 }
    ],
    "cellCount": 1,                      // cells.length
    "totalExecutions": 3,                // valid executions in the window (incl. hidden/truncated cells)
    "excludedWithoutCoordinates": 0,     // invalid-coordinate executions in the window
    "truncated": false                   // true when > MAX_EXECUTION_DENSITY_CELLS cells existed
  }
}
```

Cell object keys are exactly `lat`, `lng`, `count` (`count` integer ≥ 1). The response-schema serializer strips any undeclared key (second privacy barrier — R7).

## Errors (envelope `{ error: { code, message, details } }`)

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | invalid date, wrong order, period > 366 days, bad uuid |
| 400 | `VALIDATION_ERROR` (`details.reason = 'PERIOD_NOT_A_PRESET'`, `details.allowedDays = [7,30,90]`) | CL with a non-preset period. Message: `Agency accounts can only view the last 7, 30 or 90 days.` |
| 401 | (middleware) | no / invalid token (with a valid query; an invalid query 400s at Fastify validation before auth — known project behavior) |
| 403 | `AUTH_FORBIDDEN` | role ∉ {AM,OP,CL_ADMIN,CL_USER}; or CL passing `inspectorId` (message: `Filtering activity density by inspector is not available for agency accounts.`) |
| 403 | `TENANT_SCOPE_REQUIRED` | CL JWT without a tenant (from `requireTenantScope`) |

## RBAC × scope

| Role | Access | Scope | `tenantId` | `inspectorId` |
|---|---|---|---|---|
| AM | yes | platform | applied | applied |
| OP | yes | platform (not from `actor.tenantId`) | applied | applied |
| CL_ADMIN | yes | own agency | ignored | 403 |
| CL_USER | yes (no flag) | own agency | ignored | 403 |
| INSP | 403 | – | – | – |
| TNT | 403 | – | – | – |

## Use-case order (`GetExecutionDensityUseCase.execute({ actor, query })`)

1. `if (!EXECUTION_DENSITY_ROLES.includes(actor.role)) throw ForbiddenError('AUTH_FORBIDDEN')` — before the scope helper (which throws a 500 for INSP/TNT).
2. `pinned = requireTenantScope(actor, 'map.execution_density')`. If `pinned` and `query.inspectorId` → `ForbiddenError('AUTH_FORBIDDEN')`.
3. If `pinned` and `!isExecutionDensityPreset(query, civilDateInTimezone(now(), PLATFORM_TIMEZONE))` → `ValidationError(..., { reason: 'PERIOD_NOT_A_PRESET', allowedDays: [7,30,90] })`.
4. `tenantId = resolveAppointmentListTenantScope(actor, query.tenantId)`.
5. `{ from, toExclusive } = periodToInstants(query.fromDate, query.toDate)`.
6. `minCellCount = pinned ? MIN_CELL_COUNT_CL : MIN_CELL_COUNT_GLOBAL`.
7. `reader.aggregate({ from, toExclusive, tenantId, inspectorId: pinned ? undefined : query.inspectorId, gridScale, minCellCount, limit: MAX_EXECUTION_DENSITY_CELLS })`.
8. Assemble: re-filter `rows.filter(r => r.count >= minCellCount)`; `truncated = rows.length > limit`; slice to `limit`; `cellCenter` each row; `totalExecutions = totals.valid`; `excludedWithoutCoordinates = totals.invalid`; echo dates, `gridSizeDegrees`, `minCellCount`.

## SQL (aggregate query, `Prisma.sql` with conditional fragments)

```sql
SELECT FLOOR(e.start_latitude  * ${scale}::int)::int AS "latIndex",
       FLOOR(e.start_longitude * ${scale}::int)::int AS "lngIndex",
       COUNT(*)::int                                 AS "count"
FROM inspection_executions e
JOIN appointments a ON a.id = e.appointment_id
WHERE e.started_at >= ${from} AND e.started_at < ${toExclusive}
  AND e.abandoned_at IS NULL
  AND a.deleted_at IS NULL
  [AND a.tenant_id = ${tenantId}]
  [AND e.inspector_id = ${inspectorId}]
  AND e.start_latitude  BETWEEN -90  AND 90
  AND e.start_longitude BETWEEN -180 AND 180
  AND NOT (e.start_latitude = 0 AND e.start_longitude = 0)
GROUP BY 1, 2
HAVING COUNT(*) >= ${minCellCount}::int
ORDER BY 3 DESC, 1, 2
LIMIT ${limit + 1}::int
```

Totals query: same `FROM/JOIN/WHERE` minus the valid-coordinate predicate, selecting
`COUNT(*) FILTER (WHERE <valid coord>)::int AS valid` and `COUNT(*) FILTER (WHERE NOT <valid coord>)::int AS invalid`. Both queries run in `Promise.all` (read-only, no transaction).
