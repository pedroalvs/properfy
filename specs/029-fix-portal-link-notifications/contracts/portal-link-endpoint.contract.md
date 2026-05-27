# Contract: GET /v1/appointments/:appointmentId/portal-link — active-token predicate alignment

**Spec**: `../spec.md` (§3.B2 "Updates in `GetPortalLinkUseCase`" + AC-2.6)
**Plan**: `../plan.md`
**Touched by**: Bug 2 (Planejador round-1 BLOCKER fix).

## Endpoint

`GET /v1/appointments/:appointmentId/portal-link`

- Authorization: `AM | OP` only (unchanged — enforced at `get-portal-link.use-case.ts:34`).
- Tenant scope: AM cross-tenant; OP tenant-scoped (unchanged).
- Idempotency: N/A (read).
- Audit: `tenant_portal.link_copied` on success (unchanged — `get-portal-link.use-case.ts:66-74`).

## Request

No changes. Existing path parameter `appointmentId: UUID`.

## Response — behavior change

### Before (current `main` / `d85442e`)

The use case at `apps/backend/src/modules/tenant-portal/application/use-cases/get-portal-link.use-case.ts:44-46`:

```typescript
if (!appointment.activeConfirmationCycleId) {
  throw new NoActivePortalTokenError();
}
```

This proxies "is there a confirmation cycle" as a stand-in for "does an active token exist". The proxy is misaligned with the canonical active-token definition (`status = 'ACTIVE' AND expires_at > now()`).

### After (this PR)

Lines 44-46 are **removed**. The single source of truth for "active token exists" becomes the existing call at line 48:

```typescript
const token = await this.tokenRepo.findActiveByAppointmentId(appointmentId);
if (!token) {
  throw new NoActivePortalTokenError();
}
```

Combined with the T028 patch to `findActiveByAppointmentId` (adds `expires_at: { gt: new Date() }` to the where clause), this aligns the endpoint's behavior with the new `hasActivePortalToken` semantic on `GET /v1/appointments/:id`.

## Semantic contract

`GET /v1/appointments/:id/portal-link` returns:

- **200 + `{ portalUrl, expiresAt }`** if and only if there exists a `tenant_portal_tokens` row with `appointment_id = :id AND status = 'ACTIVE' AND expires_at > new Date()` AND that row's `raw_token_encrypted` is non-null and decryptable.
- **409 NoActivePortalTokenError** if no such token row exists.
- **409 PortalTokenNotDecryptableError** if a row exists but `raw_token_encrypted` is null or decryption fails (unchanged behavior — existing lines 53-62).

## Tests required (AC-2.6)

| Test case | Setup | Expected response |
|---|---|---|
| TC-PL-1 | `active_confirmation_cycle_id IS NULL` AND `tenant_portal_tokens.status='ACTIVE'` AND `expires_at > NOW` AND decryptable | **200 + portalUrl** (regression case — this is the inconsistency that motivated AC-2.6) |
| TC-PL-2 | `active_confirmation_cycle_id IS NOT NULL` AND token ACTIVE+valid+decryptable | 200 + portalUrl |
| TC-PL-3 | `active_confirmation_cycle_id IS NOT NULL` AND no token row | 409 NoActivePortalTokenError |
| TC-PL-4 | `active_confirmation_cycle_id IS NOT NULL` AND token REVOKED | 409 NoActivePortalTokenError |
| TC-PL-5 | `active_confirmation_cycle_id IS NOT NULL` AND token ACTIVE but `expires_at <= NOW` | 409 NoActivePortalTokenError (covered jointly by T028 + this change) |
| TC-PL-6 | Token exists, valid, but `raw_token_encrypted IS NULL` | 409 PortalTokenNotDecryptableError (existing behavior, unchanged) |

## Why this matters end-to-end

Without this contract change, the front-end consumes the corrected `hasActivePortalToken: true` from `GET /v1/appointments/:id`, enables the "Copy Portal Link" button, the user clicks, the button fires `GET /v1/appointments/:id/portal-link`, and **the endpoint returns 409 NoActivePortalTokenError** in the legacy-cycle-null case — leaving the user with a worse experience than before the fix. Aligning both endpoints to the same predicate closes the inconsistency.

## Out-of-scope

- No new endpoint.
- No change to request/path/header/auth contracts.
- Audit emission preserved verbatim.
- No effect on existing `GET /v1/appointments/:id` contract (covered by `appointment-response.contract.md`).
