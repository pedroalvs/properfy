# Contract — Manual Consent Opt-out (L-F06-03)

## `POST /v1/notifications/consents/opt-out`

**Auth**: AM / OP only; `assertTenantScope(actor, tenantId)` identical to `POST /v1/notifications/consents/:consentId/override`.

**Request body** (`recordConsentOptOutSchema`, `packages/shared`):

```ts
z.object({
  tenantId: z.string().uuid(),
  recipient: z.string().min(3).max(320),            // email or phone; normalized as the send pipeline does
  channel: z.enum(['EMAIL', 'SMS']),
  notificationClass: z.enum(['OPERATIONAL']).default('OPERATIONAL'),
  reason: z.string().trim().min(1).max(1000),
})
```

**Responses**
- `200 { data: ConsentRecordOutput }` — same shape as `GET /v1/notifications/consents`. Creates/updates the `notification_consents` row with `opted_out = true`, `change_source = 'operator_override'`, `changed_by_user_id`, `reason`; audit `consent.operator_opted_out`. Idempotent (already opted-out → 200, no new write/audit).
- `400 VALIDATION_ERROR` — empty/oversized reason, bad channel (`PUSH`), malformed body.
- `401` — no auth.
- `403` — CL_ADMIN / CL_USER / INSP, or out-of-tenant-scope for a tenant-pinned actor.

**Behaviour contract**
- `recipient` normalized to the exact value `SendNotificationUseCase` passes to `findByScope` (phone → E.164 `+61…`; email → lowercased). Proven by: after the opt-out, `isBlockedByConsent({ tenantId, recipient, channel: 'SMS', notificationClass: 'OPERATIONAL' })` returns `true`.
- No migration — reuses the existing `operator_override` `ConsentChangeSource` enum value.
