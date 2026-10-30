# Quickstart — F02-3 (verification)

From the worktree root:

```bash
pnpm --filter @properfy/shared build          # PWA resolves shared via dist/
pnpm --filter @properfy/frontend-standards build
pnpm --filter pwa lint
pnpm --filter pwa typecheck
pnpm --filter pwa test
pnpm --filter pwa build
test -f apps/pwa/dist/sw.js && grep -q "index.html" apps/pwa/dist/sw.js && echo "sw precache OK"
pnpm --filter pwa test:e2e                     # same gate as test-pwa-e2e (Chromium + WebKit); run with CI=1
```

Expect all green and `dist/sw.js` present with `index.html` in its precache manifest, no `[E2E_UNMOCKED]` for the new boot routes.

## Manual device QA (push acceptance gate, needs staging backend with VAPID)

Runs after TASK-F02-2 is merged (publish via UI) or via `curl` otherwise. QA scenarios 1–12 from the task file: enable push on Android/iOS-installed, publish critical (push + SMS fallback), non-critical (push only, no SMS), badge updates, archive clears, autoUpdate SW swap + offline, logout unsubscribe, password-change keeps subscription, server-revoke resync, system `targetPath` deep link, VAPID rotation resync, iOS `ios-needs-install` copy.
