# Feature Specification: PWA field-event actions on the schedule card

**Feature Branch**: `047-f03-3-checkin-card-actions`
**Created**: 2026-11-02
**Status**: Draft
**Input**: TASK-F03-3 of `fase2-etapa1/tarefas/F03-tarefas.md` — PWA (inspector app) side of F03 "Field events". Contracts **00.7**, **00.8**, **03.1**, **03.2**; acceptance criteria **00.A3** (app) and **03.A2** (app). Consumes the already-merged backend/shared contracts of TASK-F03-1 (`PlatformSetting`, geofence, accuracy/clientOccurredAt on start/finish, `geofence` in the inspector detail) and TASK-F03-2 (`POST …/cant-do`, `POST …/late-notice`, `lastFieldIssue` in the inspector detail). No backend, no schema, no new API route.

## Context & prior decisions

All product decisions for F03 were closed on 2026-10-27 (D1–D13), 2026-10-28 (D14–D19) and 2026-10-29 (D20–D31); see `fase2-etapa1/decisoes.md` and the "Decisões aplicáveis" block of TASK-F03-3. The decisions binding this task are **D4, D5, D7, D8, D13** (2026-10-27), **D14, D15, D16, D18** (2026-10-28) and **D21, D23, D27, D28** (2026-10-29). They are encoded directly into Requirements and Assumptions below.

This is a pure frontend task. It introduces no new entity and no new `tenant_id` decision: the entities it reads (`InspectorFieldEvent`, which *has* `tenant_id`; `PlatformSetting` geofence, which is platform-scoped and has *no* `tenant_id`) are owned and scoped server-side by TASK-F03-1/2. The app only sends the inspector's JWT; the server enforces that the inspector sees and acts only on its own assignments.

The only historically open questions touching this task were **Q11** (check-in/out gesture count) and **Q10** (geofence mode), both already **DECIDED** (D5 = two taps; D4 = FLAG default, BLOCK opt-in). They are recorded as premises **A-D5** and **A-D4**. No further clarification is required to implement; any remaining `[NEEDS CLARIFICATION]` markers are surfaced in `/speckit.clarify`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Check in and check out from the card in two taps (Priority: P1)

An inspector opens the app on inspection day, sees today's jobs as cards, and completes a job with two taps: **Check in** on the card (grants location once) starts the inspection; later **Check out** on the same card finishes it (the appointment reaches DONE in the same server transaction). The inspector never has to open the execution page for the happy path.

**Why this priority**: This is the headline of criterion **00.A3** ("check-in and check-out from the card in 2 taps, plus the location permission") and the most-used daily action. Everything else layers on top of it.

**Independent Test**: On a today-dated SCHEDULED card with no in-progress local execution state, tap "Check in", grant location → success snackbar and the card now shows "Check out"; tap "Check out" (no app link, within the window) → the job becomes DONE. Fully testable with the backend local and no other story present.

> **Phase source (IMPLEMENTED REALITY).** The day-schedule payload (`InspectorAppointment`) carries **no** server `executionStatus` field; backend changes are out of scope. The card derives its execution phase from the **local** `ExecutionState` in IndexedDB via `useLocalExecutionState(appointment.id)` — the same way `AppointmentDetailPage` already does. "NOT_STARTED" below means "no local IN_PROGRESS/FINISHING/SUBMITTING/ERROR execution state"; "IN_PROGRESS" means such a local state exists. A cleared local state (e.g. after a permanent queued-START failure) returns the card to "Check in".

**Acceptance Scenarios**:

1. **Given** a SCHEDULED card dated today with no in-progress local execution state, **When** the inspector taps "Check in" and grants location, **Then** the app sends `start` with `{ latitude, longitude, accuracy, clientOccurredAt }`, persists `ExecutionState { phase: 'IN_PROGRESS', startLocation, startedAt }`, and shows "Checked in at {HH:mm}"; the card's primary action becomes "Check out".
2. **Given** a card dated in the future, **When** it renders, **Then** "Check in" is disabled with the sub-label "Available on inspection day" (same rule as `getGateState`, using `useEffectiveTimezone`, never the device timezone).
3. **Given** a card whose local execution phase is IN_PROGRESS, **When** the inspector taps "Check out" with no app link and within the window, **Then** the app sends `finish` and the job becomes DONE; with an app link it first shows `SyncConfirmModal`, and after the scheduled end it also shows `PastTimeConfirmModal`.
4. **Given** the inspector taps anywhere on the card outside the action buttons, **When** the tap lands, **Then** the app navigates to `/schedule/:id`; tapping "Check in"/"Check out"/"More actions" does **not** navigate.
5. **Given** a DONE, REJECTED or CANCELLED card, **When** it renders, **Then** no action bar and no "More actions" menu are shown.
6. **Given** location permission is denied, **When** the inspector taps "Check in", **Then** `start` is **not** called and a snackbar says "Location is required to check in. Turn on location access and try again."
7. **Given** the device is offline, **When** the inspector taps "Check in", **Then** the action is enqueued and a snackbar says "You're offline. Check-in saved and will sync automatically."

---

### User Story 2 - Report "Can't do this job" and release it (Priority: P1)

When an inspector cannot do a scheduled job, they open "Can't do this job" from the card menu (or from the in-progress panel after check-in), pick a reason, add a note, and send it to operations. The job is rejected server-side (SYS, `INSPECTOR_UNABLE`) and disappears from the route.

**Why this priority**: The second half of criterion **00.A3** ("'Can't do this job' sends the reason and removes the job from the route"). A scheduled job the inspector cannot do must have a one-tap exit that both notifies operations and cleans the device.

**Independent Test**: From a SCHEDULED card, open "Can't do this job", select `KEY_FAILED`, send → the sheet closes, a success snackbar appears, the schedule is invalidated and the card leaves the list; the appointment's offline queue items and local execution state for that job are purged.

**Acceptance Scenarios**:

1. **Given** the sheet is open, **When** it renders, **Then** it lists the 6 shared reason labels as radios in a group labelled "Reason", a "Note" textarea (required for `SITE_ISSUE`, otherwise optional) with a "{n}/500" counter and the hint "This note is shared with the agency." (D14), and the warning "Operations will be notified and this job will be removed from your route."
2. **Given** a reason and (where required) a note are set, **When** the inspector taps "Send to operations", **Then** exactly one `POST …/cant-do` is sent with `{ reason, note, latitude, longitude, accuracy, clientOccurredAt }` (position captured opportunistically for up to 5 s, never blocking; sent without position if unavailable) and a stable `Idempotency-Key` created when the sheet opened; a double tap produces **one** request (button `disabled` + `aria-busy`).
3. **Given** the send succeeds (or returns 409 `CANT_DO_ALREADY_REPORTED`), **When** it resolves, **Then** the sheet closes, the snackbar says "Sent to operations. This job has been removed from your route.", `['inspector','schedule']` and `['inspector','appointment', id]` are invalidated, all queued actions for the appointment are removed and `clearExecutionState(id)` is called; if the inspector was on the detail/execution screen, it navigates to `/schedule` with `replace` (releasing any `useBlocker` first).
4. **Given** the device is offline, **When** the sheet opens, **Then** "Send to operations" is disabled and an alert says "You need a connection to report this. Try again when you're back online." (D7 — the event never enters the offline queue).
5. **Given** a 404/409 (other than already-reported) or a 5xx/network error, **When** it resolves, **Then** the sheet stays open and shows the server message (4xx) or "Couldn't send. Check your connection and try again." (5xx/network), keeping the entered data.

---

### User Story 3 - Geofence feedback honours the server (FLAG vs BLOCK) (Priority: P1)

The app stops using a hard-coded 200 m warning threshold and instead uses the geofence radius the server returns in the inspector appointment detail. With FLAG, an out-of-radius check-in is accepted and the inspector sees an informational warning. With BLOCK (server-side), the app never pre-blocks; it surfaces the server's 422 message verbatim.

**Why this priority**: This is criterion **03.A2** (app): "with FLAG, an out-of-radius check-in is accepted and the inspector sees the warning; with BLOCK the app shows the clear server 422 message, online, on the card or from the queue." It ends the 200 m (PWA) × 500 m (backend) inconsistency.

**Independent Test**: With the detail's `geofence.radiusMeters = 150` and a captured position 180 m away, the capture UI warns "You are 180 m from the property (limit 150 m). Are you at the correct location?" but never disables Start/Check-in. With BLOCK configured and a position 900 m away, "Check in" surfaces the 422 message and the button returns to "Check in".

**Acceptance Scenarios**:

1. **Given** the detail provides no `geofence`, **When** the capture UI renders, **Then** it uses the shared default radius (`PLATFORM_SETTINGS_REGISTRY.fieldEvents.defaults.geofenceRadiusMeters` = 300), not 200.
2. **Given** `geofence.mode` is `BLOCK`, **When** the capture UI renders, **Then** its behaviour is unchanged (it only warns; it never disables anything) — the server decides.
3. **Given** a check-in returns `outOfRadius: true` (FLAG), **When** it resolves, **Then** a warning snackbar says "You're {d} m from the property. Operations will see this check-in." and the check-in still succeeds.
4. **Given** a check-in returns 422 `GEOFENCE_OUT_OF_RADIUS` (BLOCK), **When** it resolves, **Then** an error snackbar shows the server message, no local `ExecutionState` is written, and the button returns to "Check in".

---

### User Story 4 - A permanently-rejected queued check-in never traps the card (Priority: P1)

A check-in made offline can be rejected for good when it syncs (wrong address under BLOCK, job reassigned, T-1 passed). When that happens the app must not leave the card stuck on "Check out": it clears the local state, drops the chained check-out, and returns the card to "Check in".

**Why this priority**: Correctness/safety (D21, L-F03-02) and an explicit acceptance criterion ("a queued START rejected for good never leaves the app stuck on 'Check out'"). Without it an offline check-in rejected at sync strands the job in `IN_PROGRESS` forever across five readers.

**Independent Test**: Queue START+FINISH for appointment `a1` with local `ExecutionState { phase: 'IN_PROGRESS' }`; make the queued START receive 422 `GEOFENCE_OUT_OF_RADIUS` on sync → START is marked FAILED on the **first** response (no retries), the FINISH for `a1` is removed, local state is cleared, the queue snapshot refreshes, `['inspector','schedule']` is invalidated, and the card shows "Check in" again.

**Acceptance Scenarios**:

1. **Given** a queued START for `a1`, **When** sync returns a **permanent** failure (any 4xx except 401/408/429), **Then** the START becomes FAILED, every FINISH for `a1` is removed from the queue, `clearExecutionState('a1')` runs, `refreshQueueSnapshot()` runs, `['inspector','schedule']` is invalidated, and a `showError` relays the server message.
2. **Given** a queued START for `a1`, **When** sync returns 422 `GEOFENCE_OUT_OF_RADIUS`, **Then** it is treated as permanent on the **first** response (no 3-attempt retry, no "Retry" affordance for that item) and the error message ends with "Check in again when you're at the property."
3. **Given** a queued START, **When** sync returns a 503 or a network error, **Then** the item stays PENDING with `retryCount + 1`; local state and the chained FINISH are left intact.
4. **Given** a queued START, **When** sync returns 401, **Then** nothing is cleared (current logout behaviour).
5. **Given** a queued FINISH for a different appointment `a2`, **When** `a1`'s START fails permanently, **Then** `a2`'s FINISH is left intact.

---

### User Story 5 - Report "Running late" with a server-computed ETA (Priority: P2)

An inspector who will arrive late opens "Running late" from the card menu (today-dated and not yet checked in), picks a reason and a minutes-late chip, and notifies operations. The confirmation shows the server's estimated arrival time.

**Why this priority**: Part of contract 03.2 and a daily-operations nicety, but subordinate to check-in/out and the "can't do" exit. It is online-only (D7).

**Independent Test**: Open "Running late" on a today-dated NOT_STARTED card, pick `TRAFFIC` + 20 min, notify → `POST …/late-notice` returns `estimatedArrivalAt` and the snackbar says "Operations know you'll arrive around {HH:mm} (about 20 min late)."

**Acceptance Scenarios**:

1. **Given** the sheet is open, **When** it renders, **Then** it shows 4 reason radios and minutes chips (10, 20, 30, 45, 60, 90; required), no note field, and the question "How late will you arrive? (from {HH:mm})" where `{HH:mm}` is the stop's `publishedServiceStartAt` when a published plan exists (helper text "Count from your planned arrival time.") and otherwise `timeSlotStart` (helper text "Count from the start of the booked window.") (D23, L-F03-04).
2. **Given** a reason and minutes are set, **When** the inspector taps "Notify operations", **Then** `POST …/late-notice` is sent with `{ reason, minutesLate, …optional position }`; on 201 the snackbar uses the server's `estimatedArrivalAt`.
3. **Given** the inspector has already checked in (race), **When** the send returns 422, **Then** the sheet shows the server message "You've already checked in to this job."; the menu item itself is hidden once the local execution phase is IN_PROGRESS.
4. **Given** the device is offline, **When** the sheet opens, **Then** the submit is disabled with the same connection alert (D7).

---

### User Story 6 - The inspector sees their own past "Can't do" on re-accept (Priority: P3)

When operations re-offer a job the same inspector previously reported "Can't do", the inspector sees an informational alert on the detail so they know why it is back.

**Why this priority**: Transparency (D28, L-F03-09); informational only, no new history screen.

**Independent Test**: With the detail returning `lastFieldIssue { reason: 'KEY_FAILED', occurredAt }`, the detail shows an info alert "You reported 'Key didn't work' on {dd/MM/yyyy}. This job was offered again." (with the note below when present); absent/null `lastFieldIssue` → no alert.

**Acceptance Scenarios**:

1. **Given** `appointment.lastFieldIssue` is present, **When** the detail renders, **Then** an info `Alert` at the top shows "You reported '{FIELD_ISSUE_REASON_LABELS[reason]}' on {dd/MM/yyyy}. This job was offered again." plus the note if any.
2. **Given** `lastFieldIssue` is null/absent, **When** the detail renders, **Then** no such alert is shown.

### Edge Cases

- **Double tap on Check in / Check out**: the button is disabled during capture/submit; the `start-{id}`/`finish-{id}` key in `sessionStorage` guarantees server-side idempotency caching.
- **Appointment no longer SCHEDULED** (operations rejected it while the card was open): the server returns 404/409; the sheet shows the message and the schedule is invalidated.
- **Appointment of another inspector**: 404 → message; schedule invalidated.
- **Property without coordinates**: no distance warning; BLOCK never pre-blocks.
- **Poor accuracy**: the accuracy badge still shows (red > 50 m); BLOCK falls back to warn (server decides).
- **Detail out of cache and offline at check-out**: fall back to navigating to `/execution/:id` (current flow).
- **Future-dated card**: check-in disabled; "Running late" hidden; "Can't do this job" available (reason `CANT_ATTEND`).
- **Rejection after check-in**: the link in `InProgressPanel` opens the "Can't do" sheet; the cleanup clears the local `IN_PROGRESS` state and the `useBlocker` must be released before navigating.
- **START from the queue with 5xx/network**: keeps retrying; the card stays "Check out" (local state is cleared only on permanent failure).
- **Logout with a sheet open**: the sheet closes on unmount; nothing is enqueued.
- **Slot whose end is near midnight**: out of scope here (a server-side reminder-window limitation, D17).

## Requirements *(mandatory)*

### Functional Requirements

**Card actions (US1)**

- **FR-001**: The schedule card MUST present, for SCHEDULED appointments, a primary action "Check in" (when the local execution phase via `useLocalExecutionState(appointment.id)` is not in progress) or "Check out" (when it is IN_PROGRESS/FINISHING/SUBMITTING/ERROR), each ≥ 48 px tall, plus a "More actions" button (`aria-haspopup="menu"`). The card MUST NOT assume a server `executionStatus` field (the day payload has none).
- **FR-002**: The card MUST NOT nest a `<button>` inside another `<button>`. The current single-`<button>` card MUST be restructured into a non-button container (`<article aria-labelledby>`) with a dedicated navigation target plus the action bar. (`container.querySelectorAll('button button').length === 0`.)
- **FR-003**: Tapping the card body (outside the action controls) MUST navigate to `/schedule/:id`; tapping an action control MUST NOT navigate.
- **FR-004**: "Check in" MUST request location via `useGeolocation().requestLocation()`, show "Getting your location…" then "Checking in…" (disabled, `aria-busy="true"`), then call the start action with the captured location.
- **FR-005**: "Check out" MUST load the detail via `queryClient.fetchQuery(['inspector','appointment', id])` (reusing cache); if that fails with no network it MUST navigate to `/execution/:id`; otherwise it captures location and runs the check-out request, rendering `SyncConfirmModal` (when the detail has `inspectionAppLink`) then `PastTimeConfirmModal` (when past the scheduled end) from the card.
- **FR-006**: The "future day" rule MUST use `useEffectiveTimezone` (never the device timezone): a future-dated card disables "Check in" with "Available on inspection day".
- **FR-007**: DONE/REJECTED/CANCELLED cards MUST show no action bar and no menu (current `opacity-60` appearance preserved).

**Start/finish payload (US1, cross-cutting)**

- **FR-008**: `useStartInspection` and `useFinishInspection` MUST include `accuracy: location.accuracy` and `clientOccurredAt: location.capturedAt` in the request body, both online and when enqueuing to the offline queue.
- **FR-009**: Offline queue items already parked in the old `{ latitude, longitude }` shape MUST continue to sync unchanged (backward compatible, D8).

**Shared execution logic (US1)**

- **FR-010**: The execution logic MUST be extracted into a `useExecutionActions(appointmentId)` hook (check-in, check-out request with `SYNC`/`PAST_TIME` steps, submit, retry) that reads `inspectionAppLink`, `scheduledDate`, `timeSlotEnd` from the detail and persists via `useLocalExecutionState`. `ExecutionPage` MUST use this hook with no visible change. Both the card and `ExecutionPage` MUST write the **same** `ExecutionState` to IndexedDB.
- **FR-011**: A check-in returning 422 `GEOFENCE_OUT_OF_RADIUS` MUST NOT write local `ExecutionState`; it MUST surface the server message.

**Can't do this job (US2)**

- **FR-012**: A "Can't do this job" sheet MUST be reachable from the card menu, the detail (below the start button, SCHEDULED only) and `InProgressPanel` (link "Can't complete this job", rejection after check-in).
- **FR-013**: The sheet MUST list the 6 shared reason labels as radios in a "Reason" group; a "Note" textarea required for `SITE_ISSUE` (help "Add a short note for this reason" while empty) and otherwise optional; a "{n}/500" counter capping at 500; the hint "This note is shared with the agency."; and the warning "Operations will be notified and this job will be removed from your route."
- **FR-014**: Sending MUST `POST …/cant-do` (via `apiPost`, **not** the offline queue) with `{ reason, note, latitude, longitude, accuracy, clientOccurredAt }` — position captured opportunistically for ≤ 5 s, omitted if unavailable — and a stable `Idempotency-Key` created on sheet open and held in a `useRef`. A double tap MUST produce one request.
- **FR-015**: On success or 409 `CANT_DO_ALREADY_REPORTED`, the app MUST close the sheet, show "Sent to operations. This job has been removed from your route.", invalidate `['inspector','schedule']` and `['inspector','appointment', id]`, purge all queued actions for the appointment and call `clearExecutionState(id)` (helper `purgeAppointmentFromOfflineQueue(appointmentId)` + `refreshQueueSnapshot()`), and — if on the detail/execution screen — navigate to `/schedule` with `replace`, releasing any `useBlocker` first.
- **FR-016**: Offline, the sheet's submit MUST be disabled with "You need a connection to report this. Try again when you're back online." (D7).
- **FR-017**: A 404/409 (other than already-reported) MUST show the server message with a "Close" affordance; a 5xx/network error MUST show "Couldn't send. Check your connection and try again." keeping the entered data.

**Running late (US5)**

- **FR-018**: A "Running late" sheet MUST offer 4 reason radios and minutes chips (10, 20, 30, 45, 60, 90; required; accessible label "{n} minutes late"), no note field, and the question "How late will you arrive? (from {HH:mm})" with `{HH:mm}` = `publishedServiceStartAt` when a published stop exists (helper "Count from your planned arrival time.") else `timeSlotStart` (helper "Count from the start of the booked window.").
- **FR-019**: Sending MUST `POST …/late-notice` (via `apiPost`, not the queue; stable `Idempotency-Key`) with `{ reason, minutesLate, …optional position }`; on 201 the snackbar MUST say "Operations know you'll arrive around {HH:mm of estimatedArrivalAt} (about {n} min late)." using the server's `estimatedArrivalAt`.
- **FR-020**: The "Running late" menu item MUST be hidden when the date is not today, when it is in the past, or when the local execution phase is IN_PROGRESS; a 422 after check-in MUST show "You've already checked in to this job.".
- **FR-021**: Offline, the submit MUST be disabled with the same connection alert.

**Geofence feedback (US3)**

- **FR-022**: `GeoLocationCapture` MUST accept a `radiusMeters` prop (from the detail's `geofence`, defaulting to the shared registry default) and MUST remove the hard-coded `DISTANCE_WARNING_THRESHOLD = 200`. Out-of-radius MUST warn "You are {d} m from the property (limit {r} m). Are you at the correct location?" and MUST NOT disable Start/Check-in.
- **FR-023**: The capture UI MUST NOT change behaviour for `mode: 'BLOCK'` (it only warns; the server enforces BLOCK). "Start Inspection"/"Check in" MUST NEVER be disabled by distance; a 422 `GEOFENCE_OUT_OF_RADIUS` MUST be shown as a destructive alert while keeping the panel in PRE_START (execution page) or returning the card to "Check in".
- **FR-024**: A successful check-in with `outOfRadius: true` MUST show "You're {d} m from the property. Operations will see this check-in."

**Permanent queue failure (US4)**

- **FR-025**: `useOfflineQueue` MUST classify a START sync failure: any 4xx except 401/408/429 is **permanent**; 422 `GEOFENCE_OUT_OF_RADIUS` is permanent on the **first** response (no 3-attempt retry). A permanent START failure MUST set the item FAILED, remove every pending FINISH for the same `appointmentId`, call `clearExecutionState(appointmentId)`, `refreshQueueSnapshot()`, invalidate `['inspector','schedule']`, and `showError` with the server message (plus " Check in again when you're at the property." for geofence).
- **FR-026**: A FAILED geofence item MUST NOT expose a "Retry" affordance. A 5xx/network START failure MUST keep the item PENDING with `retryCount + 1` and leave local state and the chained FINISH intact. A 401 MUST clear nothing. A permanent FINISH failure keeps current behaviour.
- **FR-027**: `useExecutionActions`/`ExecutionPage` MUST keep writing `IN_PROGRESS` on tap (needed offline); only the queue is responsible for the permanent-failure cleanup.
- **FR-028**: No field event (`cant-do`, `late-notice`) and no new `QueuedAction` type MUST ever be created by the new hooks (D7). The IndexedDB `QueuedAction` schema MUST NOT change.

**Detail alert (US6)**

- **FR-029**: `AppointmentDetailPage` MUST show an info `Alert` at the top when `appointment.lastFieldIssue` is present: "You reported '{FIELD_ISSUE_REASON_LABELS[reason]}' on {dd/MM/yyyy}. This job was offered again." plus the note if present; nothing when it is null/absent.

**Types & accessibility (cross-cutting)**

- **FR-030**: The new API fields MUST be threaded through the PWA's existing typed layer, not re-derived ad hoc: extend the hand-written `InspectorAppointmentDetailResponse['data']` (`features/schedule/types/index.ts`) and the `InspectorAppointment` domain type with `geofence?: { radiusMeters; mode }`, `lastFieldIssue?: { reason; note; occurredAt } | null`, and (defensively, F04 not merged) optional `publishedServiceStartAt?`, and map them in `mapInspectorAppointmentDetail` (`features/schedule/lib/adapters.ts`). Field names/shapes MUST match the committed shared schemas (`geofence`, `inspectorLastFieldIssueSchema`) — no shape drift from the contract. Start/finish response fields are read from the existing execution hooks' typed responses.
- **FR-031**: Sheets MUST be `role="dialog"` `aria-modal="true"` with `aria-labelledby` on the title, initial focus on the first radio, `Esc`/gesture to close, focus returning to the opener; radios inside `fieldset`/`legend`; errors tied via `aria-describedby`; the counter announced from 450 via `aria-live="polite"`; touch targets ≥ 48 px; "More actions" labelled "More actions for {appointmentCode}"; action buttons' `aria-label` include the job code. All colours/classes MUST pass `check:ds`.

### Key Entities *(include if feature involves data)*

- **ExecutionState** (existing, IndexedDB): the per-appointment local execution record (`phase`, `startLocation`, `startedAt`, …). The card and `ExecutionPage` share the same instance per appointment. No schema change.
- **QueuedAction** (existing, IndexedDB): offline START/FINISH items, chained per appointment. `payload` is already free-form and now carries `accuracy` + `clientOccurredAt`. No schema change, no new `type`.
- **InspectorAppointmentDetail** (hand-written PWA type `InspectorAppointmentDetailResponse` + `InspectorAppointment`, populated by the `mapInspectorAppointmentDetail` adapter): gains `geofence? { radiusMeters, mode }` and `lastFieldIssue? { reason, note, occurredAt }` (and optional `publishedServiceStartAt?`) sourced from the TASK-F03-1/2 API response. The PWA deliberately does not import the generated `api-types` for this detail; it maps the raw response through its adapter layer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (00.A3)**: An inspector completes check-in and check-out of a today-dated job entirely from the card in two taps plus the one-time location grant, without opening the execution page.
- **SC-002 (00.A3)**: "Can't do this job" sends the reason and note to operations and removes the job from the inspector's route (card leaves the list; local queue + execution state purged) in a single confirmed send.
- **SC-003 (03.A2)**: With FLAG, an out-of-radius check-in succeeds and the inspector sees the distance warning; with BLOCK, the inspector sees the clear server 422 message — online (card) and on queue sync — and never a hard-coded 200 m threshold.
- **SC-004**: Device accuracy and client timestamp reach the server on every start/finish, online and via the queue (asserted in the hook tests).
- **SC-005**: No new event type enters the offline queue (asserted: `enqueueAction` is never called by the new field-event hooks).
- **SC-006 (D21)**: A queued START rejected for good never leaves the app stuck on "Check out": after a permanent sync failure the card shows "Check in" again (test US4 + manual Q8).
- **SC-007**: The full `apps/pwa` Vitest suite, `typecheck`, `lint`, `check:ds` and `build` pass; ≤ 150 changed files.

## Assumptions

- **A-D5 (Q11 DECIDED)**: Check-in = `start`, check-out = `finish` (DONE in the same transaction); two taps, no third field event.
- **A-D4 (Q10 DECIDED)**: Geofence default is FLAG; BLOCK is server-side opt-in and the app never pre-blocks — it only relays the 422.
- **A-D7**: `CANT_DO` and `LATE_NOTICE` require connectivity and never enter the offline queue; the offline tolerance of `start`/`finish` is kept.
- **A-D18**: The PWA Playwright E2E suite is broken repo-wide (`project_pwa_e2e_suite_broken_vacuous`); **no** new Playwright spec is written. The gate is `pnpm --filter pwa test` (Vitest) plus the manual QA checklist Q1–Q11. (X03 recovered the suite but this task adds no E2E; it only keeps the hermetic suite green.)
- **A-D23**: `publishedServiceStartAt` comes from the F04 published-plan cache when present; F04 is not merged at implementation time, so the "Running late" reference falls back to `timeSlotStart`. The app reads `publishedServiceStartAt` defensively (optional) so it lights up once F04 ships.
- **A-contracts**: TASK-F03-1 and TASK-F03-2 are merged on `develop` with `api-types` regenerated (confirmed: develop @ 75166fe6 includes PRs for both). This task consumes those contracts and adds no backend/schema/route change.
- **A-tz**: All "today"/date rules use `useEffectiveTimezone` (the inspector/platform timezone), never the device timezone; TZ-dependent tests pin `TZ` away from Sydney.
- **A-exec-local (IMPLEMENTED REALITY)**: The day-schedule payload has no server `executionStatus`; the card (like `AppointmentDetailPage`) derives the execution phase from the local IndexedDB `ExecutionState` via `useLocalExecutionState`. This is why clearing local state (permanent queued-START failure, D21) is what returns the card to "Check in" — there is no server status to re-read for this.
- **A-detail-adapter (IMPLEMENTED REALITY)**: The PWA surfaces API fields through hand-written response types (`features/schedule/types/index.ts`) and the `mapInspectorAppointmentDetail` adapter (`features/schedule/lib/adapters.ts`), not the generated `api-types`. New fields (`geofence`, `lastFieldIssue`) are added there, matching the committed shared schema shapes.
- **A-scope**: Out of scope — Today/Schedule/Offers/More navigation and "View and reorder" (F04); the announcements inbox and reminder push (F02); entry photo, key control, checklist (design v3, off-contract); any backend change.
