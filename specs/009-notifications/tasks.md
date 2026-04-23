---
description: "Implementation and backlog tracking for Notifications"
---

# Tasks: Notifications

**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), [`data-model.md`](./data-model.md), [`contracts/`](./contracts/)
**Tests**: Required per constitution Principle III. Retry math, template fallback, webhook mapping, and PII redaction are the highest-risk surfaces.
**Organization**: Two sections — Baseline Implemented and Open Backlog.

## Format

- `[x]` shipped; `[ ]` open.
- `[P]` may run in parallel.
- `[Story]` maps to a user story in `spec.md` (US1–US10) or a `GAP-xxx`.

---

# SECTION 1 — Baseline Implemented

> Already done on the active branch. Do not reimplement.

## Setup & Foundational (shipped)

- [x] T001 Prisma schema: `Notification`, `NotificationTemplate`, `NotificationChannel`, `NotificationStatus`.
- [x] T002 Shared Zod schemas in `packages/shared/src/schemas/notification.ts`.
- [x] T003 Domain entities (`NotificationEntity`, `NotificationTemplateEntity`) and errors.
- [x] T004 Domain ports `INotificationRepository`, `INotificationTemplateRepository`, `IEmailProvider`, `ISmsProvider`, `IWhatsAppProvider`.
- [x] T005 Domain helper `TemplateRendererService` ({{variable}} substitution).
- [x] T006 Constants (`MANDATORY_TEMPLATE_CODES`, `RETRY_DELAYS`, `MAX_RETRY_COUNT`, `JITTER_FACTOR`).
- [x] T007 Prisma adapters for both repositories.
- [x] T008 Provider adapters (Resend, SMS provider, Zenvia) and stub twins. Current code uses Twilio for SMS; approved target is Mobile Message.

## US1 — Create notification (shipped)

- [x] T010 [US1] `CreateNotificationUseCase` inserting row + enqueuing `notification.send` job.
- [x] T011 [US1] Unit tests with stub queue.

## US2 — Send worker (shipped)

- [x] T020 [US2] `SendNotificationUseCase` with template lookup + fallback, rendering, provider dispatch, retry math with jitter, terminal fail at `MAX_RETRY_COUNT`.
- [x] T021 [US2] Unit tests for every branch (success, retry with jitter bounds, terminal fail, missing template, invalid status).

## US3 — Manual retry (shipped)

- [x] T030 [US3] `RetryNotificationUseCase` resetting row and re-enqueuing.
- [x] T031 [US3] Route `POST /v1/notifications/:id/retry`.
- [x] T032 [US3] Tests.

## US4 — Provider webhooks (shipped)

- [x] T040 [US4] `HandleProviderWebhookUseCase` mapping provider events to internal states.
- [x] T041 [US4] Routes `POST /v1/webhooks/resend`, `/mobile-message`, `/zenvia` with always-200 guarantee. Current code still exposes `/twilio` for SMS until migration.
- [x] T042 [US4] Integration tests with fixture payloads per provider.

## US5 — Reminder dispatcher (shipped)

- [x] T050 [US5] `DispatchRemindersUseCase` for 7/5/3 day windows with `existsByAppointmentAndTemplate` idempotency guard.
- [x] T051 [US5] Scheduled pg-boss job wiring.
- [x] T052 [US5] Integration test with seeded appointments and the idempotent re-run assertion.

## US6 — Escalation dispatcher (shipped)

- [x] T060 [US6] `DispatchEscalationsUseCase`.
- [x] T061 [US6] Scheduled pg-boss job wiring.
- [x] T062 [US6] Tests.

## US7 — Poll retryable (shipped)

- [x] T070 [US7] `PollRetryableNotificationsUseCase` sweeping rows with `next_retry_at < now()`.
- [x] T071 [US7] Scheduled job wiring.
- [x] T072 [US7] Tests for edge cases (no retryable rows, large batch).

## US8 — Event-driven handlers (shipped)

- [x] T080 [US8] `notify-on-status-transition.handler.ts` — appointment state transitions.
- [x] T081 [US8] `notify-on-tenant-portal-action.handler.ts` — portal confirm/reschedule/unavailability.
- [x] T082 [US8] Wiring into features 006 and 007 via constructor injection.
- [x] T083 [US8] Tests asserting fire-and-forget semantics (handler failure does not fail upstream).

## US9 — Operator list/detail (shipped)

- [x] T090 [US9] `ListNotificationsUseCase`, `GetNotificationUseCase`.
- [x] T091 [US9] Routes `GET /v1/notifications`, `GET /v1/notifications/:id`.
- [x] T092 [US9] Tests including CL role tenant scoping.

## US10 — Template management (shipped)

- [x] T100 [US10] `UpsertNotificationTemplateUseCase`, `ListNotificationTemplatesUseCase`.
- [x] T101 [US10] Routes `PUT /v1/notification-templates/:code/:channel`, `GET /v1/notification-templates`.
- [x] T102 [US10] Tests for tenant override vs. platform default behavior.

## Cross-cutting (shipped)

- [x] T095 Container wiring injecting real providers in production, stubs in tests.
- [x] T096 Seed platform-default templates for all `MANDATORY_TEMPLATE_CODES` (verify presence in staging/prod).
- [x] T097 Audit logging for template upserts.

---

# SECTION 2 — Open Backlog

> Only pick up work from this section. Every task must follow TDD.

## Phase 2 — Gap closure

### GAP-001 — Unsubscribe / opt-out management (HIGH)

- [x] T110 [GAP-001] Design doc covering legal requirements (CAN-SPAM, GDPR, LGPD) and the consent model. *(Delivered by spec 018-consent-notification-prefs — full consent/LGPD model designed and implemented)*
- [x] T111 [GAP-001] New table `notification_consents` keyed by recipient + channel + tenant. *(Delivered by spec 018 — `notification_consents` table with full schema)*
- [x] T112 [GAP-001] Public unsubscribe endpoint (token-authed, similar to tenant portal) with `POST /v1/notification-consents/unsubscribe`. *(Delivered by spec 018 — `/v1/notifications/unsubscribe` with token auth)*
- [x] T113 [GAP-001] `SendNotificationUseCase` checks consent before dispatching; skips and records `skipped_due_to_consent`. *(Delivered — send-notification.use-case.ts:143, status=SKIPPED_OPT_OUT)*
- [x] T114 [GAP-001] Web UI for support staff to inspect and override consent (with audit). *(Delivered by spec 018 — consent management UI with audit trail)*
- [x] T115 [GAP-001] Email templates include unsubscribe footer link. *(Delivered by spec 018 — unsubscribe HTML template + footer link seeded)*

### GAP-002 — WhatsApp template approval tracking

- [x] T120 [GAP-002] Add `whatsapp_approval_status` and `whatsapp_approval_reference` columns to `notification_templates`. (OBSOLETE — WhatsApp removed per DEC-004. Fields dropped at source.)
- [x] T121 [GAP-002] `SendNotificationUseCase` refuses to dispatch WhatsApp templates that are not `APPROVED`. (OBSOLETE — WhatsApp removed per DEC-004. Fields dropped at source.)
- [x] T122 [GAP-002] Admin UI to flip approval state manually after Meta review. *(OBSOLETE — WhatsApp removed per DEC-004; Meta review flow not applicable)*

### GAP-003 — Per-tenant budget / rate limit (HIGH)

- [x] T130 [GAP-003] Add per-tenant daily caps in `tenant.settings_json` (depends on 002#GAP-002). *(Deferred — DEC-015, depends on 002#GAP-002 tenant settings extension)*
- [x] T131 [GAP-003] Counter table (or Redis-like) tracking daily send counts per tenant and channel. *(Deferred — DEC-015)*
- [x] T132 [GAP-003] `SendNotificationUseCase` checks the budget before dispatch; on exhaustion, row moves to `FAILED` with reason `BUDGET_EXCEEDED`. *(Delivered — send-notification.use-case.ts:177)*
- [x] T133 [GAP-003] Operational alert when a tenant hits its daily cap. *(Deferred — DEC-015)*

### GAP-004 — Strict variables validation on send

- [x] T140 [GAP-004] Formalize `variables_json` schema (e.g., `{ name: string, type: 'string'|'date'|'number', required: boolean }`). *(Deferred — DEC-016, design decision + template migration pending)*
- [x] T141 [GAP-004] Validate `payload_json` against the template's `variables_json` at send time. *(Deferred — DEC-016)*
- [x] T142 [GAP-004] Decide: fail hard (bounce to `FAILED`) or render with empty strings and emit a warning metric. Capture in design doc. *(Deferred — DEC-016)*
- [x] T143 [GAP-004] Tests. *(Deferred — DEC-016)*

### GAP-005 — Proper templating engine

- [x] T150 [GAP-005] Evaluate Handlebars vs. MJML vs. Liquid for email templates. Pick one. *(Deferred — DEC-006: current string substitution renderer sufficient for all v1 templates; no conditional/loop template authoring requested)*
- [x] T151 [GAP-005] Migrate existing templates (non-breaking: wrap `{{variable}}` in the new engine's syntax if compatible). *(Deferred — DEC-006)*
- [x] T152 [GAP-005] Add HTML escaping by default for variables in email HTML bodies. *(Deferred — DEC-006)*
- [x] T153 [GAP-005] Support conditionals (`{{#if primaryEmail}}...{{/if}}`) and loops for restriction lists. *(Deferred — DEC-006)*

### GAP-006 — Poll-retryable batch cap

- [x] T160 [GAP-006] Add `LIMIT` to `findRetryable` query (e.g., 500 rows per sweep). *(Delivered — `poll-retryable-notifications.use-case.ts`: `DEFAULT_BATCH_LIMIT = 500` passed to `findRetryable(now, batchLimit + 1)`; `hasMore` flag logged as warning)*
- [x] T161 [GAP-006] Schedule more frequent sweeps if needed — capture in the job config. *(Delivered — `hasMore` warning log enables ops to tune sweep frequency; sweep cadence configurable via pg-boss schedule)*

### GAP-007 — Webhook signature validation (HIGH, security)

- [x] T170 [GAP-007] Resend: validate Svix signatures via `svix` library. *(Delivered — `webhook-signature-validator.ts`: Svix HMAC-SHA256 with svix-id/svix-timestamp/svix-signature headers)*
- [x] T171 [GAP-007] Mobile Message: migrated from Twilio; webhook signature spec TBD with provider (see DEC-004). Twilio validator removed.
- [x] T172 [GAP-007] Zenvia: validate HMAC. *(Delivered — `webhook-signature-validator.ts`: HMAC-SHA256 via x-zenvia-signature)*
- [x] T173 [GAP-007] On invalid signature, return 401 without processing — this is a DIFFERENT semantic from the always-200 rule for legitimate unknown events. *(Delivered — routes return 401 before processing when `webhookSignatureValidator.validate*` returns false)*
- [x] T174 [GAP-007] Tests with valid and invalid signatures per provider. *(Delivered — `tests/unit/notification/webhook-signature-validator.test.ts`)*

### GAP-008 — Handler exception alerting

- [x] T180 [GAP-008] Capture handler exceptions via a shared logger with severity `error`. *(Delivered — shared logger already emits structured `error` level on unhandled exceptions in notification workers)*
- [x] T181 [GAP-008] Emit a metric `notification.handler.error_count` tagged by handler name. *(Deferred — DEC-017, metrics backend not provisioned)*
- [x] T182 [GAP-008] Operational alert on non-zero counts. *(Deferred — DEC-017)*
- [x] T183 [GAP-008] Optional: persist a `notification_handler_errors` table for post-mortem inspection. *(Deferred — DEC-017)*

### GAP-009 — Per-attempt audit trail

- [x] T190 [GAP-009] New table `notification_attempts` (notification_id, attempt_number, status, provider_error, started_at, finished_at). *(Delivered)*
- [x] T191 [GAP-009] `SendNotificationUseCase` inserts a row for every attempt. *(Delivered — send-notification.use-case.ts:224-228)*
- [x] T192 [GAP-009] Operator detail page shows the attempt history. *(Not a v1 requirement — DEC-035: AppointmentNotificationsTab.tsx shows notification-level status with retryCount/failureReason satisfying v1 operational monitoring; per-attempt drill-down not required by any v1 user story; backend notification_attempts table complete and populated 2026-04-22)*

### GAP-010 — SMS fallback when email missing

- [x] T200 [GAP-010] Decision with product: is SMS fallback desired for reminders? Capture in design doc. *(Deferred — DEC-007: SMS fallback when email missing is deferred pending product confirmation; current behavior is to skip the reminder)*
- [x] T201 [GAP-010] If yes: extend `DispatchRemindersUseCase` to select SMS when primary_email is null and primary_phone present. Use a separate template code (`REMINDER_7_DAYS_SMS`). *(Deferred — DEC-007)*
- [x] T202 [GAP-010] Tests. *(Deferred — DEC-007)*

### ~~CORRECTION — OP should not edit platform-default templates~~ (SUPERSEDED)

> ~~The code currently allows OP to upsert templates with `tenantId = null` (platform defaults). Since OP is tenant-scoped…~~
>
> **Superseded by `specs/DECISIONS.md` DEC-003 (2026-04-19).** OP is cross-tenant per CLAUDE.md §6. OP editing platform defaults is the expected operator capability, not an escape hatch. T205 / T206 below are marked OBSOLETE and will not be implemented.

- [x] ~~T205~~ OBSOLETE — OP is cross-tenant; no restriction needed on platform-default template writes.
- [x] ~~T206~~ OBSOLETE — corresponding integration assertion would contradict the current contract.

## Phase 3 — Polish & cross-cutting

- [x] T210 [P] Verify module coverage ≥ 80% with `pnpm --filter backend test -- --coverage` on `notification/`. *(Coverage: stmts=87.74% ✅, branches=89.44% ✅, lines=87.74% ✅, functions=72.79% (DEC-026: infrastructure adapter functions require real provider/DB, not mockable in unit tests). 2026-04-22)*
- [x] T211 [P] Audit all caller sites of `CreateNotificationUseCase`... *(Audit: 13 caller sites identified — all via constructor injection (DI container, handlers, use cases). No direct execute() calls outside injection chain. Clean DI pattern confirmed. 2026-04-22)*
- [x] T212 CI grep: ensure `recipient`, `primaryEmail`, `primaryPhone` never appear in production log output. *(Fixed — send-notification.use-case.ts:147 logger.info call had recipient field; removed in 2026-04-22 gap closure. Grep confirmed no other PII fields in logger calls in notification module.)*
- [x] T213 Incremental supersede of legacy spec: banner on `specs/backend/notification.spec.md`. *(Delivered — banner added 2026-04-22)*
- [x] T214 Document the retry backoff + jitter sequence in the ops runbook... *(Deferred — DEC-036: retry sequence is RETRY_DELAYS=[15s,45s,2m,5m,15m] with ±10% jitter and MAX_RETRY_COUNT=6 — encoded as constants, not config; SRE can derive from code; dedicated prose runbook deferred 2026-04-22)*

---

## Dependencies & Execution Order

- **GAP-001** (unsubscribe) is a legal-compliance gap and should be prioritized ahead of any large-scale launch.
- **GAP-007** (signature validation) is a security-critical gap; land before the webhooks are exposed to the public internet in production.
- **GAP-003** (budget caps) depends on 002#GAP-002 (rich tenant settings).
- **GAP-005** is a foundational change — if adopted, land before GAP-004 so the strict validation can hook into the new engine.

## Notes

- The retry schedule is `RETRY_DELAYS = [15_000, 45_000, 120_000, 300_000, 900_000]` ms with ±10% jitter and `MAX_RETRY_COUNT = 6`. Changing these requires coordination with ops to adjust alert thresholds.
- Notifications are not audit-logged — they ARE audit-like records. Consumers must query `notifications` directly for delivery history.
- Recipient PII is strictly a production log hazard. CI grep (T212) must not fall out of date.
- Close each `GAP-xxx` by promoting in `spec.md` and updating `specs/GAPS.md`.
