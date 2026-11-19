# Phase 0 Research — Day Plan (TASK-F04-2)

No `NEEDS CLARIFICATION` remained after `/speckit.clarify` (L-F04-03 resolved). This file records the decisions that shape the design.

## D1 — Mapbox caching/redistribution compliance (L-F04-03)

- **Decision**: Plan A — store `route_geometry`, `routing_matrix_json`, `leg_travel_json` for the plan's validity (purge next day) and return the raw matrix to the PWA in `routingInput`.
- **Rationale**: Pedro (Mapbox commercial/ToS owner) chose Plan A on the basis that Properfy holds/will secure a commercial Order granting a Navigation-API caching exception. Plan A gives the PWA offline-capable local reordering (no round-trips) and a drawn route line.
- **Evidence**: Mapbox Product Terms (2025-04-14) **§2.10.1 Navigation APIs**: *"Customer shall not export, download, cache or store results from any request to a Navigation API."* §1.9 Default Restrictions repeats this for "other results from the Service Offerings". Time-limited caching exists only for Mapping-API tiles (§2.8.1, 30-day on-device) and Permanent Geocodes (§2.7.3). The Matrix API doc page states only rate limits and defers usage terms to the ToS. Therefore the default terms **do not** permit (a)/(b)/(c); only an active Order ("Except as otherwise expressly permitted… in the applicable active Order") does.
- **Go-live prerequisite**: the Mapbox Order must be in force. **Alternative (Plan B)** if not: drop geometry/matrix/leg persistence, remove `routingInput`, reorder via server-side `POST /v1/inspector/day-plans/:date/order/preview` (etaSource `MATRIX`), re-call Matrix per save — a contract change rippling to F04-4.

## D2 — Staleness model: content fingerprint over trusted flag (L-F04-01)

- **Decision**: Every read recomputes `computeDayPlanFingerprint` (sha256 of origin + per-appointment schedule/window/duration/coordinate/execution-state ∈ `NOT_STARTED`/`STARTED`). A matching fingerprint ⇒ fresh (clear STALE without routing); a differing fingerprint ⇒ recompute.
- **Rationale**: Covers no-event edits (`update-appointment`, `bulk-reschedule`, coordinate change) and prevents a Mapbox call on check-out/DONE of an already-started stop. The `STALE` flag from the subscriber is only a hint; the fingerprint is the authority.
- **Alternatives rejected**: pure event-driven STALE (misses no-event edits — correctness bug); recompute-on-every-read (needless Mapbox cost).

## D3 — Publication: singleton pg-boss job gated on the T-1 claim

- **Decision**: `day-plan.publish` scheduled `'30 * * * *'` (Sydney), singleton (`teamSize/teamConcurrency 1`, `singletonKey`, `expireInMinutes 30`), runs `tenantCronTick.runDue('day-plan.publish', 19, gateRunner)`. The gate releases the claim for tenants whose T-1 (`appointment.reject-unconfirmed`) has not yet claimed today; the due set is recomputed from the DB each run; inspectors processed sequentially within a 25-min budget; defer (not approximate) on rate-limit/provider error in attempts 1–2; attempt 3 `strict: false` publishes approximate with reason.
- **Rationale**: `TenantCronTick` already provides per-agency timezone-correct hourly claims; reusing it (adding only `hasClaim`) avoids touching 4 existing jobs. Singleton + `published_at`/`notified_at`/`dedupeKey` make the two-Fly-machine race harmless (D17).
- **Alternatives rejected**: changing `TenantCronTick` (regression risk to 4 jobs); per-inspector scheduled jobs (fan-out, no shared rate budget).

## D4 — Frozen published ETA for the accuracy metric (L-F04-15)

- **Decision**: On first publication, freeze `published_eta`/`published_service_start_at`/`published_predicted_at`/`published_approximate` per stop; recomputes copy, never overwrite. The metric compares `published_service_start_at` to the real check-in.
- **Rationale**: The last recompute (afternoon) already starts from the latest check-in and would hide the morning prediction error. Measuring the frozen prediction is the honest signal. No version history table (Etapa 1 scope); reconstruction via `day_plan.computed` logs + F06 notification payloads.

## D5 — Timezone authority

- **Decision**: Plan `timezone` = inspector effective tz (`users.timezone ?? PLATFORM_TIMEZONE`). Publication window `isPublicationOpen(date, now, tz) = now ≥ zonedWallTimeToUtc(addCivilDays(date,-1), '19:30', tz)`; auto-publication by a read requires the window open in **both** the inspector tz and `PLATFORM_TIMEZONE` (`isPublicationOpenForInspector`). A plan with `published_at` is always returned (200) regardless of local hour (L-F04-02). STALE "today" uses `(now() AT TIME ZONE day_plans.timezone)::date`.
- **Rationale**: The plan is per inspector and spans agencies (the documented DayPlan tz exception, D14/N13); each stop window stays in its agency tz (`window_timezone`). Guards against a far-ahead inspector publishing before the platform T-1.

## D6 — Route sheet rendering (L-F04-10)

- **Decision**: Reuse `ExcelJsXlsxGenerator` (add optional `sheetName`/`preamble`) for XLSX "Route" sheet; a pdfkit renderer in the `PdfKitInvoicePdfGenerator` style for PDF (A4 landscape, Helvetica). Timezone suffixes only on mixed-tz plans; approximate/out-of-date banners; NFKD slug with `inspector` fallback; audit `day_plan.exported` without personal data; INSP 30-day limit.
- **Rationale**: Reuses existing generators; no new heavy dependency.

## D7 — Mapbox profile / optimizer provided by F04-1

- **Decision**: Consume `container.dayPlan.planRouteService` (`PlanRouteService`) and the shared optimizer/`toOptimizerInput`; this task adds no routing algorithm — only persistence, triggers, APIs. `interactive`/`strict`/`cachedMatrix` are passed per trigger (§4 of the algorithm).
- **Rationale**: Separation of concerns; F04-1 owns routing, F04-2 owns the plan lifecycle.

## D8 — `onboarding_completed_at` within the single heartbeat statement (R-F01-02)

- **Decision**: Extend the existing single `$executeRaw` in `recordAppState()` with `onboarding_completed_at = CASE WHEN $onboardingCompleted THEN COALESCE(onboarding_completed_at, $now) ELSE onboarding_completed_at END`; use case passes `onboardingCompleted`; no `updateMany`, no `findById`.
- **Rationale**: Preserves F01's atomicity (the Prisma `data` object cannot reference columns). Coordinates with F02's removal of `push_enabled` from the same statement (merge/rebase order in `prisma-inspector.repository.ts`).
