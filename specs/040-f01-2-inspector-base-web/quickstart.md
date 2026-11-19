# Quickstart — Web inspector base address & app adoption

## Prerequisites
- Worktree on branch `040-f01-2-inspector-base-web`, based on `develop` @ `cff52a98` (TASK-F01-1 merged).
- `pnpm install` done; `@properfy/shared` and `@properfy/frontend-standards` built to `dist/` (web resolves both via `dist/`, never source).

## Build the consumed packages (required before web typecheck/lint/test)
```bash
pnpm --filter @properfy/shared build
pnpm --filter @properfy/frontend-standards build
```

## Run the dev app
```bash
pnpm --filter web dev            # web SPA; sign in as AM/OP, open /inspectors
# backend (local, fake geocoder in dev) if validating end-to-end:
pnpm --filter backend dev
```

## Verification gates (inside the worktree)
```bash
pnpm --filter @properfy/shared build
pnpm --filter web lint           # --max-warnings 0
pnpm --filter web typecheck
pnpm --filter web test           # Vitest + RTL units
pnpm --filter web exec playwright test tests/e2e/inspector-base-address.spec.ts
```
If web typecheck looks wrong after a shared change, delete `apps/web` `tsbuildinfo` (incremental cache can lie — memory).

## Manual QA in the browser (AM/OP, `/inspectors`)
The drawer base-address flow is F01-1's and out of scope; QA only F01-2's surfaces.
1. **Table** shows App / Push / Last seen columns after Status; tooltips say "any device" (App), "last device seen" (Push) and "reported at most every 6 h" (Last seen).
2. An inspector with null `baseLat` shows the "No base address" badge beside the name; tooltip differs for null vs present `address`.
3. **Filter** "No base address" lists only inspectors without a located base; empty state reads "No inspectors without a base address." when none match.
4. Last seen shows relative time; the absolute tooltip is in Sydney time regardless of browser TZ; "Never" when null.
5. **Detail** shows a "Base address" section ("Located · Updated {date}" / "Could not be located" / "Not set") and an "App adoption" section with fallbacks for a never-opened app; no coordinates anywhere.

## Acceptance mapping
- Criterion 3 (table columns/badge/filter) → QA 1–3. Criterion 4 (detail sections) → QA 5.
- 00.A5 (partial) → QA 5 (located base shows "Located", evidencing lat/lng).
- Criterion 6 (tooltips) → QA 1; Criterion 5 (Sydney TZ) → QA 4.
