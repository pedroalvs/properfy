---
description: "Task list for TASK-F03-3 — PWA field-event actions on the schedule card"
---

# Tasks: PWA field-event actions on the schedule card

**Input**: Design documents from `/specs/047-f03-3-checkin-card-actions/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/consumed-contracts.md

**Tests**: REQUIRED — the spec mandates TDD ("Testes primeiro (TDD)"). Every implementation task is preceded by its failing test(s). Gate = Vitest + `check:ds` (Playwright E2E not run, A-D18).

**Workspace**: all paths under `apps/pwa/src/` unless noted. No backend/schema/api-types change.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: parallelizable (different files, no incomplete dependency).
- **[Story]**: US1–US6 from spec.md; Setup/Foundational/Polish carry no story label.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the consumed contract surface before touching UI.

- [ ] T001 Confirm `@properfy/shared` is built and the field-event enums/schemas resolve from `dist/` (run `pnpm --filter @properfy/shared build`); confirm the committed shared schema shapes for `geofence` and `inspectorLastFieldIssueSchema` (read-only check, no edit).
- [ ] T002 Extend the PWA detail typed layer: add `geofence?: { radiusMeters; mode }`, `lastFieldIssue?: { reason; note; occurredAt } | null`, and optional `publishedServiceStartAt?` to `InspectorAppointmentDetailResponse['data']` and `InspectorAppointment` in `apps/pwa/src/features/schedule/types/index.ts`, and map them in `mapInspectorAppointmentDetail` in `apps/pwa/src/features/schedule/lib/adapters.ts` (shapes mirror the committed shared schemas; defensive optional for `publishedServiceStartAt`). Extend the adapter test(s) in `apps/pwa/src/features/schedule/lib/__tests__/` to cover the new mapping (FR-030).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting plumbing that US1/US2/US4 depend on. MUST complete before those stories.

### Tests first
- [ ] T003 [P] Extend `apps/pwa/src/features/execution/hooks/__tests__/useStartInspection.test.ts`: online body = `{ latitude, longitude, accuracy, clientOccurredAt: location.capturedAt }`; offline `QueuedAction.payload` carries `accuracy` + `clientOccurredAt`; an old `{latitude,longitude}` payload still syncs unchanged (FR-008/009).
- [ ] T004 [P] Extend `apps/pwa/src/features/execution/hooks/__tests__/useFinishInspection.test.ts`: same assertions for finish (FR-008/009).
- [ ] T005 [P] Create `apps/pwa/src/features/execution/hooks/__tests__/useExecutionActions.test.ts`: `checkIn(location)` calls start, writes `ExecutionState{phase:'IN_PROGRESS',startLocation,startedAt}` and returns the server response (`outOfRadius`,`geofence`); `requestCheckOut` drives `SYNC`→`PAST_TIME` steps then finish→`DONE`; no link/no past → finish direct; finish error → `ERROR` state; 422 `GEOFENCE_OUT_OF_RADIUS` on check-in → NO local state, surfaces server message (FR-010/011).
- [ ] T006 [P] Add `purgeAppointmentFromOfflineQueue` test in `apps/pwa/src/features/execution/lib/__tests__/indexeddb.test.ts`: removes every `QueuedAction` for the appointment and calls `clearExecutionState(id)` (FR-015/028).

### Implementation
- [ ] T007 Extend `apps/pwa/src/features/execution/hooks/useStartInspection.ts` and `useFinishInspection.ts`: include `accuracy: location.accuracy` and `clientOccurredAt: location.capturedAt` in the body (online and when enqueuing); keep old payloads valid (FR-008/009). (Depends: T003, T004.)
- [ ] T008 Extract `apps/pwa/src/features/execution/hooks/useExecutionActions.ts` from `ExecutionPage` (check-in, check-out request with `SYNC`/`PAST_TIME` steps, submit, retry) reading `inspectionAppLink`/`scheduledDate`/`timeSlotEnd` from `useInspectorAppointment`, persisting via `useLocalExecutionState` (FR-010/011/027). (Depends: T005, T007.)
- [ ] T009 Add `purgeAppointmentFromOfflineQueue(appointmentId)` to `apps/pwa/src/features/execution/lib/indexeddb.ts` (remove all `QueuedAction` for the appointment + `clearExecutionState`) (FR-015). (Depends: T006.)
- [ ] T010 Refactor `apps/pwa/src/features/execution/pages/ExecutionPage.tsx` to consume `useExecutionActions` with no visible change; keep writing `IN_PROGRESS` on tap (FR-010/027). (Depends: T008.)

**Checkpoint**: start/finish carry accuracy+time; `useExecutionActions` is the single execution-state writer; queue purge helper exists. `pnpm --filter pwa typecheck && test` green on touched files.

---

## Phase 3: User Story 1 — Check in / Check out from the card (Priority: P1) 🎯 MVP

**Goal**: Two-tap check-in/out from the card (00.A3). **Independent test**: today-dated NOT_STARTED card → "Check in" → grant location → success + card shows "Check out" → "Check out" → DONE.

### Tests first
- [ ] T011 [P] [US1] Create `apps/pwa/src/features/schedule/components/__tests__/AppointmentCard.test.tsx` covering (phase mocked via `useLocalExecutionState`, not a server field): no-local-state SCHEDULED today → "Check in" (no "Check out"); future date → "Check in" disabled + "Available on inspection day"; local phase IN_PROGRESS → "Check out"; DONE/REJECTED/CANCELLED → no action bar/menu; card body tap → navigates `/schedule/:id`, action tap → no navigate; "Check in" → "Getting your location…"(`aria-busy`) → start → snackbar "Checked in at HH:mm"; `outOfRadius:true` → warning snackbar; 422 geofence → error snackbar + button back to "Check in"; local IN_PROGRESS cleared (state reset) → card shows "Check in"; geo denied → "Location is required…" + no start; offline → enqueue + offline snackbar; "Check out" with link → `SyncConfirmModal`, cancel → nothing sent; "Check out" detail-not-cached+offline → navigate `/execution/:id`; menu has "Running late"(conditional) + "Can't do this job"; **`container.querySelectorAll('button button').length === 0`** (FR-001..007, FR-024, FR-002).

### Implementation
- [ ] T012 [US1] Restructure `apps/pwa/src/features/schedule/components/AppointmentCard.tsx`: `<button>` → `<article aria-labelledby>` with a dedicated nav target (`<button>`/`<Link>`, keep `data-testid="appointment-card-{id}"`) + action bar; preserve `memo` (FR-002/003/007). (Depends: T011.)
- [ ] T013 [US1] Add the primary action to the card: "Check in" / "Check out" chosen from `status === SCHEDULED` + the local phase from `useLocalExecutionState(appointment.id)`, ≥48px, using `useExecutionActions` + `useGeolocation().requestLocation()`; render `SyncConfirmModal`/`PastTimeConfirmModal` from the card; check-out cache-fetch via `queryClient.fetchQuery(['inspector','appointment',id])` with `/execution/:id` fallback when offline (FR-001/004/005). (Depends: T012, T008.)
- [ ] T014 [US1] Add the future-day gate (reuse `getGateState`/`useEffectiveTimezone`): disable "Check in" + "Available on inspection day" (FR-006). (Depends: T013.)
- [ ] T015 [US1] Wire check-in snackbars: success "Checked in at {HH:mm}", `outOfRadius` warning "You're {d} m from the property. Operations will see this check-in.", geofence 422 error (server message) + reset to "Check in", denied-location message (FR-004/011/024). (Depends: T013.)
- [ ] T016 [US1] Add the "More actions" menu button (`aria-haspopup="menu"`, `aria-label="More actions for {code}"`) hosting the sheet entry points; menu placement respects status (FR-001, FR-012/020 hooks wired in US2/US5). (Depends: T012.)

**Checkpoint**: US1 is independently demoable; card tests green.

---

## Phase 4: User Story 2 — "Can't do this job" (Priority: P1)

**Goal**: Report & release a job (00.A3). **Independent test**: open sheet → `KEY_FAILED` → send → sheet closes, snackbar, card leaves list, queue+state purged.

### Tests first
- [ ] T017 [P] [US2] Create `apps/pwa/src/features/field-events/components/__tests__/CantDoSheet.test.tsx`: 6 shared reasons as radios in "Reason"; "Send" disabled without reason; `SITE_ISSUE`+empty note → disabled + "Add a short note for this reason"; "{n}/500" counter caps at 500; offline → disabled + connection alert; send → `POST …/cant-do` body `{reason,note,latitude,longitude,accuracy,clientOccurredAt}` + stable per-open `Idempotency-Key`; double tap → 1 POST; success & 409 `CANT_DO_ALREADY_REPORTED` → close+snackbar+invalidate `['inspector','schedule']`&`['inspector','appointment',id]`+purge queue+`clearExecutionState`+(on detail/exec) navigate `/schedule` replace; other 404/409 → alert+Close; 5xx/network → "Couldn't send…" keeping data (FR-013..017).
- [ ] T018 [P] [US2] Create `apps/pwa/src/features/field-events/hooks/__tests__/useReportCantDo.test.ts`: uses `apiPost` (NOT `enqueueAction`); opportunistic position ≤5s then sends without position; invalidations + purge on success/409 (FR-014/015/028).

### Implementation
- [ ] T019 [US2] Create `apps/pwa/src/features/field-events/hooks/useReportCantDo.ts` (`apiPost`, stable `Idempotency-Key` via `useRef` created on open; opportunistic geolocation ≤5s; success/409 → invalidate + `purgeAppointmentFromOfflineQueue`) (FR-014/015). (Depends: T018, T009.)
- [ ] T020 [US2] Create `apps/pwa/src/features/field-events/components/CantDoSheet.tsx` (`role="dialog"` a11y per FR-031; reasons radiogroup; note textarea with required/optional + counter + "This note is shared with the agency."; warning line; destructive "Send to operations"/"Cancel"; offline/sending/error states) (FR-013/016/017/031). (Depends: T017, T019.)
- [ ] T021 [US2] Wire "Can't do this job" entry points: card menu (`AppointmentCard`), `AppointmentDetailPage` (secondary button below start, SCHEDULED only), and `InProgressPanel` link "Can't complete this job" — release `useBlocker` before navigating after success (FR-012, edge: rejection-after-check-in). (Depends: T020, T016.)
- [ ] T022 [P] [US2] Extend `apps/pwa/src/features/execution/components/__tests__/InProgressPanel.test.tsx`: the "Can't complete this job" link opens `CantDoSheet` (FR-012). (Depends: T020.)

**Checkpoint**: US2 independently demoable; sheet+hook+entry tests green.

---

## Phase 5: User Story 3 — Server-driven geofence feedback (Priority: P1)

**Goal**: 03.A2. **Independent test**: `geofence.radiusMeters=150`, 180 m away → warn with limit 150; BLOCK never pre-blocks; 900 m BLOCK → server 422.

### Tests first
- [ ] T023 [P] [US3] Extend `apps/pwa/src/features/execution/components/__tests__/GeoLocationCapture.test.tsx`: no `radiusMeters` → uses 300 (shared default), not 200; `radiusMeters=150`, d=180 → "You are 180 m from the property (limit 150 m). Are you at the correct location?"; `mode:'BLOCK'` does not change behaviour (warn only, nothing disabled) (FR-022/023).
- [ ] T024 [P] [US3] Extend `apps/pwa/src/features/execution/components/__tests__/PreStartPanel.test.tsx` and `pages/__tests__/ExecutionPage.test.tsx`: Start never disabled by distance; 422 `GEOFENCE_OUT_OF_RADIUS` → destructive alert, panel stays PRE_START (FR-023).

### Implementation
- [ ] T025 [US3] Update `apps/pwa/src/features/execution/components/GeoLocationCapture.tsx`: accept `radiusMeters` prop (default `PLATFORM_SETTINGS_REGISTRY.fieldEvents.defaults.geofenceRadiusMeters`), remove `DISTANCE_WARNING_THRESHOLD = 200`, warn-only copy; never disable Start/Check-in (FR-022/023). (Depends: T023.)
- [ ] T026 [US3] Pass the detail's `geofence.radiusMeters`/`mode` into `GeoLocationCapture` from `PreStartPanel`/`FinishingPanel`/card check-in; surface the start 422 as a destructive alert in `PreStartPanel`/`ExecutionPage` keeping PRE_START (FR-023). (Depends: T025, T024, T013.)

**Checkpoint**: US3 independently demoable; capture+panel tests green.

---

## Phase 6: User Story 4 — Permanent queued-START cleanup (Priority: P1)

**Goal**: D21/L-F03-02. **Independent test**: queued START+FINISH for `a1` + local IN_PROGRESS; START gets 422 geofence → FAILED(1st response), FINISH removed, state cleared, snapshot refreshed, schedule invalidated, card shows "Check in".

### Tests first
- [ ] T027 [P] [US4] Extend `apps/pwa/src/features/execution/hooks/__tests__/useOfflineQueue.test.ts`: old `{lat,lng}` item still syncs; new hooks never call `enqueueAction`; permanent START (422 geofence 1st response) → FAILED + remove chained FINISH(`a1`) + `clearExecutionState('a1')` + `refreshQueueSnapshot` + `invalidateQueries(['inspector','schedule'])` + `showError("A queued inspection sync failed: … Check in again when you're at the property.")`; 404 `APPOINTMENT_NOT_FOUND`/403 `EXECUTION_T1_BLOCKED` → same cleanup, no geofence suffix; 503/network → PENDING + `retryCount+1`, state+FINISH intact; 401 → nothing cleared; FINISH of `a2` intact; FAILED geofence item exposes no "Retry" (FR-025/026/028).

### Implementation
- [ ] T028 [US4] Add `isPermanentQueueError(err)` + permanent-START handling to `apps/pwa/src/features/execution/hooks/useOfflineQueue.ts` (4xx except 401/408/429; 422 geofence permanent on 1st response): FAILED, remove chained FINISH (`removeQueuedAction`), `clearExecutionState`, `refreshQueueSnapshot`, invalidate `['inspector','schedule']`, `showError` (+geofence suffix); 5xx/network keep PENDING; 401 clears nothing; FINISH permanent unchanged (FR-025/026/027). (Depends: T027.)
- [ ] T029 [US4] Ensure the FAILED geofence queue item exposes no "Retry" affordance in the queue UI (wherever the queue list renders retry) (FR-026). (Depends: T028.)

**Checkpoint**: US4 independently demoable; queue tests green; card no longer trappable in "Check out".

---

## Phase 7: User Story 5 — "Running late" (Priority: P2)

**Goal**: contract 03.2. **Independent test**: today NOT_STARTED → "Running late" → `TRAFFIC`+20 → notify → snackbar with server ETA.

### Tests first
- [ ] T030 [P] [US5] Create `apps/pwa/src/features/field-events/components/__tests__/LateNoticeSheet.test.tsx`: 4 reason radios; minutes chips 10/20/30/45/60/90 (required, label "{n} minutes late"); no note field; question "How late will you arrive? (from {HH:mm})" = `timeSlotStart` with helper "Count from the start of the booked window." (no published stop) and `publishedServiceStartAt` with "Count from your planned arrival time." when present; send → `POST …/late-notice` `{reason,minutesLate,…optional position}` → 201 `estimatedArrivalAt` → snackbar "Operations know you'll arrive around {HH:mm} (about 20 min late)."; 422 after check-in → server message; offline → disabled + connection alert (FR-018..021).
- [ ] T031 [P] [US5] Create `apps/pwa/src/features/field-events/hooks/__tests__/useReportLateNotice.test.ts`: `apiPost` not `enqueueAction`; stable `Idempotency-Key`; returns server `estimatedArrivalAt`/`minutesLate` (FR-019/028).

### Implementation
- [ ] T032 [US5] Create `apps/pwa/src/features/field-events/hooks/useReportLateNotice.ts` (`apiPost`, stable key, optional opportunistic position) (FR-019). (Depends: T031.)
- [ ] T033 [US5] Create `apps/pwa/src/features/field-events/components/LateNoticeSheet.tsx` (a11y per FR-031; reasons; minutes `Segmented`/chips; reference question + helper from `publishedServiceStartAt ?? timeSlotStart`; "Notify operations"/"Cancel"; offline/error states) (FR-018/020/021/031). (Depends: T030, T032.)
- [ ] T034 [US5] Wire "Running late" into the card menu (hidden unless today AND local phase is not in progress) and show the server-ETA snackbar; 422-after-check-in message (FR-018/020). (Depends: T033, T016.)

**Checkpoint**: US5 independently demoable.

---

## Phase 8: User Story 6 — "You reported…" detail alert (Priority: P3)

**Goal**: D28/L-F03-09.

### Tests first
- [ ] T035 [P] [US6] Extend `apps/pwa/src/features/schedule/pages/__tests__/AppointmentDetailPage.test.tsx`: `lastFieldIssue{reason:'KEY_FAILED',occurredAt}` → info `Alert` "You reported 'Key didn't work' on {dd/MM/yyyy}. This job was offered again." (+ note when present); null/absent → no alert; SCHEDULED shows secondary "Running late"/"Can't do this job", DONE does not (FR-029, FR-012).

### Implementation
- [ ] T036 [US6] Add the info `Alert` at the top of `apps/pwa/src/features/schedule/pages/AppointmentDetailPage.tsx` from `appointment.lastFieldIssue` using `FIELD_ISSUE_REASON_LABELS` + `dd/MM/yyyy` (effective TZ) (FR-029). (Depends: T035.)

**Checkpoint**: US6 independently demoable.

---

## Phase 9: Polish & Cross-Cutting

- [ ] T037 [P] Accessibility sweep across both sheets and the card per FR-031 (dialog roles, focus order/return, fieldset/legend, `aria-describedby`, counter `aria-live` from 450, ≥48px targets, labelled actions); assert in the existing tests.
- [ ] T038 [P] Run `pnpm --filter pwa check:ds` and fix any off-design-system class (FR-031).
- [ ] T039 Update `apps/pwa/CLAUDE.md` (§13.11): record the card action bar, `features/field-events/`, `useExecutionActions`, `purgeAppointmentFromOfflineQueue`, the geofence radius prop, and the permanent-queue-failure cleanup.
- [ ] T040 Tidy the root `CLAUDE.md` auto-generated "Active Technologies"/"Recent Changes" entry for F03-3 (concise one-liner; this is the expected merge-conflict zone).
- [ ] T041 Full gate inside the worktree: `pnpm --filter @properfy/shared build` then `pnpm --filter pwa typecheck && lint && test && check:ds && build`; confirm `git status --porcelain` empty and diff ≤150 files.

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T010)** → user stories.
- **US1 (T011–T016)** depends on Foundational (T007/T008). MVP.
- **US2 (T017–T022)** depends on Foundational (T009) + US1 menu (T016).
- **US3 (T023–T026)** depends on US1 check-in (T013) for the card path; capture/panel parts are independent.
- **US4 (T027–T029)** depends on Foundational (T007) + `clearExecutionState`; independent of US2/US3/US5.
- **US5 (T030–T034)** depends on US1 menu (T016).
- **US6 (T035–T036)** depends only on T002; independent.
- **Polish (T037–T041)** last.

## Parallel opportunities
- Foundational test tasks T003/T004/T005/T006 in parallel.
- Across stories once Foundational is done: US4 (queue) and US6 (detail alert) can proceed in parallel with US1; US3 capture/panel tests in parallel with US1 tests.
- Within a story, `[P]` test files run in parallel; implementation tasks are mostly sequential on shared files (card, ExecutionPage).

## MVP scope
US1 (check in/out from the card) alone is a shippable increment of 00.A3. US2 completes 00.A3; US3 delivers 03.A2; US4 is the safety invariant.
