# Feature Specification: Tenant Portal

**Feature Branch**: `007-tenant-portal`
**Created**: 2026-04-05
**Feature Status**: IMPLEMENTED — Phase 1 shipped; Phase 2 gaps closed in commit `4188fe8` (2026-04-07, Waves 1–4). The `tenant_portal_activities` surface is brought under the feature 020 retention + redaction framework. Editorial reconciliation 2026-04-13. See `specs/GAPS.md` for the gap status table.
**Sources**:
- Code: `apps/backend/src/modules/tenant-portal/**`, `apps/backend/prisma/schema.prisma`, `packages/shared/src/schemas/tenant-portal.ts`, `apps/web/src/features/tenant-portal/**`
- Approved rules: `.specify/memory/constitution.md`, `CLAUDE.md`, `projeto-consolidado/regras-negocio-respostas-cliente.md`
- Legacy specs (to be superseded on approval): `specs/backend/tenant-portal.spec.md`, `specs/web/tenant-portal.spec.md`

> **Terminology warning.** In this feature, "tenant" means the **property renter** (inquilino) — the person living in the property being inspected — NOT the real-estate agency (which the rest of the platform calls "tenant"). The portal is the inquilino-facing surface for confirming, rescheduling, and updating details about an upcoming inspection, accessed via a unique tokenized link (no user account, no JWT).
>
> **Reading guide.** Every user story declares `Priority`, `Status`, `Source`. Status: `IMPLEMENTED` | `APPROVED` | `GAP`. Source: `code` | `dossier` | `inferred`.

## User Scenarios & Testing

### User Story 1 — Operator generates a portal link for an appointment

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

An AM or OP user generates a unique one-time portal token for a specific appointment. The system revokes any existing tokens for that appointment, generates a 32-byte raw token, stores only the SHA-256 hash, computes expiry as 7 PM of the day before the scheduled date in the tenant's timezone, and enqueues EMAIL and SMS notifications (template `TENANT_PORTAL_LINK`) to the renter contact on file. The raw token is returned to the caller exactly once and never stored in plaintext.

**Why this priority**: Every other flow in this feature depends on a valid portal token existing. Without it, renters cannot confirm or reschedule.

**Independent Test**: As an OP user, call `POST /v1/appointments/:appointmentId/portal-token`. Confirm (a) the response returns `rawToken` and `expiresAt`, (b) `tenant_portal_tokens` has exactly one ACTIVE row for this appointment (any prior tokens are REVOKED), (c) an audit record `tenant_portal.token_generated` is written, (d) a notification is enqueued for each contact channel present (email, phone).

**Acceptance Scenarios**:

1. **Given** an AM or OP actor and an appointment, **When** they call `POST /v1/appointments/:appointmentId/portal-token`, **Then** a new token is created in `ACTIVE` with the computed `expires_at`, previous tokens for that appointment are marked `REVOKED`, and the raw token is returned only in this response.
2. **Given** any non-AM/OP actor, **When** they call the endpoint, **Then** the request is rejected with `FORBIDDEN`.
3. **Given** an OP actor and an appointment outside their own tenant, **When** they call the endpoint, **Then** the lookup uses their tenant scope and returns `APPOINTMENT_NOT_FOUND` for cross-tenant appointments.
4. **Given** an appointment with a renter email, **When** the token is created, **Then** a notification is enqueued via `CreateNotificationUseCase` with channel `EMAIL` and `templateCode = TENANT_PORTAL_LINK`.
5. **Given** an appointment with a renter phone, **When** the token is created, **Then** a notification is enqueued with channel `SMS`.
6. **Given** a tenant with `timezone = Australia/Sydney` and a `scheduledDate = 2026-05-12`, **When** the token is created, **Then** `expires_at` equals `2026-05-11 19:00` local Sydney time converted to UTC.

---

### User Story 2 — Renter loads the portal via the unique link

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

A renter clicks the unique link in their email or SMS. The portal fetches the appointment summary (scheduled date, time slot, property address, agency name, current confirmation status, existing restrictions, current contact). If the token has expired (past the 7 PM cutoff), the portal enters **restricted mode** (`isReadOnly = true`): confirm, reschedule, and contact update are blocked, but the renter may still **report unavailability** as a late emergency exception (`Source: dossier — regras-negocio:241-243 "autorizar rejeição de urgência"`; see US6). If the token has been revoked, the portal returns an error page.

**Why this priority**: This is the entry point for every renter interaction. It also feeds the portal UI state (confirm / reschedule buttons enabled vs. disabled).

**Independent Test**: Generate a token, call `GET /v1/tenant-portal/:token` with a random IP and user agent. Confirm (a) the response contains appointment metadata, (b) an `isReadOnly` flag reflects token status, (c) `last_accessed_at` is updated.

**Acceptance Scenarios**:

1. **Given** a valid ACTIVE token, **When** the renter calls `GET /v1/tenant-portal/:token`, **Then** the response carries appointment summary, agency info, current confirmation status, and `isReadOnly = false`.
2. **Given** a token whose `expires_at < now()`, **When** the portal is loaded, **Then** the middleware marks the token `EXPIRED`, updates the DB, and the response carries `isReadOnly = true`.
3. **Given** a token already in `EXPIRED` status, **When** the portal is loaded, **Then** `isReadOnly = true` and no DB update is needed.
4. **Given** a `REVOKED` token, **When** the portal is accessed, **Then** the request fails with `PORTAL_TOKEN_REVOKED` (HTTP 410).
5. **Given** an unknown token (not found by hash), **When** the portal is accessed, **Then** the request fails with `PORTAL_TOKEN_INVALID` (HTTP 404).
6. **Given** more than 30 GET requests per minute from the same IP, **When** the next arrives, **Then** it is rate-limited (429).

---

### User Story 3 — Renter confirms the appointment

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

The renter taps "Confirm" on the portal. Optionally they can include restrictions (whether they will be home, unavailable days/hours, notes). The platform flips `tenantConfirmationStatus` from `PENDING` to `CONFIRMED`, clears any stale restrictions from earlier cycles, persists the new restrictions with `source = TENANT_PORTAL`, records a `CONFIRM` activity with the previous/new snapshot + IP + user agent, writes an audit record with `actorType = ANONYMOUS`, and fires a notification side effect.

**Independent Test**: Start with a `PENDING` appointment, call `POST /v1/tenant-portal/:token/confirm`. Confirm (a) the appointment now has `tenantConfirmationStatus = CONFIRMED`, (b) an activity row exists, (c) an audit record with `actorType = ANONYMOUS` exists. Call again → expect idempotent success with no additional activity record.

**Acceptance Scenarios**:

1. **Given** a renter with an ACTIVE token and an appointment in `PENDING`, **When** they `POST /v1/tenant-portal/:token/confirm` (optionally with restrictions), **Then** confirmation is recorded, stale restrictions are replaced, an activity and an audit log are written.
2. **Given** an already-CONFIRMED appointment, **When** the renter calls confirm again, **Then** the operation is idempotent — it returns success without creating another activity record.
3. **Given** an EXPIRED token (read-only mode), **When** the renter calls confirm, **Then** the request fails with `PORTAL_ACTION_BLOCKED`.
4. **Given** an appointment in `CANCELLED`, `DONE`, or `REJECTED`, **When** confirm is called, **Then** the request fails with `PORTAL_APPOINTMENT_INACTIVE`.
5. **Given** any side-effect handler (notification) that throws, **When** confirmation succeeds, **Then** the main operation is not rolled back (fire-and-forget).

---

### User Story 4 — Renter requests a reschedule

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

The renter proposes a new date and time slot through the portal. The platform validates that (a) the service type is `ROUTINE` (only routine inspections are reschedulable by the renter — INGOING and OUTGOING follow operator flows), (b) there is no active inspection execution in progress, (c) the new date is not in the past, (d) the new date is within 30 days of the original. On success, the appointment's `scheduledDate` and `timeSlot` are updated, `tenantConfirmationStatus` is reset to `PENDING` (restart of the confirmation cycle), existing tokens are **revoked** so the operator must generate a new link for the new date, and restrictions are optionally replaced.

**Independent Test**: Reschedule an appointment to a date 10 days later with a different time slot. Confirm (a) `scheduledDate` and `timeSlot` are updated, (b) `tenantConfirmationStatus = PENDING`, (c) old tokens are revoked, (d) an activity and audit record are written.

**Acceptance Scenarios**:

1. **Given** an ACTIVE token, a `ROUTINE` appointment with no active execution, and a valid future date within 30 days, **When** the renter calls `POST /v1/tenant-portal/:token/reschedule`, **Then** the appointment is updated, confirmation resets to `PENDING`, all tokens for the appointment are revoked, and an activity + audit are written.
2. **Given** a non-ROUTINE service type (`INGOING` or `OUTGOING`), **When** reschedule is attempted, **Then** the request fails with `PORTAL_RESCHEDULE_NOT_ALLOWED`.
3. **Given** an inspection execution already in progress, **When** reschedule is attempted, **Then** the request fails with `PORTAL_INSPECTION_IN_PROGRESS`.
4. **Given** a new date in the past, **When** submitted, **Then** the request fails with `PORTAL_DATE_IN_PAST`.
5. **Given** a new date more than 30 days from the original `scheduledDate`, **When** submitted, **Then** the request fails with `PORTAL_RESCHEDULE_WINDOW_EXCEEDED`.
6. **Given** an EXPIRED token, **When** reschedule is attempted, **Then** the request fails with `PORTAL_ACTION_BLOCKED`.
7. **Given** a successful reschedule, **When** the renter returns with the old link, **Then** the old token is `REVOKED` — the operator must generate a new link for the new date.

---

### User Story 5 — Renter updates contact details

- **Priority**: P2
- **Status**: IMPLEMENTED (Feedback Round 2026-04-13 + feature 021 architectural revision extends the update semantics — pending planning)
- **Source**: code + architectural-review

The renter corrects their name, emails, or phones through the portal. At least one contact field must be present after the update. Activity and audit are recorded.

**Feature 021 architectural revision — dual-write semantics** (NEW, pending planning):

When the renter updates their contact details via the portal, the system MUST update **both** the appointment snapshot and the contact registry:

1. **Appointment snapshot** (`appointment_contacts.snapshot_name`, `snapshot_email`, `snapshot_phone`): updated immediately. This ensures the appointment record reflects the renter's corrected data for notifications and audit.
2. **Contact registry** (`contacts.display_name`, `primary_email`, `primary_phone`): updated when `contact_id IS NOT NULL` on the junction row. If the junction row is a legacy row (`contact_id = NULL`), only the snapshot is updated (no registry write).

**Rationale**: the renter is correcting **their own data** — this is not an external system updating a record on behalf of someone else. The correction should propagate to the registry so the agency sees the latest contact info on future appointments. This is the only code path that updates both snapshot and registry. All other snapshot writes are frozen at link time.

**Conflict handling**: if the renter updates `primary_email` to a value that already exists on another active contact in the same tenant, the registry update is **skipped silently** (the snapshot still updates). The system does NOT fail the portal action — portal UX must remain frictionless. An audit record `contact.portal_update_skipped_conflict` is written so operators can reconcile manually.

**Independent Test**: Update primary email via portal. Confirm (a) the appointment snapshot reflects the change, (b) the registry contact reflects the change (when `contact_id` is present), (c) an activity record with `action = CONTACT_UPDATED` exists, (d) an existing appointment for the same contact in a different appointment still has the OLD snapshot.

**Acceptance Scenarios**:

1. **Given** an ACTIVE token and a valid partial contact payload, **When** the renter calls `PATCH /v1/tenant-portal/:token/contact`, **Then** the appointment snapshot fields are updated, the registry contact is updated (if `contact_id` is present), and activity + audit are written.
2. **Given** a payload that would leave all contact fields empty, **When** submitted, **Then** the request fails with `PORTAL_NO_CONTACT_FIELDS`.
3. **Given** an EXPIRED token, **When** update is attempted, **Then** the request fails with `PORTAL_ACTION_BLOCKED`.
4. **Given** a registry contact update where the new `primary_email` conflicts with another active contact in the same tenant, **When** submitted, **Then** the snapshot updates normally but the registry update is skipped. An audit record `contact.portal_update_skipped_conflict` is written.

---

### User Story 6 — Renter reports unavailability

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

The renter reports they will not be home or cannot accommodate the original slot — without proposing a new date. The appointment's confirmation status moves to `UNAVAILABLE`, restrictions (if provided) are persisted, and an activity + audit record are written so operations can reach out.

**This is the ONLY mutation permitted after the 7 PM cutoff** (`Source: dossier — regras-negocio:241-243`). When called after the cutoff (token EXPIRED / `isReadOnly = true`), the action is flagged as `urgentMode = true` in the audit metadata and triggers immediate notifications to the operator and the assigned inspector. The portal does NOT decide the appointment's final fate — `OP/AM` decides whether to maintain, reschedule, cancel, or reject the appointment based on the unavailability signal.

**Independent Test**: (1) With an ACTIVE token, report unavailability → confirm `tenantConfirmationStatus = UNAVAILABLE`. (2) With an EXPIRED token, report unavailability → confirm it **succeeds** with `urgentMode = true` and notifications are triggered.

**Acceptance Scenarios**:

1. **Given** an ACTIVE token and a `PENDING` or `CONFIRMED` appointment, **When** the renter calls `POST /v1/tenant-portal/:token/unavailable`, **Then** `tenantConfirmationStatus` becomes `UNAVAILABLE`, optional restrictions are persisted, activity + audit are written with `urgentMode = false`.
2. **(Late emergency exception)** **Given** an EXPIRED token (after cutoff), **When** the renter calls `POST /v1/tenant-portal/:token/unavailable`, **Then** the action **succeeds** (unlike confirm/reschedule/contact-update which are blocked). `tenantConfirmationStatus` becomes `UNAVAILABLE`, the audit carries `urgentMode = true`, and immediate notifications are sent to the operator and the assigned inspector for urgent triage. The portal does NOT determine the final operational outcome — `OP/AM` decides the appointment's fate.
3. **Given** an inactive appointment (`CANCELLED`, `DONE`, or `REJECTED`), **When** the endpoint is called, **Then** the request fails with `PORTAL_APPOINTMENT_INACTIVE`.
4. **Given** an inspection already started (execution in progress), **When** the endpoint is called, **Then** the request fails with `PORTAL_INSPECTION_ALREADY_STARTED`.

---

### Edge Cases

- **Tokens never in plaintext at rest**: the raw 32-byte token is returned exactly once (on generation). The database stores only SHA-256 hashes. The middleware re-hashes the incoming URL parameter for lookup.
- **Restricted mode for expired tokens** (not fully "read-only"): the portal UX still loads an expired token so renters can see the appointment context. Confirm, reschedule, and contact update are blocked. **UNAVAILABLE is the exception** — it is the only mutation allowed after the cutoff, flagged as `urgentMode = true` for immediate operator/inspector notification. The portal does not finalize the appointment's fate; `OP/AM` decides the outcome.
- **Portal authority limit**: the portal can signal unavailability but CANNOT directly cancel, reject, or reschedule after the cutoff. The desfecho (`maintain`, `reschedule`, `cancel`, `reject`) is always an operator decision (`OP/AM`). `tenantConfirmationStatus = UNAVAILABLE` is a signal, not a terminal resolution.
- **Revoked tokens are terminal**: once revoked, a token never reactivates. A new token must be generated by an operator.
- **Reschedule revokes all tokens for the appointment**: after a reschedule, the old link is dead. The operator must generate a new link to start the next confirmation cycle.
- **Confirm resets stale restrictions**: if the renter previously submitted unavailability restrictions and then confirms, the old restrictions are deleted and replaced with whatever confirm payload carries (possibly none).
- **Audit `actorType = ANONYMOUS`**: because the portal is token-auth, there is no `userId` for the caller. Downstream analytics on audit logs must handle this actor type.
- **Cutoff expiry in tenant timezone**: expiry is computed as 7 PM local-time on the day before the scheduled date, in the tenant's `timezone` setting. This is more user-friendly than UTC, but reviewers changing the `TokenService.computeExpiresAt` logic must ensure correctness across DST transitions (the current implementation uses `Intl.DateTimeFormat` to measure the offset).
- **Rate limit 30/min per IP**: applies to every portal endpoint. Sufficient for normal use, but tight enough to discourage scraping.
- **Middleware sets `last_accessed_at`**: via a repository side effect during token lookup (verify the implementation detail during the review of `PrismaTenantPortalTokenRepository`).

## Requirements

### Functional Requirements

All FRs below are `Status: IMPLEMENTED, Source: code` unless otherwise noted.

#### Token Generation

- **FR-001**: System MUST restrict `POST /v1/appointments/:appointmentId/portal-token` to AM and OP.
- **FR-002**: System MUST revoke all existing tokens for an appointment when a new one is generated.
- **FR-003**: System MUST generate 32 raw bytes of cryptographic randomness encoded as hex and store only its SHA-256 hash. The raw token is returned exactly once and never logged.
- **FR-004**: System MUST compute `expires_at` as 7 PM local-time on the day before `scheduledDate` in the tenant's configured timezone, converted to UTC.
- **FR-005**: System MUST enqueue EMAIL and/or SMS notifications (`templateCode = TENANT_PORTAL_LINK`) to the appointment's contact details on token generation.
- **FR-006**: System MUST audit `tenant_portal.token_generated` with `tenantId`, the token id, and metadata including `appointmentId` and `expiresAt`.

#### Token Validation (Middleware)

- **FR-010**: System MUST hash the incoming `:token` URL parameter via SHA-256 and look up the token by hash.
- **FR-011**: System MUST reject unknown tokens with `PORTAL_TOKEN_INVALID` (404) and revoked tokens with `PORTAL_TOKEN_REVOKED` (410).
- **FR-012**: System MUST auto-transition `ACTIVE → EXPIRED` when access occurs after `expires_at`. The access continues in read-only mode.
- **FR-013**: System MUST expose `request.portalContext` with `{ tokenId, appointmentId, isReadOnly, tokenStatus, expiresAt }` for downstream handlers.
- **FR-014**: System MUST apply a 30 req/min rate limit per client to every portal endpoint.

#### Portal Data (Read)

- **FR-020**: System MUST return appointment summary, agency info, contact, restriction, and confirmation status on `GET /v1/tenant-portal/:token`. `isReadOnly` reflects the token status.

#### Confirm

- **FR-030**: System MUST block confirm when `isReadOnly = true` (`PORTAL_ACTION_BLOCKED`).
- **FR-031**: System MUST block confirm when the appointment status is `CANCELLED`, `DONE`, or `REJECTED` (`PORTAL_APPOINTMENT_INACTIVE`).
- **FR-032**: System MUST set `tenantConfirmationStatus = CONFIRMED` and record a `CONFIRM` activity with IP + user agent.
- **FR-033**: System MUST be idempotent when the appointment is already `CONFIRMED` — return success without recording a duplicate activity.
- **FR-034**: System MUST delete any existing restrictions before persisting the new ones, scoped to the appointment.
- **FR-035**: System MUST persist new restrictions with `source = TENANT_PORTAL`.
- **FR-036**: System MUST audit `tenant_portal.appointment_confirmed` with `actorType = ANONYMOUS`.

#### Reschedule

- **FR-040**: System MUST block reschedule when `isReadOnly = true`.
- **FR-041**: System MUST allow reschedule only for `ROUTINE` service types. `INGOING` and `OUTGOING` fail with `PORTAL_RESCHEDULE_NOT_ALLOWED`.
- **FR-042**: System MUST block reschedule when there is an active, unfinished `InspectionExecution` for the appointment (`PORTAL_INSPECTION_IN_PROGRESS`).
- **FR-043**: System MUST reject new dates in the past (`PORTAL_DATE_IN_PAST`).
- **FR-044**: System MUST reject new dates more than 30 days from the original `scheduledDate` (`PORTAL_RESCHEDULE_WINDOW_EXCEEDED`).
- **FR-045**: System MUST update `scheduledDate` and `timeSlot`, reset `tenantConfirmationStatus = PENDING`, revoke all portal tokens for the appointment, and audit `tenant_portal.appointment_rescheduled` with `actorType = ANONYMOUS`.
- **FR-046**: System MUST replace any existing restrictions with the supplied ones (optional).

#### Update Contact

- **FR-050**: System MUST block update when `isReadOnly = true`.
- **FR-051**: System MUST require at least one contact field present after update (`PORTAL_NO_CONTACT_FIELDS`).
- **FR-052**: System MUST record a `CONTACT_UPDATED` activity and an audit record.
- **FR-053** (feature 021 architectural revision, NEW, pending planning): System MUST apply a **dual-write** on contact update: (a) update the `appointment_contacts` snapshot fields (`snapshot_name`, `snapshot_email`, `snapshot_phone`) for the primary contact row of this appointment, AND (b) update the linked `contacts` registry row (`display_name`, `primary_email`, `primary_phone`) when `contact_id IS NOT NULL`. When `contact_id IS NULL` (legacy rows), only the snapshot is updated. When the registry update would violate the per-tenant email uniqueness constraint, the registry update is **skipped silently** — the snapshot still updates, and an audit record `contact.portal_update_skipped_conflict` is written for operator reconciliation. This is the **only code path** in the system that updates both snapshot and registry.

#### Report Unavailability

- **FR-060** (`Status: APPROVED RULE, Source: dossier — regras-negocio:241-243`): System MUST **allow** `POST /unavailable` even when `isReadOnly = true` (after cutoff). This is the only mutation permitted after the 7 PM cutoff. When called in restricted mode, the action MUST be flagged as `urgentMode = true` in audit metadata.
- **FR-060b** (`Status: APPROVED RULE, Source: dossier`): System MUST trigger **immediate notifications** to the operator and the assigned inspector when `urgentMode = true` (late unavailability report). The portal does not decide the appointment's fate — `OP/AM` triages.
- **FR-061**: System MUST set `tenantConfirmationStatus = UNAVAILABLE` and persist optional restrictions.
- **FR-062**: System MUST record an `UNAVAILABLE_REPORTED` activity and an audit record (with `urgentMode` in metadata when applicable).
- **FR-063** (`Status: APPROVED RULE, Source: dossier`): `tenantConfirmationStatus = UNAVAILABLE` is a signal for operator triage, NOT a terminal resolution. The final outcome (`maintain`, `reschedule`, `cancel`, `reject`) is always decided by `OP/AM` through the appointment state machine (feature 006).

#### Cross-cutting

- **FR-070**: System MUST write a row to `tenant_portal_activities` for every non-idempotent renter action with `previous_values_json`, `new_values_json`, `ip_address`, `user_agent`.
- **FR-071**: System MUST validate all payloads against Zod schemas in `packages/shared/src/schemas/tenant-portal.ts`.
- **FR-072**: System MUST NOT mutate `appointment.status` from this feature. Confirmation / reschedule only touch tenant-facing fields (`tenantConfirmationStatus`, `scheduledDate`, `timeSlot`). Status transitions remain the responsibility of feature 006 via `ExecuteStatusTransitionUseCase`.

### Non-Functional Requirements

- **NFR-001** (`Status: APPROVED, Source: dossier`): Portal GET p95 < 200 ms (renters often open the link on mobile networks).
- **NFR-002** (`Status: IMPLEMENTED, Source: code`): Raw tokens MUST never appear in logs, audit records, or error messages.
- **NFR-003** (`Status: APPROVED, Source: dossier`): Rate limit 30 req/min per client on every portal endpoint is a hard ceiling to discourage scraping.
- **NFR-004** (`Status: APPROVED, Source: dossier`): Token expiry cutoff of 7 PM local-time day-before MUST hold across DST transitions.

### Key Entities

- **TenantPortalToken** — `id`, `appointment_id`, `token_hash` (unique, SHA-256), `expires_at`, `status` (`ACTIVE|EXPIRED|REVOKED`), `last_accessed_at`, timestamps.
- **TenantPortalActivity** — append-only log of renter actions. Holds `action`, `previous_values_json`, `new_values_json`, `ip_address`, `user_agent`, `created_at`. Distinct from the shared `audit_logs` table, which this feature also writes to.
- **TokenService** — domain helper: `generateRawToken`, `hashToken`, `computeExpiresAt(scheduledDate, timezone)`.
- **PortalContext** — request-scoped value injected by the middleware into every portal handler.

Full schema in [`data-model.md`](./data-model.md). HTTP contracts in [`contracts/`](./contracts/).

## Success Criteria

- **SC-001**: Raw tokens never appear in any log output, audit record, or error message. Verified by log grep in CI.
- **SC-002**: Every renter write action (confirm, reschedule, contact update, unavailability) produces exactly one `tenant_portal_activities` row AND one shared audit record with `actorType = ANONYMOUS`.
- **SC-003**: Token auto-expiry (`ACTIVE → EXPIRED`) is verified by an integration test that manipulates `expires_at` and asserts the middleware updates the row on next access.
- **SC-004**: Reschedule correctly resets the confirmation cycle (confirmation back to `PENDING`, all tokens revoked) — verified by integration test that asserts a follow-up GET with the old token returns `PORTAL_TOKEN_REVOKED`.
- **SC-005**: DST transition test (`Australia/Sydney` April/October) verifies `computeExpiresAt` lands on 19:00 local on the day before.
- **SC-006**: Read-only mode is enforced on every mutation endpoint — covered by per-endpoint integration tests.
- **SC-007**: Confirm idempotency is verified — calling confirm twice produces exactly one activity row.

## Assumptions

- One active portal token per appointment at any time. Regenerating the token automatically revokes the previous one.
- Email and SMS notifications for portal links rely on feature 009 (notifications). This feature calls `CreateNotificationUseCase` directly; moving the coupling to a domain event is Phase 2 work (depends on 002#GAP-005).
- The 30-day reschedule window is a product policy, not a system constraint. Changing it requires spec amendment.
- Renters never see other appointments — tokens are strictly scoped to one appointment.
- Portal operates without cookies or client state. Every request is stateless and carries the token in the URL path.
- Contact updates through the portal apply a dual-write: the appointment snapshot is updated AND the registry contact is updated (when `contact_id IS NOT NULL`). See FR-053 for conflict handling. No history table — the `tenant_portal_activities` row with `previous_values_json` / `new_values_json` serves as the audit trail.

## Known Gaps

> Summary index only. Detail in [`tasks.md`](./tasks.md) under Phase 2.

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Reschedule handoff with 006 | ~~Direct repo writes.~~ **IMPLEMENTED** (Wave 1). | Portal reschedule migrated to `ReopenForRescheduleUseCase` from 006#GAP-003. No more direct appointment repo writes. 2 tests. |
| GAP-002 | Domain events for portal actions | ~~Inline notification handler.~~ **IMPLEMENTED** (Wave 2). | 4 typed events: confirmed, rescheduled, contact_updated, unavailable. Via DomainEventBus. 4 tests. |
| GAP-003 | Token replay detection | ~~Unlimited reuse.~~ **IMPLEMENTED** (Wave 2). | Single-use tokens for mutations. `used_at` column + `markUsed()`. `PortalTokenAlreadyUsedError` (409). GET still works. Migration. 4 tests. |
| GAP-004 | Auto-generate token on reschedule | ~~Manual token generation.~~ **IMPLEMENTED** (Wave 2). | Calls `GeneratePortalTokenUseCase` after reschedule. Sends new link via notification. Fire-and-forget. 3 tests. |
| GAP-005 | Portal activity export | ~~No operator endpoint.~~ **IMPLEMENTED** (Wave 1). | `ListPortalActivitiesUseCase` + `GET /v1/appointments/:id/portal-activities`. AM/OP only. Paginated. 7 tests. |
| GAP-006 | Expired token UX | ~~Confusing error pages.~~ **IMPLEMENTED** (Wave 4). | `isExpired` + `canRequestNewLink` flags in portal GET response. Frontend CTA deferred. 5 tests. |
| GAP-007 | Configurable cutoff per tenant | ~~Hardcoded 7 PM.~~ **IMPLEMENTED** (Wave 3). | `portalCutoffHour` + `portalCutoffDaysBefore` in tenant settings. `computeExpiresAt` parameterized. 12 tests. |
| GAP-008 | Configurable reschedule window | ~~Hardcoded 30 days.~~ **IMPLEMENTED** (Wave 3). | `portalRescheduleWindowDays` in tenant settings. Default 30. 4 tests. |
| GAP-009 | Telemetry dashboard | ~~No engagement metrics.~~ **IMPLEMENTED** (Wave 4). | Design doc `portal-telemetry-design.md` with 5 metrics, SQL patterns, 011-reports-audit integration spec. |
| GAP-010 | Cross-DST correctness | ~~No DST tests.~~ **IMPLEMENTED** (Wave 1). | 12 fixture-based tests for April + October DST boundaries. Bug fix: two-pass offset computation. |
