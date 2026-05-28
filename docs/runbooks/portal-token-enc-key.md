# Runbook: PORTAL_TOKEN_ENC_KEY

## Purpose

`PORTAL_TOKEN_ENC_KEY` is the AES-256-GCM symmetric key used to encrypt raw tenant portal tokens at rest in the `tenant_portal_tokens.raw_token_encrypted` column. This enables the "Copy Portal Link" endpoint (`GET /v1/appointments/:id/portal-link`) to reconstruct the original URL-safe token from the database row without storing it in plaintext.

**Absence in non-development environments causes Fastify boot failure.**  
See `apps/backend/src/main/env.ts:103-108` for the fail-fast validation.

---

## Initial provisioning

Run once when setting up a new Fly.io deployment:

```bash
fly secrets set PORTAL_TOKEN_ENC_KEY="$(openssl rand -hex 32)" -a properfy-api
```

This generates a fresh 32-byte (256-bit) key and sets it as an app-wide secret. Fly.io propagates the secret to all running machines and future deployments.

---

## Verification

Confirm the secret is present and all machines are running:

```bash
# Confirm the key exists (value is never shown — Fly.io redacts secret values)
fly secrets list -a properfy-api | grep PORTAL_TOKEN_ENC_KEY

# Confirm all machines are in 'started' state
fly status -a properfy-api

# Confirm the app boots without the env validation error
fly logs -a properfy-api | grep -E "PORTAL_TOKEN|boot|error" | tail -20
```

If `PORTAL_TOKEN_ENC_KEY` is absent, the app exits with:
```
Environment validation failed:
  - PORTAL_TOKEN_ENC_KEY: Required in non-development environments (32 bytes, hex or base64 encoded)
```

---

## Recovery

**Scenario**: A machine rollout (e.g., Fly.io infrastructure upgrade from v250 → v251) deploys new machines that do not inherit the secret, causing boot failures with the missing-env error above. The surviving v250 machine still has the key in its environment.

### Option A — Reuse the existing key from the surviving machine (preferred)

This option preserves all currently-active portal tokens. Existing `raw_token_encrypted` rows remain decryptable after the secret is re-applied.

```bash
# Step 1: Connect to the surviving v250 machine to retrieve the key
fly ssh console -a properfy-api

# Step 2: Inside the SSH session, read the key value
env | grep PORTAL_TOKEN_ENC_KEY
# Output: PORTAL_TOKEN_ENC_KEY=<hex-value>

# Step 3: Exit the SSH session
exit

# Step 4: Re-set the same key app-wide so all new machines receive it
fly secrets set PORTAL_TOKEN_ENC_KEY="<hex-value-from-step-2>" -a properfy-api

# Step 5: Verify all machines are healthy
fly status -a properfy-api
```

**Result**: All machines start successfully; all active portal tokens remain valid and decryptable.

### Option B — Rotate to a new key (last resort)

Use this option **only when the existing key cannot be retrieved** from any surviving machine (e.g., all v250 machines have been terminated).

> ⚠️ **This invalidates all currently-active portal tokens.** Any `raw_token_encrypted` row encrypted with the old key will become permanently undecryptable. The `GET /v1/appointments/:id/portal-link` endpoint will return `409 PortalTokenNotDecryptableError` for these tokens.

```bash
# Step 1: Rotate to a new key
fly secrets set PORTAL_TOKEN_ENC_KEY="$(openssl rand -hex 32)" -a properfy-api

# Step 2: Verify all machines start
fly status -a properfy-api

# Step 3: Revoke all active portal tokens (they are now undecryptable)
# Run the following SQL against the production database (via Supabase dashboard or psql):
UPDATE tenant_portal_tokens
SET status = 'REVOKED', updated_at = NOW()
WHERE status = 'ACTIVE';

# Step 4: Notify affected tenants
# For each appointment that had an active token, re-send the portal link:
# POST /v1/appointments/:appointmentId/portal-token  (requires OP or AM role)
# This generates a fresh token encrypted with the new key.
# Coordinate with the operations team to identify which appointments are affected
# via the audit_logs table (action = 'tenant_portal.token_generated').
```

**Operator decision gate**: Before executing Option B, confirm with the engineering lead and operations manager. Accept the token-loss impact or re-schedule the re-send campaign.

---

## Rotation (planned key refresh)

Periodic rotation of `PORTAL_TOKEN_ENC_KEY` is **out of scope** for this runbook's initial version. When planned rotation is implemented, it will require a double-write window (encrypt new tokens with the new key; decrypt old tokens with the old key during the grace period). Track this as a future engineering task.

---

## See also

- `docs/fly-deploy-guide.md §2` — primary provisioning checklist (initial `fly secrets set`)
- `apps/backend/src/main/env.ts:103-108` — fail-fast validation that catches missing key on boot
- `apps/backend/src/modules/tenant-portal/domain/mint-portal-token.service.ts` — key consumer (encryption on token mint)
- `apps/backend/src/modules/tenant-portal/application/use-cases/get-portal-link.use-case.ts` — key consumer (decryption on link copy)
- `docs/runbooks/jwt-key-rotation.md` — parallel runbook for the JWT RS256 key pair
