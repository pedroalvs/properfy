# PR-A Implementation Brief — F04 Plan B (no routing result storage)

Read `spec.md`, `plan.md`, `research.md`, `data-model.md`, `tasks.md`, `contracts/inspector-day-plan-order-preview.md` in this folder first. This brief fills the subtle design that tasks.md references. **TDD: write the failing test first for every behavioural change.** No references to Claude/Anthropic anywhere. No Prisma migration in this PR.

## The core architectural change (the hinge)

`buildDayPlanResponse` (`apps/backend/src/modules/day-plan/application/day-plan-response.builder.ts`) currently reads `record.routeGeometry`, `record.routingMatrix`, `record.legTravel` from the persisted record (lines 92-102, 149). Under Plan B those DB columns are never written, so for a **fresh published plan** (which `GetMyDayPlanUseCase.resolveRecord` returns as-is, without recomputing) they would be null → the PWA map line + reorder break.

**Fix — inject on-demand routing into the builder:**

1. Add an optional last param to `buildDayPlanResponse`:
   ```ts
   routing?: {
     geometry: DayPlanGeometry | null;
     matrix: StoredRoutingMatrix | null;   // points + travelS (+ provider/profile)
     legs: Array<{ fromKey: string; toKey: string; travelS: number }>;
   }
   ```
   When `routing` is provided, use `routing.geometry` for the response `geometry`, and build `routingInput` from `routing.matrix` + `routing.legs` + `record.weights` + origin. When `routing` is `undefined`, fall back to the record fields exactly as today (keeps existing publish/worker tests valid and lets the operator pass geometry-only).
   - `routingInput` stays non-null only when `matrix && reorderableWithCoords.length >= 2` (unchanged condition, now against the injected matrix).

2. The routing is produced on-demand by calling the **pure** `planRoute.compute(...)` (it does NOT persist — only `ComputeDayPlanUseCase.saveComputed` persists). Compute over the record's **reorderable** stops in their **stored order** (`PRESERVE_ORDER`), from the record's effective origin, with `record.weights`, `interactive: true`, `strict: false` (so a drained rate limiter degrades to the stub, never throws — FR-012/D6). Take only `{ geometry, matrix, legs }` from the result; **do not** re-derive stop ETAs (the stored record's ETAs stay authoritative, so published ETAs/versions don't churn on a GET).

3. Add a small shared helper (e.g. `recomputeRoutingForRecord(planRoute, record, now)` in the day-plan `application/` layer) that builds the `planRoute.compute` input from `record.stops` (filter `!executed`, map to `{ appointmentId, location:{lat,lng}|null, windowStartAt, windowEndAt, serviceMinutes: durationMinutes }`), resolves origin from `record.originLat/lng`/`originSource`, sets `earliestDepartureAt` like the compute use-case (`isToday` → max(now, record.departureAt ?? now), else null), and returns `{ geometry, matrix, legs }`. Reuse it in both GET use-cases. Keep it Clean-Architecture compliant (application layer, depends on the `PlanRouteService` + domain types only).

### Wiring the GET use-cases
- `get-my-day-plan.use-case.ts`: after `resolveRecord`, call the helper and pass `{ geometry, matrix, legs }` to `buildDayPlanResponse` (INSP → geometry + routingInput populated on-demand). Do this for every returned record (fresh, cleared-STALE, or recomputed) so geometry/routingInput are always present.
- `get-day-plan-for-operator.use-case.ts`: call the helper but pass `{ geometry, matrix: null, legs: [] }` (geometry present, `routingInput` null — web consumes neither, and there is no operator reorder). Keep "never calls Mapbox for a write" — this is a read that recomputes, still no DB write.

## US1 — stop persisting (no Mapbox result in the DB)
- `compute-day-plan.use-case.ts`: remove `routeGeometry`, `routingMatrix`, `legTravel` from the `SaveDayPlanInput` literal (lines ~230-232). Keep everything else (metadata, totals, frozen `published_*`).
- `prisma-day-plan.repository.ts`: in `mapPlanFields` remove the `route_geometry`/`routing_matrix_json`/`leg_travel_json`/`geometry_purged_at` writes (~306-308). Update `SaveDayPlanInput` type (`day-plan.repository.ts` domain) to drop those fields. In the read mapper `mapPlan` (~389-392) stop sourcing `routeGeometry`/`routingMatrix`/`legTravel` from the row — set them to `null`/`[]` on `DayPlanRecord` (the record type can keep the fields as always-null for now, since the builder's fallback path and other readers may reference them; simplest: `routeGeometry: null, routingMatrix: null, legTravel: []`). Remove `geometryPurgedAt` from the mapper.
- Keep the `DayPlanRecord` fields `routeGeometry`/`routingMatrix`/`legTravel` in the type for PR-A (builder fallback path + minimal churn); they are just always null/[] from the repo now. (They go away in PR-C.)
- **REORDER no longer reuses a stored matrix**: `compute-day-plan.use-case.ts` line ~163 passes `cachedMatrix: existing?.routingMatrix` only for `REORDER`. Since `existing.routingMatrix` is now always null, REORDER already recomputes — but make it explicit: remove the `cachedMatrix` argument entirely (pass `undefined`) and drop the now-dead `StoredRoutingMatrix` import if unused. Confirm `plan-route.service` handles `cachedMatrix: undefined` by calling the Matrix fresh (it does).

## US3 — preview endpoint
- Shared: add `previewDayPlanOrderRequestSchema` (mirror `saveDayPlanOrderRequestSchema`) + `previewDayPlanOrderResponseSchema` (see the contract doc) with type exports in `packages/shared/src/schemas/day-plan.ts`; export from the barrel; `packages/shared/src/schemas/day-plan.test.ts` tests. `pnpm --filter @properfy/shared build`.
- Backend: `preview-day-plan-order.use-case.ts` — load the plan (404 if none), guard `DAY_PLAN_ALREADY_STARTED` (422, reuse the existing check used by save-order) and version conflict (409 vs `basedOnVersion`), validate the candidate `appointmentIds` match the plan's reorderable set (400 otherwise), recompute the Matrix on-demand via `planRoute.compute` with `FIXED_ORDER` = the candidate order (interactive, non-strict), evaluate the sequence, map to `previewDayPlanOrderResponseSchema` with `etaSource:'MATRIX'`. **Persist nothing** (no `repo.save*` call). `< 2` reorderable → 409.
- Route in `day-plan.routes.ts`: `POST /v1/inspector/day-plans/:date/order/preview`, INSP, own `inspectorId`, Zod body/response, **30/min per-inspector** rate limit (match the existing rate-limit config style on the INSP sheet route, which is 20/min — use 30/min here). Register the use-case in `container.ts`.
- Tests: use-case unit test (recompute matrix, persists nothing — assert repo save not called; 422/409/400 paths) + a route/integration test incl. 429.

## US5 — remove the purge job (independent)
- `workers.ts` (~386-393): remove the `day-plan.purge-route-data` `boss.schedule` + `boss.work`. If this changes `registerWorkers` arity/wiring, update `src/main/__tests__/workers.test.ts` mock list + `EXPECTED_SCHEDULES`, and the `server.ts` call site.
- Delete `purge-day-plan-route-data.use-case.ts` + its `__tests__`; remove `purgePastRouteData` from `prisma-day-plan.repository.ts` (~190-198) and the domain port; remove the DI registration in `container.ts`.
- `grep -r "purge-route-data\|purgePastRouteData\|PurgeDayPlanRouteData\|geometryPurgedAt\|geometry_purged_at" apps/backend/src` → only the (nullable, unused) schema column may remain; no code references.

## Verify (run inside the worktree; report condensed pass/fail)
```
pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test && pnpm --filter @properfy/shared lint && pnpm --filter @properfy/shared typecheck
pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test
pnpm --filter backend test:integration:db
pnpm generate:api   # commit openapi.json + api-types.ts; must be non-breaking (geometry/routingInput retained, preview route added)
```

## Out of scope (DO NOT do — deferred to PR-C, after Bússola's PR-B)
- Do NOT remove `routingInput` / `dayPlanRoutingInputSchema` / `toOptimizerInput` / `buildLegOverrides`.
- Do NOT drop any DB column / add any migration.
- Do NOT touch `apps/web` or `apps/pwa`.
