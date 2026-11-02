# Quickstart: Service Type Duration + Route Weights (web)

## Prerequisites (fresh worktree)

```bash
pnpm install
pnpm --filter backend exec prisma generate
pnpm --filter @properfy/shared build
pnpm --filter @properfy/frontend-standards build
```

## Make the shared contract change + regenerate

```bash
# edit packages/shared/src/schemas/service-type.ts (remove .default on create)
pnpm --filter @properfy/shared test        # service-type.test.ts (absent → invalid)
pnpm --filter @properfy/shared build
pnpm generate:api                           # regenerates openapi.json + api-types.ts
git add packages/shared/openapi.json packages/shared/src/api-types.ts
```

## Verify (inside the worktree, scoped)

```bash
# shared
pnpm --filter @properfy/shared test && pnpm --filter @properfy/shared build
# backend (full suite incl. integration — contract change)
pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test
pnpm --filter backend test:integration:db
# web
pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test
# e2e (two specs)
pnpm --filter web test:e2e -- route-weights.spec.ts service-type-duration.spec.ts
```

## Manual check (browser, as AM)

1. Service types → New: the "Estimated duration (min)" field is required (after Flow Type); save fails empty / 4 / 481 / 45.5; `60` creates; edit loads the stored value.
2. Platform settings → "Route planning": three weights at 1/1/1 ("Default"); set "Waiting for windows" to 0; pick an inspector (type to search) and a date (tomorrow, max +14); Preview shows two columns; the right one is flagged when the order changes; Save; reload shows 0.

## Acceptance ↔ contract codes

- SC-001 ⇒ **B5** (service-type estimated duration, required).
- SC-002 ⇒ **01.14** (route weights + preview).
- SC-003 ⇒ **L-F04-14** (server search, date range).
