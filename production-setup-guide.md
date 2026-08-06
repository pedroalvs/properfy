# Properfy — First-Time Environment Setup Guide

> Companion to `deploy-restructure-plan.md`. Walks through provisioning a
> Properfy environment from zero — accounts, every environment variable (backend
> and frontend), how to generate each key, and the post-deploy one-shots.
> Written for **production** (client accounts, `properfy.me`); the same steps
> apply to staging/dev with the names/domains swapped.

Final domain matrix (reference throughout):

| Env | Web | PWA | API |
|---|---|---|---|
| Production | `app.properfy.me` | `pwa.properfy.me` | `api.properfy.me` |
| Staging | `properfy.autolabs.tech` | `pwa-properfy.autolabs.tech` | `properfy-api-staging.fly.dev` (Fly-native) |
| Dev | `properfy.pedroalvs.com` | `pwa-properfy.pedroalvs.com` | `properfy-api-dev.fly.dev` (Fly-native) |

---

## 0. Account checklist

Before touching any variable, these accounts must exist (production = client's):

- [ ] **Fly.io** — organization + `flyctl` access, billing enabled
- [ ] **Supabase** — organization for the production project
- [ ] **Vercel** — team on Pro (already active)
- [ ] **Resend** (resend.com) — transactional email
- [ ] **MobileMessage** (mobilemessage.com.au) — SMS
- [ ] **Mapbox** (mapbox.com) — geocoding + maps
- [ ] **DNS access** for `properfy.me`
- [ ] **GitHub** — admin on the repo (to add Actions secrets)

---

## 1. Supabase (database + storage)

### 1.1 Create the project

Supabase Dashboard → **New project**:

- Region: **Sydney (ap-southeast-2)** — must match the Fly region.
- Save the database password in a password manager; it is part of every DB URL.

### 1.2 Database URLs (3 variables)

Dashboard → **Connect** (top bar) shows all connection strings.

| Variable | Which string | Why |
|---|---|---|
| `DATABASE_URL` | **Transaction pooler** (port `6543`), append `?pgbouncer=true` | App queries via PgBouncer; the flag disables prepared statements (incompatible with transaction mode) |
| `DIRECT_URL` | **Direct connection** (port `5432`) | Prisma migrations need a real session |
| `PG_BOSS_URL` | **Session pooler** or direct (port `5432`) | pg-boss uses advisory locks + LISTEN/NOTIFY, which break on the transaction pooler |

Format reference:

```
DATABASE_URL = postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL   = postgresql://postgres:<PASSWORD>@db.<project-ref>.supabase.co:5432/postgres
PG_BOSS_URL  = postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres
```

### 1.3 Storage buckets (S3-compatible)

Dashboard → **Storage**:

1. Create bucket **`properfy-assets`** — **private** (inspection evidence,
   agency logos for signed-URL access). → `SUPABASE_STORAGE_BUCKET`
2. Create bucket **`email-assets`** — **public** (images embedded in
   notification emails must be fetchable by mail clients without auth).

### 1.4 S3 access keys (3 variables)

Project Settings → **Storage** → **S3 access keys** → *New access key*:

```
SUPABASE_S3_ENDPOINT          = https://<project-ref>.supabase.co/storage/v1/s3
SUPABASE_S3_ACCESS_KEY_ID     = <generated access key id>
SUPABASE_S3_SECRET_ACCESS_KEY = <generated secret — shown once, save it>
```

The endpoint is shown on the same S3 settings page (region `ap-southeast-2`).

### 1.5 Public storage URL

```
SUPABASE_STORAGE_PUBLIC_URL = https://<project-ref>.supabase.co/storage/v1/object/public
```

Used to build public links for the `email-assets` bucket.

---

## 2. Generated secrets (run locally, paste into Fly)

### 2.1 JWT keypair (RS256)

The API signs its own tokens with an RSA keypair. Generate a **fresh pair per
environment** — never reuse staging's in production:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt-private.pem
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
```

```
JWT_PRIVATE_KEY = <contents of jwt-private.pem, including BEGIN/END lines>
JWT_PUBLIC_KEY  = <contents of jwt-public.pem>
JWT_KEY_ID      = properfy-prod-key-v1     # bump the suffix on rotation
```

Multiline values via flyctl: `fly secrets set JWT_PRIVATE_KEY="$(cat jwt-private.pem)" -a properfy-api`.
Delete the local `.pem` files after setting the secrets. On rotation, the old
public key moves to `JWT_PREVIOUS_PUBLIC_KEY` / `JWT_PREVIOUS_KEY_ID` with a
`JWT_PREVIOUS_KEY_EXPIRES_AT` cutoff (ISO-8601).

### 2.2 Encryption keys (AES-256-GCM, 32 bytes each)

Three independent keys, all generated the same way — one per purpose, never
shared:

```bash
openssl rand -base64 32   # run three times, one output per variable
```

```
TOTP_ENCRYPTION_KEY     = <output 1>   # encrypts 2FA TOTP seeds at rest
PORTAL_TOKEN_ENC_KEY    = <output 2>   # encrypts rental-tenant portal tokens
APP_CREDENTIAL_ENC_KEY  = <output 3>   # encrypts app-credential passwords
```

All three are **required** — the API refuses to boot in staging/production
without them. Rotating any of them invalidates the data it encrypted (2FA
re-enrollment, portal links re-issued, app credentials re-entered) — treat as
break-glass only.

### 2.3 SMS webhook token

MobileMessage does not sign its delivery-receipt callbacks; the webhook is
protected by a shared secret in the query string:

```bash
openssl rand -hex 32
```

```
MOBILE_MESSAGE_WEBHOOK_TOKEN = <output>
```

After the API is live, configure the callback URL in the MobileMessage
dashboard as `https://api.properfy.me/v1/webhooks/mobile-message?token=<output>`
(confirm the exact path in the SMS webhook route before pasting).

---

## 3. Resend (email)

1. Create the account → **Domains** → *Add domain* → `properfy.me`.
2. Resend shows DNS records (DKIM ×3 CNAME/TXT, SPF TXT, optional DMARC). Add
   them at the `properfy.me` DNS host and wait for **Verified** status —
   emails will not send from the domain before this.
3. **API Keys** → *Create API key* (full access, scoped to the domain):

```
RESEND_API_KEY    = re_...
RESEND_FROM_EMAIL = Properfy <no-reply@properfy.me>
```

4. **Webhooks** → *Add endpoint* pointing at the API's Resend webhook route
   (delivery/bounce events); copy the signing secret:

```
RESEND_WEBHOOK_SECRET = whsec_...
```

Optional:

```
EMAIL_BCC_RECIPIENT            = <mailbox that silently receives a copy of every outbound email>
EMAIL_TEST_RECIPIENT_ALLOWLIST = <comma-separated emails allowed as template test-send targets>
```

---

## 4. MobileMessage (SMS)

1. Client creates/owns the account at mobilemessage.com.au (Australian sender
   compliance is tied to the account holder).
2. Dashboard → API settings → generate credentials (Basic Auth pair):

```
MOBILE_MESSAGE_API_KEY   = <API username>
MOBILE_MESSAGE_PASSWORD  = <API password>
MOBILE_MESSAGE_SENDER_ID = <approved sender id, e.g. "Properfy">
```

3. Register the sender ID with MobileMessage (alphanumeric senders require
   approval in AU).
4. Set the delivery-receipt callback URL with the token from §2.3.

Note: Resend, MobileMessage and Mapbox can also be configured at runtime by the
AM via the **Integrations Hub** (DB config wins over env). Env vars are the
fallback and what makes the platform functional on first boot — set them.

---

## 5. Mapbox (two distinct tokens — do not mix them)

Mapbox Dashboard → **Access tokens**:

1. **Server token** → `MAPBOX_ACCESS_TOKEN` (backend geocoding).
   Create with **no URL restriction**. Mapbox URL restrictions check the
   `Referer` header, which server-to-server calls never send — a restricted
   token fails every backend call with 403.
2. **Browser token** → `VITE_MAPBOX_TOKEN` (frontend maps).
   Create **with URL restrictions** listing all six frontend origins
   (`https://app.properfy.me`, `https://pwa.properfy.me`, staging and dev
   hosts) — this one is exposed in the bundle, restriction is its only guard.

---

## 6. Fly.io (backend)

### 6.1 App + machines

```bash
fly apps create properfy-api --org <client-org>
fly deploy --config fly.production.toml     # first deploy (runs migrations)
fly scale count 2 --app properfy-api        # machine #2 for burst/redundancy
```

Autoscaling is declared in `fly.production.toml` (`min_machines_running = 1`,
`auto_stop/auto_start`, `soft_limit = 80`) — see the plan §3. The floor of 1 is
mandatory: pg-boss crons run inside the API process.

### 6.2 Custom domain

```bash
fly certs add api.properfy.me --app properfy-api
# DNS: CNAME api.properfy.me → properfy-api.fly.dev
fly certs show api.properfy.me --app properfy-api   # wait for "Ready"
```

### 6.3 Secrets — the full set

Everything from §§1–5 in one command (edit values first; run from a file you
delete afterwards, not shell history — e.g. `fly secrets import < secrets.env`):

```bash
fly secrets set -a properfy-api \
  DATABASE_URL='...' \
  DIRECT_URL='...' \
  PG_BOSS_URL='...' \
  JWT_PRIVATE_KEY="$(cat jwt-private.pem)" \
  JWT_PUBLIC_KEY="$(cat jwt-public.pem)" \
  JWT_KEY_ID='properfy-prod-key-v1' \
  TOTP_ENCRYPTION_KEY='...' \
  PORTAL_TOKEN_ENC_KEY='...' \
  APP_CREDENTIAL_ENC_KEY='...' \
  SUPABASE_S3_ENDPOINT='https://<ref>.supabase.co/storage/v1/s3' \
  SUPABASE_S3_ACCESS_KEY_ID='...' \
  SUPABASE_S3_SECRET_ACCESS_KEY='...' \
  SUPABASE_STORAGE_PUBLIC_URL='https://<ref>.supabase.co/storage/v1/object/public' \
  RESEND_API_KEY='re_...' \
  RESEND_FROM_EMAIL='Properfy <no-reply@properfy.me>' \
  RESEND_WEBHOOK_SECRET='whsec_...' \
  MOBILE_MESSAGE_API_KEY='...' \
  MOBILE_MESSAGE_PASSWORD='...' \
  MOBILE_MESSAGE_SENDER_ID='Properfy' \
  MOBILE_MESSAGE_WEBHOOK_TOKEN='...' \
  MAPBOX_ACCESS_TOKEN='pk...' \
  CORS_ORIGIN='https://app.properfy.me,https://pwa.properfy.me' \
  ENABLE_JOB_QUEUE='true' \
  TENANT_PORTAL_BASE_URL='https://app.properfy.me' \
  WEB_APP_BASE_URL='https://app.properfy.me' \
  PWA_BASE_URL='https://pwa.properfy.me'
```

Non-secret config already lives in `fly.production.toml` `[env]`:
`NODE_ENV=production`, `PGBOSS_SCHEMA=pgboss`, `PORT=3000`, `LOG_LEVEL=info`,
`JWT_ACCESS_TOKEN_TTL_MINUTES=60`.

### 6.4 Backend variable reference

Validated by `apps/backend/src/main/env.ts` — the API **refuses to boot** in
staging/production if a Required row is missing or a base URL is not HTTPS.

| Variable | Required (prod) | Source |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase §1.2 |
| `DIRECT_URL` | ✅ (migrations) | Supabase §1.2 |
| `PG_BOSS_URL` | recommended | Supabase §1.2 |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` / `JWT_KEY_ID` | ✅ | Generated §2.1 |
| `JWT_PREVIOUS_*` (3 vars) | rotation only | §2.1 |
| `TOTP_ENCRYPTION_KEY` | ✅ | Generated §2.2 |
| `PORTAL_TOKEN_ENC_KEY` | ✅ | Generated §2.2 |
| `APP_CREDENTIAL_ENC_KEY` | ✅ | Generated §2.2 |
| `CORS_ORIGIN` | ✅ | The env's two frontend origins, comma-separated |
| `ENABLE_JOB_QUEUE` | ✅ `true` | — |
| `SUPABASE_S3_ENDPOINT` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | ✅ | Supabase §1.4 |
| `SUPABASE_STORAGE_BUCKET` | default `properfy-assets` | §1.3 |
| `SUPABASE_STORAGE_PUBLIC_URL` | ✅ | §1.5 |
| `TENANT_PORTAL_BASE_URL` / `WEB_APP_BASE_URL` | ✅ HTTPS | Web app URL |
| `PWA_BASE_URL` | ✅ HTTPS | PWA URL |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `RESEND_WEBHOOK_SECRET` | boot-optional* | Resend §3 |
| `MOBILE_MESSAGE_*` (4 vars) | boot-optional* | MobileMessage §4 + §2.3 |
| `MAPBOX_ACCESS_TOKEN` | boot-optional* | Mapbox §5 (server token) |
| `EMAIL_BCC_RECIPIENT` / `EMAIL_TEST_RECIPIENT_ALLOWLIST` | optional | §3 |
| `FY_WEBHOOK_URL` / `FY_WEBHOOK_SECRET` | optional | Fy agent integration |
| `PGBOSS_SCHEMA` / `NODE_ENV` / `PORT` / `LOG_LEVEL` / `JWT_ACCESS_TOKEN_TTL_MINUTES` | in fly.toml | — |
| `AUDIT_RETENTION_BATCH_SIZE` | default 1000 | — |

\* boot-optional: the API starts and warns, degrading to stub providers until
configured via env or the Integrations Hub — but production should ship with
all three set.

---

## 7. Vercel (frontends)

### 7.1 Projects and domains

On the client team, create the six projects (plan §4). For production:

- `properfy-web` → Settings → Domains → add `app.properfy.me`
  (DNS: CNAME → `cname.vercel-dns.com`)
- `properfy-pwa` → add `pwa.properfy.me`

Staging/dev projects get their autolabs.tech / pedroalvs.com CNAMEs the same way.
Framework preset: **Vite**; but note builds happen in CI, not on Vercel (below).

### 7.2 Frontend variables — set in GitHub Actions, not Vercel

Both SPAs are static Vite builds: env vars are **baked at build time** in CI,
then the prebuilt output is pushed with `vercel deploy --prebuilt`. Nothing
needs to be configured under Vercel → Environment Variables.

| Variable | Production value | Where |
|---|---|---|
| `VITE_API_BASE_URL` | `https://api.properfy.me` | hardcoded per-env in the workflow (as today) |
| `VITE_MAPBOX_TOKEN` | browser token from §5 | GitHub secret `VITE_MAPBOX_TOKEN` |

### 7.3 CI credentials

Created by the **team owner** (keeps the dev on a free Viewer seat — plan §4):

- Vercel → Account Settings → **Tokens** → create token scoped to the team → GitHub secret `VERCEL_TOKEN`
- Team ID (Settings → General) → `VERCEL_ORG_ID`
- Each project's ID (Project Settings → General) → `VERCEL_PROJECT_ID_WEB`, `VERCEL_PROJECT_ID_PWA` (+ staging/dev variants)

---

## 8. GitHub Actions secrets — final matrix

Store these in **GitHub Environments** (`dev` / `staging` / `production`), not
repo-level secrets — the `production` environment is restricted to the
`production` branch and gated by a required-reviewer approval (plan §8.3), so
prod credentials are unreadable from any other workflow.

| Secret | Used by | Source |
|---|---|---|
| `FLY_API_TOKEN` | dev + staging backend deploys | the dev's Fly account (`fly tokens create deploy`) |
| `FLY_API_TOKEN_PROD` | production backend deploy | Client's Fly org (`fly tokens create deploy -a properfy-api`) |
| `VERCEL_TOKEN` | all frontend deploys | §7.3 |
| `VERCEL_ORG_ID` | all frontend deploys | §7.3 |
| `VERCEL_PROJECT_ID_WEB` / `_PWA` (+ `_STAGING`/`_DEV` variants) | frontend deploys | §7.3 |
| `VITE_MAPBOX_TOKEN` | frontend builds | §5 browser token |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | **remove** after cutover | — |

---

## 9. Post-first-deploy one-shots (production)

1. **Platform notification templates** (idempotent seed, `tenant_id = NULL`):

   ```bash
   fly ssh console -a properfy-api -C "cd /app && node apps/backend/dist/seed-platform-notification-templates.js"
   ```

2. **First AM user** — production seeds no QA fixtures; the only user-creating
   artifact allowed in prod is the dedicated one-shot (plan §7.3):

   ```bash
   fly ssh console -a properfy-api -C "cd /app && node apps/backend/dist/provision-admin.js --email <client-admin-email>"
   ```

   It creates the AM with a throwaway password, fires the password-reset email,
   and refuses to run if an AM already exists. Never run
   `provision-qa-users.js` or `prisma db seed` against production.
3. **2FA enrollment** for the AM account (mandatory for AM).
4. **Integrations Hub check** — dashboard should show email/SMS/geocoding as
   configured (green), not stub.

## 10. Verification checklist

- [ ] `https://api.properfy.me/ready` returns OK **and** migration state
      verified (memory: `/ready` alone does not prove migrations ran)
- [ ] Login works at `app.properfy.me`; no CORS errors in the console
- [ ] PWA installs from `pwa.properfy.me` (manifest + service worker OK)
- [ ] Create appointment → tenant portal link opens on `app.properfy.me`
- [ ] One real email (Resend dashboard shows delivered, DKIM pass) and one
      real SMS delivered; delivery webhooks land (check notification statuses)
- [ ] File upload (agency logo / inspection asset) round-trips via signed URL;
      an email image renders from the public `email-assets` bucket
- [ ] XLSX export downloads
- [ ] Overnight: exactly 1 machine kept running; pg-boss cron jobs fired
      (`pgboss.job` shows completed reminder/expiry runs)
- [ ] Burst test wakes machine #2, and it stops again when idle
