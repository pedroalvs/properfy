# Phase 1 Data Model — Day Plan (TASK-F04-2)

Authoritative column-level detail is in `fase2-etapa1/tarefas/F04-tarefas.md` (§Modelo de dados). This file is the normative summary used by `/speckit.tasks` and `/speckit.analyze`.

## Enums (Prisma)

```prisma
enum DayPlanStatus { DRAFT PUBLISHED STALE }
enum DayPlanComputeTrigger { SCHEDULED_PUBLISH ON_OPEN MANUAL_RECALC REORDER ORIGIN_CHANGE }
enum DayPlanOriginSource { BASE OVERRIDE NONE LAST_STOP }   // LAST_STOP: L-F04-07
enum RoutingProvider { MAPBOX STUB }
```

Shared TS enums mirror these in `packages/shared/src/enums/day-plan.ts` plus `DayPlanOriginWarning = NO_BASE | BASE_NOT_LOCATED`.

## DayPlan (`day_plans`) — **no `tenant_id`** (D10)

- **Identity**: `id` uuid; `@@unique([inspector_id, plan_date])`; `@@index([plan_date, status])`.
- **Ownership**: `inspector_id → inspectors.id`; `plan_date @db.Date`; `timezone VarChar(64)` (inspector effective tz).
- **Lifecycle**: `status` (DRAFT/PUBLISHED/STALE); `version Int @default(1)` (optimistic CAS, +1 per compute and on transition to STALE — repeated marks do not increment); `input_fingerprint VarChar(64)`; `published_at?`; `notified_at?`; `computed_at`; `computed_by_user_id? → users.id (SetNull)`; `last_trigger`; `stale_at?`; `stale_reason? VarChar(50)` (`APPOINTMENT_STATUS_CHANGED|GROUP_CHANGED|INSPECTOR_CANT_DO|BASE_CHANGED`; first since last compute).
- **Origin**: `origin_source`; `origin_lat/lng Decimal(10,7)?` (snapshot; null if NONE); `origin_override_json Json?` (inspectorBaseAddressSchema); `origin_override_lat/lng Decimal(10,7)?`; `origin_override_set_at?`.
- **Timeline**: `departure_at?`; `finish_eta?`; `total_drive_s/total_wait_s/total_service_s/total_late_s Int @default(0)`; `total_distance_m Int?`; `feasible Boolean @default(true)`.
- **Ordering/optimizer**: `manual_order Boolean @default(false)`; `suggested_order_json Json` (string[]); `weights_json Json` (snapshot); `optimizer_method VarChar(20)` (TRIVIAL/EXACT/HEURISTIC/INSERTION/FIXED); `routing_provider RoutingProvider`; `matrix_profile VarChar(30)?`; `approximate Boolean @default(false)`; `approximate_reason VarChar(30)?` (NO_PROVIDER/RATE_LIMITED/PROVIDER_ERROR/DEADLINE/TOO_MANY_COORDINATES/NO_ROUTE).
- **Routing payload (Plan A, purged next day)**: `route_geometry Json?`; `routing_matrix_json Json?`; `leg_travel_json Json?`; `geometry_purged_at?`.
- **Timestamps**: `created_at @default(now())`; `updated_at @updatedAt`.
- **Inverse relation**: `Inspector.day_plans`, `User.day_plans_computed`.

### Status semantics

- `DRAFT`: computed, not published (AM/OP recalculating before 19:30 the day before); inspector does not see it.
- `PUBLISHED`: `published_at` set and fresh.
- `STALE`: inputs changed since last compute; recomputed on open (INSP) or by OP. ("published" = `published_at IS NOT NULL`; "notified" = `notified_at IS NOT NULL`.)

## DayPlanStop (`day_plan_stops`) — **no `tenant_id`**

- **Identity**: `id` uuid; `day_plan_id → day_plans.id (Cascade)`; `appointment_id → appointments.id (Cascade)`; `@@unique([day_plan_id, sequence])`; `@@unique([day_plan_id, appointment_id])`; `@@index([appointment_id])`.
- **Position/time**: `sequence Int` (1-based, executed prefix first); `eta?`; `service_start_at?`; `service_end_at?`.
- **Frozen published prediction (metric)**: `published_eta?`; `published_service_start_at?`; `published_predicted_at?`; `published_approximate Boolean?`.
- **Leg**: `travel_s Int @default(0)`; `distance_m Int?`; `wait_s Int @default(0)`; `late_s Int @default(0)`.
- **Window snapshot**: `window_start_at`; `window_end_at`; `window_timezone VarChar(64)`; `duration_minutes Int`.
- **Coordinate snapshot**: `lat/lng Decimal(10,7)?`.
- **Flags**: `manual Boolean @default(false)`; `executed Boolean @default(false)` (record only — API derives from live state, D18); `approximate Boolean @default(false)`; `missing_coordinates Boolean @default(false)`.
- **Timestamp**: `created_at @default(now())`. Inverse: `Appointment.day_plan_stops`.
- **Retention**: rows persist (metric uses `published_*`); only geometry/matrix/leg durations are purged.
- **No `day_plan_versions` table** (L-F04-15): each compute `DELETE/INSERT`s stops.

## Inspector (extended)

- `onboarding_completed_at DateTime?` (null = tour not completed/skipped). Expand-only migration `inspector_onboarding_completed_at`.

## PlatformSetting `routeWeights` (registry append)

```ts
routeWeights: { schema: routeWeightsSettingSchema, defaults: { travel: 1, windowWait: 1, baseProximity: 1 }, section: 'Route planning' }
// each weight z.number().min(0).max(10) with ≤1 decimal; refine sum > 0 ("At least one weight must be greater than 0")
```

## Repository contracts (ports)

- `IDayPlanRepository`: `findByInspectorAndDate`, `saveComputed` (CAS on `version`, DELETE/INSERT stops in one tx), `clearStale(id, expectedVersion)` (CAS), `markStaleByAppointmentIds(ids, reason)`, `markStaleByInspector(inspectorId, reason)`, `purgePastRouteData(todaySydney)`, metric query, `Prisma.Decimal ↔ number` conversion.
- `IDayPlanInputReader`: `loadCandidates(inspectorId, date)` (appointments join properties/service_types/tenants/contacts/executions; status `IN ('SCHEDULED','DONE')`; window from `time_slot_start/end`; T-1 visibility for SCHEDULED; `selectPrimaryContact`).
- `ICronJobRunRepository.hasClaim(jobName, tenantId, localDate): Promise<boolean>` (added).
- Domain (Prisma-free, exported for F05, L-F04-16): `computeDayPlanFingerprint(FingerprintInput)`, `classifyStops(ClassifiableStop[]) → { executed, reorderable }`, `selectPrimaryContact`, `isPublicationOpen`/`isPublicationOpenForInspector`.
