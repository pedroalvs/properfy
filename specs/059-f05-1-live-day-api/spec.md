# Feature Specification: Live Day Dashboard API (F05-1)

**Feature Branch**: `059-f05-1-live-day-api`
**Created**: 2026-11-06
**Status**: Draft
**Input**: Task `fase2-etapa1/tarefas/F05-tarefas.md` § TASK-F05-1 (contract codes 01.8, 01.9, 01.11, 01.13 and per-inspector alert thresholds; acceptance codes **01.A4**, **01.A5**)

## Overview

Operations (Admin Master / Operator) need a single read endpoint that returns everything the "Live Day" screen needs for one civil date: for each inspector working that day, a derived operational state, the last known location, done-versus-remaining progress, accumulated delay, the plan freshness (STALE), the active alerts (7 types), a route-infeasibility indicator, the plan stops (done/current/remaining with projected remaining times), and — only when asked — an in-memory straight-line route (origin → stops in display order). Everything comes from **one aggregated SQL query per endpoint with zero Mapbox calls**; all derivation runs in-memory.

> **Reconciliation (2026-11-06) — geometry is never stored.** This task was authored (2026-10-27/28) assuming F04 persisted `day_plans.route_geometry`, which the Live Day read would simplify and return (original D8/D13/D18). F04 "Plan B" (PRs #072/#073/#074, decided 2026-11-02, merged to `develop`) **stopped persisting any Mapbox routing result and dropped the `route_geometry` column** (Mapbox ToS). The zero-Mapbox invariant on this hot, 30-second-polled read (FR-011, SC-003) is non-negotiable, so with no stored geometry and no permitted Mapbox call the Live Day route is **always the in-memory straight-line approximation** built from `day_plan_stops.lat/lng` + origin (`routeApproximate` always true). The real road route stays on F04's inspector/PWA on-demand path, which this screen explicitly does not host. FR-021/022/023 below are reconciled accordingly; `simplifyRouteGeometry` and the `dayPlanId:version` simplification cache are dropped (nothing to simplify).

The feature also delivers the "Locked time" indicator (01.13) and the alert-threshold configuration (platform default + optional per-inspector override).

This is a **backend + shared** slice only. The web consumer is TASK-F05-2; no web/PWA code is produced here.

### Multi-tenant scoping exception (CLAUDE.md §7.1 / §7.8)

`GET /v1/dashboard/live-day` and `GET /v1/dashboard/locked-time` are **cross-tenant reads restricted to AM/OP**, and the new `inspectors.alert_overrides_json` column has **no `tenant_id`**. This is a documented exception to the multi-tenant rule, on the same grounds as the existing `Inspector`, global `ServiceRegion` and `/inspector-workload` precedents: the inspector is a cross-tenant subject and only AM/OP (cross-tenant roles) may read these rows. Scope is guaranteed by RBAC (AM/OP only; CL_*/INSP → 403) and by the absence of any agency-facing projection. There is no new table.

## Clarifications

### Session 2026-11-06

No critical ambiguities detected worth formal clarification. The source task (`fase2-etapa1/tarefas/F05-tarefas.md` § TASK-F05-1) carries every product decision closed — D1–D21 (2026-10-27/28), the gap decisions L-F05-01..14 (2026-10-29), and the F03/F04/F06/X01 reconciliations — so each taxonomy category (functional scope, domain/data model, non-functional quality, integration, edge cases, constraints, terminology, completion signals) resolved to **Clear** from the spec and its cited decisions. No cross-cutting pending decision (Q2/Q4/Q6/Q12) affects this backend+shared slice. Proceeding to `/speckit.plan`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator sees each inspector's live state and progress for today (Priority: P1)

An operator opens the Live Day screen for today and, for every inspector who has work that day, immediately sees a derived operational state (not started, at a property, in transit between stops, or done for the day), how many stops are done versus remaining, the inspector's last known location, and the accumulated delay — all without any GPS ping and without any external map call.

**Why this priority**: This is the core value of the feature and satisfies contract code **01.A4** (derived state). Without it there is no Live Day. It is a pure read over existing execution and plan data.

**Independent Test**: Seed inspectors with plans and executions for a date; call `GET /v1/dashboard/live-day`; assert each inspector's `state`, `progress`, `lastKnown`, and `delayMinutes` match the derivation truth table. Can be exercised end-to-end over HTTP by driving real `start`/`finish` routes and re-reading the endpoint.

**Acceptance Scenarios**:

1. **Given** an inspector whose first stop is in progress (checked in, not finished), **When** the operator reads the live day, **Then** the inspector state is `AT_PROPERTY` (01.A4: after check-in).
2. **Given** an inspector who finished a stop and still has remaining stops, **When** the operator reads the live day, **Then** the state is `IN_TRANSIT` (01.A4: after check-out with stops left).
3. **Given** an inspector whose last stop has been checked out with no stops remaining, **When** the operator reads the live day, **Then** the state is `DONE_FOR_DAY` (01.A4: after the final check-out).
4. **Given** an inspector with no execution yet and at least one live stop, **When** the operator reads the live day, **Then** the state is `NOT_STARTED` and `lastKnown.source` is `BASE` (plan origin, else profile base), else `NONE`.
5. **Given** an inspector who forgot to check out of stop A and checked into stop B, **When** the operator reads progress, **Then** exactly one stop is `CURRENT` (the one with the greater `startedAt`), the other open stop is `OPEN`, and the state is `AT_PROPERTY`.
6. **Given** a stop marked `DONE` by the operator with no execution record, **When** progress is derived, **Then** that stop is `DONE` with `startedAt`/`finishedAt` null and it is excluded from the last known point and delay.

---

### User Story 2 - Operator draws inspector routes on demand with freshness and approximation signals (Priority: P1)

The 30-second poll does not carry route geometry. When the operator selects one inspector (or toggles "show all routes"), the endpoint returns an in-memory straight-line route (origin → coordinate-bearing stops in display order) for the requested inspectors only — F04 persists no route geometry (Plan B), so this screen never draws the road route and `routeApproximate` is always true, with still zero Mapbox calls. The endpoint flags when a plan is stale (the content fingerprint no longer matches what the plan was computed from, including edits that emit no event) and whether the plan is infeasible.

**Why this priority**: Route visualization and freshness signalling are essential to the operational picture and protect against showing a route that no longer matches reality. STALE-on-edit (D17) and the approximate fallback (D8) are explicit acceptance points.

**Independent Test**: Seed a published plan; call with `includeGeometry=none|selected|all`; assert geometry is present only for requested inspectors and is always an approximate straight-line route (`routeApproximate = true`), that an out-of-band edit flips `planStatus` to `STALE` and `routeOutOfDate` to true without recomputation, and that fewer than two coordinate-bearing points yields `geometry null`.

**Acceptance Scenarios**:

1. **Given** `includeGeometry=none` (default), **When** the live day is read, **Then** every inspector has `geometry` null and `geometryIncluded` false, while `routeApproximate` is still computed.
2. **Given** `includeGeometry=selected&inspectorId=<J>`, **When** the live day is read, **Then** only inspector J has `geometryIncluded` true and a non-null geometry.
3. **Given** `includeGeometry=selected` without `inspectorId`, **When** the live day is read, **Then** the request is rejected with 400 `LIVE_DAY_INSPECTOR_REQUIRED`.
4. **Given** a published plan and a direct `time_slot_start` edit that emits no event, **When** the live day is read, **Then** `planStatus` is `STALE` and `routeOutOfDate` is true, computed from the F04 fingerprint in memory, with no recomputation and no Mapbox call; the geometry is the in-memory straight-line route (F04 persists none).
5. **Given** any requested route, **When** the route is returned, **Then** `geometry` is a straight-line `LineString` (origin → coordinate-bearing stops in display order) with `properties.approximate: true` and `routeApproximate` is true; with fewer than two points `geometry` is null.
6. **Given** `includeGeometry=all` with a roster larger than 60 inspectors, **When** the live day is read, **Then** it is rejected with 400 `LIVE_DAY_TOO_MANY_ROUTES` (`details { inspectors, max: 60 }`), while `none`/`selected` remain uncapped.

---

### User Story 3 - Operator sees per-inspector alerts that need attention (Priority: P1)

For each inspector the endpoint derives the active alerts, ordered by severity, so the operator can filter to "needs attention". Seven alert types are supported: delay, not-started (per stop), late-notice, can't-do, geofence, out-of-window, and completion-reminder. Threshold-based alerts (delay, not-started) honour the platform default and the per-inspector override. Each alert has an explicit exit rule; there is no acknowledge/dismiss.

**Why this priority**: Alerts are the operational trigger and satisfy contract code **01.A5**. They are derived from the same single query.

**Independent Test**: For each alert type, drive the threshold/event at, below, and above the boundary and assert the alert's presence, `minutes`, `threshold`, and `thresholdSource`; assert the list order and that `needsAttention = alerts.length > 0`.

**Acceptance Scenarios**:

1. **Given** platform `delayMinutes = 20`, **When** accumulated delay is 20, **Then** no DELAY alert; **When** it is 21, **Then** a DELAY alert with `minutes 21`, `threshold 20`, `thresholdSource 'PLATFORM'`.
2. **Given** a per-inspector override `delayMinutes = 15` and delay 16, **When** read, **Then** a DELAY alert with `thresholdSource 'INSPECTOR'`.
3. **Given** platform `notStartedMinutes = 30` and a stop whose planned start is 10:00 that is not started at 10:31 (any inspector state), **When** read, **Then** one NOT_STARTED alert for that stop; one alert per late stop.
4. **Given** a late-notice event (20 min) on a not-started stop, **When** read, **Then** a LATE_NOTICE alert carrying `minutes = minutesLate` and `estimatedArrivalAt` computed by the F03 `computeEstimatedArrivalAt` (window start + minutes), never `predictedStartAt + minutes`.
5. **Given** a `CANT_DO` event whose appointment is still `REJECTED` with no inspector, **When** read, **Then** a CANT_DO alert active all day; **When** the appointment is re-offered or re-assigned, **Then** the alert is gone from the original inspector.
6. **Given** an execution flagged `out_of_window = true`, **When** read, **Then** an OUT_OF_WINDOW alert; **Given** a check-in outside the window but with `out_of_window = false` (F03 skipped the evaluation for an implausible client time), **Then** no alert (the flag alone decides).
7. **Given** mixed alerts, **When** read, **Then** they are ordered `CANT_DO, COMPLETION_REMINDER, NOT_STARTED, DELAY, LATE_NOTICE, GEOFENCE, OUT_OF_WINDOW` and, within a type, by `occurredAt` descending.

---

### User Story 4 - Operator reviews "Locked time" confirmation rate by agency and region (Priority: P2)

The operator sees, over a chosen period (default today → today+13, up to 31 days), the share of appointments that require tenant confirmation and are actually confirmed ("locked"), broken down overall, by agency, and by region (the group's region, else the region containing the property by spatial intersection, tie-broken by the lowest region number).

**Why this priority**: 01.13 is part of the contract and reuses the same read discipline, but it is a separate panel tab and does not block the live view.

**Independent Test**: Seed appointments spanning the confirmation-required predicate and both confirmed/unconfirmed/rejected states; call `GET /v1/dashboard/locked-time`; assert `overall`, `byAgency`, and `byRegion` match the exact D21 formula, including tenant-declined / no-response rejections counted as not-locked in the denominator.

**Acceptance Scenarios**:

1. **Given** a set of confirmation-requiring appointments (ROUTINE + requires confirmation + no key required), **When** the locked time is read, **Then** the denominator counts non-rejected live statuses plus tenant-declined/no-response rejections, the numerator counts non-rejected `CONFIRMED`, and `percent = round(num/den×100, 1)` (null when the denominator is 0).
2. **Given** `to` before `from`, **When** read, **Then** 400 `LOCKED_TIME_INVALID_RANGE`.
3. **Given** a span of 32 days, **When** read, **Then** 400 `LOCKED_TIME_RANGE_TOO_LONG`.
4. **Given** an appointment in a group whose region is R2, **When** grouped by region, **Then** it counts under R2 (the group's region) even if an overlapping region R1 has a lower number; an appointment with no group is placed by `ST_Intersects` with the lowest `region_number`; a property outside all regions is "No region" (always last).
5. **Given** a region owned by an agency, **When** read, **Then** `byRegion[].agencyName` is the owner's name; a global region or "No region" yields `agencyName = null`.

---

### User Story 5 - Operator configures alert thresholds (platform default and per-inspector override) (Priority: P2)

An operator sets the platform-wide alert thresholds (via the existing `PlatformSetting` key) and, where needed, overrides the delay and/or not-started threshold for an individual inspector. Alert derivation applies the override per field when present, else the platform default.

**Why this priority**: Required by the "alert limits" scope and proves the 01.A5 override path, but configuration is secondary to viewing.

**Independent Test**: `PUT` a per-inspector override, `GET` it back, then read the live day and assert the inspector's alerts use the overridden threshold with `thresholdSource 'INSPECTOR'`; assert idempotent PUT writes no audit.

**Acceptance Scenarios**:

1. **Given** a `PUT` of `{ delayMinutes: 15, notStartedMinutes: null }`, **When** stored, **Then** the column holds `{ "delayMinutes": 15 }`, an audit `inspector.alert_thresholds_updated` records `{ before, after }` with `tenantId null`, and the subsequent live day uses 15 with `thresholdSource 'INSPECTOR'` for that inspector.
2. **Given** a `PUT` equal to the current state, **When** stored, **Then** 200 and no audit (idempotent).
3. **Given** a `PUT` with both fields `null`, **When** stored, **Then** the column is `NULL` (platform defaults for both).
4. **Given** a non-existent or deleted inspector, **When** `GET`/`PUT` is called, **Then** 404 `INSPECTOR_NOT_FOUND`.
5. **Given** a corrupt `alert_overrides_json`, **When** the live day is read, **Then** the platform defaults are used and a single warning is logged (no 500).

---

### User Story 6 - Operator reviews a past day or tomorrow (Priority: P3)

The operator navigates the date selector to a past day or to tomorrow using the same endpoint. Past days are shown without any "today" projection (predicted times are the planned times, not an ETA computed against the current clock) and with past-day alert semantics. Tomorrow shows a draft/published plan with no time alerts yet.

**Why this priority**: Date navigation broadens the feature but the live "today" view is the primary journey.

**Independent Test**: Read the endpoint with `date = yesterday` and `date = tomorrow` against a fixed clock; assert no ETA projection on past days, NOT_STARTED measured to window end on past days, DATE_TOO_FAR beyond tomorrow, and `today`/`isToday` reflecting the server's actor clock.

**Acceptance Scenarios**:

1. **Given** `date` after tomorrow, **When** read, **Then** 400 `LIVE_DAY_DATE_TOO_FAR` ("Pick today, tomorrow or a past date").
2. **Given** `date` in the past, **When** read, **Then** remaining stops' `predictedStartAt` is `published_service_start_at ?? service_start_at ?? window_start_at` (never a today ETA) and NOT_STARTED `minutes` is measured from the baseline to `window_end_at`.
3. **Given** any requested `date`, **When** read, **Then** `today` is the actor's civil today on the server and `isToday` reflects whether `date == today` (the client never uses its own clock for "today").
4. **Given** `date = tomorrow` with ROUTINE appointments not yet tenant-confirmed before the 19:00 cutoff, **When** read, **Then** those appointments are invisible (T-1 filter) and do not cause the plan to be flagged as changed.

---

### Edge Cases

- **Inspector with no plan** but live `SCHEDULED/DONE` appointments: appears with `planStatus 'NONE'`, stops `inPlan false` ordered by window, predicted = window start, straight-line fallback.
- **Plan with no live stops and no active `CANT_DO`**: inspector is excluded from the roster (no "0 of 0" idle rows, D19). With a day `CANT_DO`, it appears with `stops []`, `DONE_FOR_DAY`, `progress 0/0`, and the alert.
- **Appointment re-offered after `CANT_DO` and accepted by another inspector the same day**: the `CANT_DO` leaves the original inspector as soon as the appointment is no longer `REJECTED`-without-inspector; the stop appears under the new inspector.
- **Two stops in progress** (forgotten check-out): `CURRENT` is the one with the greater `startedAt`; the other is `OPEN`; state `AT_PROPERTY`.
- **Out-of-order check-in**: displayed order stays as saved until F04 recomputes; `CURRENT` is the started stop; an earlier not-started stop stays `REMAINING`.
- **Abandoned execution** (F03): counts as not-started everywhere (state, progress, last point, delay); its flags do not produce `GEOFENCE`.
- **`DONE` marked by the operator with no execution**: `DONE`, no real times, excluded from last point and delay.
- **Check-out with no finish coordinate**: uses the start coordinate of the same execution.
- **Property with no coordinate**: `missingCoordinates true`, no stop pin, excluded from the straight-line fallback, but still listed and counted.
- **Past day**: straight-line route + "Approximate route" (geometry is always straight-line); no projection; NOT_STARTED measured to window end; DELAY shown even when `DONE_FOR_DAY`.
- **Tomorrow**: plan `DRAFT`/`PUBLISHED`; all `NOT_STARTED`; no time alerts fire; `CANT_DO`/`LATE_NOTICE` cannot exist (F03 requires date ≤ today).
- **Roster above 60 with `includeGeometry=all`**: 400 `LIVE_DAY_TOO_MANY_ROUTES`; `none`/`selected` uncapped.
- **Office behind NAT with many tabs**: per-user limit (120/min) governs; the global per-IP limit still applies.
- **`OUT_OF_WINDOW` with tolerance changed after check-in**: when `minutes ≤ current tolerance`, the alert carries `thresholdMinutes null` (known limitation; F03 does not snapshot tolerance).
- **Agencies in different timezones** (Perth and Sydney same day): instants compared in UTC, windows/times formatted in the stop's agency timezone, "today" is the actor's.
- **Event near UTC midnight**: the event window `[date − 1 day, date + 2 days)` plus `scheduled_date = date` slices correctly regardless of timezone.
- **Corrupt `alert_overrides_json` / invalid `PlatformSetting`**: fall back to defaults with a warning; the screen keeps working.
- **Inactive/deleted inspector with live appointments**: appears normally (work exists); `GET/PUT alert-thresholds` on a deleted inspector → 404.
- **`DONE → DRAFT` by AM keeping `inspector_id`**: stop disappears via the status join; raw `planned_count` marks the set as changed → STALE + straight-line fallback.
- **Plan origin `LAST_STOP`** (recomputed today after the first check-in): `origin` null (no separate origin pin); the fingerprint uses the configured origin so the recompute does not become a false STALE; last known point falls back to the configured origin when there is no event.
- **Late-notice after window end**: `estimatedArrivalAt = created_at + minutes` (reference = max(window start, notice instant)); the screen shows this, not `predictedStartAt + minutes`.
- **Locked-time period in the past**: allowed; tenant-rejected appointments count as not-locked so the number stays near the pre-cutoff value.

## Requirements *(mandatory)*

### Functional Requirements

**Endpoints & RBAC**

- **FR-001**: The system MUST expose `GET /v1/dashboard/live-day`, `GET /v1/dashboard/locked-time`, `GET /v1/inspectors/:id/alert-thresholds`, and `PUT /v1/inspectors/:id/alert-thresholds`, all requiring authentication.
- **FR-002**: All four endpoints MUST be restricted to roles AM and OP; CL_ADMIN, CL_USER, and INSP MUST receive 403 (`AUTH_FORBIDDEN` for the dashboard reads; the inspector routes' standard forbidden message), and unauthenticated requests MUST receive 401.
- **FR-003**: The new endpoints MUST live in a new `modules/live-day/` backend module under the `/v1/dashboard/...` prefix and MUST NOT modify `dashboard.routes.ts`, the dashboard analytics repository, `confirmationRate`, `ConfirmationMeter`, or any F04 endpoint (D12).
- **FR-004**: The system MUST rate-limit each endpoint per authenticated user (`live-day` 120/min; `locked-time` 30/min; alert-thresholds 30/min), keyed by `user.id` (fallback: a hash of the `Authorization` header, never the raw token; last resort `req.ip`), evaluated after authentication; the global per-IP limit still applies.
- **FR-005**: The system MUST return the standard error envelope `{ error: { code, message, details } }`; Zod validation failures MUST yield 400 `VALIDATION_ERROR`.

**Live-day read model**

- **FR-006**: `GET /v1/dashboard/live-day` MUST accept `date?` (`YYYY-MM-DD`, default: the actor's civil today in `actor.timezone ?? PLATFORM_TIMEZONE`), `includeGeometry?` (`none` default | `selected` | `all`), and `inspectorId?` (uuid, required when `includeGeometry=selected`).
- **FR-007**: The system MUST reject a `date` after tomorrow with 400 `LIVE_DAY_DATE_TOO_FAR`; it MUST accept today, tomorrow, and any past date.
- **FR-008**: The response MUST include `date`, `today` (actor's server-side civil today), `timezone`, `isToday`, `generatedAt`, `thresholdsDefault`, a `summary` aggregating inspector states and stop counts, and `inspectors[]` ordered by inspector name (`localeCompare 'en-AU'`); the client MUST never rely on its own clock for "today".
- **FR-009**: The roster (which inspectors appear) MUST include any inspector with a live (`SCHEDULED`/`DONE`) appointment on the date — with or without a plan — or an **active** `CANT_DO` on the date; an inspector whose stops are all invisible/removed and who has no active `CANT_DO` MUST be excluded (no idle "0 of 0" rows, D19).
- **FR-010**: Before any derivation, the system MUST apply the F04 T-1 visibility predicate to each inspector's appointments (SCHEDULED filtered by `todayCivil` in the inspector's timezone; `DONE` always visible) using the same pure predicate as the F04 day-plan input reader; the resulting visible rows MUST be the single source for fingerprint, stops, progress, alerts, last point, roster, and the "stop set changed" rule (L-F05-03).
- **FR-011**: The whole read MUST be produced by exactly one aggregated SQL query per endpoint (no N+1) and MUST make zero external/Mapbox calls (Matrix, Directions, geocoding) in any `includeGeometry` mode; the `PlatformSetting` read MUST go through the F03 30-second cache.
- **FR-012**: For each inspector, the system MUST derive the operational `state` ∈ {`NOT_STARTED`, `AT_PROPERTY`, `IN_TRANSIT`, `DONE_FOR_DAY`} from execution and stop classification only, using the F04 `classifyStops` rule (D18): `AT_PROPERTY` if any stop is in progress; else `DONE_FOR_DAY` if none are not-started; else `NOT_STARTED` if none finished; else `IN_TRANSIT`.
- **FR-013**: The system MUST derive per-stop progress ∈ {`DONE`, `CURRENT`, `OPEN`, `REMAINING`}: finished stops are `DONE`; among in-progress stops the one with the greatest `startedAt` is `CURRENT` and the rest are `OPEN`; if no in-progress stop exists, the first not-started stop in order is `CURRENT` and the rest are `REMAINING`. Plan stops order by `sequence` first; out-of-plan stops (`sequence null`, `inPlan false`) follow, ordered by window start.
- **FR-014**: The system MUST resolve the `lastKnown` point from non-abandoned executions of the inspector's live stops per the §4 table: the most recent check-out (finish coords, or that execution's start coords if finish coords are absent) or check-in (start coords); on a tie, the check-in wins; with no event, the plan origin (`BASE`/`OVERRIDE` → "Base"/"Start of day") or the profile base, else `NONE`. A `LAST_STOP` origin MUST never be used as the base coordinate.
- **FR-015**: The system MUST compute `delayMinutes` as `floor((startedAt − baseline)/60s)` for the started stop with the greatest `startedAt` (non-abandoned), where `baseline = published_service_start_at ?? service_start_at ?? window_start_at`; it MUST be nullable (null when no stop is started) and may be negative.
- **FR-016**: For each inspector with a plan **and `date ≥ today`**, the system MUST compute remaining-stop times via the shared F06 `projectStopEta` (fed by `toEtaPlanInput`/`toEtaRealEvents` adapters built directly from the query rows; stops with `sequence null` excluded) — the departure rule is F06's and MUST NOT be reimplemented here. `predictedStartAt` = projected start for not-started plan stops, `startedAt` for started stops, and window start for out-of-plan stops.
- **FR-017**: For a **past day** (`date < today`), the system MUST NOT call `projectStopEta`; `predictedStartAt` = `published_service_start_at ?? service_start_at ?? window_start_at` (out-of-plan: window start).
- **FR-018**: Alert and delay baselines MUST always use the planned time (`published_service_start_at ?? service_start_at ?? window_start_at`), never the projected time, so projection cannot hide a delay.

**Plan freshness, routes, and infeasibility**

- **FR-019**: For each inspector with a plan, the system MUST compute the F04 content fingerprint in memory (via the F04 `computeDayPlanFingerprint`, with the configured origin — override → base → none, never `LAST_STOP` — and `execState` per D18, over the T-1 visible rows) and set `planStatus 'STALE'` and `routeOutOfDate true` when it diverges from the stored `input_fingerprint` or the stored status is `STALE`; otherwise `planStatus` is the stored status and `routeOutOfDate` is false. Nothing is written and nothing is recomputed (D17).
- **FR-020**: The system MUST return route geometry only for inspectors requested via `includeGeometry` (`selected` → the one `inspectorId`; `all` → all visible inspectors); other inspectors MUST have `geometryIncluded false` and `geometry null` while still computing `routeApproximate`.
- **FR-021**: The system MUST build route geometry **entirely in memory** and MUST NOT read any stored geometry column or call Mapbox in any mode (F04 Plan B, PR #074, persists none and dropped `route_geometry`). `routeApproximate` is therefore **always true** for a returned route (= true regardless of `plan.approximate`, which is kept only as an input signal), and there is no simplification pass or `dayPlanId:version` cache.
- **FR-022**: For each inspector whose route is requested (`includeGeometry=selected` → the one `inspectorId`; `all` → all visible), the system MUST return a straight-line `LineString` (origin, if any, then coordinate-bearing stops in display order) with `properties { fromSequence: 0, toSequence: <last>, approximate: true }` and `routeApproximate true`; with fewer than two points, `geometry` MUST be null. All geometry MUST validate against the reused `dayPlanGeometrySchema`.
- **FR-023**: `routeOutOfDate` MUST come solely from the F04 fingerprint comparison (FR-019); the raw `planned_count` (plan stops that left the plan) and any T-1-visible live stop with a `plan_id` but `sequence null` corroborate staleness but MUST NOT change the geometry, which is always the straight-line route of FR-022.
- **FR-024**: The system MUST reject `includeGeometry=all` when the roster exceeds `LIVE_DAY_GEOMETRY_ALL_MAX_INSPECTORS = 60` with 400 `LIVE_DAY_TOO_MANY_ROUTES` (`details { inspectors, max: 60 }`), after the query and T-1 filter.
- **FR-025**: The system MUST expose plan infeasibility as an **indicator**, not an alert: `routeFeasible` (= `day_plans.feasible`; true when there is no plan) and `routeViolations[]` (plan stops with `late_s > 0`, T-1 visible, by sequence, `lateMinutes = ceil(late_s/60)`; empty when feasible). It MUST NOT add an eighth alert type and MUST NOT affect `alerts`, `needsAttention`, or alert ordering.

**Alerts**

- **FR-026**: The system MUST derive seven alert types per inspector — `DELAY`, `NOT_STARTED` (per stop), `LATE_NOTICE`, `CANT_DO`, `GEOFENCE`, `OUT_OF_WINDOW`, `COMPLETION_REMINDER` — each with its documented trigger, exit rule, threshold source, and payload fields per §5, and MUST set `needsAttention = alerts.length > 0`.
- **FR-027**: `DELAY` MUST trigger when `delayMinutes > effective delay threshold` (strict) and state ∈ {`AT_PROPERTY`, `IN_TRANSIT`} (and, on a past day, in any state with a started stop); it MUST carry `minutes`, `thresholdMinutes`, `thresholdSource`, and the started stop's `appointmentId`.
- **FR-028**: `NOT_STARTED` MUST trigger per live, visible, not-started stop (no execution or abandoned) when `now > baseline(stop) + effective not-started threshold` (strict, whole minutes) in any inspector state; on a past day it compares `window_end_at` instead of `now` and measures `minutes` to `window_end_at`; `occurredAt = baseline + threshold`; one alert per stop.
- **FR-029**: `LATE_NOTICE` MUST trigger from the most recent late-notice on a live, not-started stop, carrying `minutes = minutesLate`, `estimatedArrivalAt = computeEstimatedArrivalAt(window start in the agency timezone, client_occurred_at ?? created_at, minutes)` (the F03 pure function), `reason`, and `reasonLabel`; the system MUST NOT add `minutesLate` to a route ETA.
- **FR-030**: `CANT_DO` MUST trigger for a `CANT_DO` event whose appointment remains `REJECTED` with no `inspector_id` (active), carrying `reason`, `reasonLabel`, `note`, and `appointmentCode`; it MUST exit when the appointment is re-offered/cancelled or re-assigned. Only active `CANT_DO` counts for the roster.
- **FR-031**: `GEOFENCE` MUST trigger for a non-abandoned execution of a live stop with `out_of_radius` (`phase 'START'`) and/or `finish_out_of_radius` (`phase 'FINISH'`), carrying `phase`, `distanceMeters`, and `radiusMeters` (`geofence_radius_m`; null only for pre-F03 executions); `START` exits when the stop becomes finished.
- **FR-032**: `OUT_OF_WINDOW` MUST trigger solely on the F03 `out_of_window = true` flag of a non-abandoned execution of a live stop (never recomputed from times), with `occurredAt = started_at`, `minutes` = distance of the check-in to the nearest edge of `time_slot_start/end` in the agency timezone, and `thresholdMinutes` = the current tolerance only when `minutes > tolerance` (else null, with `thresholdSource` null).
- **FR-033**: `COMPLETION_REMINDER` MUST trigger when an `inspector_notices` row exists with `dedupe_key = '{COMPLETION_REMINDER_DEDUPE_PREFIX}:{appointmentId}:{date}:{current inspectorId}'` (prefix taken from the shared constant, never a literal) and the stop is not finished, carrying `occurredAt = notice.created_at` and `appointmentId`.
- **FR-034**: Alerts MUST be ordered `CANT_DO, COMPLETION_REMINDER, NOT_STARTED, DELAY, LATE_NOTICE, GEOFENCE, OUT_OF_WINDOW` and, within a type, by `occurredAt` descending; there is no acknowledge/dismiss — alerts only leave via their exit rules.
- **FR-035**: Effective thresholds MUST be resolved per field: per-inspector override when present (`thresholdSource 'INSPECTOR'`), else platform default (`thresholdSource 'PLATFORM'`); a corrupt override MUST fall back to platform defaults with a single warning.

**Locked time (01.13)**

- **FR-036**: `GET /v1/dashboard/locked-time` MUST accept `from?`/`to?` (civil dates; default today → today+13), reject `to < from` with 400 `LOCKED_TIME_INVALID_RANGE`, and reject spans over 31 days with 400 `LOCKED_TIME_RANGE_TOO_LONG`.
- **FR-037**: The confirmation-required set `E` MUST be non-deleted appointments in the period with `service_types.flow_type = 'ROUTINE'`, `requires_rental_tenant_confirmation = true`, and `key_required = false`. The denominator MUST be the `E` members whose status ∈ {`AWAITING_INSPECTOR`, `SCHEDULED`, `DONE`} plus those `REJECTED` with `rejection_reason_code ∈ {TENANT_NO_RESPONSE, TENANT_DECLINED}`; the numerator MUST be denominator members that are non-rejected and `CONFIRMED`; `percent = round(num/den×100, 1)`, null when the denominator is 0.
- **FR-038**: The result MUST include `overall`, `byAgency[]`, and `byRegion[]` (ordered by name, "No region" last), where a row's region is the group's `service_region_id` (even if inactive), else the active region containing the property by `ST_Intersects` with the lowest `region_number`, else "No region"; `byRegion[].agencyName` MUST be the owning agency's name (null for a global region or "No region"), via one aggregated SQL query and zero external calls.

**Alert thresholds config**

- **FR-039**: `GET /v1/inspectors/:id/alert-thresholds` MUST return `{ inspectorId, platformDefaults, override, effective }`; `PUT` MUST accept `{ delayMinutes: int 5–240 | null, notStartedMinutes: int 5–240 | null }` (`.strict()`, both required), store only the overridden keys (both null → column NULL), be "last write wins" and idempotent (equal value → no audit), and write audit `inspector.alert_thresholds_updated` (`entityType 'Inspector'`, `tenantId null`, `metadata { before, after }`).
- **FR-040**: `GET`/`PUT` on a non-existent or deleted inspector MUST return 404 `INSPECTOR_NOT_FOUND`.

**Observability & data**

- **FR-041**: The system MUST emit an `info` log `live_day.read { date, inspectors, includeGeometry, durationMs, bodyBytes }` once per request and `locked_time.read { from, to, rows, durationMs }`, and MUST NEVER log inspector coordinates (check-in/out, base) or tokens — including on error paths.
- **FR-042**: The system MUST add a nullable `alert_overrides_json` (`JSONB`) column to `inspectors` via an expand-only migration, with no `tenant_id`, no index, and no backfill; the migration diff MUST NOT drop the `service_regions` GIST `Unsupported()` index.
- **FR-043**: The shared package MUST add the `liveDayAlerts` `PlatformSetting` key (schema `{ delayMinutes, notStartedMinutes }`, each int 5–240, defaults `{ 20, 30 }`, section "Live Day alerts"), the `schemas/live-day.ts` request/response schemas (reusing `dayPlanGeometrySchema`), the `enums/live-day.ts` enums/labels/constants (`LIVE_DAY_SHOW_ALL_MAX = 40`, `LIVE_DAY_GEOMETRY_ALL_MAX_INSPECTORS = 60`), the inspector route-colour palette/helpers, and MUST export the previously-private `instantStr`/`instantStrNullable`/`civilDateStr`/`civilDateStrNullable` helpers (behaviour unchanged).
- **FR-044**: The committed OpenAPI contract and generated `api-types.ts` MUST be regenerated and committed in the same PR so the contract-freshness CI job passes.

### Key Entities *(include if feature involves data)*

- **LiveDayResponse**: a dated snapshot — `date`, `today`, `timezone`, `isToday`, `generatedAt`, `thresholdsDefault`, `summary`, and `inspectors[]`.
- **LiveDayInspector**: per inspector — `state`, `lastKnown`, `progress`, `delayMinutes`, `thresholds` (effective + source), `alerts[]`, `needsAttention`, `dayPlanId`, `planStatus`, `planVersion`, `routeOutOfDate`, `routeApproximate`, `routeFeasible`, `routeViolations[]`, `origin`, `geometryIncluded`, `geometry`, `stops[]`.
- **LiveDayStop**: per stop — identity/address, `sequence`, `inPlan`, `progress`, window + timezone, `startedAt`/`finishedAt`, `predictedStartAt`, `publishedStartAt`, `delayMinutes`, `missingCoordinates`.
- **LiveDayAlert**: typed alert — `type`, `occurredAt`, `appointmentId`/`appointmentCode`, `minutes`, `estimatedArrivalAt`, `thresholdMinutes`/`thresholdSource`, `reason`/`reasonLabel`/`note`, `phase`/`distanceMeters`/`radiusMeters`.
- **LockedTimeResponse**: `from`/`to`, `generatedAt`, `overall`, `byAgency[]`, `byRegion[]` (each `{ confirmed, required, percent }`; region rows add `agencyName`).
- **InspectorAlertThresholds**: `{ inspectorId, platformDefaults, override, effective }`.
- **`inspectors.alert_overrides_json`** (new, nullable, no `tenant_id`): `{ delayMinutes?: 5–240, notStartedMinutes?: 5–240 }`; only overridden keys; `NULL` = platform defaults.
- **`PlatformSetting.liveDayAlerts`** (new shared key): `{ delayMinutes, notStartedMinutes }`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (01.A4, derived state)**: After a check-in the inspector state is `AT_PROPERTY`; after a check-out it is `IN_TRANSIT` (stops remain) or `DONE_FOR_DAY` (none remain). Verified by the derivation truth table and the end-to-end HTTP flow driving the real `start`/`finish` routes.
- **SC-002 (01.A5, threshold alerts)**: Each of the seven alert types fires per its configured threshold or event, with `DELAY` and `NOT_STARTED` honouring platform default and per-inspector override under strict comparison, and `GEOFENCE`/`OUT_OF_WINDOW` following the F03 radius/tolerance applied at write time.
- **SC-003**: `GET /v1/dashboard/live-day` executes exactly one SQL query and zero external calls in every `includeGeometry` mode; `locked-time` likewise.
- **SC-004**: `planStatus 'STALE'` appears after an out-of-band edit and after a check-in without any recomputation or Mapbox call.
- **SC-005**: The 01.13 locked-time figures match the exact D21 formula overall, by agency, and by region (group region, else `ST_Intersects` lowest `region_number`), with `agencyName` on region rows.
- **SC-006**: All four endpoints are reachable only by AM/OP; every other role gets 403 and unauthenticated gets 401.
- **SC-007**: p95 latency ≤ 300 ms with 50 inspectors in `none` and ≤ 800 ms in `all`; `includeGeometry=all` with a roster > 60 returns 400; the `live_day.read` log carries `durationMs`/`bodyBytes` and never coordinates; rate limiting is per user.
- **SC-008**: Response bodies stay within the geometry budgets (`none` tiny, `selected` one straight-line route, `all` well under ~200 KB — straight-line routes are only origin + stop vertices), and no undeclared internal field (`input_fingerprint`, `alert_overrides_json`, any plan internals) ever escapes in the body.

## Assumptions

- All dependencies are merged into `develop` before this work: TASK-F04-2 (`day_plans`/`day_plan_stops`, `published_service_start_at`, `input_fingerprint`, `DayPlanOriginSource.LAST_STOP`, `dayPlanGeometrySchema`, `classifyStops`, `computeDayPlanFingerprint`, the T-1 visibility predicate) **as amended by F04 Plan B (PRs #072/#073/#074): no routing result is persisted and `route_geometry` is dropped — so this task reads no stored geometry and builds a straight-line route in memory (see the Reconciliation note in Overview)**, TASK-F06-1 (`projectStopEta` and its types in `packages/shared/src/route-planning/`), TASK-F03-1/F03-2 (`PlatformSetting` + reader, `inspector_field_events` with `client_occurred_at`/`abandoned_at`, the completion-reminder job + `COMPLETION_REMINDER_DEDUPE_PREFIX` + `computeEstimatedArrivalAt`), F01-1 (`inspectors.base_lat/lng`), and F02-1 (`inspector_notices.dedupe_key`).
- The multi-tenant exception (D14) is accepted: `live-day`/`locked-time` are cross-tenant AM/OP reads and `alert_overrides_json` has no `tenant_id`, justified as "inspector is cross-tenant, AM/OP only" (same precedents as `/inspector-workload`).
- Civil dates and wall-clock windows are in the stop's **agency** timezone; instants are UTC ISO; "today" is the **actor's** timezone (`actor.timezone ?? PLATFORM_TIMEZONE`), matching `get-inspector-workload`.
- There is no acknowledge/dismiss of alerts in this stage (L-F05-01); alerts only leave via their exit rules.
- The migration ordering places this expand-only migration after the X02/F01/F02/F03/F04 migrations; the timestamp is regenerated on rebase (D15).
- All F05 product decisions (D1–D21, L-F05-01..14, and the F03/F04/F06/X01 reconciliations) are closed; no pending cross-cutting decision (Q2/Q4/Q6/Q12) affects this backend slice.
- The only web/PWA impact is that TASK-F05-2 will consume this contract; this PR produces no front-end code.

## Out of Scope

- GPS, location pings, WebSocket/SSE.
- Active per-alert notification to operations (the screen and the F03 `CANT_DO` email suffice).
- Acknowledge/dismiss of alerts (server or client).
- Inspector pin clustering.
- Snapshotting the window tolerance on the execution (would change F03).
- An agency-facing view.
- A day history/report (the date selector only reads).
- Recomputing the plan on read (never Mapbox on read); the F04 recompute button is not on this screen.
- A historical "before the cutoff" snapshot of locked time.
- Any change to `dashboard.routes.ts`, the dashboard analytics repository, `confirmationRate`, `ConfirmationMeter`, or F04 endpoints.
