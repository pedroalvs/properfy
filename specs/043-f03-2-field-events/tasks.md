# Tasks: Inspector Field Events (backend + shared) — 043-f03-2-field-events

**Input**: `plan.md`, `spec.md`, `data-model.md`, `contracts/endpoints.md`, `research.md`, `quickstart.md`
**Tests**: REQUIRED (constitution §III TDD — red→green→refactor). Test tasks precede their implementation within each phase.
**Pair**: owner annotated per task — **(Pilar)** core slice, **(Esteio)** pair slice. One PR, two authors. All paths relative to repo root (the worktree).

**Owner map** (from the coordinator's pair division):
- **Pilar (A)**: event model/enums; `CANT_DO → REJECTED` via SYS + `INSPECTOR_UNABLE`; abandoned-execution handling across the 5 readers; finish lock `FOR UPDATE` + status CAS; `TRANSITION_SOURCE_INSPECTOR_CANT_DO`; the transition use-case extension (`auditMetadata`, `expectedStatus`, SYSTEM-only guard).
- **Esteio (A2)**: `LATE_NOTICE` + `estimatedArrivalAt`; OP/AM alert; `inspectorIssue` + field-activity API; portal no-reoffer for `INSPECTOR_UNABLE`; rejection email inspector block; `lastFieldIssue`; completion reminder (last, dep F02-1).

---

## Phase 1: Setup

- [ ] T001 Confirm worktree deps are ready (pnpm install, `prisma generate`, shared `dist/` built, backend+shared typecheck/lint baseline green). (Pilar) — done via setup subagent; re-run `pnpm --filter @properfy/shared build` after any shared edit.

## Phase 2: Foundational (blocking — shared contracts + schema; MUST complete before any story)

**Tests first (shared, Vitest):**

- [ ] T002 [P] (Pilar) Write/extend `packages/shared/src/enums/reason-codes.test.ts`: `INSPECTOR_UNABLE === 'INSPECTOR_UNABLE'`, "has exactly 9 codes", `SYSTEM_ONLY_REJECTION_CODES` contains only `INSPECTOR_UNABLE`; `packages/shared/src/utils/reason-code-label.test.ts`: `formatReasonCodeLabel('INSPECTOR_UNABLE') === 'Inspector Unable'` and the enum-iterating test stays green.
- [ ] T003 [P] (Pilar) Write `packages/shared/src/constants/transition-sources.test.ts`: `TRANSITION_SOURCE_INSPECTOR_CANT_DO === 'INSPECTOR_CANT_DO'`, exported from the index.
- [ ] T004 [P] (Pilar) Write `packages/shared/src/enums/field-events.test.ts`: `InspectorFieldEventType` (exactly `CANT_DO`,`LATE_NOTICE`); `FieldIssueReason` (exactly 6) + `FIELD_ISSUE_REASON_LABELS` complete; `LateNoticeReason` (exactly 4) + labels; `FIELD_ISSUE_NOTE_REQUIRED_REASONS === ['SITE_ISSUE']`.
- [ ] T005 [P] (Esteio) Write `packages/shared/src/schemas/field-events.test.ts`: `cantDoRequestSchema`, `lateNoticeRequestSchema`, `inspectorIssueSchema` (incl. optional `inspectorId`), `lateNoticeResponseSchema` (requires `estimatedArrivalAt`), `inspectorLastFieldIssueSchema`, `COMPLETION_REMINDER_DEDUPE_PREFIX`/`buildCompletionReminderDedupeKey`, per spec FR-005/FR-006 cases.
- [ ] T006 [P] (Esteio) Extend `packages/shared/src/schemas/responses.test.ts`: `appointmentResponseSchema` accepts with/without `inspectorIssue` (and null); `portalDataResponseSchema` accepts `appointment.canChangeTime` absent/true/false; `inspectorAppointmentDetailResponseSchema` accepts with/without `lastFieldIssue` (and null); `appointmentFieldActivityResponseSchema` accepts full (AM/OP) and trimmed (CL).

**Implementation (shared):**

- [ ] T007 (Pilar) Add `INSPECTOR_UNABLE` to `packages/shared/src/enums/reason-codes.ts` (doc note) + export `SYSTEM_ONLY_REJECTION_CODES`; keep `formatReasonCodeLabel` enum-derived in `utils/reason-code-label.ts`.
- [ ] T008 (Pilar) Create `packages/shared/src/constants/transition-sources.ts` (`TRANSITION_SOURCE_INSPECTOR_CANT_DO`) + export from `src/index.ts`.
- [ ] T009 (Pilar) Add event/issue/late enums + labels + `FIELD_ISSUE_NOTE_REQUIRED_REASONS` + `LATE_NOTICE_MINUTES_OPTIONS` to `packages/shared/src/enums/field-events.ts` (file created by F03-1) + exports.
- [ ] T010 (Esteio) Create `packages/shared/src/constants/inspector-notices.ts` (`COMPLETION_REMINDER_DEDUPE_PREFIX`, `buildCompletionReminderDedupeKey`) if F02 hasn't; export from index.
- [ ] T011 (Esteio) Create `packages/shared/src/schemas/field-events.ts` (cantDo/lateNotice request+response, inspectorIssue, fieldEventItem, executionSummary, appointmentFieldActivity, inspectorLastFieldIssue) + `schemas/index.ts` export; add `inspectorIssue` (nullable+optional, with "must stay declared" comment), `canChangeTime` (optional), `lastFieldIssue` (nullable+optional) to `packages/shared/src/schemas/responses.ts`.
- [ ] T012 (Pilar) Build shared and run shared tests green: `pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test`.

**Persistence (blocking for backend stories):**

- [ ] T013 (Pilar) Edit `apps/backend/prisma/schema.prisma`: add `InspectorFieldEventType` enum, `inspector_field_events` table + indexes + relations (per data-model.md; `tenant_id` present), and `inspection_executions.abandoned_at DateTime?`. Generate one migration `<ts>_inspector_field_events` (`prisma migrate dev`); `prisma generate`. Document in-spec the §II note: `InspectorFieldEvent` carries `tenant_id` (NOT an exception) and the CL scoping test (FR-008) proves it.

## Phase 3: User Story 1 — Can't do this job → REJECTED (P1) — (Pilar)

**Goal**: inspector reports CANT_DO; event + `SCHEDULED → REJECTED` via SYS with `INSPECTOR_UNABLE`; group unlinked, inspector released; agency + OP/AM notified; tenant not.
**Independent test**: integration test 17 (`inspector-cant-do.integration.test.ts`).

**Tests first:**

- [ ] T014 [P] [US1] (Pilar) Extend `apps/backend/.../appointment/.../execute-status-transition.use-case.test.ts`: human + `INSPECTOR_UNABLE` → 403 `REJECTION_REASON_CODE_SYSTEM_ONLY`; SYS + `INSPECTOR_UNABLE` → ok; `auditMetadata` merged into audit + `STATUS_TRANSITION` event (actorType stays SYSTEM, no actorId); no `auditMetadata` → regression identical; USER actor with `{ source: 'INSPECTOR_FINISH' }` on `→ DONE` → `metadata.source` present (proves generic field for F06-2).
- [ ] T015 [P] [US1] (Pilar) Write `apps/backend/.../inspector-execution/.../report-cant-do.use-case.test.ts` covering all cases in task test group 6 (happy no-check-in; with note; after check-in → abandoned; already finished → 409; other inspector → 404; not found → 404; already reported → 409 `CANT_DO_ALREADY_REPORTED`; not SCHEDULED → 409 `FIELD_EVENT_APPOINTMENT_NOT_SCHEDULED`; same key cache; key payload mismatch → 409; concurrent same key; non-INSP → 403; INSP w/o inspectorId → 403; transition failure → full rollback; after-commit audits + OP/AM alert + domain event).

**Implementation:**

- [ ] T016 [US1] (Pilar) Extend `execute-status-transition.use-case.ts`: generic `auditMetadata?: Record<string,unknown>` merged into the `status_transition` audit + `STATUS_TRANSITION` event; `expectedStatus?` CAS via `updateMany({ where:{ id, tenant_id, status } })` → `AppointmentStatusChangedError` (409 `APPOINTMENT_STATUS_CHANGED`); guard 3a-bis-2 (human + `SYSTEM_ONLY_REJECTION_CODES` → 403 `REJECTION_REASON_CODE_SYSTEM_ONLY`). Add optional `expectedStatus` to `IAppointmentRepository.update`. Do NOT touch `appointment-state-machine.ts` or the 4 other RBAC sources.
- [ ] T017 [US1] (Pilar) Create `inspector-execution/domain/inspector-field-event.entity.ts` + `domain/inspector-field-event.repository.ts` port (`create(event,tx)`, `findLatestCantDoByAppointmentIds(ids)`, `findLatestCantDoByAppointmentId(id,tx?)`, `listByAppointmentId(id,limit)`, `lockAppointmentForFieldEvent(appointmentId,tx)`); errors in `inspection-execution.errors.ts` (`CantDoAlreadyReportedError`, `FieldEventAppointmentNotScheduledError`, `LateNoticeNotAllowedError(message)`, `FieldEventIdempotencyPayloadMismatchError`).
- [ ] T018 [US1] (Pilar) Create `infrastructure/prisma-inspector-field-event.repository.ts` (incl. the `DISTINCT ON` `$queryRaw` with `::uuid[]` and `lockAppointmentForFieldEvent` `SELECT id … FOR UPDATE`).
- [ ] T019 [US1] (Pilar) Create `application/use-cases/report-cant-do.use-case.ts` per step 7 (assertRoles INSP; idempotency getWithHash/set in tx; `runInTransaction` with lock first → re-read idempotency → findById → assignment/status guards → execution finished/in-progress(abandon) → create event (tenant from appointment) → `executeInTransaction` REJECTED/`INSPECTOR_UNABLE`/`expectedStatus:'SCHEDULED'`/SYS+tenant/auditMetadata → `defer(runAfterCommit)` → set idempotency; after-commit: audits + OP/AM alert + domain event). `reason` = label + optional note.
- [ ] T020 [US1] (Pilar) Add `INSPECTOR_FIELD_EVENTS = { RECORDED: 'inspector_field_event.recorded.v1' }` to `shared/application/events/domain-event-bus.ts`; wire `report-cant-do` route `POST /v1/inspector/appointments/:appointmentId/cant-do` in `inspector-execution.routes.ts` (body+response schemas); container wiring in `main/container.ts`/`routes.ts`.

## Phase 4: Abandoned-execution handling across readers (P1) — (Pilar)

**Goal**: an abandoned execution is "not started" everywhere; re-offer restarts the same row (D13). (Portal reader is shared with US6; this phase owns the start/finish/schedule/detail/stuck readers.)

**Tests first:**

- [ ] T021 [P] [US1] (Pilar) Extend `start-inspection.use-case.test.ts` (restart abandoned row: new inspector/coords/flags, reset finish/resumed/abandoned to null, current `geofence_radius_m`, audit `inspection_execution.restarted` with no coordinates, same executionId; abandoned + BLOCK out of radius → 422, no restart; radius change snapshot); `finish-inspection.use-case.test.ts` (abandoned → 404 `EXECUTION_NOT_STARTED`); `get-inspector-schedule.use-case.test.ts` (abandoned → `NOT_STARTED`); `get-appointment-detail.use-case.test.ts` inspector (abandoned → `execution: null`); repository/worker `findStuckExecutions` ignores `abandoned_at IS NOT NULL`.

**Implementation:**

- [ ] T022 [US1] (Pilar) Extend execution entity/port/repo: `abandonedAt`, `isAbandoned()`, `markAbandoned(id,at,tx)`, `restart(id,data,tx)`, `findStuckExecutions` with `abandoned_at: null`.
- [ ] T023 [US1] (Pilar) Apply abandoned handling in `start-inspection.use-case.ts` (restart path), `finish-inspection.use-case.ts` (404), `get-inspector-schedule.use-case.ts` (`NOT_STARTED`), inspector `get-appointment-detail.use-case.ts` (`execution: null`), `prisma-inspection-execution.repository.ts` `findStuckExecutions`. Fix any untyped test wirings that break from new deps.

## Phase 5: User Story 7 — Finish vs can't-do concurrency (P1) — (Pilar)

**Goal**: finish and can't-do serialize on the appointment-row lock; CAS catches lock-bypassing writers; no deadlock, no mixed state.
**Independent test**: integration test 23 (`cant-do-finish-concurrency.integration.test.ts`) — must fail when lock OR CAS removed.

**Tests first:**

- [ ] T024 [US7] (Pilar) Write `tests/integration/db/cant-do-finish-concurrency.integration.test.ts`: 20 rounds of parallel `/finish` + `/cant-do` with a barrier; each round exactly one winner, clean 409/422 loser, no `40P01`, no mixed state. Record the mutation-proof result (remove lock/CAS → fails) in the PR body.

**Implementation:**

- [ ] T025 [US7] (Pilar) In `finish-inspection.use-case.ts`: `lockAppointmentForFieldEvent(appointmentId, tx)` as the FIRST statement in `runInTransaction`; re-read execution in tx (abandoned/finished → 404/409); call the transition with `expectedStatus:'SCHEDULED'`. New `IInspectorFieldEventRepository` dep in constructor (fix test wirings).

## Phase 6: User Story 3 — OP/AM alert + agency rejection email (P1) — (Esteio)

**Goal**: after CANT_DO, OP/AM alerted; agency email states the inspector couldn't complete it.
**Independent test**: integration test 17 notification assertions + unit 14b.

**Tests first:**

- [ ] T026 [P] [US3] (Esteio) Write `notify-inspector-unable.service.test.ts` (one `INSPECTOR_UNABLE_ALERT` per active OP/AM; failed recipient logged, request ok; zero OP/AM logs error); `platform-notification-templates.test.ts` (new `INSPECTOR_UNABLE_ALERT`; `INSPECTION_REJECTED_AGENCY` with/without `rejectedByInspector`); `build-notification-payload.service.test.ts` (`INSPECTOR_UNABLE` → `rejectedByInspector:true`+`inspectorName` from last CANT_DO; `TENANT_DECLINED` unchanged).

**Implementation:**

- [ ] T027 [US3] (Esteio) Register `INSPECTOR_UNABLE_ALERT` in all 8 template places (NOT `seed.ts`) with explicit `notificationClass:'TRANSACTIONAL'`, `TEMPLATE_TARGETS='PLATFORM_OPS'`, `INSPECTOR_UNABLE_ALERT_PAYLOAD_KEYS`, subject/body/HTML (`renderSystemEmailHtml`); add to `PLATFORM_ONLY_TEMPLATE_CODES` + `SYSTEM_TEMPLATE_CODES`.
- [ ] T028 [US3] (Esteio) Create `application/services/notify-inspector-unable.service.ts` (pattern of `notify-stuck.worker`); call it from `report-cant-do` after-commit.
- [ ] T029 [US3] (Esteio) Alter `INSPECTION_REJECTED_AGENCY` (`platform-notification-templates.ts` conditional block) + `build-notification-payload.service.ts` (`rejectedByInspector`/`inspectorName` from latest CANT_DO); add `rejectedByInspector` to `TEMPLATE_VARIABLES.INSPECTION_REJECTED_AGENCY.optional` + its test.

## Phase 7: User Story 2 — Running late (P2) — (Esteio)

**Goal**: LATE_NOTICE with server-computed `estimatedArrivalAt`; today-only, pre-check-in.
**Independent test**: unit 7 + integration 19.

**Tests first:**

- [ ] T030 [P] [US2] (Esteio) Write `report-late-notice.use-case.test.ts` + `domain/late-notice.ts` pure-fn tests (`computeEstimatedArrivalAt`) per task test group 7 (window-start vs published-plan reference; after window; clientOccurredAt; not-today → 422; checked-in → 422; finished → 422; abandoned → ok; second notice ok; same key cache).

**Implementation:**

- [ ] T031 [US2] (Esteio) Create `domain/late-notice.ts` (`computeEstimatedArrivalAt`, `IPublishedStopStartReader` port + null F03 adapter); `application/use-cases/report-late-notice.use-case.ts` (step 8); route `POST .../late-notice` in `inspector-execution.routes.ts` + container wiring.

## Phase 8: User Story 4 — Field activity + inspectorIssue + lastFieldIssue (P2) — (Esteio)

**Goal**: field-activity API with CL privacy cut; `inspectorIssue` on list/detail (one query/page); `lastFieldIssue` on inspector detail.
**Independent test**: integration 20; integration 17 query-count assertion; unit 14/8b/11.

**Tests first:**

- [ ] T032 [P] [US4] (Esteio) Write `get-appointment-field-activity.use-case.test.ts` (AM/OP coords present; CL no coords; cross-tenant CL → 404; INSP → 403; abandoned execution; ≤50 desc); extend `get-appointment.use-case.test.ts`/`list-appointments.use-case.test.ts` (`inspectorIssue` from latest CANT_DO, null, most-recent); `get-appointment-detail.use-case.test.ts` (`lastFieldIssue` own-inspector cases, D28); repository test for the `DISTINCT ON` (3 events/2 appointments → 2 rows).

**Implementation:**

- [ ] T033 [US4] (Esteio) Create `application/use-cases/get-appointment-field-activity.use-case.ts` (same tenant cut as `GetAppointmentUseCase`; CL omits lat/lng keys) + route `GET /v1/appointments/:appointmentId/field-activity` in `appointment.routes.ts` + wiring.
- [ ] T034 [US4] (Esteio) Wire `inspectorIssue` into `prisma-appointment.repository.ts` (`findLatestCantDoByAppointmentIds` once per page, merge in memory; empty → no query), `AppointmentWithRelations`/`AppointmentListItem`, `get-appointment.use-case.ts`, `list-appointments.use-case.ts`; add `lastFieldIssue` + `IInspectorFieldEventRepository` dep to inspector `get-appointment-detail.use-case.ts`; add `inspectorId` to the `inspectorIssue` query (`DISTINCT ON` + `e.inspector_id`). Export regression test: export "Cancellation Reason" humanizes `INSPECTOR_UNABLE`.

## Phase 9: User Story 6 — Portal no-reoffer for INSPECTOR_UNABLE (P2) — (Esteio)

**Goal**: tenant cannot reschedule an inspector-rejected job; TENANT_DECLINED still revives.
**Independent test**: integration 18 portal block + unit 13b.

**Tests first:**

- [ ] T035 [P] [US6] (Esteio) Write `portal-statuses.test.ts` (`isPortalChangeTimeBlocked` cases) + extend `get-available-groups`/`join-group`/`get-portal-data`/`report-unavailability` use-case tests per task test groups 13 & 13b (abandoned execution + INSPECTOR_UNABLE block + TENANT_DECLINED regression + in-tx race re-read).

**Implementation:**

- [ ] T036 [US6] (Esteio) Add `isPortalChangeTimeBlocked({status,rejectionReasonCode})` to `rental-tenant-portal/domain/portal-statuses.ts` (keep `isPortalDeadStatus`/`PORTAL_DEAD_STATUSES` unchanged); use in `join-group` (3 points), `get-available-groups` (`{groups:[]}` before slot lookup), `get-portal-data` (`appointment.canChangeTime`); make `report-unavailability` ignore abandoned executions (shared with Phase 4's reader list).

## Phase 10: User Story 5 — Completion reminder 03.16 (P2, LAST — dep F02-1) — (Esteio)

**Goal**: once-per-appointment/day/inspector reminder via F02. **Build last; rebase onto F02-1 before merge.**
**Independent test**: unit 16 + integration 21.

**Tests first:**

- [ ] T037 [P] [US5] (Esteio) Write `send-completion-reminders.use-case.test.ts` per task test group 16 (not-started vs in-progress body; busy suppression; dedupeKey w/ inspector+civil date; audit only on `created===true`; enabled flag; locked-screen-safe text; summary log).

**Implementation:**

- [ ] T038 [US5] (Esteio) Create `application/use-cases/send-completion-reminders.use-case.ts` (step 13) + job `inspection-execution.completion-reminder` in `main/workers.ts` (`*/15 * * * *`, `SYDNEY_TZ`, `withJobMetrics`); call F02 `PublishSystemInspectorNoticeUseCase`; audit `inspection.completion_reminder_sent` on `created===true`; summary log.

## Phase 11: Integration proofs (DB, testcontainers, serial)

- [ ] T039 [P] [US1] (Pilar) `tests/integration/db/inspector-cant-do.integration.test.ts` (proof of 00.A3, test group 17).
- [ ] T040 [P] [US1] (Pilar) `tests/integration/db/inspector-cant-do-after-check-in.integration.test.ts` (test 18; portal block before/after re-offer — coordinate with Esteio's Phase 9).
- [ ] T041 [P] [US2] (Esteio) `tests/integration/db/inspector-late-notice.integration.test.ts` (test 19).
- [ ] T042 [P] [US4] (Esteio) `tests/integration/db/appointment-field-activity.integration.test.ts` (test 20; assert absence of coordinate keys for CL).
- [ ] T043 [P] [US1] (Pilar) `tests/integration/db/stuck-execution-abandoned.integration.test.ts` (test 22).
- [ ] T044 [P] [US5] (Esteio) `tests/integration/db/completion-reminder.integration.test.ts` (test 21; real F02, after F02-1 merged).

## Phase 12: Polish & Cross-Cutting

- [ ] T045 (Pilar) `pnpm generate:api` → regenerate `packages/shared/openapi.json` + `packages/shared/src/api-types.ts`; commit both. Verify `pnpm --filter web typecheck && pnpm --filter pwa typecheck` compile against the new contract.
- [ ] T046 (Pilar) Update `apps/backend/CLAUDE.md` and `packages/shared/CLAUDE.md`: new routes (`cant-do`, `late-notice`, `field-activity`), `InspectorFieldEvent` + `abandoned_at`, `INSPECTOR_UNABLE` + `SYSTEM_ONLY_REJECTION_CODES`, `TRANSITION_SOURCE_INSPECTOR_CANT_DO`, `INSPECTOR_UNABLE_ALERT` template, completion-reminder job, transition `auditMetadata`/`expectedStatus`. Remove the X00 N6/N9 transition clauses this PR makes true (L-X00-04).
- [ ] T047 (Pilar) Final gates via subagent (condensed summary): `pnpm --filter @properfy/shared build && test`; `pnpm --filter backend typecheck && lint && test`; `pnpm --filter backend test:integration:db`; `git status --porcelain` empty before push; ≤150 changed files (`git diff --stat origin/develop... | tail -1`).

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2** (foundational shared + schema) block everything.
- **US1 (Phase 3) + abandoned (Phase 4)** are the core and unblock US7 (Phase 5), US3 (Phase 6), US4 (Phase 8), US6 (Phase 9).
- **US2 (Phase 7)** depends only on Phase 2 (+ `resolveEffectiveEventTime` from F03-1, already merged).
- **US5 (Phase 10)** is LAST — depends on F02-1 merged.
- **Pair sequencing**: Pilar completes Phases 2 (shared core)→3→4→5, then hands the absolute worktree path to Esteio (Phases 6–10) in the same directory. Esteio's Phase 9 portal reader and Pilar's Phase 4 reader list must be reconciled (one `report-unavailability` edit). Pilar runs Phase 11–12 final gates and opens the PR.

## Independent Test Criteria (per story)

- **US1**: `cant-do` on a SCHEDULED job → REJECTED/`INSPECTOR_UNABLE`, unlinked, agency+OP/AM mailed, tenant not, gone from schedule (int. 17/18).
- **US2**: `late-notice` today pre-check-in → 201 + `estimatedArrivalAt`; else 422 (unit 7, int. 19).
- **US3**: one alert per OP/AM + agency email inspector block (int. 17, unit 14b).
- **US4**: field activity hides coords from CL; `inspectorIssue` one query/page (int. 20, int. 17 query count).
- **US5**: one reminder per appointment/day/inspector (unit 16, int. 21).
- **US6**: portal `canChangeTime:false`, groups `[]`, join 409 for `INSPECTOR_UNABLE`; `TENANT_DECLINED` revives (unit 13b, int. 18).
- **US7**: 20× concurrent finish/can't-do → one winner, no deadlock/mixed state; fails without lock/CAS (int. 23).

## Parallel Opportunities

- Phase 2 tests T002–T006 are `[P]` (distinct files).
- After Phase 5, Esteio's story phases 6–10 test tasks (T026/T030/T032/T035/T037) are `[P]` with each other; integration tests T039–T044 are `[P]` (distinct files) but the DB suite runs serially at execution time.
