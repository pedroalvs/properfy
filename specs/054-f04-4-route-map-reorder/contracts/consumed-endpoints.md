# Consumed Contracts (no new contract authored)

This feature authors **no** new API contract. It consumes the already-merged `INSP` day-plan endpoints (TASK-F04-2) exactly as typed in `packages/shared/src/api-types.ts` on `origin/develop` (2fb00e3d). Listed here are the operations the UI calls and the responses/errors it must handle.

| UI use | Method & route | Body | Success | Errors the UI handles |
|---|---|---|---|---|
| Day screen / route (read) | `GET /v1/inspector/day-plans/:date` | – | `{ data: DayPlanResponse }` | 404 `DAY_PLAN_NOT_PUBLISHED` → "…ready at 7:30 pm"; 404 `DAY_PLAN_NOT_FOUND` → "No route for this day" |
| Save order | `PUT /v1/inspector/day-plans/:date/order` | `{ appointmentIds: string[], basedOnVersion: number }` | `{ data: DayPlanResponse }` | 409 `DAY_PLAN_VERSION_CONFLICT` / `DAY_PLAN_STALE`; 422 `DAY_PLAN_ORDER_MISMATCH` / `DAY_PLAN_DATE_IN_PAST`; 429; 400 (>25 ids); network |
| Reset to suggested (saved order) | `POST /v1/inspector/day-plans/:date/recalculate` | – | `{ data: DayPlanResponse }` | 404/422 → server message, refetch |

- `:date` = `YYYY-MM-DD` from `todayInTzDateString(effectiveTz)`, never the device timezone.
- Schemas/types: `dayPlanResponseSchema`, `dayPlanStopSchema`, `dayPlanGeometrySchema`, `dayPlanRoutingInputSchema`, `saveDayPlanOrderRequestSchema` in `packages/shared/src/schemas/day-plan.ts`; `api-types.ts` already current.
- Not called by this feature (exist but owned elsewhere): `PUT/DELETE …/origin` (F04-3 OriginSheet), `GET …/sheet` (F04-3 RouteSheetMenu).
- Save sends **no** `Idempotency-Key` (server treats same-order replay). The Mapbox token never reaches the PWA — `geometry` and `routingInput` arrive pre-computed.
