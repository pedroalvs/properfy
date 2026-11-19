# Tasks: Inspector Notices — Backend + Shared (Web Push + SMS fallback)

**Feature**: `042-f02-1-notices-push-sms` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
**Source task**: `fase2-etapa1/tarefas/F02-tarefas.md` (TASK-F02-1)

TDD is mandatory (Constitution III): within every phase, the test tasks are written first and must fail (red) before the implementation task that makes them pass (green). `[P]` = parallelizable (distinct files, no incomplete dependency). Paths are repo-relative.

**Cross-story build note**: the module is cohesive — US1's delivery job consumes the push-subscription repository + `IPushSender` (US4) and the SMS daily-cap counter (US5). So although stories are independently *testable*, the delivery task (T0xx) is sequenced after those foundations. Dependencies are called out per task.

---

## Phase 1: Setup

- [ ] T001 Add `web-push@^3.6.7` (dep) and `@types/web-push@^3.6.4` (devDep) to `apps/backend/package.json`; run `pnpm install` and commit `pnpm-lock.yaml`.
- [ ] T002 [P] Add VAPID + feature envs to `apps/backend/src/main/env.ts`: `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (`z.string().optional()`), `VAPID_SUBJECT` (`z.string().regex(/^(mailto:|https:)/).optional()`) with staging/prod `console.warn` when missing; `INSPECTOR_NOTICE_SMS_DAILY_CAP` (preprocess string→`number|null`, default 500, `''`/`none`→null, int ≥ 0 else boot error); `INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS` (int ≥ 1, default 30).
- [ ] T003 [P] Add the three VAPID names (empty values) to `apps/backend/.env.example`.
- [ ] T004 [P] Write env test `apps/backend/tests/unit/.../env.test.ts` (or existing): `INSPECTOR_NOTICE_SMS_DAILY_CAP` absent→500, `'120'`→120, `'none'`/`''`→null, `'-1'`/`'abc'`→throw; `INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS` absent→30, `'0'`→throw. (Red before T002 satisfies it.)

---

## Phase 2: Foundational (blocks all user stories)

**Shared contracts (tests first)**

- [ ] T010 [P] Write `packages/shared/src/constants/inspector-notices.test.ts` per the task matrix (criticality, `SYSTEM_INSPECTOR_NOTICE_TYPES`, `isAllowedInspectorNoticeTargetPath` incl. all L-F02-08 negatives, `resolveInspectorNoticeTargetPath`, `getInspectorNoticeDeliverExpireMinutes`, `buildInspectorNoticeSmsMessage`, `INSPECTOR_NOTICE_TARGET_PATTERNS` = exactly 2).
- [ ] T011 [P] Write `packages/shared/src/schemas/inspector-notice.test.ts` per the task matrix (audience union, title/body limits+trim, SELECTED dedupe/limits, push subscription schema, list query defaults/max).
- [ ] T012 Implement `packages/shared/src/constants/inspector-notices.ts` (types, `SYSTEM_NOTICE_CRITICALITY`, `isCriticalSystemNoticeType`, `INSPECTOR_NOTICE_TARGET_PATTERNS`, `INSPECTOR_NOTICE_UUID_RE`, `isAllowedInspectorNoticeTargetPath`, `resolveInspectorNoticeTargetPath`, `inspectorNoticeDeepLink`, `getInspectorNoticeDeliverExpireMinutes`, `buildInspectorNoticeSmsMessage`, `INSPECTOR_NOTICE_*_MAX_CHARS`); export from `constants/index.ts`. Makes T010 green.
- [ ] T013 Implement `packages/shared/src/schemas/inspector-notice.ts` (audience input/output, publish, list query, summary, detail (extend), my-notice, my-list query, push subscription/unsubscribe/config schemas); export from `schemas/index.ts`. Makes T011 green.
- [ ] T014 [P] Register `INSPECTOR_NOTICE_SMS` in `packages/shared/src/constants/notification-templates.ts` — APPEND to: `PLATFORM_ONLY_TEMPLATE_CODES`, `PLATFORM_TEMPLATE_CODE_LABELS` ('Inspector Notice (SMS)'), `TEMPLATE_VARIABLES` ({required:['message'],optional:[]}), `PROTECTED_TEMPLATE_CLASSIFICATIONS` ('TRANSACTIONAL'), `ALLOWED_VARIABLES`+`SAMPLE_DATA` ('message'), `TEMPLATE_TARGETS` ('INSPECTOR' + docblock). Do NOT touch `MANDATORY_TEMPLATE_CODES`/`SYSTEM_TEMPLATE_CODES`/`seed.ts`.
- [ ] T015 [P] Update/extend `packages/shared/src/constants/notification-templates.test.ts` for the T014 assertions; confirm `packages/shared/src/enums/notification.test.ts` stays green **unchanged** (no PUSH, exactly 2 channels).

**Migration + Prisma models**

- [ ] T016 Add models `InspectorNotice`, `InspectorNoticeRecipient`, `InspectorPushSubscription` (+ relations on `Inspector` and `User`) to `apps/backend/prisma/schema.prisma` exactly per `data-model.md` (no `tenant_id`).
- [ ] T017 Generate migration `apps/backend/prisma/migrations/20261030HHMMSS_inspector_notices_push/migration.sql` via `prisma migrate dev --create-only`; verify the SQL does NOT drop `service_regions` `Unsupported()`/lower-name indexes; include the `UPDATE "inspectors" SET push_enabled=FALSE WHERE push_enabled=TRUE;` data step; apply locally; `prisma generate`.

**Domain skeleton (ports/entity/errors) — enables all stories**

- [ ] T018 [P] Create `apps/backend/src/modules/inspector-notice/domain/inspector-notice.entity.ts`, `domain/audience.ts` (`InspectorNoticeAudience`), `domain/inspector-notice.errors.ts` (all `INSPECTOR_NOTICE_*` + `PUSH_NOT_CONFIGURED` + idempotency errors).
- [ ] T019 [P] Create `domain/sms-notification-id.ts` (`getInspectorNoticeSmsNotificationId`, UUIDv5 new namespace) + unit test mirroring `agency-forward` id test.
- [ ] T020 [P] Create port `domain/inspector-notice.repository.ts` and port `domain/push-subscription.repository.ts` (method signatures from `contracts/internal-usecases.md`).
- [ ] T021 [P] Create port `domain/push-sender.ts` (`IPushSender`, `PushSendOutcome`, `PushTarget`, `InspectorNoticePushPayload`).
- [ ] T022 Add `countByTemplateChannelSince(tenantId, templateCode, channel, since)` to the notification repo port `apps/backend/src/modules/notification/domain/notification.repository.ts` and all in-memory fakes that implement it (grep `countByTenantChannelSince` in tests); implement in `infrastructure/prisma-notification.repository.ts` (exclude `SKIPPED*`).
- [ ] T023 Register the backend platform template entry in `apps/backend/src/modules/notification/domain/platform-notification-templates.ts` (`PLATFORM_TEMPLATES` += `{code:'INSPECTOR_NOTICE_SMS', channel:'SMS', subject:null, body:'{{{message}}}', notificationClass:'TRANSACTIONAL'}` — explicit class so `syncPlatformTemplates` seeds it) and update `apps/backend/tests/unit/notification/platform-notification-templates.test.ts` (entry exists with those fields, `resolvePlatformTemplateClass(entry) === getProtectedClass('INSPECTOR_NOTICE_SMS')`, render of `{{{message}}}` with `Tom & Jerry <test>` stays unescaped). Required for FR-061 / acceptance 8 & 12 (`syncPlatformTemplates` seeds the row at boot; otherwise delivery fails `TEMPLATE_NOT_FOUND`). Do NOT add the code to `prisma/seed.ts`.

---

## Phase 3: User Story 1 — Operations publishes a notice; push + SMS fallback (P1) 🎯 MVP (00.A2)

**Goal**: AM/OP publish manual notices; recipients materialized; delivery job sends push and critical-only SMS fallback.
**Independent test**: publish critical SELECTED to an inspector with no subscription → deliver → one `INSPECTOR_NOTICE_SMS` row; with an active subscription → push, no SMS.
**Depends on**: Phase 2; the delivery task also needs US4 subscription repo/sender (T050–T053) and US5 cap counter (T022 + T072).

- [ ] T030 [P] [US1] Write `apps/backend/tests/unit/inspector-notice/publish-inspector-notice.use-case.test.ts` (full matrix: ALL/SELECTED/REGION, invalid/no recipients, critical, author, audit, enqueue after commit, expireMinutes by volume, idempotency missing/repeat/mismatch, tx order, rollback, enqueue-failure-no-throw).
- [ ] T031 [P] [US1] Write `apps/backend/tests/unit/inspector-notice/archive-inspector-notice.use-case.test.ts`, `list-inspector-notices.use-case.test.ts`, `get-inspector-notice.use-case.test.ts` (incl. L-F02-09 `inspectorStatus`/`hasAppAccess`).
- [ ] T032 [US1] Implement `application/services/resolve-notice-recipients.ts` (ALL/SELECTED/REGION → active ids; region existence/status; regionName snapshot).
- [ ] T033 [US1] Implement `application/use-cases/publish-inspector-notice.use-case.ts` (advisory lock + `getWithHash`/`set` in tx, recipients `createMany`, audit+enqueue via `defer`). Makes T030 green.
- [ ] T034 [US1] Implement `archive-inspector-notice.use-case.ts` (CAS `updateMany where archived_at IS NULL`, single audit), `list-inspector-notices.use-case.ts`, `get-inspector-notice.use-case.ts`. Makes T031 green.
- [ ] T035 [US1] Implement `infrastructure/prisma-inspector-notice.repository.ts` (create-in-tx, archive CAS, list/detail with counts, delivery helpers, dedupe/sweep/auto-archive queries — the delivery/sweep/auto-archive methods may be stubbed and completed in US5).
- [ ] T036 [P] [US1] Write `apps/backend/tests/unit/inspector-notice/deliver-inspector-notice.use-case.test.ts` (24-case matrix: push outcomes, SMS fallback D2-a, batches, archived skip, started/completed timestamps, cap, burst, revocations, sydneyHour).
- [ ] T037 [US1] Implement `application/use-cases/deliver-inspector-notice.use-case.ts` (start/complete timestamps, 50-batch with per-batch `archived_at` re-read, push per subscription with outcome handling, critical-only SMS via `CreateNotificationUseCase` + deterministic id + cap check, per-recipient `delivery_processed_at`, summary log with `sydneyHour`, burst warn). **Depends on T050–T053 (sender+subscription repo) and T022 (cap counter); the cap decision logic itself is completed in T066.** Makes T036 green (except the cap/burst cases, which go green at T066).
- [ ] T038 [US1] Add admin routes to `interfaces/inspector-notice.routes.ts` (`POST /v1/inspector-notices`, `GET` list, `GET /:id`, `POST /:id/archive`) with `schema.response`, `requireRoles(['AM','OP'])`, Idempotency-Key handling; wire `main/routes.ts` + `main/container.ts`.
- [ ] T039 [US1] Register the `inspector-notice.deliver` worker in `apps/backend/src/main/workers.ts` (`boss.work` with `withJobMetrics`).

---

## Phase 4: User Story 2 — Inspector reads; operations sees read counts (P1) (00.A4)

**Goal**: inspector box + mark-read; admin read counts move 0→1.
**Independent test**: publish to X → X lists/reads → admin `readCount` 0→1 in list + detail.
**Depends on**: Phase 2; shares the repo/routes file from US1 (T035, T038).

- [ ] T040 [P] [US2] Write `list-my-inspector-notices.use-case.test.ts`, `get-my-inspector-notice.use-case.test.ts`, `mark-inspector-notice-read.use-case.test.ts`, `count-my-unread-inspector-notices.use-case.test.ts` (own-scope, archived→404, idempotent read first-wins, no audit, envelope without unreadCount).
- [ ] T041 [US2] Implement the four INSP use cases under `application/use-cases/` and their repo methods in `prisma-inspector-notice.repository.ts`.
- [ ] T042 [US2] Add INSP routes to `inspector-notice.routes.ts` (`GET /v1/inspectors/me/notices`, `/unread-count`, `/:noticeId`, `POST /:noticeId/read`) with `INSP_ONLY` guard; ensure static routes win over `/v1/inspectors/:inspectorId` and cover with a precedence test.

---

## Phase 5: User Story 3 — System notice API for F03/F04/F08 (P2)

**Goal**: stable internal publish-system + has-recent use cases, idempotent, allowlisted target.
**Depends on**: Phase 2; reuses publish internals (T032–T035).

- [ ] T043 [P] [US3] Write `publish-system-inspector-notice.use-case.test.ts` (criticality by type, targetPath allow/deny, dedupe repeat + race P2002/23505, filtered recipients, no-recipients, audit SYSTEM) and `has-recent-system-inspector-notice.use-case.test.ts` (prefix literal + `%`/`_` escape, `since` inclusive, archived counts, manual never, invalid prefix throws).
- [ ] T044 [US3] Implement `application/use-cases/publish-system-inspector-notice.use-case.ts` (derive critical, validate targetPath, idempotent by dedupeKey, docblock L-F02-07 content rule) + `has-recent-system-inspector-notice.use-case.ts`; add `existsSystemNoticeByDedupeKeyPrefixSince` + `findByDedupeKey` to repo; expose both on `container.inspectorNotice`.

---

## Phase 6: User Story 4 — Push subscriptions + push_enabled (P2)

**Goal**: subscribe/unsubscribe/config; `push_enabled` = has-active-subscription; heartbeat stops writing it.
**Independent test**: upsert → `push_enabled` true; unsubscribe last → false; VAPID unset → 503 / config null.
**Depends on**: Phase 2.

- [ ] T050 [P] [US4] Write `upsert-push-subscription.use-case.test.ts`, `unsubscribe-push-subscription.use-case.test.ts`, `get-push-config.use-case.test.ts`, `web-push.sender.test.ts` (mock `web-push`: 201/404/410/401/403/4xx/5xx/network + call shape), `disabled-push.sender.test.ts`.
- [ ] T051 [US4] Implement `infrastructure/web-push.sender.ts` + `infrastructure/disabled-push.sender.ts` against `IPushSender`. Makes the sender tests green.
- [ ] T052 [US4] Implement `infrastructure/prisma-push-subscription.repository.ts` (`upsert`, `revoke`, `revokeAllForInspector`, `incrementFailure` atomic `UPDATE…RETURNING`, `resetFailure`, `recomputePushEnabled(tx)`, `findActiveByInspector`, `purgeRevokedBefore`).
- [ ] T053 [US4] Implement `application/use-cases/upsert-push-subscription.use-case.ts`, `unsubscribe-push-subscription.use-case.ts`, `get-push-config.use-case.ts`; wire push routes in `inspector-notice.routes.ts` (`GET /push-config`, `POST /push-subscriptions`, `POST /push-subscriptions/unsubscribe`, 10/min rate limit, 503 when disabled); container picks WebPush vs Disabled sender by VAPID presence.
- [ ] T054 [US4] Modify `apps/backend/src/modules/inspector/.../record-inspector-app-state.use-case.ts` to stop writing `push_enabled`; drop `pushEnabled` from `inspector.repository.ts` `recordAppState()` signature and from the single `$executeRaw` in `prisma-inspector.repository.ts` (keep it one statement, L-F01-02); update the F01 unit test + F01 DB `recordAppState` cases.

---

## Phase 7: User Story 5 — Robust delivery: sweep, cap, revocation, deactivation, retention (P3)

**Goal**: operational safeguards.
**Depends on**: US1 delivery (T037), US4 subscription repo (T052).

- [ ] T060 [P] [US5] Write `sweep-undelivered-inspector-notices.use-case.test.ts` (both criteria, 24h window, 100 cap oldest-first, idempotency, quiet-hours skip + boundaries, incomplete `delivery_incomplete`).
- [ ] T061 [US5] Implement `application/use-cases/sweep-undelivered-inspector-notices.use-case.ts` (quiet-hours gate 22:00–06:00 Sydney, both criteria, re-enqueue with same options + volume expire, logs) + repo `findUndeliveredForSweep`; add `delivery_completed_at` write at end of `deliver` use case; set `expireInMinutes` via helper in publish + publish-system + sweep.
- [ ] T062 [P] [US5] Write `auto-archive-inspector-notices.use-case.test.ts` (system-only, retention env, batches 1000, no audit, manual untouched, subscription purge 91/89/active, unread-count effect).
- [ ] T063 [US5] Implement `application/use-cases/auto-archive-inspector-notices.use-case.ts` + repo `autoArchiveSystemOlderThan` + `purgeRevokedBefore`; register cron workers `inspector-notice.delivery-sweep` (`*/5 * * * *` Sydney) and `inspector-notice.auto-archive` (`45 3 * * *` Sydney) in `workers.ts` (+ update the "workers registered" log line); container wiring.
- [ ] T064 [P] [US5] Write `deactivate-inspector.use-case.test.ts` additions (2 active subs → DEACTIVATED + push_enabled false; no subs; already-revoked GONE preserved; precondition failure → none revoked; reactivate restores nothing).
- [ ] T065 [US5] Modify `apps/backend/src/modules/inspector/.../deactivate-inspector.use-case.ts` to take `IPushSubscriptionRepository` and call `revokeAllForInspector(tx,…,'DEACTIVATED')` + recompute after the status update; wire container; fix ALL untyped test constructions of `DeactivateInspectorUseCase` (memory: new use-case dep breaks untyped wirings).
- [ ] T066 [US5] Add the cap check + `smsSkippedCap`/`sms_cap_reached`/`sms_burst` logic to `deliver-inspector-notice.use-case.ts` (consumes T022 counter + env cap) — completing the cap cases in T036.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T070 [P] Write `apps/backend/tests/integration/inspector-notice/inspector-notice.routes.test.ts` (shapes, 00.A4 flow, idempotency-missing 400, push routes 204/429, serializer strips internal fields, static-route precedence).
- [ ] T071 [P] Write `apps/backend/tests/integration/rbac/inspector-notice-rbac.test.ts` (full RBAC matrix, valid bodies).
- [ ] T072 Write `apps/backend/tests/integration/db/inspector-notice.integration.test.ts` (migration apply, PK/unique constraints, `push_enabled` recompute 0/1/2, **concurrent idempotency — must fail without advisory lock**, 00.A2 end-to-end with real repos, sweep, incomplete recovery, SMS cap, auto-archive, deactivation, template seeded by `syncPlatformTemplates`) + `has-recent` DB case + `countByTemplateChannelSince` DB case.
- [ ] T073 Regenerate contract: `pnpm --filter @properfy/shared build && pnpm --filter backend generate:openapi && pnpm --filter @properfy/shared generate:types`; commit `packages/shared/openapi.json` + `packages/shared/src/api-types.ts`.
- [ ] T074 [P] Update `apps/backend/CLAUDE.md` and `packages/shared/CLAUDE.md` (new module, routes, jobs, envs, template, multi-tenant exception) per CLAUDE.md §13.11; reconcile the auto-generated root `CLAUDE.md` "Active Technologies"/"Recent Changes" edits.
- [ ] T075 Run full gates inside the worktree (shared lint/typecheck/test; backend lint/typecheck/test; `test:integration:db`); confirm `git status --porcelain` clean and `git diff --stat origin/develop... | tail -1` ≤ 150 files; local smoke per quickstart.

---

## Dependencies & order

- **Phase 1 → Phase 2 → stories.** Phase 2 blocks everything.
- **US1 (P1)** is the MVP but its delivery task (T037) depends on **US4** (T050–T053) and **US5** cap (T022, T066). Build order in practice: Phase 2 → US4 sender/repo → US1 publish+routes → US1 delivery → US2 → US3 → US5 → Polish. Stories remain independently *testable*.
- `[P]` tasks within a phase touch distinct files and can run together; tasks editing the same file (`inspector-notice.routes.ts`, `prisma-inspector-notice.repository.ts`, `container.ts`, `workers.ts`, `deliver-inspector-notice.use-case.ts`) are serialized.

## Parallel opportunities

- Phase 2: T010/T011 (shared tests), T014/T015 (template), T018–T021 (domain ports/entity/errors), T019 (sms-id) all `[P]`.
- Test-authoring tasks across stories (T030/T031/T036/T040/T043/T050/T060/T062/T064/T070/T071) are `[P]` against each other (distinct files).

## MVP scope

**US1 + US2** (both P1) = contract codes 00.A2 and 00.A4 — the demonstrable minimum. US3–US5 harden and unblock downstream features.
