# Quickstart — running the PWA E2E suite

## Prerequisites (once per worktree / after a pull)

```bash
pnpm install
pnpm --filter @properfy/shared build
pnpm --filter @properfy/frontend-standards build   # REQUIRED — vite dev resolves both packages only via dist/
pnpm --filter pwa exec playwright install chromium webkit
```

If `@properfy/frontend-standards/dist` is missing, the suite fails fast in `globalSetup` with a
message telling you to run the two builds — not a 30 s `login-form` timeout.

## Run

```bash
pnpm --filter pwa test:e2e                                   # all 4 projects
pnpm --filter pwa exec playwright test --repeat-each=3 --retries=0   # stability (expect exit 0)
```

The suite starts its **own** dev server on a dedicated strict port (`5175`; `reuseExistingServer:
false`), so it never reuses another worktree's server. If 5175 is taken by another worktree running
the suite:

```bash
PWA_E2E_PORT=5176 pnpm --filter pwa test:e2e
```

## Debug a single test

```bash
pnpm --filter pwa exec playwright test tests/e2e/auth.spec.ts --project="Mobile Chrome" --trace on
pnpm --filter pwa exec playwright show-trace test-results/<folder>/trace.zip   # Console + Network tabs
```

Everything hermetic: all `http://localhost:3000/v1/**` calls are mocked via
`tests/e2e/support/api.ts`; any unmocked call returns `501 E2E_UNMOCKED` with a `console.warn`.
Mapbox never initializes (empty `VITE_MAPBOX_TOKEN`). Context is pinned to `Australia/Sydney`
(`en-AU`) and the service worker is blocked.

## CI

The `test-pwa-e2e` job runs all 4 projects (Chromium + WebKit) on every PR and push to
`main`/`staging`/`develop`. In CI, `retries: 2`, `workers: 1`, `failOnFlakyTests` and the JSON
reporter (`test-results/e2e.json`) are on; a test that only passes on retry turns the run red. The
job is a **hard deploy gate** (deploy workflows require the whole CI run `success`).

**Kill switch (admin, no PR):** if WebKit flakes systematically on `develop`, set repository variable
`PWA_E2E_ADVISORY=true` → the job shows green and only the step is red; open an issue, fix the cause,
remove the variable. No acceptance criterion is verified with the variable set.
