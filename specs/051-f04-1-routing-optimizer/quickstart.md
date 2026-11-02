# Quickstart — TASK-F04-1 verification

All commands run **inside the worktree** `/Users/pedro/Code/GitHub/properfy/.claude/worktrees/f04-1-routing`.

## Build consumed packages first

```bash
pnpm --filter @properfy/shared build
pnpm --filter backend exec prisma generate
```

## Shared optimizer (Esteio's slice)

```bash
pnpm --filter @properfy/shared test        # route-optimizer.test.ts + service-type.test.ts
pnpm --filter @properfy/shared typecheck
pnpm --filter @properfy/shared lint
pnpm --filter @properfy/shared build        # ensures the PWA/web can consume dist/
```

## Backend (adapters, dynamic, PlanRouteService, service-type)

```bash
pnpm --filter backend typecheck
pnpm --filter backend lint
pnpm --filter backend test                  # unit + integration (Supertest); excludes db suite
```

## Backend DB suite (testcontainers, serial)

```bash
pnpm --filter backend test:integration:db -- \
  service-type-duration-backfill service-type-uniqueness routing-rate-limiter
```

Expected: backfill yields 60 (12 execs @62'), 45 (<10 samples), 45 (all out of range), idempotent; the limiter grants exactly 25 of 30 across two connections; buckets independent; `drain` empties.

## Contract freshness

```bash
pnpm generate:api                            # regenerate openapi.json + api-types.ts
git diff --stat -- packages/shared/openapi.json packages/shared/src/api-types.ts
pnpm --filter web typecheck && pnpm --filter pwa typecheck
```

## N5 reconciliation checklist

```bash
grep -n "created by F04" apps/backend/CLAUDE.md        # must be empty
grep -rn "MAPBOX_ACCESS_TOKEN" apps/backend/src/modules/day-plan   # must be empty (test 43a)
```

## PR size

```bash
git diff --stat origin/develop... | tail -1          # < 150 files (estimated ~50)
```
