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
    // Use the threads pool with isolation. The previous `forks` +
    // `maxForks: 1` (commit 96ea96d, production-readiness audit) serialized
    // every file in one heap, which caused staging CI shard 7/12 to hit
    // "Reached heap limit Allocation failed" once the suite crossed 8 GB
    // of residue. Forks also surface "Worker exited unexpectedly" on
    // shutdown because the child process holds lingering handles from
    // jsdom; threads avoid that exit path entirely.
    // Use forks pool with per-file isolation. Each test file runs in its
    // own child process; `isolate: true` keeps module state from leaking
    // between files. Parent passes `--max-old-space-size` through
    // NODE_OPTIONS, which child processes inherit.
    //
    // The previous `maxForks: 1` (commit 96ea96d) collapsed every file
    // into one heap and exhausted the staging CI shard at ~8 GB.
    // Use the forks pool with per-file isolation. The previous
    // `maxForks: 1` (commit 96ea96d) serialized every file into one
    // heap and exhausted the staging CI shard at ~8 GB. Letting vitest
    // scale forks (default 1..os.availableParallelism()) plus the
    // default `isolate: true` lifecycle keeps memory bounded per file.
    //
    // The web suite still has a residual cumulative-heap OOM in one
    // worker on CI (see `.github/workflows/ci.yml#test-web`); that is
    // tracked separately as test-cleanup work and the CI job is marked
    // `continue-on-error: true` until the suite is profiled and the
    // offending teardown hooks are added.
    pool: 'forks',
    isolate: true,
  },
});
