# Contract: Day-plan endpoints consumed by the PWA (F04-2, read-only)

All endpoints are INSP, scoped to the caller's own plan. The Mapbox token never reaches the PWA; geometry and the raw matrix arrive pre-computed. `:date` = `YYYY-MM-DD` computed with `todayInTzDateString(effectiveTz)` — never the device tz. Schemas live in `packages/shared/src/schemas/day-plan.ts`; types in `api-types.ts` (not hand-edited).

| Use in PWA | Method & path | Body | Response |
|---|---|---|---|
| Today / Route | `GET /v1/inspector/day-plans/:date` | – | `{ data: DayPlanResponse }` |
| Per-day base | `PUT /v1/inspector/day-plans/:date/origin` | `{ address: InspectorBaseAddress }` | `{ data: DayPlanResponse }` |
| Back to base | `DELETE /v1/inspector/day-plans/:date/origin` | – | `{ data: DayPlanResponse }` |
| Route sheet | `GET /v1/inspector/day-plans/:date/sheet?format=pdf\|xlsx` | – | file (blob) |
| (Reset — F04-4) | `POST /v1/inspector/day-plans/:date/recalculate` | – | `{ data: DayPlanResponse }` |
| (Save order — F04-4) | `PUT /v1/inspector/day-plans/:date/order` | `{ appointmentIds, basedOnVersion }` | `{ data: DayPlanResponse }` |

This task **consumes** GET, PUT/DELETE origin, and GET sheet. Recalculate/order are listed for completeness; TASK-F04-4 owns them.

## Error codes the UI maps

- `GET`: 404 `DAY_PLAN_NOT_PUBLISHED` → "…ready at 7:30 pm" (tomorrow) / hidden card; 404 `DAY_PLAN_NOT_FOUND` → "No route for this day"; today never 404 (empty = `stops: []`). 429/5xx → Retry. A **published** plan returns 200 in any timezone (L-F04-02).
- `PUT/DELETE origin`: 422 `DAY_PLAN_ORIGIN_NOT_FOUND`, 503 `DAY_PLAN_ORIGIN_GEOCODER_UNAVAILABLE`, 422 `DAY_PLAN_DATE_IN_PAST`, 422 `DAY_PLAN_ALREADY_STARTED` (L-F04-07), 404 `DAY_PLAN_NOT_PUBLISHED` — server `message` shown in `role="alert"`; cache untouched except explicit close+invalidate cases.
- `GET sheet`: 404 → "This route isn't ready yet."; 422 `DAY_PLAN_SHEET_TOO_OLD` (> today−30) → server message; offline → connect message.

## Notice contract (DB7, this PR)

- `INSPECTOR_NOTICE_TARGET_PATTERNS` gains `/today` (exact static pattern, F02 D24). `isAllowedInspectorNoticeTargetPath('/today')` → true; `/today/`, `/Today`, `//today`, `/today#x`, `/today?x=1`, `/today/route/:date`, `/today/x` → false.
- `PublishDayPlansUseCase` / `RecalculateDayPlanUseCase` send `targetPath: '/today'` on `ROUTE_PUBLISHED` / `ROUTE_CHANGED`. The F02 validator accepts `/today`, rejects `/today/route/x`.
- SW `resolveClickTarget` opens `/today` (→ `/today?fromNotice=<id>`) for a route notice; inbox deep link and fallback (`/profile/announcements`) unchanged.

## Shared helper added (this PR)

- `formatInstantTime(value: string | null, timeZone: string): string` in `format-display-date.ts` — `'2026-11-04T21:10:00.000Z','Australia/Sydney'` → `8:10 am`; midnight → `12:00 am`; `null`/`''` → `''`; invalid string returned intact; TZ-independent.
