# Tasks: Consent & Notification Preferences

**Input**: Design documents from `/specs/018-consent-notification-prefs/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Status**: **ALL TASKS COMPLETE (2026-04-11)** — 85/85 checked. The feature is delivered and verified end-to-end. See `spec.md` "Delivery Outcome" and `plan.md` "Execution Outcome" for the closure record. No task was dropped; every `- [X]` below corresponds to real work that landed on the `015-permissions-rbac-matrix` integration branch.

**Tests**: TDD is mandatory per constitution. Unit + integration tests are included in each wave. The transactional-delivery invariant (zero blocking of protected templates) has a dedicated test task.

**Organization**: Tasks are grouped by user story. Phase 2 (Foundational) is a hard prerequisite for all stories because it introduces the schema migration, enum additions, and classification domain. Wave 2 of the plan (send-flow enforcement) is the critical path — it is the only wave that can regress transactional delivery.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5, US6)
- Include exact file paths in descriptions

## Path Conventions

- **Shared**: `packages/shared/src/`
- **Backend**: `apps/backend/src/`
- **Backend tests**: `apps/backend/tests/`
- **Frontend**: `apps/web/src/`

---

## Phase 1: Setup

**Purpose**: Verify implemented-reality assumptions before touching code. The 018 spec is significantly out of date — much of the skeleton already exists.

- [X] T001 Verify implemented reality per plan Summary table — confirm `NotificationConsent` Prisma model exists at `apps/backend/prisma/schema.prisma`, `NotificationConsentEntity` exists at `apps/backend/src/modules/notification/domain/`, `ProcessUnsubscribeUseCase` exists at `apps/backend/src/modules/notification/application/use-cases/process-unsubscribe.use-case.ts`, `SendNotificationUseCase` already has a consent check branch, and `POST /v1/notifications/unsubscribe` route is already wired in `apps/backend/src/modules/notification/interfaces/notification.routes.ts`. Confirm `notification_class` column does NOT yet exist on `notification_templates`, `notifications`, or `notification_consent`. **Also during this task: resolve the frontend template page file path** — locate the notification templates page under `apps/web/src/features/notifications/` (search for files matching `*Template*Page*`, `NotificationTemplate*`, or check the router for the templates route) and record the concrete file path. Update T070's description with the pinned path before Phase 9 starts.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema migration, enum additions, domain entity extensions, repository signature updates. All user stories depend on this phase.

**CRITICAL**: No user story work can begin until this phase is complete.

### Schema & Enums

- [X] T002 Extend `NotificationTemplate` model in `apps/backend/prisma/schema.prisma` — add `notification_class` (new `NotificationClass` enum: `TRANSACTIONAL | OPERATIONAL | MARKETING`, NOT NULL, default `OPERATIONAL`).
- [X] T003 Extend `Notification` model in `apps/backend/prisma/schema.prisma` — add `notification_class` (same enum, nullable — existing rows default to null and are treated as `OPERATIONAL` by the send worker).
- [X] T004 Extend `NotificationConsent` model in `apps/backend/prisma/schema.prisma` — add `notification_class` (enum, NOT NULL, default `OPERATIONAL`), `change_source` (new `ConsentChangeSource` enum: `unsubscribe_link | operator_override | re_opt_in`, nullable), `changed_at` (timestamp nullable), `changed_by_user_id` (UUID FK to `users.id` nullable, `onDelete: SetNull`), `reason` (text nullable). Replace the existing unique constraint `(recipient, channel, tenantId)` with `(recipient, channel, tenantId, notification_class)`.
- [X] T005 Add `SKIPPED_OPT_OUT` value to `NotificationStatus` enum in `apps/backend/prisma/schema.prisma`. Keep the existing `SKIPPED` value.
- [X] T006 Declare `NotificationClass` and `ConsentChangeSource` as Prisma enums (or explicit enum models) in `apps/backend/prisma/schema.prisma`.
- [X] T007 Create migration SQL file at `apps/backend/prisma/migrations/20260411000000_consent_notification_prefs/migration.sql` following the shape in `data-model.md`: `CREATE TYPE`, `ALTER TYPE ... ADD VALUE 'SKIPPED_OPT_OUT'`, `ALTER TABLE ADD COLUMN` on all three tables, FK constraint, data migration seeding `TRANSACTIONAL` for protected template codes.
- [X] T008 Apply migration and regenerate Prisma client: `cd apps/backend && pnpm exec prisma format && pnpm exec prisma validate && pnpm exec prisma migrate dev && pnpm exec prisma generate`. Verify no existing notification tests break.

### Shared Schemas & Enums

- [X] T009 Add `NotificationClass` enum to `packages/shared/src/enums/notification.ts` (or wherever `NotificationChannel` lives): `{ TRANSACTIONAL: 'TRANSACTIONAL', OPERATIONAL: 'OPERATIONAL', MARKETING: 'MARKETING' }` as const with the typeof-derived type export.
- [X] T010 Add `ConsentChangeSource` enum in the same file: `{ unsubscribe_link: 'unsubscribe_link', operator_override: 'operator_override', re_opt_in: 're_opt_in' }`.
- [X] T011 Add `SKIPPED_OPT_OUT` to the shared `NotificationStatus` enum if it's defined in `packages/shared/src/enums/notification.ts`.
- [X] T012 Add `notificationClassSchema`, `consentChangeSourceSchema` Zod schemas, `overrideConsentSchema` (`{ reason: z.string().min(1).max(1000) }`), `listConsentsQuerySchema` (`{ recipient, tenantId?, channel? }`), and `consentRecordResponseSchema` to `packages/shared/src/schemas/notification.ts` (or a new `consent.ts` if more natural). Export types.
- [X] T013 Add `unsubscribeTokenPayloadSchema` (used internally by the token service, not an API surface) to the same file or to the backend domain layer.
- [X] T014 Extend `notificationTemplateResponseSchema` and `notificationResponseSchema` in `packages/shared/src/schemas/responses.ts` with `notificationClass: notificationClassSchema.optional()`.
- [X] T015 Rebuild shared package: `pnpm --filter @properfy/shared build` — verify clean build with no type errors.

### Domain Entities

- [X] T016 Extend `NotificationTemplateEntity` at `apps/backend/src/modules/notification/domain/notification-template.entity.ts` — add `notificationClass: NotificationClass` to props and class, include in constructor and any `toSnapshot`/serialization methods.
- [X] T017 Extend `NotificationEntity` at `apps/backend/src/modules/notification/domain/notification.entity.ts` — add `notificationClass: NotificationClass | null` as a mutable-at-create-time field (set once, never reassigned).
- [X] T018 Extend `NotificationConsentEntity` at `apps/backend/src/modules/notification/domain/notification-consent.entity.ts` — add `notificationClass`, `changeSource`, `changedAt`, `changedByUserId`, `reason` fields. Add domain methods `markOptedOut(source, changedByUserId?, reason?)` and `markOptedIn(source, changedByUserId?, reason?)` that set the fields atomically.

### Constants & Classification Map

- [X] T019 Add `PROTECTED_TEMPLATE_CLASSIFICATIONS` map to `apps/backend/src/modules/notification/domain/notification.constants.ts` — `{ INSPECTION_CONFIRMED: 'TRANSACTIONAL', INSPECTION_RESCHEDULED: 'TRANSACTIONAL', INSPECTION_CANCELLED: 'TRANSACTIONAL', INSPECTION_UNAVAILABILITY_REPORTED: 'TRANSACTIONAL' }`. Add `DEFAULT_TEMPLATE_CLASSIFICATIONS` for non-protected operational templates (reminders, escalations, notices).

### Repository

- [X] T020 Extend `INotificationConsentRepository` interface at `apps/backend/src/modules/notification/domain/notification-consent.repository.ts` — add `findByScope(params: { tenantId, recipient, channel, notificationClass }): Promise<NotificationConsentEntity | null>`, `listByRecipient(params: { tenantId, recipient, channel? }): Promise<NotificationConsentEntity[]>`, `countSkippedForRecipient(params: { tenantId, recipient }): Promise<number>`.
- [X] T021 Implement the new methods in `apps/backend/src/modules/notification/infrastructure/prisma-notification-consent.repository.ts` and extend existing `save`/`update` methods to handle the new columns. The `countSkippedForRecipient` method queries the `notifications` table for `status = 'SKIPPED_OPT_OUT' AND tenant_id = ? AND recipient = ?`.

### Typecheck Checkpoint

- [X] T022 Run `pnpm --filter backend typecheck` — should be clean. If there are errors in existing code that constructs the entities, add the new required fields (default `OPERATIONAL` for template, `null` for notification, `OPERATIONAL` for existing consent).

**Checkpoint**: Prisma migration applied, shared schemas published, domain and repository extended. No behavior changes to the send flow yet. Existing 2594 backend tests continue to pass.

---

## Phase 3: User Story 5 — Template classification (Priority: P1) 🎯 PREREQUISITE

**Goal**: Every notification template declares a `notificationClass`. Protected templates cannot be reclassified.

**Independent Test**: Upsert a template with class `OPERATIONAL` → success. Upsert `INSPECTION_CONFIRMED` with class `OPERATIONAL` → `400 PROTECTED_TEMPLATE_CLASSIFICATION`. Upsert a new template without specifying class → defaults to `OPERATIONAL`.

**Why this order**: US5 is the prerequisite for US1 and US2. Without `notificationClass` on templates, there's nothing to stamp on notifications, and the send worker has nothing to branch on.

### Tests for US5

- [X] T023 [P] [US5] Update unit tests for `UpsertNotificationTemplateUseCase` in `apps/backend/tests/unit/notification/upsert-notification-template.use-case.test.ts` — add cases: valid class provided, class defaults to `OPERATIONAL` when omitted, protected template code cannot be reclassified (throws `PROTECTED_TEMPLATE_CLASSIFICATION` error), protected template code can be upserted with its correct TRANSACTIONAL class, non-protected template can be freely reclassified.

### Implementation for US5

- [X] T024 [US5] Add a new domain error `ProtectedTemplateClassificationError` (code `PROTECTED_TEMPLATE_CLASSIFICATION`, 400) to `apps/backend/src/modules/notification/domain/notification.errors.ts` (or the existing errors file).
- [X] T025 [US5] Extend `UpsertNotificationTemplateUseCase.execute()` in `apps/backend/src/modules/notification/application/use-cases/upsert-notification-template.use-case.ts` to accept `notificationClass` in input; consult `PROTECTED_TEMPLATE_CLASSIFICATIONS` map; if the template code is protected and the provided class differs from the protected value, throw `ProtectedTemplateClassificationError`. If the class is not provided, default to `OPERATIONAL`.
- [X] T026 [US5] Update the route handler for `POST/PUT` template upsert in `apps/backend/src/modules/notification/interfaces/notification.routes.ts` to pass `notificationClass` through from the request body to the use case.
- [X] T027 [US5] Extend the list/get template use cases to include `notificationClass` in their output shape (mirrors `list-invoices.use-case.ts` pattern from 017).
- [X] T028 [US5] Run US5 unit tests: `pnpm --filter backend test upsert-notification-template` — all green.

**Checkpoint**: Template classification works end-to-end. Protected codes cannot be changed. Templates default to OPERATIONAL.

---

## Phase 4: User Story 2 — Notification send flow checks consent before delivery (Priority: P1) 🎯 CRITICAL PATH

**Goal**: The send worker branches on `notificationClass`. `TRANSACTIONAL` always ships. `OPERATIONAL` respects opt-out. `MARKETING` is blocked in Phase 1.

**Independent Test**: Opt out recipient X from `OPERATIONAL` email. Trigger an operational email → `SKIPPED_OPT_OUT`. Trigger a transactional email → delivered. Trigger a marketing email → skipped (dead code in Phase 1 but branch tested).

**Why this priority**: Without this, classification is decorative. This is the enforcement mechanism.

**CRITICAL**: This phase touches the hot path for transactional notifications. A bug here blocks appointment confirmation emails. Test the transactional bypass **before** touching production.

### Tests for US2 (write BEFORE implementation)

- [X] T029 [P] [US2] Extend unit tests for `SendNotificationUseCase` in `apps/backend/tests/unit/notification/send-notification.use-case.test.ts` — add cases:
  - **Transactional bypass**: recipient has `optedOut = true` for OPERATIONAL; notification has `notificationClass = 'TRANSACTIONAL'` → bypass consent, proceed to dispatch
  - **Operational respect**: recipient has `optedOut = true` for OPERATIONAL; notification has `notificationClass = 'OPERATIONAL'` → transition to `SKIPPED_OPT_OUT`, no provider call, audit metadata records the skip reason
  - **Operational allowed**: no consent record OR `optedOut = false`; notification has `notificationClass = 'OPERATIONAL'` → proceed to dispatch
  - **Marketing blocked**: notification has `notificationClass = 'MARKETING'` → always `SKIPPED_OPT_OUT` in Phase 1 (no opt-in collection exists)
  - **Null class legacy**: notification has `notificationClass = null` (existing legacy row) → treat as `OPERATIONAL` and apply consent check
- [X] T030 [P] [US2] Extend unit tests for `CreateNotificationUseCase` in `apps/backend/tests/unit/notification/create-notification.use-case.test.ts` — add case: when a template has `notificationClass = 'TRANSACTIONAL'`, the created notification must have `notificationClass = 'TRANSACTIONAL'` stamped on it (read from the resolved template at create time).
- [X] T031 [US2] Integration test for end-to-end send enforcement in `apps/backend/tests/integration/notification/consent-enforcement.routes.test.ts` (new file): seed an opted-out consent record for a recipient on OPERATIONAL email; trigger 3 operational notifications → assert all 3 become `SKIPPED_OPT_OUT` with one audit record each; trigger all 4 protected transactional templates → assert all 4 are dispatched and none are blocked; verify the transactional-invariant is preserved.

### Implementation for US2

- [X] T032 [US2] Update `CreateNotificationUseCase` at `apps/backend/src/modules/notification/application/use-cases/create-notification.use-case.ts` — after resolving the template, stamp `notificationClass` from `template.notificationClass` onto the new `NotificationEntity`. Pass it to the repository save.
- [X] T033 [US2] Update `PrismaNotificationRepository` save/update methods to persist the new `notification_class` column.
- [X] T034 [US2] **Critical path edit** — update `SendNotificationUseCase` at `apps/backend/src/modules/notification/application/use-cases/send-notification.use-case.ts` consent branch:
  - Read `notification.notificationClass` (fallback to `OPERATIONAL` if null for legacy rows)
  - If `TRANSACTIONAL` → bypass consent entirely, log a debug line, proceed to dispatch
  - If `OPERATIONAL` → call `consentRepo.findByScope({ tenantId, recipient: notification.recipient, channel: notification.channel, notificationClass: 'OPERATIONAL' })`; if `consent?.optedOut === true`, transition the notification to `SKIPPED_OPT_OUT`, write an audit record (`notification.skipped_opt_out`), and return early without calling any provider
  - If `MARKETING` → same skip path (Phase 1 dead code — no opt-in collection exists)
- [X] T035 [US2] In the same `SendNotificationUseCase`, when processing an `OPERATIONAL` email, build the `unsubscribeUrl` using the **existing `buildUnsubscribeUrl()` helper already present in `apps/backend/src/modules/notification/application/use-cases/process-unsubscribe.use-case.ts`** and inject it into the Handlebars render context under the key `unsubscribeUrl`. For `TRANSACTIONAL` and `MARKETING` notifications, do NOT inject the URL (empty string fallback). **Do NOT wait for or depend on `UnsubscribeTokenService` from Phase 5** — the Phase 5 extraction (T044) is a refactor that moves the existing helper into a dedicated domain service; it is NOT a prerequisite for Phase 4 work. After T044 ships, a follow-up edit in Phase 5 will update the call site to import the service instead of the helper, but Phase 4 is free to use the helper as it currently exists.
- [X] T036 [US2] Update one operational template body (e.g., `REMINDER_7_DAYS`) in the template seeder or template content to reference `{{unsubscribeUrl}}` in the footer. The remaining operational templates can be updated as a follow-up.
- [X] T037 [US2] Run US2 tests: `pnpm --filter backend test send-notification create-notification consent-enforcement` — all green.
- [X] T038 [US2] Run the full backend test suite to verify zero regressions in transactional delivery: `pnpm --filter backend test`. If any existing notification test fails, investigate before proceeding — this is the critical-path wave.
- [X] T038a [US2] Verify `SKIPPED_OPT_OUT` status is visible end-to-end (covers FR-014). Three sub-checks:
  1. **List endpoint**: confirm `GET /v1/notifications` returns the new status value in list responses and that the `status` filter query param accepts `SKIPPED_OPT_OUT` (update the list query schema in `packages/shared/src/schemas/notification.ts` or equivalent to include the new enum value).
  2. **Frontend status chip**: confirm the notification list UI at `apps/web/src/features/notifications/` (or wherever notification rows are rendered) displays `SKIPPED_OPT_OUT` as a distinct chip. If the existing component uses a status map, add the new value with a gray or muted color. If no dedicated chip exists, document the fallback rendering path.
  3. **Integration assertion**: add a one-line assertion in the T031 integration test that the skipped notifications returned by the list endpoint carry `status = 'SKIPPED_OPT_OUT'` (not `SKIPPED`), and that the frontend filter accepts the new value.

**Checkpoint**: Consent enforcement works at the send layer. Transactional notifications are NEVER blocked. Operational notifications respect opt-out. Full backend regression suite green. `SKIPPED_OPT_OUT` is visible in both the API response and the UI (FR-014).

---

## Phase 5: User Story 1 — Recipient unsubscribes via email link (Priority: P1)

**Goal**: End-to-end public unsubscribe flow with HMAC-SHA256 tokens, 30-day expiry, 2-step GET/POST confirmation HTML page.

**Independent Test**: Open an operational email in dev; verify footer contains an unsubscribe URL. Click the URL → GET renders HTML confirmation page. POST confirms → consent record created/updated, audit written. Triggering another reminder → `SKIPPED_OPT_OUT`.

### Tests for US1

- [X] T039 [P] [US1] Write unit tests for `UnsubscribeTokenService` in `apps/backend/tests/unit/notification/unsubscribe-token.service.test.ts` — test: generate + verify round-trip, expired token rejected (`reason: 'expired'`), tampered signature rejected (`reason: 'invalid_signature'`), malformed token rejected (`reason: 'malformed'`), payload includes `recipient`, `channel`, `tenantId`, `notificationClass`, `exp`, timing-safe comparison used.
- [X] T040 [P] [US1] Extend unit tests for `ProcessUnsubscribeUseCase` in `apps/backend/tests/unit/notification/process-unsubscribe.use-case.test.ts` — add cases: valid token flips consent to opted-out with `changeSource = 'unsubscribe_link'`, expired token → error, tampered signature → error, audit record written with `consent.opted_out_via_link` action, per-class scoping (OPERATIONAL only, not all-or-nothing).
- [X] T041 [P] [US1] Write unit tests for `RenderUnsubscribePageUseCase` in `apps/backend/tests/unit/notification/render-unsubscribe-page.use-case.test.ts` — valid token returns `{ ok: true, recipient, channel, class }`; expired token returns `{ ok: false, reason: 'expired' }`; invalid token returns `{ ok: false, reason: 'invalid' }`.
- [X] T042 [US1] Integration test for the public unsubscribe flow in `apps/backend/tests/integration/notification/unsubscribe-public-flow.routes.test.ts` (new file): generate a valid token → GET `/v1/notifications/unsubscribe?token=...` returns 200 HTML containing the recipient and confirm button → POST `/v1/notifications/unsubscribe` with the token returns 200 HTML success page → consent record exists in DB with `optedOut = true`, `changeSource = 'unsubscribe_link'` → audit record exists with action `consent.opted_out_via_link` and `actorType = 'ANONYMOUS'` → triggering a subsequent OPERATIONAL email for the same recipient results in `SKIPPED_OPT_OUT`.
- [X] T043 [US1] Integration test for expired token handling: generate a token, fast-forward time past the 30-day window (or use a test clock), GET with the expired token → 200 HTML page with "link expired" message (NOT 400 or 500).

### Implementation for US1

- [X] T044 [US1] Create `apps/backend/src/modules/notification/domain/unsubscribe-token.service.ts` — domain service with `generate(payload)`, `buildUrl(baseUrl, payload)`, `verify(token): { valid, payload?, reason? }`. Move the existing helpers from `process-unsubscribe.use-case.ts` into this service. Add a 30-day expiry to the payload and enforce it on verify. Use HMAC-SHA256 with `env.UNSUBSCRIBE_TOKEN_SECRET` (add to env config if missing).
- [X] T045 [US1] Extend `ProcessUnsubscribeUseCase` at `apps/backend/src/modules/notification/application/use-cases/process-unsubscribe.use-case.ts` to:
  - Use the new `UnsubscribeTokenService.verify()` (inject via constructor)
  - On expired/invalid token, throw a domain error that the route handler catches and renders as the HTML "expired" page
  - Scope opt-out per class (use `notificationClass` from the token payload)
  - Write audit record with action `consent.opted_out_via_link`, `actorType: 'ANONYMOUS'`, `changeSource: 'unsubscribe_link'`, `before`/`after` snapshots
- [X] T046 [US1] Create `apps/backend/src/modules/notification/application/use-cases/render-unsubscribe-page.use-case.ts` — takes a token, validates it via `UnsubscribeTokenService`, returns `{ ok, recipient, channel, notificationClass, tenantId }` or `{ ok: false, reason }`. Does NOT mutate any state.
- [X] T047 [US1] Create `apps/backend/src/modules/notification/interfaces/unsubscribe-page.html` — minimal self-contained HTML template with placeholders `{{recipient}}`, `{{channel}}`, `{{tenantName}}`, `{{token}}`. Include a POST form to `/v1/notifications/unsubscribe` with the token in a hidden field. Style inline (no external CSS dependencies). Include a second template section for the "expired/invalid" state and a third for the "success" state.
- [X] T048 [US1] Add `GET /v1/notifications/unsubscribe` route in `apps/backend/src/modules/notification/interfaces/notification.routes.ts` — public (no `authenticate` preHandler). Reads `?token=` query param, calls `renderUnsubscribePageUseCase`, loads the HTML template file, interpolates the context, returns with `Content-Type: text/html`. Always returns 200 (even for invalid tokens) to prevent information disclosure.
- [X] T049 [US1] Extend `POST /v1/notifications/unsubscribe` route (already exists) in the same file to call the extended `ProcessUnsubscribeUseCase` and return the success HTML page from `unsubscribe-page.html`. Accept both `application/json` (existing) and `application/x-www-form-urlencoded` (for the HTML form POST).
- [X] T050 [US1] Register `RenderUnsubscribePageUseCase` and `UnsubscribeTokenService` in `apps/backend/src/main/container.ts`. The existing `ProcessUnsubscribeUseCase` constructor needs the new `UnsubscribeTokenService` injected.
- [X] T051 [US1] Run US1 tests: `pnpm --filter backend test unsubscribe-token process-unsubscribe render-unsubscribe-page unsubscribe-public-flow` — all green.

**Checkpoint**: Full public unsubscribe round-trip works. Expired tokens render an expired page. Audit records are written. Subsequent operational notifications are skipped.

---

## Phase 6: User Story 3 — Operator views consent status (Priority: P2)

**Goal**: AM/OP actors can search for a recipient and see all consent records + skipped notification count.

**Independent Test**: Opt out a recipient → as OP, GET `/v1/notifications/consents?recipient=...` → verify the response shows the opt-out entry with source, changedAt, and skippedCount. As CL_ADMIN → 403.

### Tests for US3

- [X] T052 [P] [US3] Write unit tests for `ListConsentsByRecipientUseCase` in `apps/backend/tests/unit/notification/list-consents-by-recipient.use-case.test.ts` — cases: returns correct shape, AM can query cross-tenant (with mandatory `tenantId` param), OP is scoped to own tenant (ignores the query param), CL_ADMIN gets 403, empty result when recipient has no consent records, skippedCount queries the notification table correctly.

### Implementation for US3

- [X] T053 [US3] Create `apps/backend/src/modules/notification/application/use-cases/list-consents-by-recipient.use-case.ts` — constructor takes `consentRepo`, `authorizationService`. `execute({ recipient, tenantId?, channel?, actor })`:
  1. `assertRoles(actor, ['AM', 'OP'], { action: 'consent.list', entityType: 'NotificationConsent' })`
  2. Resolve tenant scope: AM and OP both use the optional `tenantId` from input (cross-tenant per `specs/DECISIONS.md` DEC-003). When omitted, the query spans all tenants. Superseded phrasing: "AM uses `tenantId` from input (required); OP uses `actor.tenantId` (enforced)".
  3. Call `consentRepo.listByRecipient({ tenantId, recipient, channel })`
  4. Call `consentRepo.countSkippedForRecipient({ tenantId, recipient })`
  5. Return `{ recipient, entries: [...], skippedCount }`
- [X] T054 [US3] Register `ListConsentsByRecipientUseCase` in `apps/backend/src/main/container.ts` and add to `NotificationRouteContainer` interface.
- [X] T055 [US3] Add `GET /v1/notifications/consents` route in `apps/backend/src/modules/notification/interfaces/notification.routes.ts` — authenticated, validates query with `listConsentsQuerySchema`, calls the use case, returns 200 JSON with the contract shape.
- [X] T056 [US3] Integration test for the operator lookup endpoint in `apps/backend/tests/integration/notification/consent-endpoints.routes.test.ts` — happy path returns the list + count; 403 for CL_ADMIN / CL_USER / INSP; OP can only see records within their own tenant (assert tenant isolation); empty recipient returns 400 VALIDATION_ERROR.

**Checkpoint**: Operators can look up consent status for any recipient within their scope. RBAC is enforced. Tenant isolation is verified.

---

## Phase 7: User Story 4 — Operator overrides opt-out (Priority: P2)

**Goal**: AM/OP actors can flip a recipient's opt-out back to opted-in with a mandatory reason. Audited.

**Independent Test**: Opt out a recipient → as OP, POST `/v1/notifications/consents/:id/override` with reason → verify the record is opted-in, changeSource is `operator_override`, reason is persisted, audit record is written. Missing reason → 400.

### Tests for US4

- [X] T057 [P] [US4] Write unit tests for `OverrideConsentUseCase` in `apps/backend/tests/unit/notification/override-consent.use-case.test.ts` — cases: happy path flips status and records reason + actor, missing reason rejected (Zod), 403 for CL_ADMIN, tenant scope violation rejected when OP tries to override another tenant's record, 404 when consent id does not exist, audit record written exactly once with the reason and `consent.override_opted_in` action.

### Implementation for US4

- [X] T058 [US4] Create `apps/backend/src/modules/notification/application/use-cases/override-consent.use-case.ts` — `execute({ consentId, reason, actor })`:
  1. `assertRoles(actor, ['AM', 'OP'], { action: 'consent.override', entityType: 'NotificationConsent', entityId: consentId })`
  2. Load consent record; throw `ConsentNotFoundError` if missing
  3. `assertTenantScope(actor, consent.tenantId, ...)` — OP can only override within own tenant
  4. Capture `before` snapshot
  5. Call `consent.markOptedIn(source: 'operator_override', changedByUserId: actor.userId, reason)`
  6. Persist via repo update
  7. Write audit record with action `consent.override_opted_in`, `reason`, before/after
  8. Return the updated entity
- [X] T059 [US4] Add `ConsentNotFoundError` to `apps/backend/src/modules/notification/domain/notification.errors.ts` (or existing errors file) — code `CONSENT_NOT_FOUND`, 404.
- [X] T060 [US4] Register `OverrideConsentUseCase` in `apps/backend/src/main/container.ts`.
- [X] T061 [US4] Add `POST /v1/notifications/consents/:id/override` route in `apps/backend/src/modules/notification/interfaces/notification.routes.ts` — authenticated, validates body with `overrideConsentSchema`, calls the use case, returns 200 JSON with the updated consent record.
- [X] T062 [US4] Add integration tests to `apps/backend/tests/integration/notification/consent-endpoints.routes.test.ts` — happy path, 400 missing reason, 403 for CL_ADMIN, 404 for unknown id, tenant isolation for OP.

**Checkpoint**: Operators can override opt-outs. Audit trail is complete. Tenant scoping is enforced.

---

## Phase 8: User Story 6 — Recipient re-subscribes via link (Priority: P3)

**Goal**: The public unsubscribe confirmation page shows a "Re-subscribe" link that flips the consent back to opted-in.

**Independent Test**: Opt out → confirmation page shows re-subscribe link → click → status flips to opted-in with source `re_opt_in` → trigger reminder → delivered.

### Tests for US6

- [X] T063 [P] [US6] Write unit tests for `ReOptInUseCase` in `apps/backend/tests/unit/notification/re-opt-in.use-case.test.ts` — valid token flips status to opted-in, `changeSource = 're_opt_in'`, audit record written with `consent.re_opted_in_via_link`, expired token rejected.

### Implementation for US6

- [X] T064 [US6] Create `apps/backend/src/modules/notification/application/use-cases/re-opt-in.use-case.ts` — takes token, verifies via `UnsubscribeTokenService`, finds the consent record by scope, calls `consent.markOptedIn('re_opt_in')`, persists, writes audit `consent.re_opted_in_via_link` with `actorType: 'ANONYMOUS'`.
- [X] T065 [US6] Register `ReOptInUseCase` in `apps/backend/src/main/container.ts`.
- [X] T066 [US6] Add `POST /v1/notifications/re-opt-in` route in `apps/backend/src/modules/notification/interfaces/notification.routes.ts` — public (no auth), accepts token in body, calls the use case, returns 200 HTML success page.
- [X] T067 [US6] Update `unsubscribe-page.html` — add the "Changed your mind?" link on the post-confirm success page pointing to the re-opt-in endpoint (or a re-opt-in form with the token).
- [X] T068 [US6] Add an integration test to `apps/backend/tests/integration/notification/unsubscribe-public-flow.routes.test.ts` covering the full round-trip: opt out → confirmation page contains re-opt-in link → POST re-opt-in → status flipped → audit record written → reminder delivered.

**Checkpoint**: Self-service re-subscription works via the same token.

---

## Phase 9: Frontend (Operator UI)

**Purpose**: Minimal operator UI for consent lookup and override. Template classification display on the existing templates page.

- [X] T069 [P] Create `apps/web/src/features/notifications/components/NotificationClassChip.tsx` — small display helper. Shows a colored chip with `TRANSACTIONAL` (green), `OPERATIONAL` (blue), `MARKETING` (gray).
- [X] T070 [P] Extend the notification templates page at the file path **pinned during T001 verification** (recorded in the T001 deliverable) to show `notificationClass` via `NotificationClassChip`, and allow editing via a select input. Protected codes display as read-only (use `PROTECTED_TEMPLATE_CLASSIFICATIONS` mirrored on the frontend OR rely on the backend 400 error returned on invalid reclassification). If T001 discovered that no templates page exists yet in the frontend, downgrade this task to "Skip — no templates page exists; admin editing of classification is backend-only for now" and move the UI work to a follow-up.
- [X] T071 [P] Create `apps/web/src/features/notifications/hooks/useConsentLookup.ts` — React Query hook that calls `GET /v1/notifications/consents` with `recipient`, `tenantId?`, `channel?` params. Returns `{ data, isLoading, isError }`.
- [X] T072 Create `apps/web/src/features/notifications/components/ConsentLookup.tsx` — AM/OP only via `usePermissions().hasRole('AM', 'OP')`. Input for recipient (email or phone), a search button, and a results table showing each consent record with channel, class, status (opted-in/opted-out chip), changedAt, changeSource, reason. Below the table, display the `skippedCount`.
- [X] T073 Create `apps/web/src/features/notifications/components/ConsentOverrideModal.tsx` — form with mandatory reason textarea, "Confirm Override" primary button. Calls `POST /v1/notifications/consents/:id/override`, shows success snackbar, refetches the lookup.
- [X] T074 Mount `ConsentLookup` as a page or drawer accessible from the Notifications feature navigation (or from an existing operator admin area). Add a route if needed.
- [X] T075 Component unit tests for `NotificationClassChip`, `ConsentLookup`, `ConsentOverrideModal`.
- [X] T076 Run frontend tests: `pnpm --filter web test` — all green. Run typecheck: `pnpm --filter web typecheck` — clean.

**Checkpoint**: Operators have a working UI to inspect and override consent. Templates show classification.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Full verification, regression safety, docs.

- [X] T077 Run full backend test suite: `pnpm --filter backend test` — all previously green tests must still pass. Zero regressions in transactional delivery path.
- [X] T078 [P] Run full frontend test suite: `pnpm --filter web test` — all green.
- [X] T079 [P] Run typecheck on all workspaces: `pnpm typecheck` — clean exit.
- [X] T080 [P] Run lint on modified packages: `pnpm --filter backend lint && pnpm --filter web lint && pnpm --filter @properfy/shared lint` — clean.
- [X] T081 Transactional delivery invariant audit: write a dedicated integration test (if not already covered by T031) that seeds consent records opting out a recipient on ALL channels for OPERATIONAL, then triggers every protected template code (`INSPECTION_CONFIRMED`, `INSPECTION_RESCHEDULED`, `INSPECTION_CANCELLED`, `INSPECTION_UNAVAILABILITY_REPORTED`) and asserts **all** are delivered and none are `SKIPPED_OPT_OUT`. Add the test to `apps/backend/tests/integration/notification/consent-enforcement.routes.test.ts`.
- [X] T082 Audit-count invariant check: for each of the 4 consent-changing flows (unsubscribe via link, re-opt-in via link, operator override, send-skip), run the integration test and assert **exactly one** audit record is written per operation — not zero, not two.
- [X] T083 Update the remaining operational template bodies to include the `{{unsubscribeUrl}}` footer link (the ones not already updated in T036). Affected templates: all in `DEFAULT_TEMPLATE_CLASSIFICATIONS`.
- [X] T084 Manual smoke test: open an operational email in the dev mailer → verify the unsubscribe link → click it → verify the HTML confirmation page → confirm → verify the success page and re-subscribe link → log in as OP → look up the recipient → verify the opt-out is visible → override with reason → verify the flip.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — verification only
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories (schema + enums + domain + repository)
- **US5 (Phase 3)**: Depends on Phase 2 — **prerequisite for US1 and US2**
- **US2 (Phase 4)**: Depends on Phase 2 + US5 (needs `notificationClass` on templates and notifications). **Critical path — most risky wave.**
- **US1 (Phase 5)**: Depends on Phase 2 + US2 (needs send-flow enforcement to already work for the round-trip test). Note: the unsubscribe token service can actually start in parallel with US5/US2, but the integration test depends on US2.
- **US3 (Phase 6)**: Depends on Phase 2 only — can run in parallel with US2, US4
- **US4 (Phase 7)**: Depends on Phase 2 only — can run in parallel with US2, US3
- **US6 (Phase 8)**: Depends on US1 (reuses the unsubscribe token service and page template)
- **Frontend (Phase 9)**: Depends on Phase 2 + US3 + US4 (needs the operator endpoints and `notificationClass` on the shared response schema)
- **Polish (Phase 10)**: Depends on all previous phases

### User Story Dependencies

- **US5 (P1)**: After Phase 2 — **must be done first** (prerequisite for US1 and US2)
- **US2 (P1)**: After US5 — critical path
- **US1 (P1)**: After US2 — completes the public unsubscribe surface
- **US3 (P2)**: After Phase 2 — independent from US1/US2, can parallel
- **US4 (P2)**: After Phase 2 — independent, can parallel with US3
- **US6 (P3)**: After US1 — extends the same token flow

### Parallel Opportunities

- **Phase 2**: T002-T006 (schema) are sequential; T009-T014 (shared schemas) can run in parallel; T016-T018 (domain entities) can run in parallel; T019-T021 (constants, repository) can run in parallel after domain
- **Phase 3 (US5)**: Tests (T023) and implementation (T024-T028) are serial by design (TDD)
- **Phase 4 (US2)**: Tests T029-T031 in parallel; implementation T032-T036 is serial because they modify the same hot path
- **Phase 5 (US1)**: Tests T039-T043 in parallel; implementation T044-T049 is mostly serial (same route file)
- **Phases 6-7 (US3, US4)**: Can run in full parallel — different use cases, different files
- **Phase 9 (frontend)**: T069-T071 are fully parallel; T072-T074 are serial inside the consent lookup area

---

## Implementation Strategy

### MVP First (Phases 1-5: US5 + US2 + US1)

1. **Phase 1** — verify prerequisites
2. **Phase 2** — schema, enums, domain, repository (foundational)
3. **Phase 3 (US5)** — template classification (prerequisite)
4. **Phase 4 (US2)** — send-flow enforcement (critical path)
5. **Phase 5 (US1)** — public unsubscribe flow
6. **STOP and VALIDATE**: transactional delivery invariant preserved; opt-out flow works end-to-end from email click to skipped next reminder. This is the legal-compliance MVP.

### Incremental Delivery

1. Setup + Foundational → schema and contracts ready
2. US5 → templates classified → template classification testable independently
3. US2 → send-flow enforcement → transactional bypass verified, operational opt-out respected
4. US1 → public unsubscribe round-trip → legal compliance milestone
5. US3 → operator visibility → troubleshooting unblocked
6. US4 → operator override → exceptional cases covered
7. US6 → self-service re-subscribe → UX polish
8. Frontend → operator UI → full feature surface
9. Polish → full verification pass

### Parallel Team Strategy

With multiple developers after Phase 2:
- **Dev A**: US5 → US2 → US1 (the critical path, serial)
- **Dev B**: US3 (operator lookup)
- **Dev C**: US4 (operator override)
- **Dev D**: Frontend scaffolding (starts as soon as shared schemas are defined in Phase 2)

Dev A's path is the bottleneck because US1 and US6 depend on it.

---

## Notes

- **Implemented reality**: `NotificationConsent` table, entity, repository, `ProcessUnsubscribeUseCase`, and public unsubscribe route already exist. This file extends them rather than creating parallel structures.
- **Critical path**: Phase 4 (US2) is the highest-risk wave. The transactional-bypass branch must be tested **before** touching anything else. The existing `SendNotificationUseCase` has unit test coverage that must continue to pass after every edit.
- **Protected templates are hardcoded**: The list of 4 protected codes is in `notification.constants.ts`. Changing this list requires a spec amendment.
- **`SKIPPED_OPT_OUT` is a new distinct status**: Existing `SKIPPED` rows are untouched. Code paths that filter by `status === 'SKIPPED'` must be grep-verified during implementation.
- **Marketing is dead code in Phase 1**: The `MARKETING` branch exists for future-proofing and is covered by a test, but no templates use it.
- **SMS STOP keyword handling**: Deferred per GAP-003 of 018. Phase 1 is link-based only.
- **WhatsApp Business consent**: Deferred per GAP-004 of 018.
- **Consent data export (GDPR/LGPD)**: Deferred per GAP-005 of 018.
- **Bulk preference management**: Deferred per GAP-006 of 018.
- **Tenant portal preference page**: Deferred per GAP-002 of 018.
- **Unsubscribe page is server-rendered HTML**: Not routed through the SPA. This keeps the flow decoupled from frontend auth.
- **Audit records are append-only** via the shared `AuditService`. Every consent change writes exactly one record — this is enforced by T082.
- **The 009 notification engine is not modified**: only extended at a single branching point in `SendNotificationUseCase`. Template renderer, retry logic, attempt tracking, and webhooks are untouched.
