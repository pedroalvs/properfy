# Quickstart / Verification — TASK-F06-2

Run everything inside the worktree `058-f06-2-tenant-notice-triggers`.

## Prerequisites (once per fresh worktree)

```bash
pnpm install
pnpm --filter backend exec prisma generate
pnpm --filter @properfy/shared build          # backend/tests consume shared from dist
```

## TDD gates (the real correctness gate)

```bash
pnpm --filter @properfy/shared build
pnpm --filter backend exec prisma generate
pnpm --filter backend typecheck
pnpm --filter backend lint
pnpm --filter backend test                     # unit + route-integration (notifier, use cases, subscribers, consent fix, workers)
pnpm --filter backend test:integration:db      # morning end-to-end over real PostGIS (test 22)
```

Shared is backend-only here, but if any shared file is touched also run `pnpm --filter @properfy/shared test`.

## Acceptance smoke (maps tests → criteria)

- **01.12-B**: morning use case at 07:00 → MORNING for A/B/C with exact bands; at 09:00 → nothing (tests 11–13).
- **01.10**: FINISH subscriber (only `INSPECTOR_FINISH`) + CANT_DO subscriber → ON_THE_WAY for the right next stop; manual DONE → nothing (tests 28–33, 43b–43h).
- **01.A7 / 01.12**: late-notice + sweep → one DELAY for C; three triggers racing → exactly one row per channel (tests 40, 44, 50–52).
- **01.A5**: threshold 30 vs 20 (test 45).
- **L-F06-01/02/04/05/06/11 + D15**: lead ≤ 60 min, confirmation skips, check-out-only, early-change, agency flag, metrics/volume, SMS reserve (tests 33b–d, 5c/20b, 28/28a/28c, 49c–g, 5b/22, 8/49b, 10b–e/46b).
- **Consent email casing (SC-013)**: the consent test blocks a differently-cased send of a recorded email opt-out; fails on `develop` before the fix.

## Diff size

```bash
git diff --stat origin/develop... | tail -1     # expect < 150 files (~30)
```

## No-migration / no-contract-change guard

```bash
git diff --name-only origin/develop... | grep -E 'prisma/migrations|api-types.ts|openapi.json' && echo "UNEXPECTED — F06-2 adds none" || echo "clean (expected)"
```

## Rollout (reference)

Deploys with `tenantEtaNotices.enabled` default `false`; an AM/OP turns it on in Platform settings per environment. Rollback = flip `enabled` off (≤ 30 s cache); reverting code is safe (no schema).
