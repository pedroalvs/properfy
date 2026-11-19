# Tasks: F04-2b — Preview route weights endpoint

**Feature**: `071-f04-2b-preview-route-weights` | **Spec**: `spec.md` | **Plan**: `plan.md`
**Tech**: TypeScript/Node 24, Fastify 4, `fastify-type-provider-zod`, Zod 3, `@properfy/shared` route-planning, Prisma 6 (read-only). TDD mandatory (constitution III).

Single user story (US1 — operator previews route weights). Phases 1–2 are tiny (no new infra). Tests are written **first** (red), then implementation (green), then api-types regen + polish.

## Phase 1: Setup

- [X] T001 Confirm baseline green in the worktree `/Users/pedro/Code/GitHub/properfy/.worktrees/071-f04-2b` (shared built, prisma generated, backend typecheck + lint). (Done by setup subagent.)

## Phase 2: Foundational (blocking prerequisite for US1)

- [X] T002 Add the matrix-only preview method to `apps/backend/src/modules/day-plan/application/services/plan-route.service.ts`: `previewWeights(input)` builds the point list like `compute()`, resolves the matrix **once** via the existing `resolveMatrix` (interactive, non-strict), then for each of `currentWeights`/`proposedWeights` runs `optimizeRoute` + `evaluateSequence` over that shared matrix and returns both variants (`order`, `departureAt`, `finishAt`, `totals {driveS=totalTravelS, waitS, lateS}`, `feasible`, `approximate`, per-stop `{appointmentId, sequence, arrivalAt, lateS}`) plus `usage {matrixElements, directionsCalls: 0}`. **No Directions call.** Export the new `PreviewWeightsInput`/`PreviewRouteVariant`/`PreviewWeightsResult` types.

## Phase 3: User Story 1 — Operator previews the effect of route weights (P1)

**Goal**: `POST /v1/day-plans/preview` (AM/OP) returns `current` + `proposed` route variants, 1 Matrix / 0 Directions, 422 out-of-range, 10/min, nothing persisted.

**Independent test**: AM/OP POST with valid inspector + in-range date + weights → 200 `{data:{current,proposed}}`; matrix called once, directions zero; no `day_plans` row.

### Tests first (red)

- [X] T003 [P] [US1] Write `apps/backend/src/modules/day-plan/application/use-cases/__tests__/preview-route-weights.use-case.test.ts` (Vitest, `TZ` pinned away from Sydney): Example 6 (saved `{1,1,1}` → `current.order [A,C,B]`; proposed `{1,0,1}` → `proposed.order [A,B,C]`, `proposed.totals.waitS 2100`), `etaSource 'MATRIX'`, one Matrix call + zero Directions (stub spies), nothing persisted; date-range (actor Sydney, `now = 2026-11-04T23:00:00Z`): 2026-11-05 & 2026-11-19 OK, 2026-11-04 & 2026-11-20 → `DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` with **no** routing call; `404 INSPECTOR_NOT_FOUND`; 403 for CL/INSP via `assertRoles`.
- [X] T004 [P] [US1] Write `apps/backend/tests/integration/day-plan-preview.integration.test.ts` (Supertest): 200 happy path (shape matches `routeWeightsPreviewResponseSchema`); 400 on invalid weights/date/uuid; 403 for CL_ADMIN/CL_USER/INSP/TNT, 200 for AM & OP; 422 out-of-range; 429 on the 11th call in a minute; **route collision** — `/v1/day-plans/preview` resolves to the preview handler, not `/:inspectorId/:date`.
- [X] T005 [P] [US1] Add the platform-scope **scoping test** in the use-case suite (`preview-route-weights.use-case.test.ts`, `describe('platform-scope isolation (§7.1)')`): the real `AuthorizationService` denies `CL_ADMIN`/`CL_USER`/`INSP`/`TNT` with `403` **before any inspector-subject read** (`loadInspectorContext`/`loadCandidates`/`settings.get` never called). `day_plan` has no tenant predicate, so isolation is purely role-based — an application-layer test is the authentic proof (no DB row to leak); the route test also asserts CL/INSP → 403 end-to-end.

### Implementation (green)

- [X] T006 [US1] Create `apps/backend/src/modules/day-plan/application/use-cases/preview-route-weights.use-case.ts`: `PreviewRouteWeightsUseCase` (ctor: `IDayPlanInputReader`, `PlanRouteService`, `IPlatformSettingsReader`, `AuthorizationService`, `Clock`). `execute({actor, inspectorId, date, weights, now?})`: (1) `assertRoles(actor,['AM','OP'],{action:'day_plan.preview_weights',entityType:'DayPlan'})`; (2) `todayCivil = civilDateInTimezone(now ?? clock.now(), actor.timezone ?? PLATFORM_TIMEZONE)`, reject `date < todayCivil || date > todayCivil+14` with `dayPlanPreviewDateOutOfRange()` (before any routing); (3) `loadInspectorContext` → `inspectorNotFound()` if null; (4) `loadCandidates`, `classifyStops` → reorderable; origin = inspector base (`baseLat` set → `{lat,lng}`) else `null` (no persisted override read); build `PlanRouteStopInput[]`; (5) `planRoute.previewWeights({origin, stops, earliestDepartureAt:null, currentWeights: settings.get('routeWeights'), proposedWeights: weights})`; (6) map each variant to `routeWeightsPreviewSchema` using candidate display fields (`appointmentCode`, `suburb`, `timeSlotStart/End`, `tenantTimezone`, `windowStartAt/EndAt`→`eta`). Return `{current, proposed}`. Persist nothing.
- [X] T007 [US1] Register `POST /v1/day-plans/preview` in `apps/backend/src/modules/day-plan/interfaces/day-plan.routes.ts`: static route, `config.rateLimit {max:10, timeWindow:'1 minute'}`, `schema.body = previewRouteWeightsRequestSchema`, `schema.response[200] = successResponseSchema(routeWeightsPreviewResponseSchema)`; handler parses body, calls `container.previewRouteWeightsUseCase.execute({actor: request.authContext!, ...body})`, replies `success(result)`. Add `previewRouteWeightsUseCase` to `DayPlanRouteContainer`. Register **before** the `:inspectorId/:date` routes (radix prefers static anyway; order documents intent).
- [X] T008 [US1] Wire `PreviewRouteWeightsUseCase` in `apps/backend/src/main/container.ts`: instantiate with `dayPlanInputReader, planRouteService, platformSettingsService, authorizationService, dayPlanClock`; add `previewRouteWeightsUseCase` to the `container.dayPlan` object.

## Phase 4: Polish & Contract

- [X] T009 Run `pnpm generate:api` (regenerate `packages/shared/openapi.json` + `packages/shared/src/api-types.ts`); commit both so CI `contract-freshness` passes.
- [X] T010 Update `apps/backend/CLAUDE.md` (Routing section) to note `POST /v1/day-plans/preview` (AM/OP, 10/min, 1 Matrix/0 Directions, L-F04-14 date range) and the root `CLAUDE.md` Recent Changes line for F04-2b. (Docs only.)
- [X] T011 Full backend gates in the worktree via subagent: `typecheck`, `lint`, `test` (unit+route), `test:integration:db` — all green; confirm `git status` shows `openapi.json`/`api-types.ts` in sync.

## Dependencies

- T002 (preview method) blocks T006 (use case).
- T003–T005 (red tests) precede T006–T008 (green).
- T006 → T007 → T008 (use case → route container type → wiring).
- T009 after routes+schema compile; T010 docs any time; T011 last.

## Parallel opportunities

- T003, T004, T005 are independent test files — write in parallel ([P]).

## MVP

US1 is the whole feature; there is no reduced MVP below it.
