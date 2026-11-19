# API Contracts — Day Plan (TASK-F04-2)

All routes require `authenticate`. Error envelope `{ error: { code, message, details } }`; Zod failures → 400 `VALIDATION_ERROR` (validation before auth). `:date` = `YYYY-MM-DD` civil (`civilDateSchema`). Response schemas in `packages/shared/src/schemas/day-plan.ts`; `api-types.ts` regenerated.

## Inspector endpoints — prefix `/v1/inspector/day-plans`

RBAC: **INSP own** only. Other roles → 403 `INSP_ONLY` ("This endpoint is only accessible to inspectors"); INSP without profile → 403 `INSPECTOR_NOT_LINKED`; another inspector's plan → 404.

| Method & route | Request | Success | Key errors | Limit |
|---|---|---|---|---|
| `GET /:date` | – | 200 `{ data: DayPlanResponse }` | 404 `DAY_PLAN_NOT_PUBLISHED` (no `published_at` and window closed in inspector **or** platform tz); 404 `DAY_PLAN_NOT_FOUND` | 60/min |
| `PUT /:date/order` | `{ appointmentIds: uuid[] (1–25, reorderable only, no dup), basedOnVersion: int≥1 }` | 200 `{ data: DayPlanResponse }` (with `violations` if window exceeded) | 409 `DAY_PLAN_VERSION_CONFLICT` (`details.currentVersion`); 409 `DAY_PLAN_STALE`; 422 `DAY_PLAN_ORDER_MISMATCH` (`details.expectedAppointmentIds`); 422 `DAY_PLAN_DATE_IN_PAST`; 404 `DAY_PLAN_NOT_FOUND` | 30/min; idempotent replay |
| `POST /:date/recalculate` | – | 200 `{ data: DayPlanResponse }` (`manualOrder false`) | 404 `DAY_PLAN_NOT_PUBLISHED`/`DAY_PLAN_NOT_FOUND`; 422 `DAY_PLAN_DATE_IN_PAST` | 6/min |
| `PUT /:date/origin` | `{ address: inspectorBaseAddressSchema }` | 200 `{ data: DayPlanResponse }` (`origin.source OVERRIDE`) | 422 `DAY_PLAN_ORIGIN_NOT_FOUND`; 503 `DAY_PLAN_ORIGIN_GEOCODER_UNAVAILABLE`; 404 `DAY_PLAN_NOT_PUBLISHED`; 422 `DAY_PLAN_DATE_IN_PAST`; 422 `DAY_PLAN_ALREADY_STARTED` | 10/min; idempotent |
| `DELETE /:date/origin` | – | 200 `{ data: DayPlanResponse }` | 404; 422 `DAY_PLAN_DATE_IN_PAST` | 10/min; idempotent |
| `GET /:date/sheet?format=pdf\|xlsx` | query `format` | 200 binary; `Content-Disposition: attachment; filename="route-{slug}-{date}.{ext}"` | 400 `VALIDATION_ERROR`; 404; 422 `DAY_PLAN_SHEET_TOO_OLD` (date < today−30) | 20/min; audit `day_plan.exported` |

## AM/OP endpoints — prefix `/v1/day-plans`

RBAC: **AM, OP** via `assertRoles(actor, ['AM','OP'], { action, entityType: 'DayPlan' })`; others → 403 `FORBIDDEN` ("Role {role} is not permitted to perform {action}"). Actions: `day_plan.view`, `day_plan.recalculate`, `day_plan.export`, `day_plan.preview_weights`, `day_plan.view_eta_accuracy`.

| Method & route | Request | Success | Errors | Notes |
|---|---|---|---|---|
| `GET /:inspectorId/:date` | – | 200 `{ data: DayPlanResponse }` | 404 `INSPECTOR_NOT_FOUND`; 404 `DAY_PLAN_NOT_FOUND` | Never calls Mapbox; `status STALE` if fingerprint diverges; sees `DRAFT`. 120/min/user |
| `POST /:inspectorId/:date/recalculate` | – | 200 `{ data: DayPlanResponse }` | 404 `INSPECTOR_NOT_FOUND`; 422 `DAY_PLAN_DATE_IN_PAST` | `OPTIMIZE`; `ROUTE_CHANGED` only on effective change, ≤1/10min. 30/min |
| `GET /:inspectorId/:date/sheet?format=` | – | binary | 400; 404 | No recompute; STALE banner. No date limit. Audit. 20/min/user |
| `POST /preview` | `{ inspectorId, date, weights: {travel,windowWait,baseProximity} }` | 200 `{ data: { current: RouteWeightsPreview, proposed: RouteWeightsPreview } }` | 400 `VALIDATION_ERROR`; 404 `INSPECTOR_NOT_FOUND`; 422 `DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` (date outside today..+14) | 1 Matrix, 0 Directions, nothing stored. 10/min/user |
| `GET /eta-accuracy?days=30` | `days` 7–90 | 200 `{ data: RouteEtaAccuracy }` | 400 | Measured vs frozen published ETA. F05 footer |

Static routes `/v1/day-plans/preview` and `/v1/day-plans/eta-accuracy` must not collide with `/v1/day-plans/:inspectorId/:date`.

## RBAC matrix

| Route | AM | OP | CL_ADMIN | CL_USER | INSP | TNT |
|---|---|---|---|---|---|---|
| `/v1/inspector/day-plans/*` | 403 | 403 | 403 | 403 | own | 401/403 |
| `/v1/day-plans/:inspectorId/:date` (+recalc, sheet) | yes | yes | 403 | 403 | 403 | 403 |
| `/v1/day-plans/preview`, `/eta-accuracy` | yes | yes | 403 | 403 | 403 | 403 |

## Response schemas (shared)

`dayPlanResponseSchema`, `dayPlanStopSchema`, `dayPlanGeometrySchema`, `routeWeightsPreviewSchema`, `routeEtaAccuracySchema` — exact shapes in `fase2-etapa1/tarefas/F04-tarefas.md` §Contratos. Notes:
- `routingInput` (Plan A) is `null` when < 2 reorderable stops with coordinates or after purge; carries `points`, `travelS` matrix, `originKey`, `earliestDepartureAt`, `weights`, `legTravelS`.
- `origin.source LAST_STOP` after the first check-in today; every nullable field declared `.nullable()` (serializer-strict). No Mapbox token or inspector coordinates ever present.

## Notices (F02)

| When | Type | dedupeKey | Lock-screen-safe body (no contact/key/address) |
|---|---|---|---|
| Job publishes D+1 | `ROUTE_PUBLISHED` (critical) | `route-published:{inspectorId}:{date}` | "{n} inspection(s) on {EEE d MMM}. First stop at {HH:mm} in {suburb}; finish around {HH:mm}[, {k} stop(s) may arrive after its window]. Open Properfy…" |
| AM/OP recalc of a published plan **with effective change** | `ROUTE_CHANGED` (critical) | `route-changed:{dayPlanId}:{floor(epochMs/600000)}` | "Operations recalculated your route: {n} inspection(s), first stop at {HH:mm} in {suburb}. Open Properfy…" |

`targetPath` omitted until Part B adds `/today` to `INSPECTOR_NOTICE_TARGET_PATTERNS`.

## Internal port (F06)

`getFreshStopForAppointment({ appointmentId, now? }) → FreshDayPlanStop | null` where `FreshDayPlanStop = { status: 'FRESH'|'STALE', dayPlanId, planVersion, serviceStartAt, eta, lateS, approximate, manual, executed }`. No HTTP route.

## Audit

`day_plan.published` (SYSTEM), `day_plan.exported`/`recalculated`/`reordered`/`origin_overridden`/`origin_override_cleared` (USER) — all `entityType: 'DayPlan'`, `tenantId: null`, no inspector coordinates.
