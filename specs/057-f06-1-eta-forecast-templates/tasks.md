# Tasks: Tenant Arrival ETA Forecast & Templates (Foundation) — F06-1

**Branch**: `057-f06-1-eta-forecast-templates` | **Spec**: `./spec.md` | **Plan**: `./plan.md`
**TDD**: mandatory (red → green → refactor). Tests are authored before implementation in every story.
**Source of truth**: `fase2-etapa1/tarefas/F06-tarefas.md` §TASK-F06-1 (test numbers below reference its "Testes primeiro" list).

Path conventions: `S=` packages/shared/src, `B=` apps/backend/src, `BT=` apps/backend/tests, `W=` apps/web/src.

---

## Phase 1: Setup

- [x] T001 Worktree on `057-f06-1-eta-forecast-templates` from `origin/develop`; `pnpm install`, `prisma generate`, `@properfy/shared` + `@properfy/frontend-standards` builds, baseline typecheck+lint green (done at setup).
- [ ] T002 Confirm build order before any cross-package typecheck: `pnpm --filter @properfy/shared build` after each shared change (backend/web resolve `dist`, not source).

## Phase 2: Foundational (blocking prerequisites)

- [ ] T003 [P] Add `S=/constants/tenant-eta.ts`: `TENANT_ETA_BAND_HALF_WIDTH_MINUTES=30`, `TENANT_ETA_ON_THE_WAY_MAX_LEAD_MINUTES=60`, `TENANT_ETA_EARLY_CHANGE_MINUTES=30`, `TENANT_ETA_DAILY_SMS_WARN_THRESHOLD=500`; export from `S=/index.ts` (or constants barrel). Test `S=/constants/tenant-eta.test.ts` (task test 2c).

---

## Phase 3: User Story 1 — Shared ETA prediction module (Priority: P1)

**Goal**: One pure `projectStopEta` in `shared`, consumed by F05/F06-2/PWA; departure `max(anchorEnd ?? now, now)`; coherent with the live F04 `evaluateSequence`.
**Independent test**: `project-stop-eta.test.ts` green with the A/B/C fixture (E1–E14), incl. the reconciled E12 coherence against stored `service_start_at` + a direct `evaluateSequence` (research R1).

- [ ] T010 [US1] Author `S=/route-planning/project-stop-eta.test.ts` with fixtures and examples E1, E1b, E2, E3a, E3b, E4a–E4d, E5, E5b, E6, E7, E8, E9, E10, E11, **E12 (reconciled per research R1)**, E12b (adapter), E13 (DST), E14 (determinism); and `isProjectedLate` thresholds (20/25/30). RED.
- [ ] T011 [US1] Implement `S=/route-planning/project-stop-eta.ts`: types `EtaPlanStop`/`EtaPlanInput`/`EtaRealEvents`/`ProjectedStop`; `projectStopEta` (classify → anchor → build `OptimizerInput` with zero `travelS` matrix + `legTravelS` + `earliestDepartureS=max(anchorEnd??now,now)` → `evaluateSequence` → `LATE_NOTICE` floor D18 → outputs); `isProjectedLate` (strict). Pure, epoch-seconds, no I/O. GREEN.
- [ ] T012 [US1] Implement `etaPlanInputFromDayPlanResponse(plan: DayPlanResponse)` in the same file (`publishedServiceStartAt=null`); export all from `S=/route-planning/index.ts`.
- [ ] T013 [US1] `pnpm --filter @properfy/shared build && test` for the predictor; verify E12 against the live F04 contract.

## Phase 4: User Story 2 — Tenant arrival templates + server-side variable validation (Priority: P1)

**Goal**: 3 codes × EMAIL/SMS registered in all 6 shared spots + backend seed + payload; required-var guard on upsert.
**Independent test**: boot seeds 6 `TENANT_ETA_*` rows; upsert rejects a body missing `{{etaFrom}}`/`{{etaTo}}`.

- [ ] T020 [P] [US2] Extend `S=/constants/notification-templates.test.ts` (task test A1): codes in `MANDATORY_TEMPLATE_CODES`, not `PLATFORM_ONLY_`; no `_SMS`; labels; target `RENTAL_TENANT`; `getDefaultClass OPERATIONAL`; not protected; `required=['etaFrom','etaTo']`; `ALLOWED_VARIABLES`+`SAMPLE_DATA` (`'10:15 am'`/`'11:15 am'`); `matchTemplateCodesBySearch('running late')`. Extend `non-notifying-flow-types.test.ts`. RED.
- [ ] T021 [US2] Edit `S=/constants/notification-templates.ts` all 6 points (MANDATORY, LABELS, TEMPLATE_TARGETS + docblock dispatch note, DEFAULT_TEMPLATE_CLASSIFICATIONS, TEMPLATE_VARIABLES, ALLOWED_VARIABLES+SAMPLE_DATA) with the comments from the task §Escopo step 1. GREEN. `pnpm --filter @properfy/shared build`.
- [ ] T022 [P] [US2] Extend `BT=/unit/notification/platform-notification-templates.test.ts` (task test 7): 6 `TENANT_ETA_*` entries in `APPOINTMENT_EMAIL_CODES`; layout/sanitizer/spec-vars/`SAMPLE_DATA` render; `resolvePlatformTemplateClass OPERATIONAL`; no `{{timeSlot}}`/`{{confirmationLink}}`; SMS `measureSmsTemplate` GSM-7 1 part (MORNING 117/ON_THE_WAY 110/DELAY 130); 40-char name → DELAY 160 exact, 41 → 2 parts; no `–`/`’`; on-the-way EMAIL has no "finished the previous visit", has "is on the way". RED.
- [ ] T023 [US2] Add 3 HTML consts + 6 `PLATFORM_TEMPLATES` entries in `B=/modules/notification/domain/platform-notification-templates.ts` (exact copy from task §Templates). GREEN.
- [ ] T024 [P] [US2] Extend `BT=/unit/notification/build-notification-payload.service.test.ts` (task test 6): `eta` → `etaFrom`/`etaTo`; missing `eta` → key absent + `MissingRequiredVariableError`; `INSPECTION_NOTICE` + eta → keys absent; `confirmationLink` absent for `TENANT_ETA_*`; no contact → no error. RED.
- [ ] T025 [US2] Add `NotificationPayloadContext.eta?: { from; to }` and the `allVars` spread in `B=/modules/notification/domain/build-notification-payload.service.ts`. GREEN.
- [ ] T026 [P] [US2] Author `BT=/unit/notification/upsert-notification-template.use-case.test.ts` extension (task test 7c): missing required → 400 `Missing required variables: etaFrom, etaTo` (`field 'bodyHtml'`), nothing saved; valid saved; subject-only var ok; legacy `INSPECTION_NOTICE` without `{{scheduledDate}}` → same error; `{{#if}}` counts; no-spec code unaffected. RED.
- [ ] T027 [US2] Add the `findTemplateVariableIssues(subject+bodyHtml, { required: spec.required, allowed: ALLOWED_VARIABLES })` `missing` guard to `B=/modules/notification/application/use-cases/upsert-notification-template.use-case.ts` after the Body/Subject checks. GREEN.

## Phase 5: User Story 6 — Observability + `CreateNotificationOutput.created` + plan reader (Priority: P3, but infra for others)

> Scheduled early because `CreateNotificationOutput` shape ripples across ~24 mocks; doing it before the web consumer stories keeps backend green.

- [ ] T030 [P] [US6] Extend `BT=/unit/notification/create-notification.use-case.test.ts` (task test 7b): no id / new id → `{created:true}` + job; existing id → `{created:false}` + no job; `MARKETING` still throws. RED.
- [ ] T031 [US6] Change `CreateNotificationOutput` to `{ notificationId; created }` in `B=/modules/notification/application/use-cases/create-notification.use-case.ts`. GREEN.
- [ ] T032 [US6] Grep + update ALL ~24 backend test mocks/stubs of `CreateNotificationUseCase` to the new shape (`grep -rlE "CreateNotificationUseCase|createNotification" apps/backend/{src,tests} | grep '\.test\.ts$'`); confirm 15 `src/` callers still compile (none read `created`). `pnpm --filter backend typecheck`.
- [ ] T033 [P] [US6] Extend `BT=/unit/notification/send-notification.use-case.test.ts` (task test 8): SMS success → `notification.sms_dispatched` log (measured parts/encoding/length/truncated, no recipient) + `metrics.addSmsParts(code, parts)` once; 170-char → parts 2; emoji → UCS-2; email/provider-failure → no log, no metric. RED.
- [ ] T034 [US6] Add `smsPartsByTemplate` to `MetricsCollector` (`getSnapshot`/`reset`) + `addSmsParts`; add the SMS cost log + metric call to the SMS success branch of `B=/modules/notification/application/use-cases/send-notification.use-case.ts`. GREEN.
- [ ] T035 [P] [US6] Add `findLatestLateNoticeByAppointmentIds(ids, since)` to `B=/modules/inspector-execution/domain/inspector-field-event.repository.ts` port + Prisma impl (DISTINCT ON, `type='LATE_NOTICE'`); unit/integration test (task test 10). If F05 already added it, reuse. RED→GREEN.
- [ ] T036 [P] [US6] Author `BT=/unit/tenant-eta/tenant-eta-notification-id.test.ts` (task test) and `BT=/unit/tenant-eta/eta-band.test.ts` (task test 4) with all band cases (clips, rounding, fallback, timezones, DST, GSM-7). RED.
- [ ] T037 [US6] Implement `B=/modules/tenant-eta/domain/tenant-eta.constants.ts`, `eta-band.ts` (`computeEtaBand`/`formatEtaBand`/`wallTimeHHmm`/round/ceil5), `tenant-eta-notification-id.ts` (UUID v5, fixed namespace). GREEN.
- [ ] T038 [US6] Implement `B=/modules/tenant-eta/domain/tenant-eta-plan.reader.ts` port + `infrastructure/prisma-tenant-eta-plan.reader.ts` (`loadPlan` with `stopMeta`, `findPlanByInspectorDate`, `listSweepCandidates`; live join, Decimal/date conversion). Wire in `container.ts`.
- [ ] T039 [US6] Author + run `BT=/integration/db/tenant-eta-plan.reader.integration.test.ts` (task test 9): sequence/legs/windows/published/exec flags; `stopMeta` L-F06-02; abandoned → null; reassigned/deleted absent; two agencies present (D9); LATE_NOTICE yesterday ignored / two today → latest / CANT_DO ignored; `findPlanByInspectorDate`; `listSweepCandidates` (today/yesterday/DRAFT/Perth timezone). `test:integration:db`.

## Phase 6: User Story 3 — `tenantEtaNotices` platform setting + web section (Priority: P2)

- [ ] T040 [P] [US3] Extend `S=/schemas/platform-settings.test.ts` (task test 2): defaults, `section`, full validation matrix (cutoff>morning, bounds). RED.
- [ ] T041 [US3] Add `tenantEtaNotices` to `PLATFORM_SETTINGS_REGISTRY` in `S=/schemas/platform-settings.ts` (schema/defaults/section per contract). GREEN. `pnpm --filter @properfy/shared build`.
- [ ] T042 [P] [US3] Author `W=/features/platform-settings/components/TenantEtaNoticesSection.test.tsx` (task test 11): defaults render; change+save `PUT`; cutoff≤morning inline error + Save disabled; bounds error; 422 server message; a11y (`role="switch"`, labels); header from `section`. RED.
- [ ] T043 [US3] Implement `W=/features/platform-settings/components/TenantEtaNoticesSection.tsx`, mount in `PlatformSettingsPage.tsx` via `usePlatformSetting('tenantEtaNotices')`. GREEN.

## Phase 7: User Story 4 — Per-agency arrival-notice flag (Priority: P2)

- [ ] T050 [P] [US4] Extend `S=/schemas/tenant.test.ts` + author `S=/utils/tenant-eta-notices.test.ts` (task test 2b): default true, `'no'` → error; `isTenantEtaNoticesEnabled` truth table. RED.
- [ ] T051 [US4] Add `tenantEtaNoticesEnabled` to `tenantSettingsSchema` (`S=/schemas/tenant.ts`) + `isTenantEtaNoticesEnabled` (`S=/utils/tenant-eta-notices.ts`, export from index). GREEN. `pnpm --filter @properfy/shared build`.
- [ ] T052 [P] [US4] Extend `W=/features/tenants/components/TenantFormDrawer.test.tsx` (task test 11b): AM sees checked default; uncheck+save `settingsJson.tenantEtaNoticesEnabled false`; disabled+help when rental switch off; absent for non-AM. RED.
- [ ] T053 [US4] Add the checkbox to `TenantFormDrawer.tsx` Notifications section (AM gate, `disabled` when rental switch off), form state via `isTenantEtaNoticesEnabled`, send in `settingsJson`; add type in `W=/features/tenants/types/index.ts`. GREEN.

## Phase 8: User Story 5 — Manual AM/OP consent opt-out (Priority: P2)

- [ ] T060 [P] [US5] Add `recordConsentOptOutSchema` to `S=/schemas/notification-consent.ts` (contract §6) + unit test. RED→GREEN. `pnpm --filter @properfy/shared build`.
- [ ] T061 [P] [US5] Author `BT=/unit/notification/record-consent-opt-out.use-case.test.ts` (task test 7d): create opted-in-then-out; opted-in→out audit; already-out idempotent; RBAC (AM/OP ok, CL/INSP 403); reason bounds; recipient normalization (phone/email); `isBlockedByConsent` true after. RED.
- [ ] T062 [US5] Implement `B=/modules/notification/application/use-cases/record-consent-opt-out.use-case.ts` (mirror `OverrideConsentUseCase`). GREEN.
- [ ] T063 [US5] Add `POST /v1/notifications/consents/opt-out` to `B=/modules/notification/interfaces/http/notification.routes.ts` + wire use case in `container.ts`. Extend `BT=/integration/notification/consent-endpoints.routes.test.ts` + `BT=/integration/rbac/notifications.rbac.test.ts` (200/401/400/RBAC matrix). GREEN.
- [ ] T064 [P] [US5] Author `W=/features/notification-consents/components/ConsentOptOutModal.test.tsx` (task test 11c): button on `ConsentLookup` (AM/OP); reason required; success `POST` + snackbar + reload; 403/400 server message; a11y. RED.
- [ ] T065 [US5] Implement `ConsentOptOutModal.tsx` + "Record opt-out" button on `ConsentLookup` + mutation/invalidation. GREEN.

## Phase 9: Polish & Cross-Cutting

- [ ] T070 Regenerate contract: `pnpm --filter backend generate:openapi && pnpm --filter @properfy/shared generate:types`; commit `openapi.json` + `api-types.ts` (never hand-merge).
- [ ] T071 [P] Update `packages/shared/CLAUDE.md`, `apps/backend/CLAUDE.md`, `apps/web/CLAUDE.md`, and root `CLAUDE.md` per task §Escopo step 11 (3 codes/2 channels, `etaFrom`/`etaTo`, `tenantEtaNotices`, `tenantEtaNoticesEnabled`, `tenant-eta` module + D9 exception, no-`_SMS` rule, upsert required-var rule, opt-out endpoint + compliance stance, SMS cost log/metric, web section + drawer + Record opt-out).
- [ ] T072 Run full gates inside the worktree via subagent (condensed summary): shared build+test+typecheck+lint; backend typecheck+lint+test+`test:integration:db`; web typecheck+lint+scoped test. Fix any failure and re-run.
- [ ] T073 Verify `git diff --stat origin/develop... | tail -1` < 150 files; boot smoke SQL (6 `TENANT_ETA_*` OPERATIONAL rows). Confirm the negative constraints held (FR-024/FR-025): no file under `apps/backend/prisma/migrations/` added in the diff, and no send/dispatch path invoked (no `enqueue`/`send` added for `TENANT_ETA_*`; `TenantCronTick` and the daily SMS cap untouched — only the additive `notification.sms_dispatched` log/metric).

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003)** → user stories.
- **US1 (predictor)** and **US2 (templates)** are both P1 and independent of each other — can run in parallel after Foundational.
- **US6 (T030–T039)** is scheduled before US3/US4/US5 only because the `CreateNotificationOutput` shape change (T031/T032) must land before further backend test files are added, to keep backend green; the plan reader/band/id (T036–T039) are otherwise independent.
- **US3, US4, US5** are independent of each other (different features) and depend only on their shared-schema task building first.
- **Polish (T070–T073)** runs last: api-types regen after all route/schema changes; CLAUDE.md after all code; gates after everything.

## Parallel Opportunities

- After T003: T010 (US1 tests) ∥ T020 (US2 shared tests) ∥ T040/T050/T060 (US3/4/5 schema tests).
- Within a story, `[P]` test-authoring tasks touch different files and can be written together; implementation tasks in the same file are sequential.
- Do NOT run gate commands concurrently with edits in the same worktree (project memory: half-edited tree → false failures).

## Implementation Strategy (MVP first)

MVP = **US1 + US2** (the frozen contract F05/F06-2 depend on). They can ship and be demonstrated (predictor tests green, 6 templates seeded) even before the config/flag/opt-out surfaces. US3–US6 complete the foundation for F06-2's triggers.
