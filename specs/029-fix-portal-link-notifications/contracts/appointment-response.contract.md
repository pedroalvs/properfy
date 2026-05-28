# Contract: GET /v1/appointments/:appointmentId — `hasActivePortalToken`

**Spec**: `../spec.md`
**Plan**: `../plan.md`
**Touched by**: Bug 2.

## Endpoint

`GET /v1/appointments/:appointmentId`

- Authorization: `AM | OP | CL_ADMIN | CL_USER | INSP` (unchanged from current behavior).
- Tenant scope: AM / OP cross-tenant; CL_ADMIN / CL_USER pinned to JWT `tenantId`; INSP further scoped to assigned appointments (unchanged).
- Idempotency: N/A (read).
- Audit: not audited (read).

## Request

No changes. Existing path parameter `appointmentId: UUID`.

## Response — affected fragment of `appointmentResponseSchema`

### Schema file

`packages/shared/src/schemas/responses.ts`

### Before

```typescript
hasActivePortalToken: z.boolean().optional(),  // line 236
```

### After

```typescript
hasActivePortalToken: z.boolean(),
```

### Semantic contract

`hasActivePortalToken === true` if and only if AT LEAST ONE row in `tenant_portal_tokens` satisfies ALL of:

1. `appointment_id = <:appointmentId>`
2. `status = 'ACTIVE'`
3. `expires_at > <Node-process-clock NOW>`

`hasActivePortalToken === false` in every other case — including:

- No token has ever been generated for this appointment.
- The most-recent token has `status = 'EXPIRED' | 'REVOKED' | 'SUPERSEDED'`.
- The most-recent token has `status = 'ACTIVE'` but `expires_at <= NOW` (a brief window of up to 15 minutes between expiry and the `tenant-portal.expire-tokens` worker — the API is **at-least-as-strict-as** the worker; never less strict).

### Clock-authority decision

The active-check is implemented in the API process using `new Date()` (Node clock). See spec AC-2.5 and `research.md §R-2`. Rationale: matches existing `expire-tokens` worker convention (`workers.ts:164-169` + `expireActiveTokens` repository method). DB-side `NOW()` was considered and rejected to keep the change minimal and convention-consistent.

## Implementation note

The check is performed via a Prisma filtered relation on `appointment.findFirst`:

```typescript
include: {
  tenant_portal_tokens: {
    where: {
      status: 'ACTIVE',
      expires_at: { gt: new Date() },
    },
    select: { id: true },
    take: 1,
  },
}
```

The use case derives the boolean via `found.tenant_portal_tokens.length > 0` (exact field name confirmed by `prisma generate` during implementation).

## Tests required (AC-2.1, AC-2.2, AC-2.3)

| Test case | Setup | Expected `hasActivePortalToken` |
|---|---|---|
| TC-1 | Appointment with no tokens | `false` |
| TC-2 | Token with `status='ACTIVE'`, `expires_at = NOW + 1h` | `true` |
| TC-3 | Token with `status='ACTIVE'`, `expires_at = NOW - 1ms` (the race window) | `false` |
| TC-4 | Token with `status='REVOKED'`, regardless of `expires_at` | `false` |
| TC-5 | Token with `status='SUPERSEDED'`, regardless of `expires_at` | `false` |
| TC-6 | Token with `status='EXPIRED'`, regardless of `expires_at` | `false` |
| TC-7 | Two tokens for the same appointment — one ACTIVE+valid, one SUPERSEDED — boolean reflects the ACTIVE one | `true` |
| TC-8 | Field present in JSON payload (non-optional check) | key exists with `boolean` type in every successful response |

## Backward-compatibility

See `data-model.md` §Backward-compatibility audit. Zero break risk; all known monorepo consumers already type the field as optional on receive, so promotion to required is strict strengthening.

## Out-of-scope

- No new endpoint.
- No request body change.
- No status code change.
- No header change.
- No change to other fields of `appointmentResponseSchema`.
- No change to authorization, tenant scope, or RBAC.
