# Phase 0 Research — F04-2b Preview route weights

All building blocks already exist on `develop @ 5657ea6d` (F04-1 + F04-2). No NEEDS CLARIFICATION remains; the premises are recorded in `spec.md` §Clarifications. This file records the design decisions.

## Decision 1 — Matrix-only two-variant evaluation lives in `PlanRouteService.previewWeights`

- **Decision**: Add a `previewWeights(input)` method to the application-layer `PlanRouteService`. It builds the point list exactly as `compute()` does, resolves the travel matrix **once** (reusing the private `resolveMatrix`, interactive mode, non-strict), then for each weight set runs `optimizeRoute` + `evaluateSequence` over that shared matrix. It makes **no** Directions call.
- **Rationale**: `resolveMatrix` already encapsulates provider selection, the Postgres rate limiter (`maxWait`), null-pair fill, too-many-coordinates and stub fallback. Duplicating that in the use case would re-import infrastructure concerns and drift. Keeping it on `PlanRouteService` preserves Clean Architecture (the use case depends on this application service, which depends on the `IRoutingService` port). The contract "1 Matrix / 0 Directions" is structurally guaranteed because `previewWeights` never enters the Directions loop.
- **Alternatives considered**: (a) Call `IRoutingService.matrix` directly from the use case — rejected: duplicates rate-limit/fallback logic, leaks matrix normalization into the use case. (b) Reuse `compute()` twice — rejected: `compute()` always runs the per-leg Directions pass (would be 2 Matrix + N Directions and would need persistence plumbing).

## Decision 2 — `current` = saved platform `routeWeights`; `proposed` = request weights; shared matrix

- **Decision**: `PreviewRouteWeightsUseCase` reads `IPlatformSettingsReader.get('routeWeights')` for `current` and uses `request.weights` for `proposed`; `PlanRouteService.previewWeights` takes both and evaluates each against the single matrix.
- **Rationale**: Matches F04-2 contract 01.14 and test 13 (Example 6: saved `{1,1,1}` → `current.order [A,C,B]`; proposed `{1,0,1}` → `proposed.order [A,B,C]`, `proposed.totals.waitS 2100`). The weights only affect the optimizer ordering, not the matrix, so one matrix serves both.

## Decision 3 — Origin = inspector base (→ none), no persisted override, never LAST_STOP; reorderable = non-executed

- **Decision**: Resolve the origin from the inspector context only: `baseLat/baseLng` → `{source:'BASE'}`, else `{source:'NONE'}`. The preview loads **no** day-plan row, so there is no saved origin override to read (the override branch of the compute use case does not apply here). Exclude executed stops via `classifyStops`.
- **Rationale**: A preview is a what-if on weights, independent of live execution and of any saved per-day override (`LAST_STOP` is an effective-origin concern for a started day, L-F04-07; an override lives on a persisted plan this read-only path never loads). A future-dated preview normally has no executed stops; using `classifyStops` keeps it correct if `date` is today. Matches test 13 (Example 6 uses the base as origin).

## Decision 4 — Date range against the actor's effective timezone

- **Decision**: Compute `todayCivil = civilDateInTimezone(now, actor.timezone ?? PLATFORM_TIMEZONE)` and the +14 bound in the same tz; reject out-of-range `date` with `dayPlanPreviewDateOutOfRange()` (422) **before** any routing call.
- **Rationale**: L-F04-14 ("today..today+14 in the actor's effective tz"). `AuthContext.timezone` is already resolved per request to `users.timezone ?? PLATFORM_TIMEZONE` for AM/OP. Test: actor Sydney, `now = 2026-11-04T23:00:00Z` → 2026-11-05 and 2026-11-19 accepted; 2026-11-04 and 2026-11-20 → 422 without calling routing.

## Decision 5 — RBAC via `assertRoles`, action `day_plan.preview_weights`; no role-matrix entry

- **Decision**: `authorizationService.assertRoles(actor, ['AM','OP'], { action: 'day_plan.preview_weights', entityType: 'DayPlan' })`, mirroring the sibling day-plan use cases. The route helper `requireOperator` already guards at the edge for the sheet/metric routes; the use case asserts authoritatively.
- **Rationale**: `assertRoles` is freeform — the action string feeds only the denial audit/message, not `role-matrix.ts`. The day-plan actions (`day_plan.view`, …) are not role-matrix keys; `role-matrix.ts` holds only CL-conditional actions. No append needed (documented premise P1).

## Decision 6 — Static route ordering

- **Decision**: Register `POST /v1/day-plans/preview` as a static path. Fastify's radix router prefers a static segment over the `:inspectorId/:date` param route, so there is no collision (same treatment as `GET /v1/day-plans/eta-accuracy`). A route-collision test asserts it.
- **Rationale**: F04-2 test 24; avoids a `preview` being swallowed as `:inspectorId`.

## Decision 7 — No persistence, no schema change

- **Decision**: The use case writes nothing; the response omits geometry and `routingInput`. No migration, no Prisma change.
- **Rationale**: Preview is read-only. The response schema `routeWeightsPreviewSchema` carries only order/ETA/totals/feasible + per-stop display fields.
