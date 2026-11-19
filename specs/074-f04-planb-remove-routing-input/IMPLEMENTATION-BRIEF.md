# PR-C Implementation Brief — F04 Plan B (remove routingInput, drop columns, Directions-only GET, fix preview asymmetry)

Read `spec.md`, `plan.md`, `tasks.md` in this folder first. TDD: failing test first per behavioural change. No Claude/Anthropic references anywhere. Everything below has exact file:line anchors (current develop @3dfc678c, post PR-A #1337 + PR-B #1339).

## A) Directions-only GET (US2) — the one subtle behavioural change
- `plan-route.service.ts` `resolveMatrix`: `needsProviderMatrix` (~lines 611-612) is currently `(mode.kind === 'OPTIMIZE' || mode.kind === 'PRESERVE_ORDER') && coordinateStopCount >= 2`. Change it to **`mode.kind === 'OPTIMIZE' && coordinateStopCount >= 2`** so `PRESERVE_ORDER` seeds the timeline from the stub (haversine) matrix and the per-leg Directions pass (lines ~276-358) overwrites travel/geometry. Final ETAs/geometry are unchanged (Matrix only seeded a timeline Directions overwrites; in PRESERVE_ORDER the order is fixed, not chosen from the matrix). Add a comment citing PR-C.
- **CRITICAL VERIFY**: `PlanRouteService.previewOrder` (~line 489) must STILL call the Matrix (`etaSource: 'MATRIX'`). Confirm it uses its own matrix call, NOT the `compute()`→`resolveMatrix` PRESERVE_ORDER branch you just changed. Add/keep a test asserting preview calls `routing.matrix`. If previewOrder routes through the changed branch, keep its Matrix via a separate flag — do not let FR-003 remove the Matrix from preview.
- `recompute-routing.ts`: `OnDemandRouting` now returns `{ geometry, approximate, approximateReason }` only (drop `matrix`, `legs`). `recomputeRoutingForRecord` stops returning matrix/legs. Update `ComputeDayPlanUseCase.routingFor` and all callers (`get-my-day-plan`, `save-day-plan-order`, `recalculate`, `day-plan-origin`) — they pass the result to the builder which now only needs geometry.
- Test (SC-002): a GET geometry recompute for a ≥2-coord-stop plan calls `routing.directions` but NOT `routing.matrix`.

## B) Remove routingInput from the contract (US1)
- `packages/shared/src/schemas/day-plan.ts`: remove `routingInput` from `dayPlanResponseSchema` (~157), `dayPlanRoutingInputSchema` + `DayPlanRoutingInput` (~99-109), `toOptimizerInput` (~287-311), `buildLegOverrides` (~320-335), private `toIso` (~337-339). Remove their tests in `day-plan.test.ts` (keep the rest). `pnpm --filter @properfy/shared build`.
- `day-plan-response.builder.ts`: delete the `routingInput` block (~94-107) and the response field (~157); delete the `matrix`/`legs` locals (~95-96). `geometry` = `routing?.geometry ?? null` (drop `record.routeGeometry`). Keep the `approximate`/`approximateReason` OR-with-routing logic from PR-A. Update builder tests.
- **StoredRoutingMatrix / DayPlanGeometry types** in `plan-route.service.ts` are still used internally (previewOrder, compute) — keep them. Only the response/schema `routingInput` goes.

## C) Drop the dead columns (US3) + remove transitional cleanup
- `schema.prisma` DayPlan (~1852-1856): remove `route_geometry`, `routing_matrix_json`, `leg_travel_json`, `geometry_purged_at`.
- New migration `apps/backend/prisma/migrations/20261107000000_drop_day_plan_route_columns/migration.sql` (timestamp > `20261106000300`): `ALTER TABLE "day_plans" DROP COLUMN "route_geometry", DROP COLUMN "routing_matrix_json", DROP COLUMN "leg_travel_json", DROP COLUMN "geometry_purged_at";`. Apply locally (`pnpm --filter backend prisma:migrate --name drop_day_plan_route_columns` or create the file + `prisma migrate dev`), then `prisma validate`. On rebase, regenerate the timestamp if a newer migration appears.
- Remove code refs: `day-plan.entity.ts` fields `routeGeometry`/`routingMatrix`/`legTravel` (~89-91) and `DayPlanLegTravel` type (~43) if unused elsewhere; repo read-mapping `prisma-day-plan.repository.ts` (~381-384); builder fallbacks (done in B).
- Remove the domain-port `clearStoredRouteData` (`day-plan.repository.ts` ~126-130) + impl (`prisma-day-plan.repository.ts` ~186-193).
- Delete `application/use-cases/clear-stored-route-data.use-case.ts` + its test. Remove container wiring (`container.ts` import ~495, field ~576, instantiation ~1155, export ~2133), `workers.ts` import (~9), constructor arg (~72), invocation (~388), AND the `boss.unschedule('day-plan.purge-route-data')` (~392). Update `server.ts` call site (~133) and the worker tests `src/main/__tests__/workers.test.ts` (mock list + EXPECTED_SCHEDULES + counts) and `tests/unit/workers.test.ts`. Remove `clearStoredRouteData()` from the 5 repo-stub test classes (`get-fresh-stop-for-appointment`, `save-day-plan-order`, `day-plan-origin`, `recalculate-day-plan`, `get-my-day-plan` use-case tests).
- Integration-db test: compute/publish succeeds with the columns gone; the plan read/write path works.

## D) Preview matches PUT /order mid-day (US4) — spec-clear, implement consistent
- `preview-day-plan-order.use-case.ts`: REMOVE the guard `if (executed.length > 0 && input.date <= todayCivil) throw dayPlanAlreadyStarted();` (~65-66). Remove the now-unused `dayPlanAlreadyStarted` import **only if** unused elsewhere in that file (the error itself STAYS — the origin use-cases use it).
- For a started day (executed prefix today), evaluate the not-started tail from the **effective LAST_STOP origin**: `origin` = last executed stop's lat/lng; `earliestDepartureAt` derived from that stop (its `finishedAt`, else `startedAt + durationMinutes`, clamped to ≥ now) — mirror `compute-day-plan.use-case.ts` REORDER/LAST_STOP logic (~lines 130-139, 275-290). For an unstarted plan keep the configured origin + `plan.departureAt` as today. The reorderable set + `sameSet` mismatch + version + nothing-to-reorder guards stay.
- Spec basis: F04-tarefas.md line 725 (*bloqueador da revisão*), 726, D18 line 62. Document in code comment.
- Tests: started-day tail preview → 200 from LAST_STOP origin; wrong set → 400 DAY_PLAN_ORDER_MISMATCH; <2 → 409; version → 409. Ideally assert the preview's tail ETAs match a subsequent PUT /order of the same candidate (same origin).

## E) PWA test-fixture cleanup (US1 cross-workspace — required for green CI)
Removing `routingInput` from the shared type orphans PWA fixtures that still set it. Remove the `routingInput` property from: `apps/pwa/src/features/day-plan/__fixtures__/day-plan.ts` (~128), `apps/pwa/src/features/day-plan/.../RoutePage.test.tsx` (~20,24), `apps/pwa/.../useReorderDraft.test.ts` (~21), `apps/pwa/tests/e2e/.../fixtures.ts` (~288). Test-only, no runtime change. Add a one-line note to `apps/pwa/CLAUDE.md`. Run `pnpm --filter pwa typecheck && pnpm --filter pwa test` and `pnpm --filter web typecheck`.

## F) Contract regen + gates
- `pnpm generate:api` (or `generate:openapi` + `generate:types` if env-gated); commit `openapi.json` + `api-types.ts`. Assert `grep -rn routingInput packages/shared/openapi.json packages/shared/src/api-types.ts` → 0.
- Full gates to completion: shared build+test+lint+typecheck; backend typecheck+lint+test; `test:integration:db` (full); pwa typecheck+test; web typecheck. (Known flake: `routing-rate-limiter.integration.test` "grants after refill" timing — not a regression.)

## Out of scope / do NOT
- Do NOT change PWA runtime code (only its test fixtures). Do NOT touch web runtime. Do NOT edit any CLAUDE.md / decisoes.md EXCEPT the one-line `apps/pwa/CLAUDE.md` note in E (the orchestrator handles root/backend/shared CLAUDE.md + decisoes.md). Do NOT commit/push/PR.
