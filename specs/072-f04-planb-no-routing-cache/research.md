# Phase 0 Research — F04 Plan B (PR-A)

All items below are IMPLEMENTED REALITY (current code) or APPROVED RULES (coordinator/L-F04-03 decisions). No unresolved NEEDS CLARIFICATION remain.

## D1 — Where Mapbox results are persisted today (IMPLEMENTED REALITY)
- **Decision**: Stop writing in two places. `compute-day-plan.use-case.ts` builds `SaveDayPlanInput` with `routeGeometry: result.geometry` (~line 230), `routingMatrix: result.matrix` (~231), `legTravel: ...` (~232); `prisma-day-plan.repository.ts#mapPlanFields` writes `route_geometry`/`routing_matrix_json`/`leg_travel_json` (~306-308). Both stop sending/writing these.
- **Rationale**: Mapbox ToS forbids storing Matrix/Directions results (L-F04-03, resolved Plan B 2026-11-02).
- **Alternatives considered**: Encrypt-at-rest (still "storage", rejected); shorten purge window (still storage, rejected).

## D2 — On-demand geometry & routingInput for GET (APPROVED RULE)
- **Decision**: The response builder currently reads `record.routeGeometry`/`record.routingMatrix` from the DB. Under Plan B those are null, so the GET use-cases must **recompute** on demand and pass fresh results to the builder. Recompute preserves the stored stop order (no re-optimization): run Directions per leg for `geometry` and Matrix over the points for `routingInput`.
  - **INSP GET** (`get-my-day-plan`): recompute **both** `geometry` and `routingInput` (the PWA consumes both).
  - **AM/OP GET** (`get-day-plan-for-operator`): recompute `geometry` (keeps 01.A1 uniform; preserves the published-plan-has-traçado semantics); `routingInput` returns `null` (there is no operator reorder and web consumes neither day-plan field).
- **Rationale**: Keeps the merged PWA (`RouteMapView.tsx:107` reads `plan.geometry`; `reorder-draft.ts:131/134` reads `plan.routingInput`) working with no PWA change in PR-A (Q1 + Q2, coordinator 2026-11-02).
- **Alternatives considered**: Dedicated geometry-only endpoint (would require a PWA change → deferred as a future optimization per Q1); returning null geometry (breaks the PWA map → rejected).

## D3 — Reorder / recalculate recompute Matrix on demand (APPROVED RULE)
- **Decision**: `save-day-plan-order.use-case` (REORDER) and the `PRESERVE_ORDER` recompute path stop passing `cachedMatrix: existing?.routingMatrix` (compute-day-plan.use-case.ts:163). `plan-route.service` already calls `routing.matrix(...)`; removing the cached reuse makes every reorder recompute the Matrix on demand (+1 Matrix per save). `recalculate` already runs a fresh compute — unchanged except it no longer persists results.
- **Rationale**: No stored matrix exists to reuse (Plan B). Matches L-F04-03 variant (b)+(c) denied.
- **Alternatives considered**: Keep cached matrix in memory across a request (no cross-request cache allowed; single compute per request is already the shape).

## D4 — New endpoint `POST /v1/inspector/day-plans/:date/order/preview` (APPROVED RULE)
- **Decision**: Add an INSP route + `preview-day-plan-order.use-case` that takes a candidate stop order, recomputes the Matrix on demand, evaluates the sequence with the existing `evaluateSequence`/optimizer helpers, returns per-stop ETA/wait/late + totals with `etaSource: 'MATRIX'`, and persists nothing. Rate-limited to **30 req/min per inspector** (application-level, on top of the shared Mapbox limiter). The existing `DAY_PLAN_ALREADY_STARTED` (L-F04-07) guard still applies.
- **Rationale**: Gives the PWA a server-side reorder path so PR-B (Bússola) can drop the client-side matrix math. The orphaned `routeWeightsPreview*` schemas in shared are for AM/OP route-weight tuning, not INSP reorder — a new, purpose-built contract is clearer.
- **Alternatives considered**: Reuse AM/OP `/v1/day-plans/preview` (different actor, different payload — route-weights not reorder; rejected).

## D5 — 30/min preview rate limit mechanism (IMPLEMENTED REALITY + APPROVED RULE)
- **Decision**: Reuse the standard Fastify rate-limit error builder (memory: rate limiter THROWS a typed error) keyed per inspector + route. Mapbox provider calls stay governed by the shared Postgres token-bucket limiter.
- **Rationale**: Consistency with existing rate-limited routes (F01-1 `/me/app-state`).
- **Alternatives considered**: New Postgres bucket for preview (overkill; the per-inspector app limit suffices).

## D6 — Rate-limit / provider-failure fallback on GET (APPROVED RULE)
- **Decision**: When the Mapbox bucket is exhausted or the provider defers, on-demand GET geometry/routingInput degrade to the **stub** (approximate straight segments, `approximate: true`, `approximateReason`), never failing the GET. This preserves "develop never breaks".
- **Rationale**: A GET that an inspector opens must not 5xx because the limiter is drained. The stub path already exists in `plan-route.service` (TOO_MANY_COORDINATES / NO_PROVIDER).
- **Alternatives considered**: Return 503 on GET (breaks the schedule screen; rejected). Strict `RoutingDeferredError` is reserved for the job/publish path, not interactive GET.

## D7 — Remove the purge job (IMPLEMENTED REALITY → delete)
- **Decision**: Remove the `day-plan.purge-route-data` schedule + handler (`workers.ts` ~386-393), `PurgeDayPlanRouteDataUseCase`, repo `purgePastRouteData` (~190-198), `geometry_purged_at` writes, and the purge test. Column `geometry_purged_at` stays nullable/unused until PR-C.
- **Rationale**: Nothing to purge once storage stops.
- **Alternatives considered**: Leave a no-op job (confusing dead schedule; rejected).

## D8 — No migration in PR-A (APPROVED RULE — expand/contract)
- **Decision**: PR-A ships no Prisma migration. `route_geometry`, `routing_matrix_json`, `leg_travel_json`, `geometry_purged_at` remain nullable and simply stop being written/read. The column drop is a PR-C migration after PR-B.
- **Rationale**: Expand/contract; develop never breaks; a mid-rollout drop would be premature.

## D9 — api-types regeneration non-breaking (IMPLEMENTED REALITY)
- **Decision**: Run `pnpm generate:api`; commit `openapi.json` + `api-types.ts`. New preview route adds paths; geometry/routingInput retained → no breaking change to existing consumers.
- **Rationale**: CI `contract-freshness` gate.
