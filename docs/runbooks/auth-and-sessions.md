# Auth and Sessions Runbook

## JWT Key Rotation (RS256 with kid)

The API uses RS256 JWT tokens with a `kid` (Key ID) header to support zero-downtime key rotation.

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `JWT_PRIVATE_KEY` | Yes | Current RSA private key (PKCS8 PEM) |
| `JWT_PUBLIC_KEY` | Yes | Current RSA public key (SPKI PEM) |
| `JWT_KEY_ID` | Yes | Key identifier for the current key pair (default: `properfy-key-v1`) |
| `JWT_PREVIOUS_PUBLIC_KEY` | No | Previous public key (kept for grace period) |
| `JWT_PREVIOUS_KEY_ID` | No | Key identifier for the previous key |
| `JWT_PREVIOUS_KEY_EXPIRES_AT` | No | ISO-8601 date after which tokens signed with the previous key are rejected (default: 30 days) |

### Rotation Procedure

1. **Generate a new RSA key pair:**

```bash
openssl genpkey -algorithm RSA -out new-private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in new-private.pem -out new-public.pem
```

2. **Update environment variables (staging first, then prod):**

```bash
# Move current keys to "previous" slots
JWT_PREVIOUS_PUBLIC_KEY=<current JWT_PUBLIC_KEY value>
JWT_PREVIOUS_KEY_ID=<current JWT_KEY_ID value>
JWT_PREVIOUS_KEY_EXPIRES_AT=<ISO-8601 date, 30 days from now>

# Set new keys as current
JWT_PRIVATE_KEY=<contents of new-private.pem>
JWT_PUBLIC_KEY=<contents of new-public.pem>
JWT_KEY_ID=properfy-key-v2  # increment version
```

3. **Deploy the application.** The `JwtService` will:
   - Sign new tokens with the current key (`JWT_KEY_ID`).
   - Accept tokens signed with either the current or previous key (matched by `kid` header).
   - Reject previous-key tokens after `JWT_PREVIOUS_KEY_EXPIRES_AT`.

4. **After the grace period expires,** remove the `JWT_PREVIOUS_*` variables.

### Token Lifetimes

- Access token: 15 minutes
- Refresh token: 10 days (stored as SHA-256 hash in `sessions` table)

---

## Account Lockout

### Behavior

- After **5 consecutive failed login attempts**, the account status is set to `LOCKED` and `locked_until` is set to 15 minutes from now.
- The lock auto-expires: on the next login attempt after `locked_until`, the system resets `failed_login_count` to 0 and status to `ACTIVE`.
- Each lockout event is recorded in the audit log (`auth.account_locked`).

### Checking Locked Accounts

```sql
SELECT id, email, status, failed_login_count, locked_until
FROM users
WHERE status = 'LOCKED'
ORDER BY locked_until DESC;
```

### Manually Unlocking an Account

```sql
UPDATE users
SET status = 'ACTIVE', failed_login_count = 0, locked_until = NULL, updated_at = NOW()
WHERE id = '<user_id>';
```

After unlocking, verify via the audit log that the lock was legitimate and not an ongoing attack.

---

## TOTP 2FA

### Overview

- 2FA is mandatory for Admin Master (`AM`) users from first login.
- TOTP secrets are encrypted at rest using AES-256 via `TOTP_ENCRYPTION_KEY` (32 bytes, hex or base64 encoded).
- `TOTP_ENCRYPTION_KEY` is required in staging and production environments.
- The encrypted secret is stored in the `totp_secret` column of the `users` table.

### Common Issues

**User cannot complete TOTP setup:**
- Verify the user has `totp_enabled = false` and `totp_secret IS NULL`.
- The user must authenticate first (a 15-minute limited session is issued for setup).
- Check audit log for `auth.login_totp_setup` events.

**TOTP code rejected:**
- Verify the user's device clock is synchronized (TOTP is time-sensitive, 30-second window).
- Check that `TOTP_ENCRYPTION_KEY` has not changed since the secret was stored.

**Resetting TOTP for a user (emergency):**

```sql
UPDATE users
SET totp_secret = NULL, totp_enabled = false, updated_at = NOW()
WHERE id = '<user_id>';
```

The user will be prompted to set up TOTP again on next login.

**Rotating TOTP_ENCRYPTION_KEY:**
- There is no built-in re-encryption migration. Changing `TOTP_ENCRYPTION_KEY` will invalidate all existing TOTP secrets.
- If rotation is required: reset all `totp_secret` values to NULL and `totp_enabled` to false, then notify affected users to re-enroll.

---

## Session Cleanup

### Automatic Cleanup

A scheduled pg-boss job `auth.cleanup-sessions` runs daily at **02:00 UTC** (`0 2 * * *`). It purges sessions older than 30 days.

### Verifying the Job

```sql
-- Check recent executions
SELECT id, state, created_on, completed_on
FROM pgboss.job
WHERE name = 'auth.cleanup-sessions'
ORDER BY created_on DESC
LIMIT 5;
```

### Manual Cleanup

```sql
-- Delete expired sessions older than 30 days
DELETE FROM sessions
WHERE created_at < NOW() - INTERVAL '30 days';

-- Delete revoked sessions
DELETE FROM sessions
WHERE revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '7 days';
```

---

## Emergency: Revoking All Sessions for a User

To force a user to re-authenticate on all devices:

```sql
UPDATE sessions
SET revoked_at = NOW()
WHERE user_id = '<user_id>' AND revoked_at IS NULL;
```

This revokes all active refresh tokens. Existing access tokens remain valid for up to 15 minutes (their TTL). If immediate invalidation is required, combine with one of:

- **Account lock:** Set `status = 'LOCKED'` on the user to block new access token issuance via refresh.
- **Account deactivation:** Set `status = 'INACTIVE'` and `deleted_at = NOW()` to fully disable the account.

### Revoking All Sessions Platform-Wide (Nuclear Option)

```sql
UPDATE sessions
SET revoked_at = NOW()
WHERE revoked_at IS NULL;
```

Use only during a confirmed security breach. All users will need to log in again.
