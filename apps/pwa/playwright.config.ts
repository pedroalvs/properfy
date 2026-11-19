import { defineConfig, devices } from '@playwright/test';

// Dedicated, strict port — NEVER 5173 (the web app's default and the backend's
// CORS_ORIGIN) nor 5174 (the web e2e port). Overridable per worktree so parallel
// suites never collide. With `reuseExistingServer: false` the suite always starts
// its OWN server and fails loudly if the port is taken, instead of silently binding
// to another worktree's / the web dev server (which has no `login-form`).
const PORT = Number(process.env.PWA_E2E_PORT ?? 5175);
const BASE_URL = `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  // Guards that both workspace dist/ exist before any browser starts (H1).
  globalSetup: './tests/e2e/support/global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  // Flake is a failure in CI: a test that only passes on retry turns the run red
  // (retries stay at 2 so the first retry still produces a trace).
  failOnFlakyTests: isCI,
  reporter: isCI
    ? [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/e2e.json' }]]
    : [['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    // A service worker intercepts fetch BEFORE page.route; block it so mocks always
    // win (no SW in dev today, but this guards a future devOptions enablement).
    serviceWorkers: 'block',
    // The app is Sydney-only and specs compute "today"; pin the zone so the CI
    // runner's UTC clock never diverges from the app's civil-date logic.
    timezoneId: 'Australia/Sydney',
    locale: 'en-AU',
  },
  projects: [
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    // Wide viewports for the adaptive 2-column layout (≥ md). iPad portrait sits
    // right at the breakpoint; the foldable-open width exercises the mid-range. The
    // phone projects above remain the primary suite and must stay green. Per-project
    // restriction is via tests/e2e/support/projects.ts (WIDE_PROJECTS).
    {
      name: 'Tablet (iPad portrait)',
      use: { ...devices['iPad (gen 7)'] },
    },
    {
      name: 'Foldable open',
      use: { ...devices['Pixel 5'], viewport: { width: 840, height: 1080 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      // A single origin for the mocks to target — never actually reached. Empty
      // Mapbox token so the map never initializes and makes no external request.
      VITE_API_BASE_URL: 'http://localhost:3000',
      VITE_MAPBOX_TOKEN: '',
    },
  },
});
