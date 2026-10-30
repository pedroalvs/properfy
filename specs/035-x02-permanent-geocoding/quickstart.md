# Quickstart: Permanent Geocoding Compliance

## Prerequisites
- Worktree off `origin/develop`; `pnpm install`; `pnpm --filter backend exec prisma generate`; `pnpm --filter @properfy/shared build`.
- `apps/backend/.env` with `MAPBOX_ACCESS_TOKEN` (dev `sk.` token) for the integration-db test and local smoke.

## Build order (TDD, red→green per step; mirrors the source task steps 0–9)
1. **Spike (done 2026-10-29)** — v5 confirmed; recorded in `research.md` and `docs/ops/pre-deploy-smoke-checklist.md`.
2. **Port + helpers** — `geocoding.service.ts` (mode + error class), `geocode-with-timeout.ts`, `geocoding-address.ts`, stub, `dynamic-providers.ts` (passthrough + `isConfigured`).
3. **Mapbox adapter** — `permanent=true` default, account-error outside breaker.
4. **Migration + entity + repos** — expand-only columns; `property.entity`/`branch.entity`; repo `update`/`findFailedGeocoding` filter/`countBlockedFailedGeocoding`.
5. **Property write paths** — `create`/`geocode`/worker/retry-worker; import verifier batch short-circuit; `import.ts` schema `mode`; commit worker.
6. **MANUAL fix** — `update-property.use-case` 7-dp compare + null/incomplete rules; web `usePropertySave`/`PropertyFormDrawer`.
7. **Branches** — `address.ts` schema drop lat/lng; `create/update-branch.use-case` with formatter + timeout + `isSameGeocodingAddress`; `container.ts` wiring order; `useBranchSave`.
8. **Regenerate contract** — `pnpm --filter backend generate:openapi && pnpm --filter @properfy/shared generate:types && pnpm --filter @properfy/shared build`.
9. **Docs** — `docs/ops/pre-deploy-smoke-checklist.md`, `docs/fly-deploy-guide.md`, `apps/backend/CLAUDE.md` §10 N4 clause removal.

## Verification (inside worktree)
```bash
pnpm --filter backend exec prisma generate && pnpm --filter backend exec prisma migrate dev
pnpm --filter backend generate:openapi && pnpm --filter @properfy/shared generate:types && pnpm --filter @properfy/shared build
pnpm --filter @properfy/shared test && pnpm --filter backend lint && pnpm --filter backend typecheck && pnpm --filter backend test
pnpm --filter backend test:integration && pnpm --filter backend test:integration:db -- property-geocode-permanent   # via subagent
pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test -- PropertyFormDrawer usePropertySave useBranchSave
grep -n "until it merges" apps/backend/CLAUDE.md   # must be absent in N4
grep -n "geocoded_permanently_at\|MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE" apps/backend/CLAUDE.md  # ≥1 each
```

## Smoke (human, per environment — CA9)
Run the confirmed v5 URL with the env's server token; expect 200 + coords **and** the account's "Permanent Geocoding API" counter rising (positive proof — a 200 alone is insufficient). Then: create a property (marker + `coordinates` set), edit it without touching coordinates (stays SUCCESS), save a branch (`addressJson.latitude` present).
