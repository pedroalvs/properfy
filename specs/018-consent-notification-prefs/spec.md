# Feature Specification: Consent & Notification Preferences

**Feature Branch**: `018-consent-notification-prefs`
**Created**: 2026-04-06
**Feature Status**: **IMPLEMENTED (2026-04-11)** — template classification, send-flow enforcement, HMAC unsubscribe tokens, public unsubscribe/re-opt-in surface, operator consent lookup, operator override with mandatory reason, and per-change audit trail are all delivered and under test. Closes 009#GAP-001. See the "Delivery Outcome" section below for the component-by-component status and residuals.
**Sources**:
- Code: `apps/backend/src/modules/notification/`, `apps/backend/prisma/schema.prisma` (`Notification`, `NotificationTemplate`, `NotificationChannel`)
- Upstream spec: `009-notifications` (delivery, templates, retry, webhooks)
- Cross-feature: `007-tenant-portal` (external recipient access), `015-permissions-rbac-matrix` (operator authority)

> **Reading guide.** This spec covers **notification consent management, unsubscribe flows, and channel preferences**. It sits on top of `009-notifications` which owns the delivery engine, templates, and retry logic. This spec does NOT redefine notification sending mechanics — it owns the consent check that gates delivery and the preference model that recipients control.
>
> **Notification classification.** This spec introduces a formal distinction between notification classes that determines consent rules:
> - **Transactional** — directly related to an active appointment action (confirmation, cancellation, rescheduling). Cannot be opted out of under most legal frameworks.
> - **Operational** — reminders, escalations, scheduling alerts. Default on, but recipients may opt out.
> - **Marketing** — future category for promotional content. Requires explicit opt-in. Out of scope for Phase 1.

## Clarifications

### Session 2026-04-11 (editorial closure after /speckit.implement)

- **Delivery scope confirmed**: every P1/P2/P3 user story in this spec was implemented, tested, and landed on the `015-permissions-rbac-matrix` integration branch. Backend (256 test files / 2681 tests), web (305 test files / 1891 tests), and all-workspace `tsc --noEmit` are green after delivery.
- **Residuals are non-blocking**: all six `GAP-001`..`GAP-006` entries remain **deferred non-blocking**. None of them gate feature 018 closure or downstream work. They are re-classified explicitly in the "Delivery Outcome → Residuals" section below.
- **No FR was reopened** during editorial closure. The scope delivered matches FR-001..FR-020 as written.
- **Compliance posture**: the transactional-delivery invariant (FR-013) is preserved by a strict allowlist in `SendNotificationUseCase` — `TRANSACTIONAL` notifications bypass consent entirely and the four protected template codes are locked as TRANSACTIONAL at upsert time. This is regression-asserted by `send-notification.use-case.test.ts` and the `consent-endpoints.routes.test.ts` integration suite.

### Session 2026-04-10 (editorial closure before /speckit.implement)

- Q: What is the Phase 1 scope for SMS opt-out? → A: **Deferred to GAP-003.** Phase 1 delivers link-based unsubscribe for email/WhatsApp only. SMS operational notifications continue to be delivered without an inline opt-out mechanism. FR-011 rewritten to reflect this. Compliance rationale: low SMS volume, active business relationship, email unsubscribe covers the primary channel.
- Q: Does FR-019 "consent audit queryable by recipient" require a dedicated consent history endpoint? → A: **No.** The operator consent lookup endpoint returns current state. Full audit history is available via the existing `audit_logs` module scoped by `entityType = 'NotificationConsent'`. FR-019 clarified to reflect this reuse.

## User Scenarios & Testing

### User Story 1 — Recipient unsubscribes from operational notifications via email link (Priority: P1)

- **Status**: DELIVERED (2026-04-11) — HMAC-SHA256 token with 30-day expiry (`UnsubscribeTokenService`), server-rendered HTML confirmation page, public `GET` + `POST /v1/notifications/unsubscribe`, audit via `consent.opted_out_via_link`. Covered by `unsubscribe-token.service.test.ts`, `process-unsubscribe.use-case.test.ts`, `render-unsubscribe-page.use-case.test.ts`, and `consent-endpoints.routes.test.ts`.
- **Source**: 009#GAP-001

A renter (tenant/inquilino) receives an inspection reminder email. At the bottom of the email, there is an unsubscribe link. Clicking the link opens a simple web page (no login required) where the renter can opt out of future reminders for the channel that delivered the message. The unsubscribe is effective immediately — the next scheduled reminder for that recipient on that channel is suppressed.

**Why this priority**: Legal compliance blocker. CAN-SPAM, GDPR, and LGPD all require a working unsubscribe mechanism in non-transactional emails. This is the minimum viable consent feature.

**Independent Test**: Send a reminder email to a renter. Click the unsubscribe link. Verify a confirmation page appears. Trigger another reminder for the same renter — verify the email is suppressed and a `SKIPPED_OPT_OUT` record is created instead of a `PENDING` notification.

**Acceptance Scenarios**:

1. **Given** an operational notification email, **When** the recipient views the email, **Then** the footer contains a unique unsubscribe link.
2. **Given** the unsubscribe link, **When** the recipient clicks it, **Then** a public web page opens (no authentication required) showing the channel and notification category, with a "Confirm Unsubscribe" button.
3. **Given** the confirmation page, **When** the recipient confirms, **Then** a consent record is created marking that recipient as opted out for that channel on operational notifications, and a confirmation message is displayed.
4. **Given** an opted-out recipient, **When** the system attempts to send an operational notification on that channel, **Then** the notification is NOT sent. A `SKIPPED_OPT_OUT` log entry is created for audit visibility.
5. **Given** an opted-out recipient, **When** the system attempts to send a **transactional** notification (e.g., appointment confirmation), **Then** the notification IS sent — transactional messages are exempt from opt-out.
6. **Given** an unsubscribe link, **When** it is clicked after the token has expired (30 days), **Then** a "link expired" message is shown with instructions to contact the agency.

---

### User Story 2 — Notification send flow checks consent before delivery (Priority: P1)

- **Status**: DELIVERED (2026-04-11) — `SendNotificationUseCase` branches on the notification's stamped `notificationClass`: TRANSACTIONAL bypasses consent (FR-013), OPERATIONAL calls `consentRepo.findByScope(...)` and transitions to `SKIPPED_OPT_OUT` on opt-out (FR-012), MARKETING is blocked unless an explicit opt-in record exists. Legacy null-class notifications fall back to the template's class. Regression-asserted by `send-notification.use-case.test.ts`.
- **Source**: implementation decision

Before dispatching any operational or marketing notification, the send worker checks whether the recipient has opted out for the given channel. If opted out, the notification is recorded as `SKIPPED_OPT_OUT` and not dispatched. Transactional notifications bypass the consent check entirely.

**Why this priority**: Without enforcement in the send flow, the consent model is decorative. This is the enforcement mechanism.

**Independent Test**: Create a consent record opting out recipient X from EMAIL operational notifications. Trigger an operational email to X — verify it is skipped. Trigger a transactional email to X — verify it is delivered.

**Acceptance Scenarios**:

1. **Given** a notification in `PENDING` status, **When** the send worker processes it, **Then** it first checks the consent store for the recipient + channel + notification class combination.
2. **Given** the recipient has opted out of the notification's class on that channel, **When** checked, **Then** the notification transitions to `SKIPPED_OPT_OUT` without calling any provider. The skip reason is recorded.
3. **Given** the recipient has NOT opted out (or no consent record exists), **When** checked, **Then** the notification proceeds to normal delivery.
4. **Given** a transactional notification (template class = `TRANSACTIONAL`), **When** processed, **Then** the consent check is bypassed entirely — transactional messages are always sent.

---

### User Story 3 — Operator views consent status for a recipient (Priority: P2)

- **Status**: DELIVERED (2026-04-11) — `GET /v1/notifications/consents?recipient=...` with `ListConsentsByRecipientUseCase`. AM must pass `tenantId`; OP is forced to own tenant; CL_ADMIN/CL_USER/INSP receive 403. Response includes all current consent records plus `skippedCount` (notifications with `status = 'SKIPPED_OPT_OUT'`). Frontend surface: `ConsentLookup` component mounted at `/notification-consents` (AM/OP `AuthGuard`).
- **Source**: implementation decision

An operator (AM or OP) can look up the consent/preference status for any recipient (email address or phone number) to troubleshoot delivery issues. The view shows: current opt-in/opt-out status per channel, when the preference was last changed, how it was changed (unsubscribe link, operator override, re-opt-in), and how many notifications were skipped due to opt-out.

**Why this priority**: Operators need visibility to troubleshoot "why didn't the renter get the reminder?" questions.

**Independent Test**: Opt out a recipient. As AM, look up the recipient — verify the consent record shows opt-out status, timestamp, and source. Trigger a skipped notification — verify the skipped count increments.

**Acceptance Scenarios**:

1. **Given** an AM or OP actor, **When** they search for a recipient by email or phone, **Then** the system returns the consent records for that recipient showing: channel, status (opted-in/opted-out), last changed date, change source (unsubscribe_link, operator_override, re_opt_in).
2. **Given** a recipient with skipped notifications, **When** the operator views the consent detail, **Then** they can see the count of notifications skipped due to opt-out.
3. **Given** a CL_ADMIN, CL_USER, or INSP actor, **When** they attempt to look up consent status, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 4 — Operator overrides a recipient's opt-out (Priority: P2)

- **Status**: DELIVERED (2026-04-11) — `POST /v1/notifications/consents/:consentId/override` with `OverrideConsentUseCase`. Mandatory `reason` (Zod `min(1).max(1000)`), tenant-scope enforced via `AuthorizationService.assertTenantScope`, audit via `consent.override_opted_in` with before/after snapshots + actor + reason. Frontend: `ConsentOverrideModal` with mandatory reason textarea and success refetch.
- **Source**: implementation decision

In exceptional cases (e.g., a renter opted out by mistake, or the agency needs to send a critical operational update), an operator can override a recipient's opt-out. The override re-enables delivery for that recipient on that channel and requires a reason. The override is audited.

**Why this priority**: Operational flexibility — prevents a mistaken opt-out from permanently blocking critical notifications.

**Independent Test**: Opt out a recipient. As OP, override the opt-out with reason "Renter requested re-enrollment". Trigger a reminder — verify it is delivered. Verify the audit record shows the override.

**Acceptance Scenarios**:

1. **Given** a recipient who has opted out, **When** an AM or OP actor submits an override with a `reason`, **Then** the consent record is updated to opted-in, the reason is recorded, and an audit record is written.
2. **Given** an override, **When** the recipient subsequently clicks an unsubscribe link again, **Then** they can re-opt-out — the override does not permanently prevent future opt-outs.
3. **Given** an override request without a reason, **When** submitted, **Then** the request fails with a validation error.

---

### User Story 5 — Each notification template declares its notification class (Priority: P1)

- **Status**: DELIVERED (2026-04-11) — `notificationClass` added to `NotificationTemplate` (Prisma column, default `OPERATIONAL`), `UpsertNotificationTemplateUseCase` enforces `PROTECTED_TEMPLATE_CLASSIFICATIONS` and throws `ProtectedTemplateClassificationError` on reclassification attempts. The four protected codes (`INSPECTION_CONFIRMED`, `INSPECTION_RESCHEDULED`, `INSPECTION_CANCELLED`, `INSPECTION_UNAVAILABILITY_REPORTED`) are locked as TRANSACTIONAL. Frontend: `NotificationClassChip` column on the templates table.
- **Source**: implementation decision

Every notification template is classified as `TRANSACTIONAL`, `OPERATIONAL`, or `MARKETING`. The class determines consent rules: transactional notifications bypass consent checks; operational notifications respect opt-out; marketing notifications require explicit opt-in (future). This classification is set when the template is created or updated by an operator.

**Why this priority**: Without classification, the system cannot distinguish which notifications respect opt-out and which are exempt.

**Independent Test**: Classify `INSPECTION_CONFIRMED` as TRANSACTIONAL and `REMINDER_7_DAYS` as OPERATIONAL. Opt out a recipient from OPERATIONAL EMAIL. Send both — verify the confirmation is delivered and the reminder is skipped.

**Acceptance Scenarios**:

1. **Given** a notification template, **When** created or updated, **Then** it MUST have a `notificationClass` field set to `TRANSACTIONAL`, `OPERATIONAL`, or `MARKETING`.
2. **Given** mandatory appointment templates (`INSPECTION_CONFIRMED`, `INSPECTION_RESCHEDULED`, `INSPECTION_CANCELLED`), **When** their class is set, **Then** they MUST be `TRANSACTIONAL` and cannot be changed to OPERATIONAL or MARKETING.
3. **Given** reminder templates (`REMINDER_7_DAYS`, `REMINDER_5_DAYS`, `REMINDER_3_DAYS`), **When** their class is set, **Then** they default to `OPERATIONAL`.
4. **Given** escalation templates (`PROPERTY_MANAGER_ESCALATION`), **When** their class is set, **Then** they default to `OPERATIONAL`.

---

### User Story 6 — Recipient re-subscribes via a re-opt-in link or portal (Priority: P3)

- **Status**: DELIVERED (2026-04-11) — `ReOptInUseCase` + `POST /v1/notifications/re-opt-in` (public, reuses the same HMAC token). The unsubscribe success page renders a "Changed your mind? Re-subscribe" form that POSTs the token back. Audit via `consent.re_opted_in_via_link`. Tenant portal preference page remains deferred per GAP-002.
- **Source**: implementation decision

A recipient who previously opted out may wish to re-subscribe. The confirmation page shown after unsubscribing includes a "Changed your mind? Click here to re-subscribe" link. Alternatively, the tenant portal could show a preference toggle in the future.

**Why this priority**: Lower priority — the unsubscribe mechanism and operator override cover most cases. Self-service re-subscription is a convenience.

**Independent Test**: Opt out a recipient. Click the re-subscribe link on the unsubscribe confirmation page. Verify the consent record is updated to opted-in. Trigger a reminder — verify delivery.

**Acceptance Scenarios**:

1. **Given** the unsubscribe confirmation page, **When** displayed after opt-out, **Then** it includes a "Re-subscribe" link.
2. **Given** the re-subscribe link, **When** clicked, **Then** the consent record is updated to opted-in and an audit record is written with source `re_opt_in`.

---

### Edge Cases

- **Recipient with multiple contact methods**: A renter may have primary_email, secondary_email, primary_phone, secondary_phone. Consent is tracked per **specific contact address per channel**. Opting out of `email:renter@example.com` does not affect `sms:+61400000000`.
- **Same email used across tenants**: A recipient email may appear in appointments across multiple tenants. Consent is scoped per **tenant + recipient + channel** — opting out from tenant A's notifications does not affect tenant B.
- **Template class change**: If an operator reclassifies a template from OPERATIONAL to TRANSACTIONAL, previously skipped notifications are not retroactively sent. The class change only affects future sends.
- **Unsubscribe link in SMS**: SMS messages typically cannot contain clickable unsubscribe links due to character limits. For SMS opt-out, the message includes a reply instruction (e.g., "Reply STOP to opt out") or a shortened URL. The chosen mechanism depends on the SMS provider's capabilities.
- **Inspector and property manager notifications**: Inspectors and property managers are considered **operational personnel**. Their notifications are classified as TRANSACTIONAL (directly tied to assignment/scheduling) and are exempt from opt-out. They cannot unsubscribe from appointment-related notifications.
- **Notification already in PENDING when opt-out recorded**: If a notification is already queued (PENDING) when the recipient opts out, the send worker catches the opt-out at send time and transitions to `SKIPPED_OPT_OUT`.
- **Bulk re-opt-in**: No bulk mechanism for re-subscribing multiple recipients at once. Operators override one recipient at a time.

## Requirements

### Functional Requirements

#### Consent Model

- **FR-001**: The system MUST track consent per **tenant + recipient address + channel** combination. A recipient may have different preferences per channel (email, SMS, WhatsApp) and per tenant.
- **FR-002**: The default consent status for all recipients MUST be **opted-in**. Recipients are assumed consenting until they explicitly opt out.
- **FR-003**: Consent MUST be classified by notification class: `TRANSACTIONAL`, `OPERATIONAL`, `MARKETING`. Opt-out applies to a specific class on a specific channel. Phase 1 scope: only `OPERATIONAL` opt-out is supported. `MARKETING` opt-in tracking is a future gap.

#### Notification Classification

- **FR-004**: Every notification template MUST declare a `notificationClass`: `TRANSACTIONAL`, `OPERATIONAL`, or `MARKETING`.
- **FR-005**: The following templates MUST be permanently classified as `TRANSACTIONAL` (exempt from opt-out): `INSPECTION_CONFIRMED`, `INSPECTION_RESCHEDULED`, `INSPECTION_CANCELLED`, `INSPECTION_UNAVAILABILITY_REPORTED`.
- **FR-006**: Reminder and escalation templates MUST default to `OPERATIONAL` (subject to opt-out): `REMINDER_7_DAYS`, `REMINDER_5_DAYS`, `REMINDER_3_DAYS`, `PROPERTY_MANAGER_ESCALATION`, `INSPECTION_NOTICE`, `TENANT_SMS_ALERT`.
- **FR-007**: `MARKETING` class requires explicit opt-in from the recipient. No marketing templates exist in Phase 1.

#### Unsubscribe Flow

- **FR-008**: Operational notification emails MUST include an unsubscribe link in the footer. The link MUST contain a unique, time-limited token (30-day expiry) that identifies the recipient, channel, tenant, and notification class.
- **FR-009**: The unsubscribe endpoint MUST be public (no authentication required) and MUST display a confirmation page before recording the opt-out.
- **FR-010**: On confirmation, the system MUST create or update a consent record marking the recipient as opted-out for that channel and class, and MUST write an audit record with source `unsubscribe_link`.
- **FR-011** (`PHASE 1 SCOPE — email/WhatsApp link-based opt-out only; SMS deferred`): Phase 1 delivers the unsubscribe link mechanism for **email** (and, where templates exist, WhatsApp). **SMS opt-out is explicitly deferred to GAP-003 of 018 and is NOT in scope for Phase 1.** Rationale: reply-keyword handling (e.g., "STOP") is provider-dependent (Mobile Message / Twilio), and URL-based SMS opt-out would require adding a shortened URL to every operational SMS body, which is a Phase 2 enhancement. Phase 1 operational SMS notifications continue to be delivered without an inline opt-out mechanism — the overall compliance posture is acceptable because (a) SMS volume is low and constrained to scheduling reminders, (b) the recipient has an active business relationship (scheduled inspection), and (c) the email unsubscribe covers the primary channel. This FR will be revisited when GAP-003 is prioritized.

#### Delivery Gating

- **FR-012**: The notification send worker MUST check consent before dispatching any `OPERATIONAL` or `MARKETING` notification. If the recipient is opted out for the relevant channel and class, the notification MUST be recorded as `SKIPPED_OPT_OUT` without calling any provider.
- **FR-013**: `TRANSACTIONAL` notifications MUST bypass the consent check entirely and always be delivered.
- **FR-014**: Skipped notifications MUST be visible in the notification list with a `SKIPPED_OPT_OUT` status and the reason for suppression.

#### Operator Visibility & Override

- **FR-015**: AM and OP actors MUST be able to look up consent status for any recipient by email or phone number. The lookup MUST return: channel, status, last changed date, change source, and count of skipped notifications.
- **FR-016**: AM and OP actors MUST be able to override a recipient's opt-out, requiring a mandatory `reason`. The override re-enables delivery and is audited.
- **FR-017**: CL_ADMIN, CL_USER, and INSP actors MUST NOT have access to consent management endpoints.

#### Audit

- **FR-018**: Every consent change (opt-out, re-opt-in, operator override) MUST produce an audit record with: recipient, channel, class, old status, new status, source (unsubscribe_link, operator_override, re_opt_in), actor (if operator), and timestamp.
- **FR-019** (`CLARIFIED 2026-04-10`): Consent state MUST be queryable by recipient for troubleshooting. The operator consent lookup endpoint (`GET /v1/notifications/consents?recipient=...`) returns the current consent records for each channel/class, showing the most recent change source, changedAt, changedByUserId, and reason. **Full audit history** (timeline of all consent changes for a recipient) is accessible via the existing platform audit log module, scoped by `entityType = 'NotificationConsent'` and the consent record IDs returned by the lookup. Phase 1 does NOT build a dedicated consent history endpoint — the operator lookup returns current state only, and historical records are read from the existing `audit_logs` infrastructure.

#### Personnel Exemptions

- **FR-020**: Notifications to inspectors and property managers about their assignments/scheduling MUST be classified as `TRANSACTIONAL` and exempt from opt-out. Operational personnel cannot unsubscribe from work-related notifications.

### Key Entities

- **NotificationConsent** — Tracks opt-in/opt-out status per tenant + recipient address + channel + notification class. Key attributes: `tenantId`, `recipient` (email or phone), `channel` (EMAIL/SMS/WHATSAPP), `notificationClass` (TRANSACTIONAL/OPERATIONAL/MARKETING), `status` (OPTED_IN/OPTED_OUT), `changedAt`, `changeSource` (unsubscribe_link/operator_override/re_opt_in), `reason` (for operator overrides).
- **NotificationClass** (enum on template) — Classification added to `NotificationTemplate`: `TRANSACTIONAL` (always send), `OPERATIONAL` (respect opt-out), `MARKETING` (require opt-in, future).
- **UnsubscribeToken** (runtime, not persisted) — A signed, time-limited token embedded in email footer links. Encodes: recipient, channel, tenantId, notificationClass. Validated on the public unsubscribe endpoint. 30-day expiry.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of operational notification emails include a working unsubscribe link — verified by template audit and E2E test.
- **SC-002**: An opted-out recipient receives zero operational notifications on the opted-out channel — verified by integration test that creates opt-out, triggers 3 notifications, and asserts all 3 are `SKIPPED_OPT_OUT`.
- **SC-003**: Transactional notifications are always delivered regardless of opt-out status — verified by integration test.
- **SC-004**: Operators can look up any recipient's consent status in under 5 seconds — verified by E2E test.
- **SC-005**: Every consent change produces exactly one audit record — verified by integration test.
- **SC-006**: Unsubscribe flow completes in under 3 clicks (open email -> click link -> confirm) — verified by UX walkthrough.
- **SC-007**: Re-subscribe flow is available from the unsubscribe confirmation page — verified by E2E test.

## Assumptions

- The default consent model is **opt-out** (recipients are consenting by default and may unsubscribe). This matches CAN-SPAM and LGPD requirements for transactional/operational messaging where the recipient has an existing business relationship (appointment scheduled).
- **Marketing notifications do not exist in Phase 1.** The `MARKETING` class is defined in the model for future use but no templates or opt-in flows are built now.
- Unsubscribe tokens use the same signing/hashing pattern as tenant portal tokens (SHA-256, time-limited, no persistent storage). The token encodes enough information to identify the consent scope without a database lookup.
- **Inspector and property manager notifications are exempt from opt-out** because they are operational personnel whose notifications are directly tied to work assignments. This is an implementation decision, not a legal requirement.
- Consent is scoped per **tenant + recipient + channel**. A recipient who appears in multiple tenants has independent consent per tenant. This prevents one agency's unsubscribe from affecting another.
- The `SKIPPED_OPT_OUT` status is a new value added to the `NotificationStatus` enum. It is a terminal status (the notification was never sent and will not be retried).
- SMS opt-out is provider-dependent. Mobile Message supports unsubscribe blocking and opt-out handling at the provider level; if reply-based opt-out is not sufficient for the product flow, a shortened URL is used instead.
- WhatsApp opt-out follows the same model as email — a link in the message body. WhatsApp Business API may have its own opt-out mechanisms that should be honored as well.
- No bulk preference import/export exists. Consent is managed individually per recipient.

## Delivery Outcome (2026-04-11)

This section is the editorial record of what landed. It is append-only and must not modify the FRs or user-story acceptance criteria above.

### Components delivered

| Capability | Status | Primary call sites |
|---|---|---|
| Template classification (`notificationClass` on `NotificationTemplate`) | ✅ delivered | `UpsertNotificationTemplateUseCase`, `PROTECTED_TEMPLATE_CLASSIFICATIONS` map in `notification.constants.ts`, shared `NotificationClass` enum |
| Classification stamped on each `Notification` at create time | ✅ delivered | `CreateNotificationUseCase` (reads from the resolved template) |
| Send-flow consent enforcement with transactional bypass | ✅ delivered | `SendNotificationUseCase` — strict allowlist: TRANSACTIONAL → dispatch, OPERATIONAL → `consentRepo.findByScope`, MARKETING → blocked unless opted in |
| `SKIPPED_OPT_OUT` terminal status on skipped notifications | ✅ delivered | `NotificationStatus` enum (shared + Prisma), surfaced via `GET /v1/notifications` |
| Unsubscribe token service (HMAC-SHA256, 30-day expiry, timing-safe compare) | ✅ delivered | `UnsubscribeTokenService` (domain service) |
| `unsubscribeUrl` injection into OPERATIONAL email render context | ✅ delivered | `SendNotificationUseCase` → Handlebars context |
| Operational email templates carry the unsubscribe footer | ✅ delivered | `prisma/seed.ts` — `OP_EMAIL_FOOTER` appended to `INSPECTION_NOTICE`, `REMINDER_7/5/3_DAYS`, `PROPERTY_MANAGER_ESCALATION`. Protected TRANSACTIONAL templates intentionally do not |
| Public `GET /v1/notifications/unsubscribe` (HTML confirmation page) | ✅ delivered | `RenderUnsubscribePageUseCase` + `unsubscribe-page.html` + `unsubscribe-page.renderer.ts` |
| Public `POST /v1/notifications/unsubscribe` (JSON or form body) with audit | ✅ delivered | `ProcessUnsubscribeUseCase` — `consent.opted_out_via_link` audit |
| Public `POST /v1/notifications/re-opt-in` (same token flow) with audit | ✅ delivered | `ReOptInUseCase` — `consent.re_opted_in_via_link` audit |
| Form-urlencoded body parser for the HTML form POSTs | ✅ delivered | Inline parser registered in `main/plugins.ts` |
| Operator `GET /v1/notifications/consents` lookup | ✅ delivered | `ListConsentsByRecipientUseCase` — AM/OP gated, OP scoped to own tenant |
| Operator `POST /v1/notifications/consents/:id/override` with mandatory reason | ✅ delivered | `OverrideConsentUseCase` — `consent.override_opted_in` audit with before/after snapshots |
| Per-change audit trail (4 distinct actions) | ✅ delivered | `consent.opted_out_via_link`, `consent.re_opted_in_via_link`, `consent.override_opted_in`, authorization denials |
| Frontend `NotificationClassChip` + template table column | ✅ delivered | `apps/web/src/features/notification-templates/components/` |
| Frontend `ConsentLookup` + `ConsentOverrideModal` + `useConsentLookup` hook | ✅ delivered | `apps/web/src/features/notification-consents/` — mounted at `/notification-consents` (AM/OP `AuthGuard`) |

### Verification evidence

- Backend: **2681 tests passing** across 256 test files after delivery (including the 20 mock-container integration tests in `consent-endpoints.routes.test.ts`).
- Web: **1891 tests passing** across 305 test files after delivery.
- `pnpm typecheck` clean across all workspaces (backend, web, pwa, shared).
- Backend lint: feature 018 code is lint-clean; unrelated pre-existing errors in other modules are untouched by this feature.

### Residuals

All residuals are classified **deferred non-blocking** — none gate 018 closure and none regress the transactional-delivery invariant.

| ID | Title | Classification | Note |
|---|---|---|---|
| GAP-001 | Marketing opt-in collection flow | **deferred non-blocking** | `MARKETING` enum value + send-flow branch are already implemented (MARKETING is blocked unless an explicit opt-in record exists). What is deferred is the opt-in collection surface. No MARKETING templates exist in Phase 1, so the branch is effectively dead code until the surface is built. |
| GAP-002 | Tenant portal preference page | **deferred non-blocking** | Self-service via the email unsubscribe link is sufficient for compliance. A portal toggle is a UX convenience. |
| GAP-003 | SMS provider opt-out integration (STOP keyword) | **deferred non-blocking** | Explicitly out of Phase 1 scope per FR-011 and the 2026-04-10 clarification. Email unsubscribe covers the primary channel; SMS volume is low and constrained to scheduling reminders on an active business relationship. |
| GAP-004 | WhatsApp Business opt-out integration | **deferred non-blocking** | Phase 1 delivers the in-platform consent model. Honoring provider-level WhatsApp opt-outs is additive. |
| GAP-005 | Consent data export for compliance (GDPR/LGPD) | **deferred non-blocking** | Audit history is already queryable via the existing `audit_logs` module scoped by `entityType = 'NotificationConsent'` (see FR-019 clarification). A dedicated export endpoint is additive when a compliance request actually arrives. |
| GAP-006 | Bulk preference management | **deferred non-blocking** | Operators can override one recipient at a time through the UI. Bulk tooling is an ops convenience, not a compliance gate. |

There are **no partial-coverage residuals** within the FRs delivered — every FR-001..FR-020 is wired end-to-end. There are **no follow-up polish items** blocking downstream features.

### Out of editorial scope

This closure is documentation-only. It does not reopen any FR, does not add new gaps beyond the six already listed, and does not change the compliance posture (FR-011 SMS deferral and FR-019 audit-history-via-existing-logs both stand).

---

## Known Gaps

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Marketing opt-in flow | M | `MARKETING` class defined but no opt-in collection mechanism. Needed before any promotional notifications can be sent. Classified `deferred non-blocking` in the Delivery Outcome section above. |
| GAP-002 | Tenant portal preference page | L | Renters could manage preferences via the portal (toggle per channel). Currently, the only self-service mechanism is the email unsubscribe link. Classified `deferred non-blocking`. |
| GAP-003 | SMS provider opt-out integration | M | Depends on Mobile Message unsubscribe behavior and webhook integration being wired correctly. If provider-level opt-out is insufficient for the desired UX, falls back to URL-based opt-out. Requires provider-specific configuration. Classified `deferred non-blocking`. |
| GAP-004 | WhatsApp Business opt-out integration | L | WhatsApp Business API may have its own consent mechanisms. The platform should honor provider-level opt-outs in addition to its own consent model. Classified `deferred non-blocking`. |
| GAP-005 | Consent data export for compliance | L | GDPR/LGPD may require exporting all consent data for a specific recipient on request. No export endpoint exists. Classified `deferred non-blocking`. |
| GAP-006 | Bulk preference management | L | No mechanism for operators to manage consent for multiple recipients at once (e.g., after a data correction). Classified `deferred non-blocking`. |
