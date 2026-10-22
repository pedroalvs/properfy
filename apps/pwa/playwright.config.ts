import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
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
    // Wide viewports for the adaptive 2-column layout (≥md). iPad portrait sits right at the
    // breakpoint; the foldable-open width exercises the mid-range. The phone projects above remain
    // the primary suite and must stay green.
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
    command: 'pnpm dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
