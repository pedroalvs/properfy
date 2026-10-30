# Feature Specification: Inspector Notices — Backend + Shared (Web Push + SMS fallback)

**Feature Branch**: `042-f02-1-notices-push-sms`
**Created**: 2026-10-30
**Status**: Draft
**Input**: TASK-F02-1 (`fase2-etapa1/tarefas/F02-tarefas.md`) — contract 00.6a + backend of 00.9a + 00.9b. Contract acceptance codes **00.A2** and **00.A4** (delivery 00 — Inspector App).

## Overview

Properfy's operations team (AM/OP) needs a reliable one-way channel to reach inspectors in the field, and three platform subsystems (day-plan routing in F04, completion reminder in F03, performance messages in F08) need a stable internal way to raise the same kind of notice automatically. This feature builds the **backend domain and shared contracts** for *inspector notices*: a published message with a materialized recipient list, delivered to the inspector's app by **Web Push**, falling back to **SMS** when a notice is **critical** and no push reached the inspector. It also adds per-device push subscription storage, a safety sweep that recovers lost or half-finished deliveries, a daily platform SMS cost cap, revocation of permanently-failing subscriptions, and automatic retention of old system notices.

The web admin screens (TASK-F02-2) and the PWA service worker / announcements box (TASK-F02-3) are **out of scope here** and consume the contracts this task defines. This is the critical-path task: it unblocks F04-2, the rest of F02, and the F03 completion reminder.

## Clarifications

### Session 2026-10-30

No critical ambiguities required interactive clarification: every product and behavioral decision for this task is already closed in the source task file (`fase2-etapa1/tarefas/F02-tarefas.md`, decisions D1–D27 of 2026-10-27…10-29, plus gaps L-F02-01…11 and L-F08-06, all accepted) and is carried forward verbatim as premises in the **Assumptions** section below. A full ambiguity scan (functional scope, data model, non-functional, security/privacy, integration, edge cases, concurrency, completion signals) returned *Clear* on every category. Proceeding to planning.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operations publishes a notice to inspectors (Priority: P1)

An AM or OP user publishes a notice (title + body, optionally flagged *critical*) to an audience of inspectors: **all active**, a **manual selection**, or a **region**. The system resolves the audience to active inspectors, stores the notice with a frozen recipient list, and delivers it: a Web Push to every device with an active subscription, and — only for **critical** notices and only to inspectors that no push reached — an immediate SMS through the existing platform notification pipeline.

**Why this priority**: This is contract code **00.A2** and the reason the feature exists — getting an urgent message (road closure, schedule disruption) to an inspector who may have the app backgrounded or uninstalled. Without it there is no feature.

**Independent Test**: Publish a critical notice (via `POST /v1/inspector-notices` with an `Idempotency-Key`) targeting one inspector that is ACTIVE, has a phone, and has no active push subscription; run the delivery job; assert exactly one `notifications` row with `template_code='INSPECTOR_NOTICE_SMS'`, `channel='SMS'`, `tenant_id IS NULL`, `notification_class='TRANSACTIONAL'`, recipient = the inspector's phone. Repeat for an inspector that does have an active subscription and assert a push send and **no** SMS.

**Acceptance Scenarios**:

1. **Given** 2 ACTIVE inspectors, 1 INACTIVE, 1 soft-deleted, **When** OP publishes to audience `ALL`, **Then** exactly the 2 ACTIVE inspectors become recipients and `audience_json = {type:'ALL'}`.
2. **Given** a `SELECTED` audience containing an inactive or nonexistent id, **When** publishing, **Then** the request fails `400 INSPECTOR_NOTICE_INVALID_RECIPIENTS` with `details.inspectorIds` listing the invalid ids and nothing is written.
3. **Given** a `REGION` audience, **When** the region does not exist / is inactive / is active, **Then** respectively `404 INSPECTOR_NOTICE_REGION_NOT_FOUND` / `422 INSPECTOR_NOTICE_REGION_INACTIVE` / success with recipients = active inspectors of that region and `regionName` snapshotted into `audience_json`.
4. **Given** an audience that resolves to zero active inspectors, **When** publishing, **Then** `422 INSPECTOR_NOTICE_NO_RECIPIENTS` and nothing is written.
5. **Given** a successful publish, **When** the transaction commits, **Then** one audit entry `inspector_notice.published` (actor USER, `entityType InspectorNotice`, `tenantId null`) is written and a delivery job `inspector-notice.deliver` is enqueued **after** commit with `singletonKey = noticeId` and `expireInMinutes = getInspectorNoticeDeliverExpireMinutes(recipientCount)`.
6. **Given** the same `Idempotency-Key` + identical payload is POSTed twice (sequentially or concurrently), **When** both run, **Then** exactly one notice row exists and both responses carry the same `noticeId`; a different payload under the same key returns `409 INSPECTOR_NOTICE_IDEMPOTENCY_PAYLOAD_MISMATCH`; a missing header returns `400 IDEMPOTENCY_KEY_MISSING`.
7. **Given** a **critical** notice and an inspector with **no successful push** (no subscription, or every push returned GONE/REJECTED/FAILED, or push is DISABLED), **When** delivering, **Then** an SMS is created for that inspector (contract 00.A2 fallback). **Given** a **non-critical** notice, **Then** no SMS is ever created.

---

### User Story 2 - Inspector reads notices; operations sees who read (Priority: P1)

An inspector sees their own non-archived notices in an in-app box, opens one, and marks it read. The operations detail view shows, per recipient, whether and when they read it, and the list/detail read counts move from 0 to 1 as inspectors read.

**Why this priority**: This is contract code **00.A4** and the acknowledgement loop operations relies on. It is independently valuable even before push works, because the box is the source of truth.

**Independent Test**: AM publishes to inspector X → `GET /v1/inspectors/me/notices` as X contains it with `readAt: null` and `GET /v1/inspector-notices/:id` shows `readCount: 0` → X calls `POST /v1/inspectors/me/notices/:id/read` → the same admin GET (detail and list) now shows `readCount: 1` and X with `readAt` populated.

**Acceptance Scenarios**:

1. **Given** inspector X is a recipient, **When** X lists `GET /v1/inspectors/me/notices`, **Then** the response is `{data, pagination}` (no `unreadCount` field), excludes archived notices, excludes other inspectors' notices, ordered `publishedAt desc`, each item `{id,title,body,critical,publishedAt,readAt}`.
2. **Given** X is a recipient, **When** X calls `POST .../:id/read` once then again, **Then** the first `read_at` is kept (idempotent `COALESCE`), the response is `{noticeId, readAt}`, and **no** audit entry is written (read is telemetry).
3. **Given** X is not a recipient, or the notice is archived, **When** X requests `GET .../me/notices/:id` or `POST .../read`, **Then** `404 INSPECTOR_NOTICE_NOT_FOUND` (same response, does not leak existence).
4. **Given** X has unread notices, **When** X calls `GET /v1/inspectors/me/notices/unread-count`, **Then** `{data:{count}}` counts only own, non-archived, unread notices; archiving an unread notice lowers the count.
5. **Given** an admin views `GET /v1/inspector-notices/:id`, **Then** `recipients` are ordered unread-first then name asc (case-insensitive), each `{inspectorId, inspectorName, readAt, inspectorStatus, hasAppAccess}` where `inspectorStatus` is the *current* status (soft-deleted = `INACTIVE`) and `hasAppAccess = (inspectors.user_id IS NOT NULL)`.
6. **Given** a published notice, **When** an admin lists `GET /v1/inspector-notices?status=active|archived|all`, **Then** results carry `recipientCount` and `readCount`, ordered `published_at desc, id desc`, paginated with the standard envelope.

---

### User Story 3 - A platform subsystem raises a notice automatically (Priority: P2)

F03 (completion reminder), F04 (route published/changed) and F08 (performance messages) call a stable internal use case to publish a *system* notice to a set of inspectors. The use case derives `critical` from the notice type, is idempotent by a caller-supplied `dedupeKey`, validates any deep-link target against a shared allowlist, and returns `{noticeId, created}`. A companion read-only use case answers whether a recent system notice exists for a given `dedupe_key` prefix (used by the F08 7-day guard).

**Why this priority**: Required to unblock F03/F04/F08, but the manual path (Story 1) delivers value first, so P2.

**Independent Test**: Call `PublishSystemInspectorNoticeUseCase` with `type:'COMPLETION_REMINDER'` and assert `critical=true`, `system_type='COMPLETION_REMINDER'`, `author_user_id=null`; call again with the same `dedupeKey` and assert `created:false`, same `noticeId`, and no new insert/audit/enqueue.

**Acceptance Scenarios**:

1. **Given** `type` in `{ROUTE_PUBLISHED, ROUTE_CHANGED, COMPLETION_REMINDER}`, **Then** `critical=true`; **Given** `type='PERFORMANCE_MESSAGE'`, **Then** `critical=false` (system notices are never critical except those three).
2. **Given** no `targetPath`, **Then** `target_path=null` and the push `url` defaults to `/profile/announcements/<noticeId>`; **Given** a `targetPath` matching the allowlist, **Then** it is stored; **Given** a `targetPath` outside the allowlist (`/today`, `https://…`, `/schedule/abc`), **Then** `ValidationError VALIDATION_ERROR "targetPath is not allowed"` and nothing is written (caller bug).
3. **Given** a repeated `dedupeKey` (including a concurrent `P2002`/`23505` race on `dedupe_key`), **Then** the existing notice is returned `created:false` with no new insert/audit/enqueue.
4. **Given** all candidate inspectors are inactive/nonexistent, **Then** `{noticeId:null, created:false}`, nothing written, `logger.info('inspector_notice.system_no_recipients')`.
5. **Given** `HasRecentSystemInspectorNoticeUseCase` with `{dedupeKeyPrefix, since}`, **Then** it returns true iff a system notice exists whose `dedupe_key` starts with the (LIKE-escaped) prefix and `created_at >= since`; it counts archived notices, never counts manual notices (null `dedupe_key`), and has no HTTP route.

---

### User Story 4 - Inspector devices subscribe to push; push_enabled stays accurate (Priority: P2)

The PWA registers a Web Push subscription per device and can unsubscribe. The platform stores one row per `endpoint`, keeps `inspectors.push_enabled` equal to "has at least one active subscription", and exposes the VAPID public key for the client to subscribe. The F01 heartbeat stops writing `push_enabled`.

**Why this priority**: Push delivery (Story 1) is meaningless without subscriptions, but SMS fallback keeps criticals working even with zero subscriptions, so P2.

**Acceptance Scenarios**:

1. **Given** VAPID is configured, **When** an inspector upserts a subscription, **Then** a row is created/revived for the inspector, `revoked_at/revoked_reason` cleared, `failure_count=0`, and `inspectors.push_enabled` recomputed to `true`.
2. **Given** an endpoint already owned by another inspector (device changed owner), **When** upserting, **Then** ownership moves to the current inspector and `push_enabled` is recomputed for **both** inspectors.
3. **Given** VAPID is **not** configured, **When** upserting, **Then** `503 PUSH_NOT_CONFIGURED`; **and** `GET /v1/inspectors/me/push-config` returns `{vapidPublicKey:null}`.
4. **Given** an active subscription, **When** the inspector unsubscribes, **Then** it is revoked `revoked_reason='UNSUBSCRIBED'` and `push_enabled` becomes `false` only if it was the last active one; unsubscribing a nonexistent/foreign endpoint is a 204 no-op.
5. **Given** the F01 app-state heartbeat, **When** it records `pushPermission`, **Then** it no longer touches `push_enabled` (the column leaves `recordAppState()`'s single SQL statement).

---

### User Story 5 - Delivery is robust: sweep, cap, revocation, retention (Priority: P3)

Operational safeguards keep delivery correct and bounded in cost when workers crash, push services misbehave, or notices pile up.

**Why this priority**: Correctness-hardening around the P1 path; the feature functions without each piece but is not production-safe.

**Acceptance Scenarios**:

1. **Safety sweep (D13/L-F02-03):** every 5 min a job re-enqueues delivery for notices `published_at` within 24h that either never started (`delivery_started_at IS NULL` after 2 min) or started ≥ 20 min ago, not completed, with pending recipients. It re-enqueues at most 100 per run (oldest first), is idempotent (processed recipients skipped, SMS uses a deterministic id), skips entirely between 22:00–06:00 Sydney, and logs `sweep_completed` / `sweep_requeued` / `delivery_incomplete`.
2. **Daily SMS cap (D17/L-F02-01):** before each SMS the job compares the day's count of `INSPECTOR_NOTICE_SMS` platform SMS (since start-of-day Sydney) against `INSPECTOR_NOTICE_SMS_DAILY_CAP` (default 500; empty/`none` = unlimited); over cap → no SMS, recipient still marked processed, `smsSkippedCap` counted, `sms_cap_reached` warned once per job; `smsQueued >= 20` → `sms_burst` warn.
3. **Permanent failure (D20/L-F02-04):** push 401/403 → revoke `REJECTED`; 5 consecutive `FAILED` → revoke `FAILED`; `SENT` and upsert reset `failure_count`; `push_enabled` recomputed on revocation; for SMS purposes a REJECTED subscription counts as no successful push.
4. **Retention (D22/L-F02-06):** a daily 03:45 Sydney job archives **system** notices older than `INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS` (default 30; manual notices never), batched by 1000, no per-row audit; it also deletes push subscriptions revoked more than 90 days ago.
5. **Deactivation (D27/L-F02-11):** deactivating an inspector revokes its active subscriptions `DEACTIVATED` and sets `push_enabled=false`; reactivation does not restore them.
6. **Archive mid-delivery (D26/L-F02-10):** the delivery job re-reads `archived_at` at the start of each 50-item batch; once archived it stops, marks the rest processed without sending, writes `delivery_completed_at`, logs `delivery_skipped_archived`.

### Edge Cases

- **Double-click / concurrent publish:** the per-key `pg_advisory_xact_lock` inside the transaction guarantees a single notice; missing key → 400.
- **Inspector joins a region after publish:** not a recipient (recipients are materialized at publish time).
- **Inspector deactivated after publish:** stays in the recipient history; if delivery has not run, nothing is sent to them.
- **Region renamed after publish:** history shows the `regionName` snapshotted at publish time.
- **Notice archived between publish and the job, or mid-delivery:** remaining recipients are marked processed without sending; it disappears from the inspector box and unread count but read history stays in the admin detail.
- **Inspector with two devices:** push goes to both; a single `SENT` suppresses the SMS.
- **Device changed owner (logout without unsubscribe + another login + subscribe):** the `endpoint` is reassigned to the new inspector; the old one loses it.
- **Push service returns 429/5xx/timeout on a critical notice:** SMS is sent (D2-a). On a non-critical notice: log only.
- **Worker dies after commit, enqueue lost:** the sweep re-enqueues within ~7 min (2 min + 5-min cycle), still inside the 24h window.
- **System `targetPath = /schedule/<id>` for an appointment no longer on the agenda:** the PWA opens the agenda and shows its existing not-found state (not this task's concern).
- **Inspector with no phone and no push on a critical notice:** box only; `sms_skipped_no_phone` warn.
- **Phone not E.164 AU:** the existing pipeline fails it `INVALID_RECIPIENT_PHONE` without retry.
- **Body with `&`, `<`, quotes, emoji:** push carries plain text; SMS is unescaped (triple-stash template) so `&` is not turned into `&amp;`; emoji forces UCS-2 (more SMS segments).
- **SMS message > 300 chars:** truncated ending with `"… Open the Properfy app."`.
- **VAPID absent:** `push-config` returns null, subscribing is 503, every critical notice falls back to SMS.
- **Job queue disabled in dev (`ENABLE_JOB_QUEUE=false`):** no delivery; the box still works.
- **Mark read twice / on two devices:** first `read_at` wins.
- **INSP requests another inspector's notice by id:** 404 (not 403), no existence leak.
- **Selection over 500 inspectors:** 400 (operations uses All or Region).
- **`INSPECTOR_NOTICE_SMS` template deactivated by AM:** the pipeline fails it `TEMPLATE_INACTIVE`; no SMS.
- **Daily SMS cap reached:** criticals still reach the box and push; inspectors without push get no SMS that day; cap resets at Sydney midnight.
- **VAPID key rotated:** each old subscription gets 401/403 on next send → revoked `REJECTED`; that send's critical goes by SMS; the PWA re-subscribes with the new key on next load.
- **`dedupeKeyPrefix` containing `%` or `_`:** escaped in the LIKE so it matches only the literal, no false positive for another inspector.

## Requirements *(mandatory)*

### Functional Requirements

**Domain & persistence**
- **FR-001**: System MUST add three platform-scoped tables with **no `tenant_id`**: `inspector_notices`, `inspector_notice_recipients` (composite PK `notice_id,inspector_id`), `inspector_push_subscriptions` (unique `endpoint`). The migration MUST be expand-only (new tables + one cheap data `UPDATE` of `inspectors.push_enabled`) and MUST NOT drop the existing `Unsupported()` GIST / lower-name indexes on `service_regions`.
- **FR-002**: `InspectorNotice` MUST store `title` (1–120 after trim), `body` (1–2000 after trim, plain text, newlines preserved), `critical`, `audience_json` (`ALL` | `SELECTED{inspectorIds}` | `REGION{regionId,regionName}` | `SYSTEM{systemType}`), `system_type` (null = manual), unique `dedupe_key` (null on manual), `target_path` (system only, allowlisted), `author_user_id` (null = system, FK `users` RESTRICT), `published_at`, `archived_at`, `delivery_started_at`, `delivery_completed_at`.
- **FR-003**: `inspectors.push_enabled` MUST equal `EXISTS(active subscription)`, recomputed in the same transaction as every subscription write; NULL continues to mean "never reported/subscribed".

**Publishing (AM/OP)**
- **FR-010**: System MUST expose `POST /v1/inspector-notices` (AM/OP only) accepting `publishInspectorNoticeSchema` and a **mandatory** `Idempotency-Key` header (scope `inspector-notice.publish`, TTL 24h). Missing header → `400 IDEMPOTENCY_KEY_MISSING`.
- **FR-011**: Audience resolution MUST include only `status='ACTIVE' AND deleted_at IS NULL` inspectors; `ALL` continues to include ACTIVE inspectors without `user_id`. SELECTED with any non-active id → `400 INSPECTOR_NOTICE_INVALID_RECIPIENTS`; REGION missing → 404, inactive → 422; zero recipients → `422 INSPECTOR_NOTICE_NO_RECIPIENTS`.
- **FR-012**: Publishing MUST run in a transaction that (1) takes `pg_advisory_xact_lock(hashtext('inspector-notice.publish:'+key))`, (2) re-reads idempotency with `getWithHash(key, scope, tx)` (cache hit → return it; different hash → 409), (3) inserts the notice + `createMany` recipients, (4) writes the idempotency record with `set(..., tx)`; audit `inspector_notice.published` and the delivery enqueue MUST happen only post-commit (`defer`). A failed enqueue MUST NOT throw (`logger.error('inspector_notice.enqueue_failed')`); the sweep recovers it.
- **FR-013**: System MUST expose `GET /v1/inspector-notices` (list, `status` active/archived/all, paginated, with `recipientCount`/`readCount`), `GET /v1/inspector-notices/:noticeId` (detail with `recipients[]` incl. `inspectorStatus`/`hasAppAccess`), and `POST /v1/inspector-notices/:noticeId/archive` (idempotent; one audit `inspector_notice.archived` only on the first archive). **No** edit or delete endpoint exists (published notices cannot be changed).

**Inspector box (INSP, own)**
- **FR-020**: System MUST expose `GET /v1/inspectors/me/notices` (own non-archived, `{data,pagination}`, no `unreadCount`), `GET …/unread-count` (`{data:{count}}`), `GET …/notices/:noticeId` (404 if not recipient or archived), `POST …/notices/:noticeId/read` (idempotent, first `read_at` wins, no audit). All require INSP (others → `403 INSP_ONLY`). Static `/me/notices*` and `/me/push-*` routes MUST NOT be captured by `/v1/inspectors/:inspectorId`.

**Push subscriptions (INSP, own)**
- **FR-030**: System MUST expose `GET /v1/inspectors/me/push-config` → `{vapidPublicKey}`, `POST /v1/inspectors/me/push-subscriptions` (upsert, 204; 503 if VAPID unset; 10/min rate limit), `POST /v1/inspectors/me/push-subscriptions/unsubscribe` (204 idempotent; 10/min). Endpoints MUST be https and ≤ 2048 chars.
- **FR-031**: Upsert MUST reset `failure_count=0` and ownership-move an endpoint between inspectors, recomputing `push_enabled` for every affected inspector.

**Delivery**
- **FR-040**: A job `inspector-notice.deliver {noticeId}` MUST, before any send, set `delivery_started_at = COALESCE(delivery_started_at, now())`; if already archived, mark pending recipients processed, write `delivery_completed_at`, log `delivery_skipped_archived`, and stop.
- **FR-041**: It MUST iterate recipients with `delivery_processed_at IS NULL` in batches of 50 (≤ 10 parallel push sends), re-reading `archived_at` per batch; skip INACTIVE/soft-deleted inspectors (mark processed). Per active subscription it calls the push sender and applies: `SENT`→reset failure_count; `GONE`(404/410)→revoke `GONE`; `REJECTED`(401/403)→revoke `REJECTED`; `FAILED`→`push_failed` warn + atomic `failure_count+1`, revoke `FAILED` at 5. `push_enabled` is recomputed on every revocation.
- **FR-042**: SMS MUST be created only when `critical && no push SENT` (D2-a), using `CreateNotificationUseCase` with `notificationId = getInspectorNoticeSmsNotificationId(noticeId, inspectorId)` (deterministic UUIDv5), `tenantId:null`, `channel:'SMS'`, `templateCode:'INSPECTOR_NOTICE_SMS'`, `payloadJson:{message: buildInspectorNoticeSmsMessage(title, body)}`. No phone → `sms_skipped_no_phone` warn; over daily cap → skip + `smsSkippedCap` + one `sms_cap_reached` warn. Non-critical never creates SMS.
- **FR-043**: Each recipient MUST be marked `delivery_processed_at=now()` after its push/SMS decision (idempotent retry). Job end MUST set `delivery_completed_at = COALESCE(delivery_completed_at, now())` and log `delivery_completed` with counters incl. `sydneyHour`; `sms_burst` warn when `smsQueued >= 20`.
- **FR-044**: The push payload MUST be `{v:1, noticeId, title, body(≤180 chars with "…"), critical, url: resolveInspectorNoticeTargetPath(noticeId, target_path)}` with options `{TTL:86400, urgency: critical?'high':'normal', timeout:10000}`. Title and body are public on lock screens; system notices MUST NOT contain key/lockbox codes, passwords, or tenant name/phone (documented in the use-case docblock).

**Safety sweep / retention**
- **FR-050**: Job `inspector-notice.delivery-sweep` (cron `*/5 * * * *` Sydney) MUST re-enqueue up to 100 eligible notices (criteria in User Story 5.1), be idempotent, skip 22:00–06:00 Sydney, and log as specified.
- **FR-051**: Job `inspector-notice.auto-archive` (cron `45 3 * * *` Sydney) MUST archive system notices older than the retention env (batched 1000, no audit) and delete subscriptions revoked > 90 days (batched 1000), logging counts.

**Shared contracts**
- **FR-060**: Shared package MUST export Zod schemas (`packages/shared/src/schemas/inspector-notice.ts`) and constants (`packages/shared/src/constants/inspector-notices.ts`): `SYSTEM_INSPECTOR_NOTICE_TYPES`, `SYSTEM_NOTICE_CRITICALITY`, `isCriticalSystemNoticeType`, `INSPECTOR_NOTICE_TARGET_PATTERNS` (exactly `/profile/announcements/:id` and `/schedule/:id`), `isAllowedInspectorNoticeTargetPath` (algorithm of L-F02-08), `resolveInspectorNoticeTargetPath`, `getInspectorNoticeDeliverExpireMinutes`, `buildInspectorNoticeSmsMessage` (≤ 300 chars), `inspectorNoticeDeepLink`.
- **FR-061**: `NotificationChannel` MUST stay `EMAIL | SMS` — no `PUSH`, no `IN_APP` (the existing enum tests must stay green unchanged). The SMS template `INSPECTOR_NOTICE_SMS` MUST be registered in the catalog (platform-only, TRANSACTIONAL, target `INSPECTOR`, body `{{{message}}}`) and seeded at boot by `syncPlatformTemplates`; `prisma/seed.ts` MUST NOT list it.
- **FR-062**: `PublishSystemInspectorNoticeUseCase` and `HasRecentSystemInspectorNoticeUseCase` MUST be exposed on the container with **no HTTP route**; the former derives `critical` from the type, validates `targetPath` against the allowlist (ValidationError otherwise), and is idempotent by `dedupeKey`.
- **FR-063**: `packages/shared/openapi.json` and `packages/shared/src/api-types.ts` MUST be regenerated (`pnpm generate:api`) and committed; the error envelope stays `{ error: { code, message, details } }`; all routes declare `schema.response`.

**Observability / audit**
- **FR-070**: Only `inspector_notice.published` (USER or SYSTEM) and `inspector_notice.archived` (USER) are audited (`tenantId:null`, `requestId`). Mark-read, subscribe/unsubscribe and delivery are NOT audited. Logs MUST never contain `p256dh`, `auth`, or the full endpoint (host only).

### Key Entities

- **InspectorNotice**: one published message. Manual (has `author_user_id`, nullable `system_type`) or system (null author, non-null `system_type`, unique `dedupe_key`). Carries audience snapshot, criticality, optional allowlisted deep-link, and delivery lifecycle timestamps. Immutable after publish except `archived_at` and delivery timestamps.
- **InspectorNoticeRecipient**: the frozen link between a notice and an inspector, materialized at publish. Holds `read_at` (first open, never overwritten) and `delivery_processed_at` (delivery checkpoint, not a receipt).
- **InspectorPushSubscription**: one Web Push subscription per device `endpoint`, owned by an inspector, with client keys, a revocation state (`GONE|UNSUBSCRIBED|REJECTED|FAILED|DEACTIVATED`) and `failure_count`.
- **push_enabled (on Inspector)**: redefined to mean "has ≥ 1 active subscription", maintained by this feature; the F01 heartbeat no longer writes it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (00.A2)**: A critical manual notice reaches every targeted inspector by at least one channel — push to those with an active subscription, SMS to those without a successful push — proven end-to-end with real repositories in the DB test suite (publish → deliver → `notifications` SMS row).
- **SC-002 (00.A4)**: After an inspector reads a notice, the operations read count for that notice moves from 0 to 1 in both the list and the detail within the same request cycle (integration test).
- **SC-003**: No SMS is ever sent for a non-critical notice, and the platform's inspector-notice SMS volume per Sydney-day never exceeds `INSPECTOR_NOTICE_SMS_DAILY_CAP` barring at most a small concurrent-job overshoot (cap is a cost guard, not an exact quota).
- **SC-004**: Delivery is exactly-once per recipient under retries and sweeps: re-running the delivery job or the sweep never produces a duplicate push to an already-processed recipient nor a duplicate SMS (deterministic id + `saveIfAbsent`), proven in the DB suite.
- **SC-005**: A lost enqueue is recovered automatically within ~7 minutes (2-min threshold + 5-min sweep), and a half-finished delivery within ~25 minutes, both inside a 24h window; after 24h a notice is never delivered late (box only).
- **SC-006**: The three new tables carry no `tenant_id`; an integration/RBAC test proves a `CL_*`/`INSP` actor cannot read another inspector's or another subject's rows, and INSP endpoints are scoped to the caller's `inspectorId`.
- **SC-007**: `pnpm --filter @properfy/shared lint typecheck test`, `pnpm --filter backend lint typecheck test`, and the testcontainers DB suite all pass; `api-types.ts` is regenerated and committed; the PR changes ≤ 150 files.

## Assumptions

These encode the closed decisions from `F02-tarefas.md` (D1–D27, 2026-10-27 → 2026-10-29) and the parent plan; where a product decision was still open the spec assumes the plan's recommendation and records it here as a premise.

**Multi-tenant exception (D9, documented exception to CLAUDE.md §7.1):** `InspectorNotice`, `InspectorNoticeRecipient` and `InspectorPushSubscription` are **platform-scoped and carry no `tenant_id`**, because an inspector is cross-tenant (precedent: `Inspector`, global `ServiceRegion`, `IntegrationSetting`). Access scope is given by role (AM/OP read/write across inspectors) and by the JWT `inspectorId` for INSP (every INSP query filters `inspector_id = authContext.inspectorId`). The feature ships the §7.1 scoping test proving a `CL_*`/`INSP` actor cannot read another subject's rows.

**Criticality & channels**
- **D1**: Critical = a fixed list + the manual flag. The only critical *system* types are `ROUTE_PUBLISHED`, `ROUTE_CHANGED` (F04) and `COMPLETION_REMINDER` (F03); `PERFORMANCE_MESSAGE` (F08) and manual notices not flagged critical are not. The "OP reply to 'can't do'" source does not exist (Q1 resolved: inspector releases directly, REJECTED via SYS).
- **D2 / D2-a**: SMS is sent **at delivery time**, only for critical notices, only to inspectors with no successful push — where "no successful push" includes no subscription, GONE, REJECTED, FAILED (any reason: 404/410, 429, 5xx, timeout, network) or DISABLED sender. There is no "unread in X minutes" job.
- **D5 / D6**: Inspector preference is push on/off only; never SMS for non-critical. `PUSH` is **not** added to `NotificationChannel`.
- **D7**: SMS goes through the existing pipeline via platform template `INSPECTOR_NOTICE_SMS` (TRANSACTIONAL, `tenantId=null`), inheriting retry, delivery polling and logging.

**Publishing & lifecycle**
- **D3**: Manual audiences = all active / manual selection / one region (via `InspectorRegion`).
- **D4**: Published notices are never edited or deleted, only archived; archived notices leave the inspector box but remain in the operations history and audit.
- **D16**: Manual publish requires an `Idempotency-Key`, verified inside the transaction under an advisory lock and written with `set(..., tx)` (F03 `ReportCantDoUseCase` pattern) so two concurrent POSTs create one notice.

**Delivery robustness (L-F02-01…11, 2026-10-29 — all recommendations accepted)**
- **L-F02-01 (D17)**: Env `INSPECTOR_NOTICE_SMS_DAILY_CAP` (int ≥ 0, default 500; empty/`none` = unlimited); counted via a new `countByTemplateChannelSince(null, 'INSPECTOR_NOTICE_SMS', 'SMS', startOfDaySydney)` excluding `SKIPPED*`; burst warn at ≥ 20 SMS per notice.
- **L-F02-02 (D18)**: No quiet-hours suppression of sends; push and SMS go out at any hour. The sweep does **not** re-enqueue between 22:00–06:00 Sydney; `sydneyHour` is logged on delivery.
- **L-F02-03 (D19)**: `delivery_completed_at` column; the sweep's second criterion recovers started-but-incomplete deliveries after 20 min; `getInspectorNoticeDeliverExpireMinutes(n) = max(15, ceil(n*2*10/10/60)+5)` (500 → 22).
- **L-F02-04 (D20)**: 401/403 → revoke `REJECTED`; `failure_count>=5` → revoke `FAILED` (atomic increment via `UPDATE … RETURNING`); `SENT`/upsert reset it; `revoked_reason` widened to `GONE|UNSUBSCRIBED|REJECTED|FAILED|DEACTIVATED` (fits `VarChar(20)`).
- **L-F02-06 (D22)**: Auto-archive system notices after `INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS` (int ≥ 1, default 30); manual never; purge subscriptions revoked > 90 days (`INSPECTOR_PUSH_SUBSCRIPTION_PURGE_DAYS = 90`, module constant).
- **L-F02-07 (D23)**: Push body is public on lock screens; full body kept (≤ 180 chars). Content rule documented; manual-notice hint lives in TASK-F02-2.
- **L-F02-08 (D24)**: `isAllowedInspectorNoticeTargetPath` exact segment-by-segment match; lowercase UUID v1–5 regex; no query/fragment/host/`//`/`%`/`\`/trailing slash; length 1–200; non-string → false without throwing.
- **L-F02-09 (D25)**: `ALL` keeps including ACTIVE inspectors without `user_id`; the detail exposes `inspectorStatus` and `hasAppAccess` per recipient.
- **L-F02-10 (D26)**: The delivery job re-reads `archived_at` each 50-item batch and stops when archived.
- **L-F02-11 (D27)**: `DeactivateInspectorUseCase` revokes active subscriptions `DEACTIVATED` and recomputes `push_enabled`; reactivation restores nothing (the app re-subscribes on next login).
- **L-F08-06**: `HasRecentSystemInspectorNoticeUseCase` + repo method `existsSystemNoticeByDedupeKeyPrefixSince` (LIKE with `%`/`_` escaped, `created_at >= since`) is added for the F08 7-day guard; no HTTP route, no new index yet.

**Environment & dependencies**
- **VAPID**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` are optional; absent in staging/prod → `console.warn` and push disabled (SMS fallback keeps criticals working); the `web-push@^3.6.7` library is a new backend dependency.
- **Timezone**: "start of day" for the SMS cap, the sweep quiet-hours window, and the daily jobs all use the Sydney platform timezone via the existing helpers (never server-local UTC); TZ-dependent tests pin `TZ` away from Sydney.
- **Dependency**: TASK-F01-1 is merged on `develop` (adds `inspectors.push_enabled`, `app_last_seen_at`, the `record-inspector-app-state` use case and `POST /v1/inspectors/me/app-state`); this task modifies that use case to stop writing `push_enabled`.
- **Scope boundaries**: web (TASK-F02-2) and PWA (TASK-F02-3) are out of scope; so are pinned notices, scheduled publishing, attachments, inspector replies, push delivery receipts, web-portal push, per-type preferences, and the F03/F04/F08 triggers themselves (this task ships only the API they call).
