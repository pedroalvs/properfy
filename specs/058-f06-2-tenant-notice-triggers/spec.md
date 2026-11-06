# Feature Specification: Tenant Arrival Notice Triggers (Morning, On-The-Way, Delay)

**Feature Branch**: `058-f06-2-tenant-notice-triggers`
**Created**: 2026-11-06
**Status**: Draft
**Input**: User description: "F06-2 backend triggers for tenant arrival-time notices" (source: `fase2-etapa1/tarefas/F06-tarefas.md` §TASK-F06-2; contract codes 01.12-B/01.10/01.12, acceptance 01.A7 and the rental-tenant part of 01.A5)

## Context & Scope Boundary

This is the **trigger** task of feature F06 ("arrival-time notices to rental tenants"). TASK-F06-1 (merged, spec `057`) created, but sent nothing: the shared predictor `projectStopEta`, the `TENANT_ETA_*` templates, the `tenantEtaNotices` platform setting, the per-agency `tenantEtaNoticesEnabled` flag, the manual opt-out endpoint, `CreateNotificationOutput.created`, and the domain helpers (`computeEtaBand`, `formatEtaBand`, `getTenantEtaNotificationId`, `ITenantEtaPlanReader`). **This task makes the notices actually fire**: three trigger families all funnel into one idempotent notifier.

Nothing is still sent until an AM/OP flips `tenantEtaNotices.enabled` (born `false`); shipping this task does not, by itself, change tenant inboxes.

**Multi-tenant exception (recorded per CLAUDE.md §7.1).** `DayPlan`/`DayPlanStop` (read via the F06-1 plan reader) and the `tenantEtaNotices` `PlatformSetting` have **no `tenant_id`** because the inspector is cross-tenant (F04 D10; precedent: `Inspector`, global `ServiceRegion`, `IntegrationSetting`). The triggers read a whole inspector plan (stops of several agencies) only to compute times (D9); **no HTTP route is added by this task**, so nothing exposes that cross-tenant result. Every notification row is created with the **appointment's own `tenant_id`**; a notice for agency A's tenant never carries agency B's data. The new daily-volume counter (`ITenantEtaNoticeLog.countSmsCreatedSince`) is a cross-tenant platform metric (same D9 exception) and is **not** exposed by any route. Scope is guaranteed by RBAC (the jobs run as the system; no route) and by the per-appointment `tenant_id` on every created row.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Idempotent notifier with all pre-send guards (Priority: P1)

As the platform, I need one `TenantEtaNotifier` service that every trigger calls to create a `TENANT_ETA_*` notification, applying every suppression rule in a fixed order and deduplicating atomically, so that the morning job, the on-the-way subscribers and the delay sweep can race on the same stop/day and still produce at most one notice per channel.

**Why this priority**: It is the shared core — all three trigger families depend on it, and the "exactly once under concurrency" guarantee (01.A7) lives here via the deterministic id + `saveIfAbsent`.

**Independent Test**: `tenant-eta-notifier.service.test.ts` exercises each guard in isolation with in-memory repositories and a real `CreateNotificationUseCase` over an in-memory store (atomic `saveIfAbsent`): a MORNING notice to B creates one EMAIL + one SMS row with the F06-1 deterministic id; a second identical call creates nothing more and reports `{ created: 0, duplicates: 2 }`.

**Acceptance Scenarios**:

1. **Given** `kind 'MORNING'`, stop B (email + phone), `channelMode 'BOTH'`, **When** `notify` runs, **Then** two `createNotification` calls fire (EMAIL `ben@…`, SMS `+61412000002`), `templateCode 'TENANT_ETA_MORNING'`, `notificationId = getTenantEtaNotificationId({ kind, appointmentId, scheduledDate:'2026-11-05', channel })`, `payloadJson.etaFrom '9:00 am'`, `etaTo '9:30 am'` (test 1).
2. **Given** the same call twice, **When** the second runs, **Then** both channels return `created: false`, the notifier returns `{ created: 0, duplicates: 2 }`, logs `notice_skipped { reason: 'ALREADY_SENT' }` per channel, and neither logs `notice_created` nor increments the metric; the first returns `{ created: 2, duplicates: 0 }` and calls `metrics.incrementTenantEtaNoticeCount('MORNING','EMAIL')` and `('MORNING','SMS')` (test 8).
3. **Given** the guard order `enabled → before-morning-hour → agency ETA flag → agency rental-tenant switch → flow type → tenant confirmation → on-the-way lead → recipients → SMS budget`, **When** any guard trips, **Then** nothing is created and the matching `reason` is logged: `DISABLED`, `BEFORE_MORNING_HOUR` (06:59), `AGENCY_ETA_OFF` (`tenantEtaNoticesEnabled:false`), `AGENCY_SWITCH_OFF`, `FLOW_TYPE_NO_OCCUPANT`, `TENANT_UNAVAILABLE`/`TENANT_UNCONFIRMED`, `NEXT_TOO_FAR`, `NO_RECIPIENT`, `SMS_BUDGET_RESERVED` (tests 2–7, 5b, 5c).
4. **Given** the agency is at ≥ 80% of its daily SMS cap (UTC bucket), **When** a notice with an SMS leg is created, **Then** the SMS leg is dropped (`reason 'SMS_BUDGET_RESERVED'`, log `sms_budget_reserved { tenantId, count, cap, limit }`), the EMAIL leg still goes, and in `SMS_ELSE_EMAIL` the notice falls back to email; the budget counter is read only when an SMS leg exists (tests 10b–10e).
5. **Given** `kind 'ON_THE_WAY'` with `projectedArrivalAt − now > 60 min`, **When** `notify` runs, **Then** nothing is created (`NEXT_TOO_FAR`); at exactly 3600 s it sends (inclusive), at 3601 s it does not (tests 33b–33d); the 60-min lead never applies to `kind 'DELAY'` (test 33d).
6. **Given** any created row, **When** persisted, **Then** `payloadJson` carries `etaBandFromAt`, `serviceStartAt`, `planVersion` and `approximate` from the fresh read (none is a template variable, none is in `ALLOWED_VARIABLES`, all survive the post-send scrub) (tests 8c, 8d).

---

### User Story 2 - Morning arrival estimate job (Priority: P1)

As a rental tenant with an inspection today, I want a single morning message telling me the expected arrival window, sent at my agency's 07:00 and never after 09:00, so I can plan my day; if my stop is already projected late, I get the "running late" message instead of a misleading estimate.

**Why this priority**: It is contract 01.12-B and the most visible, standalone slice — a viable MVP on its own.

**Independent Test**: `send-morning-eta-notices.use-case.test.ts` + a DB end-to-end test run the morning use case for the Sydney group at 07:00 and assert MORNING for A/B/C with exact bands; running it at 09:00 (late claim after an outage) creates nothing.

**Acceptance Scenarios**:

1. **Given** the Sydney group at 07:00 and the A/B/C plan, **When** the morning use case runs, **Then** MORNING goes to A (8:00–8:30 am), B (9:00–9:30 am), C (10:00–10:55 am) — 5 rows (A 2, B 2, C 1 SMS) — and logs `morning_completed { stops: 3, created: 5, skipped: 0 }` (test 11).
2. **Given** `now` at or after the 09:00 cutoff, **When** the runner starts, **Then** it logs `morning_skipped_after_cutoff` and returns without sending; a cutoff crossed mid-batch sends stops evaluated before it and skips the rest with `reason 'AFTER_CUTOFF'` (tests 12, 13).
3. **Given** a stop already started (check-in 06:55), a window already past, or no plan / a STALE plan, **When** evaluated, **Then** that stop is skipped with `STARTED` / `WINDOW_PASSED` / `NO_PLAN` / `PLAN_STALE` (tests 14–16); an appointment that left the plan between the two reads does not skip the whole inspector — the next plan appointment is used as the seed (test 16b).
4. **Given** a stop already projected late in the morning (manual order pushing C past its window), **When** evaluated, **Then** it receives **DELAY** (not MORNING) with `trigger 'MORNING'`; if DELAY was already sent today it gets neither (tests 18, 19).
5. **Given** a tenant marked `UNAVAILABLE`, **When** the morning job runs, **Then** that stop gets no notice but stays in the projection so the others keep their bands (test 20b); two agencies on one plan in different tz groups each notify only their own stops (test 21).

---

### User Story 3 - "On the way" on check-out and "can't do" (Priority: P2)

As the next tenant on an inspector's route, I want an "on the way" message when the inspector checks out of the previous job (or cannot do it), but only when the inspector is actually within ~60 minutes of me, so the message is truthful without GPS tracking; and if my slot was pushed much earlier than the morning estimate, I get a single correction.

**Why this priority**: Contract 01.10, including the "can't do" variant (D16) and the early-change correction (L-F06-05). It builds on the US1 notifier.

**Independent Test**: `enqueue-tenant-eta-on-done.subscriber.test.ts` + `enqueue-tenant-eta-on-cant-do.subscriber.test.ts` + `evaluate-tenant-eta.use-case.test.ts` cover the subscribers enqueuing the durable `tenant-eta.evaluate` job and the use case producing ON_THE_WAY (or DELAY) for the correct next stop.

**Acceptance Scenarios**:

1. **Given** a `STATUS_TRANSITION → DONE` with `metadata.source 'INSPECTOR_FINISH'`, **When** the subscriber fires, **Then** it enqueues `tenant-eta.evaluate { trigger:'FINISH', appointmentId, tenantId, occurredAt: event.occurredAt, attempt:1 }` with a singleton key bound to `occurredAt`; a DONE **without** `source` (OP manual) enqueues nothing and logs `enqueue_skipped { reason:'MANUAL_DONE' }` (tests 28, 28a, 28c).
2. **Given** A finishes at 08:55 (job 08:55:20), **When** evaluated, **Then** B gets ON_THE_WAY "between 9:00 am and 9:40 am" and C (not late) gets nothing (test 30); the next stop is the first still-in-plan stop after the finished one, skipping cancelled/rejected (test 32); if there is none → `NO_NEXT_STOP`, if it already started → `NEXT_STARTED` (tests 31, 33).
3. **Given** a `STATUS_TRANSITION → REJECTED` with `metadata.source 'INSPECTOR_CANT_DO'`, **When** the subscriber fires, **Then** it enqueues `tenant-eta.evaluate { trigger:'CANT_DO', …, inspectorId: metadata.initiatedByInspectorId }`; the seed is the plan by `(inspectorId, scheduledDate)`, never the rejected appointment; if another stop is in progress → `INSPECTOR_BUSY`, else the first pending stop gets ON_THE_WAY (tests 28b, 43b–43h).
4. **Given** the next stop is projected late and no DELAY was sent today, **When** evaluated, **Then** it gets **DELAY** (one message, not two); if DELAY was already sent, it gets ON_THE_WAY (D5); after the next stop, pending stops are re-checked for DELAY and early-change (tests 36, 37, 39).
5. **Given** a pending stop that received MORNING today whose projection moved ≥ 30 min earlier than the morning band and is now within 60 min, **When** evaluated, **Then** it gets **one** ON_THE_WAY with `trigger 'EARLY_CHANGE'` reusing the same deterministic id (never two ON_THE_WAY for one stop/day) (tests 49c–49g, 50c).

---

### User Story 4 - Projected-delay notice (late-notice + sweep) (Priority: P2)

As a rental tenant whose inspection is running behind, I want a single "running late" message with the new window when the projection crosses my booked window plus the configured threshold, whether the delay is detected from an inspector late-notice, a check-out, or the periodic sweep, so I am told once and not spammed.

**Why this priority**: Contract 01.12 and acceptance 01.A7/01.A5; the sweep is the safety net that catches delays no event announced.

**Independent Test**: `enqueue-tenant-eta-on-late-notice.subscriber.test.ts`, `sweep-tenant-eta-delays.use-case.test.ts` and `tenant-eta-dedupe.test.ts` cover the late-notice subscriber, the 30-minute sweep producing DELAY exactly once, and three triggers racing on one late stop.

**Acceptance Scenarios**:

1. **Given** a `LATE_NOTICE` field event, **When** the subscriber fires, **Then** it enqueues `tenant-eta.evaluate { trigger:'LATE_NOTICE', appointmentId, tenantId, eventId }`; a 60-min late-notice on B (E4b) produces DELAY for C ("between 10:55 am and 11:55 am") and nothing for B; a 30-min one (E4a) produces nothing (tests 29, 40, 41).
2. **Given** the sweep at 10:30 (E3a), **When** it runs, **Then** no DELAY; at 11:00 (E3b) C gets DELAY ("between 11:00 am and 11:55 am"); at 11:30 nothing new (one per stop per day) (test 44).
3. **Given** `delayThresholdMinutes 30`, **When** E3b is evaluated, **Then** nothing; with 20, DELAY fires (01.A5, test 45).
4. **Given** FINISH, LATE_NOTICE and the sweep evaluating the same late C in parallel, **When** all run, **Then** exactly one `TENANT_ETA_DELAY` per channel exists for C that day; the sum of the three `created` counts is 1 per channel (01.A7, test 50); a DELAY row from yesterday 23:59 local does not block today's (day boundary is agency-local, test 51).
5. **Given** the sweep completes, **When** it logs `sweep_completed`, **Then** the log carries `{ plans, evaluated, delayed, earlyChanged, created, skippedStale, smsCreatedToday, durationMs }`; above `TENANT_ETA_DAILY_SMS_WARN_THRESHOLD` (500) it also warns `daily_volume_high` without blocking (tests 49, 49b).

---

### User Story 5 - Case-insensitive OPERATIONAL email consent matching (Priority: P3)

As a rental tenant who asked (by phone or email) to stop receiving these messages, I want my opt-out to suppress the notice regardless of the exact letter-casing of my email, so a recorded opt-out on `Ana@Example.com` reliably blocks a send addressed to `ana@example.com`.

**Why this priority**: A latent defect handed from F06-1: now that F06 actually sends, a case mismatch between a recorded email consent and the send recipient would silently fail to suppress. Minimal, safe, and in scope for the first task that exercises the path.

**Independent Test**: A consent-pipeline test records an EMAIL opt-out for a mixed-case address and asserts that `isBlockedByConsent` returns `true` for a differently-cased spelling of the same address; the test fails on `develop` before the fix.

**Acceptance Scenarios**:

1. **Given** an EMAIL opt-out recorded for `Ana@Example.com`, **When** the send pipeline checks consent for recipient `ana@example.com` (same tenant, channel, class), **Then** it is blocked (`SKIPPED_OPT_OUT`).
2. **Given** the chosen normalization, **When** phone recipients are checked, **Then** behaviour is unchanged (phones are already E.164-normalized; the fix touches only email casing).
3. **Given** the fix, **When** the existing consent suite runs, **Then** no previously passing case regresses, and the approach (read-side lowercasing vs. lower()+backfill) is documented in the backend CLAUDE.md.

---

### Edge Cases

- **No plan** (inspector assigned after 19:30, app not opened): morning sends nothing that day; the claim is spent (no second chance) — accepted, logged for homologation.
- **STALE plan**: morning skips; `evaluate` re-enqueues up to attempt 3 (30 s apart) then logs `evaluate_gave_up`; the sweep retries next round.
- **Next stop already started / cancelled / none**: `NEXT_STARTED` / skipped-and-advance / `NO_NEXT_STOP` (§2 step 3).
- **Can't-do while another stop is in progress**: `INSPECTOR_BUSY`; the on-the-way for the next stop comes on that stop's check-out (test 43d).
- **DONE marked by OP without check-out**: no on-the-way (`MANUAL_DONE`), even for a batch of end-of-morning DONEs or a reopened-and-redone appointment; a late offline-synced check-out passes through `FinishInspectionUseCase` and **does** fire (floor "now" keeps the band truthful) (test 3d, L-F06-04).
- **Tenant unavailable / unconfirmed with key**: no `TENANT_ETA_*` for that tenant; the stop stays in the projection; if the tenant confirms later, following triggers notify them (a missed MORNING is not re-sent) (test 3e).
- **Tenant of the can't-do stop**: receives no `TENANT_ETA_*` (stop left the plan); no portal link is carried (D12), so there is no interaction; a MORNING sent before the can't-do is not corrected by F06.
- **First stop of the day**: no "next-stop" on-the-way; gets MORNING, DELAY if late, and an EARLY_CHANGE correction if its projection moved ≥ 30 min earlier (test 4, L-F06-05).
- **Window already past**: no MORNING; DELAY still possible once.
- **Opt-out per channel**: only the refused channel is `SKIPPED_OPT_OUT`; it still counts toward "one per day".
- **Agency switch off / `tenantEtaNoticesEnabled:false` / non-notifying flow type**: nothing created, no agency mirror (D10); reminders and portal keep going when only the ETA flag is off.
- **Approximate plan**: sends normally, same copy, `approximate:true` in the log (D17).
- **DST**: claims keyed by civil local date in `cron_job_runs`; all time math in instants; Australia changes at 02:00/03:00, far from 07:00 (test 25).
- **Late-detection latency**: a delay that becomes true at 10:55 is seen by the 11:00 sweep (≤ 30 min).
- **Day boundary**: a projection falling after 23:59 agency-local → `NEXT_DAY`, nothing; a DELAY can be re-sent the next civil day because the dedupe id includes `scheduledDate`.
- **Two Fly machines**: pg-boss schedules are cluster-wide; the sweep is a singleton; deterministic ids + claims make any repeat harmless.

## Requirements *(mandatory)*

### Functional Requirements

**Notifier (application/tenant-eta-notifier.service.ts)**

- **FR-001**: The system MUST add `TenantEtaNotifier` that, given `{ kind, trigger, stop, band, appointmentWithRelations, tenant, settings, projectedArrivalAt, freshRead, now }`, applies these guards in order and stops at the first failure, logging `tenant_eta.notice_skipped { kind, trigger, appointmentId, reason, channel? }`: `enabled` false → `DISABLED`; `now < morningHour` agency-local → `BEFORE_MORNING_HOUR` (D13); `isTenantEtaNoticesEnabled(tenant.settingsJson)` false → `AGENCY_ETA_OFF` (checked before the rental-tenant switch, L-F06-06); `isRentalTenantNotificationsEnabled` false → `AGENCY_SWITCH_OFF` (D10); `suppressesOccupantNotifications(flowType)` → `FLOW_TYPE_NO_OCCUPANT`; tenant confirmation (below) → `TENANT_UNAVAILABLE`/`TENANT_UNCONFIRMED`; `kind 'ON_THE_WAY'` with `projectedArrivalAt − now > TENANT_ETA_ON_THE_WAY_MAX_LEAD_MINUTES×60` → `NEXT_TOO_FAR`.
- **FR-002**: Tenant-confirmation guard (L-F06-02): skip with `TENANT_UNAVAILABLE` when `stopMeta.rentalTenantConfirmationStatus === 'UNAVAILABLE'` (with or without key); skip with `TENANT_UNCONFIRMED` when the status is `PENDING`/`NO_RESPONSE` **and** `keyRequired` **and** `requiresRentalTenantConfirmation`; send otherwise (`CONFIRMED`; service type not requiring confirmation; `PENDING`/`NO_RESPONSE` without key). Applies to all three `kind`s.
- **FR-003**: Recipients MUST follow D1 + `channelMode`: EMAIL when the contact has `effectiveEmail`, SMS when it has `effectivePhone`, both in `BOTH`; in `SMS_ELSE_EMAIL`, SMS when a phone exists else EMAIL; neither → `NO_RECIPIENT`, nothing created.
- **FR-004**: SMS budget reserve (D15) MUST apply only when an SMS leg would be created: `cap = typeof tenant.settingsJson.notificationDailyCapSms === 'number' ? that : 100`; `limit = floor(cap × smsBudgetSharePercent / 100)`; `count = notificationRepo.countByTenantChannelSince(tenantId, 'SMS', startOfUtcDay(now))`; `count ≥ limit` → drop the SMS leg (`SMS_BUDGET_RESERVED`, log `sms_budget_reserved { tenantId, count, cap, limit }`), keep EMAIL, and in `SMS_ELSE_EMAIL` fall back to EMAIL. The reserve is best-effort (non-atomic); the pipeline's hard cap remains the real limit. The counter MUST NOT be read when there is no SMS leg (test 10e).
- **FR-005**: For each surviving channel the notifier MUST build the payload via `BuildNotificationPayloadService.build({ …, templateCode, rawPortalToken: null, eta: formatEtaBand(band, stop.windowTimezone) })`, then add to `payloadJson`: `etaBandFromAt = band.from.toISOString()` (L-F06-05), and `serviceStartAt`, `planVersion`, `approximate` from the fresh read (L-F04-15). None of these four is a template variable or in `ALLOWED_VARIABLES`, and all survive the post-send scrub (not in `SENSITIVE_PAYLOAD_KEYS`).
- **FR-006**: The notifier MUST call `createNotification.execute({ notificationId: getTenantEtaNotificationId({ kind, appointmentId, scheduledDate, channel }), tenantId, appointmentId, recipient, channel, templateCode, payloadJson })` per channel, read `created` from the output, and on `true` log `tenant_eta.notice_created { kind, trigger, appointmentId, tenantId, channel, bandFrom, bandTo, projectedStartAt, lateMinutes, approximate, planVersion }` (no phone/email) + `metrics.incrementTenantEtaNoticeCount(kind, channel)`; on `false` log `notice_skipped { reason: 'ALREADY_SENT', channel }` and neither meter nor log a create. It MUST return `{ created: number; duplicates: number; skippedReason?: string }`.
- **FR-007**: The notifier MUST expose `alreadyNotified(kind, stop)` = `notificationRepo.count({ tenantId, appointmentId, templateCode: codeFor(kind), fromDate: agencyLocalMidnight(now) }) > 0`; a `SKIPPED_OPT_OUT` or `FAILED` row from today counts; a row from before local midnight does not. Dedupe MUST be by **exact template code + appointment + channel** via the deterministic id — never by template family (D11).

**Morning job (01.12-B)**

- **FR-008**: The system MUST add `send-morning-eta-notices.use-case.ts` driven by `tenant-eta.morning` (`'0 * * * *'`, `PLATFORM_TIMEZONE`) through `TenantCronTick.runDue('tenant-eta.morning', morningHour, runner)`; the handler MUST read `tenantEtaNotices` and return early when `enabled` is false (no claim spent).
- **FR-009**: The morning runner MUST compute `cutoff = zonedWallTimeToUtc(todayCivil, HH(morningCutoffHour)+':00', timezone)`; if `now ≥ cutoff` at start → log `morning_skipped_after_cutoff` and return without throwing (claim spent, no second chance); the cutoff MUST also be re-checked before every notification create (long batch / pg-boss retry crossing 09:00 → remaining stops `AFTER_CUTOFF`).
- **FR-010**: Selection MUST use `findScheduledOnDate(todayCivil, group.tenantIds)` restricted to rows with an `inspectorId`, grouped by inspector; for each inspector run the common `evaluateForPlan({ inspectorId, planDate: todayCivil }, now)`; notify projection stops whose `tenantId ∈ group.tenantIds`. Per stop: `PENDING` else `STARTED`; `windowEndAt > now` else `WINDOW_PASSED`; `isProjectedLate` → DELAY path (nothing if `alreadyNotified('DELAY')`); else if `alreadyNotified('DELAY')` → nothing; else MORNING with `computeEtaBand(projectedStartAt, window, now)`.

**On-the-way + delay (01.10 / 01.12)**

- **FR-011**: The system MUST add three domain-event subscribers in `application/subscribers/` that only enqueue a durable job and never rethrow (log `tenant_eta.enqueue_failed` on failure): `enqueue-tenant-eta-on-done` (on `STATUS_TRANSITION`, `toStatus 'DONE'` **and** `metadata.source === 'INSPECTOR_FINISH'`; DONE without source → `enqueue_skipped { reason:'MANUAL_DONE' }`; `occurredAt = event.occurredAt` of the envelope); `enqueue-tenant-eta-on-cant-do` (`toStatus 'REJECTED'` **and** `metadata.source === 'INSPECTOR_CANT_DO'`; carries `inspectorId: metadata.initiatedByInspectorId`; missing → `enqueue_skipped { reason:'NO_INSPECTOR' }`; other rejection origins → nothing); `enqueue-tenant-eta-on-late-notice` (on `INSPECTOR_FIELD_EVENTS.RECORDED`, `type 'LATE_NOTICE'`; carries `eventId`). Singleton keys follow Contract §5.
- **FR-012**: `FinishInspectionUseCase` MUST pass `auditMetadata: { source: 'INSPECTOR_FINISH' }` to `executeInTransaction` so the emitted `STATUS_TRANSITION → DONE` carries `metadata.source === 'INSPECTOR_FINISH'`; the system MUST export `TRANSITION_SOURCE_INSPECTOR_FINISH = 'INSPECTOR_FINISH'` alongside F03's `'INSPECTOR_CANT_DO'`, and update the finish use-case tests' assertions (L-F06-04).
- **FR-013**: The system MUST add `evaluate-tenant-eta.use-case.ts` handling `tenant-eta.evaluate { trigger, appointmentId, tenantId, attempt, inspectorId?, occurredAt?, eventId? }`: guard `enabled`, `scheduledDate === agency-local today` (else `NOT_TODAY`), `now ≥ morningHour` (else `BEFORE_MORNING_HOUR`); `evaluateForPlan`; on STALE re-enqueue `attempt+1` with `startAfter = now + 30 s` up to attempt 3, then `evaluate_gave_up` (no throw).
- **FR-014**: For `FINISH`, the "next stop" MUST be the first still-in-plan stop after the finished one in projection order (executed-by-sequence then pending-by-sequence); `IN_PROGRESS`/`DONE` → `NEXT_STARTED`; none → `NO_NEXT_STOP`. For `CANT_DO`, if any stop is `IN_PROGRESS` → `INSPECTOR_BUSY`, else the next stop is the first pending stop; the seed MUST be `findPlanByInspectorDate(metadata.initiatedByInspectorId, scheduledDate)`, never the rejected appointment.
- **FR-015**: The next stop MUST get DELAY (not ON_THE_WAY) when `isProjectedLate` and no DELAY was sent today; ON_THE_WAY when already-DELAYed (D5) or on time; the ON_THE_WAY 60-min lead (FR-001) applies; the band is `computeEtaBand(projectedStartAt, window, now)`. After the next stop, the evaluator MUST run the shared delay check and early-change check on pending stops **after** the next one. `LATE_NOTICE` MUST instead run the delay check over **all** pending stops (a floor pushes the tail) and no next-stop ON_THE_WAY.
- **FR-016**: The system MUST add `application/services/evaluate-plan-delays.ts` (for each pending late stop without DELAY today → notifier `kind 'DELAY'`), `evaluate-early-changes.ts` (L-F06-05: pending stop with a MORNING band today where `projectedStartAt < etaBandFromAt − TENANT_ETA_EARLY_CHANGE_MINUTES×60` → notifier `kind 'ON_THE_WAY'`, `trigger 'EARLY_CHANGE'`, subject to the same 60-min lead and the same deterministic id), and `evaluate-for-plan.ts` (the common seed-that-is-in-plan flow, re-reading on a `planVersion` mismatch once).

**Sweep (01.12)**

- **FR-017**: The system MUST add `sweep-tenant-eta-delays.use-case.ts` driven by `tenant-eta.sweep-delays` (`'*/30 * * * *'`, Sydney, worker `teamSize:1, teamConcurrency:1`), returning early when `enabled` is false; it MUST iterate `planReader.listSweepCandidates(now)`, run `evaluateForPlan` per candidate (STALE → `skippedStale`, retried next round), then `evaluatePlanDelays` and `evaluateEarlyChanges` honouring each stop's agency-local `morningHour`; a projection after 23:59 agency-local → `NEXT_DAY`.

**Plumbing, observability, consent fix**

- **FR-018**: The system MUST add the port `ITenantEtaNoticeLog` + `infrastructure/prisma-tenant-eta-notice-log.ts`: `findMorningBands(appointmentIds, sinceByAppointment): Map<appointmentId, Date>` (reads `payload_json->>'etaBandFromAt'` from today's `TENANT_ETA_MORNING` rows, any channel, latest) and `countSmsCreatedSince(since): number` (`count(*)` of `notifications` with `template_code IN (3 codes) AND channel='SMS' AND created_at >= since`, cross-tenant by design, no route).
- **FR-019**: `MetricsCollector` MUST gain `incrementTenantEtaNoticeCount(kind, channel)` feeding `getSnapshot().tenantEtaNoticeCounts['{kind}|{channel}']` (reset in `reset()`); every created row increments it; the sweep MUST compute `smsCreatedToday = countSmsCreatedSince(midnight of PLATFORM_TIMEZONE)` for `sweep_completed` and `logger.warn('tenant_eta.daily_volume_high', { smsCreatedToday, threshold })` above `TENANT_ETA_DAILY_SMS_WARN_THRESHOLD`.
- **FR-020**: The system MUST wire `container.tenantEta.*` (notifier, three use cases, three subscribers `.register(domainEventBus)`, notice-log, plan reader) and register workers `tenant-eta.morning` (`'0 * * * *'`), `tenant-eta.evaluate` (on-demand `boss.work` with `withJobMetrics`), `tenant-eta.sweep-delays` (`'*/30 * * * *'`, singleton), adding all three to the final worker log and to both `registerWorkers` test call-sites + counts.
- **FR-021**: The system MUST make OPERATIONAL (and all) consent matching **case-insensitive for email**: an EMAIL opt-out recorded for any casing of an address MUST block a send to any other casing of the same address (same tenant/channel/class). The chosen approach MUST be the minimal safe one (read-side lowercasing on both sides of `isBlockedByConsent`'s `findByScope`, or lower()+backfill in the consent repository), proven by a test that fails without it, with no regression to phone matching, and documented in the backend CLAUDE.md.
- **FR-022**: This task MUST introduce **no migration** and **no new HTTP route**, so `api-types.ts` MUST NOT change (the opt-out route and `tenantEtaNoticesEnabled` shipped in F06-1); if an incidental schema regeneration shows drift, regenerate rather than hand-edit. It MUST NOT change `TenantCronTick`, the send pipeline (beyond the F06-1 cost log and this consent fix), or the daily SMS cap/bucket.
- **FR-023**: The root `CLAUDE.md` and `apps/backend/CLAUDE.md` MUST be updated in this PR (X00 rule §13.11): the three jobs, the "tick with `>=` + mandatory cutoff" pattern for time-stamped notices, "a subscriber only enqueues a durable job", the dedupe-by-deterministic-id + count-since-local-midnight rule (no `_SMS` family), the ON_THE_WAY ≤ 60-min lead, the `INSPECTOR_FINISH`-only check-out trigger, the tenant-confirmation and `tenantEtaNoticesEnabled` skips, the metric `tenantEtaNoticeCounts`, the `daily_volume_high` warn, and the consent email-casing fix.

### Key Entities

- **tenant-eta.evaluate job**: `{ trigger: 'FINISH'|'CANT_DO'|'LATE_NOTICE', appointmentId, tenantId, attempt, inspectorId?, occurredAt?, eventId? }` — durable, singleton-keyed, re-enqueued on STALE up to 3 attempts.
- **TenantEtaNotifier result**: `{ created: number; duplicates: number; skippedReason?: string }` — per-call tally used by every trigger.
- **Projected next stop**: derived from `projectStopEta` ordering (executed-by-sequence then pending-by-sequence), filtered to still-in-plan stops.
- **ITenantEtaNoticeLog**: cross-tenant read port — morning bands per appointment (for early-change) and the daily platform SMS count (for the volume warn); no `tenant_id`, no route (D9 exception).
- **tenantEtaNoticeCounts metric**: in-memory snapshot map keyed `'{kind}|{channel}'`, reset per process, for homologation measurement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (01.A7)**: When the projected delay exceeds the threshold, the next tenant is notified **exactly once** — proven by the projection (E3b/E4b, F06-1) plus tests 40 and 44 (DELAY to C) and 50–52 (dedupe under a three-trigger race and the agency-local day boundary).
- **SC-002 (01.A5, rental-tenant part)**: The configured `tenantEtaNotices.delayThresholdMinutes` governs firing — 30 → no send, 20 → send (test 45, E3b).
- **SC-003 (01.12-B)**: The morning notice carries the exact bands at 07:00 (test 11) and nothing goes out at or after 09:00 (tests 12, 13).
- **SC-004 (01.10)**: Check-out and can't-do produce one on-the-way for the correct next stop (tests 30–33, 36–38, 43b–43h).
- **SC-005 (L-F06-01)**: No on-the-way is sent when the projected arrival is more than 60 minutes away (tests 33b–33d, 49e).
- **SC-006 (L-F06-02)**: A tenant `UNAVAILABLE`, or `PENDING`/`NO_RESPONSE` with a required key and a confirmation-requiring service, receives no `TENANT_ETA_*` (tests 5c, 20b).
- **SC-007 (L-F06-04)**: A DONE marked manually by OP/AM produces no on-the-way; only an inspector check-out does (tests 28, 28a, 28c).
- **SC-008 (L-F06-05)**: A projection that moves ≥ 30 min earlier than the morning band produces exactly one correction, including for the first stop (tests 49c–49g, 50c).
- **SC-009 (L-F06-06)**: An agency with `tenantEtaNoticesEnabled:false` receives no arrival notices while its other tenant notices continue (tests 5b, 22).
- **SC-010 (L-F06-11)**: `tenantEtaNoticeCounts` appears in the metrics snapshot and `daily_volume_high` warns above 500 without blocking (tests 8, 49b).
- **SC-011 (D15, SMS reserve)**: SMS arrival notices stop at ≥ 80% of the agency's daily SMS cap while emails continue (tests 10b–10e, 46b).
- **SC-012 (Q21)**: Channels and per-channel consent behave per D1/D2 (tests 1–3, 22, including a `SKIPPED_OPT_OUT` from a manually recorded opt-out).
- **SC-013 (consent email casing)**: A recorded EMAIL opt-out for a mixed-case address suppresses a send to any other casing of the same address; the test fails on `develop` before the fix.
- **SC-014**: The task adds no migration and no route; backend full suite (unit + integration + integration-db) and shared build/test are green; the diff is well under 150 files (~30 estimated).

## Assumptions

- **Pending decision Q4** (contract-code renumbering `01.12-B` → `01.15`) is **documentation-only** and does not affect code; the spec assumes the plan's recommendation and does not block on it.
- **F06-1 (spec `057`) is merged** on `origin/develop` (`663c40ad`) and its exported contracts (§"Contratos exportados" of the task file) are authoritative: `projectStopEta`/`isProjectedLate`, `computeEtaBand`/`formatEtaBand`/`wallTimeHHmm`, `getTenantEtaNotificationId`, `ITenantEtaPlanReader` (`loadPlan`/`findPlanByInspectorDate`/`listSweepCandidates` + `stopMeta`), `TENANT_ETA_*` templates, `NotificationPayloadContext.eta`, `CreateNotificationOutput.created`, the `tenantEtaNotices` setting, `isTenantEtaNoticesEnabled`, and the shared `tenant-eta` constants.
- **F04-2 / F03-2 are merged**: `getFreshStopForAppointmentUseCase` (FRESH/STALE), `MarkDayPlansStaleSubscriber` (STALE on every plan-appointment `STATUS_TRANSITION`), the optional `auditMetadata` field on `ExecuteStatusTransitionInput`, `metadata.source 'INSPECTOR_CANT_DO'` + `initiatedByInspectorId` on the can't-do transition, and `INSPECTOR_FIELD_EVENTS.RECORDED` `LATE_NOTICE`. The exact live shapes are reconciled against `origin/develop` during implementation.
- The timezone split follows CLAUDE.md §9 / F06 D8: agency wall-clock for civil dates, windows, morning hours/cutoff, the one-per-day local-midnight boundary and all tenant-facing text; plan timezone for plan dates and the sweep's "today"; `PLATFORM_TIMEZONE` for pg-boss schedules and the daily-volume midnight; UTC for all instants and the SMS budget bucket (inherited from the pipeline; fixing the UTC bucket is out of scope, D15). Tests that depend on timezone pin `TZ` away from Sydney.
- The SMS budget reserve is **best-effort** (non-atomic): concurrent creates may let a few SMS past the 80% line; the pipeline's hard daily cap remains the real ceiling. The reserve and counter are per-tenant and do **not** cover F02's platform `INSPECTOR_NOTICE_SMS` (`tenant_id null`, its own cap; D15/L-F02-01).
- The HTML-escape-in-SMS fix is a separate task; F06 does not depend on it.
