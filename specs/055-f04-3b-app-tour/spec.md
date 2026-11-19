# Feature Specification: PWA App Tour (coach marks) with install step, proven by E2E

**Feature Branch**: `055-f04-3b-app-tour`
**Created**: 2026-11-02
**Status**: Draft
**Input**: TASK-F04-3b (`fase2-etapa1/tarefas/F04-tarefas.md`) — contract code `00.2` (tour) / acceptance `00.A1`. Final link of feature F04. PWA-only: no backend, schema or API-contract change.

## Overview

The Properfy Inspector App (PWA) gained a new home screen and navigation in F04-3/F04-4 (the **Today** screen, a four-tab bottom bar, the day route list and map). First-time inspectors, and every inspector whose app changed in this release, need a short guided tour that points at the new surfaces so they can find their day, their next job, the field-event actions and their route without being trained in person.

This feature adds a guided, in-app coach-mark tour: a dimmed screen with a spotlight cut-out around each target, a small balloon with a title, one short line of text and **Back / Next / Skip** controls plus a "Step N of M" counter. The tour opens once, automatically, on the inspector's first visit to the Today screen after logging in. Completing or skipping it records that the inspector has seen it, so it never reappears — on any device. A final **install** step (shown only when the app is not already installed) explains how to add Properfy to the home screen. "Show app tour" in App settings replays the tour on demand without changing the recorded state.

The primary acceptance criterion (`00.A1`) is proven by automated end-to-end tests over the recovered PWA E2E suite (X03).

## Scope boundaries

**In scope (PWA only):**

- A self-contained coach-mark tour component (overlay, spotlight, anchored balloon, focus trap, keyboard controls, reduced-motion support, missing-target handling).
- Eight target steps + one install step; final texts and counts are fixed (see Functional Requirements).
- Auto-open on first Today visit after login; one-time completion recorded through the existing app-state heartbeat; replay from App settings.
- Playwright E2E specs proving `00.A1`, plus unit/component tests for the tour engine, steps, controller and persistence.
- `data-tour` anchor attributes added to existing navigation and Today-screen elements (attribute-only edits).

**Out of scope:**

- Any backend, database or API-contract change. The `onboarding_completed_at` column, the heartbeat field `onboardingCompleted`, and `onboardingCompletedAt` on the inspector profile read were all delivered by TASK-F04-2 and are only **consumed** here.
- Changing the install banners or the App settings install card (they remain as-is).
- A tour on the web portal or AM/OP app; per-screen tours; step analytics.
- Showing `onboardingCompletedAt` anywhere in the web app (that field is exposed to AM/OP in the API only).
- Any new third-party dependency (no tour library).
- Recovering the E2E suite itself (that is X03, a prerequisite).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-access guided tour (Priority: P1)

An inspector opens the app for the first time after this release and logs in. On reaching the Today screen, a guided tour opens automatically. It walks them, step by step, through the Today tab, the next-inspection card, navigate/check-in actions, the "running late / can't do it" actions, the route link, and the Schedule/Offers/More tabs, ending (when the app is not installed) with how to install the app. They can go Back, Next, or Skip at any point, and a counter shows progress. When they finish or skip, the tour records that it has been seen and never opens automatically again — not even after reloading, and not on another device.

**Why this priority**: This is the contract deliverable (`00.A1`). Without it the feature does not exist. It is the MVP: a tour that opens once, can be skipped or completed, and does not return.

**Independent Test**: With a profile whose onboarding timestamp is empty, log in and land on Today — the tour opens at step 1. Skipping or completing it records completion once; a reload (and a fresh device context) shows no tour. Fully verifiable by the Playwright E2E specs E1–E4.

**Acceptance Scenarios**:

1. **Given** an inspector who has never completed onboarding, on a non-installed browser, **When** they log in and reach the Today screen, **Then** the tour dialog opens at "Step 1 of 9" with a dimmed overlay.
2. **Given** the tour is open at step 1, **When** the inspector chooses "Skip", **Then** the tour closes and completion is recorded exactly once.
3. **Given** the tour is open, **When** the inspector advances with "Next" through every step to "Done", **Then** the counter reaches "Step 9 of 9", "Done" records completion exactly once, and the tour closes.
4. **Given** the inspector has completed (or skipped) the tour, **When** they reload the Today screen, or open it in a fresh device context, **Then** the tour does not open automatically.
5. **Given** a step whose target element is not present on screen, **When** the tour reaches that step, **Then** that step is skipped and the total count adjusts accordingly.

---

### User Story 2 - Replay the tour from App settings (Priority: P2)

An inspector who has already seen the tour wants to see it again (e.g. to re-find a feature). From More → App settings they choose "Show app tour". The tour opens on the Today screen and runs exactly as before, but completing or skipping it this time does **not** change the recorded state and does **not** re-record completion.

**Why this priority**: Explicit contract requirement ("revisto em More → App settings sem mudar o estado"). Depends on Story 1's engine but is independently valuable and testable.

**Independent Test**: With onboarding already completed, open App settings, choose "Show app tour" — the tour opens on Today; skipping or completing it sends no completion signal. Verifiable by E2E spec E5.

**Acceptance Scenarios**:

1. **Given** an inspector with onboarding already recorded, **When** they choose "Show app tour" in App settings, **Then** the tour opens on the Today screen.
2. **Given** the tour was opened via replay, **When** the inspector skips or finishes it, **Then** no completion signal is sent and the recorded state is unchanged.

---

### User Story 3 - Install step shown only when not installed (Priority: P3)

When the inspector runs the app in a browser (not installed to the home screen), the tour's final step explains installation: on iOS Safari, how to use Share → Add to Home Screen; on Android/Chrome, an install button (or manual instructions when no install prompt is available). When the app is already installed (running standalone), the install step does not appear and the tour is one step shorter.

**Why this priority**: Part of the contract tour but conditional; the core tour works without it. Real installability on devices is confirmed by manual device QA; the E2E suite proves presence/absence by emulating standalone.

**Independent Test**: Run the tour in a non-installed browser (install step present as the last step) and in an emulated standalone context (install step absent, total one lower). Verifiable by E2E spec E6.

**Acceptance Scenarios**:

1. **Given** the app is running in a browser (not standalone), **When** the inspector reaches the end of the tour, **Then** an "Install Properfy" step is shown as the final step and the total is 9.
2. **Given** the app is running standalone (installed), **When** the inspector runs the tour, **Then** no install step is shown and the total is 8 ("Step 8 of 8").
3. **Given** the install step on iOS Safari, **When** it is shown, **Then** it describes "Share" and "Add to Home Screen" with no install button.
4. **Given** the install step on Android/Chrome with an available prompt, **When** the inspector taps "Install app" and accepts, **Then** the step shows an installed state and the primary button becomes "Done".

---

### Edge Cases

- **Deep link on first access** (e.g. opening a push notification that targets an announcement): the tour waits and opens only when the inspector reaches the Today screen, never over the deep-linked screen.
- **No stops today**: the Today-card steps (next inspection, actions, route) have no targets and are skipped; the counter adjusts; the tour still runs the always-present steps (and install).
- **Wide layout (tablet/foldable)**: the route detail pane does not hide the Today targets (the master stays mounted) and the bottom bar stays visible; however, the tour targets are phone-layout anchors, so the E2E tour specs run only on the two phone projects.
- **Keyboard / orientation change**: the balloon and spotlight reposition on resize/orientation change.
- **Installed mid-tour** (Android prompt accepted): the install step updates to an installed state.
- **Two devices at once**: the first to complete records it; later reads of the profile stop the tour from auto-opening on the other device.
- **Existing inspectors at deploy**: everyone's onboarding timestamp is empty, so everyone sees the tour once (intended — navigation changed this release).
- **A sheet or dialog already open** when the tour wants to open: the tour waits until no blocking overlay is open, then opens.
- **Reduced motion**: with the OS "reduce motion" setting on, there is no spotlight/balloon transition and scrolling to a target is instant.
- **Offline / server error when recording completion**: completion is remembered locally so the tour does not reopen this session or next load, and the signal is retried on the next app start or when connectivity returns.
- **Completion signal silently dropped by the server contract**: if the server does not persist the completion field, the profile read keeps returning an empty onboarding timestamp and the tour would reopen; this risk is covered by an E2E check against the mock and a one-time manual check against staging.
- **Focus restoration**: closing the tour returns keyboard focus to the element that was focused before it opened (or a sensible fallback), and the rest of the app is made inert only while the tour is open and always restored on close (including on error).

## Requirements *(mandatory)*

### Functional Requirements

**Tour presentation**

- **FR-001**: The tour MUST present one step at a time as a dimmed full-screen overlay with a spotlight cut-out highlighting the step's target, and a balloon anchored near the target containing a title, one short line of body text (≤ 140 characters, English), a "Step {i} of {n}" counter, and Back / Next (or Done on the last step) / Skip controls.
- **FR-002**: The balloon MUST be positioned above or below its target and clamped within the viewport and the device safe-area insets; the install step (no target) MUST be centered with a plain dark overlay and no spotlight.
- **FR-003**: The tour MUST be keyboard-operable: Tab/Shift+Tab are trapped within the balloon, Escape acts as Skip, the focused control activates on Enter, initial focus is on the "Next" control, and on close focus returns to the element active before the tour opened.
- **FR-004**: While the tour is open, the rest of the app MUST be inert and hidden from assistive technology; this MUST always be restored when the tour closes, including on error.
- **FR-005**: With the OS reduced-motion preference set, the tour MUST omit spotlight/balloon transitions and scroll to targets instantly; otherwise it MAY use a short transition applied only to the tour's own elements, never to app elements.
- **FR-006**: If a step's target is not present (or has zero size) within a short wait, that step MUST be skipped in the direction of travel and the total step count MUST adjust; if no targets at all are present and there is no install step, the tour MUST finish without rendering.

**Steps, order and text (final; counts fixed)**

- **FR-007**: The tour MUST contain exactly **8 target steps plus 1 install step** — 9 steps in a browser, 8 when running standalone (install step omitted). All counters and tests MUST use these numbers.
- **FR-008**: The target steps MUST appear in this order with these exact titles and texts:
  1. **Today** — "Your day at a glance: what's next, what's done and when you'll finish." (always)
  2. **Next inspection** — "The job you're heading to, with its window and ETA. Tap it for full details." (when target exists)
  3. **Navigate and check in** — "Navigate opens your maps app. Check in when you arrive and check out when you finish." (when target exists)
  4. **Running late or can't do it?** — "Tell us here. The job is released and operations are alerted straight away." (when target exists)
  5. **Your route** — "See every stop in order, on a list or a map, and change the order if you need to." (when target exists)
  6. **Schedule** — "All your upcoming jobs, day by day, and your history." (always)
  7. **Offers** — "Groups of jobs near you. Accept the ones that fit your week." (always)
  8. **More** — "Announcements, earnings, your profile and app settings." (always)
- **FR-009**: The install step (9th, only when not standalone) MUST adapt to the platform: on iOS Safari, instructions referencing "Share" and "Add to Home Screen" with no install button; on Android/Chrome with an available prompt, an "Install app" button and short copy; otherwise the platform's manual instructions.

**Opening, recording and replay**

- **FR-010**: The tour MUST open automatically exactly once when: the inspector is authenticated, the profile read shows the onboarding timestamp is empty, there is no local record that the current user already finished it, the current route is the Today screen, and the Today data has settled (loaded, empty, or errored).
- **FR-011**: On first-access completion or skip (not replay), the tour MUST send the completion signal through the existing app-state mechanism exactly once (carrying the standard app-state fields plus the completion flag), and on success refresh the cached profile so the onboarding timestamp is seen as set.
- **FR-012**: If sending the completion signal fails (offline, server error, or rate-limited), the tour MUST remember completion locally for the current user so it does not reopen this session or on next load, and MUST retry the signal on the next app start and when connectivity returns.
- **FR-013**: "Show app tour" in More → App settings MUST replay the tour on the Today screen regardless of the recorded onboarding state and MUST NOT send any completion signal or change the recorded state.
- **FR-014**: The tour MUST NOT reopen automatically once onboarding is recorded (locally or on the server), including across reloads and across devices (after the next profile read).

**Anchors and non-functional**

- **FR-015**: The following existing elements MUST carry stable `data-tour` anchor attributes (attribute-only change, no behavior change): the four bottom-bar tabs (`nav-today`, `nav-schedule`, `nav-offers`, `nav-more`), and the Today-screen next-inspection card (`today-next`), its action bar (`today-next-actions`), its more-actions control (`today-more-actions`), and the route link (`today-route-link`).
- **FR-016**: The feature MUST add no new runtime dependency to the PWA package.
- **FR-017**: All user-facing text MUST be in English and touch targets MUST meet the 44px minimum.
- **FR-018**: Any new authenticated-boot API call introduced by the tour's test scenarios MUST have its default stub added to the E2E baseline in the same change (the Today screen's day-plan read is required by every tour E2E, since all tour scenarios land on Today).

### Key Entities

- **Tour step**: a unit of the tour — an anchor key (or "install"), a title, a short body text, and a condition for inclusion (always / target-exists / not-standalone). The resolved sequence depends on standalone state and which targets are present.
- **Onboarding state (read-only here)**: whether the inspector has completed onboarding, read as a timestamp on the inspector profile (empty = not yet). Set server-side by the completion signal; never written directly by this feature.
- **Local completion record**: a per-user local marker used only to avoid re-opening the tour and to drive retry of a failed completion signal; it is cleared on logout and carries the user identity so it is ignored for a different user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (`00.A1`)**: The guided tour appears on first access, can be skipped, can be completed, does not reappear afterwards (including in another device context), and can be reviewed from More → App settings without changing state. The install step appears only outside standalone. This is proven green by end-to-end tests E1–E6 in continuous integration; real installability on iOS 16.4+ and Android is confirmed in device QA (T2/T3).
- **SC-002**: Completion is recorded exactly once on finish or skip from first access, and the replay from settings records nothing (verified by counting the completion signal in tests: exactly 1 for finish/skip, 0 for replay).
- **SC-003**: Step counts are consistent everywhere: 9 steps in a browser, 8 when standalone; the step titles and texts are used literally as specified.
- **SC-004**: Back / Next / Skip, the counter, Escape = skip, the focus trap, reduced-motion behavior, and skipping an absent target all behave as specified (verified by component tests).
- **SC-005**: An inspector can complete the tour without assistance; a skipped or interrupted tour never leaves the app inert or unusable (focus and inert state always restored).
- **SC-006**: The PWA package gains no new runtime dependency, and all workspace gates pass: shared build, PWA lint, typecheck, unit tests, build, design-system guard, and the E2E suite (E1–E6 green; inverting any one assertion locally turns the suite red).

## Assumptions

- **Prerequisites merged**: TASK-F04-2 is live (the `onboarding_completed_at` column, the heartbeat `onboardingCompleted` field, and `onboardingCompletedAt` on the inspector profile read); X03 has restored the PWA E2E suite as a real deploy gate; TASK-F04-3 and TASK-F04-4 are merged (the Today screen, four-tab navigation, route list and map/reorder). This task touches none of their backend/contract surface.
- **Q1 (cancellation flow) is resolved** as automatic release via rejection: step 4's text reflects this ("The job is released and operations are alerted straight away"). No open product decision remains for this task; L-F04-12 froze the step counts and texts.
- **Install affordances unchanged**: the existing install banners and the App settings install card remain as delivered by F01-3/earlier; the tour reuses the existing install state (installed / can-install / iOS-Safari-eligible / manual instructions) read-only.
- **E2E day-plan baseline stub**: because every tour E2E scenario lands on the Today screen, and the Today screen reads the day plan on load, the day-plan read's default stub is added to the shared E2E baseline in this change (F04-3 did not add it because no spec navigated to Today before now). The tour specs still override the profile read and the completion-signal capture after login (last-registered route wins).
- **Standalone is emulated in E2E** by overriding the standalone media query and navigator flag via an init script; true installability is confirmed only by device QA (T2/T3).
- **Device QA is complementary**: iOS Safari / Android installability, screen-reader reading of title/text/counter, reduced-motion, tablet rotation and airplane-mode completion are checked manually on devices (T2–T4, T7–T11), because the automated suite cannot reproduce them.

## Dependencies

- TASK-F04-2 (onboarding field in heartbeat and profile read), in production/staging.
- X03 (PWA E2E suite green and gating), merged.
- TASK-F04-3 and TASK-F04-4 (Today screen, navigation, route list, map and reorder), merged — the tour's anchors.
- F01-1 / F01-3 (app-state heartbeat and standalone detection), F02-3 (App settings push slot), F03-3 (the Today action bar extracted into F04-3).
