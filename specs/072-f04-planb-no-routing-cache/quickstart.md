# Quickstart — F04 Plan B (PR-A) verification

Run from the worktree root. Shared must be built before backend typecheck.

```bash
pnpm --filter @properfy/shared build
pnpm --filter backend exec prisma generate
```

## Prove no routing result is persisted (SC-001)

```bash
# Integration-db test: publish/compute a plan, then assert the row columns are NULL
pnpm --filter backend test:integration:db -- day-plan-repository
```

Expect: after any compute/publish/reorder, `route_geometry`, `routing_matrix_json`, `leg_travel_json` are `NULL`.

## Prove geometry & routingInput come on-demand (SC-002)

```bash
pnpm --filter backend test -- get-my-day-plan
pnpm --filter backend test -- get-day-plan-for-operator
```

Expect: `GET /v1/inspector/day-plans/:date` → `response.geometry` non-null FeatureCollection **and** `response.routingInput` non-null, with the DB columns NULL. Operator GET → geometry non-null, `routingInput` null.

## Prove reorder preview recomputes the matrix (SC-004)

```bash
pnpm --filter backend test -- preview-day-plan-order
```

Expect: `POST /v1/inspector/day-plans/:date/order/preview` returns evaluated stops with `etaSource: 'MATRIX'`, recomputed matrix, persists nothing; > 30 req/min → 429.

## Prove the purge job is gone (SC-005)

```bash
pnpm --filter backend test -- workers
grep -r "day-plan.purge-route-data" apps/backend/src && echo "LEFTOVER!" || echo "purge removed"
```

## Contract freshness (FR-011)

```bash
pnpm generate:api
git diff --exit-code packages/shared/openapi.json packages/shared/src/api-types.ts || echo "regenerated — commit both"
```

## Full gates (run before PR)

```bash
pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test && pnpm --filter @properfy/shared typecheck && pnpm --filter @properfy/shared lint
pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test
pnpm --filter backend test:integration:db
```
