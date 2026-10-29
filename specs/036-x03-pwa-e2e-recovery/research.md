# Phase 0 Research — PWA E2E recovery

## Reproduced diagnosis (2026-10-29, worktree from `origin/develop`)

Method: fresh worktree, `pnpm install` + `@properfy/shared` build only (per the pre-X00 §16 recipe),
then a dev-server probe on a strict isolated port (`vite --port 5199 --strictPort`), before and after
building `@properfy/frontend-standards`.

- **Before** the `frontend-standards` build: `ls packages/frontend-standards/dist` → "No such file or
  directory". `curl -si http://localhost:5199/@id/@properfy/frontend-standards` and
  `curl .../src/app/App.tsx` → **HTTP 500**, `vite:import-analysis`:
  `Failed to resolve entry for package "@properfy/frontend-standards". The package may have incorrect
  main/module/exports`. The failing import is `App.tsx`'s top-level `TIMING` from
  `@properfy/frontend-standards`. Port 5173 was free (`lsof` empty) → H2 not the observed cause here.
- **After** `pnpm --filter @properfy/frontend-standards build`: `dist/index.js` exists; both probes →
  **HTTP 200**; the resolve error is gone (0 matches in the Vite log).
- Baseline with both `dist/` built: `pnpm --filter pwa typecheck` and `lint` pass (10 pre-existing
  lint warnings); Playwright `chromium` + `webkit` install OK.

**Exit criterion (L-X03-03) status**: H1 confirmed by the non-browser dev-server probe within the
0.5-day time-box; no re-estimation trigger (no `apps/pwa/src/` bug, no time-box overrun). The
`auth.spec.ts` 3/3 green-on-two-engines check is completed during implementation after the specs are
made hermetic (the login-error test needs the 401 mock first).

## Ranked hypotheses

| # | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| **H1** | Missing `@properfy/frontend-standards/dist` (or stale `@properfy/shared/dist`) → Vite cannot resolve the top-level import of `App.tsx` → blank shell → 56/56 | **CONFIRMED (observed)** | Dev-server 500 with the resolve error before the build, 200 after; packages export only `./dist/index.js`; §16 recipe omitted the `frontend-standards` build; failure hits `/login` too (no API) |
| **H2** | Port 5173 collision + `reuseExistingServer: true` locally → Playwright binds to another worktree's / the web dev server | **Latent (fixed defensively)** | PWA and web both `"dev": "vite"` on 5173; web already escapes to 5174; many worktrees open routinely. 5173 was free in this run, so not the observed cause — fix ships anyway |
| H3 | Real bootstrap crash under the harness (IndexedDB / InstallPrompt / matchMedia) | **Refuted** | The failure is a module-resolution 500 (H1), not a provider/runtime crash; ErrorBoundary would render a fallback, not an empty `#root` |
| H4 | Vite dep re-optimization reload mid-test | **Possible on cold cache** | Not 56/56 (would be intermittent); mitigated by `optimizeDeps.entries` only if observed (A-10) |
| H5 | Stale `page.route` mocks / off-contract | **Partial** | Explains some post-shell failures (schedule `/range`, catch-all `**/v1/**`), addressed in the spec inventory — not the `login-form` failure |
| H6 | Missing `VITE_*` in dev server | **Refuted by reading** | `env.ts` has fallbacks; map does not init with empty token |
| H7 | CORS on `route.fulfill` cross-origin | **Refuted (control)** | web uses the same pattern (app :5174 → API :3000) and is green in CI |

## Decision record (L-X03-01 … L-X03-09)

- **L-X03-01 — Gate model.** No branch has required status checks; deploys (`frontend-deploy.yml`,
  `fly-deploy.yml`) require the whole CI run `conclusion == 'success'`. Decision: `test-pwa-e2e` is a
  **hard deploy gate from day one**, with `continue-on-error: ${{ vars.PWA_E2E_ADVISORY == 'true' }}`
  (absent = hard) as a code-free rollback and a runbook in `apps/pwa/CLAUDE.md` §10.
  *Rejected:* advisory-first (`continue-on-error: true` always) — it reproduces the vacuous-gate
  failure the task exists to fix.
- **L-X03-02 — Flake is failure.** `failOnFlakyTests: !!process.env.CI`, keep `retries: 2` for the
  first-retry trace, JSON reporter (`test-results/e2e.json`) as `stats.flaky` evidence.
  *Rejected:* letting retries mask flake (the status quo of every "it eventually passed" suite).
- **L-X03-03 — Diagnosis exit criterion + time-box.** `auth.spec.ts` 3/3 on Chromium + WebKit,
  `--retries=0`, within 0.5 day; otherwise escalate same day. WebKit-only residuals → `test.fixme`
  with an open issue, not re-estimation. Any `apps/pwa/src/` change beyond a new `data-testid` or
  `optimizeDeps` triggers re-estimation.
- **L-X03-04 — Pure, strict fixtures.** `fixtures.ts` has no `@playwright/test` import; each fixture
  `schema.strict().parse`-validated in Vitest. Zod-3 `.strict()` catches only top-level dead keys
  (nested objects `strip`) — documented in a comment.
- **L-X03-05 — 501 semantics + baseline stubs.** `501 E2E_UNMOCKED` never fails a test by itself;
  only a dependent assertion fails. `loginAsInspector` registers `BASELINE_STUBS` for the
  authenticated boot; every feature that adds a boot call adds its default stub in the same PR.
  **Verified against `origin/develop` @ea3886c9**: the only authenticated-boot API call is
  `GET /v1/me` (via `AuthProvider.fetchFullUser`). `POST /v1/inspectors/me/app-state` (F01 heartbeat)
  does **not** exist in this snapshot (grep empty), and `GET /v1/inspectors/me` (`useInspectorMe`) is
  a profile-screen query, not a boot call. So `BASELINE_STUBS` ships with `GET /v1/me` → `INSPECTOR_ME`
  only; whichever wave later lands F01 adds the heartbeat stub then (the task assumed F01 was already
  in `develop` — it is not yet at this head).
- **L-X03-06 — IndexedDB seeding.** Only via `seedExecutionState` (awaited `openDB` on a public
  route); never in `addInitScript` (races the app's `openDB`).
- **L-X03-07 — Project restriction.** Only via `support/projects.ts`; project names are a contract;
  `isMobile`/`viewport.width`/`project.name` never read ad hoc in a spec.
- **L-X03-08 — CI sanity awaits the red run.** `concurrency.cancel-in-progress` would void a
  cancelled run as evidence; `gh run watch <id> --exit-status` before the revert.
- **L-X03-09 — Division with X00.** X00 owns the §16 `frontend-standards` build (Block R22); X03
  verifies it and reverts the four "56/56 … until X03" notices (root R12; `apps/pwa/CLAUDE.md` §1 and
  §10; memory + `MEMORY.md`). If X00 has not merged, X03 applies Block R22 literally.

## Resolved unknowns (were implicit NEEDS CLARIFICATION, resolved during implementation, not by the user)

- Whether `GET /v1/inspectors/me` has a backend response schema → it does not (typed only in
  `features/profile/hooks/useInspectorMe.ts`); the fixture mirrors that type with a comment, and the
  stub is in `BASELINE_STUBS` only if the route is actually called on boot in the snapshot.
- Whether the wide layout keeps the bottom nav → verified against `BottomNavBar`/`TwoPaneLayout` in
  the spec inventory; `skipOnWide` only if the design replaces it with a rail.
- Whether `optimizeDeps.entries` is needed → added only if V6/CI shows a reload (A-10).
