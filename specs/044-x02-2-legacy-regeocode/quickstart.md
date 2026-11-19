# Quickstart: Legacy Permanent Re-Geocoding

**Feature**: `044-x02-2-legacy-regeocode`

## What this is

A one-off backend maintenance CLI that brings legacy stored coordinates into Mapbox permanent-mode compliance. **Built and merged now; executed later** (a human OPS step gated on TASK-X02-1 being in production). Dry-run by default — an accidental run writes nothing.

## Build & verify (this PR)

```bash
# from the worktree root
pnpm --filter @properfy/shared build
pnpm --filter backend exec prisma generate

# TDD unit suite for the script
pnpm --filter backend test -- regeocode-permanent

# DB integration suite (real Postgres + PostGIS via testcontainers)
pnpm --filter backend test:integration:db -- regeocode-permanent

# gates
pnpm --filter backend lint
pnpm --filter backend typecheck

# local dry-run smoke (no Mapbox call, needs a DB)
pnpm --filter backend tsx --env-file .env src/scripts/regeocode-permanent.ts --strip-import-previews
```

No migration, no `pnpm generate:api` (no route/schema change).

## Execute (later — OPS, not this PR)

1. Confirm TASK-X02-1 is in production.
2. **Staging**: dry-run `--strip-import-previews` → review counts → `--apply --limit=20` → review the report and a few pins → full `--apply --strip-import-previews` → re-run and confirm `scanned: 0`.
3. Attach the staging reports. Run the prod **dry-run** via `fly ssh console`; compute `estimatedRequests.total × US$ 0.005`. Above US$ 200, get dev sign-off.
4. **Prod**: same script, outside Sydney business hours.
5. Hand operations the `noResult`, `falseManual.ambiguous` (prioritizing `addressChangedAfterTransition: true`) and `falseManual.missingAudit` lists + the count of properties without a marker — the input to the F03 geofence BLOCK audit.
6. If the account refused at any point: fix it, then `--retry-failed-permanent --apply`.

See `docs/runbooks/regeocode-permanent.md` for the full rollout, cost formula and manual-correction recipe.

## Primary user stories (spec)

- **US1 (P1)**: legacy properties & branches re-geocoded, idempotent, CAS-safe, reported.
- **US2 (P1)**: false-MANUAL detected via audit (two proofs) and restored; ambiguous/missing listed.
- **US3 (P2)**: committed import previews stripped of temporary coordinates.
- **US4 (P2)**: bulk resume of account-blocked properties.

## Key invariants to keep green

- Dry-run: zero writes, zero Mapbox, zero enqueue (CA6).
- Every coordinate write keeps PostGIS `coordinates` consistent (CA2) and is CAS-guarded on `updated_at` (CA12).
- `noResult` keeps its coordinate; never turns a MANUAL into FAILED (CA3, CA8).
- A `MANUAL` changes only on Proofs 1 **and** 2 (CA8, CA11).
- Account error aborts without writing (CA7).
