# Properfy Backend — Fly.io Deployment Guide

## Prerequisites

- [Fly CLI](https://fly.io/docs/flyctl/install/) installed and authenticated (`fly auth login`)
- Supabase project running with database accessible
- JWT RS256 key pair generated
- TOTP encryption key generated (32 bytes)

---

## 1. Create the Fly.io App

```bash
cd /path/to/properfy
fly apps create properfy-api
```

If the name is taken, choose another and update `app` in `fly.toml`.

---

## 2. Set Secrets

All secrets are injected as environment variables at runtime — never committed to the repo.

### Required

```bash
# Database (PgBouncer pooled URL from Supabase)
fly secrets set DATABASE_URL="postgresql://postgres.xxxxx:PASSWORD@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Direct connection (used by Prisma Migrate only)
fly secrets set DIRECT_URL="postgresql://postgres.xxxxx:PASSWORD@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

# JWT RS256 keys (use \n for newlines in the key)
fly secrets set JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----"
fly secrets set JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBI...\n-----END PUBLIC KEY-----"

# CORS — your frontend domain(s), comma-separated
fly secrets set CORS_ORIGIN="https://app.properfy.com.br"

# TOTP encryption key (32 bytes, hex encoded)
# Generate with: openssl rand -hex 32
fly secrets set TOTP_ENCRYPTION_KEY="$(openssl rand -hex 32)"
```

### Optional (enable as needed)

```bash
# Supabase Storage (S3-compatible)
fly secrets set SUPABASE_S3_ENDPOINT="https://xxxxx.storage.supabase.co/storage/v1/s3"
fly secrets set SUPABASE_S3_ACCESS_KEY_ID="your-key"
fly secrets set SUPABASE_S3_SECRET_ACCESS_KEY="your-secret"

# Email (Resend)
fly secrets set RESEND_API_KEY="re_xxxxx"
fly secrets set RESEND_FROM_EMAIL="noreply@properfy.com.br"

# SMS (Twilio)
fly secrets set TWILIO_ACCOUNT_SID="ACxxxxx"
fly secrets set TWILIO_AUTH_TOKEN="xxxxx"
fly secrets set TWILIO_PHONE_NUMBER="+1234567890"

# WhatsApp (Zenvia)
fly secrets set WHATSAPP_API_KEY="xxxxx"
fly secrets set WHATSAPP_API_URL="https://api.zenvia.com/v2"

# Geocoding (Mapbox)
fly secrets set MAPBOX_ACCESS_TOKEN="pk.xxxxx"

# Enable background job processing (pg-boss)
fly secrets set ENABLE_JOB_QUEUE="true"
```

### Verify secrets are set

```bash
fly secrets list
```

---

## 3. Choose the Region

The `fly.toml` defaults to `gru` (São Paulo). Match it to your Supabase region for lowest latency:

| Supabase Region | Fly.io Region | Code |
|---|---|---|
| US East (Virginia) | Ashburn, Virginia | `iad` |
| US West (Oregon) | San Jose, California | `sjc` |
| South America (São Paulo) | São Paulo | `gru` |
| Australia (Sydney) | Sydney | `syd` |
| Europe (Frankfurt) | Frankfurt | `fra` |

To change:

```bash
# Edit fly.toml
primary_region = 'iad'  # or your preferred region
```

---

## 4. Run Database Migrations

Before the first deploy, apply Prisma migrations to your Supabase database.

**Option A — From your local machine** (if your DB is accessible):

```bash
cd apps/backend
DATABASE_URL="your-direct-url" npx prisma migrate deploy
```

**Option B — After deploying** (via Fly SSH):

```bash
fly ssh console -C "cd /app/apps/backend && DATABASE_URL=\$DIRECT_URL npx prisma migrate deploy"
```

### Seed the database (optional, dev/staging only)

```bash
cd apps/backend
DATABASE_URL="your-direct-url" npx tsx prisma/seed.ts
```

---

## 5. Deploy

```bash
fly deploy
```

First deploy builds the Docker image on Fly.io's builders (~3-5 minutes). Subsequent deploys with cache take ~1-2 minutes.

### Monitor the deploy

```bash
fly logs           # Stream live logs
fly status         # Check app status
fly checks list    # View health check results
```

### Verify it's running

```bash
# Health check
curl https://properfy-api.fly.dev/health

# Ready check
curl https://properfy-api.fly.dev/ready

# Login
curl -X POST https://properfy-api.fly.dev/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@pedroalvs.com","password":"Admin@1234"}'
```

---

## 6. Scaling

### Adjust VM size

The default is `shared-cpu-1x` with 512MB RAM. Increase if needed:

```bash
# Dedicated CPU, 1GB RAM
fly scale vm shared-cpu-2x --memory 1024

# Or edit fly.toml:
# [[vm]]
#   size = 'shared-cpu-2x'
#   memory = '1024mb'
```

### Multiple instances

```bash
fly scale count 2    # Run 2 instances
```

The app is stateless — multiple instances work out of the box. pg-boss handles job deduplication.

---

## 7. Ongoing Operations

### Deploy updates

```bash
git push origin main   # CI/CD triggers deploy (if configured)
# or manually:
fly deploy
```

### Run migrations on updates

```bash
# After deploying a version with new migrations:
fly ssh console -C "cd /app/apps/backend && DATABASE_URL=\$DIRECT_URL npx prisma migrate deploy"
```

### View logs

```bash
fly logs                    # Live stream
fly logs --app properfy-api # Specific app
```

### SSH into the container

```bash
fly ssh console
```

### Restart the app

```bash
fly apps restart properfy-api
```

### Rollback

```bash
fly releases                  # List releases
fly deploy --image <old-ref>  # Rollback to specific image
```

---

## 8. Environment Variables Reference

These are set in `fly.toml` under `[env]` (non-secret values):

| Variable | Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Runtime environment |
| `PORT` | `3000` | Server port (internal) |
| `LOG_LEVEL` | `info` | Pino log level |

Everything else goes through `fly secrets set` — never in `fly.toml` or committed files.

---

## 9. Troubleshooting

### App crashes at startup

Check logs for the exact error:

```bash
fly logs
```

Common causes:
- **Missing `CORS_ORIGIN`** — Required in production. Set it via `fly secrets set`.
- **Missing `TOTP_ENCRYPTION_KEY`** — Required in production.
- **Invalid `DATABASE_URL`** — Verify Supabase credentials and that the pooler URL includes `?pgbouncer=true`.
- **Invalid JWT keys** — Ensure newlines are `\n` in the secret value, not literal line breaks.

### Health check failures

```bash
fly checks list
```

The health check hits `/ready`, which verifies the database connection. If it fails:
- Check Supabase is accessible from the Fly.io region
- Increase VM memory if OOM
- Check `fly logs` for Prisma connection errors

### Slow responses

- Ensure Fly.io region matches Supabase region (cross-region adds 100-300ms per query)
- Monitor with: `curl -w "Total: %{time_total}s\n" https://properfy-api.fly.dev/health`

### Database connection issues

Supabase free tier has connection limits. If you see `too many connections`:
- Ensure `DATABASE_URL` uses the PgBouncer pooler URL (port `6543`, with `?pgbouncer=true`)
- Do NOT use the direct URL (port `5432`) for the app — only for migrations
