import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // apps/pwa/tests/e2e/support
// support -> e2e -> tests -> pwa -> apps -> repo root
const repoRoot = resolve(here, '../../../../..');

/**
 * Fail fast and loud when the workspace packages are not built. `vite dev` resolves
 * `@properfy/shared` and `@properfy/frontend-standards` ONLY through their compiled
 * `dist/` (their `exports` point at `./dist/index.js`, and `dist/` is git-ignored).
 * A worktree missing `frontend-standards/dist` makes Vite 500 on `App.tsx`'s
 * top-level import, the shell never mounts, and every spec times out on
 * `login-form` — the original 56/56 failure. This guard turns that into a clear
 * 1-line error in < 10 s instead of a 30 s timeout.
 *
 * It only checks EXISTENCE — it does not build (building here would hide a stale
 * `dist/`, which fails later with "does not provide an export named …"; the fix for
 * that is to rebuild both packages after a pull, per PWA/CLAUDE.md §10).
 */
export default function globalSetup(): void {
  const required = [
    'packages/shared/dist/index.js',
    'packages/frontend-standards/dist/index.js',
  ];
  const missing = required.filter((rel) => !existsSync(resolve(repoRoot, rel)));
  if (missing.length > 0) {
    throw new Error(
      `Build workspace packages first: pnpm --filter @properfy/shared build && pnpm --filter @properfy/frontend-standards build\n` +
        `Missing: ${missing.join(', ')}`,
    );
  }
}
