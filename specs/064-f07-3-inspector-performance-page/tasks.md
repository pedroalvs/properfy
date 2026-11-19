# Tasks: Inspector Performance Web Page & Reliability Index Settings

**Input**: Design documents from `/specs/064-f07-3-inspector-performance-page/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/{http,ui-components}.md, quickstart.md

**Tests**: TDD is mandatory (Constitution III + project CLAUDE.md §11). Every component/hook/lib is written test-first.

**Branch**: `064-f07-3-inspector-performance-page` (worktree, off `origin/develop` @ c3d78505). All paths below are under `apps/web/src/` unless noted.

**Shared-file coordination (keep-all; F10-2 runs in parallel on lane D):** `components/shell/Sidebar.tsx` and the root `CLAUDE.md` are append-only; whoever merges second rebases. `app/router.tsx`, `features/platform-settings/pages/PlatformSettingsPage.tsx`, and `features/appointments/components/StatusTransitionDialog.tsx` are minimal edits. **No** `api-types.ts`/schema/migration change.

---

## Phase 1: Setup & pure libs

- [ ] T001 [P] Create the feature folder skeleton `features/inspector-performance/{pages,components,hooks,lib,__fixtures__}/` (empty index-less dirs created by the first file in each).
- [ ] T002 [P] Create `features/inspector-performance/__fixtures__/reliability.ts` with the worked-example ranking + detail fixtures (Eva 100, Fábio 97.5, Dan 89.0, Ana 88.3, Ben 79.0; Carla 9; `volumeReference 9.5`), in **both** the enveloped `{ data }` shape (for hook mocks) and the inner shape; add `reliability.fixtures.test.ts` asserting `reliabilityRankingResponseSchema.parse(...)` / `inspectorReliabilityResponseSchema.parse(...)` on the inner shapes.
- [ ] T003 [P] Write `lib/format-metric.test.ts` (TDD) covering: `metricLabel`/`metricDescription` for all 8 keys (UI copy), `formatMetricValue` per metric (percentage, "{s} of {e} unit", satisfation "4.25 / 5 · 4 ratings" + "Not enough ratings · n of m needed", volume median/override/pro-rata, null → per-metric "No data"), `formatScore` (one decimal incl. "100.0"), `formatReliabilityDate` ("1 Nov 2026") and `formatReliabilityDateRange` ("1 Nov – 30 Nov 2026").
- [ ] T004 Implement `lib/format-metric.ts` to pass T003 (pure; fixed month-abbrev array, no `Intl`; types from `@properfy/shared`).
- [ ] T005 [P] Write `lib/freshness.test.ts` (TDD) covering the stale gate (`isStale` + Sydney wall-clock ≥ 05:00 only; TZ pinned away from Sydney, injected `now`) and the recompute gate (`settingsUpdatedAt > computedAt`, <15 min vs ≥15 min, none when up to date), including both-active.
- [ ] T006 Implement `lib/freshness.ts` (pure, clock-injectable) to pass T005.

## Phase 2: Foundational (shared hooks + banners — blocks US1/US2; delivers US5 banners)

- [ ] T007 [P] Write `hooks/useReliabilityRanking.test.tsx` — queryKey `['reliability','ranking']`, `api.GET('/v1/dashboard/inspector-performance')`, throws on error, unwraps `data?.data`.
- [ ] T008 Implement `hooks/useReliabilityRanking.ts` to pass T007.
- [ ] T009 [P] Write `hooks/useInspectorReliability.test.tsx` — queryKey `['reliability','inspector', id]`, path param, `enabled: !!id`, 400/404 surfaced.
- [ ] T010 Implement `hooks/useInspectorReliability.ts` to pass T009.
- [ ] T011 Write `components/FreshnessBanners.test.tsx` — stale and recompute banner copy + `role="status"` + `variant="warning"`, driven by `lib/freshness` with an injected `now` (covers L-F07-02 / L-F07-10 → US5).
- [ ] T012 Implement `components/FreshnessBanners.tsx` (consumes `lib/freshness`, renders `InfoBanner variant="warning"`) to pass T011.

## Phase 3 — User Story 1: AM/OP reads the reliability ranking (03.11, P1)

**Goal**: The page renders the ranking, the "Not enough data" block, header/subtitle, fixed info banner, and all states.
**Independent test**: Render the page as AM with the fixtures via `createMemoryRouter` → five ordered rows + Carla in "Not enough data".

- [ ] T013 [P] [US1] Write `components/RankingTable.test.tsx` — columns Rank/Inspector/Score/Services; one-decimal scores incl. "100.0"; ties keep server positions (2,2,4); focusable Inspector-cell control `aria-label "Open {name} details"`; empty-rows message; long-name `title`.
- [ ] T014 [US1] Implement `components/RankingTable.tsx` (DataTable; `onRowClick` + focusable cell control; `aria-hidden` score bar; hideOnMobile Services; visually-hidden region label) to pass T013.
- [ ] T015 [P] [US1] Write `components/NotEnoughDataList.test.tsx` — hidden when empty; INSUFFICIENT_VOLUME "{name} · {volume} of {minimumVolume} services"; NO_WEIGHTED_DATA "{name} · No data for the weighted metrics"; items open the drawer.
- [ ] T016 [US1] Implement `components/NotEnoughDataList.tsx` to pass T015.
- [ ] T017 [US1] Write `pages/InspectorPerformancePage.test.tsx` — loading/error(+retry)/empty(snapshotDate null); ranking subtitle "Last 30 days · 1 Nov – 30 Nov 2026 · Updated 1 Dec 2026, 4:15 am"; fixed info banner; "Configure weights" → `/platform-settings#reliability-index` (AM & OP); only-"Not enough data" message; empty block hidden; **freshness cases (US5)**: stale banner at 09:00 but not 04:30, recompute <15/≥15 min, none when up to date.
- [ ] T018 [US1] Implement `pages/InspectorPerformancePage.tsx` (compose PageHeader + InfoBanner + FreshnessBanners + RankingTable + NotEnoughDataList + state ladder) to pass T017.

**Checkpoint**: US1 page renders independently (drawer wired in US2).

## Phase 4 — User Story 2: AM/OP opens the inspector metric drawer (03.12, P1)

**Goal**: A deep-linkable, keyboard-accessible drawer shows the 8 metrics, failures, tooltips, and status variants.
**Independent test**: Click Ana's row → `?inspector=<id>`, drawer `aria-label "Ana Costa reliability details"`, "88.3 / Rank 4 of 5 / 12 services", 8 metric rows.

- [ ] T019 [P] [US2] Write `components/MetricRow.test.tsx` — rate value copy; satisfaction; volume (median/override/pro-rata); null metric "No data"; weight 0 "Not weighted"; weighted-minutes tooltip present except SATISFACTION/VOLUME; "Not enough ratings" case.
- [ ] T020 [US2] Implement `components/MetricRow.tsx` (uses `format-metric`, `Tooltip`, embeds `MetricFailures`) to pass T019.
- [ ] T021 [P] [US2] Write `components/MetricFailures.test.tsx` — no button when `failureCount 0`; "Show {n} issues" (`aria-expanded`) expands "{serviceDate} · {detail}" + "Open appointment" → `/appointments/:id`; ">20" cap note.
- [ ] T022 [US2] Implement `components/MetricFailures.tsx` to pass T021.
- [ ] T023 [US2] Write `components/ReliabilityDrawer.test.tsx` — loading skeleton; error + retry; not-found (unknown id); SCORED header + 8 ordered rows; INSUFFICIENT_VOLUME / NO_WEIGHTED_DATA / NOT_COMPUTED variants; INACTIVE badge; footer; stale banner at top (US5); no-show failure copy.
- [ ] T024 [US2] Implement `components/ReliabilityDrawer.tsx` (DrawerPanel + DrawerHeader + FreshnessBanners + header + MetricRows + footer) to pass T023.
- [ ] T025 [US2] Wire the drawer into `pages/InspectorPerformancePage.tsx` — `?inspector=` deep link, open on row/keyboard activation, close via Close/Escape/backdrop clearing the param, and **feature-owned focus restore** to the originating control; extend `InspectorPerformancePage.test.tsx` (open/deep-link/keyboard/Escape-focus-return cases).

**Checkpoint**: One page delivers 03.11 + 03.12.

## Phase 5 — User Story 3: AM/OP configures the reliability weights (03.A1, P1)

**Goal**: The "Reliability index" section edits the 11 fields and saves, triggering the recompute.
**Independent test**: Render the section with the setting mocked → 11 fields; change a weight + Save → full-object `PUT` + success snackbar + `['reliability']` invalidation.

- [ ] T026 [US3] Write `features/platform-settings/components/ReliabilityIndexSection.test.tsx` — loads 11 fields; validation messages (weight 0–10, all-zero, min volume 1–200, override 1–1000/empty→null, min ratings 1–50); OP can save (L-F07-11); save → PUT + snackbar "Reliability settings saved. Scores are being recalculated." + invalidate `['reliability']`; 422/400 → field/banner; Save disabled when clean/submitting.
- [ ] T027 [US3] Implement `features/platform-settings/components/ReliabilityIndexSection.tsx` (mirror `RouteWeightsSettingsSection`; anchor `id="reliability-index"`; add `['reliability']` invalidation) to pass T026.
- [ ] T028 [US3] Wire the section into `features/platform-settings/pages/PlatformSettingsPage.tsx` (append `<ReliabilityIndexSection onDirtyChange=... />`, OR its dirty flag into the page guard).

## Phase 6 — User Story 4: Origin-scoped rejection reasons in the dialog (L-F07-01/04, P1)

**Goal**: The dialog offers the two new codes only on the right transitions, with hints, honouring server 422.
**Independent test**: `SCHEDULED → REJECTED` as OP offers "Inspector didn't attend" (not "Inspection was not actually carried out"); selecting it shows the hint and submits `INSPECTOR_NO_SHOW`.

- [ ] T029 [US4] Extend `features/appointments/components/StatusTransitionDialog.test.tsx` — SCHEDULED offers INSPECTOR_NO_SHOW only; DONE offers NOT_EXECUTED only; DRAFT/AWAITING_INSPECTOR neither; per-code hints; `422 REJECTION_CODE_NOT_ALLOWED` shown without closing.
- [ ] T030 [US4] Edit `features/appointments/components/StatusTransitionDialog.tsx` — replace fixed `REJECTION_OPTIONS` with `allowedRejectionCodesFrom(currentStatus)` + `reasonCodeLabel` (keep `SYSTEM_ONLY_REJECTION_CODES` filter); add the two hints; surface the 422.

## Phase 7 — User Story 6: Only AM/OP reach the page and menu (D4, P1)

**Goal**: Menu item + guarded route for AM/OP only, canonical X01 order.
**Independent test**: Real `Sidebar.roles.test.tsx` shows the item for AM/OP, hidden for CL/INSP; `/inspector-performance` as CL_ADMIN redirects to `/dashboard` (shared `AuthGuard` behaviour).

- [ ] T031 [US6] Extend `components/shell/Sidebar.roles.test.tsx` (real submenu, no `SidebarSubmenu`/`SidebarItem` mocks, `MemoryRouter`) — "Inspector performance" `menuitem` href `/inspector-performance` for AM & OP, absent for CL_ADMIN/CL_USER/INSP, relative order after "Workload" (by label); and `Sidebar.test.tsx` — `filterNavItems(NAV_ITEMS,'OP')` contains it, `'CL_ADMIN'` does not.
- [ ] T032 [US6] Edit `components/shell/Sidebar.tsx` — add Dashboard submenu child `{ icon: 'mdi-podium', label: 'Inspector performance', to: '/inspector-performance', roles: [AM, OP] }` after "Workload" (append; keep-all).
- [ ] T033 [US6] Add `features/inspector-performance/inspector-performance-route-guard.test.tsx` (mirrors the live-day guard test) — AM/OP render the page; CL_ADMIN/CL_USER/INSP redirect to `/dashboard` via the shared `AuthGuard`.
- [ ] T034 [US6] Edit `app/router.tsx` — add `const InspectorPerformancePage = Loadable(lazyRetry(...))` and the `{ path: 'inspector-performance', element: <AuthGuard roles={[AM, OP]}>… }` route.

## Phase 8: Polish & cross-cutting

- [ ] T035 Update `apps/web/CLAUDE.md` — document the new Dashboard page, the `?inspector=` deep link, and the "Reliability index" settings section.
- [ ] T036 Run gates in the worktree (via subagent, condensed report): `pnpm --filter @properfy/shared build`; `pnpm --filter web typecheck` (clean cache), `lint` (zero warnings), `test`. Confirm `git diff --stat origin/develop... | tail -1` < 150 and no change to `api-types.ts`/schema/migrations.
- [ ] T037 Browser QA against local backend (AM + OP + CL_ADMIN-denied) across all states and the 03.A1 end-to-end (Ana 88.3 → 87.3 with `PUNCTUALITY: 3`); screenshots never committed.

---

## Dependencies & order

- **Phase 1 → Phase 2 → Phases 3–7 → Phase 8.** Within a phase, test task precedes its impl task (same file ⇒ not `[P]`).
- US1 (page) depends on Foundational (hooks, FreshnessBanners) + `format-metric`. US2 (drawer) depends on US1 page (for the `?inspector=` wiring in T025) + Foundational. US6 route (T034) imports the US1 page component. US3 and US4 are independent of US1/US2 and of each other.
- **US5 (freshness)** is delivered by Foundational T011/T012 and verified in US1 (T017) and US2 (T023) banner cases.

## Parallel opportunities

- T001–T003/T005 (`[P]`) and T007/T009 (`[P]`) can start together (distinct files).
- T013/T015 (`[P]`), T019/T021 (`[P]`) parallel within their stories.
- After US1/US2 land, US3 (T026–T028) and US4 (T029–T030) and US6 (T031–T034) can proceed in parallel (distinct files).

## MVP

US1 (ranking page) + US6 (guard) is the minimum that satisfies 03.11 and the D4 privacy rule; US2 completes 03.12 and US3 completes 03.A1 — all three ship in this one PR.

## Format validation

All tasks use `- [ ] [ID] [P?] [Story?] description + file path`; Setup/Foundational/Polish carry no story label; US phases carry `[US#]`.
