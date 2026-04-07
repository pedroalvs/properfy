# JWT Key Rotation Runbook

## Overview

The platform uses RS256 JWTs with `kid`-based key rotation. A configurable grace window (default 30 days) allows tokens signed with the previous key to remain valid during rotation.

The `JwtService` supports two keys simultaneously: the **current** key (used to sign new tokens) and the **previous** key (used only for verification until it expires).

## When to rotate

- **Scheduled:** every 6 months (recommended)
- **Emergency:** immediately on suspected key compromise

## Environment variables

| Variable | Purpose |
|---|---|
| `JWT_PRIVATE_KEY` | Current RSA private key (PEM, `\n`-escaped) |
| `JWT_PUBLIC_KEY` | Current RSA public key (PEM, `\n`-escaped) |
| `JWT_KEY_ID` | Current key identifier (e.g., `properfy-20260406`) |
| `JWT_PREVIOUS_PUBLIC_KEY` | Previous RSA public key (PEM, `\n`-escaped) |
| `JWT_PREVIOUS_KEY_ID` | Previous key identifier |
| `JWT_PREVIOUS_KEY_EXPIRES_AT` | ISO 8601 timestamp when previous key stops being accepted |

## Steps

### 1. Generate new key pair

```bash
openssl genpkey -algorithm RSA -out jwt-new-private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in jwt-new-private.pem -pubout -out jwt-new-public.pem
```

### 2. Choose a new Key ID

Use a descriptive format: `properfy-YYYYMMDD` (e.g., `properfy-20260406`).

### 3. Update environment variables

Move current key to previous:

- `JWT_PREVIOUS_PUBLIC_KEY` = current value of `JWT_PUBLIC_KEY`
- `JWT_PREVIOUS_KEY_ID` = current value of `JWT_KEY_ID`
- `JWT_PREVIOUS_KEY_EXPIRES_AT` = now + 30 days (ISO 8601, e.g., `2026-05-06T00:00:00Z`)

Set new key as current:

- `JWT_PRIVATE_KEY` = contents of `jwt-new-private.pem` (replace newlines with `\n`)
- `JWT_PUBLIC_KEY` = contents of `jwt-new-public.pem` (replace newlines with `\n`)
- `JWT_KEY_ID` = new key ID from step 2

### 4. Deploy

1. Deploy to **staging** first.
2. Run smoke test: login and verify the token `kid` header matches the new key ID.
3. Deploy to **production** during the deploy window (09:00 BRT).

### 5. Verify

- Check logs for tokens being verified with previous `kid` (expected during grace period).
- Monitor the `auth.check-key-expiry` worker output in logs. It runs daily at 03:00 UTC and logs warnings when the previous key approaches expiry.
- After 30 days (or when `JWT_PREVIOUS_KEY_EXPIRES_AT` is reached), remove the `JWT_PREVIOUS_*` variables and redeploy.

### 6. Monitoring and alerts

The system includes a daily pg-boss job (`auth.check-key-expiry`) that checks the remaining grace period:

| Days remaining | Log level | Action |
|---|---|---|
| > 7 | INFO | Status logged, no action needed |
| <= 7 | WARN | Plan to clean up previous key variables soon |
| <= 1 | ERROR | Previous key is about to expire or has expired; remove variables immediately |

An audit log entry (`auth.key_expiry_check`) is written each day with the remaining days for traceability.

## Emergency rotation (key compromise)

1. Follow steps 1-4 above.
2. Set `JWT_PREVIOUS_KEY_EXPIRES_AT` to **NOW** (e.g., `2026-04-06T00:00:00Z`) to immediately invalidate all tokens signed with the compromised key.
3. All users will need to re-authenticate.
4. Communicate the impact to the operations team.

## Rollback

If the new key causes issues:

1. Revert `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, and `JWT_KEY_ID` to the previous values.
2. Remove `JWT_PREVIOUS_*` variables.
3. Redeploy.

Note: tokens signed with the new key during the brief window will become invalid and affected users will need to re-authenticate.
