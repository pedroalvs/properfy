# API Contracts: Live Day Dashboard (F05-1)

All routes require `authenticate`. Error envelope `{ error: { code, message, details? } }`. Zod failures → 400 `VALIDATION_ERROR`. Source of truth is the generated OpenAPI; schemas live in `packages/shared/src/schemas/live-day.ts`.

RBAC (all four): AM ✓, OP ✓, CL_ADMIN/CL_USER/INSP → 403, no token → 401.

Rate limit (per authenticated user; key `user.id`, fallback sha256 of `Authorization`, last resort IP): live-day 120/min, locked-time 30/min, alert-thresholds 30/min. Global 200/min-per-IP still applies.

---

## GET /v1/dashboard/live-day

**Query**: `date?` (`YYYY-MM-DD`, default actor's civil today), `includeGeometry?` (`none` default | `selected` | `all`), `inspectorId?` (uuid; required when `includeGeometry=selected`).

**200**: `{ data: LiveDayResponse }` (see data-model). Exactly 1 SQL query, 0 external calls, any mode.

**Errors**:
- 400 `VALIDATION_ERROR`
- 400 `LIVE_DAY_DATE_TOO_FAR` · "Pick today, tomorrow or a past date" (date after tomorrow)
- 400 `LIVE_DAY_INSPECTOR_REQUIRED` · "Pick an inspector to include its route" (`selected` without `inspectorId`)
- 400 `LIVE_DAY_TOO_MANY_ROUTES` · "Too many routes to draw at once. Narrow the list first." (`all` with roster > 60; `details { inspectors, max: 60 }`)
- 403 `AUTH_FORBIDDEN` · "Insufficient permissions to view the live day"
- 429 rate limit

**Log**: `info` `live_day.read { date, inspectors, includeGeometry, durationMs, bodyBytes }` — never coordinates/tokens, including on error.

---

## GET /v1/dashboard/locked-time

**Query**: `from?`, `to?` (civil; default today → today+13).

**200**: `{ data: LockedTimeResponse }` (overall + byAgency + byRegion; D21 formula). 1 SQL query, 0 external calls.

**Errors**:
- 400 `VALIDATION_ERROR`
- 400 `LOCKED_TIME_INVALID_RANGE` · "End date must be on or after start date"
- 400 `LOCKED_TIME_RANGE_TOO_LONG` · "Pick a period of up to 31 days"
- 403 `AUTH_FORBIDDEN` · "Insufficient permissions to view locked time"

**Log**: `info` `locked_time.read { from, to, rows, durationMs }`.

---

## GET /v1/inspectors/:id/alert-thresholds

**200**: `{ data: InspectorAlertThresholds }` (`platformDefaults`, `override`, `effective`).

**Errors**: 400 (non-uuid id); 404 `INSPECTOR_NOT_FOUND`; 403 `FORBIDDEN` (`Role {role} is not permitted to perform {action}`).

---

## PUT /v1/inspectors/:id/alert-thresholds

**Body** (`.strict()`, both required): `{ delayMinutes: int 5–240 | null, notStartedMinutes: int 5–240 | null }` (`null` = use platform default for that field).

**200**: `{ data: InspectorAlertThresholds }`. Last-write-wins; idempotent (equal value → no audit). Audit `inspector.alert_thresholds_updated` with `{ before, after }`, `tenantId null`.

**Errors**: 400 `VALIDATION_ERROR` (out of range, non-integer, extra field, non-uuid id); 404 `INSPECTOR_NOT_FOUND`; 403 `FORBIDDEN`.
