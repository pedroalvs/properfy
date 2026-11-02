# Feature Specification: Day Plan — Persistence, 19:30 Publication, APIs, Route Sheet, Weights, Metric & Purge

**Feature Branch**: `052-f04-2-day-plan-publish`
**Created**: 2026-11-02
**Status**: Draft
**Input**: TASK-F04-2 (`fase2-etapa1/tarefas/F04-tarefas.md`), premises L-F04-01..16, reconciliations R-F01-02/03, R-F02, R-F03, R-X02.
**Contract codes**: 01.A1, 01.A3, 01.A6, 00.A2 (part), 00.A5; supports 00.A1 (onboarding slice only).

> **Pair task (A + A2).** Pilar owns branch/worktree/spec and implements the model, jobs, APIs, publication, STALE, weights+preview, notices, `classifyStops`/`computeDayPlanFingerprint`, metric. Esteio (standby) implements the PDF/XLSX route sheet (L-F04-10), the metric wiring + purge (L-F04-15), `onboarding_completed_at` (00.2), AM/OP rate limits (L-F04-14), and effective-origin sheet rendering (L-F04-07). One PR, two authors.

## Resolved premises (recorded before contracts)

- **L-F04-03 (Mapbox consultation, D8) — RESOLVED 2026-11-02 = Plan A.** Pedro (responsible party for the Mapbox commercial/ToS relationship) decided to proceed with Plan A: the server stores Directions route geometry (`route_geometry`), the travel matrix (`routing_matrix_json`) and per-leg durations (`leg_travel_json`) for the plan's validity (purged the next day), and returns the raw matrix to the client in `routingInput`. **Compliance note:** Mapbox Product Terms (2025-04-14) §2.10.1 ("Customer shall not export, download, cache or store results from any request to a Navigation API") prohibits this under the *default* terms; Plan A therefore rests on a separate commercial Order with Mapbox granting a Navigation-API caching exception. **This Order is a go-live prerequisite** (see Deployment). If the Order is not in force at go-live, Plan B applies (remove `routingInput`; server-side `POST /order/preview`; re-call Matrix per save; no geometry/matrix persistence) — a contract change tracked for Part B (F04-4). The decision is recorded in `fase2-etapa1/decisoes.md` and the PR body.
- **Multi-tenant exception (D10, §7.1 of root CLAUDE.md).** `DayPlan` and `DayPlanStop` carry **no `tenant_id`**: the plan belongs to an inspector (a cross-tenant entity) and aggregates stops from several agencies. Precedents: `Inspector`, global `ServiceRegion`, `IntegrationSetting`, `PlatformSetting`. Isolation is enforced by (1) RBAC role check before any read (CL_*/TNT → 403); (2) INSP reads/writes filtered to `day_plans.inspector_id = actor.inspectorId`, other inspectors → 404; (3) stops always re-joined to live appointments with `a.inspector_id = day_plans.inspector_id AND a.deleted_at IS NULL AND a.status IN ('SCHEDULED','DONE')`; (4) AM/OP read any inspector by platform role; (6) audits with `tenantId: null, entityType: 'DayPlan'` (CL audit log is tenant-scoped, so CL never reads them). A scoping test proves a CL_*/INSP actor cannot read another subject's plan.
- **Timezones.** Civil `plan_date` and wall-clock windows are agency/inspector timezone values; instants (`eta`, `published_at`, `computed_at`) are UTC ISO. The plan's `timezone` is the inspector's effective timezone (`users.timezone ?? PLATFORM_TIMEZONE`) — the DayPlan exception to the agency-timezone rule, because the plan is per inspector and spans agencies. Each stop's window stays in its appointment's agency timezone (`window_timezone`). Platform "today"/cut-offs use `PLATFORM_TIMEZONE` (Sydney).

## Clarifications

### Session 2026-11-02

- Q: L-F04-03 (D8) — does the governing Mapbox documentation permit caching/storing and client-forwarding of Navigation-API (Matrix/Directions) results (option (c)-yes, and by the same clause (a)/(b))? → A: No under the default Mapbox Product Terms 2025-04-14 §2.10.1 ("Customer shall not export, download, cache or store results from any request to a Navigation API"). Pedro (Mapbox commercial/ToS owner) decided to **proceed with Plan A** on the basis that Properfy holds/will secure a commercial Order granting a Navigation-API caching exception; that Order is a **go-live prerequisite**. If it is not in force at go-live, Plan B applies (no geometry/matrix/leg-duration persistence, `routingInput` removed, server-side `POST /order/preview`, Matrix re-called per save). Recorded in Resolved premises, `fase2-etapa1/decisoes.md`, and the PR body.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspector opens tomorrow's/today's route (Priority: P1)

An inspector opens the app and sees the route for a given day: the stops in sequence, predicted arrival (ETA) and service times per stop, the day's origin, drive/wait/service totals, feasibility, and the map geometry. Opening the day computes or refreshes the plan on demand when inputs changed, without ever showing data from another inspector or exposing raw Mapbox tokens.

**Why this priority**: This is the core deliverable of entry 01 and the consumer of 00.A5 (base address) and the F04-1 optimizer. Without it nothing else in F04/F05/F06 has a plan to read.

**Independent Test**: Seed one inspector with a base address and three confirmed SCHEDULED appointments for a day; `GET /v1/inspector/day-plans/:date` returns a `DayPlanResponse` with 3 ordered stops, ETAs, origin `source BASE`, and geometry — and 403/404 for any other actor.

**Acceptance Scenarios**:

1. **Given** a published plan with 3 stops, **When** the inspector GETs the date, **Then** 200 with sequence, ETAs, origin, totals, feasibility and geometry (contract **01.A1**, **01.A3/00.A5**).
2. **Given** a plan whose inputs are unchanged, **When** the inspector GETs it, **Then** it is returned without any call to the routing provider.
3. **Given** a plan marked STALE by a check-out or `SCHEDULED→DONE` of an already-started stop (fingerprint unchanged), **When** the inspector GETs it, **Then** the STALE flag is cleared with no routing call and the same order/ETAs are returned (L-F04-01).
4. **Given** a plan with `published_at` set, **When** the inspector in any timezone GETs it, **Then** 200 regardless of local hour (L-F04-02).
5. **Given** a CL_ADMIN/CL_USER/TNT actor, **When** they call any day-plan route, **Then** 403; **Given** another inspector's plan, **Then** 404.
6. **Given** any response, **When** inspected, **Then** it contains no Mapbox token and no field outside `dayPlanResponseSchema`.

### User Story 2 - System publishes the next day's plan at 19:30 and notifies the inspector (Priority: P1)

After the daily T-1 unconfirmed-rejection job, the system automatically computes and publishes each inspector's plan for the next day at 19:30 in the inspector's local time, freezes the published ETAs, and sends a critical `ROUTE_PUBLISHED` notice (push, or SMS fallback within the F02 daily cap) so the inspector knows tomorrow's route is ready.

**Why this priority**: Entry 00.A2 (critical notice on publication) and the operational trigger that makes the plan appear without the inspector having to pull it.

**Independent Test**: With Mapbox stubbed, seed appointments for tomorrow, run `appointment.reject-unconfirmed` at 19:00 then `day-plan.publish` at 19:30 (injected clock); assert a PUBLISHED plan with frozen `published_eta` per stop and one `ROUTE_PUBLISHED` notice enqueued.

**Acceptance Scenarios**:

1. **Given** two inspectors with SCHEDULED appointments tomorrow and the T-1 claim present, **When** the publish job runs, **Then** two PUBLISHED plans and two `ROUTE_PUBLISHED` notices with a stable `dedupeKey` (contract **00.A2 part**).
2. **Given** a plan already PUBLISHED and notified, **When** the job re-runs, **Then** it neither recomputes nor re-notifies.
3. **Given** the provider is rate-limited on the 2nd inspector, **When** the job runs, **Then** the 1st stays published, the rest are deferred (not approximated), and a continuation is enqueued; by the 3rd attempt the provider is `strict: false` and publishes approximate with an explicit reason and an "approximate" note.
4. **Given** an infeasible plan (overlapping windows), **When** published, **Then** `feasible false`, the notice body says "{k} stop(s) may arrive after its window", a `warn` log `day_plan.published_infeasible` is emitted (L-F04-05).
5. **Given** two Fly machines contend for the singleton job, **When** it fires, **Then** exactly one execution occurs and `published_at`/`notified_at`/`dedupeKey` make repetition harmless.

### User Story 3 - Inspector reorders remaining stops, overrides the day origin, or recalculates (Priority: P2)

The inspector reorders only the not-yet-started stops (optimistic-concurrency safe), overrides the starting point for the day, clears it, or asks for a fresh optimized order — even while the first stop is already in progress.

**Why this priority**: Field control over the route; must not conflict with execution state or another writer.

**Independent Test**: Publish a plan, check in stop 1 (F03 start), GET (sees stop 1 executed), `PUT /order` the two remaining → 200 with the new order and stop 1 still executed.

**Acceptance Scenarios**:

1. **Given** a fresh plan, **When** `PUT /:date/order` with a valid `basedOnVersion` and the reorderable ids, **Then** 200 with `manualOrder true`; a stale/version-conflict request returns 409; a wrong id set returns 422 `DAY_PLAN_ORDER_MISMATCH` (contract supports **01.A1** reorder).
2. **Given** a day already started (a stop executed), **When** `PUT /:date/origin`, **Then** 422 `DAY_PLAN_ALREADY_STARTED` and the GET shows `origin.source LAST_STOP` (L-F04-07).
3. **Given** a valid address, **When** `PUT /:date/origin`, **Then** permanent geocoding is applied, the plan recalculates, and the audit records `{ suburb, state, postcode }` with no coordinates; any geocoder error → 503 `DAY_PLAN_ORIGIN_GEOCODER_UNAVAILABLE` (never 500).
4. **Given** an inspector recalculates, **When** `POST /:date/recalculate`, **Then** the suggested order is restored with `manualOrder false` and no notice.

### User Story 4 - Operations view, recalculate, export, preview weights and read the ETA metric (Priority: P2)

AM/OP read any inspector's plan (never calling Mapbox), recalculate a plan (notifying the inspector via `ROUTE_CHANGED` only on an effective change, at most once per 10 minutes), export the route sheet, preview the effect of route weights for a day, and read the "Route ETA accuracy" metric for the F05 footer.

**Why this priority**: Operational oversight and tuning; feeds F05/F04-5.

**Acceptance Scenarios**:

1. **Given** AM/OP, **When** `GET /v1/day-plans/:inspectorId/:date`, **Then** 200 with the stored plan (STALE if the fingerprint diverges), no provider call; CL/INSP → 403.
2. **Given** a published plan, **When** AM/OP recalculate with an effective change, **Then** one `ROUTE_CHANGED` notice per 10-minute window; no change → no notice (L-F04-06).
3. **Given** AM/OP, **When** `POST /v1/day-plans/preview` with weights, **Then** `current` + `proposed` previews from a single Matrix call, nothing stored; date outside today..+14 → 422 `DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` (L-F04-14).
4. **Given** AM/OP, **When** `GET /v1/day-plans/eta-accuracy`, **Then** the metric measured against the **frozen published** ETA (contract reads for F05), INSP → 403.

### User Story 5 - Route sheet PDF/XLSX (Priority: P2)

Inspector and AM/OP download the day's route as a PDF or XLSX with the stops in plan order, timezone-labelled times when agencies differ, an approximate/out-of-date banner where relevant, no raw ids, and an audited download.

**Why this priority**: Contract **01.A6** (printable route sheet).

**Acceptance Scenarios**:

1. **Given** a plan, **When** `GET …/sheet?format=pdf|xlsx`, **Then** 200 binary with the correct content type and `Content-Disposition` filename `route-{slug}-{date}.{ext}`; `format=csv` → 400 (contract **01.A6**).
2. **Given** an INSP request for a date older than 30 days, **Then** 422 `DAY_PLAN_SHEET_TOO_OLD`; AM/OP have no date limit; every delivered sheet writes a `day_plan.exported` audit without personal data (L-F04-10).
3. **Given** stops in two agency timezones, **Then** each time carries a short timezone suffix and the preamble notes "Times in each agency's local time".

### User Story 6 - Fresh-stop reader (F06), onboarding slice, and daily purge (Priority: P3)

A non-HTTP reader returns the fresh predicted start for one appointment (recomputing on demand like the inspector GET) for F06 to use before notifying tenants; the inspector heartbeat records `onboarding_completed_at` once; a daily job purges stored geometry/matrix/leg-durations of past plans.

**Acceptance Scenarios**:

1. **Given** an appointment in a fresh plan, **When** F06 calls `getFreshStopForAppointment`, **Then** `{ status: 'FRESH', serviceStartAt, … }`; inputs changed → recompute; two CAS losses → `{ status: 'STALE', … }` with the stored prediction; no plan/other inspector → `null`.
2. **Given** the heartbeat posts `onboardingCompleted: true`, **When** `GET /v1/inspectors/me`, **Then** `onboardingCompletedAt` is returned; a second post does not change it; CL never receives it (contract **00.A1** backend slice, supports 00.2).
3. **Given** plans with `plan_date < today (Sydney)`, **When** the purge job runs, **Then** `route_geometry`/`routing_matrix_json`/`leg_travel_json` are nulled and `geometry_purged_at` set; today/future untouched; a second run changes 0 rows.

### Edge Cases

- **No base address** → origin `NONE`, `originWarning NO_BASE`/`BASE_NOT_LOCATED`; first stop starts at its window.
- **0 stops** → empty plan stored only when the inspector opens (today/open D+1); the job creates no empty plan and sends no notice.
- **1 stop** → no Matrix; `routingInput null`.
- **Mapbox down/timeout** → interactive path falls back to stub with `approximate` + reason; the job defers (attempts 1–2) and only publishes approximate on attempt 3. 429/rate-limit in the job never silently becomes approximate.
- **STALE races** with compute or reorder → resolved by version + fingerprint (CAS).
- **Stop in progress** → check-in changes the fingerprint; GET recomputes and returns it in the executed prefix; `PUT /order` accepts only the not-started stops. Never a 422 loop.
- **Abandoned execution (F03)** → the stop returns to reorderable.
- **Past plan** → read without recompute and without geometry/matrix after purge; writes → 422.
- **Appointment reassigned/cancelled/deleted or moved out of SCHEDULED/DONE** → disappears from every read via the status join; plan goes STALE; never a 500 from the serializer (L-F04-04).
- **Timezone split** (agency ≠ inspector; DST; half-hour zones Adelaide/Darwin) → windows converted per stop; "today"/publication by the inspector timezone; the job by each agency's timezone (publishing when the last agency is claimed).
- **Base changed with a published plan (R-F01-03)** → PUBLISHED plans for today/D+1 go STALE (`BASE_CHANGED`); with a day override or after the first check-in the fingerprint is unchanged and STALE is only cleared.
- **Mixed-timezone / >30-day / non-ASCII name sheet** → timezone suffixes, 422, transliterated slug or `inspector` fallback.
- **SMS daily cap reached / notice older than 30 days (R-F02)** → F02 handles delivery and archival; the plan does not depend on the notice after the plan day.
- **Weights changed after publication (R-F03)** → stored plan unchanged and not STALE; next recompute uses the new weights (30 s cache).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST persist a per-inspector, per-day plan (`DayPlan` + ordered `DayPlanStop`s, no `tenant_id`) capturing sequence, predicted arrival/service/end times, waits, lateness, window snapshots, totals, feasibility, the optimizer method/provider, the origin used, the route geometry, the travel matrix and per-leg durations, with `@@unique(inspector_id, plan_date)`.
- **FR-002**: Every read MUST recompute an input **fingerprint** (sha256 of origin + per-appointment schedule/window/duration/coordinate/execution-state, with execution-state limited to `NOT_STARTED`/`STARTED`) and treat a matching fingerprint as "fresh". Check-in and abandonment change the fingerprint; check-out and `SCHEDULED→DONE` of an already-started stop do not (L-F04-01).
- **FR-003**: The inspector GET MUST return a published plan in any timezone (200 whenever `published_at` is set), recompute on demand when today/D+1 and the fingerprint diverges, and clear a STALE flag without any routing call when the fingerprint matches (L-F04-01, L-F04-02); reads are single-flight per `inspectorId:date`.
- **FR-004**: The system MUST auto-publish the next day's plan at 19:30 in the inspector's timezone via a singleton pg-boss job gated on the per-agency T-1 claim, processing inspectors sequentially within a 25-minute budget, deferring (never silently approximating) on rate-limit/provider errors in attempts 1–2 and publishing approximate with an explicit reason on attempt 3, enqueuing a continuation when deferred or over budget.
- **FR-005**: On first publication each stop MUST freeze `published_eta`/`published_service_start_at`/`published_predicted_at`/`published_approximate`; later recomputes copy these for the same appointment and never overwrite them; stops entering after publication receive them on the first computation in which they appear while not yet started.
- **FR-006**: Publication MUST send a critical `ROUTE_PUBLISHED` notice (via F02 `PublishSystemInspectorNoticeUseCase`) with a deterministic `dedupeKey`, whose title/body are lock-screen-safe (date, count, time, suburb, "Open Properfy" only — never contact name/phone, key/lockbox code, meeting location or full address) and note infeasibility/approximation when present (R-F02, L-F04-05).
- **FR-007**: The inspector MUST be able to reorder only not-started stops (`PUT /:date/order`, optimistic concurrency on `version`, idempotent replay, 409 on version/stale conflict, 422 on id mismatch, max 25 ids), recalculate (`POST /:date/recalculate`), set/clear a day origin (`PUT`/`DELETE /:date/origin`, permanent geocoding, 422 `DAY_PLAN_ALREADY_STARTED` after the first check-in, any geocoder error → 503), with per-route rate limits.
- **FR-008**: The effective origin of the remaining leg MUST be `LAST_STOP` (the last executed stop's property) once the day has started today, with `originOverride` kept informational; otherwise override → base → none, with `earliestDeparture` never in the past and never anticipating the stored planned departure (L-F04-07, §3).
- **FR-009**: Each stop MUST expose a single `primaryContact` selected by `is_primary desc` → role order (`RENTAL_TENANT, RENTAL_TENANT_REPRESENTATIVE, HOUSEKEEPER, PROPERTY_MANAGER, BROKER, OTHER`) → `created_at asc`, with `phone` only when E.164-valid and `role` exposed (L-F04-08).
- **FR-010**: AM/OP MUST read any inspector's plan without calling the provider, recalculate (notifying `ROUTE_CHANGED` only on an effective change — reorderable order changed or any `serviceStartAt` moved > 5 min — at most once per 10-minute window), export the sheet, preview weights, and read the ETA-accuracy metric, each with per-user rate limits (L-F04-06, L-F04-14).
- **FR-011**: All reads (inspector, AM/OP, sheet, metric, fresh-stop) MUST re-join stops to appointments with `status IN ('SCHEDULED','DONE')` so a stop whose appointment left those statuses disappears from the response and never causes a serializer 500 (L-F04-04).
- **FR-012**: The system MUST render the route sheet as PDF and XLSX (stops in plan order; `#`, Window, ETA, Address, Service, Contact, Key columns; timezone suffixes when agencies differ; approximate/out-of-date banners; filename slug; no raw ids), limit INSP downloads to the last 30 days (422 `DAY_PLAN_SHEET_TOO_OLD`), impose no date limit on AM/OP, and audit every delivered sheet as `day_plan.exported` without personal data (L-F04-10).
- **FR-013**: The system MUST register `routeWeights` in the platform settings registry (section "Route planning", defaults 1/1/1, each weight 0–10 with ≤1 decimal, at least one > 0) and offer a weights preview (`POST /v1/day-plans/preview`) that uses one Matrix call, no Directions, stores nothing, and restricts the date to today..+14.
- **FR-014**: The system MUST expose a "Route ETA accuracy" metric (`GET /v1/day-plans/eta-accuracy?days=7..90`) measured against the **frozen published** start time, excluding approximate/outlier/no-published/post-check-in-entry/abandoned rows, reporting `INSUFFICIENT_DATA`/`OK`/`ABOVE_THRESHOLD` with `thresholdMinutes 10`, `minSampleSize 30`.
- **FR-015**: A `MarkDayPlansStaleSubscriber` MUST mark plans STALE (idempotently; first `stale_reason` wins; `version + 1` on transition only; never touching plans before "today" in the plan's own timezone) on appointment status transitions, group changes, `INSPECTOR_FIELD_EVENTS.RECORDED` type `CANT_DO`, and `INSPECTOR_EVENTS.BASE_CHANGED` (`markStaleByInspector`, only PUBLISHED today/D+1) (R-F01-03); `LATE_NOTICE` and weight changes do not mark STALE (R-F03).
- **FR-016**: A daily job MUST purge `route_geometry`/`routing_matrix_json`/`leg_travel_json` of plans before today (Sydney), setting `geometry_purged_at`, leaving rows otherwise intact (the metric uses `published_*`).
- **FR-017**: The inspector heartbeat MUST record `inspectors.onboarding_completed_at` once (COALESCE within the single `$executeRaw` of `recordAppState()`, R-F01-02) and `GET /v1/inspectors/me` plus the AM/OP detail MUST return `onboardingCompletedAt`; CL never receives it (supports 00.2).
- **FR-018**: A non-HTTP `getFreshStopForAppointment` reader MUST return the fresh predicted start for one appointment for F06 (recomputing like the inspector GET, clearing a no-change STALE without routing, never recomputing past dates, `null` when the appointment is unlinked/absent) (F06 dependency).
- **FR-019**: Every reorder/recalculate/origin/export MUST write an audit (`day_plan.reordered/recalculated/origin_overridden/origin_override_cleared/exported`) and publication writes `day_plan.published`, all with `tenantId: null, entityType: 'DayPlan'` and no inspector coordinates; STALE marking, open-time compute and purge log only (no audit).
- **FR-020**: No response, log, audit or sheet MUST expose the Mapbox token or the inspector's raw coordinates; `classifyStops` and `computeDayPlanFingerprint` MUST be importable from the domain without importing Prisma (exported for F05, L-F04-16).

### Key Entities *(include if feature involves data)*

- **DayPlan** (`day_plans`, no `tenant_id`): one per `(inspector_id, plan_date)`; holds status (`DRAFT`/`PUBLISHED`/`STALE`), `version` (optimistic CAS), `input_fingerprint`, publication/notification/compute timestamps and trigger, STALE marker + first reason, effective origin (source/lat/lng, override json/coords/set-at), departure/finish, drive/wait/service/late/distance totals, feasibility, manual-order flag, suggested order, weights snapshot, optimizer method, routing provider/profile, approximate flag+reason, geometry, matrix, per-leg durations, purge timestamp, `timezone` (inspector effective tz).
- **DayPlanStop** (`day_plan_stops`, no `tenant_id`): ordered stop of a plan; appointment ref, sequence, eta/service start/end, the four frozen `published_*` fields, travel/distance/wait/late, window instants + window timezone, duration snapshot, coordinate snapshot, manual flag, executed flag (record only; API derives from live state), approximate flag, missing-coordinates flag. Unique `(day_plan_id, sequence)` and `(day_plan_id, appointment_id)`.
- **Inspector** (existing, extended): `onboarding_completed_at` (nullable; null = tour not completed/skipped).
- **PlatformSetting `routeWeights`** (existing registry, extended): `{ travel, windowWait, baseProximity }`, defaults 1/1/1.
- **InspectorNotice `ROUTE_PUBLISHED`/`ROUTE_CHANGED`** (F02, consumed): critical notices emitted by this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (01.A1)**: After publication the plan has a sequence, predicted times and route geometry (verified with the provider stubbed; homologated against the live job in staging).
- **SC-002 (01.A6)**: The route sheet is downloadable as PDF and XLSX with the plan's stops, correct content types and filenames.
- **SC-003 (00.A2 part)**: Publication delivers the critical `ROUTE_PUBLISHED` notice (push, or SMS fallback) to the inspector.
- **SC-004 (01.A3/00.A5)**: The persisted plan uses the inspector's base as origin and the F04-1 optimizer for ordering.
- **SC-005**: A CL actor never accesses any plan; an inspector accesses only their own; no response exposes the Mapbox token or inspector coordinates.
- **SC-006**: The ETA-accuracy metric answers AM/OP measured against the frozen published ETA.
- **SC-007**: An inspector reorders the remaining stops while the first stop is in progress (no 422 loop).
- **SC-008 (00.2 slice)**: `GET /v1/inspectors/me` returns `onboardingCompletedAt` after a heartbeat with `onboardingCompleted: true`.
- **SC-009**: A check-out generates no routing-provider call (L-F04-01).
- **SC-010**: `ROUTE_CHANGED` is sent only on an effective change and at most once per plan per 10 minutes (L-F04-06).
- **SC-011**: Mapbox API cost stays within budget: Matrix < 100k elements/month and Directions < 100k requests/month (plan estimate 16.5k / 6.6k), tracked via `day_plan.computed` logs and `/metrics`.
- **SC-012**: PR under 150 changed files (estimated ~105); backend full suite (unit + integration + db) green.

## Assumptions

- **L-F04-03 = Plan A** with a Mapbox commercial Order granting a Navigation-API caching exception (go-live prerequisite). If absent at go-live, Plan B applies (see Resolved premises).
- Dependencies are merged on `develop`: F04-1 (#1330: `PlanRouteService`, `IRoutingService`, optimizer, Postgres rate limiter, `DAY_PLAN_ROUTING_PROVIDER` kill switch, `ServiceType.default_duration_minutes`), F01-1 (`base_lat/lng`, `inspectorBaseAddressSchema`, `INSPECTOR_EVENTS.BASE_CHANGED`, `recordAppState()` single `$executeRaw`), F02-1 (`PublishSystemInspectorNoticeUseCase`, `ROUTE_*` types, `INSPECTOR_NOTICE_TARGET_PATTERNS`, SMS cap), F03-1 (`PlatformSetting`, `IPlatformSettingsReader`), F03-2 (`INSPECTOR_FIELD_EVENTS.RECORDED`, `inspection_executions.abandoned_at`), X02-1 (`geocodeWithTimeout`, `formatGeocodingQuery`, permanent mode).
- `TenantCronTick` is unchanged; only `ICronJobRunRepository.hasClaim` is added. `/today` stays out of `INSPECTOR_NOTICE_TARGET_PATTERNS` until Part B (F04-3).
- Platform is Sydney-only in practice; `DAY_PLAN_PUBLISH_ENABLED` (default true) and `DAY_PLAN_ROUTING_PROVIDER` (F04-1) are the kill switches.
- Two migrations (expand-only): `day_plans`/`day_plan_stops` + 4 enums, and `inspectors.onboarding_completed_at`.
- Shared `api-types.ts` is regenerated (`pnpm generate:api`); `notification-templates.ts`/`role-matrix.ts` are append-only; one migration per PR (timestamp regenerated on rebase).
- Part B (PWA) and AM/OP web screens are out of scope here (F04-3/4/5, F05 consume these contracts); no in-app tour UI (only the `onboarding_completed_at` backend slice).
