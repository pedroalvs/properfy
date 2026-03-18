# Infrastructure: Docker + Fly.io + Cloudflare Pages

**Date:** 2026-03-18
**Status:** Approved
**Scope:** Local dev (Docker) + Staging (Fly.io + Cloudflare Pages)

---

## 1. Overview

Set up the infrastructure for local development and staging deployment of the Properfy platform.

- **Local dev:** Docker Compose runs backend, web, and pwa. Database and S3 storage remain on Supabase cloud.
- **Staging:** Backend on Fly.io, web and pwa on Cloudflare Pages, database and storage on Supabase cloud.
- **Production:** Not in scope. Will mirror staging architecture when ready.
- **CI/CD:** Not in scope for this spec. Will be defined separately.

---

## 2. Architecture

```
Local Dev:
  Docker Compose
    ├── backend  (node:20-alpine, runs tsx watch for hot-reload on :3000)
    ├── web      (node:20-alpine, vite dev server with HMR on :5173)
    └── pwa      (node:20-alpine, vite dev server with HMR on :5174)
  Supabase Cloud → PostgreSQL + S3 Storage

Staging:
  Fly.io
    └── properfy-api-staging (East US / iad)
  Cloudflare Pages
    ├── properfy-web-staging
    └── properfy-pwa-staging
  Supabase Cloud → staging project (East US)
```

---

## 3. Domains

| Service | Domain |
|---------|--------|
| API | api-properfy.pedroalvs.com |
| Web | properfy.pedroalvs.com |
| PWA | pwa-properfy.pedroalvs.com |

Future: migrate to client's domain (planned transition, not blocking).

---

## 4. CORS Origins

| Environment | Allowed Origins |
|-------------|----------------|
| Local | `http://localhost:5173`, `http://localhost:5174` |
| Staging | `https://properfy.pedroalvs.com`, `https://pwa-properfy.pedroalvs.com` |

Configured via `CORS_ORIGIN` env var (comma-separated). **Code change required:** the backend must split `CORS_ORIGIN` into an array before passing to `@fastify/cors`, since it does not handle comma-separated strings automatically.

---

## 5. Region Strategy

- **Now:** East US (`iad` on Fly.io, East US on Supabase) for all environments.
- **Later:** Migrate to Sydney when client requires.
- **Rule:** Backend and database must always be co-located in the same region.

---

## 6. Docker (Local Dev)

### 6.1 Dockerfile.backend

Multi-stage build with two targets: `dev` (for local) and final (for production/Fly.io).

**Stage 1 — Base + Install:**
- Base: `node:20-alpine`
- Enable corepack, activate pnpm
- `WORKDIR /app`
- Copy root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`
- Copy `packages/shared/package.json` and `apps/backend/package.json`
- Run `pnpm install --frozen-lockfile`
- Copy `packages/shared/` and `apps/backend/`
- Run `pnpm --filter backend prisma generate`

**Stage 2 — Dev target (`dev`):**
- FROM base stage
- Expose 3000
- CMD: `pnpm --filter backend dev` (runs `tsx watch`, enables hot-reload with volume mounts)

**Stage 3 — Build:**
- FROM base stage
- Run `pnpm --filter backend build`
- Run `pnpm --filter backend --prod deploy /prod/backend` (prune to production deps only)

**Stage 4 — Production runtime:**
- Base: `node:20-alpine`
- Enable corepack, activate pnpm (for prisma migrate)
- `WORKDIR /app`
- Copy from build: production `node_modules/`, `dist/`, `prisma/`, `package.json`, root workspace files
- Copy `packages/shared/` (runtime dependency)
- Expose 3000
- Healthcheck: `wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1`
- CMD: `node apps/backend/dist/main/server.js`

### 6.2 Dockerfile.web

Single stage for local dev (runs vite dev server):
- Base: `node:20-alpine`
- Enable corepack, activate pnpm
- `WORKDIR /app`
- Copy root configs + `packages/shared/` + `apps/web/`
- Run `pnpm install --frozen-lockfile`
- Expose 5173
- CMD: `pnpm --filter web dev --host 0.0.0.0`

### 6.3 Dockerfile.pwa

Same pattern as web:
- Base: `node:20-alpine`
- Expose 5174
- CMD: `pnpm --filter pwa dev --host 0.0.0.0 --port 5174`

### 6.4 docker-compose.yml

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
      target: dev
    ports:
      - "3000:3000"
    env_file: .env
    environment:
      - NODE_ENV=development
      - PORT=3000
      - ENABLE_JOB_QUEUE=true
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 3
    volumes:
      - ./apps/backend/src:/app/apps/backend/src
      - ./packages/shared/src:/app/packages/shared/src

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    ports:
      - "5173:5173"
    environment:
      - VITE_API_BASE_URL=http://localhost:3000
    volumes:
      - ./apps/web/src:/app/apps/web/src
      - ./packages/shared/src:/app/packages/shared/src

  pwa:
    build:
      context: .
      dockerfile: Dockerfile.pwa
    ports:
      - "5174:5174"
    environment:
      - VITE_API_BASE_URL=http://localhost:3000
    volumes:
      - ./apps/pwa/src:/app/apps/pwa/src
      - ./packages/shared/src:/app/packages/shared/src
```

docker-compose uses `target: dev` for backend (tsx watch with hot-reload). Fly.io uses the final production stage (compiled JS).

### 6.5 .dockerignore

```
node_modules
dist
.git
.github
.turbo
coverage
.env
.env.local
```

### 6.6 .env.example

Template with all required environment variables (no real values):

```env
# Database (Supabase)
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres

# Auth
JWT_PRIVATE_KEY=
JWT_PUBLIC_KEY=
JWT_KEY_ID=properfy-key-v1
TOTP_ENCRYPTION_KEY=

# Storage (Supabase S3)
SUPABASE_S3_ENDPOINT=https://xxx.supabase.co/storage/v1/s3
SUPABASE_S3_ACCESS_KEY_ID=
SUPABASE_S3_SECRET_ACCESS_KEY=
SUPABASE_STORAGE_BUCKET=properfy-assets

# Notifications — Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=notifications@properfy.com.au

# Notifications — SMS
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Notifications — WhatsApp
WHATSAPP_API_KEY=
WHATSAPP_API_URL=

# Geocoding
MAPBOX_ACCESS_TOKEN=

# App
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
ENABLE_JOB_QUEUE=true

# Frontend (build-time)
VITE_API_BASE_URL=http://localhost:3000
VITE_MAPBOX_TOKEN=
```

---

## 7. Fly.io (Staging Backend)

### 7.1 fly.toml

```toml
app = "properfy-api-staging"
primary_region = "iad"

[build]

[deploy]
  release_command = "npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma"

[env]
  NODE_ENV = "staging"
  PORT = "3000"
  LOG_LEVEL = "info"
  ENABLE_JOB_QUEUE = "true"
  JWT_KEY_ID = "properfy-key-v1"
  CORS_ORIGIN = "https://properfy.pedroalvs.com,https://pwa-properfy.pedroalvs.com"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [http_service.concurrency]
    type = "requests"
    hard_limit = 250
    soft_limit = 200

[[http_service.checks]]
  grace_period = "10s"
  interval = "15s"
  method = "GET"
  path = "/health"
  timeout = "5s"

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

**Note:** `auto_stop_machines = "stop"` and `min_machines_running = 0` means the staging app will scale to zero when idle. First request after idle will experience a cold start (~5-10s for container boot + Fastify init + pg-boss connection).

### 7.2 Secrets (set via CLI)

All sensitive values must be set via `fly secrets set`:

```bash
fly secrets set \
  DATABASE_URL="postgresql://..." \
  DIRECT_URL="postgresql://..." \
  JWT_PRIVATE_KEY="$(cat private.pem)" \
  JWT_PUBLIC_KEY="$(cat public.pem)" \
  TOTP_ENCRYPTION_KEY="..." \
  SUPABASE_S3_ENDPOINT="..." \
  SUPABASE_S3_ACCESS_KEY_ID="..." \
  SUPABASE_S3_SECRET_ACCESS_KEY="..." \
  SUPABASE_STORAGE_BUCKET="properfy-assets" \
  RESEND_API_KEY="..." \
  RESEND_FROM_EMAIL="notifications@properfy.com.au" \
  TWILIO_ACCOUNT_SID="..." \
  TWILIO_AUTH_TOKEN="..." \
  TWILIO_PHONE_NUMBER="..." \
  MAPBOX_ACCESS_TOKEN="..." \
  --app properfy-api-staging
```

**Important:** `DIRECT_URL` is required for migrations. It bypasses PgBouncer (uses port 5432 instead of 6543). Without it, `prisma migrate deploy` may fail due to PgBouncer's transaction pooling mode.

### 7.3 Deployment

Fly.io builds the Docker image (using the final production stage of Dockerfile.backend), runs the release command (migrations), then starts the container.

```bash
fly deploy --app properfy-api-staging
```

---

## 8. Cloudflare Pages (Staging Web + PWA)

### 8.1 Configuration (via Cloudflare Dashboard)

**properfy-web-staging:**
- Repository: connected to GitHub repo
- Build command: `pnpm install --frozen-lockfile && pnpm --filter shared build && pnpm --filter web build`
- Build output directory: `apps/web/dist`
- Root directory: `/` (monorepo root)
- Environment variables:
  - `VITE_API_BASE_URL` = `https://api-properfy.pedroalvs.com`
  - `VITE_MAPBOX_TOKEN` = `...`
  - `NODE_VERSION` = `20`
- Custom domain: `properfy.pedroalvs.com`

**properfy-pwa-staging:**
- Same pattern as web
- Build command: `pnpm install --frozen-lockfile && pnpm --filter shared build && pnpm --filter pwa build`
- Build output directory: `apps/pwa/dist`
- Environment variables:
  - `VITE_API_BASE_URL` = `https://api-properfy.pedroalvs.com`
  - `VITE_MAPBOX_TOKEN` = `...`
  - `NODE_VERSION` = `20`
- Custom domain: `pwa-properfy.pedroalvs.com`

**Note:** `pnpm --filter shared build` runs before the app build to ensure workspace dependency `@properfy/shared` is compiled.

### 8.2 SPA Fallback

Add explicit `_redirects` file in each app's `public/` directory:

**apps/web/public/_redirects:**
```
/* /index.html 200
```

**apps/pwa/public/_redirects:**
```
/* /index.html 200
```

This ensures all client-side routes serve `index.html`.

---

## 9. Migration Strategy

| Environment | How | When |
|-------------|-----|------|
| Local | `pnpm --filter backend prisma migrate dev` | Manual, during development |
| Staging | `release_command` in fly.toml (`npx prisma migrate deploy`) | Automatic, before each deploy |

- Expand/contract pattern: always backward-compatible migrations first, remove old schema in subsequent deploys.
- `DIRECT_URL` must be set for migrations (bypasses PgBouncer).

---

## 10. Code Changes Required

### 10.1 CORS origin splitting

**File:** `apps/backend/src/main/plugins.ts`

The `CORS_ORIGIN` env var is comma-separated but `@fastify/cors` does not split strings automatically. Must change:

```typescript
// Before
origin: env.CORS_ORIGIN ?? 'http://localhost:5173'

// After
origin: env.CORS_ORIGIN?.split(',').map(s => s.trim()) ?? ['http://localhost:5173']
```

---

## 11. Files to Create

| File | Purpose |
|------|---------|
| `Dockerfile.backend` | Multi-stage backend image (dev + production targets) |
| `Dockerfile.web` | Web dev server for local |
| `Dockerfile.pwa` | PWA dev server for local |
| `docker-compose.yml` | Local dev orchestration |
| `.dockerignore` | Build context exclusions |
| `.env.example` | Environment variable template |
| `fly.toml` | Fly.io staging config |
| `apps/web/public/_redirects` | Cloudflare SPA fallback |
| `apps/pwa/public/_redirects` | Cloudflare SPA fallback |

## 12. Files to Update

| File | Change |
|------|--------|
| `CLAUDE.md` | Infrastructure section: replace VPS/Portainer with Fly.io + Cloudflare Pages for staging |
| `apps/backend/src/main/plugins.ts` | Split `CORS_ORIGIN` into array |
