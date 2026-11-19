# Phase 1 Data Model — F04 Plan B (PR-A)

No new tables, no new columns, **no migration** in PR-A (expand/contract; drop deferred to PR-C).

## DayPlan (platform-scoped — no `tenant_id`, D10 exception)

| Column | PR-A status | Notes |
|---|---|---|
| `route_geometry Json?` | **stop writing** (stays nullable, unused) | dropped in PR-C |
| `routing_matrix_json Json?` | **stop writing** | dropped in PR-C |
| `leg_travel_json Json?` | **stop writing** | dropped in PR-C |
| `geometry_purged_at DateTime?` | **stop writing** (purge removed) | dropped in PR-C |
| `routing_provider`, `matrix_profile`, `approximate`, `approximate_reason` | retained, written | non-result metadata, not Mapbox data |
| `total_drive_s`, `total_wait_s`, `total_service_s`, `total_late_s`, `total_distance_m`, `departure_at`, `finish_eta` | retained, written | derived aggregates |
| `origin_lat/lng`, `origin_override_lat/lng` | retained | geocoding-derived |

## DayPlanStop (no `tenant_id`)

| Column | PR-A status | Notes |
|---|---|---|
| `travel_s`, `distance_m`, `wait_s`, `late_s`, `eta`, `service_start_at/end_at` | retained, written from on-demand compute | live timeline values |
| `published_eta`, `published_service_start_at`, `published_predicted_at`, `published_approximate` | **retained & still frozen at publication** | ETA-accuracy metric reads these; NOT Mapbox live data |

## Response contract (`packages/shared/src/schemas/day-plan.ts`)

| Field / schema | PR-A status |
|---|---|
| `dayPlanResponseSchema.geometry` | retained, **populated on-demand** (INSP + AM/OP GET) |
| `dayPlanResponseSchema.routingInput` | retained, **populated on-demand** (INSP GET only; null for AM/OP) — removed in PR-C |
| `dayPlanGeometrySchema` | retained |
| `dayPlanRoutingInputSchema` | retained (removed in PR-C) |
| **NEW** `previewDayPlanOrderRequestSchema` | candidate stop order (appointment ids / stop sequence) |
| **NEW** `previewDayPlanOrderResponseSchema` | evaluated stops (eta/wait/late), totals, `etaSource: 'MATRIX'` |
| `toOptimizerInput` / `buildLegOverrides` | retained (removed in PR-C) |

## State / lifecycle

No change to the appointment state machine or the day-plan lifecycle. `DAY_PLAN_ALREADY_STARTED` (L-F04-07) still blocks reorder/preview after the first check-in.
