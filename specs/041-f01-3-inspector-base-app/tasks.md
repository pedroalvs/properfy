# Tasks: Inspector base address, banner, heartbeat & push slot (PWA)

**Feature**: `041-f01-3-inspector-base-app` | **Branch**: `041-f01-3-inspector-base-app`
**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [research.md](./research.md)

**TDD is mandatory** (constitution III; spec SC-005). Each user story writes its unit tests first (red), then implements to green. All paths are relative to repo root. `[P]` = parallelizable (different files, no incomplete dependency).

## Phase 1: Setup

- [x] T001 Verify baseline is green in the worktree: `pnpm --filter @properfy/shared build && pnpm --filter @properfy/frontend-standards build && pnpm --filter pwa typecheck && pnpm --filter pwa lint` (shared `dist/` must exist before PWA typecheck — exports `inspectorBaseAddressSchema` + `AU_STATES` from TASK-F01-1).
- [x] T002 Confirm no API contract drift is expected: `pnpm generate:api` then `git diff --stat packages/shared/openapi.json packages/shared/src/api-types.ts` must be empty (this slice changes no route schema; FR-026).

## Phase 2: Foundational (blocking prerequisites)

**App version plumbing (FR-019, FR-020) — blocks US3 and US4.**

- [x] T003 Write unit test `apps/pwa/src/app/__tests__/appVersion.test.ts`: `buildAppVersion('0.1.0','ab12cd3ef')==='0.1.0+ab12cd3'`, `buildAppVersion('0.1.0',undefined)==='0.1.0+dev'`, result ≤ 40 chars. (red)
- [x] T004 Create `apps/pwa/src/lib/app-version.ts` exporting pure `buildAppVersion(pkgVersion: string, sha?: string): string` = `` `${pkgVersion}+${(sha ?? 'dev').slice(0,7)}` `` to pass T003. (green)
- [x] T005 Wire `__APP_VERSION__`: in `apps/pwa/vite.config.ts` add `define: { __APP_VERSION__: JSON.stringify(buildAppVersion(pkg.version, process.env.APP_BUILD_SHA)) }` (read `pkg.version` via `readFileSync` of `apps/pwa/package.json`); add `declare const __APP_VERSION__: string;` to `apps/pwa/src/vite-env.d.ts`; ensure the same `define` applies to the Vitest config (shared config, or replicate in the separate `vitest.config` if present). Do NOT use a `VITE_` prefix (value stays out of `import.meta.env`).
- [x] T006 Add `APP_BUILD_SHA: ${{ github.sha }}` to the `env` of the three PWA "Build" steps in `.github/workflows/frontend-deploy.yml` (dev/staging/prod; inert for the web app).

**Shared read type (FR-024) — blocks US1 and US2.**

- [x] T007 Extend `apps/pwa/src/features/profile/hooks/useInspectorMe.ts` type to include `address: unknown | null`, `baseLat: number | null`, `baseLng: number | null`, `baseGeocodedAt: string | null` (the endpoint has no response schema; type what the use case returns — A-8). No behavior change to the query.

## Phase 3: User Story 1 — Inspector sets and edits their base address (P1)

**Goal**: Editable, validated Base address card on `/profile/account` that saves via `PATCH /v1/inspectors/me` and surfaces success/geocode-failed/error states.
**Independent test**: Render `ProfileAccountPage` with/without a saved base and assert pre-fill, validation, payload shape, and result states.

- [x] T008 [US1] Extend `apps/pwa/src/features/profile/hooks/useUpdateInspectorSelf.ts`: accept `address` in the mutation input, invalidate `['inspector']`, propagate the API error message, and return `baseGeocodeFailed` from the response (FR-024).
- [x] T009 [P] [US1] Write `apps/pwa/src/features/profile/hooks/__tests__/useUpdateInspectorSelf.test.ts`: sends `address`; invalidates `['inspector']`; propagates API message; returns `baseGeocodeFailed`. (red)
- [x] T010 [US1] Write `apps/pwa/src/features/profile/pages/__tests__/ProfileAccountPage.test.tsx` covering all spec rows: pre-fill with valid base; "Street is required" (and PATCH not sent); "Postcode must be 4 digits"; whitespace-only Street → required; legacy `state:'New South Wales'` and `{foo:1}` → empty + "Your saved address is incomplete. Please enter it again."; 400 `details` mapped to State; payload `{address:{…,city:suburb,country:'AU'}}` with no lat/lng; "Saved successfully" in `role=status`; `baseGeocodeFailed` warning text; `#base-address` focuses first empty field; load error → "Couldn't load your address." + Retry. (red)
- [x] T011 [US1] Implement the "Base address" card inline in `apps/pwa/src/features/profile/pages/ProfileAccountPage.tsx` (`id="base-address"`, after Phone+Timezone, before Security) using react-hook-form + `inspectorBaseAddressSchema` + `AU_STATES` from `@properfy/shared`: fields Street/Number/Unit(`complement`)/Suburb/State(select)/Postcode(numeric)/hidden Country `'AU'`; `city` derived from `suburb`; dirty-gated "Save address"; states saving/success/geocode-failed/error/loading-skeleton/load-error; a11y (visible labels, `aria-describedby`, `role=status`, ≥44px targets, hash scroll+focus). Make T009/T010 green. (green)

## Phase 4: User Story 2 — Inspector is prompted to add or fix a missing base (P1)

**Goal**: Fixed, non-dismissable `BaseAddressBanner` (two variants) on `/schedule` and `/profile`.
**Independent test**: Render the banner against the four `useInspectorMe` states and assert text/visibility.

- [x] T012 [P] [US2] Write `apps/pwa/src/components/feedback/__tests__/BaseAddressBanner.test.tsx`: `address:null,baseLat:null` → variant 1 + link `/profile/account#base-address`; `address:{…},baseLat:null` → variant 2; `baseLat` set → nothing; loading/error → nothing; no dismiss control; `role=status`. (red)
- [x] T013 [US2] Create `apps/pwa/src/components/feedback/BaseAddressBanner.tsx` (shared `components/` layer — not `features/profile/`, so the schedule home can mount it without a cross-feature import) reading `useInspectorMe`: render only when loaded AND `baseLat == null`; variant by `address == null`; exact texts/links per FR-010; `warning` token + pin icon, AA contrast, `role=status`, non-dismissable. Make T012 green. (green)
- [x] T014 [US2] Mount the banner in `apps/pwa/src/features/profile/pages/ProfilePage.tsx` (top of grid) and add/extend `apps/pwa/src/features/profile/pages/__tests__/ProfilePage.test.tsx` to assert it renders when `baseLat` is null.
- [x] T015 [US2] Mount the banner in `apps/pwa/src/features/schedule/pages/SchedulePage.tsx` below the TopBar and above the install banners (non-sticky, must not break wide-layout per-pane scroll) and write `apps/pwa/src/features/schedule/pages/__tests__/SchedulePage.banner.test.tsx` asserting placement and that the schedule stays interactive.

## Phase 5: User Story 3 — App reports adoption via heartbeat (P2) + US5 E2E baseline (P1)

**Goal**: Throttled `useAppStateHeartbeat` from `PwaLayout`, plus the E2E baseline stub so the gate stays green.
**Independent test**: Drive the hook with injected storage/API and fake timers; run the E2E suite.

- [x] T016 [US3] Export `getIsStandalone()` from `apps/pwa/src/app/useInstallPrompt.tsx` (no behavior change) and update `apps/pwa/src/app/__tests__/useInstallPrompt.test.tsx` to assert the export preserves `matchMedia`/`navigator.standalone` behavior.
- [x] T017 [US3] Write `apps/pwa/src/app/__tests__/useAppStateHeartbeat.test.tsx` (injected storage + API, fake timers) covering all spec rows: first send; 1 h throttle no-send; 6 h+1ms send; mode-change immediate send; visibility after 7 h send; network error → no storage write + retry; 429 → storage written; `unsupported` when no `Notification`; broken storage → ≤1 POST/load no exception; logout → next mount sends; shared-storage mode toggle → 3 POSTs. (red)
- [x] T018 [US3] Create `apps/pwa/src/app/useAppStateHeartbeat.ts`: triggers on mount + `visibilitychange`→visible; throttle via injected `localStorage` key `properfy.pwa.appStateHeartbeat = {at,displayMode}` (write on 204 and 429 only); send when `now-at≥6h` OR `displayMode` differs; payload `{displayMode: getIsStandalone()?'standalone':'browser', pushPermission: !('Notification' in window)?'unsupported':Notification.permission, appVersion: __APP_VERSION__}`; try/catch all storage; silent errors (`console.debug` dev only). Make T017 green. (green)
- [x] T019 [US3] Call `useAppStateHeartbeat()` from `apps/pwa/src/components/shell/PwaLayout.tsx` (authenticated inspector only) and update `apps/pwa/src/components/shell/__tests__/PwaLayout.test.tsx` to assert it is invoked once per mount.
- [x] T020 [US3] Clear the throttle key `properfy.pwa.appStateHeartbeat` on logout in `apps/pwa/src/lib/auth-storage.ts`.
- [x] T021 [US5] Add `{ path: '/v1/inspectors/me/app-state', body: null, status: 204 }` to `BASELINE_STUBS` in `apps/pwa/tests/e2e/support/auth.ts`; update the handoff comment at `auth.ts:14` to note the heartbeat has joined the baseline. Confirm `support/api.ts` `stubJson` serves a 204 with an empty body (adjust only if needed to honor the `status` override for a null body).

## Phase 6: User Story 4 — App settings slot + version footer (P3)

**Goal**: `/profile/settings` ordered slot → `InstallAppCard` → version footer.
**Independent test**: Render `/profile/settings` and assert DOM order and footer text.

- [x] T022 [US4] Write/extend `apps/pwa/src/features/profile/pages/__tests__/ProfileSettingsPage.test.tsx`: empty `[data-testid="push-preference-slot"]` is the first content child; DOM order slot → `InstallAppCard` → footer (`compareDocumentPosition`); footer reads `Properfy Inspector v{__APP_VERSION__}`; `InstallAppCard` present. (red)
- [x] T023 [US4] Update `apps/pwa/src/features/profile/pages/ProfileSettingsPage.tsx`: insert empty `<div data-testid="push-preference-slot" />` as first content child, keep `InstallAppCard` second, replace the fixed "v1.0" with footer `Properfy Inspector v{__APP_VERSION__}` last. Make T022 green. (green)

## Phase 7: Polish & cross-cutting

- [x] T024 Update `apps/pwa/CLAUDE.md` for the new routes/components/hooks/conventions: Base address card on `/profile/account`, `BaseAddressBanner`, `useAppStateHeartbeat` + throttle key, `__APP_VERSION__`/`buildAppVersion`, push-preference slot, and the `BASELINE_STUBS` addition (project rule §13.11). Confirm root `CLAUDE.md` Active Technologies entry is present and accurate.
- [ ] T025 Run the full PWA gate in the worktree (via subagent, condensed summary): `pnpm --filter @properfy/shared build && pnpm --filter @properfy/frontend-standards build && pnpm --filter pwa lint && pnpm --filter pwa typecheck && pnpm --filter pwa test && pnpm --filter pwa exec playwright test`. All green (E2E on Chromium + WebKit).
- [ ] T026 Manual smoke per [quickstart.md](./quickstart.md) 6 steps (iOS simulator + Android/installed + web); attach evidence to the PR (screenshots never committed).

## Dependencies & execution order

- **Setup (T001–T002)** → **Foundational (T003–T007)** → user stories.
- **US1 (T008–T011)**: needs T007 (useInspectorMe type). T009/T010 before T011 (TDD).
- **US2 (T012–T015)**: needs T007. Independent of US1 (both read `useInspectorMe`), can run in parallel with US1 after T007.
- **US3+US5 (T016–T021)**: needs T004/T005 (`__APP_VERSION__`). T017 before T018. T021 must land with T019 (once the heartbeat fires from `PwaLayout`, the E2E gate needs the stub).
- **US4 (T022–T023)**: needs T004/T005 (`__APP_VERSION__`). Independent of US1–US3.
- **Polish (T024–T026)**: after all stories.

### Parallel opportunities

- T003 and T007 are independent (`[P]`-eligible across the two foundational tracks).
- After T007: US1 and US2 test-writing (T009, T010, T012) can proceed in parallel (different files).
- After T005: US4 (T022) can proceed in parallel with US1/US2.

## MVP scope

US1 + US2 + US5 (the P1 stories: a working, validated base address, the banner that drives adoption, and a green E2E gate) form the minimum viable increment. US3 (adoption telemetry, P2) and US4 (settings slot/footer, P3) follow. All ship in one PR (1 task = 1 PR; the whole F01-3 is one PR).

## Format validation

All 26 tasks use `- [ ] Tnnn [P?] [US?] description + file path`; Setup/Foundational/Polish carry no story label; user-story tasks carry `[US1]`/`[US2]`/`[US3]`/`[US4]`/`[US5]`.
