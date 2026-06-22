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
    // Forks pool with per-file isolation: each test file runs in a child
    // process and `isolate: true` resets module state between files. The
    // worker process is still reused across files, so residue (React Query
    // clients/timers, jsdom, MapboxGL stubs) accumulates in one worker's
    // heap until it hits the V8 limit. Raising --max-old-space-size alone
    // does NOT help — the leak is unbounded and grows to fill whatever
    // limit is set. CI shards the suite into 8 parallel legs (see
    // .github/workflows/ci.yml#test-web) so most run fast and green; the
    // leak is concentrated in heavy map/GL files (each retains hundreds of
    // MB), so one shard still OOMs and is kept non-blocking there. A
    // blanket per-test reset (clearMocks/restoreMocks/unstubGlobals) is
    // NOT enabled because many map/auth tests rely on a stub installed
    // once per file persisting across that file's tests; the real fix is
    // per-file teardown of those map/GL tests, tracked as follow-up.
    pool: 'forks',
    isolate: true,
  },
});
