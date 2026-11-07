# Feature Specification: Reliability Index Metrics (backend + shared)

**Feature Branch**: `062-f07-1-index-metrics`
**Created**: 2026-11-07
**Status**: Draft
**Input**: User description: "F07-1 Reliability index metrics (backend+shared)"
**Task source**: `fase2-etapa1/tarefas/F07-tarefas.md` § TASK-F07-1
**Contract codes**: 03.4b, 03.5, effect of 03.3; acceptance criterion **03.A1**

## Overview

Properfy must measure how reliable each inspector is, so the operations team can rank inspectors, spot problems, and later (F08) set goals and rewards. This feature builds the **measurement engine** only: the pure domain that turns raw operational facts (executions, field events, surveys, day-plan stops, status-transition audits) into eight reliability metrics and a single 0–100 score, plus the configurable weights that drive the score and the two new rejection reason codes that let operators attribute no-shows and non-executions to an inspector.

This slice is **dark**: it adds no HTTP endpoint and no UI. The daily snapshot, job, recompute-on-save and AM/OP API are TASK-F07-2; the "Inspector performance" screen is TASK-F07-3. The value of this slice is the exported `ReliabilityMetricsService` (consumed by F07-2 and F08) and the two accountability codes, which the status-transition endpoint already accepts and audits from this PR on.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compute an inspector's reliability metrics and score for any period (Priority: P1)

As the platform (and, through F07-2/F08, the operations team), I need a single engine that computes, for one inspector or for all inspectors, the eight reliability metrics and the overall score over any civil-date window, so that a daily snapshot (F07-2) and period-scoped goals (F08) can be built on one consistent definition.

**Why this priority**: This is the whole purpose of the feature and the critical-path dependency for F07-2 and F08. Without it there is no index.

**Independent Test**: Call `computeMetric(metric, inspectorId, from, to)` and `computeAll(from, to)` against fixed worked-example fixtures (the six inspectors Ana…Fábio) and assert each metric's rate, the renormalized score, and the status, for periods of 1, 7, 14, 30 and 92 days. No endpoint or job is needed to verify.

**Acceptance Scenarios**:

1. **Given** Ana's twelve completed services in `[2026-11-01, 2026-11-30]` with equal weights, **When** the score is computed, **Then** the status is `SCORED` and the score is `88.3`.
2. **Given** the same facts but `PUNCTUALITY` weight set to `3`, **When** the score is recomputed, **Then** the score changes to `87.3` (the formula follows the configured weights).
3. **Given** an inspector with fewer than `minimumVolume` services, **When** the score is computed, **Then** the status is `INSUFFICIENT_VOLUME` and the score is `null`, while the individual metrics are still computed for the drawer.
4. **Given** 1 inspector or 50 inspectors × 20 services, **When** `computeAll` loads the facts, **Then** the reader runs the **same fixed number of queries** (no growth with inspector count).
5. **Given** a period where an appointment went `DONE → REJECTED` after Ana completed it, **When** facts are built, **Then** the rejected DONE is attributed to Ana (via `releasedInspectorId`), not to whoever currently holds the appointment, even though `appointments.inspector_id` is now null.

---

### User Story 2 - Configure the reliability index weights and thresholds (Priority: P2)

As an Admin Master / Operator, I need a `reliabilityIndex` platform setting that holds the per-metric weights and the volume/satisfaction thresholds, so the score can be tuned without a deploy and so F07-2 can recompute snapshots when I save it.

**Why this priority**: The score is meaningless without weights, and 03.A1 requires the score to react to weight changes. The setting is read by this slice's engine; the generic F03 `GET/PUT /v1/platform-settings/:key` endpoints already serve it (recompute-on-save is F07-2).

**Independent Test**: Validate `PLATFORM_SETTINGS_REGISTRY.reliabilityIndex` defaults and its Zod schema (weights 0–10, `minimumVolume` 1–200, `volumeReferenceOverride` null|1–1000, `minimumRatings` 1–50, "at least one weight > 0"), and prove `resolvePlatformSettingValue('reliabilityIndex', null)` returns the defaults.

**Acceptance Scenarios**:

1. **Given** no stored value, **When** the setting is resolved, **Then** all eight weights are `1`, `minimumVolume` is `10`, `volumeReferenceOverride` is `null`, and `minimumRatings` is `3`.
2. **Given** a payload with all eight weights `0`, **When** it is validated, **Then** it is rejected with "Set at least one weight above 0".
3. **Given** `minimumRatings` of `0`, `51`, or `2.5`, **When** validated, **Then** it is rejected; `1` and `50` are accepted.

---

### User Story 3 - Attribute no-shows and non-executions to an inspector (Priority: P2)

As an Admin Master / Operator, I need two new rejection reason codes — `INSPECTOR_NO_SHOW` (the inspector never attended) and `NOT_EXECUTED` (marked done but not actually carried out) — so the reliability index can hold an inspector accountable, while ordinary tenant-side or administrative rejections never penalise anyone.

**Why this priority**: Without these codes the punctuality, "can't attend", and DONE→REJECTED metrics cannot distinguish inspector fault from tenant/admin outcomes. The codes are added here (shared enum + per-origin transition guard + audit metadata); the dialog option is TASK-F07-3.

**Independent Test**: Unit-test `allowedRejectionCodesFrom` for every status, `reasonCodeLabel` for both codes, and the status-transition use case for accept/reject of each code from each origin and actor.

**Acceptance Scenarios**:

1. **Given** an OP doing `SCHEDULED → REJECTED` with `INSPECTOR_NO_SHOW`, **When** the transition runs, **Then** it succeeds, the audit `appointment.status_transition` carries `metadata.rejectionReasonCode = 'INSPECTOR_NO_SHOW'` and `metadata.releasedInspectorId` = the prior inspector.
2. **Given** any actor using `INSPECTOR_NO_SHOW` from a status other than `SCHEDULED`, or a SYS actor using it at all, **When** the transition runs, **Then** it fails with `422 REJECTION_CODE_NOT_ALLOWED`.
3. **Given** an AM doing `DONE → REJECTED` with `NOT_EXECUTED`, **When** the transition runs, **Then** it succeeds; the same code from `SCHEDULED → REJECTED` fails with `422 REJECTION_CODE_NOT_ALLOWED`.

---

### User Story 4 - Explain every metric with a bounded, privacy-safe failure list (Priority: P3)

As an operator (through the F07-3 drawer), I need each metric result to carry up to 20 of its most recent failures with a short human-readable reason and a link to the appointment, so a low score can be understood — without ever exposing the inspector's raw location.

**Why this priority**: Explainability is required by the contract (L-F07-06) and by the F07-3 drawer, but the score itself is usable without it, so it ranks below the engine and the codes.

**Independent Test**: Assert that `computeMetricFromFacts` returns `failures` (≤ 20, most recent first) and `failureCount` (total before the cap), that each `detail` is ≤ 80 characters and contains no address, coordinate, or agency name, and that `VOLUME` has an empty failure list.

**Acceptance Scenarios**:

1. **Given** 25 punctuality failures, **When** the metric is computed, **Then** `failureCount` is `25` and `failures` holds the 20 with the most recent `serviceDate`.
2. **Given** any metric, **When** a failure detail is produced, **Then** it is ≤ 80 characters and carries no location data (only derived values such as distance and radius).

### Edge Cases

- **Attribution after re-offer**: an appointment that went `DONE → REJECTED` and was re-offered to a new inspector who could not check in (unique-execution block) and whose DONE came from the OP → the original inspector keeps the `EXECUTED` fact (`doneRejected = true`), the new inspector gets a `DONE_WITHOUT_EXECUTION` fact (counts in volume, `NO_SHOW` in punctuality). The old execution row is never used to attribute the new DONE.
- **Lost audit** (fire-and-forget): a DONE→REJECTED whose `appointment.done_rejected` / `status_transition` audits are missing produces **no** fact — the inspector of that DONE is unknowable and nothing is guessed.
- **Pre-F03 execution** (`geofence_radius_m` null): excluded from punctuality (metric 1) and geofence (metric 2); still counts in volume.
- **Late client-time sync** (F03 D25, R1): a check-in stored with `out_of_window = false` because the client time was implausible is treated as `PUNCTUAL` — the window is never re-evaluated from `started_at` ("never penalise without evidence").
- **`CANT_ATTEND` with ≥ 24 h notice** (L-F07-01): leaves punctuality (metric 1) as `NOT_EVALUABLE` but still counts as a miss in "can't attend" (metric 6).
- **Late `NOT_EXECUTED` rejection** (L-F07-07): a `NOT_EXECUTED` recorded more than 30 days after the service date, when the service date falls outside the queried period, enters the period that contains the rejection date — counting **only** in metric 8 (`lateRejection = true`), never duplicated.
- **Satisfaction below `minimumRatings`** (L-F07-03): rate is `null` (dropped from the score, weights renormalised); `averageRating` and `eligibleCount` are kept for the drawer.
- **Newly registered inspector** (L-F07-05): the volume reference is pro-rated by the civil days since registration; leave/pause/reactivation is **not** pro-rated (documented limitation — the model stores no status history).
- **No active inspectors**: the volume reference floors at `1`, and every inspector's `VOLUME` is `0`.
- **Reopened execution** (`resumed_at`): while still open (`finished_at` null) the service is outside the universe; once finished it re-enters but is excluded from metric 3 (the original `started_at` would inflate the duration).
- **Day-boundary / DST**: the service date is always the agency-timezone civil date; the instant pre-filter of −1/+2 days covers any zone and DST shift.

## Requirements *(mandatory)*

### Functional Requirements

**Shared — metric keys, labels, constants**

- **FR-001**: The shared package MUST export `ReliabilityMetricKey` (object `as const` + type, matching the `reason-codes.ts` pattern) and `RELIABILITY_METRIC_KEYS` in the exact canonical order `['PUNCTUALITY','GEOFENCE','NO_STUCK','SATISFACTION','LATE_NOTICE','CANT_ATTEND','VOLUME','DONE_REJECTED']` (exactly eight).
- **FR-002**: The shared package MUST export English `RELIABILITY_METRIC_LABELS` and `RELIABILITY_METRIC_DESCRIPTIONS` for all eight keys, and `ReliabilityScoreStatus` with `SCORED`, `INSUFFICIENT_VOLUME`, `NO_WEIGHTED_DATA` (the `NOT_COMPUTED` API status is introduced in F07-2).
- **FR-003**: The shared package MUST export the constants `RELIABILITY_WINDOW_DAYS = 30`, `RELIABILITY_TRAVEL_FACTOR = 1`, `CANT_ATTEND_EARLY_NOTICE_HOURS = 24`, and `RELIABILITY_FAILURES_MAX = 20`.
- **FR-004**: The shared package MUST export a `reliabilityMetricResultSchema` (Zod) describing one metric result: `metric`, `rate` (0–1, 4 decimals, nullable), `eligibleCount`, `successCount` (nullable; null only for satisfaction), `averageRating` (nullable; satisfaction only), `volumeReference` (nullable; volume only), `weightedSuccess`, `weightedEligible` (minutes), `volume`, `activeDays` (nullable; volume only), `failureCount`, and `failures` (≤ 20 of `{ appointmentId, serviceDate, detail ≤ 80 }`).

**Shared — rejection codes**

- **FR-005**: The shared `RejectionReasonCode` enum MUST gain `INSPECTOR_NO_SHOW` ("Inspector didn't attend") and `NOT_EXECUTED` ("Inspection was not actually carried out"), each with a docblock stating when it applies and that it penalises the inspector.
- **FR-006**: The shared package MUST export `allowedRejectionCodesFrom(fromStatus)` built on a per-origin map such that `INSPECTOR_NO_SHOW` is allowed only from `SCHEDULED`, `NOT_EXECUTED` only from `DONE`, and the existing codes keep their current origins (respecting `SYSTEM_ONLY_REJECTION_CODES`).
- **FR-007**: `reasonCodeLabel` MUST return the two new labels; the existing fallback behaviour for unknown codes is preserved, and the `reason-codes` count test MUST be updated (total = previous + 2).

**Shared — reliabilityIndex platform setting**

- **FR-008**: `PLATFORM_SETTINGS_REGISTRY` MUST gain a `reliabilityIndex` entry (schema + complete defaults + `section: 'reliabilityIndex'`) with: `weights` (eight integer weights 0–10, refined so at least one is > 0), `minimumVolume` (integer 1–200), `volumeReferenceOverride` (integer 1–1000 or null), and `minimumRatings` (integer 1–50).
- **FR-009**: The `reliabilityIndex` defaults MUST be all weights `1`, `minimumVolume` `10`, `volumeReferenceOverride` `null`, `minimumRatings` `3`.

**Backend — service universe (facts)**

- **FR-010**: The system MUST build a per-inspector service universe for a civil-date window where each item is a **DONE occurrence** (current or later-rejected) or a `CANT_ATTEND` event or an OP-marked `NO_SHOW_REJECTED`; appointments with `deleted_at` are never included.
- **FR-011**: A DONE occurrence MUST be attributed to the inspector of **that DONE**: `appointments.inspector_id` for the current DONE (unchanged by DONE), or `metadata.releasedInspectorId` of the paired `DONE → REJECTED` status-transition for a later-rejected DONE. The system MUST NOT attribute a rejected service by the current `appointments.inspector_id` (nulled by block 7c) nor by `inspection_executions.inspector_id` after a re-offer.
- **FR-012**: A DONE occurrence MUST be typed `EXECUTED` when a finished, non-abandoned execution of the **same** inspector exists, otherwise `DONE_WITHOUT_EXECUTION`. A `CANT_ATTEND` event is typed `CANT_ATTEND`; an OP `INSPECTOR_NO_SHOW` rejection is typed `NO_SHOW_REJECTED`.
- **FR-013**: A `CANT_ATTEND` MUST be discarded when the same inspector has a DONE occurrence or a `NO_SHOW_REJECTED` on the same appointment; a `NO_SHOW_REJECTED` co-exists with a later DONE occurrence of the same inspector on the same appointment (distinct events).
- **FR-014**: A later-rejected DONE MUST count in metric 8 **only** when the paired `status_transition` metadata has `rejectionReasonCode = 'NOT_EXECUTED'`; any other code (or a legacy row without the key) removes that DONE from the universe entirely (no fact for anyone).
- **FR-015**: The service date MUST follow P2 by fact type, in the **agency timezone**: `inspection_executions.finished_at` (`EXECUTED`), `appointments.scheduled_date` (`DONE_WITHOUT_EXECUTION`, `NO_SHOW_REJECTED`), `inspector_field_events.created_at` (`CANT_ATTEND`); the only exception is a late `NOT_EXECUTED` rejection (L-F07-07), which uses the rejection date.
- **FR-016**: The facts reader MUST load the entire universe in a **fixed number of queries** (seven, per the Q1–Q7 design), independent of the number of inspectors, and MUST accept an optional `inspectorIds` filter; it MUST select **no** latitude/longitude or any coordinate (D12 / F03 D10).

**Backend — service weight & per-metric evaluation (domain, pure)**

- **FR-017**: The service weight MUST be `durationMinutes + RELIABILITY_TRAVEL_FACTOR × plannedTravelMinutes`, where `durationMinutes` is the matching day-plan stop's `duration_minutes` (same inspector, `plan_date = scheduled_date`) or else `service_types.default_duration_minutes`, and `plannedTravelMinutes` is that stop's `travel_s / 60` (or `0` without a stop). Weight is always ≥ 5 (no division by zero).
- **FR-018**: `evaluatePunctuality(fact, { toleranceMinutes })` MUST return `PUNCTUAL | EARLY | LATE | NO_SHOW | NOT_EVALUABLE` following the rules in the task (window + effective start + published service start rescues lateness only; `DONE_WITHOUT_EXECUTION`/`CANT_ATTEND`/`NO_SHOW_REJECTED` = `NO_SHOW`; `CANT_ATTEND` ≥ 24 h early = `NOT_EVALUABLE`; pre-F03 `geofence_radius_m` null = `NOT_EVALUABLE`; `out_of_window` used as stored).
- **FR-019**: `evaluateGeofenceCompliance(fact)` MUST return `PASS | MISS | EXCLUDED`: each evaluated leg (non-null distance) is `PASS`, `MISS` (flag true and accuracy null or ≤ `geofence_radius_m`), or inconclusive (flag true and accuracy > radius); execution is `MISS` if any leg misses, `PASS` if none miss and at least one passes, else `EXCLUDED`. Non-`EXECUTED` and pre-F03 are `EXCLUDED`.
- **FR-020**: `no-stuck` MUST classify an `EXECUTED`, non-reopened fact as stuck when `finished_at − started_at > STUCK_THRESHOLD_HOURS` (6 h); reopened (`resumed_at` set) and other types are `EXCLUDED`.
- **FR-021**: `late-notice` MUST consider only `LATE` facts; "notified in advance" is true when some `LATE_NOTICE` of the same inspector has `effectiveNoticeAt < deadline`, where `deadline = publishedEtaAt ?? windowStartAt` and `effectiveNoticeAt = resolveEffectiveEventTime(client_occurred_at, created_at).effectiveAt`. A late-notice of another inspector, or an ETA from another inspector's plan or another date, is ignored.
- **FR-022**: The eight metrics MUST be computed from the facts per the definitions table: (1) `PUNCTUALITY`, (2) `GEOFENCE`, (3) `NO_STUCK`, (4) `SATISFACTION` (weighted `(rating − 1)/4`; `rate null` below `minimumRatings`, keeping `averageRating`/`eligibleCount`), (5) `LATE_NOTICE`, (6) `CANT_ATTEND` (`rate = 1 − faults/total`; `NO_SHOW_REJECTED` counts as a fault), (7) `VOLUME`, (8) `DONE_REJECTED`.
- **FR-023**: Each weighted rate MUST be `Σ w·success / Σ w` over the metric's eligible services, and `null` when there is no eligible service (P5); a metric whose `rate` is `null` or whose weight is `0` is dropped from the score, and the remaining weights are renormalised.

**Backend — volume reference, pro-rata, score**

- **FR-024**: `computeVolumeReference(completedCounts, override, periodDays)` MUST return `{ value, source, activeInspectors, periodDays }`: with a non-null override, `value = max(1, roundToHalf(override × periodDays / RELIABILITY_WINDOW_DAYS))` and `source = 'OVERRIDE'`; otherwise `value` = median of the `completedCount ≥ 1` of all inspectors (floor 1, even count = mean of the two middle values) and `source = 'MEDIAN'`.
- **FR-025**: `VOLUME` MUST be `rate = min(1, completedCount / (volumeReference × activeDays / periodDays))`, where `completedCount` counts only current-DONE occurrences (not later-rejected, not `CANT_ATTEND`, not `NO_SHOW_REJECTED`), `activeDays = activeDaysInPeriod(inspectorCreatedOn, from, to)`, and `rate` is `null` when `activeDays` is `0`. `volumeReference` is exposed only on the volume metric.
- **FR-026**: The volume reference MUST be computed **once per computation** and shared by every inspector in that run: `computeAll` without a filter derives it from the loaded facts; `computeAll` with `inspectorIds` and `computeMetric('VOLUME', …)` call `loadCompletedCounts(from, to)` once; `computeMetric` of a non-volume metric never calls `loadCompletedCounts`; a non-null `volumeReferenceOverride` skips `loadCompletedCounts` entirely.
- **FR-027**: `computeReliabilityScore(metrics, settings, volume)` MUST return `{ status, score }`: `volume < minimumVolume` → `INSUFFICIENT_VOLUME` with `score null` (metrics still computed); `Σ W_k = 0` after dropping nulls → `NO_WEIGHTED_DATA` with `score null`; otherwise `SCORED` with `score = roundHalfUp(100 × Σ W_k·r_k / Σ W_k, 1)` using **unrounded** rates.
- **FR-028**: Rates MUST be stored/displayed rounded to 4 decimals (`roundHalfUp(x, 4)`); the score MUST be computed from the unrounded rates and rounded half-up to 1 decimal, with `roundHalfUp(v, d) = Math.round((v + Number.EPSILON) × 10^d) / 10^d` for `v ≥ 0`.

**Backend — service & query boundaries**

- **FR-029**: `ReliabilityMetricsService` MUST expose `computeMetric(metric, inspectorId, from, to)`, `computeAll(from, to, inspectorIds?)`, and `computeAllWith(tx, from, to, settings)` (transaction-scoped, used by the F07-2 job), reading `fieldEvents.checkInWindowToleranceMinutes` and `reliabilityIndex` **once** per call.
- **FR-030**: `computeMetric`/`computeAll` MUST accept any civil-date period (1 to 92+ days); `from > to` or an invalid date MUST throw `RangeError`.
- **FR-031**: Each metric result MUST carry `failures` (≤ `RELIABILITY_FAILURES_MAX`, most recent `serviceDate` first) and `failureCount` (total before the cap); each `detail` is produced by a pure function, in English, ≤ 80 characters, with agency wall-clock times, and with **no** address, coordinate, or agency name. `VOLUME` carries an empty failure list.

**Backend — transition guard & audit**

- **FR-032**: The status-transition use case MUST reject a transition whose `rejectionReasonCode ∉ allowedRejectionCodesFrom(appointment.status)`, and an `INSPECTOR_NO_SHOW` by a SYS actor, with `422 { error: { code: 'REJECTION_CODE_NOT_ALLOWED', message: "This rejection reason can't be used from the current status", details: { fromStatus, rejectionReasonCode } } }`, before any write. The five RBAC sources for transitions are unchanged.
- **FR-033**: When a transition to `REJECTED` carries a `rejectionReasonCode`, the `appointment.status_transition` audit MUST record `metadata.rejectionReasonCode`; without a code the key is absent.

**Backend — persistence & wiring**

- **FR-034**: An expand-only index `inspection_executions(finished_at)` MUST be added (schema `@@index([finished_at])` + one migration ordered after the F03/F04 migrations). **No** new index is added to `audit_logs`. The generated migration MUST NOT drop any `Unsupported()` index.
- **FR-035**: `STUCK_THRESHOLD_HOURS` MUST be moved to a shared backend module and re-exported, with the existing stuck-alert worker importing it and no behaviour change.
- **FR-036**: The DI container MUST expose `container.reliability.metricsService` wired with the Prisma facts reader and the F03 `IPlatformSettingsReader`.

**Multi-tenant & privacy**

- **FR-037**: Reliability facts, metrics, and the (future) snapshot MUST carry **no `tenant_id`**: the inspector is cross-tenant (D9; precedents: `Inspector`, global `ServiceRegion`, `DayPlan`, `PlatformSetting`). The facts reader scopes by `inspectorId`, never by tenant; it reads `appointments.tenant_id` only to resolve the agency timezone. This slice exposes no endpoint, so the `CL_ADMIN`/`CL_USER`/`INSP`/`TNT` → 403 isolation and its scope test land at the API in TASK-F07-2; this slice MUST prove privacy-by-construction (no coordinate selected into facts, results, or failure details).

### Key Entities *(include if feature involves data)*

- **ServiceFact**: one service occurrence for one inspector in a period — kind (`EXECUTED` / `DONE_WITHOUT_EXECUTION` / `CANT_ATTEND` / `NO_SHOW_REJECTED`), origin, `serviceDate`, duration and planned-travel minutes, timing/geofence flags and distances/accuracies (never coordinates), survey rating, late-notice times, `doneRejected`, `lateRejection`, `inspectorCreatedOn`. Pure in-memory; not persisted in this slice.
- **ReliabilityMetricResult**: the per-metric output (`reliabilityMetricResultSchema`), carrying rate, counts, weighted sums, volume reference (volume only), active days (volume only), and the bounded failure list.
- **reliabilityIndex platform setting**: cross-tenant (`PlatformSetting`, no `tenant_id`) — weights, `minimumVolume`, `volumeReferenceOverride`, `minimumRatings`.
- **RejectionReasonCode (extended)**: adds `INSPECTOR_NO_SHOW` and `NOT_EXECUTED`, each restricted by transition origin.

## Success Criteria *(mandatory)*

### Acceptance criteria 03.A1 *(identifiers verbatim from TASK-F07-1; prose in English per Constitution §Commits)*

- **03.A1** — The score follows the configured weights: test 9 (Ana 88.3 → 87.3 with `PUNCTUALITY: 3`; 86.6 with `VOLUME: 0`; 83.3 with override 20).
- The advance-notice rule uses the stop's published ETA, with fallback to the window start (test 7 and Ana's contra-proof).
- The volume reference is the median of active inspectors, with floor 1 (test 8a).
- Each of the 8 metrics has a single definition, tested by the worked examples.
- `computeMetric` accepts any civil period (test 11), in one pass for all inspectors (test 12, query count).
- `INSPECTOR_NO_SHOW` penalises metrics 1 and 6; a `CANT_ATTEND` with ≥ 24 h notice leaves metric 1 (tests 1b, 4, 8, 9, 12; L-F07-01).
- Only `NOT_EXECUTED` penalises metric 8; any other code removes the DONE from the universe (tests 8, 12; L-F07-04).
- `SATISFACTION` below `minimumRatings` is `null` (tests 2, 8, 9; L-F07-03).
- `VOLUME` is proportional to `activeDays`; the override is scaled by the period (tests 8a, 8b, 11; L-F07-05, L-F07-09).
- A late `NOT_EXECUTED` rejection counts in metric 8 of the rejection's period, without duplication (tests 8, 12; L-F07-07).
- Each metric carries up to 20 `failures` with a `detail` free of any location data (test 8c; L-F07-06).

### Measurable Outcomes

- **SC-001**: Computing the six worked-example inspectors over `[2026-11-01, 2026-11-30]` with equal weights yields exactly Eva 100, Fábio 97.5, Dan 89.0, Ana 88.3, Ben 79.0, and Carla `INSUFFICIENT_VOLUME` (null).
- **SC-002**: Changing a single weight changes the score deterministically (Ana 88.3 → 87.3 with `PUNCTUALITY: 3`; → 86.6 with `VOLUME: 0`), proving 03.A1 at unit level.
- **SC-003**: The facts reader executes the same query count for 1 inspector and for 50 inspectors × 20 services (measured by a `$queryRaw` wrapper in the DB integration test).
- **SC-004**: No reliability fact, metric result, failure detail, or log line contains inspector latitude/longitude or any coordinate.
- **SC-005**: `computeMetric`/`computeAll` return correct results for periods of 1, 7, 14, 30, and 92 days (F08 reuse), and throw `RangeError` for `from > to` or invalid dates.
- **SC-006**: A `DONE → REJECTED` with `NOT_EXECUTED` penalises metric 8 for the inspector of that DONE; the same transition with any other code removes the DONE from every inspector's universe.

## Assumptions

The following product decisions are **settled** in `F07-tarefas.md` (plan 2026-10-27, dev 2026-10-28 P1–P11, gaps 2026-10-29 L-F07-01…09, reconciliation 2026-10-29 R1–R7) and are adopted here as premises; no open clarification remains for this slice:

- **D9 multi-tenant exception** (adopted): reliability facts/metrics/snapshot carry no `tenant_id`; isolation is by RBAC at the F07-2 API and by `inspectorId` scoping here.
- **P1/P2 attribution & service date** (adopted): a service is a DONE occurrence or a `CANT_ATTEND`; attribution and service date follow the universe table.
- **P7/D8 normalisation** (adopted): service weight = duration + `1 ×` planned travel; travel factor fixed at 1 (not configurable).
- **P9 rounding** (adopted): 4-decimal rates, 1-decimal half-up score from unrounded rates.
- **P11 median volume reference** (adopted): median of active inspectors' completedCount, floor 1; fixed `60` removed; optional `volumeReferenceOverride`.
- **R1/R6/R7 F03 contract reuse** (adopted): `resolveEffectiveEventTime` with the −7 days / +5 min plausibility window; `geofence_radius_m` null ⇔ pre-F03 only; `estimatedArrivalAt` not read; advance-notice rule unchanged.
- **R3 per-field timezone** (adopted): civil dates/windows in the agency timezone; the snapshot/job (F07-2) in `PLATFORM_TIMEZONE`.
- **Dependencies merged before this slice**: TASK-X00-1, TASK-F03-1 (settings, execution flags, `resolveEffectiveEventTime`), TASK-F03-2 (`inspector_field_events`, `abandoned_at`), TASK-F04-1 (`default_duration_minutes`), TASK-F04-2 (`day_plans`/`day_plan_stops` with `published_eta`, `published_service_start_at`).

### Security tradeoff (known limitation)

An automated security review flagged that the engine trusts client-reported inputs for scoring: device timestamps (`resolveEffectiveEventTime`, −7 days / +5 min) can earn advance-notice / early-`CANT_ATTEND` credit and rescue a `LATE` start to `PUNCTUAL`, and a self-reported GPS accuracy above the radius makes a far check-in geofence-`EXCLUDED`. An inspector who manipulates their device clock or reports inflated accuracy could therefore reduce their own index. This is a deliberate, spec-mandated reuse of the F03 **D25** "never penalise without evidence" rule (P4, R1, R6) and the **P6** geofence rule, chosen for the check-in flow's goal of not falsely penalising an honest late-sync; it is kept here for contract consistency with F03. The accountability-context hardening (server `created_at` for the advance/early-notice *decisions*, a server-side GPS-accuracy cap) is a cross-cutting change that also touches F03's D25 and F08's reward threat model, so it is recorded as a follow-up for the plan (`estacionamento`) rather than taken unilaterally in this slice. Mitigations already in place: a `CANT_ATTEND` warned "early" still counts as a fault in metric 6; the client time is bounded to a 7-day window; and every penalty decision has a bounded, auditable input.

### Out of scope

- The daily snapshot table, job, recompute-on-save, retention, and AM/OP API (TASK-F07-2).
- The "Inspector performance" screen, drawer, and the dialog options for the new codes (TASK-F07-3).
- Changing `prisma-inspector-rating.reader.ts`, `getPerformanceRows`, or the PERFORMANCE report; fraud detection; "property difficulty"; making the travel factor configurable.
