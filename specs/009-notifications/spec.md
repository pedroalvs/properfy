# Feature Specification: Notifications

**Feature Branch**: `009-notifications`
**Created**: 2026-04-05
**Feature Status**: IMPLEMENTED — Phase 1 shipped; Phase 2 gaps + 1 correction closed in commit `ec2a873` (2026-04-08, Waves 1–4). Gap 009#GAP-001 (unsubscribe / opt-out management) was further closed by feature 018 (consent notification prefs, 2026-04-11). Editorial reconciliation 2026-04-13. See `specs/GAPS.md` for the gap status table.
**Sources**:
- Code: `apps/backend/src/modules/notification/**`, `apps/backend/prisma/schema.prisma`, `packages/shared/src/schemas/notification.ts`
- Approved rules: `.specify/memory/constitution.md`, `CLAUDE.md`, `projeto-consolidado/regras-negocio-respostas-cliente.md`
- Legacy spec (to be superseded on approval): `specs/backend/notification.spec.md`

> **Domain context.** Notifications are the platform's outbound communication channel. They deliver tenant-portal links, inspection reminders (7/5/3 days before), property manager escalations, renter SMS alerts, and event-driven confirmations across three channels: EMAIL (Resend), SMS (Mobile Message), and WhatsApp (Zenvia). Every notification is created as a row, enqueued as a pg-boss job, rendered from a template, and dispatched. Provider webhooks update delivery status. Failures retry with exponential backoff and terminal-fail after the maximum attempts.
>
> **Reading guide.** Every user story declares `Priority`, `Status`, `Source`. Status: `IMPLEMENTED` | `APPROVED` | `GAP`. Source: `code` | `dossier` | `inferred`.

## User Scenarios & Testing

### User Story 1 — System creates a notification row and enqueues a send job

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

Any caller (another use case, a scheduled dispatcher, or a domain event handler) invokes `CreateNotificationUseCase` with tenant id, optional appointment id, recipient, channel, template code, and a rendered payload of `{variable: value}` pairs. The use case persists a `Notification` row in `PENDING` and enqueues a `notification.send` pg-boss job with `retryLimit: 0` (retry logic lives in the send worker, not pg-boss).

**Independent Test**: Call the use case directly with a valid payload. Confirm (a) the row exists in `PENDING`, (b) a `notification.send` job is in the pg-boss queue, (c) `payload_json` matches the input.

**Acceptance Scenarios**:

1. **Given** a valid tenant id, recipient, channel, template code, and payload, **When** `CreateNotificationUseCase.execute()` is called, **Then** a `Notification` row is persisted in `PENDING` and a `notification.send` job is enqueued.
2. **Given** an empty `tenantId`, **When** the use case runs, **Then** the call fails with `ValidationError: tenantId is required`.
3. **Given** any caller (trusted internal context), **When** they invoke the use case, **Then** there is no RBAC check — the caller is expected to have already enforced its own permissions.

---

### User Story 2 — Worker sends a queued notification

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

The pg-boss worker picks up a `notification.send` job and invokes `SendNotificationUseCase`. The use case loads the notification and the matching template (tenant-specific if present, platform default otherwise), renders the subject/body using a simple `{{variable}}` substitution, and dispatches through the appropriate provider adapter (Resend for EMAIL, Mobile Message for SMS, Zenvia for WhatsApp). On success, `status = SENT`, `provider_name` and `provider_message_id` are persisted. On failure, the retry counter increments and `next_retry_at` is scheduled using the exponential backoff with jitter.

**Independent Test**: Create a notification via US1, run the send use case directly (stub providers return a fake message id). Confirm status flips to `SENT` and message id is recorded.

**Acceptance Scenarios**:

1. **Given** a `PENDING` notification with a valid tenant-specific template, **When** the worker runs, **Then** the template is rendered with `payload_json`, the provider is called, and on success `status = SENT`, `sent_at`, `provider_name`, `provider_message_id` are set.
2. **Given** no tenant-specific template exists, **When** the worker runs, **Then** it falls back to a platform-default template (`tenant_id = NULL`).
3. **Given** neither template exists, **When** the worker runs, **Then** the use case fails with `TEMPLATE_NOT_FOUND`.
4. **Given** a provider error on send, **When** caught, **Then** `retry_count++`, `next_retry_at` is scheduled with exponential backoff (15s, 45s, 2min, 5min, 15min) + ±10% jitter, and `status` remains `PENDING`.
5. **Given** `retry_count` reaches `MAX_RETRY_COUNT = 6`, **When** the next failure happens, **Then** `status = FAILED`, `failed_at` is set, and `failure_reason` captures the provider error message.
6. **Given** a notification in status other than `PENDING`, **When** the send worker runs on it, **Then** the use case fails with `NOTIFICATION_INVALID_STATUS` (defensive against duplicate job consumption).

---

### User Story 3 — Retry an exhausted notification manually

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

An operator with access to the notifications list finds a `FAILED` notification and clicks "Retry". The system resets the retry state and re-enqueues a send job. Useful for transient provider outages that exceeded the automatic retry budget.

**Independent Test**: Fail a notification through the max retry budget. Call `POST /v1/notifications/:id/retry`. Confirm the row is back to `PENDING` with `retry_count = 0` and a new send job is enqueued.

**Acceptance Scenarios**:

1. **Given** an authorized actor and a `FAILED` notification, **When** they call the retry endpoint, **Then** the row is reset to `PENDING`, `retry_count` cleared, `failed_at` / `failure_reason` cleared, and a new `notification.send` job is enqueued.
2. **Given** a notification in `SENT` or `DELIVERED`, **When** retry is called, **Then** the request fails with `NOTIFICATION_INVALID_STATUS`.
3. **Given** a notification not found, **When** retry is called, **Then** the request fails with `NOTIFICATION_NOT_FOUND`.

---

### User Story 4 — Provider webhook updates delivery status

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

Each provider posts delivery events to a dedicated webhook endpoint (`/v1/webhooks/resend`, `/v1/webhooks/mobile-message`, `/v1/webhooks/zenvia`). The use case looks up the notification by `provider_message_id` and updates `status`, `delivered_at`, or `failure_reason` as appropriate. The endpoint always returns `200 { received: true }` to avoid provider retry loops even when the lookup fails.

**Independent Test**: Seed a `SENT` notification with a known `provider_message_id`. Post a Resend `email.delivered` webhook with that id. Confirm the row transitions to `DELIVERED`.

**Acceptance Scenarios**:

1. **Given** a Resend webhook with `type = email.delivered` and a matching `data.id`, **When** posted to `/v1/webhooks/resend`, **Then** the notification moves to `DELIVERED` with `delivered_at` set.
2. **Given** a Resend webhook with `type = email.bounced` or `email.complained`, **When** posted, **Then** the notification moves to `FAILED` with the event captured in `failure_reason`.
3. **Given** a Mobile Message status webhook with `status = delivered|failed`, **When** posted to `/v1/webhooks/mobile-message`, **Then** the notification is updated analogously.
4. **Given** a Zenvia webhook with `status = delivered|failed|rejected`, **When** posted to `/v1/webhooks/zenvia`, **Then** the notification is updated analogously.
5. **Given** an unknown `provider_message_id`, **When** a webhook posts, **Then** the endpoint still returns `200 { received: true }` — the event is silently ignored. (Logged internally.)
6. **Given** any webhook endpoint, **When** called, **Then** authentication is NOT required (providers cannot carry our JWTs). Signature validation is a Phase 2 gap.

---

### User Story 5 — Scheduled reminder dispatcher

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

A scheduled pg-boss job invokes `DispatchRemindersUseCase` daily. The use case iterates 7/5/3-day windows, loads appointments scheduled on the target date, and for each one checks whether the matching template has already been sent (idempotency). If not, a new notification is created and enqueued.

**Independent Test**: Seed an appointment 7 days from today with a contact email. Run the dispatcher. Confirm one `REMINDER_7_DAYS` notification is created. Run the dispatcher again — confirm no duplicate.

**Acceptance Scenarios**:

1. **Given** an appointment scheduled 7 days from today with a primary contact whose `snapshot_email` is non-null, **When** the dispatcher runs, **Then** one `REMINDER_7_DAYS` notification is enqueued to that `snapshot_email`.
2. **Given** the same dispatcher runs twice in the same day, **When** on the second run, **Then** no duplicate is created (`existsByAppointmentAndTemplate` check).
3. **Given** an appointment whose primary contact has `snapshot_email = NULL`, **When** the dispatcher runs, **Then** the notification is skipped (counted in `skipped`) — no SMS fallback in Phase 1.
4. **Given** appointments on T+5 and T+3 days, **When** the dispatcher runs, **Then** it emits `REMINDER_5_DAYS` and `REMINDER_3_DAYS` respectively.

---

### User Story 6 — Escalation dispatcher for unconfirmed appointments

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

A scheduled pg-boss job invokes `DispatchEscalationsUseCase` to notify the property manager when a tenant has not confirmed an appointment within a certain window before the scheduled date.

**Acceptance Scenarios**:

1. **Given** a `SCHEDULED` appointment whose `tenant_confirmation_status` is still `PENDING` close to the scheduled date, **When** the dispatcher runs, **Then** a `PROPERTY_MANAGER_ESCALATION` notification is created to the branch contact.
2. **Given** the same appointment has already been escalated, **When** the dispatcher runs again, **Then** no duplicate is created.

---

### User Story 7 — Poll retryable notifications

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

A scheduled pg-boss job runs `PollRetryableNotificationsUseCase` periodically. It finds notifications in `PENDING` with `next_retry_at < now()` and re-enqueues `notification.send` for each. This is the mechanism that honors the exponential backoff schedule written by the send worker on failure.

**Acceptance Scenarios**:

1. **Given** a failed send attempt that set `next_retry_at = now() + 15s`, **When** the poll runs after 15s, **Then** a new `notification.send` job is enqueued for that row.
2. **Given** a notification in `SENT` or `DELIVERED`, **When** the poll runs, **Then** it is not touched.
3. **Given** the poll misses a cycle, **When** it runs again, **Then** all overdue rows are swept in batch (no cap in Phase 1 — see GAP-006).

---

### User Story 8 — Event-driven notifications from appointment and portal events

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

When feature 006 performs a state transition, it invokes `onTransitionHandler.execute(...)` (fire-and-forget). When feature 007 performs a portal action, it invokes `onNotificationHandler.execute(...)`. These are wired to `notify-on-status-transition.handler.ts` and `notify-on-tenant-portal-action.handler.ts`, which map events to template codes and call `CreateNotificationUseCase` for each recipient.

**Acceptance Scenarios**:

1. **Given** an appointment transition to `SCHEDULED`, **When** the handler runs, **Then** `INSPECTION_NOTICE` is sent to the renter (if email present).
2. **Given** an appointment transition to `CANCELLED`, **When** the handler runs, **Then** `INSPECTION_CANCELLED` is sent.
3. **Given** a portal `confirm` action, **When** the handler runs, **Then** `INSPECTION_CONFIRMED` is sent to the renter.
4. **Given** a portal `reschedule` action, **When** the handler runs, **Then** `INSPECTION_RESCHEDULED` is sent.
5. **Given** any handler failure, **When** caught, **Then** the caller (feature 006 / 007) continues — fire-and-forget.

---

### User Story 9 — List and inspect notifications (operator)

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

Operators browse notifications to troubleshoot delivery failures. Filters: tenant id, appointment id, channel, status, template code, date range, recipient search. Detail page shows payload, rendered message (reconstructed), provider ids, and all timestamps.

**Acceptance Scenarios**:

1. **Given** an authorized actor, **When** they `GET /v1/notifications` with filters, **Then** paginated results are returned scoped by their tenant (AM can cross-tenant; OP sees own tenant only).
2. **Given** an authorized actor, **When** they `GET /v1/notifications/:id`, **Then** the detail view is returned.

---

### User Story 10 — Manage notification templates (operator)

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

AM or OP configures platform-default templates; CL_ADMIN configures tenant-specific overrides. Each template has a unique `(tenant_id, template_code, channel)` tuple. The upsert endpoint handles both create and update paths.

**Acceptance Scenarios**:

1. **Given** an AM actor, **When** they `PUT /v1/notification-templates/INSPECTION_NOTICE/EMAIL` with `tenant_id = null`, **Then** the platform-default template is upserted.
2. **Given** a CL_ADMIN actor, **When** they upsert a template for their tenant, **Then** the tenant override is stored separately from the default.
3. **Given** a send operation with both a tenant override and a default, **When** the template lookup runs, **Then** the tenant override wins.
4. **Given** any actor, **When** they `GET /v1/notification-templates` with filters, **Then** the matching templates are returned.
5. **Given** a template with `variables_json` listing expected variables, **When** a notification is rendered with missing variables, **Then** the renderer substitutes empty strings (not an error). Strict validation is tracked as GAP-004.

---

### Edge Cases

- **Stub providers for tests**: `StubEmailProvider`, `StubSmsProvider`, `StubWhatsAppProvider` return fixed message ids and never hit the network. Production wiring must inject the real providers — verify container configuration during review.
- **Template renderer is naive**: simple `{{variable}}` substitution without HTML escaping, conditionals, or loops. Moving to a proper templating engine is a Phase 2 gap (GAP-005).
- **Webhook endpoints are unauthenticated**: providers cannot carry our JWTs. Signature validation per provider is a gap (GAP-007).
- **Fire-and-forget from features 006/007**: handler failures are swallowed. An operational alert on handler exceptions is needed (GAP-008).
- **Reminder dispatcher skips appointments without email**: no SMS fallback in Phase 1. The product may prefer SMS first for renters without email — tracked as GAP-010.
- **Retry backoff is in memory** (computed in send worker): if the send worker crashes mid-schedule, the `next_retry_at` is already persisted so the poll worker picks it up.
- **Retry count is a counter, not a history**: the row loses the per-attempt error detail on each retry. A separate audit trail for attempts would help troubleshooting (GAP-009).
- **No per-tenant budget or rate limit**: a bug in the system could send thousands of SMS in a loop. Circuit breaker or budget cap is a gap (GAP-003).
- **WhatsApp template pre-approval**: Meta requires pre-approved WhatsApp templates per business number. The platform does not track this approval state per template (GAP-002).
- **Handler-driven notifications rely on appointment context**: if the appointment or its contact is missing data (no email, no phone), the handler silently skips. No audit record of skipped notifications (GAP-001).

## Requirements

### Functional Requirements

All FRs below are `Status: IMPLEMENTED, Source: code` unless otherwise noted.

#### Notification lifecycle

- **FR-001**: System MUST persist every outbound notification as a `Notification` row before dispatching.
- **FR-002**: System MUST enqueue `notification.send` pg-boss jobs with `retryLimit: 0` — internal retry logic handles backoff, not pg-boss.
- **FR-003** (`Status: APPROVED RULE — code diverges`, `implementation decision for provider selection — dossiê names Resend for email and "Twilio ou Zenvia" for SMS but does not mandate specific provider-to-channel binding`): System MUST support three channels: `EMAIL` (currently Resend), `SMS` (approved provider: Mobile Message; current code still uses Twilio until the migration lands), `WhatsApp` (currently Zenvia). Provider selection is hardcoded per channel in Phase 1 — this is an **infrastructure/operational choice**, not a domain rule. Providers may be swapped without a dossiê amendment.
- **FR-004**: System MUST render templates using `{{variable}}` substitution with `payload_json` as the variable source.
- **FR-005**: System MUST look up templates with tenant-specific priority over platform default via `findByTenantCodeChannel(tenant_id OR null, code, channel)`.
- **FR-006**: System MUST fail sending with `TEMPLATE_NOT_FOUND` when neither a tenant-specific nor platform-default template exists.

#### Retry and delivery

- **FR-010**: System MUST retry failed sends up to `MAX_RETRY_COUNT = 6` attempts.
- **FR-011**: System MUST apply exponential backoff with delays `[15s, 45s, 2min, 5min, 15min]` plus ±10% jitter between retries.
- **FR-012**: System MUST persist `next_retry_at` on each retry, and a scheduled `PollRetryableNotificationsUseCase` MUST re-enqueue send jobs when `next_retry_at < now()`.
- **FR-013**: System MUST terminal-fail with `status = FAILED`, `failed_at`, and `failure_reason` when the retry budget is exhausted.
- **FR-014**: System MUST expose `POST /v1/notifications/:id/retry` to manually reset and re-enqueue a failed notification.

#### Provider webhooks

- **FR-020** (`Status: APPROVED RULE — code diverges`): System MUST expose provider-specific webhook endpoints: `/v1/webhooks/resend`, `/v1/webhooks/mobile-message`, `/v1/webhooks/zenvia`. Current code still exposes `/v1/webhooks/twilio` for SMS until the provider migration lands.
- **FR-021**: System MUST always respond `200 { received: true }` to webhooks, even on unknown `provider_message_id`, to prevent provider retry storms.
- **FR-022**: System MUST map provider events to internal states: `delivered → DELIVERED`, `bounced/failed/complained/rejected → FAILED`.
- **FR-023** (`Status: GAP, Source: dossier`): System SHOULD validate provider webhook signatures where supported (Resend, Mobile Message, Zenvia). Currently missing — tracked as GAP-007.

#### Scheduled dispatchers

- **FR-030**: System MUST run `DispatchRemindersUseCase` daily to emit `REMINDER_7_DAYS`, `REMINDER_5_DAYS`, `REMINDER_3_DAYS` for appointments at the matching date offsets.
- **FR-031**: System MUST skip reminders for appointments already notified (idempotency via `existsByAppointmentAndTemplate`).
- **FR-032**: System MUST run `DispatchEscalationsUseCase` to emit `PROPERTY_MANAGER_ESCALATION` when an appointment is not confirmed close to the scheduled date.
- **FR-033**: System MUST skip dispatching when the required contact field is missing (counted in `skipped`).

#### Event-driven handlers

- **FR-040**: System MUST consume appointment state transitions via `notify-on-status-transition.handler.ts` and emit the corresponding template codes (`INSPECTION_NOTICE`, `INSPECTION_CANCELLED`, etc.). **Recipient resolution (feature 021 architectural revision, pending planning)**: the handler MUST resolve the notification recipient from the appointment's **primary contact snapshot** (`appointment_contacts.snapshot_email` where `is_primary = true`), NOT from the live `contacts` registry. Rationale: the snapshot reflects the contact as known when the appointment was linked — this is the address the tenant portal link was sent to, and the address the renter expects to receive communications at. Using the live registry would risk sending to an updated email the renter has not yet verified. When `snapshot_email` is null on the primary contact, the notification is skipped (existing behavior, counted in `skipped` — see GAP-001 and GAP-010).
- **FR-041**: System MUST consume tenant portal actions via `notify-on-tenant-portal-action.handler.ts` and emit `INSPECTION_CONFIRMED`, `INSPECTION_RESCHEDULED`, `INSPECTION_UNAVAILABILITY_REPORTED`. Same recipient resolution rule as FR-040: use the primary contact's `snapshot_email`, not the registry.
- **FR-041b** (`Status: APPROVED RULE, Source: dossier — regras-negocio:241-243 + feature 007 FR-060b`): When the tenant portal reports late unavailability (`urgentMode = true`, after the 7 PM cutoff), the notification handler MUST treat this as a **critical/urgent notification** — immediate delivery to the operator AND the assigned inspector (including WhatsApp per dossiê "enviar notificação ao inspetor via WhatsApp que o serviço foi cancelado"). This is not a routine informational notification; it is an operational escalation requiring immediate triage.
- **FR-042**: System MUST treat handler invocations as fire-and-forget from the caller's perspective — handler failures do not fail the upstream operation.

#### List, read, manage

- **FR-050**: System MUST expose `GET /v1/notifications` (paginated with filters) and `GET /v1/notifications/:id` (detail) for operator troubleshooting.
- **FR-051**: System MUST scope notification reads by tenant for CL and OP roles; only AM may cross-tenant.
- **FR-052**: System MUST expose `PUT /v1/notification-templates/:templateCode/:channel` (upsert) and `GET /v1/notification-templates` (list). AM may manage platform defaults (`tenantId = null`). OP should manage only own-tenant overrides (`implementation decision` — code currently allows OP to edit platform defaults, which grants cross-tenant influence; this should be reviewed against the OP tenant-scoped rule). CL_ADMIN manages own-tenant overrides only.
- **FR-053**: System MUST enforce `UNIQUE (tenant_id, template_code, channel)` on templates.

#### Cross-cutting

- **FR-060**: System MUST validate all notification and template payloads against Zod schemas in `packages/shared/src/schemas/notification.ts`.
- **FR-061**: System MUST ship with templates for 10 event codes listed in `notification.constants.ts`. **9 of these are dossiê-mandated** (`Source: dossier — regras-negocio:270-304`): `INSPECTION_NOTICE`, `REMINDER_7_DAYS`, `REMINDER_5_DAYS`, `REMINDER_3_DAYS`, `PROPERTY_MANAGER_ESCALATION`, `TENANT_SMS_ALERT`, `INSPECTION_CONFIRMED`, `INSPECTION_RESCHEDULED`, `INSPECTION_CANCELLED`. **1 is an implementation addition**: `INSPECTION_UNAVAILABILITY_REPORTED` (added for the tenant portal unavailability flow; operationally important but not listed in the dossiê's "Eventos obrigatórios" section). Missing any of the 9 dossiê-mandated templates is a deployment gap. The 10th is a deployment baseline for the portal flow.

### Non-Functional Requirements

- **NFR-001** (`Status: APPROVED, Source: dossier`): Notification creation p95 < 100 ms (row insert + enqueue).
- **NFR-002** (`Status: APPROVED, Source: dossier`): Send worker p95 < 2 s per notification (dominated by provider round-trip).
- **NFR-003** (`Status: IMPLEMENTED, Source: code`): Retry backoff MUST include jitter (±10%) to avoid thundering herd after provider outages.
- **NFR-004** (`Status: APPROVED, Source: dossier`): Webhook endpoints MUST return 200 in under 500 ms to avoid provider retry.
- **NFR-005** (`Status: APPROVED, Source: dossier`): Recipient data (email, phone) MUST NOT appear in application logs except at `DEBUG` level, and never in production logs.

### Key Entities

- **Notification** — `id`, `tenant_id`, `appointment_id?`, `recipient`, `channel`, `template_code`, `status`, `provider_name?`, `provider_message_id?`, `sent_at?`, `delivered_at?`, `failed_at?`, `failure_reason?`, `payload_json`, `retry_count`, `next_retry_at?`, timestamps.
- **NotificationTemplate** — `id`, `tenant_id?` (null for platform default), `template_code`, `channel`, `subject?`, `body_html?`, `body_text`, `variables_json`, `is_active`, timestamps. Unique on `(tenant_id, template_code, channel)`.
- **Domain services**: `TemplateRendererService` (simple `{{variable}}` renderer), provider interfaces (`IEmailProvider`, `ISmsProvider`, `IWhatsAppProvider`) with real and stub implementations.
- **Constants**: `MANDATORY_TEMPLATE_CODES`, `RETRY_DELAYS`, `MAX_RETRY_COUNT`, `JITTER_FACTOR`.

Full schema in [`data-model.md`](./data-model.md). HTTP contracts in [`contracts/`](./contracts/).

## Success Criteria

- **SC-001**: All 10 mandatory template codes ship with platform-default rows at first boot (seed or migration).
- **SC-002**: Retry backoff sequence asserted by unit test: `15s, 45s, 2min, 5min, 15min` with jitter in bounds.
- **SC-003**: Idempotent reminder dispatch verified by running the dispatcher twice on the same day and asserting no duplicate rows.
- **SC-004**: Provider webhook endpoints return 200 for known and unknown ids.
- **SC-005**: Tenant-specific template overrides platform default at send time.
- **SC-006**: Handler failures from features 006/007 do not fail the upstream operation (integration test).
- **SC-007**: Recipient PII never appears in production logs (CI grep).

## Assumptions

- Provider selection is fixed per channel in Phase 1 (Resend / Mobile Message / Zenvia). Current code still uses Twilio for SMS until the provider migration lands. Multi-provider failover is not in scope.
- Templates use a simple `{{variable}}` substitution. Conditionals, loops, and partials are out of scope.
- Rate limiting per recipient is the provider's responsibility in Phase 1. The platform does not impose its own rate limits.
- WhatsApp template pre-approval with Meta is handled manually by operators outside the platform in Phase 1.
- Unsubscribe / opt-out is not handled in Phase 1. Production readiness requires legal review (GAP-001 regarding consent tracking).

## Known Gaps

> Summary index only. Detail in [`tasks.md`](./tasks.md) under Phase 2.

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Unsubscribe / opt-out management | H | No way for a recipient to stop receiving notifications. Legal risk in several jurisdictions (CAN-SPAM, GDPR, LGPD). Phase 2 work to track consent per recipient + honor opt-outs on send. |
| GAP-002 | WhatsApp template approval tracking | M | Meta requires pre-approved templates per business number. Platform does not track approval state; sending an unapproved template fails opaquely. |
| GAP-003 | Per-tenant budget / rate limit | H | A runaway bug or malicious tenant could send thousands of SMS. Circuit breaker + per-tenant daily cap required for production safety. |
| GAP-004 | Strict variables validation on send | M | `variables_json` in the template is descriptive — not enforced at send time. Missing variables render as empty strings silently. |
| GAP-005 | Proper templating engine | L | Current `{{variable}}` renderer cannot handle conditionals (e.g., "if primaryEmail else primaryPhone"), loops (e.g., restriction lists), or HTML escaping. Consider Handlebars/MJML for email. |
| GAP-006 | Poll-retryable batch cap | L | `PollRetryableNotificationsUseCase` has no batch limit — a large backlog could overwhelm the worker. |
| GAP-007 | Webhook signature validation | H | Webhooks are currently unauthenticated. A malicious caller could forge delivery events. Each provider supports a signature or authenticated callback mechanism (Resend: Svix; Mobile Message: provider-specific webhook authentication to be confirmed in implementation; Zenvia: HMAC). |
| GAP-008 | Handler exception alerting | M | Fire-and-forget handlers silently swallow errors. Operations cannot see when transition-driven notifications fail to enqueue. |
| GAP-009 | Per-attempt audit trail | L | Only the latest failure is persisted on the row. Historical attempts are lost. Helpful for provider dispute investigations. |
| GAP-010 | SMS fallback when email missing | M | Reminder dispatcher skips appointments without email. Product likely wants SMS fallback when phone is present. |
