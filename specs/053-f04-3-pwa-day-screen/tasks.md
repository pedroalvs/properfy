# Tasks: F04-3 · PWA Day Screen & Route navigation base

**Input**: Design documents from `/specs/053-f04-3-pwa-day-screen/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/day-plan-pwa.md, quickstart.md

**Tests**: Mandatory (TDD per constitution III + source task "Testes primeiro"). Every lib/hook/component/screen is written test-first (red → green → refactor). TZ-dependent suites also run with `TZ=America/Los_Angeles`.

**Paths**: relative to repo root. PWA under `apps/pwa/`, shared under `packages/shared/`, backend under `apps/backend/`.

## Phase 1: Setup

- [ ] T001 Confirm worktree deps built (shared + frontend-standards `dist`, prisma client); re-run `pnpm --filter @properfy/shared build` after any shared edit. No new dependency is added in this task.
- [ ] T002 [P] Add test fixture `apps/pwa/src/features/day-plan/__fixtures__/day-plan.ts` with `buildDayPlan(overrides)`/`buildStop(overrides)` matching the "Exemplo de resposta" (Sydney, 2026-11-05), plus a test asserting `dayPlanResponseSchema.parse(buildDayPlan())` passes (shape guard).

## Phase 2: Foundational (blocking prerequisites for all stories)

**Shared helper + allowlist (ship with the data/notice layer)**

- [ ] T003 [P] Test-first: `packages/shared/src/utils/__tests__/format-display-date.test.ts` for `formatInstantTime` (`8:10 am`, `12:00 am`, `''` for null/empty, invalid returned intact, TZ-independent); then implement `formatInstantTime(value, timeZone)` in `packages/shared/src/utils/format-display-date.ts` and export it from the index.
- [ ] T004 [P] Test-first: `packages/shared/src/constants/__tests__/inspector-notices.test.ts` adds the `/today` cases (true for `/today`; false for `/today/`, `/Today`, `//today`, `/today#x`, `/today?x=1`, `/today/route/:date`, `/today/x`; deep link unchanged); then append `/today` to `INSPECTOR_NOTICE_TARGET_PATTERNS` in `packages/shared/src/constants/inspector-notices.ts`.

**Backend notice wiring (DB7)**

- [ ] T005 [P] Test-first: update `apps/backend/tests/unit/day-plan/publish-day-plans.use-case.test.ts` and `recalculate-day-plan.use-case.test.ts` to expect `targetPath: '/today'`; then set `targetPath: '/today'` in `publish-day-plans.use-case.ts` and `recalculate-day-plan.use-case.ts`.
- [ ] T006 [P] Update `apps/backend/tests/unit/inspector-notice/publish-system-inspector-notice.use-case.test.ts`: `/today` accepted, `/today/route/x` rejected (existing F02 validation) — no production change expected beyond the allowlist from T004.

**Pure libs**

- [ ] T007 [P] Test-first `apps/pwa/src/features/day-plan/lib/__tests__/format-route.test.ts` then implement `format-route.ts` (`formatDriveDuration`, `formatDistance`, `formatLeg`, `formatCivilDateLong`, `greetingFor`).
- [ ] T008 [P] Test-first `apps/pwa/src/features/day-plan/lib/__tests__/navigation-url.test.ts` then implement `navigation-url.ts` (`buildNavigationUrl`, `isApplePlatform`, `isPlottablePoint`).
- [ ] T009 [P] Test-first `apps/pwa/src/features/day-plan/lib/__tests__/day-plan-view.test.ts` then implement `day-plan-view.ts` (progress, next, comingUp, allDone, isEmpty, stopsInOrder).

**Data access layer**

- [ ] T010 Add `apiPut`, `apiDelete`, `apiGetBlob` to `apps/pwa/src/hooks/useApiQuery.ts` (same pattern as `apiPost`, Bearer + refresh + `withRetryAfter`); unit cover alongside existing helpers.
- [ ] T011 [P] Create `apps/pwa/src/features/day-plan/api/day-plan-keys.ts` (`dayPlanKeys.all = ['inspector','day-plan']`, `byDate(date)`).
- [ ] T012 Test-first `apps/pwa/src/features/day-plan/hooks/__tests__/useDayPlan.test.ts` (success, NOT_PUBLISHED, NOT_FOUND, STALE one-refetch-per-version, network-with-cache, 5xx retries, disabled) then implement `useDayPlan.ts`.
- [ ] T013 [P] Test-first `apps/pwa/src/features/today/hooks/__tests__/useCivilToday.test.ts` (recompute on visibility/focus/midnight timer) then implement `apps/pwa/src/features/today/hooks/useCivilToday.ts`.

**Shared stop primitives (US1 Next card and US2 list both depend on these)**

- [ ] T014 [P] Test-first `apps/pwa/src/features/day-plan/components/__tests__/StopCard.test.tsx` (variants `next`/`row`; window via `formatWallTimeRange`; ETA in `stop.timezone`; chips; body `<Link>`→`/schedule/:id`; no button-in-button; accessible name) then implement `StopCard.tsx`.
- [ ] T015 [P] Test-first for `CallContactLink` (role labels incl. OTHER, no phone → not rendered) within the StopCard suite or its own `__tests__/CallContactLink.test.tsx`; implement `apps/pwa/src/features/day-plan/components/CallContactLink.tsx`.
- [ ] T016 [P] Implement `apps/pwa/src/features/day-plan/components/NavigateButton.tsx` (`<a target=_blank rel=noopener noreferrer>`, accessible name "Navigate to {address} (opens maps)"), covered via StopCard/PropertyAddressSection tests.
- [ ] T017 [P] Implement `apps/pwa/src/features/day-plan/components/RouteWarnings.tsx` (NO_BASE/BASE_NOT_LOCATED/approximate/STALE), shared by Today and Route; covered via screen tests.

**Checkpoint**: shared contract (allowlist, helper), backend wiring, pure libs, data hook, and stop primitives exist and are green.

## Phase 3: User Story 1 — Today screen as home + navigation (Priority: P1) 🎯 MVP

**Goal**: Login lands on `/today`; bar is Today/Schedule/Offers/More (More = `/profile`); Today screen renders header, Next inspection, Coming up, unread + tomorrow cards (00.1/00.5, 01.A1 list part).

**Independent test**: Log in as an inspector with a published plan → land on `/today`, bar correct with Today active, Today renders greeting/progress/Next/ComingUp/tomorrow from the fixture.

- [ ] T018 [US1] Test-first `apps/pwa/src/app/__tests__/router.test.tsx` (`/`→`/today`, `/nada`→`/today`, profile unchanged incl. hash, `/today/route/2026-11-05`→RoutePage with date, invalid date→`/today/route` replace) then update `apps/pwa/src/app/router.tsx` (export `routes`; index/`*`→`/today`; `today` with `TodayLayout` + children `route`, `route/:date`; `profile` and children unchanged).
- [ ] T019 [US1] Test-first `apps/pwa/src/components/shell/__tests__/BottomNavBar.test.tsx` (4 items/testids, destinations, Today active on `/today/route`, More active on profile/earnings, badge on More with aria-label, 9+, none when 0/loading/error) then update `BottomNavBar.tsx` (items Today/Schedule/Offers/More, `House`/`Ellipsis` icons, badge moved to More). Keep `nav-clearance-contract.test.ts` green unchanged.
- [ ] T020 [P] [US1] Test-first `apps/pwa/src/features/profile/pages/__tests__/ProfilePage.test.tsx` (new "App settings" `MenuRow`→`/profile/settings`; other cases unchanged) then add the row to `ProfilePage.tsx`.
- [ ] T021 [P] [US1] Test-first `apps/pwa/src/features/auth/pages/__tests__/LoginPage.test.tsx` (no saved redirect → `/today`) then update `LoginPage.tsx` (`?? '/today'`).
- [ ] T022 [US1] Extract `apps/pwa/src/features/execution/components/AppointmentActionBar.tsx` from `AppointmentCard` (type `ExecutionActionTarget` + adapter `stopToActionTarget(stop, plan.date)`); update `AppointmentCard.tsx` to use it with no visible change; keep `AppointmentCard.test.tsx` green (T adjust if needed).
- [ ] T023 [US1] Implement `apps/pwa/src/features/today/components/{TodayHeader,NextInspectionCard,ComingUpList,TomorrowRouteCard,UnreadNoticesCard}.tsx` (NextInspectionCard = `StopCard variant="next"` + NavigateButton + AppointmentActionBar).
- [ ] T024 [US1] Test-first `apps/pwa/src/features/today/pages/__tests__/TodayPage.test.tsx` (all rows of the source table: loading, happy, key/meet, wait, late, call roles, in-progress, all-done, empty, no-base, base-not-located, approximate, STALE, error, offline±cache, notices, tomorrow published/not/early/empty, day rollover, check-in from card, body tap, more actions) then implement `TodayLayout.tsx` + `TodayPage.tsx`.

**Checkpoint**: US1 independently demoable — login → Today home with all states.

## Phase 4: User Story 2 — Route list, per-day base, sheet (Priority: P2)

**Goal**: `/today/route[/:date]` list with summary, legs, OriginRow/OriginSheet (per-day base), and PDF/XLSX download (01.A1 list, Base do dia, 01.A6 consumption).

**Independent test**: Navigate to `/today/route` → summary + ordered stops with legs + OriginRow + Download menu; change base → ETAs update + "(this day only)" → revert.

- [ ] T025 [P] [US2] Extract `apps/pwa/src/features/profile/components/BaseAddressFields.tsx` from `ProfileAccountPage` (structured fields taking RHF `control`); update `ProfileAccountPage.tsx` to use it with no visible change; keep its tests green.
- [ ] T026 [US2] Test-first `apps/pwa/src/features/day-plan/hooks/__tests__/useDayPlanOrigin.test.ts` (PUT/DELETE → `setQueryData` + snackbars; 422/503/404 surface server message, cache intact; double-click → 1 call) then implement `useDayPlanOrigin.ts`.
- [ ] T027 [US2] Test-first `apps/pwa/src/features/day-plan/hooks/__tests__/useRouteSheetDownload.test.ts` (blob GET, Content-Disposition filename + fallback, object URL create/revoke, 404 + offline messages) then implement `useRouteSheetDownload.ts`.
- [ ] T028 [P] [US2] Test-first `apps/pwa/src/features/day-plan/components/__tests__/OriginSheet.test.tsx` (title/subtitle, BaseAddressFields, validation, prefill, PUT, busy, server errors incl. 422 ALREADY_STARTED close-after-2s+invalidate, offline disabled, focus return, Escape) then implement `OriginRow.tsx` + `OriginSheet.tsx` (sources BASE/OVERRIDE/NONE/LAST_STOP; LAST_STOP text-only per L-F04-07).
- [ ] T029 [US2] Implement `apps/pwa/src/features/day-plan/components/{RouteSummary,RouteStopList,RouteLegRow,RouteSheetMenu}.tsx` (legs to next stop, "From start", "Same address" for 0-leg per L-F04-13).
- [ ] T030 [US2] Test-first `apps/pwa/src/features/day-plan/pages/__tests__/RoutePage.test.tsx` (all source rows: headers today/tomorrow, summary, single-duration, list order, executed, missing coords, same-address leg, violation, origin base/override/last-stop/none, sheet menu, NOT_PUBLISHED/NOT_FOUND/past/future, wide layout) then implement `RoutePage.tsx`.

**Checkpoint**: US2 independently demoable — Route list + per-day base + sheet, on top of US1.

## Phase 5: User Story 3 — Stop card detail, Navigate reuse (Priority: P2)

**Goal**: Navigate reused in the schedule detail; stop-card/call/navigate primitives (built in Foundational) verified end-to-end (01.5, 01.6, L-F04-08).

**Independent test**: Render a stop with contact + coords → "Call … (tenant)", Apple/Google href by UA, body tap → `/schedule/:id`; `PropertyAddressSection` uses `buildNavigationUrl`.

- [ ] T031 [P] [US3] Test-first update `apps/pwa/src/features/schedule/components/__tests__/PropertyAddressSection.test.tsx` (`open-maps-link` uses `buildNavigationUrl`, Apple on iOS/Google elsewhere, "Navigate to property" kept) then update `PropertyAddressSection.tsx`.
- [ ] T032 [US3] Verify StopCard/CallContactLink/NavigateButton (T014–T016) satisfy 01.5/01.6/L-F04-08 across `next` and `row` variants (add any missing assertions to the StopCard suite); no new production file expected.

**Checkpoint**: US3 covered; Navigate consistent across card and detail.

## Phase 6: User Story 4 — Route notices open Today, offline, rollover (Priority: P3)

**Goal**: Route notices deep-link `/today`; plan cached offline with privacy safeguards; civil-today rollover.

**Independent test**: allowlist accepts `/today`; push opens `/today`; SW caches only the plan GET in `api-day-plan-cache`; logout clears it; `useCivilToday` recomputes on visibility.

- [ ] T033 [US4] Test-first update `apps/pwa/src/sw/__tests__/runtime-caching.test.ts` (plan GET → NetworkFirst `api-day-plan-cache` maxEntries 3 / 12 h / timeout 10 / 200-only; sheet/writes/recalc/AM-OP excluded; existing 5 routes unchanged; `INSPECTOR_API_CACHES` contains the name) then add the route in `apps/pwa/src/sw/runtime-caching.ts`.
- [ ] T034 [US4] Test-first update `apps/pwa/src/hooks/__tests__/useAuth.test.tsx` (logout deletes `api-day-plan-cache`) then add the name to `INSPECTOR_API_CACHES` in `useAuth.tsx`.
- [ ] T035 [US4] Test-first update `apps/pwa/src/sw/__tests__/push-handlers.test.ts` (`/today` → opens `/today?fromNotice=<id>`; other cases/fallback unchanged) then update `push-handlers.ts` `resolveClickTarget`.
- [ ] T036 [US4] Test-first update `useExecutionActions.test.ts`, `useOfflineQueue.test.ts`, `useReportCantDo.test.ts`, `useReportLateNotice.test.ts`, and `PwaLayout.test.tsx` to assert `dayPlanKeys.all` invalidation; then wire the invalidation into `useExecutionActions.ts`, `useOfflineQueue.ts`, `useReportCantDo.ts`, `useReportLateNotice.ts`, and the SW `inspector-notice:received` listener in `PwaLayout.tsx`.

**Checkpoint**: US4 covered; notices/offline/rollover robust.

## Phase 7: Polish & Cross-Cutting

- [ ] T037 Update `apps/pwa/CLAUDE.md`: new route structure (`/today`, `/today/route[/:date]`, More→`/profile`), `api-day-plan-cache` + logout cleanup in the caching section, and remove the "from F04" transition clause of rule N10 (X00 L-X00-04). Verify `grep -n "from F04" apps/pwa/CLAUDE.md` empty and `grep -n "api-day-plan-cache" apps/pwa/CLAUDE.md` ≥ 1.
- [ ] T038 Replace the two raw auto-generated lines appended to root `CLAUDE.md` "Active Technologies" with a single curated F04-3 entry matching the F04-2 style; add a one-line F04-3 entry to "Recent Changes" if appropriate.
- [ ] T039 Run the full verification suite (quickstart.md) inside the worktree via a subagent returning a condensed summary: shared build+test, pwa lint/typecheck/test/build/check:ds, backend day-plan + inspector-notice tests; confirm `TZ=America/Los_Angeles` pass for TZ-dependent suites.
- [ ] T040 Confirm `git diff --stat origin/develop... | tail -1` ≤ 150 files; fill the QA Q1–Q16 checklist in the PR body (no screenshots committed).

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T017)** block everything.
- **US1 (T018–T024)** depends on Foundational (StopCard, useDayPlan, libs). MVP.
- **US2 (T025–T030)** depends on Foundational + US1 routing (`/today/route`).
- **US3 (T031–T032)** depends on Foundational StopCard/navigation; can run parallel to US2.
- **US4 (T033–T036)** depends on Foundational (keys/hook) + US1 (PwaLayout, router); invalidation targets the hooks from F03.
- **Polish (T037–T040)** last.

## Parallel Opportunities

- Foundational `[P]`: T003, T004, T005, T006, T007, T008, T009 run together (distinct files); then T011, T013, T014, T015, T016, T017 after T010/T012 land their shared edits.
- US1 `[P]`: T020, T021 parallel; T018/T019/T022/T023/T024 are sequential around router + screen.
- US2 `[P]`: T025, T028 parallel with T026/T027 hooks; T029/T030 after.
- US3 `[P]`: T031 parallel with US2.

## Implementation Strategy

MVP = Phase 1 + 2 + US1 (Today home + navigation) — independently shippable and demoable. Then layer US2 (Route/base/sheet), US3 (Navigate reuse), US4 (notices/offline), then Polish. Each story ends at a green checkpoint.
