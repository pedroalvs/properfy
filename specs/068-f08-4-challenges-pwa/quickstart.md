# Quickstart — F08-4 Challenges (PWA) + performance messages

## Prerequisites (fresh worktree)

```bash
pnpm install
pnpm --filter backend exec prisma generate
pnpm --filter @properfy/shared build
pnpm --filter @properfy/frontend-standards build
```

## TDD order (red → green per unit)

1. **Shared** — `inspector-notices.test.ts` (`/profile/challenges` allowed, negatives rejected) → add `/profile/challenges` + `INSPECTOR_CHALLENGES_PATH`; `inspector-program.test.ts` (`inspectorProgramResponseSchema`, `rankingEntrySchema` `.strict()`) → add schemas. Then `pnpm --filter @properfy/shared build`.
2. **Backend pure** — `ranking-anonymiser.test.ts`, `program-message-copy.test.ts` → implement the pure functions.
3. **Backend use case** — `get-inspector-program.use-case.test.ts` → implement the use case + the two reader ports.
4. **Backend route** — `inspector-program-inspector.routes.test.ts` (Supertest: 200 shape, **03.A3 anonymity**, RBAC 403s, 400 `INSPECTOR_NOT_LINKED`, 401) → add the route + wire the container.
5. **Backend steps** — `program-message-steps.test.ts` (all trigger/aggregation/level/streak/guard cases) → implement the three steps + append to the daily-step array.
6. **PWA** — `ChallengesPage.test.tsx` + component/hook tests → implement the feature, route, tile, tour step.
7. **Contract** — `pnpm generate:api`; commit `openapi.json` + `api-types.ts`.

## Verification (inside the worktree, gates via a subagent that returns a condensed summary)

```bash
pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test
pnpm --filter backend exec prisma generate
pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test
pnpm --filter backend test:integration   # 4 db-less integration tests touched; full suite incl. integration via subagent
pnpm generate:api                          # must leave no diff after commit (CI contract-freshness)
pnpm --filter pwa typecheck && pnpm --filter pwa lint && pnpm --filter pwa test
pnpm --filter pwa test:e2e                 # Chromium + WebKit; CI fallback authorised if the local runner is blocked
git diff --stat origin/develop... | tail -1   # < 150 files
```

## Manual QA (DB9)

- iOS Simulator + installed Android/Chrome: open **More → Challenges**, switch Active / My results / Ranking; confirm the progress bar reads out (`aria-valuetext`), the ranking shows **no names**, the cohort<5 and not-ranked states render, and a tapped push opens `/profile/challenges`.

## Rollback

- `INSPECTOR_PROGRAM_JOBS_ENABLED=false` disables the compute + messages together; reverting the PWA hides the tile. No migration to reverse.
