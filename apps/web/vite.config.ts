import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    css: true,
    exclude: ['tests/e2e/**', 'node_modules/**'],
    // Forks pool with per-file isolation: each test file runs in its own
    // child process and `isolate: true` resets state between files, so
    // there is no cross-file memory accumulation. (A past CI "suite OOM"
    // was traced to one test file whose mock fed an unstable function into
    // a useEffect dependency, causing an unbounded re-render loop — fixed
    // at the source, not a structural leak. See the test-web job comment
    // in .github/workflows/ci.yml.)
    pool: 'forks',
    isolate: true,
  },
});
