# Research: Consent & Notification Preferences

**Feature**: 018-consent-notification-prefs
**Date**: 2026-04-10

## Research Summary

This research verifies the actual state of the notification module against the spec's assumptions. The spec says "NOT IMPLEMENTED — no consent model, unsubscribe flow, or preference tracking exists" — but exploration found a **substantial skeleton already in place** from the 009 implementation. This research documents what exists, what needs extension, and what needs to be built from scratch.

---

## R1: Existing Consent Table & Entity

**Decision**: Extend the existing `NotificationConsent` table and entity rather than creating a new one.

**Evidence**:
- Prisma model `NotificationConsent` exists with fields: `id`, `recipient`, `channel`, `tenantId`, `optedOut`, `optedOutAt`, `createdAt`, `updatedAt`. Unique constraint on `(recipient, channel, tenantId)`.
- Domain entity `NotificationConsentEntity` exists at `apps/backend/src/modules/notification/domain/`.
- Existing `SendNotificationUseCase` already calls `consentRepo` and skips delivery with `SKIPPED` + `failureReason = 'CONSENT_OPT_OUT'`.

**Gap**: The existing table has no `notificationClass` — opt-out is per `(recipient, channel, tenant)` globally, not per class. 018 requires per-class scoping so operational opt-out does not block transactional delivery.

**Approach**:
- Add `notification_class` column to `notification_consent`
- Add `change_source`, `reason`, `changed_by_user_id` columns for audit trail
- Default existing rows: `notification_class = 'OPERATIONAL'` (matches historical intent — the original consent flag was intended for reminders)
- Update the unique constraint to `(recipient, channel, tenantId, notificationClass)`

**Alternatives considered**:
- New `notification_consent_v2` table — rejected, adds complexity and leaves the old table orphaned
- Multi-row per recipient (one row per class) with no default — rejected, existing rows would lose their meaning on migration

---

## R2: Send Flow Consent Check

**Decision**: Extend the existing consent branch inside `SendNotificationUseCase` with a classification-aware switch. Do not create a new use case.

**Evidence**:
- `SendNotificationUseCase` already queries the consent repo at the top of `execute()` and skips delivery if `optedOut === true`.
- The missing piece is classification awareness: the current code treats all notifications the same, which would block transactional messages if a recipient opted out.

**Approach**:
- Load the template's `notificationClass` (or, better, stamp it on the `Notification` entity at creation time so the send worker doesn't re-read the template)
- Switch on the class:
  - `TRANSACTIONAL` → bypass consent check entirely, proceed to dispatch (FR-013)
  - `OPERATIONAL` → existing consent check stays, but scoped to the OPERATIONAL class
  - `MARKETING` → no opt-in exists in Phase 1 → blocked (effectively dead code since no templates use this class)

**Rationale**: Stamping `notificationClass` on the `Notification` entity at creation time decouples the send worker from the template. If the template class is later changed, in-flight notifications keep their original class (matches spec edge case "Template class change does not retroactively re-send").

**Alternatives considered**:
- Look up the template class at send time — rejected, adds an extra DB read in the hot path and breaks the "class change does not retroactively affect existing notifications" rule
- Dedicated `ConsentEnforcementService` — rejected, overkill for a single branching point

---

## R3: Unsubscribe Token

**Decision**: Extract the existing HMAC-SHA256 token helpers from `process-unsubscribe.use-case.ts` into a domain service `UnsubscribeTokenService` with explicit verification including 30-day expiry.

**Evidence**:
- The `process-unsubscribe.use-case.ts` already contains `generateUnsubscribeToken(recipient, channel, tenantId, secret)` and `buildUnsubscribeUrl(...)` helpers using HMAC-SHA256 and base64url encoding.
- The helpers don't yet encode expiry and don't validate it on the verify path.

**Approach**:
- Move the helpers into `unsubscribe-token.service.ts`
- Token payload becomes: `{ recipient, channel, tenantId, notificationClass, exp }` where `exp` is a Unix timestamp 30 days in the future
- Verify method returns `{ valid: boolean, payload?: TokenPayload, reason?: 'expired' | 'invalid_signature' | 'malformed' }`
- Use `crypto.timingSafeEqual` (already the existing pattern)

**Token secret**: Reuse the existing `UNSUBSCRIBE_TOKEN_SECRET` env var (or create it if missing — verify during implementation). Do not hardcode.

**Alternatives considered**:
- JWT with standard library — rejected, more dependencies and more surface area than we need for a simple signed payload
- Server-side token store (generate random id, look up in DB) — rejected, adds DB round trip and doesn't scale gracefully for stateless unsubscribe

---

## R4: Unsubscribe Link in Email Footer

**Decision**: Inject `unsubscribeUrl` as a variable into the Handlebars render context when sending operational emails. Templates reference it via `{{unsubscribeUrl}}`.

**Evidence**:
- `TemplateRendererService` uses Handlebars and accepts a generic `variables: Record<string, unknown>` object (confirmed from exploration)
- Existing operational templates (reminders, escalations) do not currently reference `{{unsubscribeUrl}}` — they need updating on the data-migration side

**Approach**:
- In `SendNotificationUseCase`, before calling the renderer for OPERATIONAL emails, build the unsubscribe URL using `UnsubscribeTokenService.buildUrl(...)` and add it to the variables object
- Template authors (or the seeder) add `<a href="{{unsubscribeUrl}}">Unsubscribe</a>` to the footer of each OPERATIONAL template
- For TRANSACTIONAL templates, the variable is not set (empty string fallback) — transactional templates must NOT include the unsubscribe link per spec

**Data migration**: Update existing operational template bodies to include the footer link as part of the 018 Wave 1 data migration. This touches the seeded template content, not the schema.

**Alternatives considered**:
- Post-render string injection — rejected, fragile and breaks HTML well-formedness
- Separate "footer template" column — rejected, adds schema complexity for a single concern

---

## R5: Public Unsubscribe Confirmation Page

**Decision**: Server-side render a simple HTML page from the Fastify route using a string template (or Handlebars) loaded from a single file. Do NOT route through the SPA.

**Rationale**: The unsubscribe flow must work without the frontend bundle loaded. A self-contained HTML response keeps it decoupled from SPA routing, auth, and CSP concerns.

**Approach**:
- `GET /v1/notifications/unsubscribe?token=...` → route handler calls `RenderUnsubscribePageUseCase`, which validates the token and returns `{ ok: true, recipient, channel, class }` or `{ ok: false, reason: 'expired' | 'invalid' }`
- Route handler reads `unsubscribe-page.html` from disk (or a bundled string), interpolates the context, and returns it with `Content-Type: text/html`
- The HTML includes a form `POST`ing back to `/v1/notifications/unsubscribe` with the token to confirm
- After confirmation, show a success message with a "Changed your mind?" re-opt-in link

**Alternatives considered**:
- Route through the SPA — rejected, couples unsubscribe to frontend auth and loading state
- Full Handlebars template engine with partials — rejected, overkill for 2 pages

---

## R6: Operator Consent Lookup

**Decision**: New endpoint `GET /v1/notifications/consents?recipient=...&channel=...` returning all consent records for the recipient across all channels/classes. Restricted to AM/OP via `AuthorizationService`.

**Shape**:
```typescript
{
  recipient: string;
  entries: Array<{
    id: string;
    channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
    notificationClass: 'TRANSACTIONAL' | 'OPERATIONAL' | 'MARKETING';
    status: 'OPTED_IN' | 'OPTED_OUT';
    changedAt: string | null;
    changeSource: 'unsubscribe_link' | 'operator_override' | 're_opt_in' | null;
    reason: string | null;
  }>;
  skippedCount: number; // number of notifications SKIPPED_OPT_OUT for this recipient
}
```

**Tenant scoping**: AM and OP are both cross-tenant per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003 — they may query any tenant via the optional `?tenantId=` query parameter; when omitted, results span all tenants. Superseded phrasing: "AM can query across tenants (with a mandatory `tenantId` query param). OP is scoped to own tenant (enforced via `authContext.tenantId`)".

**Skipped count**: A single aggregation query on the notification table `WHERE status = 'SKIPPED_OPT_OUT' AND recipient = ... AND tenant_id = ...`.

---

## R7: Operator Override

**Decision**: `POST /v1/notifications/consents/:id/override` with body `{ reason: string }`. AM/OP only. Audited.

**Behavior**:
- Look up the consent record by id
- Validate tenant scope (OP can only override within own tenant)
- Flip `optedOut = false`, set `changeSource = 'operator_override'`, `changedByUserId = actor.userId`, `reason = body.reason`, `changedAt = now`
- Write audit record with before/after
- Return the updated consent record

**Reason mandatory**: enforced by Zod schema `min(1)`.

---

## R8: Protected Template Classifications

**Decision**: A hardcoded map in `notification.constants.ts` lists template codes and their mandatory (immutable) classification. The upsert use case consults this map and rejects reclassification attempts with `PROTECTED_TEMPLATE_CLASSIFICATION`.

**Approach**:
```typescript
export const PROTECTED_TEMPLATE_CLASSIFICATIONS: Record<string, NotificationClass> = {
  INSPECTION_CONFIRMED: 'TRANSACTIONAL',
  INSPECTION_RESCHEDULED: 'TRANSACTIONAL',
  INSPECTION_CANCELLED: 'TRANSACTIONAL',
  INSPECTION_UNAVAILABILITY_REPORTED: 'TRANSACTIONAL',
  // Others default to OPERATIONAL but are NOT protected (operators can reclassify)
};
```

**Rationale**: The spec explicitly names these 4 templates as mandatory TRANSACTIONAL. Any attempt to reclassify them should fail fast.

**Default classifications for non-protected templates** (FR-006):
- `REMINDER_7_DAYS`, `REMINDER_5_DAYS`, `REMINDER_3_DAYS`, `REMINDER_*_SMS` → OPERATIONAL
- `PROPERTY_MANAGER_ESCALATION` → OPERATIONAL
- `INSPECTION_NOTICE` → OPERATIONAL
- `TENANT_SMS_ALERT` → OPERATIONAL
- `REPORT_READY` → OPERATIONAL (default; can be reclassified)

---

## R9: `SKIPPED_OPT_OUT` vs existing `SKIPPED`

**Decision**: Add `SKIPPED_OPT_OUT` as a new distinct value in the `NotificationStatus` enum, alongside the existing `SKIPPED`.

**Rationale**:
- Existing `SKIPPED` status is used for other reasons (inactive tenant, template not found, etc.) and has historical data
- `SKIPPED_OPT_OUT` is semantically distinct — it's a consent decision, not a technical skip
- Adding a new enum value is additive; no existing rows need migration
- The operator consent-lookup endpoint needs an exact count of consent-driven skips, which is easier to query against a distinct status value

**Migration**:
- Add `'SKIPPED_OPT_OUT'` to the Postgres enum via `ALTER TYPE NotificationStatus ADD VALUE`
- Existing `SKIPPED` rows are untouched

**Code changes**:
- `SendNotificationUseCase` transitions to `SKIPPED_OPT_OUT` instead of `SKIPPED` when blocked by consent
- List endpoints and UI that filter by status need to include the new value
- Grep for `status === 'SKIPPED'` to find any downstream consumers

---

## R10: Audit Trail for Consent Changes

**Decision**: Every consent change produces one audit record via the shared `AuditService`. Source, actor, reason, before/after all captured.

**Action codes**:
- `consent.opted_out_via_link` — from public unsubscribe
- `consent.re_opted_in_via_link` — from public re-opt-in link
- `consent.override_opted_in` — from operator override
- `consent.override_opted_out` — not a flow in Phase 1 (operators can only re-enable; opt-out goes through the public flow)

**Metadata**:
```typescript
{
  action: 'consent.opted_out_via_link',
  actorType: 'ANONYMOUS' | 'USER',
  actorId: actor?.userId ?? null,
  entityType: 'NotificationConsent',
  entityId: consentId,
  tenantId,
  before: { optedOut: false, ... },
  after:  { optedOut: true, changeSource: 'unsubscribe_link', ... },
  reason: ..., // for operator override
}
```

---

## R11: Marketing Class Handling

**Decision**: `MARKETING` is a reserved enum value in Phase 1. No templates use it, no opt-in collection exists, and the send flow treats marketing as blocked (no explicit opt-in record found → don't send).

**Rationale**: The enum is needed for future-proofing. Building it now is cheap (one enum value). Creating a marketing opt-in collection flow is out of scope.

**Enforcement**: In `SendNotificationUseCase`, if `notification.notificationClass === 'MARKETING'` → look up an opt-in consent record; if none exists, skip with `SKIPPED_OPT_OUT`. In Phase 1 this branch is effectively dead code because no templates produce marketing notifications.

---

## Unknowns Resolved / Remaining

| Unknown | Status |
|---------|--------|
| Does the consent table already exist? | Resolved: yes, extend it |
| Is there already a send-flow consent check? | Resolved: yes, extend the branch |
| Is there an unsubscribe token helper? | Resolved: yes, extract to domain service |
| What is the template rendering engine? | Resolved: Handlebars, variables passed as object |
| How are public endpoints handled? | Resolved: reuse Fastify route without auth middleware |
| Does `SKIPPED_OPT_OUT` need a new enum value? | Resolved: yes — new value added alongside `SKIPPED` |
| How should the confirmation page be rendered? | Resolved: server-side HTML from the route |
| Is there rate limiting on public endpoints? | **Flagged**: existing platform rate limiter can be applied. Not added in this pass unless trivial. |
| SMS STOP keyword handling | **Deferred**: GAP-003 — provider-dependent |
| WhatsApp Business consent | **Deferred**: GAP-004 |

No unresolved `NEEDS CLARIFICATION` items block implementation.
