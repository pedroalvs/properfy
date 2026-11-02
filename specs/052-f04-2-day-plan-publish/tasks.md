# Tasks: Day Plan — Persistence, 19:30 Publication, APIs, Route Sheet, Weights, Metric & Purge

**Feature**: `052-f04-2-day-plan-publish` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
**TDD**: mandatory (Constitution §III). Within each story, write failing tests first, then implement to green.
**Pair split**: `[Pilar]` = model/jobs/APIs/algorithm (owner). `[Esteio]` = sheet, metric wiring + purge, `onboarding_completed_at`, AM/OP rate limits, effective-origin sheet rendering. One PR, two authors. Esteio's tasks are handed off on the same worktree after the foundational phase + the contracts they consume are in place.

Test numbers in parentheses reference `fase2-etapa1/tarefas/F04-tarefas.md` §Testes primeiro.

## Phase 1: Setup (shared enums, constants)

- [ ] T001 [P] Add `packages/shared/src/enums/day-plan.ts` with `DayPlanStatus`, `DayPlanComputeTrigger`, `DayPlanOriginSource` (incl. `LAST_STOP`), `DayPlanOriginWarning`, `RoutingProvider`; export from the enums barrel.
- [ ] T002 [P] Add `packages/shared/src/constants/day-plan.ts` (`DAY_PLAN_PUBLISH_LOCAL_TIME='19:30'`, `DAY_PLAN_PUBLISH_HOUR=19`, `DAY_PLAN_PUBLISH_MINUTE=30`, `ROUTE_ETA_ACCURACY_THRESHOLD_MINUTES=10`, `ROUTE_ETA_ACCURACY_MIN_SAMPLE=30`, `ROUTE_ETA_ACCURACY_OUTLIER_MINUTES=180`, `DAY_PLAN_MAX_STOPS_PER_ORDER=25`, `DEFAULT_ROUTE_WEIGHTS`).

## Phase 2: Foundational (BLOCKING — schema, migrations, shared schemas, domain, ports)

- [ ] T003 Extend `apps/backend/prisma/schema.prisma`: `DayPlan`, `DayPlanStop`, 4 enums, inverse relations (`Inspector.day_plans`, `Appointment.day_plan_stops`, `User.day_plans_computed`), `inspectors.onboarding_completed_at DateTime?`; indexes `@@unique([inspector_id, plan_date])`, `@@index([plan_date, status])`, stop uniques + `@@index([appointment_id])`.
- [ ] T004 Generate migration `apps/backend/prisma/migrations/<ts>_day_plans/migration.sql` (expand: CREATE TYPE ×4, CREATE TABLE ×2, FKs, indexes); verify `prisma migrate diff` clean, no `Unsupported()` index drift. (test 25)
- [ ] T005 Generate migration `<ts>_inspector_onboarding_completed_at/migration.sql` (`ALTER TABLE "inspectors" ADD COLUMN "onboarding_completed_at" TIMESTAMP(3) NULL`).
- [ ] T006 [P] [US6] Test `packages/shared/src/schemas/__tests__/route-weights-setting.test.ts` (test 14): defaults 1/1/1; accept 0/0.1/9.9/10; reject −0.1/10.1/0.15/all-zero; `resolvePlatformSettingValue('routeWeights', {})` → defaults.
- [ ] T007 [US6] Append `routeWeights` to `PLATFORM_SETTINGS_REGISTRY` in `packages/shared/src/schemas/platform-settings.ts` (section "Route planning") to green T006.
- [ ] T008 [P] Write `packages/shared/src/schemas/day-plan.ts` request/response Zod schemas (`dayPlanResponseSchema`, `dayPlanStopSchema`, `dayPlanGeometrySchema`, `routeWeightsPreviewSchema`, `routeEtaAccuracySchema`, order/origin/preview request schemas) + `toOptimizerInput` + `buildLegOverrides`; export from barrel.
- [ ] T009 [P] [US1] Test `apps/backend/src/modules/day-plan/domain/day-plan-fingerprint.test.ts` (test 1): same input→same hash; window/date/coord/duration/tz/appointment-set/origin change→hash changes; check-in & abandon change; check-out & SCHEDULED→DONE of started do NOT; order-independent; no `@prisma/client` import.
- [ ] T010 [US1] Implement `apps/backend/src/modules/day-plan/domain/day-plan-fingerprint.ts` (`computeDayPlanFingerprint(FingerprintInput)`, Prisma-free, L-F04-16) to green T009.
- [ ] T011 [P] [US1] Test `.../domain/classify-stops.test.ts` (test 1b): executed prefix by `startedAt`, DONE-no-exec by window, abandoned→reorderable, empty input, no Prisma import.
- [ ] T012 [US1] Implement `.../domain/classify-stops.ts` (`classifyStops`, `ClassifiableStop`, Prisma-free) to green T011.
- [ ] T013 [P] [US1] Test `.../domain/publication-window.test.ts` (test 2): `isPublicationOpen` boundary at 19:30 inspector tz; past/today open; D+2 closed; `isPublicationOpenForInspector` requires inspector AND platform tz.
- [ ] T014 [US1] Implement `.../domain/publication-window.ts` (`isPublicationOpen`, `isPublicationOpenForInspector`, L-F04-02) to green T013.
- [ ] T015 [P] [US4] Test `.../domain/primary-contact.test.ts` (part of 3b): selection by `is_primary desc`→role order→`created_at asc`; phone only E.164; null when no contacts.
- [ ] T016 [US4] Implement `.../domain/primary-contact.ts` (`selectPrimaryContact`, L-F04-08) to green T015.
- [ ] T017 Define ports & errors: `.../domain/day-plan.repository.ts` (`IDayPlanRepository`: find, `saveComputed`, `clearStale`, `markStaleByAppointmentIds`, `markStaleByInspector`, `purgePastRouteData`, metric query), `.../domain/day-plan-input.reader.ts` (`IDayPlanInputReader`), `.../domain/day-plan.errors.ts` (all `DAY_PLAN_*` codes), `.../domain/day-plan.entity.ts`.
- [ ] T018 Add `ICronJobRunRepository.hasClaim(jobName, tenantId, localDate)` to `apps/backend/src/shared/domain/cron-job-run.repository.ts` and implement in `prisma-cron-job-run.repository.ts`; test `prisma-cron-job-run.repository.test.ts` (test 11, db suite).

**Checkpoint**: shared contracts, schema, migrations, domain functions and ports exist. Esteio can start US5 (sheet) and the metric/purge/onboarding tasks once the reader (T026) and repository (T020) land.

## Phase 3: US1 — Inspector opens the route (P1) 🎯 MVP

**Goal**: `GET /v1/inspector/day-plans/:date` returns a correct `DayPlanResponse`; compute + fingerprint + origin + single-flight.

- [ ] T019 [P] [US1] Test `.../infrastructure/prisma-day-plan.repository` db suite (tests 26, 26b, 27, 27a): CAS `saveComputed`, DELETE/INSERT stops in tx, `markStaleBy*` idempotent + tz-correct, status join.
- [ ] T020 [US1] Implement `.../infrastructure/prisma-day-plan.repository.ts` (`IDayPlanRepository`, `Prisma.Decimal↔number`, status-filtered read join L-F04-04) to green T019.
- [ ] T021 [P] [US1] Test `.../application/use-cases/compute-day-plan.use-case.test.ts` (test 3): 3-stop plan, ROUTINE unconfirmed excluded, DONE as executed prefix, today-with-executed prefix + origin, abandoned→reorderable, no base/override cases, PRESERVE_ORDER, CAS retry→STALE, frozen `published_*`, earliestDeparture, LAST_STOP, enriched `day_plan.computed` log.
- [ ] T022 [US1] Implement `.../application/use-cases/compute-day-plan.use-case.ts` (modes, prefix, origin §3, publication status §4.6, frozen ETA §4.7, CAS §4.8, single-flight, `day_plan.computed` log) to green T021.
- [ ] T023 [P] [US1] Test `.../application/use-cases/get-my-day-plan.use-case.test.ts` + reader tests (tests 3b, 4 incl. L-F04-01/02/04 branches): fresh/ different fingerprint/ STALE-no-change clear/ published_at-wins/ auto-publish both tz/ past/ D+2/ 0 stops/ reassigned/ out-of-status/ concurrent single-flight/ executed-live/ approximate-retry-after-5min/ `routingInput`.
- [ ] T024 [US1] Implement `.../application/use-cases/get-my-day-plan.use-case.ts` (publication rule L-F04-02, clearStale no-routing L-F04-01, derive `executed`/`executionStatus` live, single-flight) to green T023.
- [ ] T025 [P] [US1] Test `.../infrastructure/prisma-day-plan-input.reader.test.ts` (test 3b): candidate selection (status join, T-1 visibility, window from `time_slot_start/end` not group L-F04-11, `selectPrimaryContact`, execution fields).
- [ ] T026 [US1] Implement `.../infrastructure/prisma-day-plan-input.reader.ts` (`loadCandidates`, converts Prisma rows to flat `ClassifiableStop`/candidates) to green T025.
- [ ] T027 [US1] Create `.../interfaces/day-plan.routes.ts` with `GET /v1/inspector/day-plans/:date` (INSP RBAC, 60/min, `civilDateSchema`); wire `container.dayPlan.*` in `apps/backend/src/main/container.ts`.
- [ ] T028 [US1] Route integration tests (tests 17 RBAC, 18 shape/no-token, 19 invalid date, 24b status-out-of-enum) in `apps/backend/tests/integration/day-plan/get-my-day-plan.integration.test.ts`.
- [ ] T029 [US1] Regenerate `pnpm generate:api`; rebuild shared; confirm `web`/`pwa` typecheck.

**Checkpoint**: an inspector can view their plan; isolation + no-token verified. MVP demoable.

## Phase 4: US2 — Auto-publish at 19:30 + notice (P1)

- [ ] T030 [P] [US2] Test `.../application/day-plan-notices.test.ts` + `publish-day-plans.use-case.test.ts` (test 9): due set, sequential, defer-not-approximate (attempts 1–2), attempt-3 approximate, infeasible L-F04-05, lock-screen-safe body R-F02, `publish_completed` log level L-F04-09, dedupe keys.
- [ ] T031 [US2] Implement `.../application/day-plan-notices.ts` (`ROUTE_PUBLISHED`/`ROUTE_CHANGED` title+body, lock-screen-safe) to green the notices part of T030.
- [ ] T032 [US2] Implement `.../application/use-cases/publish-day-plans.use-case.ts` (gate due set §6, sequential + 25-min budget, continuation, attempts, `ROUTE_PUBLISHED` via `PublishSystemInspectorNoticeUseCase`, audits/logs) to green T030.
- [ ] T033 [P] [US2] Test `.../main/day-plan-publish.worker.test.ts` (test 10): schedule `'30 * * * *'`, singleton, T-1 gate via `hasClaim`, Adelaide half-hour, continuation `startAfter 120`, `DAY_PLAN_PUBLISH_ENABLED=false` unschedule, `TenantCronTick` + 4 jobs unchanged.
- [ ] T034 [US2] Wire `day-plan.publish` worker in `apps/backend/src/main/workers.ts` (singleton, gateRunner, continuation, kill switch); update final log queue list.
- [ ] T035 [US2] E2E `apps/backend/tests/integration/day-plan/day-plan-publish.e2e.test.ts` (test 30, 01.A1/00.A2): reject-unconfirmed @19:00 then publish @19:30 (Mapbox stubbed) → 3-stop PUBLISHED plan + geometry + `ROUTE_PUBLISHED` + delivery job.

## Phase 5: US3 — Inspector reorder / origin / recalculate (P2)

- [ ] T036 [P] [US3] Test `.../application/use-cases/save-day-plan-order.use-case.test.ts` (test 5): reorder valid/same/window-violation/version-conflict/stale/mismatch/mid-progress/replay/past/Mapbox-down.
- [ ] T037 [US3] Implement `save-day-plan-order.use-case.ts` (FIXED_ORDER, CAS, reorderable from live state, `day_plan.reordered` audit) to green T036.
- [ ] T038 [P] [US3] Test `recalculate-day-plan.use-case.test.ts` (test 6, INSP branch): `OPTIMIZE`, `MANUAL_RECALC`, no notice.
- [ ] T039 [US3] Implement `recalculate-day-plan.use-case.ts` (shared by INSP + AM/OP; `ROUTE_CHANGED` effective-change §7b for OP) — INSP branch to green T038.
- [ ] T040 [P] [US3] Test `set-day-plan-origin.use-case.test.ts` + clear (test 7): geocode permanent, 422 not-found, any-error→503, 422 ALREADY_STARTED, idempotent, audit no-coords; DELETE idempotent.
- [ ] T041 [US3] Implement `set-day-plan-origin.use-case.ts` + `clear-day-plan-origin.use-case.ts` (permanent geocoding, LAST_STOP guard L-F04-07, audits) to green T040.
- [ ] T042 [US3] Add routes `PUT /:date/order`, `POST /:date/recalculate`, `PUT`/`DELETE /:date/origin` to `day-plan.routes.ts` with per-route rate limits; integration tests (tests 20, 24e, 27b) in `apps/backend/tests/integration/day-plan/`.

## Phase 6: US4 — Operations view / recalc / preview / metric (P2)

- [ ] T043 [P] [US4] Test `get-day-plan-for-operator.use-case.test.ts` (AM/OP GET, no Mapbox, STALE on divergence, `INSPECTOR_NOT_FOUND`).
- [ ] T044 [US4] Implement `get-day-plan-for-operator.use-case.ts` to green T043.
- [ ] T045 [US4] Complete the OP branch of `recalculate-day-plan.use-case.ts` (`ROUTE_CHANGED` effective-change + 10-min dedupe L-F04-06, `day_plan.recalculated` audit) with tests (test 6 OP branches).
- [ ] T046 [P] [US4] Test `preview-route-weights.use-case.test.ts` (test 13): current/proposed, 1 Matrix 0 Directions, invalid weights 400, date-range 422 L-F04-14, nothing stored.
- [ ] T047 [US4] Implement `preview-route-weights.use-case.ts` to green T046.
- [ ] T048 [P] [US4] [Esteio] Test `eta-accuracy.use-case.test.ts` (test 12): frozen-published comparison, thresholds, insufficient/outlier/approximate exclusion, `days` 7–90.
- [ ] T049 [US4] [Esteio] Implement `get-route-eta-accuracy.use-case.ts` (`$queryRaw`, `published_*`, `::int` params) + db metric test (test 28) to green T048.
- [ ] T050 [US4] Add AM/OP routes (`GET /:inspectorId/:date` 120/min, `POST .../recalculate`, `POST /preview`, `GET /eta-accuracy`) with `assertRoles(['AM','OP'])`; integration tests (tests 22, 23, 24, 24c rate limits — 24c [Esteio]).

## Phase 7: US5 — Route sheet PDF/XLSX (P2) — [Esteio]

- [ ] T051 [P] [US5] [Esteio] Test `day-plan-sheet.test.ts` (test 15): XLSX "Route" sheet columns/preamble, PDF `%PDF`+pagination, no UUID, mixed-tz suffixes L-F04-10, approximate copy, slug, date format.
- [ ] T052 [US5] [Esteio] Extend `ExcelJsXlsxGenerator.generate(columns, rows, opts?: { sheetName?; preamble? })` (non-breaking) in `apps/backend/src/modules/report/infrastructure/exceljs-xlsx-generator.ts`.
- [ ] T053 [US5] [Esteio] Implement `.../infrastructure/day-plan-sheet.renderer.ts` (XLSX via generator, pdfkit PDF, slug, tz suffixes, banners) + `get-day-plan-sheet.use-case.ts` (30-day INSP limit, `day_plan.exported` audit L-F04-10) to green T051.
- [ ] T054 [US5] [Esteio] Add `GET /:date/sheet` (INSP) and `GET /:inspectorId/:date/sheet` (AM/OP) routes with `Content-Disposition`, 20/min; integration tests (tests 21, 24d).

## Phase 8: US6 — Fresh-stop reader, onboarding, purge (P3)

- [ ] T055 [P] [US6] Test `get-fresh-stop-for-appointment.use-case.test.ts` (test 16b): FRESH/recompute/no-event-edit/CAS-STALE/clear-STALE/unlinked/past/null.
- [ ] T056 [US6] Implement `get-fresh-stop-for-appointment.use-case.ts` (recompute like GET, clearStale no-routing, past never recompute, F06 port) to green T055.
- [ ] T057 [US6] Wire the real `IPublishedStopStartReader` adapter for F03 (R-F03-D23) on the repository + 1 integration case.
- [ ] T058 [P] [US6] [Esteio] Test `purge-day-plan-route-data.use-case.test.ts` (test 16): past plans nulled + `geometry_purged_at`, today/future untouched, 2nd run 0 rows.
- [ ] T059 [US6] [Esteio] Implement `purge-day-plan-route-data.use-case.ts` + wire `day-plan.purge-route-data` worker (`'45 3 * * *'`, Sydney) in `workers.ts` to green T058.
- [ ] T060 [P] [US6] [Esteio] Tests for `onboarding_completed_at` (test 16c): `inspector.test.ts` schema, `record-inspector-app-state.use-case.test.ts` single-call, `inspector-base-coords.integration.test.ts` db COALESCE, `inspector-app-state.integration.test.ts` 204+GET, `inspector-field-visibility.test.ts` CL-hidden.
- [ ] T061 [US6] [Esteio] Implement `onboarding_completed_at`: extend `inspectorAppStateSchema`/`inspectorResponseSchema` (shared), pass `onboardingCompleted` through `record-inspector-app-state.use-case.ts`, add the column to the single `$executeRaw` in `prisma-inspector.repository.ts` (R-F01-02), return in `GET /me` + AM/OP detail, hide from CL in `inspector-field-visibility.ts`.

## Phase 9: Subscriber + Polish & Cross-Cutting

- [ ] T062 [P] Test `.../application/subscribers/mark-day-plans-stale.subscriber.test.ts` (test 8): status transition, group events, `CANT_DO`, `BASE_CHANGED` (R-F01-03), `LATE_NOTICE`/weights no-op, idempotent, precedence, tz, error-no-rethrow.
- [ ] T063 Implement `.../application/subscribers/mark-day-plans-stale.subscriber.ts` + register on `domainEventBus` in container to green T062.
- [ ] T064 Add `dayPlansApproximateTotal` metric to the `MetricsCollector` and wire `registerWorkers` test counts (both test call sites).
- [ ] T065 [Esteio] Apply AM/OP rate limits (L-F04-14) and effective-origin (`LAST_STOP`) rendering in the sheet; confirm tests 24c/24d green.
- [ ] T066 Final `pnpm generate:api`; update `apps/backend/CLAUDE.md` and `packages/shared/CLAUDE.md` (new module, routes, settings key, jobs, events); confirm root CLAUDE.md entry (done).
- [ ] T067 Record L-F04-03 answer in `fase2-etapa1/decisoes.md` (append-only); confirm spec Clarifications + PR body carry it.
- [ ] T068 Full gates inside the worktree via subagent: `pnpm --filter @properfy/shared test && build`; `prisma generate`; `backend typecheck && lint && test`; `test:integration:db` (serial); `web`/`pwa` typecheck. `git status --porcelain` empty. Fix to green.

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → Phase 3 (US1 MVP)**. US2 depends on US1's compute + repository. US3/US4 depend on US1 routes + repository. US5 depends on the reader (T026) + repository (T020). US6 independent except the reader. Phase 9 subscriber depends on the repository `markStaleBy*`.
- **Pair handoff**: after Phase 2 + T020 + T026, Pilar passes the worktree absolute path to Esteio for T048/T049, T051–T054, T058–T061, T065; Pilar continues US1–US4 + subscriber. Pilar runs final gates (T068) and opens the PR.
- **[P] tasks** touch different files and can run together within a phase (all test-authoring tasks, the three domain functions, the two migrations).

## MVP scope

User Story 1 (Phases 1–3) is the minimum: an inspector can view a correctly-computed, isolated day plan. Everything else layers on top.
