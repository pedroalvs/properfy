# Quickstart: Reliability Snapshot & API (F07-2)

## Prerequisites

- Worktree on `063-f07-2-index-snapshot-api` (based on `origin/develop`, F07-1 merged).
- `pnpm install`; `pnpm --filter backend exec prisma generate`; `pnpm --filter @properfy/shared build`.

## Build order (shared → backend)

```bash
# After editing shared schemas / enums / role-matrix:
pnpm --filter @properfy/shared build          # backend typecheck resolves @properfy/shared from dist

# After editing the Prisma schema:
pnpm --filter backend prisma:migrate --name inspector_reliability_snapshots   # dev; then commit the migration
pnpm --filter backend exec prisma generate

# Regenerate the API contract after the routes exist:
pnpm --filter backend generate:openapi
pnpm --filter @properfy/shared generate:types   # or `pnpm generate:api` from the root; commit both
```

## Verification gates (inside the worktree)

```bash
pnpm --filter @properfy/shared build
pnpm --filter @properfy/shared test
pnpm --filter backend exec prisma generate
pnpm --filter backend typecheck
pnpm --filter backend lint
pnpm --filter backend test                      # unit + route integration (test 7)
pnpm --filter backend test:integration:db       # testcontainers (test 8) — via subagent, condensed summary
# contract freshness: generate:openapi + generate:types leave no diff in api-types.ts / openapi.json
git diff --stat origin/develop... | tail -1     # < 150 files
```

## Manual smoke (staging, after deploy)

```sql
-- snapshot produced on boot/schedule
SELECT status, count(*) FROM inspector_reliability_snapshots WHERE snapshot_date = current_date GROUP BY 1;
-- schedules registered
SELECT name FROM pgboss.schedule WHERE name IN ('reliability.compute-snapshots','reliability.ensure-today');
```

```bash
# AM token → 200; CL token → 403
curl -H "Authorization: Bearer $AM" $API/v1/dashboard/inspector-performance
curl -H "Authorization: Bearer $AM" $API/v1/dashboard/inspector-performance/$INSPECTOR_ID
```

Watch the logs for `reliability.snapshots_computed` (and `reliability.snapshots_purged` on a scheduled run); confirm no `reliability.snapshots_failed` / `reliability.recompute_overdue`.

## End-to-end check for 03.A1 (the headline acceptance)

1. Seed the F07-1 worked example (Ana, Ben, Carla, Dan, Eva, Fábio), run the compute for `2026-12-01` → ranking `[Eva 100, Fábio 97.5, Dan 89.0, Ana 88.3, Ben 79.0]`, `notEnoughData [Carla 9]`, `volumeReference 9.5`.
2. `PUT /v1/platform-settings/reliabilityIndex` (AM) with `PUNCTUALITY: 3` → F03 emits `platform_setting.updated.v1` → subscriber enqueues `SETTINGS_CHANGED` (startAfter +35 s) → run the handler → Ana's stored score becomes `87.3`; `platform_setting.updated` audit carries the AM `actorId`.
3. Override: `PUT` `volumeReferenceOverride: 20` → Ana `83.3`, `volumeReference { value: 20, source: 'OVERRIDE' }`; `PUT` back to `null` → `9.5`, `MEDIAN`.

## Rollback

Revert the code: the table stays (no dependents until F08). Remove orphan schedules with `boss.unschedule('reliability.compute-snapshots')` / `boss.unschedule('reliability.ensure-today')` (or `DELETE FROM pgboss.schedule WHERE name IN (…)`). Purged rows (L-F07-12) do not return.
