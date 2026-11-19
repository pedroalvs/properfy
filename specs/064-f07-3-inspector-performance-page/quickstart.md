# Quickstart — Inspector Performance Web (F07-3)

## Prerequisites (fresh worktree)

```bash
pnpm install
pnpm --filter @properfy/shared build          # web resolves @properfy/shared from dist/
pnpm --filter @properfy/frontend-standards build
```

## Develop & test loop (TDD)

```bash
# Unit/component tests (Vitest + RTL), watch or single run:
pnpm --filter web test -- inspector-performance platform-settings StatusTransitionDialog Sidebar

# Full web gates before PR:
pnpm --filter web typecheck   # run with a clean cache — incremental cache can hide api-types type errors
pnpm --filter web lint        # must be zero warnings (no `as any`)
pnpm --filter web test
```

> TDD order per file: write the failing `*.test.tsx` from the spec's test matrix (red), implement until green, refactor. Fixtures in `features/inspector-performance/__fixtures__/reliability.ts` must pass `reliabilityRankingResponseSchema.parse(...)` / `inspectorReliabilityResponseSchema.parse(...)` (a shaped-fixture test).

## Browser QA (mandatory — run the app against a local backend)

1. Start backend + web locally (see `docs/dev-setup.md`); seed the F07-1 worked example and run the `reliability.compute-snapshots` handler directly (don't wait for 04:15).
2. Sign in as **AM**, open Dashboard → **Inspector performance**:
   - ranking shows Eva 100.0, Fábio 97.5, Dan 89.0, Ana 88.3, Ben 79.0; "Not enough data" lists Carla (9 of 10).
   - click Ana → drawer with 8 metrics, failures expandable, links to `/appointments/:id`.
3. Open **Platform settings → Reliability index**, set `PUNCTUALITY` weight to 3, Save → snackbar "Reliability settings saved. Scores are being recalculated.".
4. Re-run the compute handler, reload the page → **Ana 88.3 → 87.3** (03.A1 end-to-end).
5. Sign in as **OP** → same visibility and can save the section (L-F07-11). Sign in as **CL_ADMIN** → the menu item is absent and `/inspector-performance` shows `NoPermissionState`.
6. Freshness: with yesterday's snapshot only and clock ≥ 05:00 Sydney, the stale banner shows; after saving weights, the recompute banner shows.

> Screenshots are for review only — never commit them.

## Pre-PR checklist

- [ ] `pnpm --filter web typecheck lint test` all green (typecheck with clean cache).
- [ ] `git diff --stat origin/develop... | tail -1` < 150 files.
- [ ] No change to `api-types.ts`, Prisma schema, or any migration.
- [ ] `apps/web/CLAUDE.md` updated (new page, `?inspector=` deep link, Reliability index section).
- [ ] `DashboardPage` / `AnalyticsPage` / `InspectorWorkloadPage` untouched (D5).
