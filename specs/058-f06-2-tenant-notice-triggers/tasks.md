# Tasks: Tenant Arrival Notice Triggers — F06-2

**Branch**: `058-f06-2-tenant-notice-triggers` | **Spec**: `./spec.md` | **Plan**: `./plan.md`
**TDD**: mandatory (red → green → refactor). Tests authored before implementation in every story.
**Source of truth**: `fase2-etapa1/tarefas/F06-tarefas.md` §TASK-F06-2 (test numbers below reference its "Testes primeiro" list).

Path conventions: `S=` packages/shared/src, `B=` apps/backend/src, `BT=` apps/backend/tests.

Reused F06-1/F04-2 contracts (do NOT re-implement): `projectStopEta`/`isProjectedLate` (shared), `computeEtaBand`/`formatEtaBand`/`wallTimeHHmm`, `getTenantEtaNotificationId`, `TENANT_ETA_TEMPLATE_CODES`/`TenantEtaKind`, `ITenantEtaPlanReader` (`container.tenantEta.planReader`), `getFreshStopForAppointmentUseCase` (`container.dayPlan.*`), `TenantEtaNoticesSetting` + `IPlatformSettingsReader`, `isTenantEtaNoticesEnabled`, `toE164Au`, `CreateNotificationUseCase` (`{created}`), `BuildNotificationPayloadService`, `TenantCronTick.runDue`, `isRentalTenantNotificationsEnabled`, `suppressesOccupantNotifications`.

---

## Phase 1: Setup

- [x] T001 Worktree `058-f06-2-tenant-notice-triggers` from `origin/develop`; `pnpm install`, `prisma generate`, `@properfy/shared` + `@properfy/frontend-standards` builds, baseline backend+shared typecheck/lint green (done at setup).
- [x] T002 Re-confirm build order before any cross-package typecheck: `pnpm --filter @properfy/shared build` is already current (no shared change expected this task); rebuild only if a shared file is touched.

## Phase 2: Foundational (blocking prerequisites)

- [x] T003 [P] Extend `BT=/unit/shared/metrics.test.ts` (or the existing metrics test) for `incrementTenantEtaNoticeCount(kind, channel)` → `getSnapshot().notification.tenantEtaNoticeCounts['{kind}|{channel}']`, cleared by `reset()`. RED.
- [x] T004 Implement in `B=/shared/infrastructure/metrics.ts`: private `tenantEtaNoticeCounts = new Map<string,number>()`, `incrementTenantEtaNoticeCount`, snapshot field under `notification`, `reset()` clear, and the `MetricsSnapshot.notification.tenantEtaNoticeCounts` type (mirror `smsPartsByTemplate`). GREEN.
- [x] T005 [P] Author `BT=/integration/db/tenant-eta-notice-log.integration.test.ts`: `countSmsCreatedSince(since)` counts only `TENANT_ETA_*` SMS rows `created_at >= since` across tenants; `findMorningBands(ids, sinceByAppointment)` returns the latest `payload_json->>'etaBandFromAt'` of today's `TENANT_ETA_MORNING` rows per appointment, any channel, empty for none. RED.
- [x] T006 Implement port `B=/modules/tenant-eta/application/ports/tenant-eta-notice-log.ts` (`ITenantEtaNoticeLog`) + `B=/modules/tenant-eta/infrastructure/prisma-tenant-eta-notice-log.ts` (`findMorningBands`, `countSmsCreatedSince`; cross-tenant by design, no route). GREEN (`test:integration:db`).

---

## Phase 3: User Story 1 — Idempotent notifier with all pre-send guards (Priority: P1)

**Goal**: One `TenantEtaNotifier` every trigger calls; guard order + dedupe + SMS budget + metrics (research D-R1..R5).
**Independent test**: `tenant-eta-notifier.service.test.ts` green with in-memory repos + real `CreateNotificationUseCase` over an in-memory store.

- [x] T010 [US1] Author `BT=/unit/tenant-eta/tenant-eta-notifier.service.test.ts` covering task tests 1, 2, 3, 4, 5, 5b, 5c, 6, 7, 8, 8b, 8c, 8d, 9, 10b, 10c, 10d, 10e: MORNING 2-channel create + deterministic id + `etaFrom/etaTo`; single-channel; `SMS_ELSE_EMAIL`; each guard (`DISABLED`/`BEFORE_MORNING_HOUR`/`AGENCY_ETA_OFF`/`AGENCY_SWITCH_OFF`/`FLOW_TYPE_NO_OCCUPANT`/`TENANT_UNAVAILABLE`/`TENANT_UNCONFIRMED`/`NEXT_TOO_FAR`/`NO_RECIPIENT`); duplicate → `{created:0,duplicates:2}` + no metric; `{created:1,duplicates:1}`; `payloadJson.etaBandFromAt`/`serviceStartAt`/`planVersion`/`approximate` as strings; `alreadyNotified` counts SKIPPED/FAILED; SMS reserve 79/80 + cap 50→40 + 100%→cap + 0; reserve with `SMS_ELSE_EMAIL`; UTC bucket; counter read only when an SMS leg exists. RED.
- [x] T011 [US1] Implement `B=/modules/tenant-eta/application/tenant-eta-notifier.service.ts`: `TenantEtaNotifier.notify(input: TenantEtaNotifyInput): Promise<TenantEtaNotifyResult>` applying the guard order (data-model §Guard order); recipient rule (EMAIL raw, SMS `toE164Au(phone) ?? phone`, D-R2); SMS budget via `notificationRepo.countByTenantChannelSince(tenantId,'SMS',startOfUtcDay(now))` + `limit=floor(cap×share/100)` with `cap = typeof settingsJson.notificationDailyCapSms==='number'?it:100`; payload via `BuildNotificationPayloadService.build({...eta: formatEtaBand(band, windowTimezone)})` + stringified `etaBandFromAt/serviceStartAt/planVersion/approximate`; per-channel `createNotification` → `created` → `notice_created` log + `metrics.incrementTenantEtaNoticeCount` or `notice_skipped{ALREADY_SENT}`; expose `alreadyNotified(kind, planStop, now)` via `notificationRepo.count({tenantId,appointmentId,templateCode,fromDate: agencyLocalMidnightISO})`. GREEN.

## Phase 4: User Story 2 — Morning arrival estimate job (Priority: P1)

**Goal**: `tenant-eta.morning` tick at 07:00 agency-local, cutoff 09:00; MORNING or DELAY per stop; common `evaluateForPlan`.
**Independent test**: `send-morning-eta-notices.use-case.test.ts` (07:00 bands, 09:00 nothing) + DB end-to-end (test 22).

- [x] T020 [US2] Author `BT=/unit/tenant-eta/evaluate-for-plan.test.ts` (or fold into the use-case tests): seed-that-is-in-plan flow — `findPlanByInspectorDate` null → `NO_PLAN`; per-appointment `getFreshStop` null → try next, STALE → `PLAN_STALE`, FRESH → proceed; `planVersion` mismatch re-reads once; an out-of-plan appointment never skips the inspector. RED.
- [x] T021 [US2] Implement `B=/modules/tenant-eta/application/services/evaluate-for-plan.ts` (`evaluateForPlan({inspectorId,planDate}, now)` → `{ snapshot, projection, freshPlanVersion } | { skip: reason }`) and `evaluate-plan-delays.ts` (per pending late stop without DELAY today → notifier `kind:'DELAY'`). GREEN.
- [x] T022 [US2] Author `BT=/unit/tenant-eta/send-morning-eta-notices.use-case.test.ts` (tests 11–21): 07:00 bands A/B/C + `morning_completed`; 09:00 cutoff nothing; cutoff crossed mid-batch; STARTED; WINDOW_PASSED; NO_PLAN/PLAN_STALE; seed-out-of-plan advances (16b); approximate sends; already-late-morning → DELAY not MORNING; DELAY-already-sent → neither; re-exec no dup; UNAVAILABLE skipped but stays in projection (20b); two tz groups isolate (21). RED.
- [x] T023 [US2] Implement `B=/modules/tenant-eta/application/use-cases/send-morning-eta-notices.use-case.ts`: input `DueTenantGroup`; cutoff compute + re-check before each create; `findScheduledOnDate(todayCivilDate, tenantIds)` with inspectorId, group by inspector, `evaluateForPlan`, per-stop MORNING/DELAY rules (data-model), notify stops whose `tenantId ∈ tenantIds`; logs `morning_completed`/`morning_skipped_after_cutoff`. GREEN.
- [x] T024 [US2] Author + run `BT=/integration/db/tenant-eta-morning.integration.test.ts` (test 22): real plan via `StubRoutingService`, opt-out recorded via `RecordConsentOptOutUseCase`, run morning + `SendNotificationUseCase` stubs → A EMAIL SENT / SMS SKIPPED_OPT_OUT, B 2 SENT, C 1 SENT, correct `etaFrom`, no agency mirror; switch off → 0; `tenantEtaNoticesEnabled:false` → 0. `test:integration:db`.

## Phase 5: User Story 3 — "On the way" on check-out & can't-do (Priority: P2)

**Goal**: FINISH (check-out only) + CANT_DO subscribers → `tenant-eta.evaluate` → ON_THE_WAY/DELAY for the next stop; EARLY_CHANGE correction.
**Independent test**: subscriber tests + `evaluate-tenant-eta.use-case.test.ts`.

- [x] T030 [US3] Export `TRANSITION_SOURCE_INSPECTOR_FINISH = 'INSPECTOR_FINISH'` beside F03's `INSPECTOR_CANT_DO` (grep that constant's file); add `auditMetadata:{source:TRANSITION_SOURCE_INSPECTOR_FINISH}` to `FinishInspectionUseCase`'s `executeInTransaction` input (`B=/modules/inspector-execution/application/use-cases/finish-inspection.use-case.ts:127`); update `BT=/unit/inspector-execution/finish-inspection.use-case.test.ts` `toHaveBeenCalledWith` (test 28c). RED→GREEN.
- [x] T031 [P] [US3] Author `BT=/unit/tenant-eta/enqueue-tenant-eta-on-done.subscriber.test.ts` (tests 28, 28a) and `enqueue-tenant-eta-on-cant-do.subscriber.test.ts` (test 28b): correct enqueue with singleton key + `occurredAt=event.occurredAt`; MANUAL_DONE / wrong-source / NO_INSPECTOR skips; never rethrow. RED.
- [x] T032 [US3] Implement `B=/modules/tenant-eta/application/subscribers/enqueue-tenant-eta-on-done.subscriber.ts` and `enqueue-tenant-eta-on-cant-do.subscriber.ts` (register(bus)+subscribe(STATUS_TRANSITION); filter toStatus+metadata.source; enqueue `tenant-eta.evaluate`; log `enqueue_skipped`/`enqueue_failed`). GREEN.
- [x] T033 [US3] Author `BT=/unit/tenant-eta/evaluate-tenant-eta.use-case.test.ts` FINISH/CANT_DO + early-change cases (tests 30–39, 43b–43h, 49c scope via service, 49f, 49g, 50b, 50c): next-stop selection (next-after-finished / first-pending-for-cant-do / INSPECTOR_BUSY / NEXT_STARTED / NO_NEXT_STOP), DELAY-vs-ON_THE_WAY, 60-min lead, NOT_TODAY, STALE re-enqueue to attempt 3 then give-up, replay dedupe, EARLY_CHANGE via `findMorningBands`. RED.
- [x] T034 [US3] Implement `B=/modules/tenant-eta/application/services/evaluate-early-changes.ts` (pending stop with a morning band today where `projectedStartAt < etaBandFromAt − 30 min` → notifier `kind:'ON_THE_WAY', trigger:'EARLY_CHANGE'`, same id) and `B=/modules/tenant-eta/application/use-cases/evaluate-tenant-eta.use-case.ts` FINISH/CANT_DO paths (guards enabled/NOT_TODAY/BEFORE_MORNING_HOUR; `evaluateForPlan`; next-stop; notifier; then `evaluatePlanDelays`+`evaluateEarlyChanges` on stops after the next; STALE re-enqueue). GREEN.

## Phase 6: User Story 4 — Projected-delay notice (late-notice + sweep) (Priority: P2)

**Goal**: LATE_NOTICE subscriber + evaluate LATE_NOTICE path (all pending) + 30-min sweep; one DELAY per stop/day; volume warn.
**Independent test**: late-notice subscriber + `sweep-tenant-eta-delays.use-case.test.ts` + `tenant-eta-dedupe.test.ts`.

- [x] T040 [P] [US4] Author `BT=/unit/tenant-eta/enqueue-tenant-eta-on-late-notice.subscriber.test.ts` (test 29). RED.
- [x] T041 [US4] Implement `B=/modules/tenant-eta/application/subscribers/enqueue-tenant-eta-on-late-notice.subscriber.ts` (subscribe INSPECTOR_FIELD_EVENTS.RECORDED, filter `type==='LATE_NOTICE'`, enqueue with `eventId` singleton). GREEN.
- [x] T042 [US4] Extend `evaluate-tenant-eta.use-case.ts` + its test with the LATE_NOTICE branch (tests 40–43): `evaluatePlanDelays` over ALL pending, no next-stop ON_THE_WAY, `evaluateEarlyChanges` (no-op in practice), BEFORE_MORNING_HOUR, NO_PLAN. RED→GREEN.
- [x] T043 [US4] Author `BT=/unit/tenant-eta/sweep-tenant-eta-delays.use-case.test.ts` (tests 43i, 44–49g): E3a→0, E3b→DELAY, 11:30 nothing new; threshold 30 vs 20; STALE skippedStale; reserve mid-sweep → email-only; two tz; NEXT_DAY; `sweep_completed` fields; volume 500/501 warn; EARLY_CHANGE cases 49c–49g. RED.
- [x] T044 [US4] Implement `B=/modules/tenant-eta/application/use-cases/sweep-tenant-eta-delays.use-case.ts`: `listSweepCandidates(now)` → per candidate `evaluateForPlan` (STALE→skippedStale) → `evaluatePlanDelays` + `evaluateEarlyChanges` honoring each stop's agency `morningHour`; `smsCreatedToday = noticeLog.countSmsCreatedSince(midnight PLATFORM_TIMEZONE)`; `sweep_completed` + `daily_volume_high` warn > 500. GREEN.
- [x] T045 [P] [US4] Author `BT=/unit/tenant-eta/tenant-eta-dedupe.test.ts` (tests 50–52): FINISH∥LATE_NOTICE∥sweep on late C → exactly 1 DELAY/channel (sum of created = 1); FINISH∥CANT_DO → 1 ON_THE_WAY/channel; EARLY_CHANGE∥FINISH → 1; day-boundary 23:59 local; reschedule next day re-sends. RED→GREEN (resolved by the deterministic id already in the notifier).

## Phase 7: User Story 5 — Case-insensitive OPERATIONAL email consent matching (Priority: P3)

**Goal**: Fix the handed-off consent defect (research D-R1); minimal, safe, no migration.
**Independent test**: a consent test blocking a differently-cased email opt-out; fails on `develop` before the fix.

- [x] T050 [P] [US5] Author `BT=/unit/notification/consent-email-case.test.ts` (new): record an EMAIL OPERATIONAL opt-out for `Ana@Example.com`, then `isBlockedByConsent` / `findByScope` for `ana@example.com` (same tenant/channel/class) → blocked; phone matching unchanged. RED (fails on develop).
- [x] T051 [US5] Add `private normalizeConsentRecipient(recipient, channel)` (EMAIL → `.trim().toLowerCase()`, else as-is) to `B=/modules/notification/infrastructure/prisma-notification-consent.repository.ts`; apply in `findByScope` (where.recipient), `upsert` (findFirst where + stored `recipient`), `listByRecipient` (where.recipient). Leave `countSkippedForRecipient` (notifications table) untouched. GREEN.
- [x] T052 [US5] Update `B=/modules/notification/application/use-cases/record-consent-opt-out.use-case.ts` `normalizeRecipient` to lowercase email; fix the now-false "do NOT lowercase" comment and the class JSDoc. Confirm existing `BT=/.../record-consent-opt-out.use-case.test.ts` + consent suite still green.

## Phase 8: Wiring (depends on all use cases/subscribers)

- [x] T060 Wire `container.tenantEta.*` in `B=/main/container.ts`: construct `prismaTenantEtaNoticeLog`, `tenantEtaNotifier`, `sendMorningEtaNoticesUseCase`, `evaluateTenantEtaUseCase`, `sweepTenantEtaDelaysUseCase` (deps: planReader, getFreshStop (`container.dayPlan`), appointmentRepo, tenantRepo, notificationRepo, createNotification, buildNotificationPayload, appointmentCodeFormatter, settingsReader, noticeLog, metrics, jobQueue, clock, logger); register the 3 subscribers `.register(domainEventBus)` beside `InviteSurveyOnDoneSubscriber`.
- [x] T061 Create `B=/main/tenant-eta.worker.ts` `registerTenantEtaWorkers(boss, { tenantCronTick, settingsReader, sendMorning, evaluate, sweep, logger })`: `boss.schedule('tenant-eta.morning','0 * * * *',{}, SYDNEY_TZ)` + work (read setting, enabled-gate, `runDue(..., settings.morningHour, group=>sendMorning.execute(group))`); `boss.work('tenant-eta.evaluate', withJobMetrics(... evaluate.execute(job.data)))`; `boss.schedule('tenant-eta.sweep-delays','*/30 * * * *',{}, SYDNEY_TZ)` + work `{teamSize:1,teamConcurrency:1}` (enabled-gate, `sweep.execute(now)`). Call it inside `registerWorkers`; add the 3 names to the final worker log string; add the needed positional params to `registerWorkers` + pass from `B=/main/server.ts`.
- [x] T062 Author `BT=/unit/tenant-eta/tenant-eta.workers.test.ts` (pg-boss fake) covering the morning-worker behaviors (tests 23–27: `boss.schedule('tenant-eta.morning','0 * * * *', {}, PLATFORM_TIMEZONE)` + handler reads config and calls `runDue('tenant-eta.morning', morningHour, runner)`; Sydney/Adelaide/Perth tick timing; DST; `enabled:false` → `runDue` NOT called, no claim spent; error-in-group releases claim + rethrows; retry-after-09:00 sends nothing) AND the evaluate+sweep registration (test 53: `boss.work('tenant-eta.evaluate', withJobMetrics(...))`, `boss.schedule('tenant-eta.sweep-delays','*/30 * * * *', {}, SYDNEY)` + `boss.work(..., {teamSize:1,teamConcurrency:1})`, both handlers return early when `enabled:false`). Update BOTH global worker test sites: `apps/backend/tests/unit/workers.test.ts` (`mockWork` 26→29, `mockSchedule` 19→21, `toHaveBeenCalledWith` + new positional stubs) AND `apps/backend/src/main/__tests__/workers.test.ts` (`EXPECTED_SCHEDULES` +2). **At rebase, re-read both counts from the then-current `develop` (a parallel backend PR may have shifted them).** RED→GREEN.

## Phase 9: Polish & Cross-Cutting

- [x] T070 Update `apps/backend/CLAUDE.md` §9 (3 jobs `tenant-eta.{morning,evaluate,sweep-delays}`; tick-with-`>=`+mandatory-cutoff pattern; "subscriber only enqueues a durable job") and §10 (dedupe by deterministic id + count-since-agency-local-midnight, no `_SMS` family; ON_THE_WAY ≤ 60-min lead; `INSPECTOR_FINISH`-only check-out trigger; confirmation + `tenantEtaNoticesEnabled` skips; SMS reserve; `tenantEtaNoticeCounts` metric + `daily_volume_high`; **consent email-casing fix** — update the F06-1 "email … never lowercased" note to "case-insensitive at the consent repo"). Update root `CLAUDE.md` Active Technologies / Recent Changes with the F06-2 entry (X00 rule §13.11).
- [x] T071 Run full gates inside the worktree via a subagent (condensed summary): `pnpm --filter @properfy/shared build`; `pnpm --filter backend exec prisma generate && pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test && pnpm --filter backend test:integration:db`. Fix any failure and re-run until green.
- [x] T072 Verify negative constraints (FR-022): `git diff --name-only origin/develop... | grep -E 'prisma/migrations|api-types.ts|openapi.json'` → empty; `TenantCronTick` + the send pipeline (beyond the consent fix + F06-1 cost log) + the daily SMS cap untouched. Confirm `git diff --stat origin/develop... | tail -1` < 150 files (~30).

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T006: metrics + notice-log)** → stories.
- **US1 (T010–T011, notifier)** is the prerequisite for US2/US3/US4.
- **US2 (T020–T024)** builds `evaluateForPlan` + `evaluatePlanDelays` (reused by US3/US4) and the morning job; depends on US1.
- **US3 (T030–T034)** creates the `evaluate-tenant-eta` use case (FINISH/CANT_DO) + early-change; depends on US1, US2 (evaluateForPlan), notice-log (findMorningBands).
- **US4 (T040–T045)** extends the evaluate use case with LATE_NOTICE + adds the sweep + dedupe race; depends on US1, US2 (evaluatePlanDelays), US3 (evaluate use case), notice-log (countSmsCreatedSince).
- **US5 (T050–T052)** is fully independent (consent repo) — can run any time.
- **Wiring (T060–T062)** depends on all use cases + subscribers.
- **Polish (T070–T072)** last: CLAUDE.md after all code; gates after everything; negative-constraint check.

## Parallel Opportunities

- After Foundational: T010 (US1 tests) ∥ T050 (US5 consent test) ∥ T031/T040 subscriber tests (different files).
- `[P]` test-authoring tasks touch different files; same-file implementation tasks are sequential (e.g. T034 then T042 both edit `evaluate-tenant-eta.use-case.ts` → sequential).
- Do NOT run gate commands concurrently with edits in the same worktree (project memory: half-edited tree → false failures).

## Implementation Strategy (MVP first)

MVP = **Foundational + US1 + US2**: the notifier plus the morning job is a demonstrable, independently shippable slice (a tenant gets a morning arrival window). US3 (on-the-way), US4 (delay/sweep) and US5 (consent fix) complete the feature. US5 can land in parallel at any point.
