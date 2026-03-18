# Deploy Runbook

## Environments

| Environment | Infrastructure | Purpose |
|---|---|---|
| `dev` | Local | Development and testing |
| `staging` | VPS with Portainer | Pre-production validation |
| `prod` | Fly.io | Production |

---

## Deploy Window

Deployments to production should start from **09:00 BRT (Brazil time)**, which corresponds to 23:00 AEDT (Sydney reference).

---

## Deploy Process

### Standard Flow

1. **Open PR to `main`:** CI runs lint, typecheck, tests, Prisma migration validation, and build.
2. **Merge to `main`:** All CI checks must pass.
3. **Deploy to staging:** Automatic or manual trigger via Portainer.
4. **Run smoke tests on staging:** Verify health, critical flows, and migration success.
5. **Deploy to production:** Triggered via Fly.io deploy.

### Staging Deploy (Portainer)

Staging runs on a VPS managed by Portainer. Deployments are triggered by container image updates.

1. Build and push the container image.
2. Update the service in Portainer to pull the new image.
3. Verify via `GET /health` and `GET /ready`.

### Production Deploy (Fly.io)

```bash
# Deploy to Fly.io
fly deploy

# Check deployment status
fly status

# View recent logs
fly logs
```

Fly.io performs rolling deploys with health checks. The new instance must pass `/health` before traffic is routed to it.

---

## Health Checks

| Endpoint | Method | Purpose | Success | Failure |
|---|---|---|---|---|
| `/health` | GET | DB connectivity check (2s timeout) | 200 `{"status":"ok","db":"connected"}` | 503 `{"status":"degraded","db":"disconnected"}` |
| `/ready` | GET | Readiness probe (DB ready) | 200 `{"status":"ready"}` | 503 `{"status":"not_ready"}` |
| `/metrics` | GET | Application metrics snapshot | 200 | -- |

Fly.io uses `/health` for its health check. If the health check fails, the deployment is rolled back automatically.

---

## Graceful Shutdown

On receiving `SIGTERM` or `SIGINT`:

1. The application stops accepting new requests.
2. In-flight requests are allowed to complete.
3. If `ENABLE_JOB_QUEUE=true`, pg-boss is stopped (drains active workers).
4. A **30-second timeout** is enforced. If shutdown takes longer, the process exits with code 1.

---

## Database Migrations During Deploy

1. **Always run migrations on staging first.**
2. Migrations are applied with `pnpm prisma migrate deploy` (non-interactive).
3. Use the `DIRECT_URL` environment variable (bypasses PgBouncer) for migration execution.
4. Follow the expand/contract pattern for breaking changes to avoid downtime.

### Migration Order

```
1. Apply migration to staging DB
2. Deploy application to staging
3. Validate on staging
4. Apply migration to production DB
5. Deploy application to production
```

If a migration fails in production, do NOT roll back the migration. Instead, create a new forward migration to fix the issue.

---

## Rollback

### Automatic (Fly.io)

If the new deployment fails the `/health` check, Fly.io automatically rolls back to the previous release.

### Manual Rollback

```bash
# List recent releases
fly releases

# Roll back to a specific release
fly deploy --image <previous_image_ref>
```

Alternatively, revert the commit on `main` and deploy again.

### Rollback with Migration

If a database migration was applied and needs to be undone:

1. **Do NOT** delete or modify the applied migration file.
2. Create a new migration that reverses the changes.
3. Deploy the rollback migration forward.

---

## Secrets Management

- Secrets are injected by the hosting provider (Fly.io for prod, Portainer env for staging).
- No `.env` files in staging or production.
- Critical secrets should be rotated every 6 months (see `auth-and-sessions.md` for JWT key rotation).

### Fly.io Secrets

```bash
# Set a secret
fly secrets set KEY=value

# List secrets (names only)
fly secrets list

# Unset a secret
fly secrets unset KEY
```

Setting a secret triggers a re-deploy automatically on Fly.io.

---

## Pre-Deploy Checklist

- [ ] All CI checks pass (lint, typecheck, tests, build)
- [ ] Migration applied to staging and validated
- [ ] Staging smoke test passed (`/health`, `/ready`, critical API endpoints)
- [ ] Deploy window respected (from 09:00 BRT)
- [ ] No active incidents or ongoing deployments
- [ ] Rollback plan identified (previous release tag or commit)

---

## Post-Deploy Verification

1. Check `/health` returns 200.
2. Check `/ready` returns 200.
3. Check application logs for startup errors (`fly logs` or Portainer logs).
4. Verify pg-boss workers registered (look for `pg-boss workers registered:` in logs).
5. Verify mandatory notification templates are present (look for `All mandatory notification templates are present` or warnings).
6. Run a quick API smoke test (e.g., login, list appointments).
