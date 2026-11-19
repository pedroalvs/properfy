# Feature Specification: Tenant Arrival ETA Forecast & Templates (Foundation)

**Feature Branch**: `057-f06-1-eta-forecast-templates`
**Created**: 2026-11-06
**Status**: Draft
**Input**: User description: "F06-1 ETA forecast and tenant arrival templates" (source: `fase2-etapa1/tarefas/F06-tarefas.md` §TASK-F06-1; contract codes 01.10/01.12/01.12-B, acceptance 01.A7 and the rental-tenant part of 01.A5)

## Context & Scope Boundary

This is the **foundation** task of feature F06 ("arrival-time notices to rental tenants"). It creates everything the actual notices need, but **sends no notification**. The three triggers (morning estimate, "on the way", "running late") ship in TASK-F06-2, which consumes the contracts frozen here. The shared prediction module is also consumed by F05 (Live Day).

**Multi-tenant exception (recorded per CLAUDE.md §7.1).** `DayPlan`/`DayPlanStop` (read by the plan reader) and `PlatformSetting` (the `tenantEtaNotices` key) have **no `tenant_id`** because the inspector is cross-tenant (precedent: `Inspector`, global `ServiceRegion`, `IntegrationSetting`; F04 D10). The plan reader deliberately reads a whole inspector plan (stops of several agencies) only to compute times; **no HTTP route exposes that cross-tenant result**, and in TASK-F06-2 each notification row is created with the appointment's own `tenant_id`. The scoping guarantee is RBAC + the absence of any route returning plan data here. A plan-reader integration test proves stops of two agencies coexist in one plan (D9) and that reassigned/deleted appointments drop out.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Single ETA prediction module in `shared` (Priority: P1)

As the platform, I need one pure, deterministic function `projectStopEta(plan, events, now)` in `packages/shared/src/route-planning/` that projects each stop's arrival/start/end from the last real field event plus the saved plan legs, so that the inspector app, the tenant notices (F06-2) and the Live Day dashboard (F05) always agree on the same times.

**Why this priority**: It is the frozen contract that unblocks F05 and F06-2. Without it, each consumer would reimplement prediction and diverge — the exact bug the feature exists to prevent.

**Independent Test**: Run `project-stop-eta.test.ts` with the A/B/C fixture: given a published plan and a set of executions/late-notices at a given `now`, the module returns the projected stops; and for any `now` with no `LATE_NOTICE`, it returns the same pending starts that F04's today-recompute and the PWA's `evaluateSequence(...)` produce (coherence test E12).

**Acceptance Scenarios**:

1. **Given** the A/B/C plan and `now` = 07:00 local with no events, **When** `projectStopEta` runs, **Then** A starts 08:00, B 09:00, C 10:25, all `PENDING`, `lateS = 0` (E1).
2. **Given** the inspector is late to leave (`now` = 08:10, no check-in), **When** projected, **Then** departure = `max(07:40, 08:10) = 08:10`, A starts 08:30, B 09:30, C 10:55, all `lateS = 0` — exactly what the inspector app shows (E1b).
3. **Given** B in progress (check-in 09:12) and `now` = 11:00, **When** projected, **Then** C arrives 11:25, `lateS = 1500`, `isProjectedLate(C, 20) === true`, `isProjectedLate(C, 25) === false` (strict), `isProjectedLate(C, 30) === false` (E3b → 01.A7 / 01.A5).
4. **Given** a 60-minute `LATE_NOTICE` on B at 08:20 (A in progress), **When** projected, **Then** B floor = 10:00 (`floorApplied`), C arrives 11:25 and is late, B is not late (E4b).
5. **Given** stops shuffled by `sequence` on input, **When** projected twice, **Then** output is identical and ordered (determinism, E14); DST instants use epoch arithmetic only (E13).

---

### User Story 2 - Tenant arrival template catalogue + server-side variable validation (Priority: P1)

As the platform, I need three customizable rental-tenant template codes (`TENANT_ETA_MORNING`, `TENANT_ETA_ON_THE_WAY`, `TENANT_ETA_DELAY`), each with an EMAIL and an SMS row, new variables `etaFrom`/`etaTo`, registered in all six shared locations plus the backend seed and payload builder, so F06-2 can create consent-checked, GSM-7-safe notices that never go out without a time.

**Why this priority**: The notices cannot exist without their templates, and the "never a notice without a time" guarantee must hold for API-saved templates too.

**Independent Test**: Boot the backend and assert `syncPlatformTemplates` creates exactly six `TENANT_ETA_*` platform rows (`OPERATIONAL`); render each with `SAMPLE_DATA` through the layout/sanitizer; `measureSmsTemplate` → `GSM-7`, 1 part for each. Save a `TENANT_ETA_DELAY` template without `{{etaFrom}}`/`{{etaTo}}` via the upsert use case → 400 `Missing required variables: etaFrom, etaTo`.

**Acceptance Scenarios**:

1. **Given** the three codes, **When** inspected, **Then** each is in `MANDATORY_TEMPLATE_CODES`, not in `PLATFORM_ONLY_TEMPLATE_CODES`, target `RENTAL_TENANT`, default class `OPERATIONAL`, not protected, and `TEMPLATE_VARIABLES[code].required === ['etaFrom','etaTo']` (test A1).
2. **Given** none of the three codes ends in `_SMS` and none appears in `STATUS_TRANSITION_TEMPLATE_CODES`/`RENTAL_TENANT_NOTICE_CODES`, **When** `templateFamily()` resolves, **Then** there is no cross-family suppression (D11).
3. **Given** a payload context with `eta = { from:'8:00 am', to:'8:30 am' }` for `TENANT_ETA_MORNING`, **When** `build()` runs, **Then** the payload has `etaFrom`/`etaTo`; **without** `eta` the key is **absent** and `MissingRequiredVariableError('TENANT_ETA_MORNING','etaFrom')` is thrown (test 6).
4. **Given** an `UpsertNotificationTemplateUseCase` call for any code with `required` vars whose `subject + bodyHtml` omits one, **When** executed, **Then** `ValidationError` 400 `Missing required variables: …`, `field: 'bodyHtml'`, nothing saved (L-F06-09, test 7c).
5. **Given** the on-the-way EMAIL copy, **When** rendered, **Then** it does **not** contain "finished the previous visit" and does contain "is on the way" (L-F06-08).

---

### User Story 3 - Platform configuration key + "Tenant arrival notices" settings section (Priority: P2)

As AM/OP, I need a `tenantEtaNotices` platform setting (enable toggle, channel mode, morning hour, morning cutoff, running-late threshold, SMS budget reserve) exposed in a "Tenant arrival notices" section of Platform settings, so the behaviour of F06-2 is configurable without a deploy.

**Why this priority**: The config key governs the triggers; it is born here (defaults off) so F06-2 can read it. The web section is required by the F03 PlatformSetting contract.

**Independent Test**: `platform-settings.test.ts` asserts defaults `{ enabled:false, channelMode:'BOTH', morningHour:7, morningCutoffHour:9, delayThresholdMinutes:20, smsBudgetSharePercent:80 }`, `section === 'Tenant arrival notices'`, and the validation matrix (cutoff must be after morning hour, bounds). The web section renders defaults, saves a full object via `PUT /v1/platform-settings/tenantEtaNotices`, and blocks Save on invalid cutoff.

**Acceptance Scenarios**:

1. **Given** no stored value, **When** resolved, **Then** the defaults apply and `enabled` is `false` (nothing is ever sent until AM/OP turns it on, even after F06-2).
2. **Given** `morningCutoffHour: 7` with `morningHour: 7`, **When** validated, **Then** error "Cutoff must be after the morning notice hour"; bounds reject `morningHour 4/12`, `delayThresholdMinutes 4/121/20.5`, `channelMode 'EMAIL_ONLY'`, `smsBudgetSharePercent 9/101`.
3. **Given** the web section, **When** the cutoff ≤ the morning hour, **Then** inline error and Save disabled; a 422 from the server shows the server message in the section.

---

### User Story 4 - Per-agency arrival-notice flag (Priority: P2)

As AM, I need a `tenantEtaNoticesEnabled` flag on an agency (default on, `settings_json`, no migration) with a checkbox in the Tenant form, so an agency that announces arrival times itself can opt its tenants out of F06 notices without touching the general rental-tenant switch.

**Why this priority**: Required by L-F06-06; F06-2 reads the flag before any send.

**Independent Test**: `tenantSettingsSchema.parse({})` → `tenantEtaNoticesEnabled === true`; `isTenantEtaNoticesEnabled(null/{}) === true`, `({tenantEtaNoticesEnabled:false}) === false`. The drawer checkbox (AM only) saves `settingsJson.tenantEtaNoticesEnabled`; it is disabled when the rental-tenant switch is off.

**Acceptance Scenarios**:

1. **Given** AM editing an agency with no key, **When** the drawer opens, **Then** the checkbox is checked; unchecking and saving sends `settingsJson.tenantEtaNoticesEnabled: false`.
2. **Given** "Send notifications to tenants" is unchecked, **When** rendered, **Then** the new checkbox is `disabled` with help "Turned off because tenant notifications are off for this agency."
3. **Given** a non-AM actor, **When** the drawer opens, **Then** the checkbox is absent (same gate as the rental-tenant switch).

---

### User Story 5 - Manual AM/OP consent opt-out (Priority: P2)

As AM/OP, I need `POST /v1/notifications/consents/opt-out` and a "Record opt-out" web modal so that when a tenant asks to stop receiving these (OPERATIONAL, factual-service) messages, I can suppress a channel for that recipient without a per-template STOP footer.

**Why this priority**: Arrival notices are classified `OPERATIONAL` with no "reply STOP", so the only compliant stop mechanism is a manual operator opt-out (L-F06-03, option 1). Serves all OPERATIONAL tenant notices, not just F06.

**Independent Test**: `record-consent-opt-out.use-case.test.ts`: AM opts out `+61412000001`/SMS/OPERATIONAL on `ag-syd` → creates `NotificationConsent` `optedOut`, `changeSource 'operator_override'`, audit `consent.operator_opted_out`; idempotent on repeat; CL/INSP → 403; after the opt-out, `isBlockedByConsent` returns `true` for that (tenant, recipient, SMS, OPERATIONAL).

**Acceptance Scenarios**:

1. **Given** no prior consent row, **When** AM records an opt-out, **Then** a row is created already opted-out (`before null`) and `ConsentRecordOutput` is returned; repeating is idempotent (no new audit).
2. **Given** a recipient typed as `0412 000 001` or `Ana@Example.com`, **When** recorded, **Then** it is normalized to the same value the send pipeline uses in `findByScope` (`+61412000001`, lowercased email).
3. **Given** an empty or >1000-char reason, **When** submitted, **Then** `ValidationError`; `channel 'PUSH'` → 400 at the route; no auth → 401; RBAC matrix identical to `…/:consentId/override`.

---

### User Story 6 - SMS cost observability + `CreateNotificationOutput.created` + plan reader (Priority: P3)

As the platform, I need every dispatched SMS to log its parts/encoding and feed a per-template parts metric, `CreateNotificationUseCase` to report whether the row was created or already existed, and a plan reader that F06-2 can consume, so the triggers can dedupe atomically and SMS cost is measurable in homologation.

**Why this priority**: Enabling infrastructure for F06-2; no user-visible behaviour here, but the output-shape change ripples across ~24 test mocks and 15 callers.

**Independent Test**: `create-notification.use-case.test.ts`: no id or new id → `{ notificationId, created: true }` + job enqueued; existing id → `{ notificationId, created: false }`, **no** job. `send-notification.use-case.test.ts`: a dispatched SMS logs `notification.sms_dispatched` with measured parts/encoding/length/truncated and calls `metrics.addSmsParts(templateCode, parts)` once; email/provider-failure do not. Plan-reader DB integration test covers `loadPlan`/`findPlanByInspectorDate`/`listSweepCandidates` + `stopMeta`.

**Acceptance Scenarios**:

1. **Given** a `CreateNotificationUseCase` call with an already-existing deterministic id, **When** executed, **Then** `created: false` and no `notification.send` job is enqueued; all ~24 test mocks return the new shape and backend typecheck + tests stay green.
2. **Given** a 170-char GSM-7 SMS dispatched, **When** sent, **Then** `notification.sms_dispatched` logs `parts: 2`; an emoji body logs `encoding: 'UCS-2'`; `metrics.addSmsParts` is called once and `getSnapshot().smsPartsByTemplate[code]` reflects it (L-F06-11).
3. **Given** a real plan in Postgres, **When** `loadPlan(dayPlanId)` runs, **Then** stops come back in `sequence` with legs/windows/`publishedServiceStartAt`/execution flags, `stopMeta` carries `{rentalTenantConfirmationStatus, keyRequired, requiresRentalTenantConfirmation}`, abandoned executions report `startedAt/finishedAt = null`, reassigned/deleted appointments drop out, and two agencies coexist (D9).

---

### Edge Cases

- **Missing required variable**: a trigger that forgets `eta` throws `MissingRequiredVariableError`; no notice ever goes out without a time (test 6).
- **Agency template saved without `{{etaFrom}}`/`{{etaTo}}`**: refused by both the web editor and the server upsert (L-F06-09); pre-existing rows for these codes cannot exist (codes are new).
- **Long name in SMS**: `TENANT_ETA_DELAY` crosses 1→2 parts above a 40-char name; `prepareSmsBody` truncation only acts above 1530 (impossible with these texts).
- **Plan with no origin** (`origin_source 'NONE'`, `departure_at null`): first pending stop starts at `max(now, window)` (E5/E5b).
- **Stop with missing coordinates**: its arriving leg is 0; the next leg is already measured from the last coordinate point (E6).
- **Abandoned execution** (`abandoned_at`): treated as `PENDING` (E8).
- **DONE without execution** (OP-marked): anchor from `min(serviceEndAt ?? now, now)`, never in the future (E7).
- **Reassigned/deleted/cancelled/rejected stops**: excluded by the live join or dropped in step 1 (E10).
- **`LATE_NOTICE` from yesterday or another agency** in the same plan: filtered by the stop's agency local midnight (E4d, E9).
- **Approximate plan** (`approximate true`): projection works the same; downstream notices carry `approximate: true` for measurement, no different copy (D17).
- **Different timezones in one plan**: each stop formats in its own `windowTimezone` (band test, test 4).
- **Degenerate band** (`now` past window end with centre still inside): fallback `{ from: ceil5(now), to: from + H }` (§B step 4).
- **Opt-out for a recipient with no history**: creates the row already opted-out; repeat is idempotent; undo is the existing `…/:consentId/override`.
- **Agency `tenantEtaNoticesEnabled: false` with the rental-tenant switch on**: reminders/portal keep going; only `TENANT_ETA_*` stop (applied in F06-2). Absent key = on.
- **Invalid config value stored**: `PlatformSettingsService` returns defaults and logs; with `enabled:false` default, nothing is sent.

## Requirements *(mandatory)*

### Functional Requirements

**Prediction module (shared)**

- **FR-001**: The system MUST expose a pure, deterministic `projectStopEta(plan: EtaPlanInput, events: EtaRealEvents, now: Date): ProjectedStop[]` in `packages/shared/src/route-planning/project-stop-eta.ts`, with no `Date.now()` and no I/O, importing only `evaluateSequence`, `DEFAULT_ROUTE_WEIGHTS` and types from F04.
- **FR-002**: The departure rule MUST be `earliestDepartureS = max(anchorEnd ?? now, now)` — identical to F04's `toOptimizerInput` and today-recompute; no other floor. With no `LATE_NOTICE`, the pending starts MUST equal those F04's recompute and the PWA's `evaluateSequence` produce for the same `now` (coherence invariant, E12).
- **FR-003**: `projectStopEta` MUST classify stops (`DONE`/`IN_PROGRESS`/`PENDING`), order executed-then-pending by `sequence`, compute the anchor from the last executed event (DONE finished / OP-marked DONE / in-progress / origin), evaluate pending stops via `evaluateSequence` using the saved `travel_s` as leg overlays, apply the `LATE_NOTICE` floor (`max(reference, effectiveNoticeAt) + minutesLate`, `reference = publishedServiceStartAt ?? windowStartAt`) and re-evaluate the tail, and compute `lateS = max(0, start − windowEndS)`.
- **FR-004**: The system MUST expose `isProjectedLate(stop, thresholdMinutes)` = `state === 'PENDING' && projectedStartAt > windowEndAt + thresholdMinutes×60` (strict).
- **FR-005**: The system MUST expose `etaPlanInputFromDayPlanResponse(plan: DayPlanResponse): EtaPlanInput` for the PWA (HTTP response), leaving `publishedServiceStartAt = null`; backend consumers (F05) build `EtaPlanInput` from raw rows with `publishedServiceStartAt`.
- **FR-006**: The contract type names MUST be exactly `EtaPlanInput`, `EtaPlanStop`, `EtaRealEvents`, `ProjectedStop` (no `EtaPlanSnapshot`), exported from the `route-planning` barrel (L-F06-07).

**ETA band + notification id (backend domain)**

- **FR-007**: The system MUST expose `computeEtaBand(startAt, { windowStartAt, windowEndAt }, now)` with half-width `TENANT_ETA_BAND_HALF_WIDTH_MINUTES = 30`: centre = round-5(startAt); `from = max(c − H, windowStartAt, ceil5(now))`; `to = c ≤ windowEndAt ? min(c + H, windowEndAt) : c + H` (upper clip only while the centre is inside the window — a late prediction shows the real band, never the whole window again); degenerate fallback when `from > to`.
- **FR-008**: `formatEtaBand(band, tz)` MUST return `{ from, to }` as `'h:mm am'` wall-clock strings via `formatWallTime(wallTimeHHmm(instant, tz))`, always GSM-7, formatted in the **stop's agency timezone** (never the inspector's or the server's).
- **FR-009**: `getTenantEtaNotificationId({ kind, appointmentId, scheduledDate, channel })` MUST be a UUID v5 over a fixed private namespace, stable across calls, different for any changed field, and different from `getAgencyForwardNotificationId`.

**Templates & payload**

- **FR-010**: The three codes MUST be registered in all six shared locations (`MANDATORY_TEMPLATE_CODES`, `TEMPLATE_CODE_LABELS`, `TEMPLATE_TARGETS`, `DEFAULT_TEMPLATE_CLASSIFICATIONS`, `TEMPLATE_VARIABLES`, `ALLOWED_VARIABLES` + `SAMPLE_DATA`), each with EMAIL and SMS rows, target `RENTAL_TENANT`, class `OPERATIONAL`, never protected, never `_SMS`-suffixed, never in `STATUS_TRANSITION_TEMPLATE_CODES`/`RENTAL_TENANT_NOTICE_CODES`.
- **FR-011**: `required` MUST be `['etaFrom','etaTo']` for all three; `optional` the shared tenant list. `SAMPLE_DATA.etaFrom === '10:15 am'`, `etaTo === '11:15 am'`.
- **FR-012**: The backend seed (`PLATFORM_TEMPLATES`) MUST add six entries rendered through `tenantEmailHtml`/layout, class derived as `OPERATIONAL`; each SMS body MUST measure `GSM-7`, 1 part with `SAMPLE_DATA`; no body may contain `–` or `’` (would force UCS-2); the on-the-way EMAIL must not claim the previous visit finished (L-F06-08); no body uses `{{timeSlot}}` or `{{confirmationLink}}` (D4, D12).
- **FR-013**: `BuildNotificationPayloadService` MUST accept `NotificationPayloadContext.eta?: { from; to }` and emit `etaFrom`/`etaTo` only when present (key **absent** otherwise, preserving the required-variable guard).
- **FR-014**: `UpsertNotificationTemplateUseCase` MUST reject any template whose code has `required` vars in `TEMPLATE_VARIABLES` when `subject + bodyHtml` omits one (`findTemplateVariableIssues`, only `missing` applied), returning `ValidationError` 400 `Missing required variables: …` with `field: 'bodyHtml'`; codes with no spec are unaffected (L-F06-09).

**Configuration & agency flag**

- **FR-015**: `PLATFORM_SETTINGS_REGISTRY.tenantEtaNotices` MUST exist with the schema/defaults/`section` of Contract §2 (defaults off), validating cutoff > morning hour and all bounds.
- **FR-016**: The shared constants `TENANT_ETA_BAND_HALF_WIDTH_MINUTES = 30`, `TENANT_ETA_ON_THE_WAY_MAX_LEAD_MINUTES = 60`, `TENANT_ETA_EARLY_CHANGE_MINUTES = 30`, `TENANT_ETA_DAILY_SMS_WARN_THRESHOLD = 500` MUST be exported from `packages/shared/src/constants/tenant-eta.ts`.
- **FR-017**: `tenantSettingsSchema` MUST add `tenantEtaNoticesEnabled: z.boolean().default(true)`; `isTenantEtaNoticesEnabled(settings)` MUST return `settings?.tenantEtaNoticesEnabled !== false` (fail-open, absent = on).
- **FR-018**: The web MUST add a "Tenant arrival notices" Platform-settings section (AM/OP) bound to `usePlatformSetting('tenantEtaNotices')`, header from the response `section`, and a `tenantEtaNoticesEnabled` checkbox in `TenantFormDrawer`'s Notifications section (AM gate), disabled when the rental-tenant switch is off.

**Opt-out**

- **FR-019**: The system MUST add `RecordConsentOptOutUseCase` (same deps as `OverrideConsentUseCase`): `assertRoles(['AM','OP'])`, `assertTenantScope`, validate `reason` (1–1000), normalize `recipient` as the pipeline does, then create-opted-in-or-`markOptedOut('operator_override', actor.userId, reason)` + upsert + audit `consent.operator_opted_out`; idempotent when already opted-out (no write/audit). It reuses the existing `operator_override` enum (no migration).
- **FR-020**: The system MUST add `POST /v1/notifications/consents/opt-out` with body `recordConsentOptOutSchema` (Contract §6), 200 `{ data: ConsentRecordOutput }`, RBAC identical to `…/:consentId/override`, and a web "Record opt-out" modal on `ConsentLookup` (AM/OP) that invalidates the lookup query on success.

**Observability & plumbing**

- **FR-021**: `CreateNotificationOutput` MUST become `{ notificationId: string; created: boolean }`: `created: true` on fresh save / `saveIfAbsent` true; `created: false` (and **no** job enqueued) when `saveIfAbsent` returns false. No existing caller changes behaviour; all ~24 test mocks/stubs MUST be updated to the new shape.
- **FR-022**: On a successful SMS dispatch, `SendNotificationUseCase` MUST log `notification.sms_dispatched { notificationId, tenantId, templateCode, parts, encoding, length, truncated }` (no recipient) measured on the **prepared** body and call `metrics.addSmsParts(templateCode, parts)` once; email and provider-failure paths MUST NOT. `MetricsCollector` gains `smsPartsByTemplate` in `getSnapshot()`, reset in `reset()`.
- **FR-023**: The system MUST add `ITenantEtaPlanReader` (`loadPlan`, `findPlanByInspectorDate`, `listSweepCandidates`) with a Prisma implementation building `EtaPlanInput` + `EtaRealEvents` + `stopMeta` from a live join (D9 cross-tenant), and `IInspectorFieldEventRepository.findLatestLateNoticeByAppointmentIds(ids, since)` (DISTINCT ON, `type='LATE_NOTICE'`); if F05 already added an equivalent method, reuse it.
- **FR-024**: This task MUST introduce **no migration** (templates via `syncPlatformTemplates`, config via the PlatformSetting registry, flag via `settings_json`, dedupe via the deterministic id + `created_at` count, opt-out via the existing enum value).
- **FR-025**: This task MUST send **no notification** and MUST NOT change `TenantCronTick`, the send pipeline beyond the cost log, or the daily SMS cap.
- **FR-026**: `api-types.ts` MUST be regenerated and committed (new opt-out route + `tenantEtaNoticesEnabled`), and the root/backend/shared/web CLAUDE.md files updated in this PR (X00 rule §13.11).

### Key Entities

- **EtaPlanInput / EtaPlanStop**: a plan snapshot for prediction — plan id/version/date/timezone, origin flag, departure instant, approximate flag, and per-stop sequence/tenant/scheduledDate/status/travelS/duration/window/missingCoordinates/service-start/service-end/publishedServiceStartAt. No `tenant_id` on the plan (cross-tenant, D9).
- **EtaRealEvents**: `executions` (per appointment started/finished; abandoned = both null) and `lateNotices` (latest-of-day minutesLate/createdAt/clientOccurredAt).
- **ProjectedStop**: per stop state, window copy, projectedArrival/Start/End, `lateS`, `floorApplied`.
- **tenantEtaNotices PlatformSetting**: cross-tenant config (no `tenant_id`) — enable/channelMode/morningHour/morningCutoffHour/delayThresholdMinutes/smsBudgetSharePercent.
- **NotificationConsent (opt-out use)**: existing entity; this task writes `operator_override` opt-outs through a new use case + route.
- **stopMeta**: per-appointment `{ rentalTenantConfirmationStatus, keyRequired, requiresRentalTenantConfirmation }` returned alongside the plan (outside `EtaPlanInput`, which is the frozen shared contract).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (01.A7, prediction part)**: With a 20-minute threshold, C's projection crosses window-end + threshold in E3b (sweep 11:00) and E4b (60-min LATE_NOTICE on B) and does not in E3a/E4a — proven by `project-stop-eta.test.ts`. (The "only once" guarantee is proven in F06-2.)
- **SC-002 (01.A5, rental-tenant base)**: `isProjectedLate` uses the received threshold; 25 minutes of delay fire with 20 but not with 25 or 30 (E3b). The threshold comes from `tenantEtaNotices.delayThresholdMinutes`, editable in Platform settings.
- **SC-003**: The three codes appear in the per-agency template list with their label and "Rental tenant" audience, two channels each, pass the web editor's required-variable check and the SMS preview (1 part with sample data).
- **SC-004 (L-F06-09)**: A `PUT` of a `TENANT_ETA_*` template without `{{etaFrom}}`/`{{etaTo}}` is refused by the server (not only the web editor).
- **SC-005 (L-F06-03)**: AM/OP records a phone opt-out from the web; the next OPERATIONAL SMS for that recipient is `SKIPPED_OPT_OUT` (proven by `isBlockedByConsent` in the use-case test and the route test).
- **SC-006 (L-F06-06)**: AM can disable arrival notices for one agency without touching the rental-tenant switch.
- **SC-007**: Boot in staging/prod creates exactly six `TENANT_ETA_*` platform rows (`OPERATIONAL`, `tenant_id NULL`); `tenantEtaNotices` is born `enabled:false`; nothing is sent until F06-2 ships and AM/OP enables it.
- **SC-008**: The coherence test (E12) passes: for any today `now` with no `LATE_NOTICE`, `projectStopEta` equals F04's recompute and the PWA's `evaluateSequence`, using the live F04 contract on `develop`.

## Assumptions

- **Pending decision Q4** (contract code renumbering `01.12-B` → `01.15`) is **documentation-only** and does not affect code; the spec assumes the plan's recommendation and does not block on it.
- The F04 contract on **live `origin/develop`** is authoritative. The task file's snapshot (`042a9674`) predates the merged F04 **Plan B** PRs that removed the persisted `routingInput`; the coherence test (E12) and the `evaluateSequence`/`toOptimizerInput` wiring MUST be reconciled against the current F04 shape on `develop` during implementation, reusing whatever leg-override/`toOptimizerInput` helpers F04 currently exports (the single-predictor rule is preserved regardless of F04's internal shape).
- F03-1 (`PlatformSetting`, `IPlatformSettingsReader`, Platform settings page), F03-2 (`inspector_field_events`, `IInspectorFieldEventRepository`, `abandoned_at`), F04-1 (`evaluateSequence`, `DEFAULT_ROUTE_WEIGHTS`) and F04-2 (`day_plans`/`day_plan_stops`, `published_service_start_at`, `getFreshStopForAppointmentUseCase`) are merged and reused.
- The timezone split follows CLAUDE.md §9 / F06 D8: agency wall-clock for civil dates, windows and all tenant-facing text; plan timezone for plan dates; `PLATFORM_TIMEZONE` for pg-boss schedules; UTC for instants. Tests that depend on timezone pin `TZ` away from Sydney.
- The HTML-escape-in-SMS fix is a separate task; F06 does not depend on it and keeps its fixed copy free of `'`/`&`.
