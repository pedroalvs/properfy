# Tasks: PWA App Tour (coach marks) with install step, proven by E2E

**Feature**: `055-f04-3b-app-tour` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
**Scope**: PWA only. No backend, schema, or `api-types` change. No new runtime dependency.
**TDD is mandatory** (constitution III): every implementation task is preceded by a red test. All paths are under `apps/pwa/` unless absolute.

## Conventions

- `[P]` = parallelizable (different files, no incomplete dependency).
- `[US1]`/`[US2]`/`[US3]` = user-story phase tasks. Setup/Foundational/Polish carry no story label.
- Tour step counts/texts are frozen (L-F04-12): 9 browser / 8 standalone; titles/texts literal from spec FR-008/FR-009.

---

## Phase 1: Setup

- [ ] T001 Create the `features/tour/` folder skeleton: `src/features/tour/{components,hooks,lib}/` and matching `__tests__/` dirs (empty placeholders are fine; real files land in later tasks).
- [ ] T002 Confirm baseline is clean and no new dependency is intended: `git diff origin/develop... -- apps/pwa/package.json` is empty (record in PR description); note `__APP_VERSION__` + `getIsStandalone()` (`src/app/useInstallPrompt.tsx`) and the app-state heartbeat (`src/app/useAppStateHeartbeat.ts`) as the reused primitives.

---

## Phase 2: Foundational (blocking — the reusable tour engine + E2E harness)

**Goal**: The engine (geometry, step resolution, overlay, focus trap, target resolution, persistence) and the E2E harness additions that every user story depends on. No story is testable until these exist.

### Pure logic (tests first)

- [ ] T003 [P] Write `src/features/tour/lib/__tests__/tour-geometry.test.ts` (red) covering the spec geometry table: spotlight padding, balloon below/above, horizontal clamp ≥16px, safe-area insets, centered (no target), `isTargetVisible=false` for 0×0/off-document.
- [ ] T004 [P] Implement `src/features/tour/lib/tour-geometry.ts` (pure) to green T003.
- [ ] T005 [P] Write `src/features/tour/lib/__tests__/tour-steps.test.ts` (red): `resolveTourSteps({isStandalone,isIosSafariEligible,canInstall})` → 8 targets + install (9) when `!isStandalone`, 8 when standalone; exact order and `data-tour` keys and literal titles/texts (FR-008/009, L-F04-12).
- [ ] T006 [P] Implement `src/features/tour/lib/tour-steps.ts` (pure, incl. the `TourStep` type) to green T005. (Install-step platform *body* copy lives in US3's `InstallStepBody`; this file only decides inclusion/order.)
- [ ] T007 [P] Implement `src/features/tour/lib/focus-trap.ts` (pure/DOM helper: first/last focusable, Tab/Shift+Tab cycle) — exercised via `AppTour.test.tsx` (T011); no standalone test file required.
- [ ] T008 [P] Write `src/features/tour/lib/__tests__/tour-pending-storage.test.ts` (red): per-user get/set/clear with injected storage; throwing `getItem` degrades safely; other-user value ignored.
- [ ] T009 [P] Implement `src/features/tour/lib/tour-pending-storage.ts` (try/catch, injectable storage) to green T008.

### Hooks + overlay component (tests first)

- [ ] T010 [P] Implement `src/features/tour/hooks/usePrefersReducedMotion.ts` + `useTargetRect.ts` (MutationObserver up to ~500ms, `resize`/`scroll`/`orientationchange` via rAF; returns rect + `isTargetVisible`), with a focused test for `usePrefersReducedMotion` and `useTargetRect` timeout→skip behavior.
- [ ] T011 Write `src/features/tour/components/__tests__/AppTour.test.tsx` (red) covering the spec AppTour table: open (`role=dialog` `aria-modal` + labelledby/describedby, focus on Next, `#root` inert+aria-hidden), counter (`aria-live=polite`, 9 browser / 8 standalone), Next/Back (Back disabled at 1), last step "Done", Skip/Escape → `onFinish('skipped')` once + inert removed + focus restored, focus trap wrap, absent target skip (MutationObserver 500ms) with recomputed total/counter, absent-on-Back, all-absent → install only, none → `onFinish('completed')` without render, scroll `scrollIntoView` (instant under reduced motion), reposition on resize (rAF), overlay click does not close/navigate. Mock `getBoundingClientRect`/`matchMedia`.
- [ ] T012 Implement `src/features/tour/components/AppTour.tsx` to green T011: portal in `document.body` at `z-[60]`, `box-shadow` spotlight (centered step = plain dark overlay), balloon positioned via `tour-geometry`, `focus-trap`, keyboard (Tab/Esc/Enter), `inert`+`aria-hidden` on `#root` with guaranteed cleanup, reduced-motion handling. Use `cn()` + `components/ui/Button`; no hard-coded colors; no new dependency.

### E2E harness additions

- [ ] T013 [P] Add E2E fixtures to `tests/e2e/support/fixtures.ts`: `INSPECTOR_PROFILE_TOUR_PENDING` (`onboardingCompletedAt: null`), `INSPECTOR_PROFILE_TOUR_DONE` (filled), and `DAY_PLAN_TODAY` (published plan with ≥1 stop so the Today anchors render), mirroring the shared response-schema shapes.
- [ ] T014 [P] Add `tests/e2e/support/standalone.ts`: an `addInitScript` helper overriding `matchMedia('(display-mode: standalone)')` and `navigator.standalone` before boot.
- [ ] T015 Add the default `GET /v1/inspector/day-plans/*` stub to the E2E baseline inside `loginAsInspector` (`tests/e2e/support/auth.ts`): register a **prefix predicate route** (`url.pathname.startsWith('/v1/inspector/day-plans/')`) returning `DAY_PLAN_TODAY`, after the flat `BASELINE_STUBS` loop; document it in the `BASELINE_STUBS` doc comment (L-X03-05 ownership rule). Add a `stubJsonPrefix` helper to `tests/e2e/support/api.ts` if one does not exist.
- [ ] T016 Extend `src/__tests__/e2e-fixtures.test.ts`: `inspectorResponseSchema.strict().parse(INSPECTOR_PROFILE_TOUR_PENDING / _DONE)` and `dayPlanResponseSchema.strict().parse(DAY_PLAN_TODAY)` do not throw; an extra key throws `ZodError`.

**Checkpoint**: engine unit tests green; fixtures strict-parse green; E2E harness ready. No tour renders yet (no controller, no anchors).

---

## Phase 3: User Story 1 — First-access guided tour (P1) 🎯 MVP

**Goal**: The tour opens once on first Today visit, can be skipped/completed, records completion once through the app-state heartbeat, and never auto-reopens. Proves `00.A1` (E1–E4).

**Independent test**: Profile with `onboardingCompletedAt: null` → login → `/today` → tour at step 1; Skip/Done sends exactly one completion POST; reload + fresh context → no tour.

### Anchors (attribute-only; tests first)

- [ ] T017 [P] [US1] Update `src/components/shell/__tests__/BottomNavBar.test.tsx` and the `features/today` component tests to assert the `data-tour` anchors exist (`nav-today`, `nav-schedule`, `nav-offers`, `nav-more`, `today-next`, `today-next-actions`, `today-more-actions`, `today-route-link`) (red).
- [ ] T018 [P] [US1] Add/align `data-tour` attributes (behavior-unchanged) to green T017, at these pinned homes (verified against develop):
  - `src/components/shell/BottomNavBar.tsx`: `nav-today`, `nav-schedule`, `nav-offers`, `nav-more` on the 4 tab links.
  - `src/features/today/components/NextInspectionCard.tsx`: `today-next` on the card root; `today-next-actions` on the `AppointmentActionBar` region (the next-inspection card renders exactly one action bar on `/today`).
  - `src/features/execution/components/AppointmentActionBar.tsx`: `today-more-actions` on the existing "More actions" button (`data-testid="card-more-actions"`, line ~226). (This component is shared with the schedule card; the attribute is inert there — the tour reads it only on `/today`, where one bar renders.)
  - `src/features/today/components/TodayHeader.tsx`: **rename** the existing `data-tour="route-link"` (line 51, no test/consumer references it) to **`today-route-link`** on the header "Route" link (always present → the single step-5 anchor). Leave the `ComingUpList` "View and reorder all N stops" link unchanged.

### Controller open + record (tests first)

- [ ] T019 [US1] Write `src/features/tour/hooks/__tests__/useAppTourController.test.tsx` (red) for the open + record subset of the spec controller table: first access opens once on `/today` with plan settled; waits on deep-link route (`/schedule/:id`) until `/today`; waits for plan loading; never opens when `onboardingCompletedAt` filled; finish/skip → one POST `/v1/inspectors/me/app-state` with the 3 heartbeat fields + `onboardingCompleted:true`, invalidates `['inspector','me']`; offline/5xx/429 → writes pending key, no reopen this session/next load, retries on next mount + `online`; pending-of-other-user ignored; broken storage → opens ≤1 per load; StrictMode double-mount → 1 tour/1 POST. Inject storage/API/`useInspectorMe`.
- [ ] T020 [US1] Implement `src/features/tour/hooks/useAppTourController.ts` + `src/features/tour/components/AppTourHost.tsx` to green T019 (open gating incl. the `[data-state="open"][role="dialog"]`/sheet guard; record via `apiPost`, bypassing the 6h throttle; pending retry on `online`).
- [ ] T021 [US1] Extend the manual type in `src/features/profile/hooks/useInspectorMe.ts` with `onboardingCompletedAt: string | null` (do not read it from `/v1/me`). Update/confirm `useInspectorMe` tests.
- [ ] T022 [US1] Mount `<AppTourHost/>` in `src/components/shell/PwaLayout.tsx` (portal lives outside `#root`); ensure logout tears it down. No behavior change to other PwaLayout wiring.
- [ ] T023 [US1] Clear `properfy.pwa.tourCompletedPending` on logout in `src/lib/auth-storage.ts` (`clearTokens`), alongside the heartbeat-throttle key; add/extend its test.

### E2E E1–E4 (the gate)

- [ ] T024 [US1] Write `tests/e2e/app-tour.spec.ts` with `skipOnWide('tour targets are phone-layout anchors')` at file top; implement E1 (first access, "Step 1 of 9", overlay), E2 (Skip → 1 POST `onboardingCompleted:true`), E3 (Next→Done to "Step 9 of 9" → 1 POST), E4 (after completion + mock now returns filled date; reload & fresh context → no dialog in 3s via `toHaveCount(0)` after `networkidle`). Use `loginAsInspector(page,{me:INSPECTOR_PROFILE_TOUR_PENDING})`, then register (after login) `GET /v1/inspectors/me` (pending) and a `POST /v1/inspectors/me/app-state` capture stub; assert by role/accessible name, never pixels/`waitForTimeout`.

**Checkpoint**: US1 independently deliverable — `00.A1` core proven (E1–E4 green on the 2 phone projects).

---

## Phase 4: User Story 2 — Replay from App settings (P2)

**Goal**: "Show app tour" replays on `/today` without changing state or recording completion.

**Independent test**: `onboardingCompletedAt` filled → App settings → "Show app tour" → tour opens; Skip/Done → 0 completion POSTs.

- [ ] T025 [US2] Update `src/features/profile/pages/__tests__/ProfileSettingsPage.test.tsx` (red): a "Show app tour" `MenuRow` (`Compass` icon, "See how the app works again") navigates to `/today` with `state.replayTour = true`; the push slot + `InstallAppCard` + version footer remain.
- [ ] T026 [US2] Add the "Show app tour" `MenuRow` to `src/features/profile/pages/ProfileSettingsPage.tsx` to green T025.
- [ ] T027 [US2] Extend `useAppTourController` + its test (T019 file) for the replay branch: `navigate('/today',{state:{replayTour:true}})` opens regardless of `onboardingCompletedAt` and sends **no** POST on finish (red first).
- [ ] T028 [US2] Add E2E E5 to `tests/e2e/app-tour.spec.ts`: `onboardingCompletedAt` filled → `/profile/settings` → "Show app tour" → tour opens on `/today`; Skip or Done → the app-state capture counter = 0.

**Checkpoint**: US2 deliverable on top of US1.

---

## Phase 5: User Story 3 — Install step shown only when not installed (P3)

**Goal**: The 9th install step adapts to platform and is omitted in standalone (total 8).

**Independent test**: browser → install step present as last (total 9); emulated standalone → absent (total 8). iOS vs Android vs manual bodies.

- [ ] T029 [US3] Write the install-step cases in `src/features/tour/components/__tests__/AppTour.test.tsx` (red): iOS Safari eligible → "Share" + "Add to Home Screen", no install button; Android `canInstall` → "Install app" → `promptInstall()`, accepted → "Installed" + "Done"; `!canInstall && !ios` → `manualInstructions`.
- [ ] T030 [US3] Implement `src/features/tour/components/InstallStepBody.tsx` (consumes `useInstallPrompt()` read-only) to green T029; wire it as the centered install step body in `AppTour.tsx`.
- [ ] T031 [US3] Add E2E E6 to `tests/e2e/app-tour.spec.ts`: (a) browser → final "Install Properfy" step present, total 9; (b) `standalone.ts` init script applied → install step absent, counter reaches "Step 8 of 8".

**Checkpoint**: All three stories complete; `00.A1` fully proven (E1–E6).

---

## Phase 6: Polish & Cross-Cutting

- [ ] T032 Update `apps/pwa/CLAUDE.md`: add a "App tour (F04-3b)" subsection under Profile/§4.6 or a new §4.8 (auto-open on first `/today`, record via heartbeat `onboardingCompleted`, replay from App settings, no new dep), the `data-tour` anchor convention, and the E2E baseline day-plan-stub note; keep every existing entry (1-line additions only).
- [ ] T033 Update the root `CLAUDE.md` Active Technologies / Recent Changes F04-3b line generated by `update-agent-context.sh` to a concise 1-line summary; preserve all other entries (shared-file rebase discipline).
- [ ] T034 Run the full gate set inside the worktree (via a subagent returning a condensed summary): `pnpm --filter @properfy/shared build && pnpm --filter pwa lint && pnpm --filter pwa typecheck && pnpm --filter pwa test && pnpm --filter pwa build && pnpm --filter pwa check:ds && pnpm --filter pwa test:e2e`; plus `git diff origin/develop... -- apps/pwa/package.json` empty. Local flake sanity: `playwright test app-tour --repeat-each=3 --retries=0` green; inverting one assertion turns it red.
- [ ] T035 Device QA checklist (complementary, not a CI gate): T2 (iOS install instructions / standalone absent), T3 (Android install prompt), T4 (cross-device no-reappear), T7 (no stops today → card steps skipped), T8 (VoiceOver/TalkBack), T9 (reduced motion), T10 (tablet rotation), T11 (airplane-mode completion + staging `onboardingCompletedAt` via API). Screenshots never committed.

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T016)** → **US1 (T017–T024)** → **US2 (T025–T028)** → **US3 (T029–T031)** → **Polish (T032–T035)**.
- US1 is the MVP and must land first (it is the `00.A1` core). US2 and US3 build on US1's engine/controller and E2E spec file.
- Within Foundational, T003/T004, T005/T006, T007, T008/T009, T010, T013, T014 are mutually parallel `[P]`; T011→T012 are sequential; T015 depends on T013; T016 depends on T013.
- Within US1, T017/T018 (anchors) are independent of T019/T020 (controller) and can proceed in parallel; T024 (E2E) depends on anchors + controller + T015 baseline.
- `tests/e2e/app-tour.spec.ts` is one file edited across T024/T028/T031 (sequential edits, not `[P]`).

## Parallel opportunities

- Foundational pure-logic: T003+T005+T008+T013+T014 in parallel, then their impls.
- US1 anchors (T017→T018) in parallel with controller (T019→T020→T021).

## MVP scope

**User Story 1 only** (T001–T024) delivers a shippable tour that opens once, records once, and never reopens — the `00.A1` core. US2 (replay) and US3 (install step) complete the contract.

## Format validation

All tasks use `- [ ] [TaskID] [P?] [Story?] description with file path`. Setup/Foundational/Polish carry no story label; US phases carry `[US1]`/`[US2]`/`[US3]`.
