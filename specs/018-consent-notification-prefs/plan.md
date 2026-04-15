# Implementation Plan: Consent & Notification Preferences

**Branch**: `015-permissions-rbac-matrix` (delivered on this integration branch) | **Date**: 2026-04-10 | **Spec**: `specs/018-consent-notification-prefs/spec.md`
**Input**: Feature specification from `/specs/018-consent-notification-prefs/spec.md`
**Plan Status**: **EXECUTED (2026-04-11)** — all 4 waves landed. See the "Execution Outcome" section at the bottom of this file for the wave-by-wave delivery record. The plan body below is preserved as the design of record.

## Summary

This feature delivers the **consent enforcement layer** on top of the existing `009-notifications` engine. It closes `009#GAP-001` by adding a formal notification classification (`TRANSACTIONAL` / `OPERATIONAL` / `MARKETING`), extending the existing `NotificationConsent` table with per-class tracking and audit fields, gating the send flow on consent for non-transactional notifications, and providing operator visibility and override.

**What this feature does:**
- Classifies every notification template as `TRANSACTIONAL`, `OPERATIONAL`, or `MARKETING`
- Stamps classification onto every created `Notification` so the send worker can gate delivery without re-reading the template
- Enforces consent at send time: `TRANSACTIONAL` always ships; `OPERATIONAL` respects per-recipient opt-out per channel per tenant; `MARKETING` is deferred (no templates exist in Phase 1)
- Renders unsubscribe links into operational email footers with HMAC-signed, 30-day tokens
- Extends the existing unsubscribe use case to enforce token expiry and write audit records
- Adds operator endpoints and a minimal admin view to look up and override consent
- Adds a public unsubscribe confirmation page (HTML) and a re-opt-in link

**What this feature does NOT do:**
- Redesign or replace the 009 notification engine, template rendering (Handlebars), worker, retry logic, or webhooks
- Build a marketing-automation or campaign system (MARKETING class stays placeholder)
- Collect marketing opt-in (no templates exist, no collection flow needed in Phase 1 — tracked as GAP-001 of 018)
- Build a tenant-portal preference page (future enhancement — GAP-002 of 018)
- Implement bulk preference import/export (GAP-006)
- Integrate provider-specific consent APIs (SMS STOP keyword handling via provider, WhatsApp Business consent) — deferred as GAP-003 / GAP-004 of 018
- Export consent data for compliance requests (GAP-005)

### Implemented Reality vs Approved Target (pre-implementation snapshot, 2026-04-10)

> **Editorial note (2026-04-11):** the table below is the **pre-implementation** snapshot captured during planning. It is preserved for traceability. The post-implementation state is in the "Execution Outcome" section at the bottom of this file — every row below that was marked "MISSING" is now delivered.

The 018 spec originally said "NOT IMPLEMENTED — no consent model, unsubscribe flow, or preference tracking exists". Exploration at plan time showed **this was significantly outdated**:

| Component | Spec status | Actual state |
|-----------|-------------|--------------|
| `NotificationConsent` table | Assumed missing | **EXISTS** — fields `recipient`, `channel`, `tenantId`, `optedOut`, `optedOutAt`. Missing: `notificationClass`, `changeSource`, `reason`, override audit fields. |
| `NotificationConsentEntity` | Assumed missing | **EXISTS** as a minimal entity |
| `ProcessUnsubscribeUseCase` | Assumed missing | **EXISTS** — HMAC-SHA256 token validation, flips `optedOut = true`. Missing: 30-day expiry check, audit trail, per-class scoping. |
| `POST /v1/notifications/unsubscribe` (public, no auth) | Assumed missing | **EXISTS** — wired in `notification.routes.ts` |
| Consent check in `SendNotificationUseCase` | Assumed missing | **EXISTS** — lines ~73-85 already call `consentRepo` and skip with `SKIPPED` status + `failureReason = 'CONSENT_OPT_OUT'`. Missing: classification-aware branching (transactional bypass). |
| `NotificationStatus.SKIPPED_OPT_OUT` | Assumed new enum value | **NOT EXACTLY** — current code reuses `SKIPPED` with a reason string. The spec's new enum value is cleaner but would be a second SKIPPED value on top of the existing one. |
| `notificationClass` on templates | Missing | **MISSING** — confirmed |
| `notificationClass` on notifications | Missing | **MISSING** — confirmed |
| Unsubscribe link in email footer | Missing | **MISSING** — `buildUnsubscribeUrl()` helper exists but is NOT injected into template payloads or appended at render time |
| 30-day token expiry | Missing | **MISSING** — confirmed |
| Operator consent lookup / override endpoints | Missing | **MISSING** — confirmed |
| Public unsubscribe confirmation page (HTML, 2-step) | Missing | **MISSING** — current endpoint flips opt-out directly on POST |
| Re-opt-in link | Missing | **MISSING** — confirmed |

**Implication**: 018 is an **extension** of existing skeleton code, not a green-field build. The plan extends existing use cases (`SendNotificationUseCase`, `ProcessUnsubscribeUseCase`) rather than replacing them, and adds missing pieces (classification, audit fields, operator UI, HTML confirmation page) on top.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 (backend), TypeScript 5.6 on React 18.3 (frontend)
**Primary Dependencies**: Fastify, Prisma ORM, Zod, Handlebars (template renderer — already present), shared `AuditService`, existing `AuthorizationService` (015), pg-boss (worker queue — already present)
**Storage**: PostgreSQL (Supabase) — extend `notification_templates`, `notifications`, and `notification_consent` tables with new columns. No new tables.
**Testing**: Vitest (unit + integration), Supertest (API), existing notification test helpers
**Target Platform**: Node.js backend API + React SPA frontend + public HTML page (server-rendered Fastify response) for unsubscribe confirmation
**Project Type**: Cross-cutting extension on top of `009-notifications` — consent enforcement layer, not an engine rewrite
**Constraints**: Must not break transactional delivery (zero tolerance for regressions in appointment confirmation / cancellation / rescheduling emails); must preserve 009 retry, attempt tracking, webhook, and template rendering behavior; must not introduce new external services
**Scale/Scope**: ~3 schema changes, ~4 new/extended use cases, ~6 new endpoints, ~2 frontend components, 1 public HTML page

### Modules / Backend Impacted

**Extended (not replaced):**
- `apps/backend/src/modules/notification/domain/notification-template.entity.ts` — add `notificationClass` field
- `apps/backend/src/modules/notification/domain/notification.entity.ts` — add `notificationClass` field (copied from template at creation time)
- `apps/backend/src/modules/notification/domain/notification-consent.entity.ts` — extend with `notificationClass`, `changeSource`, `reason`, `changedByUserId`, `changedAt`
- `apps/backend/src/modules/notification/domain/notification-consent.repository.ts` — new lookup methods: `findByRecipientAndChannelAndClass`, `listByRecipient`, `countSkippedForRecipient`
- `apps/backend/src/modules/notification/infrastructure/prisma-notification-consent.repository.ts` — new columns, new methods
- `apps/backend/src/modules/notification/application/use-cases/create-notification.use-case.ts` — read template's `notificationClass` and stamp it onto the new `Notification`
- `apps/backend/src/modules/notification/application/use-cases/send-notification.use-case.ts` — branch on `notificationClass`: `TRANSACTIONAL` bypasses consent check entirely; `OPERATIONAL` respects consent
- `apps/backend/src/modules/notification/application/use-cases/process-unsubscribe.use-case.ts` — add 30-day expiry check, record audit, scope opt-out per class
- `apps/backend/src/modules/notification/application/use-cases/upsert-notification-template.use-case.ts` — accept and persist `notificationClass`; enforce protected classifications (e.g., `INSPECTION_CONFIRMED` must be TRANSACTIONAL)
- `apps/backend/src/modules/notification/domain/template-renderer.service.ts` OR `send-notification.use-case.ts` — inject `unsubscribeUrl` into Handlebars render context for operational emails
- `apps/backend/prisma/schema.prisma` — 3 column additions, no new tables

**New use cases:**
- `apps/backend/src/modules/notification/application/use-cases/list-consents-by-recipient.use-case.ts` — operator lookup
- `apps/backend/src/modules/notification/application/use-cases/override-consent.use-case.ts` — operator override with mandatory reason
- `apps/backend/src/modules/notification/application/use-cases/re-opt-in.use-case.ts` — public re-subscribe via the confirmation page
- `apps/backend/src/modules/notification/application/use-cases/render-unsubscribe-page.use-case.ts` — small use case that builds the token-validated confirmation page payload (HTML rendered by the route)

**Extended routes:**
- `apps/backend/src/modules/notification/interfaces/notification.routes.ts`:
  - `GET /v1/notifications/consents` (new, AM/OP only) — lookup by recipient
  - `POST /v1/notifications/consents/:id/override` (new, AM/OP only) — override with reason
  - `GET /v1/notifications/unsubscribe` (new, public) — render confirmation HTML page
  - `POST /v1/notifications/unsubscribe` (already exists) — confirm opt-out; extend to write audit + per-class scoping
  - `POST /v1/notifications/re-opt-in` (new, public) — re-subscribe via same token

**Shared schemas:**
- `packages/shared/src/schemas/notification.ts` (or `consent.ts`) — new schemas: `notificationClassSchema`, `overrideConsentSchema`, `listConsentsQuerySchema`, `consentResponseSchema`
- `packages/shared/src/enums/notification.ts` — new `NotificationClass` enum, new `ConsentChangeSource` enum
- `packages/shared/src/schemas/responses.ts` — extend `notificationTemplateResponseSchema` and `notificationResponseSchema` with `notificationClass`

**Frontend:**
- `apps/web/src/features/notifications/components/ConsentLookup.tsx` — new (AM/OP only via `usePermissions()`)
- `apps/web/src/features/notifications/components/ConsentOverrideModal.tsx` — new
- `apps/web/src/features/notifications/components/NotificationClassChip.tsx` — small display helper
- `apps/web/src/features/notifications/pages/NotificationTemplatesPage.tsx` (if exists, else the list page) — extend to show and edit `notificationClass`
- Optional: a minimal consent lookup page or drawer reachable from the notifications feature

### Dependency on 009-notifications

018 depends on 009 for:
1. **Template rendering** — Handlebars engine, template cache, variable injection. 018 adds `unsubscribeUrl` to the render context for OPERATIONAL emails only.
2. **Send worker** — `SendNotificationUseCase` dispatch loop, retry logic, attempt tracking. 018 adds a classification-aware consent branch at the top of the dispatch.
3. **Template registry** — existing 14 template codes in `notification.constants.ts`. 018 adds a classification map and enforces it on upsert.
4. **Provider adapters** — Resend (email), Twilio/Zenvia (SMS), WhatsApp. 018 does NOT touch these. SMS STOP / WhatsApp Business consent are explicitly deferred.
5. **Webhook handlers** — 018 does NOT touch these.
6. **NotificationConsent table and entity** — 018 extends with new columns and methods.

018 does **not** depend on 009 for: the retry policy, webhook signature validation, attempt log, or delivery status tracking. Those stay exactly as they are.

### Dependency on 015-permissions-rbac-matrix

- `AuthorizationService.assertRoles(['AM', 'OP'], ...)` on all operator endpoints (lookup, override)
- `usePermissions()` hook for frontend UI gating
- Audit via shared `AuditService` for every consent change

### Dependency on 007-tenant-portal

- Reuse the public route pattern (no JWT, token-authenticated) for the unsubscribe confirmation page
- Reuse the HMAC-SHA256 token signing utility conceptually, though the unsubscribe token has its own helper in `process-unsubscribe.use-case.ts`

## Constitution / Risk Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Invariant | Status | Notes |
|-----------------------|--------|-------|
| I. Clean Architecture | PASS | New use cases in application, domain extensions in domain, Prisma additions in infrastructure. No route-level business logic. Template-renderer remains a domain service. |
| II. Multi-Tenant Safety | PASS | Consent is scoped per `(tenantId, recipient, channel, notificationClass)`. Every lookup, override, and enforcement query carries `tenantId`. Cross-tenant leakage is prevented by the composite key. |
| III. Test-Driven Development | PASS | Unit tests for all new/extended use cases; integration tests for public unsubscribe flow, operator override, and send-worker consent branching. Tests written before implementation in each wave. |
| IV. Contract-First APIs | PASS | All new endpoints described in a new contracts/ file; shared Zod schemas updated in `packages/shared`; OpenAPI regenerated afterwards. |
| V. Simplicity and Minimal Impact | PASS | No new modules. No new tables (only column additions). No new external services. Extends the existing notification module. |
| Notification engine sovereignty (009) | PASS | 018 branches inside the existing `SendNotificationUseCase` at a single point (classification-based consent branch). Template rendering, retry, attempts, and webhooks are untouched. |
| Audit mandatory on sensitive actions | PASS | FR-018 requires audit for every consent change. Enforced by calling `AuditService.log()` in the use cases for unsubscribe, re-opt-in, and operator override. |

### Feature-Specific Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Blocking transactional delivery** (accidentally gating INSPECTION_CONFIRMED / CANCELLED behind consent) | **CRITICAL** | The classification-aware branch in `SendNotificationUseCase` uses a strict allowlist: **if `notification.notificationClass === 'TRANSACTIONAL'` → bypass consent check entirely**. Protected template codes are enforced at upsert time and CANNOT be reclassified to OPERATIONAL. Integration test asserts that opting out a recipient and then triggering every transactional template still delivers. |
| **Compliance risk** (missing unsubscribe, no audit trail) | HIGH | Operational email footer renders the unsubscribe link unconditionally at send time. Every consent change writes an audit record with source + actor + timestamp. FR-018 coverage is asserted in integration tests. |
| **Unauthenticated unsubscribe endpoint abuse** (opt-out griefing via token guessing) | MEDIUM | Tokens are HMAC-SHA256 with server secret; 30-day expiry; two-step confirmation (GET renders page, POST confirms). Timing-safe token comparison (already used in `process-unsubscribe.use-case.ts`). Rate limiting recommended via the existing rate-limit middleware but not added in this pass. |
| **Forged unsubscribe across tenants** | MEDIUM | Token encodes `tenantId` and `recipient`; signature validation rejects any mismatch. Consent records are created/updated only for the scope in the token. |
| **Re-subscribe flow re-enables opt-out after operator override** | LOW | By design. The spec (US4) says "after an override, the recipient can re-opt-out via unsubscribe link". This is a feature, not a bug. |
| **Template classification regression** (existing templates lose classification on migration) | LOW | The migration seeds each existing template code with its default class per FR-005/FR-006. Integration test asserts the seed runs cleanly. |
| **SKIPPED_OPT_OUT enum vs existing SKIPPED status** | LOW | The plan adds `SKIPPED_OPT_OUT` as a new value alongside `SKIPPED` (which stays for other skip reasons). No existing rows need migration — existing skipped rows keep `SKIPPED`. New consent-triggered skips use `SKIPPED_OPT_OUT`. |
| **Handlebars injection of user-supplied content** | LOW | The unsubscribe URL is server-generated, not user input, and Handlebars has `noEscape: false` (HTML-escapes by default). No XSS surface added. |
| **Rollback safety of new enum column** | LOW | All new columns are nullable with defaults. `notification_class` on templates defaults to `OPERATIONAL` so existing templates continue to work while the migration is in flight. Protected templates are reclassified to `TRANSACTIONAL` in a data-migration step inside the same migration. |

## Project Structure

### Documentation (this feature)

```text
specs/018-consent-notification-prefs/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── consent-endpoints.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── enums/
│   └── notification.ts                 # EXTEND — add NotificationClass, ConsentChangeSource
└── schemas/
    ├── notification.ts                 # EXTEND — add overrideConsentSchema, listConsentsQuerySchema
    └── responses.ts                    # EXTEND — notificationTemplateResponseSchema + notificationResponseSchema

apps/backend/prisma/
├── schema.prisma                       # EXTEND — 3 column additions + enum updates
└── migrations/
    └── <timestamp>_consent_notification_prefs/
        └── migration.sql                # NEW — additive columns + data migration for template classification

apps/backend/src/modules/notification/
├── domain/
│   ├── notification-template.entity.ts        # EXTEND — add notificationClass
│   ├── notification.entity.ts                 # EXTEND — add notificationClass
│   ├── notification-consent.entity.ts         # EXTEND — add notificationClass, changeSource, reason, changedByUserId, changedAt
│   ├── notification-consent.repository.ts     # EXTEND — findByScope, listByRecipient, countSkippedForRecipient
│   ├── notification.constants.ts              # EXTEND — add DEFAULT_TEMPLATE_CLASSIFICATIONS map
│   └── unsubscribe-token.service.ts           # NEW — extracts the existing helper into a domain service with 30-day expiry
├── application/use-cases/
│   ├── create-notification.use-case.ts        # EXTEND — stamp notificationClass from template
│   ├── send-notification.use-case.ts          # EXTEND — classification-aware consent branch
│   ├── process-unsubscribe.use-case.ts        # EXTEND — 30-day expiry, audit record, per-class scope
│   ├── upsert-notification-template.use-case.ts # EXTEND — accept and validate notificationClass
│   ├── list-consents-by-recipient.use-case.ts # NEW — operator lookup
│   ├── override-consent.use-case.ts           # NEW — operator override with reason
│   ├── re-opt-in.use-case.ts                  # NEW — public re-subscribe
│   └── render-unsubscribe-page.use-case.ts    # NEW — build the confirmation page payload (token validation + render context)
├── infrastructure/
│   └── prisma-notification-consent.repository.ts  # EXTEND — new columns + new methods
└── interfaces/
    ├── notification.routes.ts                 # EXTEND — new consent endpoints + unsubscribe GET + re-opt-in
    └── unsubscribe-page.html                  # NEW — simple HTML template for the public confirmation page (Handlebars or plain string)

apps/backend/src/main/
└── container.ts                        # EXTEND — register 4 new use cases

apps/backend/tests/
├── unit/notification/
│   ├── send-notification.use-case.test.ts         # EXTEND — transactional bypass + operational enforcement
│   ├── process-unsubscribe.use-case.test.ts       # EXTEND — expiry + audit
│   ├── upsert-notification-template.use-case.test.ts  # EXTEND — classification enforcement
│   ├── list-consents-by-recipient.use-case.test.ts    # NEW
│   ├── override-consent.use-case.test.ts              # NEW
│   ├── re-opt-in.use-case.test.ts                     # NEW
│   └── render-unsubscribe-page.use-case.test.ts       # NEW
└── integration/notification/
    ├── consent-endpoints.routes.test.ts               # NEW — operator endpoints + RBAC
    └── unsubscribe-public-flow.routes.test.ts         # NEW — public GET + POST + re-opt-in

apps/web/src/features/notifications/
├── components/
│   ├── ConsentLookup.tsx                # NEW — AM/OP consent search
│   ├── ConsentOverrideModal.tsx         # NEW — override with reason
│   └── NotificationClassChip.tsx        # NEW — display helper
├── pages/
│   └── NotificationTemplatesPage.tsx    # EXTEND (if exists) — add class selector + display
└── hooks/
    └── useConsentLookup.ts              # NEW — React Query hook
```

**Structure Decision**: All changes live inside the existing `notification` module (backend) and `features/notifications` (frontend). No new modules. Additive-only Prisma migration. The public unsubscribe HTML page is served directly from the Fastify route handler (simple server-side rendering), not routed through the SPA — this keeps the unsubscribe flow fully decoupled from the frontend auth.

## Execution Strategy

### Waves

Four waves, with Wave 2 (send-flow enforcement) as the most delicate because it touches the hot path for transactional notifications.

#### Wave 1 — Schema, Domain & Classification (foundational, sequential)

1. Prisma migration:
   - Add `notification_class` (enum: `TRANSACTIONAL` | `OPERATIONAL` | `MARKETING`, default `OPERATIONAL`) to `notification_templates`
   - Add `notification_class` (same enum, nullable fallback to template's class) to `notifications`
   - Add `notification_class`, `change_source` (enum: `unsubscribe_link` | `operator_override` | `re_opt_in`), `reason` (text, nullable), `changed_by_user_id` (uuid FK, nullable) to `notification_consent`
   - Data migration: seed default classification for each existing template code per FR-005/FR-006 (`INSPECTION_CONFIRMED` → TRANSACTIONAL, reminders → OPERATIONAL, etc.)
   - Add `SKIPPED_OPT_OUT` to `NotificationStatus` enum (existing `SKIPPED` stays for backward compat)
2. Extend domain entities: `NotificationTemplateEntity.notificationClass`, `NotificationEntity.notificationClass`, `NotificationConsentEntity` with new fields
3. Extend shared enums: `NotificationClass`, `ConsentChangeSource`
4. Extend `IInotificationConsentRepository` interface with `findByScope(tenantId, recipient, channel, class)`, `listByRecipient(tenantId, recipient)`, `countSkippedForRecipient(tenantId, recipient)`
5. Update `PrismaNotificationConsentRepository` with new columns and methods
6. Extend `UpsertNotificationTemplateUseCase` to accept `notificationClass` and enforce the protected-template rule (FR-005)

**Checkpoint**: `pnpm --filter @properfy/shared build` clean, `pnpm --filter backend typecheck` clean, existing notification tests still green. No behavior change to the send flow yet.

#### Wave 2 — Send-flow Enforcement (critical path, serial after Wave 1)

7. Update `CreateNotificationUseCase` to stamp `notification.notificationClass` from the resolved template at creation time. This decouples the send worker from re-reading the template.
8. Update `SendNotificationUseCase` consent branch:
   - If `notification.notificationClass === 'TRANSACTIONAL'` → bypass consent check entirely, proceed to dispatch
   - If `notification.notificationClass === 'OPERATIONAL'` → call `consentRepo.findByScope(tenantId, recipient, channel, 'OPERATIONAL')`. If `optedOut === true`, transition to `SKIPPED_OPT_OUT` and record the skip reason
   - If `notification.notificationClass === 'MARKETING'` → require explicit opt-in (no such record exists in Phase 1, so marketing is effectively blocked)
9. Update send flow to inject `unsubscribeUrl` into the Handlebars render context for OPERATIONAL emails only. Build the URL using the existing `buildUnsubscribeUrl()` helper.
10. Integration test: opt out a recipient; send 3 operational notifications (all SKIPPED_OPT_OUT); send 3 transactional notifications (all delivered)

**Checkpoint**: Zero regressions in transactional delivery. Consent enforcement works on operational. Backend tests green.

#### Wave 3 — Unsubscribe Flow & Operator Endpoints (parallelizable after Wave 2)

11. Extract the token helpers into `unsubscribe-token.service.ts` with a single `verify(token)` method that checks HMAC signature AND 30-day expiry
12. Extend `ProcessUnsubscribeUseCase`:
    - Validate expiry; reject with a clear error (caught by the GET route and rendered as an "expired link" page)
    - Write audit record with source `unsubscribe_link`
    - Scope opt-out per class (pass the class from the token)
13. Create `RenderUnsubscribePageUseCase` — validates the token and returns the data needed to render the confirmation HTML
14. Create `ReOptInUseCase` — public re-subscribe, same token validation, writes audit with source `re_opt_in`
15. Add `GET /v1/notifications/unsubscribe` route — public, serves the confirmation HTML page from `unsubscribe-page.html`
16. Update `POST /v1/notifications/unsubscribe` to record the audit and per-class scoping
17. Add `POST /v1/notifications/re-opt-in` — public
18. Create `ListConsentsByRecipientUseCase` and `OverrideConsentUseCase` (both AM/OP only, audited)
19. Add operator routes:
    - `GET /v1/notifications/consents?recipient=...`
    - `POST /v1/notifications/consents/:id/override` with mandatory reason in body
20. Integration tests for all public and operator endpoints (RBAC, validation, audit emission, expired token handling)

**Checkpoint**: Full unsubscribe round-trip works end-to-end. Operators can look up and override. All audit records are produced.

#### Wave 4 — Frontend & Polish (parallelizable after Wave 3)

21. New `NotificationClassChip` display helper
22. Template page (`NotificationTemplatesPage` if it exists, else the list/detail page) — show the class, allow editing for non-protected templates
23. New `ConsentLookup` component + `useConsentLookup` hook — AM/OP only via `usePermissions().hasRole('AM', 'OP')`
24. New `ConsentOverrideModal` — form with mandatory reason, calls override endpoint, shows success snackbar
25. Optional: expose consent lookup as a small page or drawer from the Notifications feature area
26. Full verification: backend tests, frontend tests, typecheck, lint

**Checkpoint**: Operators have a working UI to inspect and override consent. Templates show and allow class editing. All tests green.

### Parallelism Opportunities

- **Inside Wave 1**: schema + shared enum changes can run in parallel with the entity updates because they touch different files
- **Inside Wave 3**: the public flow (GET unsubscribe, POST confirm, re-opt-in) and the operator flow (lookup, override) are independent and can be done in parallel
- **Across waves**: Wave 4 frontend components can start as soon as the Wave 3 shared schemas are defined — the backend doesn't need to be live

### Checkpoints per Wave

| Wave | Checkpoint Criteria |
|------|--------------------|
| 1 | Migration applies clean; shared package builds; backend typecheck clean; existing notification tests still pass |
| 2 | `SendNotificationUseCase` consent branch covered by unit tests; integration test proves transactional bypass and operational enforcement; zero regressions in existing notification test suites |
| 3 | End-to-end unsubscribe (GET → POST → audit), re-opt-in, operator lookup, operator override all covered by integration tests; 4 new audit record types emitted |
| 4 | Frontend tests + typecheck clean; manual smoke of the operator consent lookup and override flow |

## Testing Strategy

### Unit Tests (Vitest)

- **`SendNotificationUseCase`** — extended tests: `TRANSACTIONAL` bypass (opt-out exists but still sent), `OPERATIONAL` enforcement (opt-out → `SKIPPED_OPT_OUT`), `OPERATIONAL` without opt-out (normal send), `MARKETING` blocked when no opt-in exists
- **`ProcessUnsubscribeUseCase`** — extended tests: valid token → opt-out recorded, expired token → error, tampered signature → error, audit record written
- **`UpsertNotificationTemplateUseCase`** — extended tests: protected template (e.g., `INSPECTION_CONFIRMED`) cannot be reclassified to OPERATIONAL; valid classification update succeeds
- **`ListConsentsByRecipientUseCase`** (new) — returns the correct shape; AM/OP only; tenant-scoped
- **`OverrideConsentUseCase`** (new) — missing reason rejected; valid override transitions status; audit contains the reason and actor
- **`ReOptInUseCase`** (new) — valid token → status flips; audit written with source `re_opt_in`
- **`RenderUnsubscribePageUseCase`** (new) — valid token → page payload; expired token → null; invalid signature → null

### Integration Tests (Supertest)

- **Send-flow enforcement**: opt out recipient → trigger 3 operational templates → all 3 become `SKIPPED_OPT_OUT`; trigger 3 transactional templates → all 3 delivered; audit records verified
- **Public unsubscribe flow**: email send emits notification with `unsubscribeUrl` in payload; GET on the URL returns HTML page; POST confirms → consent record updated + audit; re-opt-in link works
- **Operator endpoints**: `GET /v1/notifications/consents` — 200 for AM/OP, 403 for CL_ADMIN/INSP, returns correct shape; `POST /v1/notifications/consents/:id/override` — 200 for AM/OP, 400 for missing reason, 403 for others, audit written
- **Expired token**: GET on an expired token returns a "link expired" page (HTML 200, not an API error)
- **Protected template classification**: try to change `INSPECTION_CONFIRMED` classification to `OPERATIONAL` → 400

### Enforcement in Send Flow

- **Exact-count audit assertion**: for every consent change flow (unsubscribe, re-opt-in, override), assert **exactly one** audit record is written (not zero, not two)
- **Transactional delivery invariant**: run the full list of protected template codes against an opted-out recipient and assert all are delivered (no skips)

### Public Unsubscribe Flow Safety

- **Timing-safe token comparison**: reuse the existing `timingSafeEqual` pattern from `process-unsubscribe.use-case.ts`
- **Expiry check**: compares `exp` in the token payload against `Date.now()` with no grace window
- **Tampered token rejection**: integration test with a modified signature byte asserts rejection

### Contracts

- All new endpoints described in `contracts/consent-endpoints.md`
- Shared Zod schemas define request/response shapes; the tests against the shared schemas validate payload roundtrips
- OpenAPI document regenerates cleanly after routes are added

### Out of Scope for Testing This Pass

- **Load test** for consent lookup (SC-004 "under 5 seconds") — deferred
- **E2E Playwright** for the operator UI — manual smoke is acceptable for this pass
- **SMS STOP keyword** inbound handling — deferred per GAP-003
- **WhatsApp Business consent** honoring — deferred per GAP-004

## Residual Risks and Assumptions

### Residual Risks

| Risk | Severity | Owner |
|------|----------|-------|
| Existing templates do not yet have `notificationClass` set — data migration must seed them correctly | LOW | Solved in Wave 1 data migration; protected codes mapped to TRANSACTIONAL via seed |
| Existing `NotificationConsent` rows do not have `notification_class` — must be defaulted | LOW | Default to `OPERATIONAL` on migration; existing `optedOut === true` rows become "opted out of OPERATIONAL" (which matches historical intent) |
| Operator override UX — no bulk override in Phase 1 | LOW | Explicitly deferred per spec GAP-006 |
| SMS provider may use provider-level STOP handling that doesn't write to our consent table | MEDIUM | Deferred per GAP-003; for Phase 1 we only handle opt-out via the URL/email link |
| WhatsApp Business API consent mechanism | MEDIUM | Deferred per GAP-004 |
| Consent export for GDPR/LGPD compliance | LOW | Deferred per GAP-005; the consent table is auditable via the regular audit log |
| The `SKIPPED_OPT_OUT` enum addition may require updating any code that branches on notification status | LOW | Grep-verifiable; any downstream consumer that checks `=== 'SKIPPED'` will need to include `SKIPPED_OPT_OUT` or use a helper |
| Changing `NotificationStatus` enum requires Prisma migration and grep across route responses | LOW | Part of Wave 1 |
| Rate limiting on public unsubscribe/re-opt-in endpoints | LOW | Existing platform rate limiter can be applied to these routes; not added in this pass unless trivial |

### Assumptions

1. The **default consent model is opt-out** (recipients are assumed consenting until they explicitly unsubscribe) — matches CAN-SPAM/LGPD for transactional/operational messaging on an existing business relationship. Confirmed by spec.
2. **Marketing is a placeholder** — no templates exist, no opt-in flow, no collection UI. The enum value is reserved but effectively unused in Phase 1.
3. **Inspector and property-manager notifications are TRANSACTIONAL** per FR-020. This classification is enforced at template upsert time via the protected-codes map.
4. **Unsubscribe tokens use HMAC-SHA256 with a server-side secret** — the existing helper is reused and extracted into a domain service with explicit expiry.
5. **Consent is scoped per `(tenantId, recipient, channel, notificationClass)`** — the composite key is the source of truth. Migrating existing rows preserves historical opt-outs by defaulting the class to `OPERATIONAL`.
6. **`SKIPPED_OPT_OUT` is a new, distinct enum value**, NOT a reason string on the existing `SKIPPED` status. The old `SKIPPED` status stays for other skip reasons (e.g., inactive tenant). This preserves backward compat.
7. **The public unsubscribe confirmation page is server-rendered HTML** from the Fastify route, not routed through the SPA. Keeps the flow decoupled from frontend auth and bundle.
8. **SMS STOP handling is out of scope**. Phase 1 provides a link-based opt-out consistent with email. Provider-side STOP handling is deferred to GAP-003.
9. **Handlebars template renderer is untouched**. Only the render context is extended with `unsubscribeUrl` for OPERATIONAL emails.
10. **Rate limiting on public endpoints** is the platform's existing responsibility, not this feature's concern.

### Implementation Reality vs Approved Target

See the "Implemented Reality vs Approved Target" table in the Summary section. The plan treats the existing `NotificationConsent` table, `ProcessUnsubscribeUseCase`, and public unsubscribe route as **implemented reality** and extends them with classification, audit trail, expiry, operator endpoints, and the HTML confirmation page. There is no full rewrite anywhere in the plan.

## Complexity Tracking

No constitution violations. No complexity justifications needed. The plan is additive across 3 existing entities, 4 existing use cases, and 1 existing route file; it adds 5 new use cases, 5 new endpoints, and 3 new frontend components. Migration is pure expand (columns + enum values, no drops).

---

## Execution Outcome (2026-04-11)

The plan was executed end-to-end on branch `015-permissions-rbac-matrix`. All four waves are delivered. This section is the editorial record of the delivery and does not change the design.

### Wave-by-wave delivery

| Wave | Scope | Status | Notes |
|------|-------|--------|-------|
| Wave 1 — Schema, Domain & Classification | Prisma migration, shared enums, domain entities, repository | ✅ delivered | Migration `20260411000000_consent_notification_prefs` is additive. Composite unique key `(recipient, channel, tenant_id, notification_class)` in place. Protected codes seeded to TRANSACTIONAL. |
| Wave 2 — Send-flow Enforcement (critical path) | `CreateNotificationUseCase` stamp, `SendNotificationUseCase` class-aware branch, `unsubscribeUrl` injection, OPERATIONAL template footer | ✅ delivered | Transactional bypass allowlist is the only gate for TRANSACTIONAL; zero regressions in existing send-worker tests. |
| Wave 3 — Unsubscribe Flow & Operator Endpoints | `UnsubscribeTokenService` (extracted domain service with 30-day expiry), `ProcessUnsubscribeUseCase` audit + per-class scope, `RenderUnsubscribePageUseCase`, `ReOptInUseCase`, public HTML page, operator lookup + override endpoints | ✅ delivered | 2-step public flow (GET renders HTML, POST confirms). 4 distinct audit actions emitted. Form-urlencoded parser registered inline in `main/plugins.ts`. |
| Wave 4 — Frontend & Polish | `NotificationClassChip`, `ConsentLookup`, `ConsentOverrideModal`, `useConsentLookup`, route `/notification-consents` | ✅ delivered | AM/OP only via `AuthGuard`. Template table shows the new class column. |

### Verification record

- Backend: **256 test files / 2681 tests passing** after delivery (`pnpm --filter backend test`).
- Web: **305 test files / 1891 tests passing** after delivery (`pnpm --filter web test`).
- `pnpm typecheck` clean across all workspaces.
- Backend lint: feature 018 code is lint-clean. Unrelated pre-existing errors in other modules are untouched by this feature and recorded as such.

### Deviations from the plan

- **None material.** The plan described `unsubscribe-token.service.ts` as a domain-layer extraction of an existing helper; this was executed as written. `buildUnsubscribeUrl()` and `generateUnsubscribeToken()` are kept as thin deprecated wrappers around the new service to minimize churn in existing call sites.
- `CreateNotificationUseCase` now takes `notificationTemplateRepo` as a constructor dependency (one extra arg) so it can stamp `notificationClass` at create time instead of relying only on the send-worker's fallback. This is a cleaner realization of Wave 2 item 7 than the original phrasing suggested.
- The operator UI was placed under a new `features/notification-consents` folder instead of co-locating with `features/notification-templates`. This keeps consent-lookup concerns separate from template editing concerns.

### Residuals

All six `GAP-001`..`GAP-006` entries remain **deferred non-blocking** per the spec's "Delivery Outcome → Residuals" section. There are no partial-coverage residuals and no follow-up polish items blocking downstream work.
