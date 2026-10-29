# Tasks: Recover the PWA Playwright E2E suite and add a real CI job

**Feature**: `036-x03-pwa-e2e-recovery` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

All paths are relative to the repo root (`apps/pwa/…`, `.github/…`). TDD is mandatory: fixture and
harness-behavior tests (T1–T11 in spec V7) are written **red first**, then made green. No change to
`apps/pwa/src/` beyond a new `data-testid` where no accessible selector exists (A-03).

---

## Phase 1: Setup

- [ ] T001 Confirm the worktree is built: `pnpm install`, `pnpm --filter @properfy/shared build`, `pnpm --filter @properfy/frontend-standards build`, and `pnpm --filter pwa exec playwright install chromium webkit` all succeed (prereq for every later task).

## Phase 2: Foundational (blocks all user stories)

- [ ] T002 Record the diagnosis evidence (H1 confirmed; dev-server probe 500→200 text, reproduce command) in `specs/036-x03-pwa-e2e-recovery/research.md` and carry it into the PR body (SC-006, SC-012).
- [ ] T003 Create `apps/pwa/tests/e2e/support/global-setup.ts`: throw the "Build workspace packages first: …" error when `packages/shared/dist/index.js` or `packages/frontend-standards/dist/index.js` is missing (path relative to `__dirname`); do not build (FR-001).
- [ ] T004 Rewrite `apps/pwa/playwright.config.ts`: `globalSetup`; `const PORT = Number(process.env.PWA_E2E_PORT ?? 5175)`, `baseURL` + `webServer.url` (`/login`) on PORT; `webServer.command: \`pnpm exec vite --port ${PORT} --strictPort\``, `reuseExistingServer: false`, `timeout: 120_000`, `env: { VITE_API_BASE_URL:'http://localhost:3000', VITE_MAPBOX_TOKEN:'' }`; CI reporters `[list, html{open:never}, json{outputFile:'test-results/e2e.json'}]` (non-CI: html only); `failOnFlakyTests: !!process.env.CI`; `use`: `trace:'on-first-retry'`, `screenshot:'only-on-failure'`, `video:'off'`, `serviceWorkers:'block'`, `timezoneId:'Australia/Sydney'`, `locale:'en-AU'`; keep 4 projects, `fullyParallel`, `forbidOnly`, CI `retries:2`/`workers:1` (FR-002, FR-003, FR-004).
- [ ] T005 Prove T7: with `playwright.config.ts` + `global-setup.ts` in place, `mv packages/frontend-standards/dist /tmp/fs-dist; pnpm --filter pwa test:e2e; echo "exit=$?"` fails < 10 s with the build message (no `login-form` timeout); restore the dist (FR-001, SC-005).

---

## Phase 3: User Story 1 — Clean worktree runs green & hermetic (P1) 🎯 MVP

**Goal**: 56/56 green, hermetic, deterministic in a clean worktree.
**Independent test**: `pnpm --filter pwa test:e2e` exit 0, and `--repeat-each=3 --retries=0` exit 0, no outbound network.

### Tests first (red)

- [ ] T006 [P] [US1] Write `apps/pwa/src/__tests__/e2e-fixtures.test.ts` (T1–T5): `schema.strict().parse` per fixture from `../../tests/e2e/support/fixtures`; T1 legacy `INSPECTOR_ME` throws; T3 extra top-level key → `unrecognized_keys`; T4 `LOGIN_401` local error schema, `code==='AUTH_INVALID_CREDENTIALS'`; comment the Zod-3 nested-key limitation. Red first (fixtures not yet created) (FR-007, SC-009).

### Harness helpers (green)

- [ ] T007 [US1] Create `apps/pwa/tests/e2e/support/fixtures.ts` (pure, no `@playwright/test` import): all fixtures in [data-model.md](./data-model.md) with valid uuids, civil dates, ISO instants, `timezone:'Australia/Sydney'`; run T006 green (FR-007).
- [ ] T008 [US1] Create `apps/pwa/tests/e2e/support/api.ts`: `API`, `stubJson`, `blockUnmockedApi` (origin-scoped 501 `E2E_UNMOCKED` + `console.warn`, registered first, never `**/v1/**`), `blockExternal` (FR-005).
- [ ] T009 [US1] Create `apps/pwa/tests/e2e/support/auth.ts`: `loginAsInspector` (tokens via `addInitScript`; baseline → `blockUnmockedApi` then `BASELINE_STUBS`), `BASELINE_STUBS` (`GET /v1/me`→`INSPECTOR_ME`, `POST /v1/inspectors/me/app-state`→204, `GET /v1/inspectors/me`→`INSPECTOR_PROFILE` if called), re-export `INSPECTOR_ME` (FR-006).
- [ ] T010 [P] [US1] Create `apps/pwa/tests/e2e/support/projects.ts`: `WIDE_PROJECTS`, `isWideProject`, `isWebKitProject`, `skipOnWide(reason)`, `skipOnPhone(reason)` (non-empty reason) (FR-008).
- [ ] T011 [P] [US1] Create `apps/pwa/tests/e2e/support/idb.ts`: `seedExecutionState` (awaited `openDB` on `/login`, write `execution-states` `phase:'FINISHING'`), extracted from the current `execution-finish.spec.ts` helper (FR-009).

### Spec migration (green)

- [ ] T012 [US1] Migrate `apps/pwa/tests/e2e/auth.spec.ts`: add `blockUnmockedApi`; mock `POST /v1/auth/login`→401 `LOGIN_401` and assert exact `login-error` text "Invalid email or password." (T6). Keep redirect + login-form tests (FR-005, FR-011, FR-012).
- [ ] T013 [US1] Migrate `apps/pwa/tests/e2e/schedule.spec.ts`: replace the dead `/v1/inspector/schedule/range` stub with `/v1/inspector/schedule/month` (`{ data }` envelope); compute "today" via `Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney'})`; `skipOnWide` the bottom-nav test only if the wide layout drops it (verify first) (FR-008, edge: timezone).
- [ ] T014 [US1] Migrate `apps/pwa/tests/e2e/marketplace.spec.ts`: drop the dead `/range` stub; `loginAsInspector` + `stubJson` offers (`{ data, pagination }`) and detail; for the group-detail test, anchor on content present in both layouts, gated by `isWideProject(testInfo)` (two-pane/Direction D drift); `getByText(...).first()` for the empty state if both layouts render it (FR-005, FR-008).
- [ ] T015 [US1] Migrate `apps/pwa/tests/e2e/execution-finish.spec.ts`: replace `page.route('**/v1/**',…)` with `blockUnmockedApi`; tokens via `loginAsInspector`; IndexedDB via `seedExecutionState`; keep geolocation `addInitScript`; use Sydney "today/yesterday" dates; keep `finishCalls()` counter (FR-005, FR-009, FR-012).
- [ ] T016 [US1] Prove T8 (baseline not 501), T11 (`execution-finish.spec.ts --repeat-each=5 --retries=0 --project="Mobile Safari"` 20/20), and the diagnosis exit criterion T (`auth.spec.ts` 3/3 on `Mobile Chrome` + `Mobile Safari`, `--retries=0`) (SC-012).
- [ ] T017 [US1] Local green: `pnpm --filter pwa test:e2e` exit 0 (4 projects); `--repeat-each=3 --retries=0` exit 0; `TZ=UTC pnpm --filter pwa test:e2e` exit 0 (host-independence) (SC-001, edge: timezone).

**Checkpoint**: US1 complete — suite green, hermetic, deterministic locally.

---

## Phase 4: User Story 2 — CI runs the suite as a real deploy gate (P1)

**Goal**: `test-pwa-e2e` job that is green normally and provably red on a broken assertion / flake.
**Independent test**: a deliberately broken assertion → job `failure` + artifact; revert → green.

- [ ] T018 [US2] Add the `test-pwa-e2e` job to `.github/workflows/ci.yml` after `test-web-e2e`: `./.github/actions/setup` with both builds; cache `~/.cache/ms-playwright` key `playwright-pwa-…`; `playwright install --with-deps chromium webkit`; `pnpm --filter pwa test:e2e`; upload `apps/pwa/playwright-report/` + `apps/pwa/test-results/` on failure; `continue-on-error: ${{ vars.PWA_E2E_ADVISORY == 'true' }}` (FR-010, SC-002).
- [ ] T019 [P] [US2] Ensure `.gitignore` ignores `apps/pwa/playwright-report/` and `apps/pwa/test-results/` (`git check-ignore -v`); add if missing.
- [ ] T020 [US2] Prove T9 (flake) locally with `CI=1`: a temporary non-committed test that fails on attempt 1 and passes on retry → `exit≠0`, `e2e.json` `stats.flaky===1`; remove it (FR-004, SC-014).
- [ ] T021 [US2] CI sanity (push to the PR, `PWA_E2E_ADVISORY` absent): temp commit breaking `toHaveText('INS-0042')`→`'INS-9999'` in `schedule.spec.ts`; `gh run watch <id> --exit-status; echo "exit=$?"` (no pipe) → conclusion `failure` with artifact; then `git revert` → green. Link both run ids in the PR (SC-003, L-X03-08). Local pre-check: the same break + `pnpm --filter pwa test:e2e; echo $?` exits ≠ 0.

**Checkpoint**: US2 complete — CI gate real and red-capable.

---

## Phase 5: User Story 3 — F04-3b reuses the mock harness (P2)

**Goal**: stable, documented harness contract for the tour specs.
**Independent test**: a `skipOnWide('probe')` spec runs 2 passed / 2 skipped; baseline covers the boot.

- [ ] T022 [US3] Prove T10: a temporary `app-*.spec.ts` with `skipOnWide('probe')` across the 4 projects → 2 passed (`Mobile Safari`, `Mobile Chrome`), 2 skipped with reason (`Tablet`, `Foldable open`); remove it (FR-008).
- [ ] T023 [US3] Confirm the exported harness surface matches `contracts/e2e-support-api.md` and capture the merge-time `BASELINE_STUBS` list for the PR body (SC-011, FR-006).

---

## Phase 6: Polish & Cross-Cutting

- [ ] T024 [P] Grep guards (all empty): `grep -rn waitForTimeout apps/pwa/tests/e2e`; `grep -rn "'\*\*/v1/\*\*'" apps/pwa/tests/e2e`; `grep -rn "isMobile\|viewport.width\|project.name" apps/pwa/tests/e2e --include=*.spec.ts` (SC-004, SC-010).
- [ ] T025 [P] Update `apps/pwa/CLAUDE.md`: §1 (drop "56/56 … until X03"), §2 (add `pnpm --filter pwa test:e2e`), §10 (rewrite: builds prereq, strict port 5175 + `PWA_E2E_PORT` + `reuseExistingServer:false`, mock rules, 4 projects + wide layout, Sydney tz, trace capture, deploy-gate + `failOnFlakyTests`, kill-switch runbook, baseline-stub rule, project-restriction rule, IndexedDB rule, WebKit-only `test.fixme` rule) (FR-013, SC-007, SC-013).
- [ ] T026 [P] Update root `CLAUDE.md`: verify §16 step 2 already builds `@properfy/frontend-standards` (apply X00 Block R22 literally if not); replace the R12 "currently broken (56/56…)" notice with "a CI gate (`test-pwa-e2e`)"; review/trim the auto-added Active Technologies line (FR-013, SC-007, SC-013, A-09).
- [ ] T027 Full gates (via subagent, condensed report): `pnpm --filter pwa typecheck|lint|test|check:ds|build` all green (SC-008).
- [ ] T028 Decide A-10: add `optimizeDeps.entries` to `apps/pwa/vite.config.ts` only if V6/CI showed a reload; otherwise note "not needed" in the PR (A-10, H4).
- [ ] T029 Commit (Conventional, suggested splits in the task file), push `036-x03-pwa-e2e-recovery`, open PR → `develop` with root cause, the two sanity run ids, `BASELINE_STUBS`, and `git diff --stat origin/develop... | tail -1` (SC-006).
- [ ] T030 Closing (after merge): rewrite memory `project_pwa_e2e_suite_broken_vacuous.md` as RESOLVED and update the `MEMORY.md` line (SC-013).

---

## Dependencies & order

- **Phase 1 → Phase 2 → Phase 3**: setup, then foundational harness (globalSetup + config), then US1.
- **US1 (Phase 3) blocks US2 (Phase 4)**: CI needs the green hermetic suite first.
- **US3 (Phase 5)** is largely delivered by US1's `support/` (verification + doc).
- **Polish (Phase 6)** last; T030 is post-merge.
- Within US1: T006 (red) before T007 (green); T007 before T008/T009 (they import fixtures); T008/T009 before spec migration (T012–T015); T010/T011 are `[P]` (independent files).

## Parallel opportunities

- T010, T011 in parallel with T008/T009 (distinct files).
- T024, T025, T026 in parallel (distinct files).
- Spec migrations T012–T015 touch distinct spec files but share the new helpers; run after T007–T011.

## MVP scope

User Story 1 (Phase 3) alone restores a green, hermetic local suite — the minimum valuable increment.
User Story 2 makes it a real CI gate (the task's headline goal), so both P1 stories are in scope for
this single PR.
