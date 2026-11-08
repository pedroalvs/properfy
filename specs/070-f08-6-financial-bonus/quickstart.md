# Quickstart — Verification

Run every command from inside the worktree
(`/Users/pedro/Code/GitHub/properfy/.claude/worktrees/070-f08-6-financial-bonus`). This environment
needs the **`run`** form of pnpm scripts (`pnpm --filter <ws> run <script>`; the bare form breaks
with "Unknown option: 'recursive'"). Heavy suites go through a condensed subagent.

## One-time worktree setup (already done by the setup subagent)

```bash
pnpm install
pnpm --filter backend exec prisma generate
pnpm --filter @properfy/shared build
pnpm --filter @properfy/frontend-standards build
```

## Shared first (consumed from dist)

```bash
pnpm --filter @properfy/shared run build
pnpm --filter @properfy/shared run test
```

## Migrations (apply locally, check the partial-index drift)

```bash
cd apps/backend
pnpm prisma:migrate --name financial_entry_type_inspector_bonus   # enum value alone
pnpm prisma:migrate --name inspector_bonus_ledger                 # columns/CHECKs/indexes
pnpm exec prisma validate
# confirm the partial unique index survives the generated SQL (project_prisma_drift_drops_unsupported_indexes)
```

## Backend

```bash
pnpm --filter backend exec prisma generate
pnpm --filter backend run typecheck
pnpm --filter backend run lint
pnpm --filter backend run test                      # unit + route-integration (Supertest)
# via subagent (condensed): real-DB suites
pnpm --filter backend run test:integration:db       # CHECKs, readers, concurrency, migration-over-dump
```

## Contract regen (commit both files)

```bash
cd apps/backend && DATABASE_URL="postgresql://u:p@localhost:5432/db" \
  JWT_PRIVATE_KEY="dummy" JWT_PUBLIC_KEY="dummy" pnpm generate:openapi
cd ../../packages/shared && pnpm generate:types && pnpm build
git diff --stat apps/backend/openapi.json packages/shared/src/api-types.ts   # expect only the F08-6 delta
```

## Web + PWA

```bash
pnpm --filter web run typecheck && pnpm --filter web run lint && pnpm --filter web run test
pnpm --filter web run test:e2e          # extends the F08-3 Rewards flow (bonus paid → "Paid" + PINV link; CL sees no "Bonus")
pnpm --filter pwa run typecheck && pnpm --filter pwa run lint && pnpm --filter pwa run test
```

## Manual QA (browser)

1. AM approves a reward → the ledger (AM Financial list) shows a `Bonus` line; CL_ADMIN of the
   servicing agency opens Financial → **no** "Bonus".
2. Inspector requests the period invoice → the `Bonus` line is on the invoice (web drawer + PWA
   invoice + PDF); AM approves and marks it paid → the Rewards tab shows "Paid" + "PINV-…".
3. AM voids a paid reward → a reversal appears on the inspector's next invoice; OP attempting the
   same void gets the 403 message.

## PR size gate

```bash
git diff --stat origin/develop... | tail -1   # must be < 150 files (expected ~55)
```
