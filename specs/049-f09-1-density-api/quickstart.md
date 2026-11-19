# Quickstart: Execution Density Map API

## What ships

`GET /v1/map/execution-density` + its `@properfy/shared` contract + a `map.execution_density` role-matrix key. Backend + shared only; the `/map` layer is TASK-F09-2. No migration, no new env, no seed.

## Build order (P1 → P9)

```bash
# From the worktree root.

# P1/P1a — shared contract + role-matrix key (TDD: write tests first)
pnpm --filter @properfy/shared test        # execution-density.test.ts (S1–S15), role-matrix.test.ts (M1–M2)
# P2 — build so backend/web resolve @properfy/shared from dist
pnpm --filter @properfy/shared build

# P3/P4 — backend domain + use case (TDD)
pnpm --filter backend exec vitest run tests/unit/inspector-execution/execution-density-grid.test.ts
pnpm --filter backend exec vitest run tests/unit/inspector-execution/get-execution-density.use-case.test.ts

# P5 — Prisma reader + real-DB integration (testcontainers)
pnpm --filter backend exec vitest run -c vitest.integration-db.config.ts tests/integration/db/execution-density.integration.test.ts

# P6 — route + container + mock-container (Supertest)
pnpm --filter backend exec vitest run tests/integration/inspector-execution/execution-density.routes.test.ts

# P7 — regenerate the contract (CI checks freshness)
pnpm generate:api   # generate:openapi (backend) -> generate:types (shared)

# P8 — update apps/backend/CLAUDE.md + packages/shared/CLAUDE.md

# P9 — gates
pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test
pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test
pnpm --filter backend exec vitest run -c vitest.integration-db.config.ts tests/integration/db/execution-density.integration.test.ts
git diff --stat origin/develop... | tail -1   # < 150 files (expected ~21)
```

## Smoke (staging, after deploy)

With an AM token: `?fromDate=<today-29>&toDate=<today>` → 200 with cells.
With a CL_ADMIN token:
- `+ inspectorId=<uuid>` → 403.
- `+ tenantId=<another agency>` → same cells as without it.
- response has `minCellCount: 3` and no cell with `count < 3`.
- `?fromDate=2026-10-01&toDate=2026-10-10` (non-preset) → 400 `PERIOD_NOT_A_PRESET`; same window with an AM token → 200.
Capture `EXPLAIN ANALYZE` for a 366-day no-agency query in the PR.

## Verify privacy by construction

- `grep` the reader: it must expose only `aggregate(...)` returning `{ latIndex, lngIndex, count }` + totals — no method returning a coordinate or a raw row.
- Route test R7: a cell object with an extra key (`inspectorId`) comes back stripped.
- DB test D11: rows from Postgres carry only `latIndex`, `lngIndex`, `count`.

## Acceptance → tests

| Code | Where proven |
|---|---|
| D.A1 (period, Sydney, exact boundaries) | D1, D6, D7, G7, G8 |
| D.A2 (`tenantId`/`inspectorId` change AM/OP result) | D2–D5, U2, U3 |
| D.A3 (no cross-tenant, no individual coord, k=3, presets) | U4–U21a, D2, D3, D11–D14, R6, R7, R9 |
| RBAC (`map.execution_density`) | M1, M2, U22 |
| check-in semantics (`DONE→REJECTED`, reopen) | D17, D18 |
