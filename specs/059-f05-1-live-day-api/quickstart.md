# Quickstart: Live Day Dashboard API (F05-1)

## Build & generate (worktree)

```bash
pnpm --filter @properfy/shared build          # web/backend consume shared via dist/
pnpm --filter backend exec prisma generate    # after editing schema.prisma
# create the expand migration (regenerate timestamp on rebase):
pnpm --filter backend exec prisma migrate dev --create-only --name inspector_alert_overrides
```

## Gates (run inside the worktree, backend via subagent with condensed summary)

```bash
pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test
pnpm --filter backend typecheck
pnpm --filter backend lint
pnpm --filter backend test                     # unit + Supertest (excludes real-DB)
pnpm --filter backend test:integration:db      # Testcontainers, serial
# contract freshness:
pnpm --filter backend generate:openapi && pnpm --filter @properfy/shared generate:types
git diff --stat origin/develop... | tail -1    # must be < 150 files
```

## Smoke (staging, AM token)

1. `GET /v1/dashboard/live-day` for today and yesterday, with `includeGeometry` = `none`, `selected&inspectorId=<id>`, and `all` — note body sizes; confirm `none` carries no geometry, `selected` one, `all` all (and ≤ ~400 KB).
2. Confirm logs: a single `live_day.read` line per request with `durationMs`/`bodyBytes` and **no** coordinates; **zero** Mapbox calls per request; p95 vs the 300/800 ms budget.
3. `GET /v1/dashboard/locked-time` (default range) — spot-check the D21 formula.
4. `PUT /v1/inspectors/<id>/alert-thresholds { "delayMinutes": 15, "notStartedMinutes": null }` then `GET` it back, then re-read `live-day` and confirm that inspector's DELAY alert uses 15 with `thresholdSource 'INSPECTOR'`.
5. RBAC: repeat (1) and (3) with a CL token → 403; no token → 401.

## Key acceptance proofs

- **01.A4** (derived state): `live-day-a4.integration.test.ts` drives real F03 `start`/`finish` and asserts `NOT_STARTED → AT_PROPERTY → IN_TRANSIT → DONE_FOR_DAY`; no Mapbox call in any step.
- **01.A5** (threshold alerts): `derive-alerts.test.ts` (7 types, boundary) + `inspector-alert-thresholds.integration.test.ts` (override path).
- **1 query / 0 external**: tests 15, 16, 22. **STALE**: tests 9b, 19, 13b. **Locked-time D21**: test 21. **RBAC / strip / per-user rate limit**: tests 24–26.
