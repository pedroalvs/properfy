# Phase 0 Research: PWA App Tour

All items below were effectively frozen by the task source (TASK-F04-3b) and lacuna decision L-F04-12. No open `NEEDS CLARIFICATION` remained after the spec; this file records the chosen approaches and why.

## D1 — No tour library; bespoke overlay

- **Decision**: Build the coach-mark overlay in-house (portal in `document.body`, overlay, spotlight, balloon). Do not add any tour library (react-joyride, shepherd, driver.js, etc.).
- **Rationale**: FR-016 / contract `00.2` forbids a new PWA dependency. A tour library would also fight the app's own focus/inert model and the mobile safe-area layout. The required behavior (one spotlight + one anchored popover + focus trap) is small.
- **Alternatives rejected**: react-joyride / driver.js (new dep, heavier, harder to make accessible + safe-area aware). Radix Dialog for the balloon (it is a *centered modal*; it cannot cut a spotlight into the target nor anchor a popover to it).

## D2 — Spotlight via `box-shadow`, not `clip-path`

- **Decision**: The spotlight is a positioned `div` at the target rect + 8px padding with `box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.6)`; the dark area is the shadow. The install (centered) step uses a plain full-screen dark overlay with no cut-out.
- **Rationale**: `clip-path` on a full-screen overlay causes expensive repaints on iOS Safari during transitions; a large spreading `box-shadow` is cheap and GPU-friendly.
- **Alternatives rejected**: `clip-path` / SVG mask (repaint cost on iOS); four separate dark rectangles (fiddly on resize).

## D3 — Balloon placement by a pure geometry helper

- **Decision**: `tour-geometry.ts` computes, from a target `DOMRect` + viewport + safe-area insets, the spotlight rect (target + padding) and the balloon placement (`top` / `bottom` / `center`), horizontally clamped to 16px gutters and never inside the safe-area insets. Width `min(320px, 100vw − 32px)`.
- **Rationale**: Pure functions are unit-testable in jsdom without real layout (the component mocks `getBoundingClientRect`). Matches the task's geometry test table.
- **Insets**: `--safe-area-bottom` token (bottom) and `env(safe-area-inset-top)` read directly (no top token exists).

## D4 — Target resolution with MutationObserver + rAF reposition

- **Decision**: `useTargetRect(selector)` waits up to ~500ms for the `[data-tour="…"]` element (MutationObserver), measures it with `getBoundingClientRect`, and recomputes on `resize` / `scroll` / `orientationchange` via `requestAnimationFrame`. A 0×0 or absent target reports `isTargetVisible=false`.
- **Rationale**: The Today screen renders asynchronously (day-plan query); a step's anchor may not exist yet or at all (no stops today). Absent targets must be skipped and the total recomputed (FR-006).

## D5 — Step resolution and counts (frozen, L-F04-12)

- **Decision**: `resolveTourSteps({ isStandalone, isIosSafariEligible, canInstall })` returns **8 target steps + 1 install step** → 9 in a browser, 8 standalone. Titles/texts are literal from the spec FR-008/FR-009. Target steps whose anchor is absent at runtime are skipped by the component (not by `resolveTourSteps`, which only drops the install step when standalone).
- **Rationale**: Counts and texts are a test contract (E2E + unit). L-F04-12 froze them, including step 4's Q1 wording ("The job is released and operations are alerted straight away").

## D6 — Open/record/replay controller

- **Decision**: `useAppTourController` (mounted in `AppTourHost` inside `PwaLayout`) opens the tour exactly once when: authenticated INSP, `useInspectorMe` loaded with `onboardingCompletedAt == null`, no local pending record for this user, route is `/today`, the day plan has settled (success/empty/error), no blocking `[data-state="open"][role="dialog"]`/sheet open, and not already opened this load (module flag guards StrictMode double-mount). On finish/skip (non-replay) it POSTs `/v1/inspectors/me/app-state {displayMode,pushPermission,appVersion,onboardingCompleted:true}` once (bypassing the heartbeat's 6h throttle), invalidates `['inspector','me']` on success; on failure writes the pending key and retries on next mount + `online`.
- **Rationale**: Mirrors the task's controller test table exactly. The record uses the existing endpoint (no contract change); the completion field was added by TASK-F04-2.

## D7 — Replay from App settings

- **Decision**: "Show app tour" (`MenuRow`, `Compass` icon, "See how the app works again") navigates `navigate('/today', { state: { replayTour: true } })`. The controller opens on `replayTour` regardless of `onboardingCompletedAt` and sends **no** POST on finish.
- **Rationale**: Replay must not re-record (SC-002). Navigating to `/today` guarantees the anchors exist.

## D8 — Local pending persistence

- **Decision**: `tour-pending-storage.ts` stores `properfy.pwa.tourCompletedPending = <userId>` (try/catch; broken storage degrades to "open at most once per load" via a module flag). Cleared on logout in `lib/auth-storage.ts` alongside the existing heartbeat-throttle key. A pending key for a *different* userId is ignored.
- **Rationale**: Prevents the tour reopening after a failed completion POST (offline/5xx/429) and drives retry (FR-012). Per-user so a shared device is correct. jsdom `localStorage` is unreliable in tests → inject storage.

## D9 — Standalone emulation in E2E

- **Decision**: `tests/e2e/support/standalone.ts` adds an `addInitScript` overriding `matchMedia('(display-mode: standalone)')` and `navigator.standalone` before boot. E6(b) uses it.
- **Rationale**: Playwright cannot truly install a PWA; emulating the two signals the app reads is sufficient for presence/absence of the install step. Real installability is device QA (T2/T3).

## D10 — E2E day-plan baseline stub (the F04-3 follow-up)

- **Decision**: Add a default `GET /v1/inspector/day-plans/*` stub to the shared E2E baseline (registered inside `loginAsInspector`), returning a published `DAY_PLAN_TODAY` fixture. Because the path carries the civil date as a segment and `stubJson` matches exact pathnames, the baseline registers it with a **prefix predicate route** (`url.pathname.startsWith('/v1/inspector/day-plans/')`), not a flat `BASELINE_STUBS` entry.
- **Rationale**: Every tour E2E lands on `/today`, which reads the day plan on load; F04-3 did not add it because no spec navigated to Today before now (explicit follow-up in the task/role). Adding it to the baseline is date-independent and forward-compatible for future Today specs. Tour specs still override `/v1/inspectors/me` (with `onboardingCompletedAt`) and the app-state capture after login (last route wins).
- **Alternatives rejected**: Per-spec exact-date stub (breaks tomorrow as the Sydney civil date advances); computing today's Sydney date in the fixture (fragile, duplicates app logic).

## D11 — `useInspectorMe` typing

- **Decision**: Extend the manual type on `useInspectorMe` with `onboardingCompletedAt: string | null`. Do not read the field from `/v1/me` (its response schema strips it).
- **Rationale**: `/v1/inspectors/me` has no OpenAPI response schema, so the PWA types it by hand (established by F01-3). TASK-F04-2 added the field server-side.

## D13 — Anchor reconciliation (`route-link` → `today-route-link`)

- **Decision**: F04-3/4 shipped a lone `data-tour="route-link"` on `TodayHeader`'s "Route" link with no consumer yet. Rename it to the frozen contract key `today-route-link` (L-F04-12) and use the header "Route" link — always rendered — as the single step-5 anchor. `ComingUpList`'s "View and reorder all N stops" link is left unchanged (it also links to `/today/route`, so a second anchor there would be ambiguous).
- **Rationale**: Confirmed by grep that `route-link` is referenced only in `TodayHeader.tsx` (no test/other consumer), so the rename is safe; a single always-present anchor avoids dual-match in `useTargetRect`.

## D12 — Accessibility & inert

- **Decision**: Balloon is `role="dialog" aria-modal="true"` with `aria-labelledby` (title) + `aria-describedby` (text); counter in `aria-live="polite"`. While open, `#root` gets `inert` + `aria-hidden="true"` (portal is outside `#root`); always removed on cleanup, including error paths. Focus trap is custom (`focus-trap.ts`): Tab cycle within the balloon, initial focus "Next", Escape = Skip, focus restored on close.
- **Rationale**: iOS < 16.4 lacks `inert`; the click-capturing overlay still blocks background interaction and `aria-hidden` covers the screen reader. Matches the AppTour test table.
