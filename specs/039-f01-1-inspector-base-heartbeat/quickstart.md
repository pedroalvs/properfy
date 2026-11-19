# Quickstart — F01-1 (backend + shared)

## Build & verify (inside the worktree)

```bash
pnpm install
pnpm --filter backend exec prisma generate
pnpm --filter @properfy/shared build
pnpm --filter @properfy/frontend-standards build

# after schema changes:
pnpm --filter backend exec prisma migrate dev --create-only --name inspector_base_coords_app_state
#   inspect the generated SQL: 7 ADD COLUMN only, no dropped Unsupported() index
pnpm --filter backend exec prisma migrate dev   # apply locally
pnpm --filter backend exec prisma generate

# after any route schema change:
pnpm generate:api            # generate:openapi -> generate:types ; then:
pnpm --filter @properfy/shared build

# gates (run via a subagent that returns a condensed pass/fail):
pnpm --filter @properfy/shared lint && pnpm --filter @properfy/shared typecheck && pnpm --filter @properfy/shared test
pnpm --filter backend lint && pnpm --filter backend typecheck
pnpm --filter backend test                 # unit + route-integration
pnpm --filter backend test:integration:db  # testcontainers (serial)
```

## Backfill

```bash
# dry run (no Mapbox call, no config needed):
pnpm --filter backend tsx --env-file .env src/scripts/backfill-inspector-base-coords.ts
# apply (needs Mapbox permanent mode; aborts if unconfigured):
pnpm --filter backend tsx --env-file .env src/scripts/backfill-inspector-base-coords.ts --apply
```
Order: staging before prod; dry-run before apply. Report carries `estimatedRequests`; > US$200 needs dev sign-off.

## Manual smoke (local)

1. `POST /v1/inspectors` without `address` → 400 at path `address`.
2. `POST /v1/inspectors` with a valid AU address → 201, `baseLat`/`baseLng` numeric (stub geocoder → `baseGeocodeFailed:true`, coords null).
3. `PATCH /v1/inspectors/:id {address:null}` → 400.
4. `POST /v1/inspectors/me/app-state {displayMode:'standalone',pushPermission:'granted',appVersion:'dev'}` as INSP → 204; OP `GET` shows `appLastSeenAt`.
5. CL_ADMIN `GET /v1/inspectors/:id` → no `address`, coords or adoption keys.

## Definition of done

- All spec test cases pass (unit + integration + db suite) — TDD red→green.
- `openapi.json` + `api-types.ts` regenerated and committed; no manual edits.
- `apps/backend/CLAUDE.md` and `packages/shared/CLAUDE.md` updated for the new routes, columns, event, per-user rate-limit pattern and privacy rule.
- Scoping test proves CL_*/INSP cannot read another inspector's base/coords/adoption.
- PR ≤ 150 files; branch pushed; PR opened against `develop`.
