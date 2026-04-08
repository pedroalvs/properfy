---
description: "Implementation and backlog tracking for Tenant Portal"
---

# Tasks: Tenant Portal

**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), [`data-model.md`](./data-model.md), [`contracts/`](./contracts/)
**Tests**: Required per constitution Principle III. Raw-token leakage and DST correctness are the highest-risk surfaces.
**Organization**: Two sections — Baseline Implemented (shipped) and Open Backlog (Phase 2/3).

## Format

- `[x]` shipped; `[ ]` open.
- `[P]` may run in parallel.
- `[Story]` maps to a user story in `spec.md` (US1–US6) or a `GAP-xxx`.

---

# SECTION 1 — Baseline Implemented

> Already done on the active branch. Do not reimplement.

## Setup & Foundational (shipped)

- [x] T001 Prisma schema: `TenantPortalToken`, `TenantPortalActivity`, `TenantPortalTokenStatus`, `TenantPortalAction`.
- [x] T002 Shared Zod schemas in `packages/shared/src/schemas/tenant-portal.ts`.
- [x] T003 Domain entities (`TenantPortalTokenEntity`, `TenantPortalActivityEntity`) and typed errors.
- [x] T004 `TokenService` with `generateRawToken`, `hashToken`, `computeExpiresAt` (DST-aware).
- [x] T005 Domain ports `ITenantPortalTokenRepository`, `ITenantPortalActivityRepository`.
- [x] T006 Prisma adapters for both repositories.
- [x] T007 Portal token middleware (`createPortalTokenMiddleware`) auto-expiring tokens on access.
- [x] T008 `expire-tokens.worker.ts` pg-boss scheduled sweep.

## US1 — Generate portal token (shipped)

- [x] T010 [US1] `GeneratePortalTokenUseCase` with AM/OP guard, revoke-existing, hash-only storage, expiry computation, notification enqueue.
- [x] T011 [US1] Route `POST /v1/appointments/:appointmentId/portal-token`.
- [x] T012 [US1] Unit tests including notification enqueue assertions.
- [x] T013 [US1] Integration tests covering revoke-existing behavior.

## US2 — Get portal data (shipped)

- [x] T020 [US2] `GetPortalDataUseCase` returning appointment summary, agency, property, contact, restrictions, confirmation status.
- [x] T021 [US2] Route `GET /v1/tenant-portal/:token` with middleware and 30/min rate limit.
- [x] T022 [US2] Integration test exercising ACTIVE → EXPIRED auto-transition.
- [x] T023 [US2] Integration test for REVOKED and INVALID token error paths.

## US3 — Confirm appointment (shipped)

- [x] T030 [US3] `ConfirmAppointmentUseCase` with read-only guard, idempotency, stale-restriction replacement, activity + audit, fire-and-forget notification.
- [x] T031 [US3] Route `POST /v1/tenant-portal/:token/confirm`.
- [x] T032 [US3] Unit tests including the idempotent re-call.
- [x] T033 [US3] Integration test asserting `actorType = ANONYMOUS` audit record.

## US4 — Reschedule request (shipped)

- [x] T040 [US4] `RescheduleRequestUseCase` with ROUTINE-only guard, inspection-in-progress guard, past-date guard, 30-day window guard, confirmation reset, token revocation cascade.
- [x] T041 [US4] Route `POST /v1/tenant-portal/:token/reschedule`.
- [x] T042 [US4] Unit tests for every rejection branch.
- [x] T043 [US4] Integration test asserting the reschedule revokes all tokens for the appointment.

## US5 — Update contact (shipped)

- [x] T050 [US5] `UpdateContactUseCase` with at-least-one-field guard.
- [x] T051 [US5] Route `PATCH /v1/tenant-portal/:token/contact`.
- [x] T052 [US5] Tests including the empty-after-update rejection.

## US6 — Report unavailability (shipped)

- [x] T060 [US6] `ReportUnavailabilityUseCase`.
- [x] T061 [US6] Route `POST /v1/tenant-portal/:token/unavailable`.
- [x] T062 [US6] Tests.

## Frontend (shipped)

- [x] T090 Web pages under `apps/web/src/features/tenant-portal/` — renter-facing, no JWT, consumes token from URL.
- [x] T091 Components and hooks for confirm / reschedule / contact update / unavailability flows.
- [x] T092 Component tests.

## Cross-cutting (shipped)

- [x] T095 Container wiring injecting all ports plus `CreateNotificationUseCase` for link delivery.
- [x] T096 Rate limit plugin applied per-endpoint (30/min).

---

# SECTION 2 — Open Backlog

> Only pick up work from this section. Every task must follow TDD and produce an audit record on write paths.

## Phase 2 — Gap closure

### GAP-001 — Formal reschedule handoff with feature 006

- [ ] T100 [GAP-001] Mirror of 006#GAP-003 — land in the same PR.
- [ ] T101 [GAP-001] Expose `RescheduleAppointmentFromPortalUseCase` from feature 006 that writes `scheduledDate`, `timeSlot`, and resets `tenantConfirmationStatus`.
- [ ] T102 [GAP-001] Migrate `RescheduleRequestUseCase` to call the new entry point instead of writing through `IAppointmentRepository` directly.
- [ ] T103 [GAP-001] Tests covering the full round-trip.

### GAP-002 — Domain events for portal actions

- [ ] T110 [GAP-002] Depends on 002#GAP-005 (event bus).
- [ ] T111 [GAP-002] Emit `tenant_portal.confirmed.v1`, `tenant_portal.rescheduled.v1`, `tenant_portal.contact_updated.v1`, `tenant_portal.unavailable.v1` after successful writes.
- [ ] T112 [GAP-002] Migrate feature 009-notifications from the inline `onNotificationHandler` to event subscription.
- [ ] T113 [GAP-002] Tests.

### GAP-003 — Token replay detection / single-use mutations

- [ ] T120 [GAP-003] Decision: mark tokens as single-use after a successful mutation, or add per-token rate limit.
- [ ] T121 [GAP-003] Implement the chosen strategy with Prisma migration if needed.
- [ ] T122 [GAP-003] Tests covering the single-use / rate-limit semantics.

### GAP-004 — Auto-generate new token on reschedule

- [ ] T130 [GAP-004] After a successful reschedule, call `GeneratePortalTokenUseCase` inline to issue a new token for the new date.
- [ ] T131 [GAP-004] Return the new token in the reschedule response OR notify the renter via email/SMS with the new link (preferred).
- [ ] T132 [GAP-004] Tests.

### GAP-005 — Portal activity export endpoint

- [ ] T140 [GAP-005] `ListPortalActivitiesUseCase` for AM/OP scoped by tenant.
- [ ] T141 [GAP-005] Route `GET /v1/appointments/:appointmentId/portal-activities`.
- [ ] T142 [GAP-005] Web UI in the appointment detail page.
- [ ] T143 [GAP-005] Tests.

### GAP-006 — Web UX for EXPIRED tokens

- [x] T150 [GAP-006] Backend: add `isExpired` and `canRequestNewLink` flags to `portalDataResponseSchema` and `GetPortalDataUseCase` response. Schema in `packages/shared/src/schemas/responses.ts`, use case in `apps/backend/src/modules/tenant-portal/application/use-cases/get-portal-data.use-case.ts`.
- [ ] T151 [GAP-006] Frontend: render a friendly "request a new link" CTA when `token.isExpired = true && token.canRequestNewLink = true`, distinct from the error page for revoked/invalid.
- [ ] T152 [GAP-006] Trigger an operator notification via feature 009 when a renter clicks the CTA so the agency can resend.

### GAP-007 — Configurable cutoff per tenant

- [ ] T160 [GAP-007] Depends on 002#GAP-002 (rich tenant settings).
- [ ] T161 [GAP-007] Read `tenant.settings_json.portalCutoffTime` and `portalCutoffDaysBefore` in `TokenService.computeExpiresAt`; fall back to defaults when absent.
- [ ] T162 [GAP-007] Tests with multiple tenant configurations.

### GAP-008 — Configurable reschedule window per tenant

- [ ] T170 [GAP-008] Depends on 002#GAP-002.
- [ ] T171 [GAP-008] Read `tenant.settings_json.portalRescheduleWindowDays` in `RescheduleRequestUseCase`.
- [ ] T172 [GAP-008] Tests.

### GAP-009 — `last_accessed_at` telemetry dashboard

- [x] T180 [GAP-009] Design document: `specs/007-tenant-portal/portal-telemetry-design.md` — defines metrics (M1-M5), SQL query patterns, XLSX export columns, summary card layout, and integration with feature 011-reports-audit as a `PORTAL_ENGAGEMENT` report type.
- [ ] T181 [GAP-009] Add `PORTAL_ENGAGEMENT` to `ReportType` enum in `packages/shared`.
- [ ] T182 [GAP-009] Implement `PortalEngagementReportWorker` with the SQL queries from the design doc.
- [ ] T183 [GAP-009] Implement `GetPortalEngagementSummaryUseCase` for the dashboard summary card.
- [ ] T184 [GAP-009] Tests for the report worker and summary use case.

### GAP-010 — DST correctness tests

- [ ] T190 [GAP-010] Add fixture-based tests for `TokenService.computeExpiresAt` covering both DST transitions for `Australia/Sydney` (April and October).
- [ ] T191 [GAP-010] Optionally extend to Brazilian timezones as a secondary check.

## Phase 3 — Polish & cross-cutting

- [ ] T200 [P] Verify module coverage ≥ 80% with `pnpm --filter backend test -- --coverage`.
- [ ] T201 [P] Grep CI: ensure no raw portal token ever appears in any log output, audit record, or error message.
- [ ] T202 Confirm OpenAPI export reflects all six endpoints and the frontend client regenerates cleanly.
- [ ] T203 Incremental supersede of legacy specs:
  - Add a banner to `specs/backend/tenant-portal.spec.md` and `specs/web/tenant-portal.spec.md` marking them as SUPERSEDED once this feature is approved.
  - Remove the legacy files only after the next feature migration cycle.
- [ ] T204 Add a VIEW activity row on GET portal data (optional enhancement — captures engagement signals).

---

## Dependencies & Execution Order

- **GAP-001** pairs with 006#GAP-003 and should land together.
- **GAP-002** depends on 002#GAP-005 (event bus).
- **GAP-007** and **GAP-008** depend on 002#GAP-002 (rich settings schema).
- **GAP-004** should land before **GAP-003** so renters are not stranded by single-use rules without an automatic link refresh.

## Notes

- Raw tokens must never appear in logs. Phase 3 task T201 enforces this via grep.
- `actorType = ANONYMOUS` is unique to this feature. Downstream consumers (feature 011) must handle it.
- Close each `GAP-xxx` by promoting in `spec.md` and updating `specs/GAPS.md`.
