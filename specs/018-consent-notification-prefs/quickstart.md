# Quickstart: Consent & Notification Preferences

**Feature**: 018-consent-notification-prefs
**Branch**: `015-permissions-rbac-matrix` (continuing on current integration branch)

## What this feature does

Closes `009#GAP-001` by adding a formal notification classification (`TRANSACTIONAL` / `OPERATIONAL` / `MARKETING`), consent enforcement at send time, operational email footer unsubscribe links with 30-day HMAC tokens, a public 2-step HTML confirmation flow, and operator endpoints to look up and override consent.

## Key files to understand first

### Backend
- `apps/backend/prisma/schema.prisma` — `NotificationTemplate`, `Notification`, `NotificationConsent` models (all extended, no new tables)
- `apps/backend/src/modules/notification/application/use-cases/send-notification.use-case.ts` — existing consent branch to extend
- `apps/backend/src/modules/notification/application/use-cases/process-unsubscribe.use-case.ts` — existing token helper + opt-out flow to extend
- `apps/backend/src/modules/notification/domain/notification.constants.ts` — template codes + new `PROTECTED_TEMPLATE_CLASSIFICATIONS` map
- `apps/backend/src/modules/notification/interfaces/notification.routes.ts` — existing routes + 5 new endpoints

### Shared
- `packages/shared/src/enums/notification.ts` — add `NotificationClass`, `ConsentChangeSource`
- `packages/shared/src/schemas/notification.ts` (or a new `consent.ts`) — new schemas

### Frontend
- `apps/web/src/features/notifications/` — add consent lookup, override modal, class chip
- `apps/web/src/hooks/usePermissions.ts` — reuse for AM/OP gating

## Implementation order (matches plan waves)

### Wave 1 — Schema, Domain & Classification (foundational)

1. Edit `apps/backend/prisma/schema.prisma` — extend `NotificationTemplate`, `Notification`, `NotificationConsent`; add `NotificationClass` and `ConsentChangeSource` enums; add `SKIPPED_OPT_OUT` to `NotificationStatus`
2. Generate migration SQL file at `apps/backend/prisma/migrations/<ts>_consent_notification_prefs/migration.sql` following the shape in `data-model.md`
3. Apply with `pnpm --filter backend exec prisma migrate dev`
4. Extend `NotificationTemplateEntity`, `NotificationEntity`, `NotificationConsentEntity` with the new fields
5. Extend `packages/shared/src/enums/notification.ts` and `packages/shared/src/schemas/notification.ts` with the new enums and schemas
6. `pnpm --filter @properfy/shared build` clean
7. Extend `UpsertNotificationTemplateUseCase`:
   - Accept `notificationClass` in input
   - Consult `PROTECTED_TEMPLATE_CLASSIFICATIONS` map; reject reclassification of protected codes
   - Write unit tests first (TDD)

**Checkpoint**: `pnpm --filter backend typecheck` clean; existing notification tests still pass; shared build clean

### Wave 2 — Send-flow Enforcement (critical path)

8. Extend `CreateNotificationUseCase` to stamp `notification.notificationClass` from the resolved template
9. Extend `SendNotificationUseCase` consent branch:
   - Read `notification.notificationClass`
   - If `TRANSACTIONAL` → bypass consent check, dispatch
   - If `OPERATIONAL` → query `consentRepo.findByScope(tenantId, recipient, channel, 'OPERATIONAL')`; if `optedOut === true`, transition to `SKIPPED_OPT_OUT` with audit action `notification.skipped_opt_out`
   - If `MARKETING` → Phase 1: skip with `SKIPPED_OPT_OUT` (dead code)
10. Inject `unsubscribeUrl` into Handlebars render context for `OPERATIONAL` emails only
11. Update existing unit tests for `SendNotificationUseCase` to cover new branches; add new tests for transactional bypass and operational enforcement
12. Integration test: opt out recipient → trigger 3 operational templates → all `SKIPPED_OPT_OUT`; trigger 3 transactional templates → all delivered

**Checkpoint**: Zero regressions in transactional delivery; consent enforcement works for operational; backend tests green

### Wave 3 — Unsubscribe Flow & Operator Endpoints

13. Create `UnsubscribeTokenService` domain service — move helpers from `process-unsubscribe.use-case.ts`, add 30-day expiry to payload and verification
14. Extend `ProcessUnsubscribeUseCase`:
    - Validate via `UnsubscribeTokenService.verify()`
    - Scope opt-out per class (use `notificationClass` from the token)
    - Write audit record `consent.opted_out_via_link`
15. Create `RenderUnsubscribePageUseCase` — validates token, returns HTML render context
16. Create `ReOptInUseCase` — public re-subscribe; audit `consent.re_opted_in_via_link`
17. Add `GET /v1/notifications/unsubscribe` route — serves HTML page from `unsubscribe-page.html` file
18. Extend `POST /v1/notifications/unsubscribe` to call the extended use case
19. Add `POST /v1/notifications/re-opt-in` route
20. Create `ListConsentsByRecipientUseCase` (AM/OP only, audited read) and `OverrideConsentUseCase` (mandatory reason, audited)
21. Add `GET /v1/notifications/consents` and `POST /v1/notifications/consents/:id/override` routes
22. Integration tests for all 5 new/extended endpoints covering happy paths, 403s, validation errors, expired token, tampered token, audit emission

**Checkpoint**: End-to-end unsubscribe works; operator lookup and override work; all audit records emitted

### Wave 4 — Frontend & Polish

23. Create `NotificationClassChip.tsx` in `apps/web/src/features/notifications/components/`
24. Extend the notification templates page to show and allow editing the class (protected codes read-only)
25. Create `ConsentLookup.tsx` — search by recipient, results table, AM/OP only
26. Create `ConsentOverrideModal.tsx` — mandatory reason form, calls override endpoint
27. Create `useConsentLookup` hook (React Query)
28. Component tests + typecheck
29. Manual smoke: open an operational email in dev → verify footer has unsubscribe link → click → see confirmation page → confirm → verify consent record + audit row → log in as OP → look up recipient → override with reason → verify status flipped

## Running locally

```bash
# Install deps
pnpm install

# Apply migration (dev)
pnpm --filter backend exec prisma migrate dev

# Start backend
pnpm --filter backend dev

# Start web frontend
pnpm --filter web dev

# Run backend tests
pnpm --filter backend test

# Run frontend tests
pnpm --filter web test

# Typecheck everything
pnpm typecheck
```

## Test the end-to-end flow (after implementation)

1. Seed a CLOSED appointment and trigger an inspection notice (OPERATIONAL template)
2. Check the recipient's inbox in the dev mailer → the email footer contains an unsubscribe link
3. Click the link → confirmation HTML page appears with a "Confirm Unsubscribe" button
4. Click confirm → success page appears with a "Changed your mind?" re-subscribe link
5. Trigger another reminder for the same recipient → verify it's `SKIPPED_OPT_OUT` in the notification list
6. Trigger a transactional notification (e.g., `INSPECTION_CONFIRMED`) → verify it's delivered
7. As an OP user, look up the recipient in the operator consent page → verify the opt-out status, change source, and skipped count
8. Click "Override" → enter a reason → submit → verify status flips to opted-in
9. Trigger another reminder → verify it's delivered (no longer skipped)
10. Click the re-subscribe link from the original confirmation page → verify status flips back to opted-in with source `re_opt_in`

## Key design decisions

- **No new database tables** — only column additions on 3 existing tables
- **No new module** — everything lives in `modules/notification`
- **Server-side HTML for unsubscribe page** — decoupled from the SPA, no auth needed
- **`SKIPPED_OPT_OUT` is a new distinct enum value** — preserves the existing `SKIPPED` status for other skip reasons
- **Classification stamped on `Notification` at creation time** — decouples the send worker from the template and preserves the "class change doesn't retroactively affect existing notifications" invariant
- **`TRANSACTIONAL` always ships** — zero consent check for protected classes; this is the most critical invariant
- **Protected template codes are hardcoded** in `PROTECTED_TEMPLATE_CLASSIFICATIONS` — prevents accidental reclassification of critical templates
- **Unsubscribe tokens are stateless** — HMAC-SHA256 with 30-day expiry; no DB lookup needed
- **Marketing class is a placeholder** — no templates in Phase 1; the branch exists but is dead code
- **Operator override cannot permanently silence opt-out** — after an override, the recipient can re-unsubscribe via the normal link; this matches spec US4 expected behavior

## What this feature does NOT do

- Replace or redesign the 009 notification engine (template rendering, retry, webhooks — all untouched)
- Build a marketing automation system
- Collect marketing opt-in (no templates exist)
- Tenant portal preference page (future; GAP-002)
- SMS STOP keyword handling or WhatsApp Business consent (provider-dependent; GAP-003/GAP-004)
- Bulk preference management (GAP-006)
- Consent data export for compliance requests (GAP-005)
