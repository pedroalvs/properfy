import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    // Real-DB integration tests under tests/integration/db/** require Docker
    // and are run separately via `pnpm test:integration:db`.
    exclude: ['node_modules/**', 'tests/integration/db/**'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@properfy/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
