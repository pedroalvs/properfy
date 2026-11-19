# Quickstart — Inspector Program Report (`INSPECTOR_PROGRAM`)

## Build order (matches the dependency chain)

```bash
# from the worktree root
pnpm --filter @properfy/shared build          # after the enum addition
pnpm --filter backend exec prisma generate    # after the schema enum + migration
pnpm generate:api                             # OpenAPI + api-types (after the shared enum)
```

## Verify (gates, inside the worktree)

```bash
pnpm --filter @properfy/shared build test
pnpm --filter backend exec prisma generate
pnpm --filter backend typecheck lint test     # includes the reader test (tests/integration/report/, real DB harness, NOT excluded)
pnpm --filter backend test:integration:db     # full-suite completeness (existing tests/integration/db/*; none added here)
pnpm --filter web typecheck lint test
git diff --stat origin/develop... | tail -1   # < 150 files
```

## Manual QA (browser)

1. Sign in as **AM** (or OP). Go to **Reports → Generate Report**.
2. Report type → **Inspector program**. Confirm Agency, Branch, Suburb, Status, Date axis and "Group by property" are hidden.
3. Pick a date range covering a closed goal period; **Generate**. The run appears with the "Inspector program" chip; when `READY`, download the XLSX.
4. Open the XLSX: one worksheet, the 31 columns, one row per reward (+ no-achievers / skipped rows). No raw ids.
5. Sign in as **CL_ADMIN**: confirm "Inspector program" is **not** in the type dropdown; a crafted `POST /v1/reports` with `INSPECTOR_PROGRAM` returns 403.

## Seeding a verifiable state (for the DB integration test / local QA)

- Two goals (e.g. a `VOLUME` and a `REGION_VOLUME`); 3 closures with `period_end` inside the range; rewards across `PENDING`, `APPROVED` (un-invoiced), `APPROVED` (on a CLOSED invoice), `PAID` (on a PAID invoice), `VOID` (pre-invoice), `VOID` after paid with a reversal on a later CLOSED invoice; one closure with no achievers; one `SKIPPED_INACTIVE` closure.
- Assert: one row per reward + one per no-achievers + one per skipped; order `period_start`, title, P9; instants in requester tz; civil dates `YYYY-MM-DD`; `Invoice`/`Reversal invoice` as `PINV-00000N`; `Ledger status` from the bonus entry; no agency/coordinate/raw-id column.

## Rollback

Revert the code; the `INSPECTOR_PROGRAM` enum value stays in the DB unused (harmless). Generated files expire by the 30-day retention.
