# Quickstart — Verifying Early Offer Access

Backend + shared slice, no migration. Run everything from the worktree root.

## Build prerequisites

```bash
pnpm --filter @properfy/shared build      # web/pwa/backend typecheck resolve shared from dist/
pnpm --filter backend exec prisma generate
```

## TDD order (red → green → refactor)

1. **Domain** — `service-group/domain/early-access.test.ts`
   - `resolveEarlyAccessParams`: disabled → null; viewer qualifies → null; no snapshot → null; happy path → the 5-field params (`protectedFrom = today+2`); `enabled true`+`enabledAt null` → null + `warn marketplace.early_access_missing_enabled_at`.
   - `isGroupInEarlyAccess`: null params / null publishedAt / `publishedAt ≤ cutoff` / `publishedAt < enabledAt` / `scheduledDate < protectedFrom` / `!hasQualifiedEligible` → false; else true.
   - `formatOpensAt`: `2026-11-10T11:00:00Z` → `'Tue 10 Nov'` + `'10:00 pm'` (Sydney/AEDT); identical with `TZ=America/Los_Angeles`.
2. **Settings hook** — `inspector-program/application/prepare-inspector-program-setting-for-save.test.ts`
   - false→true (client sends old `enabledAt`) → `now.toISOString()`; true→true (hours 12→24) → previous `enabledAt` kept; true→false → null; false→false → null; no prior record → `now.toISOString()`.
3. **Policy** — `inspector-program/application/offer-early-access.policy.test.ts` wraps `hasEarlyAccess` cases and asserts a single resolution per request.
4. **Use cases** — add to `get-marketplace-offers`, `get-marketplace-offer-detail`, `accept-offer` specs: policy resolved once; params threaded to repo; accept 403 before `acceptOptimistic`; L-F08-08 published-before-`enabledAt` accepts; D+1/today accept; no-qualified-eligible accepts; disabled accepts; idempotency-cache short-circuit.
5. **Real DB** — `tests/integration/db/marketplace-early-access.db.test.ts` (Testcontainers + PostGIS): the G1–G9 matrix (today fixed `2026-11-10` Sydney, Gina Gold/R/T, Sam Silver/R/T, Gus Gold/only-S), count matches list ids, detail 404 for Sam/detail for Gina, pagination before LIMIT/OFFSET, session tz `Australia/Sydney` and `UTC` agree, clock-advance to `published_at + 12h` makes Sam see G1, activation-with-live-offers (enabledAt = now−30m), empty snapshot table → Sam sees all.
6. **Route** — `tests/integration/marketplace-early-access.routes.test.ts` (Supertest): Sam's accept of G1 → 403 with the Sydney message + `details.opensAt`; Sam's `GET /offers` omits G1 with a coherent `total`; AM PUT `inspectorProgram` false→true → `enabledAt` = PUT instant on the next GET + audit `after`.

## Gates (inside the worktree, via subagent for the backend suite)

```bash
pnpm --filter @properfy/shared build
pnpm --filter backend exec prisma generate
pnpm --filter @properfy/shared lint && pnpm --filter @properfy/shared typecheck && pnpm --filter @properfy/shared test
pnpm --filter backend lint && pnpm --filter backend typecheck
pnpm --filter backend test                 # unit + route-integration
pnpm --filter backend test:integration:db  # real PostGIS (serial)
pnpm generate:api                          # regenerate openapi.json + api-types.ts; commit both
git diff --stat origin/develop... | tail -1   # must be < 150 files
```

## Manual smoke (optional)

- Default: `GET /v1/platform-settings/inspectorProgram` shows `earlyAccess.enabled=false` — marketplace behaves exactly as before.
- Switch on via `PUT` as AM → `enabledAt` is the server instant; a new D+3 offer published now is hidden from a Silver inspector and refused on accept with the Sydney "opens at" message, while a Gold inspector takes it; a D+1/today offer stays open to all.
