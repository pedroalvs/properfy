# Quickstart — F00 verification

## Local gates (run inside the worktree, in order)

```bash
pnpm generate:api                                   # after the schema change; commit openapi.json + api-types.ts
pnpm --filter @properfy/shared build
pnpm --filter @properfy/shared test
pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test
pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test
git diff --stat origin/develop... | tail -1          # ~27 files, < 150
```

Backend full suite includes integration (Supertest) and, where touched, the real-DB testcontainers suite.

## Browser smoke (P8) — backend + web local with seed; profiles AM, OP, CL_ADMIN, CL_USER

1. **AM**: open `/map` with the panel **closed** → `Today + 14 days ✕` indicator at the map corner (E.A1-5).
   Open the panel → Date Range today..today+14 and the chip; change a status → request still carries dates
   (check Network); pins only in range. Filter an agency, set `Map window (days)=30` in its drawer (other
   tab), return and re-filter → `toDate=today+30`. Click ✕ → chip gone, request without dates, overdue
   appears. Switch agency → dates stay empty. Groups mode → chip + `scheduledDateFrom/To` of 14 days. Open
   `/map?mode=groups`, switch to Appointments → first request carries `fromDate/toDate`. Block `/v1/tenants/*`
   in DevTools and filter an agency → brief `Loading…` then a 14-day window (a single attempt in Network).
2. **OP**: `/tenants/:id` of any agency → Edit → drawer shows **only** "Map window (days)"; Save disabled
   until changed. Save 21 → success snackbar; audit shows `tenant.updated` with before/after. Via curl with
   the OP token, `PATCH { name:'X' }` → 403. On `/map`, filter that agency → `Today + 21 days`; chip works.
3. **CL_ADMIN**: `/tenants/<own>` → Edit → no "Map" section. `PATCH { settings:{ mapWindowDays:60 } }` → 200,
   GET still shows the previous value, no new `tenant.updated`. On `/map`: no removable chip; static
   `Today + {N} days` label with the panel closed; Date Range clamped with the `Dates are limited to …`
   help text; typing past the end snaps the input back and the request stays in range.
4. **CL_USER**: `/map` → no removable chip, static label visible with the panel closed; clearing both dates
   → request still today..today+N; no `/tenants` access.

## Deploy / rollback (L-F00-10)

No feature flag; develop → staging → prod. Rollback = revert the PR (no migration; existing `mapWindowDays`
values go inert under the `passthrough` schema and re-apply on redeploy; no backfill). After a revert, OP
returns to 403 on PATCH and the map opens unbounded.
