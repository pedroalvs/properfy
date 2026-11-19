# Phase 0 Research — Inspector Notices Backend

No `NEEDS CLARIFICATION` remained after the spec (all product decisions are closed in `F02-tarefas.md`). This file records the technical decisions that shape the implementation and the alternatives rejected.

## R1 — Web Push library and sender port

- **Decision**: Use `web-push@^3.6.7` (VAPID, payload encryption, `WebPushError`) behind a domain port `IPushSender` with outcomes `SENT | GONE(404|410) | REJECTED(401|403) | FAILED(number|null) | DISABLED`. Two adapters: `WebPushSender` (when all three VAPID vars are set) and `DisabledPushSender` (otherwise).
- **Rationale**: The library is the de-facto standard, handles VAPID JWT and `aes128gcm` encryption. Mapping HTTP status to a small outcome union keeps the delivery use case independent of the library and makes the clock/outcome matrix (24 cases) testable with a fake sender. `DISABLED` gives safe degradation to SMS when VAPID is unset.
- **Alternatives rejected**: Hand-rolling VAPID/encryption (error-prone, no benefit); calling `web-push` inline in the use case (couples domain to library, untestable DISABLED path); adding `PUSH` to `NotificationChannel` (D6 — would break the "exactly 2 channels" enum test and bloat the template catalog).

## R2 — SMS fallback reuses the existing pipeline (no new sender)

- **Decision**: Send the fallback SMS by calling the existing `CreateNotificationUseCase` with a new platform template `INSPECTOR_NOTICE_SMS` (`channel SMS`, `tenantId null`, class `TRANSACTIONAL`, body `{{{message}}}`), registered in the shared catalog and seeded at boot by `syncPlatformTemplates`.
- **Rationale**: Inherits retry, delivery polling, DLQ, consent bypass (TRANSACTIONAL) and daily-budget exemption (platform + TRANSACTIONAL) for free. Triple-stash `{{{message}}}` because the renderer escapes HTML (`noEscape:false`) and the body is free OP text; `{{message}}` would emit `&amp;`.
- **Alternatives rejected**: A dedicated SMS path (duplicates retry/logging, diverges from the platform model); `{{message}}` double-stash (wrong escaping for SMS); listing the code in `prisma/seed.ts` (the seed comment forbids platform-only TRANSACTIONAL codes; `syncPlatformTemplates` creates the row with the declared/derived class).
- **Consequence — own SMS cap (L-F02-01)**: because the platform-TRANSACTIONAL path is exempt from the tenant daily budget, F02 adds its **own** daily cap counted via a new `countByTemplateChannelSince(null, 'INSPECTOR_NOTICE_SMS', 'SMS', since)` (same `SKIPPED*` exclusion as `countByTenantChannelSince`).

## R3 — Idempotent publish (manual) under concurrency

- **Decision**: Follow the F03 `ReportCantDoUseCase` pattern — mandatory `Idempotency-Key`; outside the tx `getWithHash(key, scope)` for a fast cache hit / 409 on hash mismatch; then `runInTransaction` taking `pg_advisory_xact_lock(hashtext('inspector-notice.publish:'+key))`, re-reading `getWithHash(key, scope, tx)`, inserting notice + recipients, and writing `set(key, scope, output, 24, payloadHash, tx)` **inside** the tx. Audit + enqueue run post-commit via `defer`.
- **Rationale**: The advisory lock serializes two concurrent POSTs with the same key so exactly one notice is created; writing the idempotency record inside the tx means a rollback leaves no false "success" for a retry to read. The DB test must fail without the lock (concurrency proof).
- **Alternatives rejected**: Unique constraint only (would need a natural key; the audience/body aren't a key); writing the idempotency record outside the tx (docblock warns it survives rollback → false success); optimistic retry without a lock (two inserts race).

## R4 — Deterministic SMS notification id (retry-safe)

- **Decision**: `getInspectorNoticeSmsNotificationId(noticeId, inspectorId)` = UUIDv5 over `${noticeId}:${inspectorId}` with a new namespace constant, mirroring `getAgencyForwardNotificationId`. Passed as `CreateNotificationInput.notificationId` so `saveIfAbsent` makes re-delivery a no-op.
- **Rationale**: Delivery jobs retry and the sweep re-enqueues; a stable id means a given (notice, inspector) SMS is created at most once and does not re-consume the daily cap on retry.
- **Alternatives rejected**: Random id (duplicate SMS on retry); DB unique on (notice, inspector, channel) (the notification log is not scoped that way and is shared with other flows).

## R5 — Delivery lifecycle, sweep, and incomplete recovery

- **Decision**: Two timestamps on the notice — `delivery_started_at` (set `COALESCE(…, now())` at job start) and `delivery_completed_at` (set `COALESCE(…, now())` at job end or archive stop). Recipients carry `delivery_processed_at` (per-recipient checkpoint). The sweep (`*/5 * * * *` Sydney) re-enqueues notices within a 24h `published_at` window that either (a) never started after 2 min, or (b) started ≥ 20 min ago, not completed, with pending recipients. It skips 22:00–06:00 Sydney.
- **Rationale**: `started_at` distinguishes "enqueue lost" from "in progress"; `completed_at` + pending-exists distinguishes "finished" from "died mid-way". The 24h window prevents late surprise deliveries; the quiet-hours gate avoids 3am SMS from a recovered enqueue while keeping the 24h window.
- **Alternatives rejected**: A single "delivered" boolean (can't tell lost from in-progress); no window (stale notices delivered days late); suppressing live sends at night (D18 — explicitly rejected; only the sweep pauses).

## R6 — `push_enabled` redefinition (D10 / L-F01-02)

- **Decision**: `inspectors.push_enabled` becomes `EXISTS(active subscription)`, recomputed in the same tx as every subscription write via a repository `recomputePushEnabled(tx, inspectorId)` (single `UPDATE … SET push_enabled = EXISTS(…)`). The F01 heartbeat's `recordAppState()` drops `push_enabled` from its single `$executeRaw` statement and from the repo method signature; its test stops asserting the column.
- **Rationale**: One source of truth (the subscriptions table) instead of the browser permission the heartbeat used to report. Keeping `recordAppState` a single SQL statement preserves the F01 concurrency guarantee (L-F01-02).
- **Alternatives rejected**: Keeping the heartbeat writer (two writers race on the same column); a trigger (project avoids DB triggers; harder to test).

## R7 — Target-path allowlist shared by backend and SW (L-F02-08)

- **Decision**: `INSPECTOR_NOTICE_TARGET_PATTERNS` = exactly `/profile/announcements/:id`, `/schedule/:id`, with `isAllowedInspectorNoticeTargetPath` doing exact segment-by-segment matching (lowercase UUID v1–5 regex for `:id`; reject query/fragment/host/`//`/`%`/`\`/trailing slash; length 1–200; non-string → false). The backend validates `targetPath`; TASK-F02-3's SW imports the same function. F04 will append `/today`.
- **Rationale**: One allowlist prevents open-redirect/deep-link abuse and keeps backend and client in lockstep. Segment matching (not prefix/regex-on-whole) is unambiguous and testable.
- **Alternatives rejected**: Free-form path (open redirect risk); a loose regex over the whole string (ReDoS / prefix bypass risk).

## R8 — Sydney timezone for all day math

- **Decision**: Start-of-day for the SMS cap, the 22:00–06:00 sweep gate, and the daily cron jobs all compute in `PLATFORM_TIMEZONE` (Australia/Sydney) via the existing shared helpers — never `new Date().setHours(0)` (server runs UTC on Fly). `boss.schedule(..., SYDNEY_TZ)` for cron, matching `notification.retry-poll`.
- **Rationale**: Memory "Sydney only" — business day boundaries are Sydney wall-clock; the server is UTC.
- **Alternatives rejected**: Server-local time (off by the UTC offset, DST-fragile); storing a per-tenant tz (these entities are platform-scoped, not per-tenant).

## R9 — Migration safety (expand-only, no index drops)

- **Decision**: Generate with `prisma migrate dev --create-only`, inspect the SQL to confirm it does **not** drop the `Unsupported()` GIST index on `service_regions.geom` or the `service_regions_*_lower_name_key` indexes, then apply locally and `prisma generate`. Timestamp must exceed the latest merged migration (`20261029165859`) — use a `20261030HHMMSS` stamp.
- **Rationale**: Memory "prisma drift drops Unsupported indexes" — `migrate dev` can try to drop indexes Prisma can't model. Expand-only keeps rollback to a later contract PR.
- **Alternatives rejected**: `db push` (no migration file); editing a merged migration (forbidden).
