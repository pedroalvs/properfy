# Tasks: F04 Plan B — Remove routingInput & Drop Dead Routing Columns (PR-C)

**Feature**: `074-f04-planb-remove-routing-input` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
Backend + shared only. TDD (constitution III): failing test first for each behavioural change. Paths repo-relative to the worktree.

> Coupling: US1 (remove routingInput) and US3 (drop columns) must land together — the builder/entity/repo stop referencing the columns, then the migration drops them. US2 (Directions-only GET) and US4 (preview mid-day) are behavioural, each independently testable.

---

## Phase 1: Setup
- [ ] T001 Baseline already green (haiku). Re-run `pnpm --filter @properfy/shared build && pnpm --filter backend exec prisma generate` if the tree changed.

## Phase 2: User Story 2 — Directions-only GET (no per-GET Matrix) (P1)
- [ ] T002 [US2] Write a failing test in `apps/backend/src/modules/day-plan/application/services/__tests__/plan-route.service.test.ts` (and/or a get-my-day-plan test): a `PRESERVE_ORDER` compute with ≥2 coordinate stops does **not** call `routing.matrix` but does call `routing.directions`; final ETAs/geometry unchanged.
- [ ] T003 [US2] In `plan-route.service.ts` change `needsProviderMatrix` (resolveMatrix, ~611-612) so it is true only for `mode.kind === 'OPTIMIZE'` (drop `PRESERVE_ORDER`); `PRESERVE_ORDER` seeds the timeline from the stub matrix and the Directions pass overwrites per-leg. Add a comment citing PR-C.
- [ ] T004 [US2] Verify the **preview** path (`PlanRouteService.previewOrder`) still calls the Matrix (`etaSource: 'MATRIX'`) — it must not route through the changed `needsProviderMatrix` branch. Add/confirm a test asserting preview still calls `routing.matrix`.
- [ ] T005 [US2] Simplify `recompute-routing.ts`: `OnDemandRouting` returns `{ geometry, approximate, approximateReason }` only (drop `matrix`/`legs`); `recomputeRoutingForRecord` returns geometry + degradation flags. Update callers (`routingFor`, operator path if any).
- [ ] T006 [US2] Run: `pnpm --filter backend test -- plan-route get-my-day-plan`.

## Phase 3: User Story 1 — Remove routingInput from the contract (P1)
- [ ] T007 [US1] Update `packages/shared/src/schemas/day-plan.test.ts` first: remove tests for `toOptimizerInput`/`buildLegOverrides`/`dayPlanRoutingInputSchema`; assert `dayPlanResponseSchema` has no `routingInput`.
- [ ] T008 [US1] In `packages/shared/src/schemas/day-plan.ts` remove: `routingInput` from `dayPlanResponseSchema` (~157), `dayPlanRoutingInputSchema` + `DayPlanRoutingInput` (~99-109), `toOptimizerInput` (~287-311), `buildLegOverrides` (~320-335), private `toIso` (~337-339). `pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test`.
- [ ] T009 [US1] In `day-plan-response.builder.ts` remove the `routingInput` block (~94-107, 157) and the `matrix`/`legs` locals; set `geometry` from the injected `routing` (`routing?.geometry ?? null`), dropping `record.routeGeometry`. Update builder tests.
- [ ] T010 [US1] Run: `pnpm --filter @properfy/shared test && pnpm --filter backend test -- day-plan-response get-my-day-plan get-day-plan-for-operator`.

## Phase 4: User Story 4 — Preview matches PUT /order (mid-day reorder) (P1)
- [ ] T011 [US4] Write failing tests in `preview-day-plan-order.use-case.test.ts`: (a) a started-day not-started-tail preview returns `200` evaluated from the last executed stop's location (effective `LAST_STOP` origin), no `DAY_PLAN_ALREADY_STARTED`; (b) wrong candidate set → `400 DAY_PLAN_ORDER_MISMATCH`; (c) < 2 reorderable → `409`; (d) version mismatch → `409`.
- [ ] T012 [US4] In `preview-day-plan-order.use-case.ts` remove the `DAY_PLAN_ALREADY_STARTED` guard (~65-66). For a started day (executed prefix today), compute the effective origin = last executed stop's lat/lng and the earliest-departure from that stop (mirror `compute-day-plan.use-case` REORDER/LAST_STOP logic); otherwise keep the configured origin + `plan.departureAt`. Keep the mismatch/version/nothing-to-reorder guards.
- [ ] T013 [US4] Remove the now-unused `dayPlanAlreadyStarted` import if it is used nowhere else in the preview file. Run: `pnpm --filter backend test -- preview-day-plan-order`.

## Phase 5: User Story 3 — Drop the dead routing columns + remove transitional cleanup (P1)
- [ ] T014 [US3] Remove `DayPlanRecord.routeGeometry/routingMatrix/legTravel` from `domain/day-plan.entity.ts` (~89-91) and `DayPlanLegTravel` (~43) if unused elsewhere; remove the read-mapping in `prisma-day-plan.repository.ts` (~381-384).
- [ ] T015 [US3] Remove `clearStoredRouteData` from the domain port `day-plan.repository.ts` (~126-130) and its impl in `prisma-day-plan.repository.ts` (~186-193).
- [ ] T016 [US3] Delete `application/use-cases/clear-stored-route-data.use-case.ts` + its test; remove container wiring (`container.ts` import/field/instantiation/export), the `workers.ts` import/arg/invocation (~9,72,388) and the `boss.unschedule('day-plan.purge-route-data')` (~392), the `server.ts` call site (~133). Update `src/main/__tests__/workers.test.ts` (mock list + EXPECTED_SCHEDULES + counts) and `tests/unit/workers.test.ts`, and the 5 repo-stub test classes that implement `clearStoredRouteData()`.
- [ ] T017 [US3] Add the migration `apps/backend/prisma/migrations/2026110700XXXX_drop_day_plan_route_columns/migration.sql` dropping `route_geometry`, `routing_matrix_json`, `leg_travel_json`, `geometry_purged_at` from `day_plans`; remove the 4 columns from `schema.prisma` (DayPlan, ~1852-1856). Apply locally (`prisma migrate dev`) and `prisma validate`.
- [ ] T018 [US3] Add an integration-db test asserting the columns no longer exist (or that a compute/publish succeeds without them) and the plan read/write path works; run `pnpm --filter backend test:integration:db -- day-plan`.

## Phase 5b: Cross-workspace cleanup — PWA test fixtures (required for green CI)
- [ ] T018b [US1] Removing `routingInput` from the shared `DayPlanResponse` type orphans the PWA **test fixtures** that still set it (PR-B stopped the runtime read but left the fixtures): remove the `routingInput` property from `apps/pwa/src/features/day-plan/__fixtures__/day-plan.ts`, `apps/pwa/.../RoutePage.test.tsx`, `apps/pwa/.../useReorderDraft.test.ts`, and `apps/pwa/tests/e2e/.../fixtures.ts`. No runtime PWA change. Run `pnpm --filter pwa typecheck && pnpm --filter pwa test` (and `pnpm --filter web typecheck` as a cross-check). Add a one-line note to `apps/pwa/CLAUDE.md` that `routingInput` is fully removed from the contract (PR-C).

## Phase 6: Polish & Cross-Cutting
- [ ] T019 Regenerate the contract: `pnpm generate:api`; commit `packages/shared/openapi.json` + `packages/shared/src/api-types.ts` — assert no `routingInput` remains (`grep -c routingInput` → 0). (FR-010)
- [ ] T020 [P] Update `CLAUDE.md` (root) + `apps/backend/CLAUDE.md` + `packages/shared/CLAUDE.md`: `routingInput` removed, GET Directions-only (no per-GET Matrix), columns dropped, transitional cleanup removed, preview mid-day consistent. Remove any statement the PR-A docs left that is now false (e.g. "routingInput on-demand", the one-shot clear, the unschedule).
- [ ] T021 [P] Update `fase2-etapa1/decisoes.md`: mark the L-F04-03 Plan B entry as fully delivered (PR-C), noting the asymmetry resolved via D18/line 725.
- [ ] T022 Full gates in-worktree (via subagent, condensed): shared build+test+lint+typecheck; backend typecheck+lint+test; **pwa typecheck+test + web typecheck** (the contract removal crosses workspaces); `test:integration:db` (full, incl. a 2nd `prisma migrate deploy` replay); confirm `grep routingInput` across apps/+packages/ src = 0.
- [ ] T023 Adversarial review loop (review → fix TDD → re-review) until clean; commit (Conventional, no AI refs), push, PR → develop; `git diff --stat origin/develop... | tail -1` ≤ 150.

## Dependencies & order
- US2 → US1 (recompute-routing simplification feeds the builder change). US1 + US3 land together (stop referencing columns, then drop). US4 independent. Polish last (contract regen + docs reflect final state).

## Parallel opportunities
- T020/T021 (docs) are `[P]`. US4 (preview) is disjoint from US1/US2/US3 files and can proceed in parallel.

## Implementation strategy
Net deletion + one `needsProviderMatrix` change + one preview fix + one migration. MVP = US1+US2+US3 (contract/columns/cost); US4 completes the consistency fix. One PR (PR-C).
