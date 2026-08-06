# Deploy Restructure Plan — production on client accounts

> Status: **PLANNING — approved structure, not yet implemented.**
> Scope: re-map branch → environment deploys, move production to the client's own
> accounts (Fly.io + Vercel + client domain `properfy.me`), size the production
> Fly machines for ~250 daily users with autoscaling (min 1 machine, Sydney).

---

## 1. Target topology

Every environment shifts one step down; a new `production` branch is added on top.

```
develop ──▶ staging ──▶ main ──▶ production        (branch promotion flow)
               │          │          │
               ▼          ▼          ▼
             DEV       STAGING    PRODUCTION       (deployed environments)
```

| | DEV | STAGING | PRODUCTION |
|---|---|---|---|
| **Git branch** | `staging` | `main` | `production` (new) |
| **Backend (Fly)** | `properfy-api-dev` | `properfy-api-staging` | `properfy-api` |
| **Fly account** | Dev | Dev | **Client** |
| **Fly region** | `iad` | `syd` | `syd` |
| **Web frontend** | Vercel | Vercel | Vercel |
| **PWA frontend** | Vercel | Vercel | Vercel |
| **Vercel account** | Client team (Pro) | Client team (Pro) | Client team (Pro) |
| **Database** | Supabase — current shared project, now **dev-only** | Supabase — current **prod** project, repurposed as staging | **New Supabase project (client account)** |
| **Web URL** | `properfy.pedroalvs.com` | `properfy.autolabs.tech` | `app.properfy.me` |
| **PWA URL** | `pwa-properfy.pedroalvs.com` | `pwa-properfy.autolabs.tech` | `pwa.properfy.me` |
| **API URL** | `api-properfy.pedroalvs.com` | `api-properfy.autolabs.tech` (reuse) | `api.properfy.me` |

Rationale for names: `properfy-api-<env>` makes the Fly app's role unambiguous
(today `properfy` vs `properfy-prod` is confusing); the production app drops the
suffix because it lives alone in the client's Fly organization.

Region note: staging moves to `syd` to match production behavior (timezone,
latency); dev stays `iad` (the gru-capacity workaround note in `fly.staging.toml`
carries over to the dev config). If syd capacity is ever an issue for staging,
fall back to iad — only production is contractually Sydney.

## 2. Account split

Two fully separate account sets. the dev has access to both, but credentials never mix.

| Provider | Dev's account (dev + staging) | Client's account (production) |
|---|---|---|
| Fly.io | apps `properfy-api-dev`, `properfy-api-staging` | app `properfy-api` |
| Vercel | — | team (Pro, already active) hosting ALL six frontend projects — prod, staging and dev (extra projects cost nothing on Pro) |
| Cloudflare | Pages projects retired entirely after cutover | DNS for `properfy.me` (wherever the client's DNS lives) |
| Supabase | dev: current shared project (becomes dev-only) · staging: current prod project (repurposed) — every env now has its own database | new project (production DB + storage) |
| GitHub secrets | `FLY_API_TOKEN` (existing) | `FLY_API_TOKEN_PROD`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_WEB`, `VERCEL_PROJECT_ID_PWA` |

Everything production is provisioned fresh: new Supabase project (DB, `email-assets`
public bucket and the private buckets), new RS256 JWT keypair, new `ENC_KEY`, new
SMS webhook token, production Resend/MobileMessage/Mapbox keys. No secret reuse
from staging.

## 3. Production Fly sizing — 250 daily users, Sydney

**Load profile.** 250 DAU across the three portals + PWA, concentrated in Sydney
business hours. Realistic peak concurrency ≈ 30–60 users → single-digit requests
per second against a Fastify + Prisma stack. This is comfortably inside one
shared-CPU machine; the second machine exists for redundancy and burst, not
baseline capacity.

**Recommended `fly.production.toml`:**

```toml
app = 'properfy-api'
primary_region = 'syd'

[build]
  dockerfile = 'apps/backend/Dockerfile'

[deploy]
  release_command = 'sh -lc "cd /app/apps/backend && prisma migrate deploy"'
  strategy = 'rolling'

[env]
  NODE_ENV = 'production'
  PGBOSS_SCHEMA = 'pgboss'
  PORT = '3000'
  LOG_LEVEL = 'info'
  JWT_ACCESS_TOKEN_TTL_MINUTES = '60'

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = 'stop'     # scale down when idle…
  auto_start_machines = true      # …scale back up on demand
  min_machines_running = 1        # never below 1 (pg-boss crons live in-process)
  processes = ['app']

  [http_service.concurrency]
    type = 'requests'
    soft_limit = 80               # proxy wakes machine #2 past this
    hard_limit = 250

[[http_service.checks]]
  grace_period = '30s'
  interval = '30s'
  method = 'GET'
  timeout = '10s'
  path = '/ready'

[[vm]]
  size = 'shared-cpu-1x'
  memory = '1gb'
```

**Machine plan:** create **2 machines in syd** (`fly scale count 2`).

- Fly's proxy stops idle machines and boots them on incoming requests (cold start
  is single-digit seconds for this image); `min_machines_running = 1` guarantees
  the floor of one machine always up. That floor is **mandatory**, not just nice:
  pg-boss cron scheduling (reminders 7/5/3, overdue auto-cancel, escalations)
  runs inside the API process — scale-to-zero would silently stop all crons.
- Machine #2 stays stopped ~most of the time and wakes only when the running
  machine crosses `soft_limit = 80` concurrent requests, or when machine #1 is
  unhealthy/being replaced during a rolling deploy. Both machines running pg-boss
  concurrently is safe — pg-boss coordinates via Postgres locks.
- Memory goes 512 MB → **1 GB**: XLSX exports (5 000-row cap), imports and
  HTML-email sanitization are the memory spikes; 1 GB keeps a stopped-start
  machine from OOMing under the exact burst that woke it.

**Cost estimate (Fly, syd):** shared-cpu-1x/1GB ≈ **US$5.70/mo** running 24/7;
machine #2 mostly stopped costs only rootfs storage (~US$0.15/GB/mo, cents).
Plus egress. Total backend ≈ **US$6–9/mo**. Upgrade path if it ever lags:
`shared-cpu-2x`/2GB first, dedicated CPU only if p95 shows CPU steal.

## 4. Frontend hosting

**Everything moves to Vercel** (client team, Pro plan already active). Six
projects, one naming standard — production drops the suffix:

| Env | Web project | PWA project |
|---|---|---|
| Production | `properfy-web` → `app.properfy.me` | `properfy-pwa` → `pwa.properfy.me` |
| Staging | `properfy-web-staging` | `properfy-pwa-staging` |
| Dev | `properfy-web-dev` | `properfy-pwa-dev` |

Cloudflare Pages projects and the wrangler CI steps are retired entirely after
cutover; extra Vercel projects cost nothing on Pro. All environments share the
same CDN/rewrite behavior, so what passes on dev/staging is hosting-identical
to production.

**Seats & billing:** Vercel Pro bills **US$20/mo per deploying Owner/Member
seat**; Viewer seats are unlimited and free. With the client (owner) + the dev
both as Members that's US$40/mo. To stay at US$20/mo: all deploys are CI-driven
anyway, so the `VERCEL_TOKEN` used by GitHub Actions can be created from the
owner's account, and the dev joins as a free **Viewer** (dashboard read access —
logs, deployments). Trade-off: changing project settings/env vars in the Vercel
dashboard then requires the owner's account (or temporarily upgrading the dev's
seat, prorated). Given env vars are baked at CI build time here, dashboard
writes should be rare — recommend the Viewer setup.

Deploy mechanism is CI-driven (build in GitHub Actions with the right
`VITE_API_BASE_URL`, then `vercel deploy --prebuilt --prod` with token/org/project
secrets) — mirrors the current wrangler flow, avoids coupling Vercel's Git
integration to a repo on the dev's GitHub account, and is what makes the
single-paid-seat model possible.

**Porting concern:** the SPA/PWA currently rely on Cloudflare Pages conventions
(`_headers`, `_redirects` — incl. the stale-chunk-retry cache headers). Vercel
uses `vercel.json` (`rewrites` for the SPA fallback, `headers` for caching and
the PWA service-worker scope). This must be authored and smoke-tested during the
staging move, before production ever ships.

## 5. CI/CD workflow changes

`fly-deploy.yml` → three jobs:

| Trigger | Job | Config | Token |
|---|---|---|---|
| push `staging` | deploy DEV (iad) | `fly.dev.toml` (rewritten, becomes real) | `FLY_API_TOKEN` |
| push `main` | deploy STAGING (syd) | `fly.staging.toml` | `FLY_API_TOKEN` |
| push `production` | deploy PRODUCTION (syd) | `fly.production.toml` | `FLY_API_TOKEN_PROD` |

`pages-deploy.yml` → renamed (e.g. `frontend-deploy.yml`), Vercel-only:

- push `staging` → Vercel deploy web+pwa dev projects.
- push `main` → Vercel deploy web+pwa staging projects.
- push `production` → Vercel deploy web+pwa production projects.

Wrangler and the `CLOUDFLARE_*` secrets are removed once cutover completes.

Guard rails:

- Branch protection on `production`: PRs only, from `main` only (convention),
  CI green required. Same gates `main` already has.
- The QA-users provisioning step (`provision-qa-users.js`) runs in the **dev and
  staging** release commands only — never in production's.
- Keep the existing per-env `PGBOSS_SCHEMA` isolation; production gets its own
  DB so cross-env job theft (a known past incident) is structurally impossible.
- `fly.dev.toml`'s current "UNUSED BY CI" warning header is removed once it
  becomes the real dev config; add the inverse warning to whichever file a bare
  `fly deploy` would pick up.

## 6. Domains & DNS

Production (client DNS on `properfy.me`):

| Record | Target |
|---|---|
| `app.properfy.me` | CNAME → Vercel (`cname.vercel-dns.com`) |
| `pwa.properfy.me` | CNAME → Vercel |
| `api.properfy.me` | CNAME → `properfy-api.fly.dev` + `fly certs add api.properfy.me` |

Backend CORS allowlist and cookie/redirect config must add the two new frontend
origins; notification templates and portal links must emit `app.properfy.me`
(tenant portal links, calendar .ics, email CTAs) — audit every place a base URL
is configured (env vars `WEB_BASE_URL`-style, seed data, template sample data).

Staging/dev domains (decided — the dev's DNS, CNAMEd to the Vercel projects):

| Env | Web | PWA | API |
|---|---|---|---|
| Staging | `properfy.autolabs.tech` | `pwa-properfy.autolabs.tech` | `api-properfy.autolabs.tech` |
| Dev | `properfy.pedroalvs.com` | `pwa-properfy.pedroalvs.com` | `api-properfy.pedroalvs.com` |

API domains are repointed at the new Fly apps (`fly certs add` on each).
Each environment's backend `CORS_ORIGIN` must list exactly its two frontend
origins.

## 7. Migration consolidation & seed policy (v1 baseline)

Production going live is the one moment a migration squash is cheap: no
deployed environment depends on replaying history, and prod starts from an
empty database. Current state: **124 migrations**, 5 of which insert data.

### 7.1 Squash into a v1 baseline

1. **Freeze window:** no migration-bearing PRs merge while the squash PR is open.
2. **Generate** a single `0_init` migration with
   `prisma migrate diff --from-empty --to-schema-datamodel schema.prisma --script`.
3. **Hand-carry what the schema cannot express** — this repo has known
   schema↔migrations drift, so the generated script is a starting point, not
   the answer. Must be appended manually:
   - `CREATE EXTENSION` statements (`pg_trgm` for contact search, etc.)
   - Raw-SQL / `Unsupported()`-typed indexes (Prisma's differ silently drops
     these — known incident)
   - Any triggers/functions/views created by raw SQL in past migrations
   - The **reference data** from the 5 data-bearing migrations (platform
     notification templates, default time-slots, retention config) — this is
     platform config every environment needs, prod included; it stays in the
     baseline, not in seeds.
4. **Verify by replay, not by eyeball:** apply the old 124 migrations to
   throwaway Postgres A, the new baseline to throwaway B (the existing
   throwaway-container recipe), then diff both with
   `prisma migrate diff --from-url A --to-url B` **and** compare the reference
   rows. Iterate until the diff is empty.
5. **Baseline existing environments:** dev/staging databases already have all
   124 applied — run `prisma migrate resolve --applied 0_init` against each so
   the new ledger starts clean without executing anything. Production simply
   runs the baseline for real on first deploy.
6. Old migration folders are deleted in the same PR; git history keeps them.

### 7.2 Seed taxonomy — what runs where

| Artifact | Contains | DEV | STAGING | PROD |
|---|---|---|---|---|
| `0_init` baseline (reference inserts) | platform templates, time-slots, retention config | ✅ | ✅ | ✅ |
| `prisma/seed.ts` (+ `refresh-demo-seed`) | demo agencies, properties, appointments | manual only | manual only | ❌ never |
| `provision-qa-users.js` | QA role fixtures (AM/OP/CL_ADMIN/CL_USER) | release command | release command | ❌ never |
| `seed-platform-notification-templates.ts` | idempotent template upserts | optional | optional | ✅ post-deploy one-shot (safety net; baseline already carries them) |
| **`provision-admin.ts` (new)** | first AM user only | — | — | ✅ one-shot |

### 7.3 First-admin one-shot (new script)

Production needs exactly one seeded row to be usable: the first Admin Master.
Plan: a dedicated `src/scripts/provision-admin.ts` (bundled to `dist/` like the
other scripts) that reads `ADMIN_EMAIL` from env/argv, creates the AM user with
a random throwaway password, immediately triggers the existing password-reset
flow (email via Resend), and exits non-zero if an AM already exists —
idempotent by refusal, never by overwrite. Run via:

```bash
fly ssh console -a properfy-api -C "cd /app && node apps/backend/dist/provision-admin.js --email <client-admin-email>"
```

2FA enrollment (mandatory for AM) happens on first login through the normal UI
flow. This script is the **only** user-creating artifact that ever touches
production.

## 8. Deploy-flow & branch security hardening

### 8.1 Branch protection (GitHub rulesets)

All four long-lived branches (`develop`, `staging`, `main`, `production`):
PR-only (no direct pushes), force-push and deletion blocked, required status
checks = the full CI matrix.

Two protections close known failure modes from this repo's history:

- **Require branches to be up to date before merging** — a retargeted stacked
  PR does not re-trigger CI, and a conflicted PR silently never schedules it,
  so a PR can show stale/absent green ("green checks that mean nothing").
  Up-to-date enforcement forces a fresh run on the final merge base.
- `production` additionally restricted: merges allowed **from `main` only**
  (convention enforced by review; GitHub can't express source-branch rules) and
  the human gate lives in the deploy environment approval (§8.3), which is
  stronger than a second PR review for a solo maintainer.

### 8.2 CI must gate deploys (currently it does not)

Today `fly-deploy.yml` and `pages-deploy.yml` trigger on `push` independently
of `ci.yml` — a red build still deploys. Fix in the workflow rewrite:

- Deploy workflows trigger via **`workflow_run` on CI completing successfully**
  for the branch (or the deploy job repeats lint+typecheck+test as `needs:`
  stages). Push alone must never deploy.
- Keep per-env `concurrency` groups (already present) so overlapping deploys
  queue instead of racing.
- Post-deploy smoke step in the workflow itself (hit `/ready`, assert the
  deployed SHA via a version endpoint/header) — memory: `/ready` alone does not
  prove the migration ran; assert release version too.

### 8.3 GitHub Environments — scoped secrets + manual prod gate

Create GitHub **environments** `dev`, `staging`, `production` and move deploy
secrets into them (out of repo-level secrets):

- `production` env holds `FLY_API_TOKEN_PROD` + the prod Vercel project IDs and
  is configured with **required reviewers** (the dev) and **deployment branch =
  `production` only**. Effect: no workflow on any other branch can even read
  the prod token, and every prod deploy pauses for an explicit approval click —
  the deploy window rule (09:00 BR) becomes enforceable, not aspirational.
- `dev`/`staging` envs hold the dev's tokens; no approval gate (fast iteration).

### 8.4 Token scoping & rotation

- Fly tokens per app, not org-wide: `fly tokens create deploy -a <app>` — the
  CI token for staging cannot touch production's app even if leaked.
- Vercel token scoped to the client team, created by the owner (§4).
- Rotation policy — automated where possible, minimized elsewhere. Third-party
  providers (Resend, MobileMessage, Mapbox, Vercel, Supabase S3) expose no
  rotation API, so true hands-off rotation does not exist for them. Instead:
  - **Scoped + revocable beats calendar rotation** for machine tokens: every
    token is per-app/per-team scoped, so the standing policy is
    *rotate-on-event* (member offboarding, suspected leak, provider incident),
    not on a timer.
  - **JWT keypair — the one that matters — gets a script:** `rotate-jwt.sh`
    generates the new pair, shifts the old public key into
    `JWT_PREVIOUS_PUBLIC_KEY`/`JWT_PREVIOUS_KEY_ID` with a 30-day
    `JWT_PREVIOUS_KEY_EXPIRES_AT`, and applies both via one `fly secrets set`
    (atomic, zero-downtime). Running it is one command, no manual steps.
  - **A scheduled GitHub Actions workflow (cron, twice a year) opens a
    reminder issue** with the rotation checklist — replacing the calendar
    entry; nothing lives outside the repo.

### 8.5 Release traceability & rollback

- **Tagging is fully automated** — no local script, no manual step. The
  production deploy workflow, after CI passes and before deploying: reads the
  latest `v*` tag, computes the bump **from the Conventional Commits since
  that tag** (the convention every commit already follows), creates the tag +
  GitHub Release (auto-generated notes from merged PRs) and deploys that SHA.
  Bump rules:
  - only `fix:`/`chore:`/`refactor:`/etc. → **patch**
  - at least one `feat:` → **minor**
  - **major never happens implicitly and is the dev's explicit call** — only via
    `[release:major]` in the merge-commit message or a manually pushed tag
    (which the workflow respects as the new base). The developing AI may
    *suggest* a major (e.g. on a breaking API change) but must never add the
    token on its own — it goes in only when the dev explicitly requests it.

  No new convention for the developing AI to remember: the signal is the
  commit prefixes it already writes. First tag: `v1.0.0`. The API exposes the
  version (build-time env → `/ready` payload) for the smoke assertion in §8.2.
- **Backend rollback:** Fly health checks already auto-rollback a failed
  release; for a bad-but-healthy release, `fly releases -a properfy-api` →
  redeploy the previous image. Safe because migrations follow expand/contract
  (N-1 code must run on N schema — keep enforcing in review).
- **Frontend rollback:** Vercel → previous deployment → *Promote to
  production* (instant, no rebuild).
- **Database:** enable **PITR / daily backups** on the production Supabase
  project before go-live, and run one restore drill to a scratch project so the
  first real restore isn't the first attempt ever.

## 9. Cutover sequence (phased, production last)

**Phase 0 — prep (no user impact)**
1. Client accounts: create Fly org + app `properfy-api`, Supabase project,
   Vercel team (Pro) + 4 projects, DNS records. Generate all production secrets.
2. Write `fly.production.toml`, rewrite `fly.dev.toml`, adjust `fly.staging.toml`
   (app name, syd, schema), author `vercel.json` for web + pwa.
3. **Migration squash (§7):** freeze window → squash PR → replay-verified
   baseline → `migrate resolve --applied` on dev/staging DBs. Land this before
   the `production` branch exists so prod's first deploy already runs the
   clean baseline.
4. Write `provision-admin.ts` (§7.3) — TDD like any backend change.
5. Create `production` branch from current `main`.

**Phase 1 — restructure dev/staging (the dev's accounts)**
6. Create new Fly apps `properfy-api-dev` / `properfy-api-staging`, set secrets,
   deploy from `staging` / `main`, run smoke tests (memory: `/ready` alone does
   not prove migrations — use the deploy-verification recipe).
7. Move frontends: create the four dev/staging Vercel projects, port
   `_headers`/`_redirects` to `vercel.json`, deploy from CI. Full portal QA on
   staging (all four portals, per QA checklist).
8. Update CI workflows to the new triggers/targets, including the hardening
   set (§8): CI-gated deploys, GitHub environments with scoped secrets and the
   prod approval gate, branch protection rulesets. Retire old Fly apps
   (`properfy`, `properfy-prod`), Cloudflare Pages projects and `CLOUDFLARE_*`
   secrets only after a full green cycle.

**Phase 2 — production go-live (client accounts)**
9. Merge `main → production` → first production deploy (empty DB, v1 baseline
   runs fresh; reference data lands via the baseline, no QA fixtures).
   Then the first-admin one-shot (§7.3) — the only prod seed.
10. Point `app.` / `pwa.` / `api.properfy.me`, verify TLS certs.
11. Smoke: login, appointment lifecycle, tenant portal link, one real email +
   SMS (production Resend/MobileMessage), XLSX export, PWA install.
12. Load sanity: confirm machine #2 wakes under a burst (e.g. `hey`/`wrk` at
    ~120 concurrent) and stops again when idle; confirm exactly 1 machine keeps
    running overnight and crons fired (check pg-boss job tables next morning).

**Phase 3 — hardening**
13. Fly alerting (health-check emails / Grafana), Vercel deploy notifications.
    Supabase PITR/backup enabled + one restore drill (§8.5). Secret-rotation
    calendar entry created (§8.4).
14. Document the new promotion flow in `CLAUDE.md` §12 and the memory index;
    update `projeto-consolidado/instrucoes-cicd-fly-portainer.md` (Portainer
    references are obsolete after this).

## 10. Decisions log (all closed — plan is ready for implementation)

1. **Vercel seat:** the dev joins as free Viewer; CI deploys with an
   owner-issued token. Total US$20/mo.
2. **Supabase production:** new project on the client's own org.
3. **Prod gate:** the dev merges `main → production` and is the environment's
   required reviewer, inside the existing 09:00 BR deploy window.
4. **Data migration: none.** Production starts empty — baseline + first-admin
   one-shot only; the client registers agencies/properties/inspectors fresh.
5. **Database isolation (side effect of the restructure):** every environment
   ends with its own database — the current prod Supabase project is repurposed
   as **staging's DB**, the current shared dev/staging project becomes
   **dev-only**, production gets the new client project. The shared-DB
   cross-env pg-boss risk disappears structurally. Keep distinct
   `PGBOSS_SCHEMA` values anyway (`pgboss_dev` / `pgboss_staging` / `pgboss`)
   as cheap defense-in-depth; note the repurposed staging DB carries the old
   prod data — the QA provisioning script runs on it from the first staging
   release, and any old-prod leftovers can be cleaned or kept as staging
   fixtures at cutover.

## 11. Execution split — AI via terminal vs manual (the dev)

Principle: **manual work is front-loaded into a single credentials handoff.**
Accounts, billing, dashboard token minting and DNS are human work; once the
tokens exist, everything else is terminal-automatable (flyctl, gh, vercel CLI,
wrangler, openssl, psql/containers).

### 11.1 Manual — the dev (mostly one sitting, before Phase 0 code starts)

| # | Task | Why manual |
|---|---|---|
| M1 | Client **Fly.io** org: create/verify, attach billing | Account + billing UI |
| M2 | Client **Supabase** org + create the production project (region `ap-southeast-2`), note DB password | Dashboard (CLI possible with an access token, but org/billing setup is UI) |
| M3 | **Vercel**: confirm Pro team, owner mints the team-scoped `VERCEL_TOKEN`, invite the dev as Viewer | Token must come from the owner's account |
| M4 | **Resend**: create account, add domain `properfy.me` | Dashboard |
| M5 | **MobileMessage**: create/confirm client account, request sender-ID approval, copy API key/password | Dashboard + AU compliance |
| M6 | **Mapbox**: create the two tokens (server unrestricted, browser URL-restricted) | Dashboard |
| M7 | **DNS** for `properfy.me`: add the CNAMEs + Resend DKIM/SPF records (values supplied by the AI) | Registrar/DNS UI |
| M8 | Supabase dashboard clicks the AI can't reach: S3 access keys, storage buckets (`properfy-assets` private, `email-assets` public) — *or* hand the AI a Supabase access token and it scripts them | Dashboard/API key |
| M9 | **Approvals**: review PRs, click the production environment approval, decide staging-DB data cleanup | Human judgment by design |

No Fly login handoff is needed: the dev is a member of the client org
(`contact-properfy-inspections`), already visible to the local `flyctl` session
alongside `personal`. Production commands just target it explicitly
(`fly apps create properfy-api --org contact-properfy-inspections`;
`fly tokens create deploy -a properfy-api` mints `FLY_API_TOKEN_PROD` from the
same login). One consequence to respect: a bare `fly deploy` can now reach
production from this machine — every Fly command must carry `-a <app>`/`--config`
explicitly, and the production-access rule (never touch prod without an explicit
request) applies as ever.

### 11.2 Terminal — the AI (everything else)

**Code (worktree + PR flow, per phase):**
- All config files: `fly.production.toml`, rewritten `fly.dev.toml` /
  `fly.staging.toml`, `vercel.json` (web + pwa), CI workflow rewrite
  (triggers, workflow_run gating, environments, auto-tagging), `rotate-jwt.sh`,
  scheduled rotation-reminder workflow.
- Migration squash: throwaway-container replay, `0_init` authoring,
  replay-diff verification loop, `migrate resolve --applied` runs.
- `provision-admin.ts` with TDD; version exposure in `/ready`.
- CLAUDE.md / docs updates (cutover step 14).

**Infra operations (after the handoff):**
- Secrets generation: JWT keypairs, the 3 AES keys, webhook tokens (`openssl`).
- Fly (both orgs once M8 done): `apps create`, `secrets set/import`,
  `certs add` + cert status polling, `scale count 2`, deploys, `fly ssh
  console` one-shots (template seed, provision-admin), old-app teardown.
- GitHub via `gh api`: create `production` branch, rulesets/branch protection,
  the three Environments with scoped secrets (`gh secret set --env`),
  required-reviewer config on `production`.
- Vercel via CLI + M3 token: create the six projects, attach all domains,
  wire project IDs into GitHub environment secrets.
- Cloudflare Pages teardown via wrangler (CI token already exists).
- Verification: DNS propagation checks (`dig`), smoke curls, browser QA of all
  four portals (Chrome tools), burst test for machine-#2 wake/stop, overnight
  cron check via `pgboss.job` queries.

### 11.3 Handoff checklist (what the AI needs handed over, literally)

1. `VERCEL_TOKEN` (owner-minted, M3) + confirmation the Viewer invite exists.
2. Production Supabase: `DATABASE_URL` password + S3 keys (M8) — or a Supabase
   access token to script it.
3. Resend API key + webhook signing secret (M4, after domain verifies).
4. MobileMessage API key/password/sender ID (M5).
5. Both Mapbox tokens (M6).
6. Confirmation that the M7 DNS records are in (the AI verifies propagation).

Everything in the list is pasteable into the terminal session; the AI stores
them only in Fly/GitHub secret stores, never in the repo.
