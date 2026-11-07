---
description: "Task list for Reliability Index Metrics (TASK-F07-1)"
---

# Tasks: Reliability Index Metrics (backend + shared)

**Input**: Design documents from `specs/062-f07-1-index-metrics/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: REQUIRED. TDD is mandatory (Constitution §III + CLAUDE.md). Every behavior is driven red→green from the task's "Testes primeiro" tables. The domain suite also runs with `TZ=America/Los_Angeles`.

**Pair ownership**: `[PILAR]` = this agent (engine core + accountability codes). `[ESTEIO]` = paired agent (support index + Testcontainers DB suite + failure-string finalization + workspace docs). The pair runs **sequentially** (Pilar first → hand off worktree path to Esteio → Esteio commits back → Pilar runs gates + opens PR), because git forbids two worktrees on one branch. Pilar's slice must be independently green before handoff; Esteio's slice is additive and non-blocking.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependency)
- **[Story]**: US1 engine (P1) · US2 setting (P2) · US3 codes (P2) · US4 failures (P3)

## Path Conventions

- Shared: `packages/shared/src/…`
- Backend: `apps/backend/src/…`, `apps/backend/tests/integration/db/…`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Isolated worktree + green baseline.

- [X] T001 [PILAR] Create worktree `.claude/worktrees/f07-1-index-metrics` on branch `062-f07-1-index-metrics` from `origin/develop`; scaffold spec via `create-new-feature.sh --number 062`.
- [X] T002 [PILAR] Delegate to a Haiku subagent: `pnpm install`, `pnpm --filter backend exec prisma generate`, `pnpm --filter @properfy/shared build`, `pnpm --filter @properfy/frontend-standards build`, baseline typecheck+lint of shared+backend (condensed pass/fail only).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared metric vocabulary and the stuck-threshold move — imported by the whole engine.

**⚠️ CRITICAL**: US1 cannot compile until the vocabulary exists.

- [ ] T003 [P] [PILAR] Write `packages/shared/src/enums/reliability.test.ts` (red): `RELIABILITY_METRIC_KEYS` = the exact 8 in order; `RELIABILITY_METRIC_LABELS`/`RELIABILITY_METRIC_DESCRIPTIONS` have all 8; `CANT_ATTEND_EARLY_NOTICE_HOURS === 24`; `RELIABILITY_FAILURES_MAX === 20`; `RELIABILITY_WINDOW_DAYS === 30`; `RELIABILITY_TRAVEL_FACTOR === 1`.
- [ ] T004 [PILAR] Implement `packages/shared/src/enums/reliability.ts` (green): `ReliabilityMetricKey` (object `as const` + type, `reason-codes.ts` pattern), `RELIABILITY_METRIC_KEYS`, `RELIABILITY_METRIC_LABELS`, `RELIABILITY_METRIC_DESCRIPTIONS`, `ReliabilityScoreStatus` (`SCORED`/`INSUFFICIENT_VOLUME`/`NO_WEIGHTED_DATA`), and the four constants; export from `packages/shared/src/enums/index.ts`.
- [ ] T005 [PILAR] Move the stuck threshold: create `apps/backend/src/modules/inspector-execution/domain/stuck-execution.ts` (`export const STUCK_THRESHOLD_HOURS = 6`) and edit `…/infrastructure/workers/notify-stuck.worker.ts` to import it (no behavior change; existing worker test stays green).

**Checkpoint**: shared builds; vocabulary importable by backend.

---

## Phase 3: User Story 3 - Accountability rejection codes (Priority: P2)

**Goal**: `INSPECTOR_NO_SHOW` / `NOT_EXECUTED` with per-origin guard + audit metadata.

**Independent Test**: `allowedRejectionCodesFrom` per status; `reasonCodeLabel` for both; transition use-case accept/reject per origin+actor; `422 REJECTION_CODE_NOT_ALLOWED`.

**Note**: Ordered before US1 because the facts reader (Q2/Q7) and metrics 1/6/8 depend on these codes and on `metadata.rejectionReasonCode`.

- [ ] T006 [P] [US3] [PILAR] Write `packages/shared/src/enums/reason-codes.test.ts` additions (red): both new codes exist; total count = previous + 2; `allowedRejectionCodesFrom('SCHEDULED')` contains `INSPECTOR_NO_SHOW` not `NOT_EXECUTED`; `('DONE')` the reverse; `('DRAFT'|'AWAITING_INSPECTOR'|'REJECTED')` neither; labels correct.
- [ ] T007 [US3] [PILAR] Implement in `packages/shared/src/enums/reason-codes.ts`: `INSPECTOR_NO_SHOW`, `NOT_EXECUTED` (with docblocks), `REJECTION_CODES_BY_ORIGIN`, `allowedRejectionCodesFrom(fromStatus)` (respecting `SYSTEM_ONLY_REJECTION_CODES`); add labels in `packages/shared/src/utils/reason-code-label.ts`.
- [ ] T008 [P] [US3] [PILAR] Write `execute-status-transition.use-case.test.ts` additions (red) for the 1b table: no-show valid (OP), wrong origin → 422, CL→403 / SYS→422, `NOT_EXECUTED` valid (AM) / wrong origin → 422, `metadata.rejectionReasonCode` recorded (absent when no code).
- [ ] T009 [US3] [PILAR] Implement the guard in `apps/backend/src/modules/appointment/application/use-cases/execute-status-transition.use-case.ts`: before any write, `rejectionReasonCode ∉ allowedRejectionCodesFrom(appointment.status)` or `INSPECTOR_NO_SHOW` by SYS → `RejectionCodeNotAllowedError` (422 `REJECTION_CODE_NOT_ALLOWED`); write `metadata.rejectionReasonCode` on REJECTED transitions. Five RBAC sources unchanged.

**Checkpoint**: codes validated and audited; transition route accepts them.

---

## Phase 4: User Story 2 - Configurable reliability index setting (Priority: P2)

**Goal**: `reliabilityIndex` platform setting (weights, minimumVolume, volumeReferenceOverride, minimumRatings).

**Independent Test**: registry defaults + Zod validation table (test 2).

- [ ] T010 [P] [US2] [PILAR] Write `packages/shared/src/schemas/platform-settings.test.ts` additions (red): defaults (weights all 1, minimumVolume 10, volumeReferenceOverride null, minimumRatings 3); minimumRatings 0/51/2.5 reject, 1/50 ok; one weight 0 ok; all 0 → "Set at least one weight above 0"; weight 11/−1/1.5 reject; missing weight key reject; minimumVolume 0/201/2.5 reject (1/200 ok); volumeReferenceOverride 0/1001/2.5 reject (null/1/1000 ok); `resolvePlatformSettingValue('reliabilityIndex', null)` → defaults.
- [ ] T011 [US2] [PILAR] Implement `reliabilityIndexSettingSchema` + registry entry `reliabilityIndex: { schema, defaults, section: 'reliabilityIndex' }` in `packages/shared/src/schemas/platform-settings.ts` (metric weights `z.number().int().min(0).max(10)`, refine ≥1 weight > 0; `minimumVolume` 1–200; `volumeReferenceOverride` 1–1000 nullable; `minimumRatings` 1–50; defaults per FR-009).
- [ ] T012 [US2] [PILAR] Add `reliabilityMetricResultSchema` in `packages/shared/src/schemas/reliability.ts` (per data-model) and export from `packages/shared/src/schemas/index.ts`. `pnpm --filter @properfy/shared build`.

**Checkpoint**: setting readable/writable via existing F03 endpoints; result schema available to backend.

---

## Phase 5: User Story 1 - Reliability metrics engine (Priority: P1) 🎯 MVP

**Goal**: Compute the 8 metrics + score for any inspector over any civil period, in one pass.

**Independent Test**: worked-example fixtures (Ana…Fábio) → exact rates + scores + statuses; query-count invariance; `RangeError` on bad period.

### Domain — pure functions (tests first)

- [ ] T013 [P] [US1] [PILAR] `apps/backend/src/modules/reliability/domain/service-fact.ts`: `ServiceFact`, `ServiceFactRow*` types (no coordinate fields) + `__fixtures__/service-facts.ts` `buildFact(overrides)` with the task's defaults.
- [ ] T014 [P] [US1] [PILAR] `service-weight.test.ts` (red) → `service-weight.ts` (green): `serviceWeightMinutes({durationMinutes, plannedTravelMinutes})` = duration + 1×travel; fractional travel kept unrounded.
- [ ] T015 [P] [US1] [PILAR] `punctuality.test.ts` (red) → `punctuality.ts` (green): `evaluatePunctuality(fact, {toleranceMinutes})` → `PUNCTUAL|EARLY|LATE|NO_SHOW|NOT_EVALUABLE` (test 4, incl. published-service-start rescue, 24h early `CANT_ATTEND`, pre-F03 null radius, implausible client-time stored flag).
- [ ] T016 [P] [US1] [PILAR] `geofence.test.ts` (red) → `geofence-compliance.ts` (green): `evaluateGeofenceCompliance(fact)` → `PASS|MISS|EXCLUDED` (test 5, accuracy > radius inconclusive).
- [ ] T017 [P] [US1] [PILAR] `no-stuck.test.ts` (red) → `no-stuck.ts` (green): 6h boundary; reopened `resumed_at` → EXCLUDED; restarted execution measured from restart (test 6).
- [ ] T018 [P] [US1] [PILAR] `late-notice.test.ts` (red) → `late-notice.ts` (green): only LATE eligible; `advanceNoticeDeadline = publishedEtaAt ?? windowStartAt`; effective-notice via `resolveEffectiveEventTime`; other-inspector/other-date ETA ignored (test 7).
- [ ] T019 [P] [US1] [PILAR] `volume-reference.test.ts` (red) → `volume-reference.ts` (green): `computeVolumeReference(counts, override, periodDays)` median (floor 1, even=mean of middle, zeros ignored) / scaled override `roundToHalf` (test 8a).
- [ ] T020 [P] [US1] [PILAR] `volume-prorata.test.ts` (red) → `volume-prorata.ts` (green): `activeDaysInPeriod(createdOn, from, to)` + VOLUME pro-rata rate (test 8b, Sydney civil date of created_at).
- [ ] T021 [US1] [PILAR] `build-service-facts.test.ts` (red) → `build-service-facts.ts` (green): dedupe/annotate raw rows → facts (test 10: CANT_ATTEND vs DONE dedupe, re-offer attribution, reopened-open excluded, weight from plan stop, lateRejection marking, NOT_EXECUTED filter, inspectorCreatedOn).
- [ ] T022 [US1] [PILAR] `metrics.test.ts` (red) → `metrics.ts` (green): `computeMetricFromFacts(metric, facts, ctx)` for all 8 metrics using the worked-example fixtures (test 8 rate table), weighted rate + renormalization + null handling; emits `volume`, `weightedSuccess/Eligible`, `volumeReference`/`activeDays` (VOLUME), and the failed-fact list (detail formatting delegated to T030).
- [ ] T023 [US1] [PILAR] `score.test.ts` (red) → `score.ts` (green): `computeReliabilityScore(metrics, settings, volume)` + `roundHalfUp`; statuses SCORED/INSUFFICIENT_VOLUME/NO_WEIGHTED_DATA; exact worked scores (test 9).

### Port, reader, service (tests first)

- [ ] T024 [US1] [PILAR] `apps/backend/src/modules/reliability/domain/reliability-facts.reader.ts`: `IReliabilityFactsReader` port (`load`, `loadCompletedCounts`, tx variants).
- [ ] T025 [US1] [PILAR] `reliability-metrics.service.test.ts` (red) → `application/reliability-metrics.service.ts` (green): `computeMetric`/`computeAll`/`computeAllWith`; exported `InspectorReliabilityComputation`/`ReliabilityComputationBatch`; reads settings+tolerance once; `loadCompletedCounts` only on VOLUME/filtered/override paths; `RangeError` on `from>to`/invalid; median once per run (test 11).
- [ ] T026 [US1] [PILAR] `infrastructure/prisma-reliability-facts.reader.ts`: Q1a/Q1b, Q2, Q3, Q7, Q4, Q5, Q6 + `loadCompletedCounts` (seven-query one pass; `$queryRaw` with `::text[]`/`::date`/`::int` casts; Decimal→number; **no coordinate selected**; timezone-casted civil-date filters + instant pre-filter).
- [ ] T027 [US1] [PILAR] Wire `container.reliability = { metricsService }` in `apps/backend/src/main/container.ts` (`PrismaReliabilityFactsReader(prisma)` + F03 `IPlatformSettingsReader`).

**Checkpoint**: full engine green at unit+application level; worked examples pass.

---

## Phase 6: User Story 4 - Explainable failures (Priority: P3)

**Goal**: ≤ 20 privacy-safe failures per metric with `detail`.

**Independent Test**: test 8c — per-metric detail strings, cap, privacy, VOLUME empty.

- [ ] T028 [US4] [PILAR] `apps/backend/src/modules/reliability/domain/metric-failures.ts`: pure `detail(...)` + failure-assembly helpers (cap `RELIABILITY_FAILURES_MAX`, most-recent-first, ≤ 80 chars, no address/coordinate/agency). Wired into `metrics.ts` (T022).
- [ ] T029 [US4] [PILAR] Write `failures.test.ts` for the per-metric assembly through `computeMetricFromFacts` (test 8c), incl. the cap (25→20, failureCount 25) and privacy assertion.
- [ ] T030 [ESTEIO] Finalize failure-string wording in `metric-failures.ts` to match the exact test-8c strings and the TASK-F07-3 UI copy; confirm `failures.test.ts` locks every string; verify ≤ 80 chars and no location leak.

**Checkpoint**: every metric result carries its bounded failure list.

---

## Phase 7: Polish & Cross-Cutting (support index, DB suite, docs, gates)

- [ ] T031 [ESTEIO] Add `@@index([finished_at])` to `InspectionExecution` in `apps/backend/prisma/schema.prisma` and generate the migration `migrations/<ts>_inspection_executions_finished_at_idx/migration.sql` (ordered after F03/F04). Review the diff so Prisma does not drop any `Unsupported()` (PostGIS) index. No `audit_logs` index.
- [ ] T032 [ESTEIO] Write `apps/backend/tests/integration/db/reliability-facts.reader.db.test.ts` (Testcontainers, test 12): seed 2 agencies + inspectors; assert attribution (reject/re-offer/no-show/late rejection), timezone boundaries, CANT_ATTEND, deleted excluded, median consistency, query-count invariance (1 vs 50×20 via `$queryRaw` wrapper), and `EXPLAIN` of Q1a uses `inspection_executions_finished_at_idx` (`SET enable_seqscan=off` in-test).
- [ ] T033 [ESTEIO] Finalize `RELIABILITY_METRIC_LABELS`/`RELIABILITY_METRIC_DESCRIPTIONS` (EN) in `reliability.ts` to match the TASK-F07-3 UI table; keep `reliability.test.ts` green.
- [ ] T034 [ESTEIO] Update `apps/backend/CLAUDE.md` (module `reliability`: metric definitions pointer, "inspector_id null after REJECTED/CANCELLED → attribute by execution/event/audit", tenant exception, `INSPECTOR_NO_SHOW`/`NOT_EXECUTED`) and `packages/shared/CLAUDE.md` (`enums/reliability.ts`, `reliabilityIndex` key, `allowedRejectionCodesFrom`).
- [ ] T035 [PILAR] Run `pnpm generate:api`; commit `packages/shared/openapi.json` + `packages/shared/src/api-types.ts` only if the setting schema changed them (contract-freshness gate).
- [ ] T036 [ESTEIO] Run gates via subagent (condensed): `pnpm --filter @properfy/shared build test typecheck lint`; `pnpm --filter backend typecheck lint test`; `pnpm --filter backend test:integration:db`. Report pass/fail only.
- [ ] T037 [PILAR] Confirm `git diff --stat origin/develop... | tail -1` < 150 files; commit (Conventional), push, open PR → `develop` crediting both authors.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)** → **Foundational (P2)** blocks everything.
- **US3 codes (P3 phase)** and **US2 setting (P4 phase)** are prerequisites for **US1 engine (P5 phase)** (facts reader & metrics depend on the codes/metadata and the setting). Priority-wise US1 is P1, but it has a real dependency on the P2 stories — implementation order is codes → setting → engine.
- **US4 failures** is delivered inside the engine (metrics.ts) and finalized in Polish.
- **Polish (P7)**: support index + DB suite + docs after the engine is green.

### Pair handoff order (sequential, one branch)

1. **Pilar** completes T003–T029, T035 prep → green at shared + backend unit/application level.
2. Pilar hands the absolute worktree path to **Esteio** (via `maestri ask "Esteio"`).
3. **Esteio** completes T030–T034, T036 (migration, DB suite, label/failure finalization, docs, gates) → commits back.
4. **Pilar** runs final gates, T035 (api regen), T037 (PR), adversarial review loop.

### Parallel Opportunities (within one agent's turn)

- T003, T006, T010 (independent shared test files) in parallel.
- T014–T020 (independent pure-domain evaluators) in parallel.

---

## Implementation Strategy

- **MVP**: Foundational + US3 + US2 + US1 = the working engine consumed by F07-2/F08. US4 (failures) and the DB suite harden it.
- **TDD**: every implementation task has a red test task before it; run `TZ=America/Los_Angeles` on the domain suite.
- **Shared-file discipline**: `api-types.ts` regenerate (never hand-merge); one migration this PR (regenerate timestamp on rebase); no `role-matrix`/`notification-templates` changes in this slice.

## Notes

- No new HTTP endpoint; the status-transition route gains one error + audit metadata only.
- No `tenant_id` anywhere (D9 cross-tenant inspector); privacy-by-construction (no coordinate selected) — proven by the privacy test (T029) and the DB suite (T032).
