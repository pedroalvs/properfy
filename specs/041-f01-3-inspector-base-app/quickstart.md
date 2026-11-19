# Quickstart — F01-3 PWA

## Prerequisites

```bash
# From the worktree root. Shared dist/ must exist before PWA typecheck/lint/test.
pnpm install
pnpm --filter @properfy/shared build
pnpm --filter @properfy/frontend-standards build
```

## Develop

```bash
pnpm --filter pwa dev        # Vite dev server; __APP_VERSION__ = <pkg.version>+dev locally
```

## Test (TDD — write tests first)

```bash
pnpm --filter pwa test       # Vitest + RTL unit tests
pnpm --filter pwa typecheck
pnpm --filter pwa lint
# E2E (hermetic, Chromium + WebKit) — the test-pwa-e2e CI gate:
pnpm --filter pwa exec playwright test
```

## Verify no contract drift

```bash
pnpm generate:api            # expect NO diff to openapi.json / api-types.ts (no route schema changed)
git diff --stat packages/shared/openapi.json packages/shared/src/api-types.ts   # must be empty
```

## Manual smoke (spec SC-005; evidence attached to PR, never committed)

1. **Web (OP)**: create an inspector without a base (blocked) and with a base; detail shows "Located" (00.A5 partial).
2. **PWA iOS simulator (Safari)**: inspector without base sees banner variant 1 on Schedule + Profile → fill the card → banner disappears → enter a non-existent address → variant 2.
3. **PWA installed (Android emulator or Chrome installed)**: first standalone open → web shows "Installed", "Just now", and Push per permission.
4. **Throttle**: reload within 6 h in the same mode → no new POST (Network tab). Toggle tab ↔ app on Android → one POST per mode change (expected, L-F01-08).
5. **Web**: "No base address" filter lists who is missing, with the right tooltip per variant (L-F01-07).
6. **`/profile/settings` (staging build)**: footer version `v{pkg.version}+{short SHA}` equals the deployed SHA and the web "App version"; empty push slot sits above `InstallAppCard` (L-F01-12).
```
