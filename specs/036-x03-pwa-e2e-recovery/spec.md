# Feature Specification: Recover the PWA Playwright E2E suite and add a real CI job

**Feature Branch**: `036-x03-pwa-e2e-recovery`  
**Created**: 2026-10-29  
**Status**: Draft  
**Input**: User description: "Recover the PWA Playwright E2E suite and add a real CI job"

## Context

The PWA Playwright E2E suite (`apps/pwa/tests/e2e`, 4 specs × 4 projects = 56 tests) fails
wholesale (56/56) on a clean `develop` and is not wired into CI, so it is a **vacuous gate**: a
"passing" run proves nothing and a red one is invisible. The root cause has been reproduced in a
clean worktree (see **Diagnosis** below). This feature makes the suite green, deterministic and
hermetic in a clean worktree and in CI, and adds a real CI job (`test-pwa-e2e`) that turns red when
an assertion breaks or a test only passes on retry. It does **not** add new specs; the 14 existing
tests migrate onto a shared, hermetic mock harness that the tour specs (F04-3b) will reuse.

## Diagnosis (reproduced 2026-10-29, worktree from `origin/develop`)

- **Root cause — H1 (confirmed).** `@properfy/frontend-standards` and `@properfy/shared` resolve
  **only** to their compiled `dist/` (their `package.json` `exports["."]` point at `./dist/index.js`,
  and `dist/` is git-ignored). A worktree built per the (pre-X00) §16 recipe builds only
  `@properfy/shared`, leaving `@properfy/frontend-standards/dist` absent. `App.tsx` imports `TIMING`
  from `@properfy/frontend-standards` at the top level, so Vite's `vite:import-analysis` returns
  **HTTP 500** for `App.tsx` with `Failed to resolve entry for package "@properfy/frontend-standards"`.
  The module graph of `main.tsx` fails, `#root` stays empty, and every spec's first
  `getByTestId('login-form')` times out at `auth.spec.ts:9` — hence 56/56, including `/login`, which
  calls no API. Building `@properfy/frontend-standards` flips the dev-server probe for both the
  package and `App.tsx` back to **HTTP 200** and the resolve error disappears. Evidence: dev-server
  `curl` probe on a strict isolated port, before vs. after the build.
- **Latent cause — H2.** The config uses the Vite default port `5173` (shared with the web app) and
  `reuseExistingServer: !process.env.CI`, so with multiple worktrees open Playwright can silently
  bind to another server (e.g. the web dev server, which has no `login-form`). Port 5173 was free in
  the reproduction, so H2 was not the observed cause, but both fixes ship because either can produce
  56/56 on a different machine.

Both fixes are **harness/config/docs only**; no change to `apps/pwa/src/` is required (confirmed:
baseline `typecheck` and `lint` are green once both `dist/` are built).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A clean worktree runs the suite green and hermetic (Priority: P1)

A developer checks out `develop`, follows the (X00-updated) §16 setup recipe, and runs
`pnpm --filter pwa test:e2e`. All 56 tests pass deterministically, no request leaves the machine to
`localhost:3000`, Mapbox or any real host, and the dev server is this suite's own (never a server
reused from another worktree).

**Why this priority**: Without a trustworthy local suite there is nothing to wire into CI and nothing
for F04-3b to build the tour specs on; this is the foundation.

**Independent Test**: In a clean worktree with both workspace `dist/` built, run
`pnpm --filter pwa test:e2e` (and `--repeat-each=3 --retries=0`); expect exit 0 and 56 passed, with
no outbound network and the suite's own strict-port dev server.

**Acceptance Scenarios**:

1. **Given** a clean worktree with `@properfy/shared` and `@properfy/frontend-standards` built,
   **When** `pnpm --filter pwa test:e2e` runs the 4 projects, **Then** all 56 tests pass with exit 0.
2. **Given** the suite is running, **When** a spec calls an API route for which no stub is registered,
   **Then** the request is fulfilled with `501 E2E_UNMOCKED` and a readable `console.warn`, and it
   never reaches a real host.
3. **Given** `@properfy/frontend-standards/dist` is missing, **When** the suite starts, **Then** it
   fails in `globalSetup` in under 10 s with a message telling the developer to build both packages,
   **not** with a 30 s `login-form` timeout.
4. **Given** another worktree already holds the chosen port, **When** the suite starts, **Then** it
   fails loudly (strict port, no reuse) rather than binding to the wrong server, and
   `PWA_E2E_PORT=<other>` lets the developer pick a free port.

### User Story 2 - CI runs the suite as a real, non-vacuous deploy gate (Priority: P1)

CI runs the PWA suite in a new `test-pwa-e2e` job across Chromium + WebKit (all 4 projects). The job
goes red when any assertion breaks and when any test only passes on retry (flake is failure), and a
red job blocks deploys. An admin kill switch allows a code-free rollback if WebKit flakes
systematically on `develop`.

**Why this priority**: A suite that is green locally but never run in CI is the exact failure mode
being fixed; the gate must be real and provably red-capable.

**Independent Test**: Push a commit that breaks one assertion with the kill-switch variable absent;
the `test-pwa-e2e` run concludes `failure` (not `cancelled`), publishes the report artifact, and
blocks the deploy workflows; revert → the job is green.

**Acceptance Scenarios**:

1. **Given** the `test-pwa-e2e` job and `PWA_E2E_ADVISORY` unset, **When** a pushed commit breaks an
   assertion, **Then** the run concludes `failure`, uploads `pwa-playwright-report`, and the deploy
   workflows (which require the whole CI run `success`) do not run.
2. **Given** CI, **When** any test passes only on a retry, **Then** `failOnFlakyTests` makes the run
   finish red and `test-results/e2e.json` records `stats.flaky > 0`.
3. **Given** systematic WebKit flake on `develop`, **When** an admin sets repository variable
   `PWA_E2E_ADVISORY=true`, **Then** the job shows green (only the step is red) and deploys proceed,
   per the runbook — and no acceptance criterion is verified with the variable set.

### User Story 3 - F04-3b reuses the mock harness for the tour specs (Priority: P2)

The author of the F04-3b tour specs imports `loginAsInspector`, `BASELINE_STUBS`, `stubJson`,
`blockUnmockedApi`, `skipOnWide`/`isWideProject` and `seedExecutionState` from
`tests/e2e/support/`, runs the tour on the two phone projects via `skipOnWide`, and registers a
capture stub **after** `loginAsInspector` (last route wins) without touching the baseline.

**Why this priority**: The task's stated purpose is to unblock F04-3b on a reliable harness; the
exported contract must be stable and documented.

**Independent Test**: A probe spec using `skipOnWide('probe')` runs 2 passed / 2 skipped across the 4
projects, and the baseline stubs cover the authenticated boot with no 501.

**Acceptance Scenarios**:

1. **Given** `support/projects.ts`, **When** a spec declares `skipOnWide('reason')`, **Then** it runs
   on `Mobile Safari` + `Mobile Chrome` and skips on `Tablet (iPad portrait)` + `Foldable open` with
   the reason recorded.
2. **Given** `loginAsInspector(page)`, **When** the authenticated boot fires its baseline calls
   (`GET /v1/me`, `POST /v1/inspectors/me/app-state`, `GET /v1/inspectors/me`), **Then** none of them
   returns `501 E2E_UNMOCKED`.

### Edge Cases

- **Runner timezone**: CI runs in UTC; the app computes "today" in Sydney. `use.timezoneId:
  'Australia/Sydney'` and `locale: 'en-AU'` are fixed, and specs that compute "today" derive it with
  `Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' })`, not the host clock.
- **Last route wins**: a specific `stubJson` registered *before* `blockUnmockedApi` is shadowed and
  returns 501; `loginAsInspector` registers `blockUnmockedApi` first internally, and callers register
  overrides afterwards.
- **Globs with query strings**: `${API}/v1/marketplace/offers` does not match
  `?page=1&pageSize=20`; use a pathname predicate so `/offers/:id` is not matched by accident.
- **Token refresh**: a mocked 401 triggers `refreshAccessToken()` → `${API}/v1/auth/refresh`, which
  the catch-all returns as 501 → logout; only the login test mocks a 401.
- **`isMobile` distinguishes nothing**: all 4 projects set `isMobile: true`; per-project restriction
  is only via `support/projects.ts` (`WIDE_PROJECTS`), never `viewport.width`/`isMobile`/`project.name`
  read ad hoc in a spec.
- **Stale `dist/` (H1 variant)**: `globalSetup` only checks existence; an outdated `dist/` still
  throws "does not provide an export named …". Docs tell developers to rebuild both packages after a
  pull; CI always builds fresh.
- **Two-pane / Direction D drift**: on the wide projects the marketplace detail opens in
  `GroupDetailPane`, not `GroupDetailBottomSheet` (which receives `groupId null`); detail assertions
  anchor on content present in both layouts, gated by `isWideProject(testInfo)`.
- **IndexedDB race**: seeding IndexedDB in `addInitScript` races the app's own `openDB`
  (`indexeddb.ts:34`) and makes `submit-button` intermittently vanish (worse on WebKit); seeding is
  only via `seedExecutionState` (awaited `openDB` on a public route, before navigating to
  `/execution/:id`).
- **New authenticated-boot call (future feature)**: without a stub in `BASELINE_STUBS` it returns 501
  with a `console.warn` in every spec; the feature PR adds the default stub.
- **WebKit-only residual failure**: `test.fixme(isWebKitProject(testInfo), '<issue link>')` with an
  open issue and deadline — never a silent `test.skip`, never `waitForTimeout`, never removing the
  WebKit project from CI.
- **Sanity run cancelled**: a push before the red run finishes cancels it
  (`concurrency.cancel-in-progress`); `cancelled` is not `failure` and has no artifact, so the red run
  must be awaited with `gh run watch <id> --exit-status` before the revert.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The suite MUST fail fast in a Playwright `globalSetup` with an actionable message
  (`Build workspace packages first: pnpm --filter @properfy/shared build && pnpm --filter
  @properfy/frontend-standards build`) when `packages/shared/dist/index.js` or
  `packages/frontend-standards/dist/index.js` is absent. `globalSetup` MUST NOT build the packages
  (so a stale `dist/` is not hidden).
- **FR-002**: The config MUST bind the dev server to a dedicated strict port
  (`PWA_E2E_PORT ?? 5175`) via `pnpm exec vite --port ${PORT} --strictPort`, with
  `reuseExistingServer: false` always, `webServer.url` on `/login`, and `baseURL` matching. It MUST
  NOT use port 5173/5174 or `reuseExistingServer: !process.env.CI`.
- **FR-003**: The config MUST set `use.serviceWorkers: 'block'`, `use.timezoneId:
  'Australia/Sydney'`, `use.locale: 'en-AU'`, and fix `webServer.env` to
  `VITE_API_BASE_URL=http://localhost:3000` and `VITE_MAPBOX_TOKEN=''`.
- **FR-004**: In CI the config MUST enable `failOnFlakyTests` and emit a JSON reporter to
  `test-results/e2e.json`, keeping `retries: 2` and `workers: 1`; `trace: 'on-first-retry'`,
  `screenshot: 'only-on-failure'`, `video: 'off'`.
- **FR-005**: Every API request to `http://localhost:3000/v1/**` MUST be mockable via
  `support/api.ts`; an unmocked request MUST return `501 E2E_UNMOCKED` with a readable `console.warn`
  and MUST NOT reach a real host. The catch-all MUST be scoped to the API origin (never `**/v1/**`,
  which would intercept `api.mapbox.com/styles/v1/...`) and registered first (last route wins).
- **FR-006**: `loginAsInspector` MUST write tokens via `page.addInitScript` (not `goto + evaluate`)
  and, by default, register `blockUnmockedApi` then `BASELINE_STUBS`. Verified against
  `origin/develop` @ea3886c9, the only authenticated-boot call is `GET /v1/me`, so `BASELINE_STUBS`
  ships as `GET /v1/me` → plain `INSPECTOR_ME` only. (`POST /v1/inspectors/me/app-state` does not
  exist in this snapshot; `GET /v1/inspectors/me` is a profile-screen query, not a boot call. Each is
  added to the baseline by the feature PR that first makes it a boot call — L-X03-05.) The merge-time
  contents of `BASELINE_STUBS` MUST be listed in the PR.
- **FR-007**: All E2E fixtures MUST live in a pure `support/fixtures.ts` (no `@playwright/test`
  import), with valid-uuid ids, civil dates `YYYY-MM-DD` and ISO instants, each validated by
  `schema.strict().parse(...)` against its `@properfy/shared` schema in a Vitest test
  (`src/__tests__/e2e-fixtures.test.ts`) that the unit suite executes.
- **FR-008**: Per-project restriction MUST be expressed only through `support/projects.ts`
  (`WIDE_PROJECTS`, `isWideProject`, `isWebKitProject`, `skipOnWide(reason)`, `skipOnPhone(reason)`
  with a non-empty reason). No spec may read `viewport.width`, `isMobile` or `project.name` directly.
- **FR-009**: IndexedDB seeding MUST be done only via `seedExecutionState` (awaited `openDB` on a
  public route), never in `addInitScript`.
- **FR-010**: A new CI job `test-pwa-e2e` (name "E2E pwa (Playwright mobile)") MUST run on every PR
  and push to `main`/`staging`/`develop` (no path filter, mirroring `test-web-e2e`), build both
  workspace packages, install Chromium + WebKit, run `pnpm --filter pwa test:e2e`, and upload
  `apps/pwa/playwright-report/` + `apps/pwa/test-results/` on failure. It MUST carry
  `continue-on-error: ${{ vars.PWA_E2E_ADVISORY == 'true' }}` (absent = hard gate).
- **FR-011**: Specs MUST contain no `page.waitForTimeout`/arbitrary sleeps; all waits are
  state-based (`toBeVisible`, `toHaveCount`, `toHaveURL`, `waitForResponse`).
- **FR-012**: No spec may monkey-patch `window.fetch`, use the `**/v1/**` catch-all, or write tokens
  via `goto + evaluate`.
- **FR-013**: Documentation MUST be updated: `apps/pwa/CLAUDE.md` §1, §2, §10 (harness, strict port,
  mock rules, kill-switch runbook, baseline-stub rule, project restriction, IndexedDB rule,
  WebKit-only rule), root `CLAUDE.md` (§16 verified to already include the `frontend-standards` build;
  the "56/56" R12 notice replaced with "a CI gate (`test-pwa-e2e`)"), and the memory
  `project_pwa_e2e_suite_broken_vacuous` rewritten as RESOLVED with the `MEMORY.md` line updated
  (closing step, after merge).

### Key Entities

- **`support/api.ts`**: `API` origin constant, `stubJson(page, path, body, status)`,
  `blockUnmockedApi(page)` (origin-scoped 501 catch-all), `blockExternal(page)` (abort Mapbox hosts).
- **`support/auth.ts`**: `loginAsInspector(page, opts)`, `BASELINE_STUBS`, re-export of `INSPECTOR_ME`.
- **`support/fixtures.ts`**: pure response fixtures matching the shared schemas (`INSPECTOR_ME`,
  `SCHEDULE_MONTH_EMPTY/ONE`, `OFFER`, `OFFER_DETAIL`, `APPOINTMENT_DETAIL`, `FINISH_RESULT`,
  `LOGIN_401`, `INSPECTOR_PROFILE`).
- **`support/projects.ts`**: `WIDE_PROJECTS`, `isWideProject`, `isWebKitProject`, `skipOnWide`,
  `skipOnPhone`.
- **`support/idb.ts`**: `seedExecutionState(page, state)`.
- **`support/global-setup.ts`**: the `dist/` existence guard.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a clean worktree (X00-updated recipe), `pnpm --filter pwa test:e2e` passes all **56**
  tests with exit 0, and again under `--repeat-each=3 --retries=0`. Justified `skipOnWide`/`skipOnPhone`
  and WebKit-only `test.fixme` (with an issue) do not count as failures.
- **SC-002**: The `test-pwa-e2e` job exists in `ci.yml`, runs on the PR, is green, and carries
  `continue-on-error: ${{ vars.PWA_E2E_ADVISORY == 'true' }}` with the kill-switch runbook in
  `apps/pwa/CLAUDE.md` §10.
- **SC-003**: With `PWA_E2E_ADVISORY` absent, one `test-pwa-e2e` run concludes `failure` (not
  `cancelled`) with the report artifact on a deliberately broken assertion, and a green run after the
  revert; both run ids are linked in the PR.
- **SC-004**: `grep -rn waitForTimeout apps/pwa/tests/e2e` is empty; the config has
  `reuseExistingServer: false`; `grep -rn "'\*\*/v1/\*\*'" apps/pwa/tests/e2e` is empty; no spec
  monkey-patches `fetch` or writes tokens via `goto + evaluate`; every unmocked request returns
  `E2E_UNMOCKED`.
- **SC-005**: Without `frontend-standards/dist`, the suite fails in `globalSetup` with the build
  message in under 10 s, not a 30 s `login-form` timeout.
- **SC-006**: The PR documents the root cause with the trace/console evidence (text, no committed
  screenshots) and the command that reproduces it.
- **SC-007**: `apps/pwa/CLAUDE.md` §1/§2/§10, root `CLAUDE.md` (§16 verified, R12 reverted) and the
  memory are updated.
- **SC-008**: `pnpm --filter pwa typecheck | lint | test | check:ds | build` are all green.
- **SC-009**: `src/__tests__/e2e-fixtures.test.ts` runs in the unit suite (test count in the log) and
  validates every Step-5 fixture with `.strict().parse`.
- **SC-010**: `support/projects.ts` is the only source of per-project restriction:
  `grep -rn "isMobile\|viewport.width\|project.name" apps/pwa/tests/e2e --include=*.spec.ts` is empty.
- **SC-011**: `BASELINE_STUBS` is listed in the PR description with its merge-time state.
- **SC-012**: The diagnosis records the exit criterion met (`auth.spec.ts` 3/3 on `Mobile Chrome` and
  `Mobile Safari`, `--retries=0`) or the same-day escalation within the time-box.
- **SC-013**: The four "56/56 … until X03" notices are reverted (root R12; `apps/pwa/CLAUDE.md` §1 and
  §10; memory + `MEMORY.md`).
- **SC-014**: `failOnFlakyTests` is on in CI, so a test that passes only on retry turns the run red.
  The JSON reporter writes `test-results/e2e.json` on every run; a green run's pass is itself the
  evidence of no flake, and when a flaky run goes red the `if: failure()` upload publishes
  `e2e.json` (with `stats.flaky > 0`) in the artifact.

## Assumptions / Premises

- **A-01 (L-X03-01)**: No branch has required status checks (no branch protection; the only ruleset
  lacks `required_status_checks`), so merges are ungated. The effective gate is **deploy**:
  `frontend-deploy.yml` and `fly-deploy.yml` fire on `workflow_run` and require the whole CI run
  `conclusion == 'success'`, so `test-pwa-e2e` blocks deploys from the first merge. The job ships
  **hard** with the `PWA_E2E_ADVISORY` kill switch (absent = hard) and a runbook. Promoting it to a
  merge check is an admin ruleset action out of this task's scope.
- **A-02 (L-X03-02)**: Flake is a CI failure (`failOnFlakyTests`), with the JSON reporter as evidence;
  `retries: 2` is kept only for the first-retry trace.
- **A-03 (L-X03-03)**: Diagnosis exit criterion and 0.5-day time-box (met: H1 confirmed by the
  dev-server probe). Any required change under `apps/pwa/src/` beyond a new `data-testid` (where no
  accessible selector exists) or `optimizeDeps` triggers re-estimation; a WebKit-only residual is a
  `test.fixme` with an issue, not re-estimation.
- **A-04 (L-X03-04)**: Fixtures are pure and strictly validated; `.strict()` in Zod 3 applies only to
  the top object level (nested dead keys are not caught — noted in a comment).
- **A-05 (L-X03-05)**: A `501 E2E_UNMOCKED` does not fail a test by itself; the app decides, and only
  an assertion that depends on the call fails. Verified against `origin/develop` @ea3886c9: the only
  authenticated-boot call is `GET /v1/me`, so `BASELINE_STUBS` ships with `/v1/me` only. F01's
  `POST /v1/inspectors/me/app-state` heartbeat is **not** in this snapshot (contrary to the task's
  wave-order assumption); it joins the baseline in the PR that lands it.
- **A-06 (L-X03-06)**: IndexedDB is seeded only via `seedExecutionState`; tokens stay in
  `addInitScript`.
- **A-07 (L-X03-07)**: Project restriction is only via `support/projects.ts`; project names are a
  contract. Tour specs (F04-3b) run on the two phone projects via `skipOnWide`.
- **A-08 (L-X03-08)**: CI sanity awaits the red run before the revert (`cancel-in-progress` would
  void a cancelled run as evidence).
- **A-09 (L-X03-09)**: X00 owns the §16 `frontend-standards` build (Block R22); X03 only verifies it
  and reverts the four "56/56" notices. If X00 has not merged, X03 applies Block R22 literally.
- **A-10**: `optimizeDeps.entries` (H4) in `vite.config.ts` is added only if V6/CI shows a dev-server
  reload; otherwise it stays out as a minimal-change note in the PR.

## Out of Scope

- New specs, including the F04-3b tour specs (E1–E6) and Phase-2 feature coverage.
- Replacing Playwright, running against `vite preview`/build, or enabling the service worker in E2E.
- Path filters in `ci.yml` and branch-protection changes (admin action).
- Fixing real app-bootstrap bugs (if diagnosis found an H3 bug, it enters only with approved
  re-estimation — not observed here; H1 is a harness/recipe issue).
- Changing the PWA `tsconfig` to include `tests/`.
