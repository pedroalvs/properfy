# Phase 0 Research: Permanent Geocoding Compliance

All NEEDS CLARIFICATION from Technical Context are resolved. The source task (`fase2-etapa1/tarefas/X02-tarefas.md` → TASK-X02-1) pre-decided most design points (dec. 1–26, L-X02-01..09); this file records the research-shaped decisions and the live Mapbox spike.

## R1. Mapbox permanent geocoding — v5 vs v6 (the spike)

- **Decision**: Use Mapbox Geocoding **v5** (`GET https://api.mapbox.com/geocoding/v5/mapbox.places/{q}.json?access_token=…&limit=1&permanent=true`), built with `URLSearchParams`. Read coordinates from `features[0].center = [lng, lat]`. The v6 contingency is NOT triggered.
- **Rationale**: Spike on 2026-10-29 against the dev account (server `sk.` token, address `1 Martin Place, Sydney NSW`):
  - v5 `mapbox.places` + `permanent=true` → **HTTP 200** with rooftop coords `center = [151.207639, -33.867753]`.
  - v5 `mapbox.places-permanent` (dedicated permanent endpoint) → **HTTP 200** (a non-entitled account 403/404s here) ⇒ account is permanent-entitled.
  - v5 without `permanent` → 200 identical (baseline/temporary).
  - Invalid token → **HTTP 401** `{"message":"Not Authorized - Invalid Token"}` ⇒ error envelope is a flat `{"message": string}`.
  - No-result query → 200 `features: []` ⇒ null path.
  - v6 `search/geocode/v6/forward?q=…&permanent=true` → 200, coords in `features[0].geometry.coordinates = [lng, lat]` (verified viable, reference only).
- **Alternatives considered**: v6 forward (kept as the documented fallback for a future account that loses v5 permanent); `mapbox.places-permanent` as the primary write endpoint (rejected — the task's chosen shape is the regular endpoint with the `permanent` flag, and changing the autocomplete/connection-test endpoints is out of scope).
- **Residual gap**: the CA9 positive proof (the "Permanent Geocoding API" billing counter rising) is dashboard-only and cannot be obtained from a token. It stays a human pre-deploy smoke gate (dev/staging/prod) in `docs/ops/pre-deploy-smoke-checklist.md`; the `places-permanent` 200 is the programmatic entitlement signal recorded in its place.

## R2. Account-error detection without relying on message text

- **Decision**: An account error is `status ∈ {401, 403, 422}` **and** (`message` contains "permanent", case-insensitive, **or** matches the spike refusal format). If not text-distinguishable, HTTP 403 alone counts as an account error (dec. 14). Raise `MapboxPermanentGeocodingUnavailableError` (code `MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE`).
- **Rationale**: The dev account does not refuse, so no literal refusal body is observable. The provisional test fixture (HTTP 403 + a `permanent`-mentioning body) plus the 403-without-"permanent" fallback cover both observed and documented cases. A valid token never 403s today, so treating 403 as an account error is safe.
- **Alternatives considered**: matching on message text only (rejected — fragile and the account may refuse with an opaque body); matching on any 4xx (rejected — would swallow 400/404 as account errors and suppress legitimate retries).

## R3. Circuit-breaker interaction

- **Decision**: The adapter returns a sentinel from inside the `CircuitBreaker.execute` callback and raises `MapboxPermanentGeocodingUnavailableError` **outside** the breaker, so an account error neither increments the failure count (does not open the breaker after 5) nor is masked as `Circuit breaker OPEN`.
- **Rationale**: Account errors are deterministic, not transient; counting them would wrongly trip the breaker and change the error surfaced to the worker (which keys retry suppression off the specific code).
- **Alternatives considered**: a custom "don't count this error" breaker option (rejected — more surface than needed; the sentinel pattern is local and testable).

## R4. Shared contracts for F01 (naming is a cross-feature contract)

- **Decision**: Export `formatGeocodingQuery(address)` and `isSameGeocodingAddress(a, b)` from `apps/backend/src/shared/domain/geocoding-address.ts`, and `GEOCODE_SYNC_TIMEOUT_MS` + `geocodeWithTimeout(service, address, opts?)` from `apps/backend/src/modules/property/application/services/geocode-with-timeout.ts`. Branch use cases consume both now; F01 (inspector base address) consumes them later.
- **Rationale**: Fixed names/paths let F01 depend on them without a later rename. `geocoding-address.ts` sits beside the existing `normalize-address.ts`; the timeout helper sits beside the `IGeocodingService` port already imported by `integration` and `appointment`, so no new import cycle.
- **Equivalence lock (dec. 23)**: while `PropertyEntity.fullAddress` exists, `formatGeocodingQuery(entity)` must equal `entity.fullAddress`; a unit test enforces it so F01 can migrate property geocoding to the formatter safely.

## R5. PostGIS consistency

- **Decision**: lat/lng and `coordinates GEOMETRY(Point,4326)` are written only through `prisma-property.repository.ts` (`syncCoordinates` on `save` and on `update` when the tenant-scoped `updateMany` affected a row). No write path uses a direct `prisma.property.update` for coordinates.
- **Rationale**: Any out-of-band lat/lng write silently desyncs the spatial column, breaking the map features this task unblocks. The migration must also not drop the `Unsupported()` spatial index (memory `project_prisma_drift_drops_unsupported_indexes`).
- **Alternatives considered**: a DB trigger syncing `coordinates` (rejected — out of scope, and Prisma `Unsupported` columns are already app-synced).

## R6. False-`MANUAL` fix — coordinate equality

- **Decision**: Compare incoming lat/lng against the stored `Decimal(10,7)` values at **7 decimal places** by normalizing both sides with `Number(x.toFixed(7))`. Equal ⇒ ignore (status/marker unchanged). Different ⇒ `MANUAL`, marker null, no job. Null/null in non-MANUAL or an incomplete pair ⇒ ignore. The invariant "never `MANUAL` with a null coordinate" holds in every branch. The web sends the coordinate pair only when a parsed value differs from the initial, and sends `null, null` only to unlock a MANUAL property.
- **Rationale**: Prisma `Decimal` vs JS `number` needs explicit normalization; 7 dp matches the column precision (~1 cm) so Mapbox round-trips compare equal.
- **Alternatives considered**: strict string equality on the Decimal (rejected — `-33.8` vs `-33.8000000` would falsely differ); float `===` (rejected — precision drift).

## R7. Pre-deploy import previews

- **Decision**: Add optional `mode: z.literal('permanent')` to the import `found` verification variant; the commit worker treats `found` **without** `mode` as `unverified` → `PENDING` + geocode job (no stored coordinate). The verifier short-circuits a batch on an account error (one Mapbox call, one `error` log, the rest `unverified`).
- **Rationale**: Removes any X02-2 dependency for in-flight imports and prevents committing a pre-deploy temporary coordinate. The optional literal must be declared or Fastify serialization strips it.
- **Alternatives considered**: a DB migration flag on imports (rejected — heavier; the preview JSON already carries the verification).

## R8. Retry suppression & cost

- **Decision**: `findFailedGeocoding` adds `geocoding_failure_code IS NULL`; add `countBlockedFailedGeocoding`; the retry sweep logs a `skippedCount`. The daily sweep cost (`countFailedGeocoding − countBlockedFailedGeocoding × US$ 0.005`) is measured at rollout (dec. 22) to decide whether the 24-h cool-off stays or becomes weekly (separate task).
- **Rationale**: An account error must not re-bill a (possibly billable) request per property per day; a `null`-result FAILED still retries normally.
