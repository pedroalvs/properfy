/**
 * Vitest configuration for real-database integration tests.
 *
 * This config targets `tests/integration/db/` — tests that use the
 * testcontainers-based Prisma harness. These tests are isolated from the
 * main test run because they require Docker and take longer to start.
 *
 * Run via: `pnpm --filter backend test:integration:db`
 *
 * The main `vitest.config.ts` and `vitest.integration.config.ts` exclude
 * `tests/integration/db/` so they don't accidentally spin up containers
 * when running the normal suite.
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/db/**/*.test.ts'],
    // No global setup file — each suite manages its own container lifecycle
    // via `setupDbHarness` / `teardownDbHarness` in `beforeAll` / `afterAll`.
    testTimeout: 120_000, // containers + migrations can take ~30s on first run
    hookTimeout: 180_000, // allow image pull on first run
    // Run sequentially to avoid multiple containers competing for resources.
    // Each suite gets its own container; parallel suites would triple RAM usage.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@properfy/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
