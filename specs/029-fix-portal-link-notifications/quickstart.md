# Quickstart: Fix Portal Link Notifications

**Audience**: the Executor who will implement this spec, plus future readers diagnosing similar regressions.
**Floor**: `/Users/pedro/Code/GitHub/.maestri/floors/properfy--fixportal-link-notifications/`
**Branch**: `fix/portal-link-notifications`

This document is a recipe — follow it sequentially to reproduce the bugs, implement the fixes, and verify each acceptance criterion.

---

## 0. Prerequisites

```bash
cd /Users/pedro/Code/GitHub/.maestri/floors/properfy--fixportal-link-notifications
git branch --show-current   # must print: fix/portal-link-notifications
pnpm install                # workspace install
```

You need a local Postgres + pg-boss schema. Two options:

- **A (recommended)**: Docker compose with the project's bundled `docker-compose.yml` (if present) or the dev-setup as documented in `docs/dev-setup.md`.
- **B**: A Supabase staging branch or your local Postgres with `DATABASE_URL` pointed at it.

Required env vars (set in `apps/backend/.env.local` or your shell):

```env
NODE_ENV=staging                    # to exercise the same code path as Fly.io
DATABASE_URL=...                    # local Postgres
DIRECT_URL=...                      # same target, non-pooled
JWT_PRIVATE_KEY=...                 # any RSA pair will do for local
JWT_PUBLIC_KEY=...
CORS_ORIGIN=http://localhost:5173
ENABLE_JOB_QUEUE=true               # forced by env.ts:116-117 in staging anyway
PORTAL_TOKEN_ENC_KEY=<openssl rand -hex 32>
TOTP_ENCRYPTION_KEY=<openssl rand -hex 32>
RESEND_API_KEY=re_test_xxx          # any non-empty string; provider is mocked locally if SMTP unreachable
RESEND_FROM_EMAIL=noreply@example.com
MOBILE_MESSAGE_API_KEY=test
MOBILE_MESSAGE_PASSWORD=test
MOBILE_MESSAGE_SENDER_ID=test
MAPBOX_ACCESS_TOKEN=pk.test
SUPABASE_S3_ENDPOINT=http://localhost:9000
SUPABASE_S3_ACCESS_KEY_ID=local
SUPABASE_S3_SECRET_ACCESS_KEY=local
TENANT_PORTAL_BASE_URL=http://localhost:5173
PUBLIC_BASE_URL=http://localhost:3000
```

Apply Prisma migrations to your local DB:

```bash
pnpm --filter backend prisma migrate deploy
```

---

## 1. Reproduce Bug 1 (`notification.send` not consumed) — BEFORE applying fixes

```bash
# Terminal 1 — boot backend
pnpm --filter backend dev
```

Wait for: `pg-boss workers registered: report.generate, report.expire-files, ... , notification.send, ...`

```bash
# Terminal 2 — seed and trigger
# (a) Identify an existing appointment with a primary contact that has an email,
#     OR seed one via prisma/seed.ts.

# (b) Mint an OP JWT (use the existing test helper or the bootstrap user from seed).

# (c) Hit the endpoint
curl -X POST http://localhost:3000/v1/appointments/<APPOINTMENT_ID>/portal-token \
  -H "Authorization: Bearer <OP_JWT>" \
  -H "Content-Type: application/json" \
  --data '{}'
```

Expected (current, pre-fix behavior):

- HTTP 201 returned.
- A row exists in `notifications` with `status = 'PENDING'`.
- **No log** `Processing notification.send job` appears.
- Inspect `pgboss.job` directly:

  ```sql
  SELECT id, name, state, data, created_on, completed_on, output
  FROM pgboss.job
  WHERE name = 'notification.send'
  ORDER BY created_on DESC
  LIMIT 5;
  ```

  Depending on the hypothesis:

  - **H1 (silent throw at enqueue)**: NO row, OR a row stuck in `state = 'failed'` with an `output` column hinting at the cause.
  - **H2 (worker not registered)**: A row exists with `state = 'created'` or `state = 'active'` (since registration succeeded) but the worker handler never runs. Cross-check with the boot log: `worker.notification_send.registered` log is absent in this case.

**Capture which one fires.** Save the log snippet and any `pgboss.job` output to the PR description under "Phase 0 evidence".

---

## 2. Apply the instrumentation patches (commit 1 of the PR)

Implement spec §3.B1 Steps 1–3 in this order:

1. `apps/backend/src/main/container.ts` — wire `app.log` into the `CreateNotificationUseCase` constructor (add a constructor parameter) and `GeneratePortalTokenUseCase`.
2. `apps/backend/src/modules/notification/application/use-cases/create-notification.use-case.ts` — add `logger.info('notification.enqueue_start', ...)` / `logger.info('notification.enqueue_success', ...)` / `logger.error('notification.enqueue_failed', ...)` around the enqueue call (line 86). Re-throw on failure.
3. `apps/backend/src/modules/tenant-portal/application/use-cases/generate-portal-token.use-case.ts` — replace the two silent catches (lines 140-143, 156-159) with structured `logger.error('tenant_portal.notification_dispatch_failed', ...)` while preserving the fire-and-forget semantics (do NOT re-throw).
4. `apps/backend/src/main/workers.ts:78-82` — add `logger.info('worker.notification_send.registered', { workerId })` immediately after `await boss.work('notification.send', ...)` returns.

Run the type-checker and unit tests after each change:

```bash
pnpm --filter backend typecheck
pnpm --filter backend test
```

Commit message (Conventional Commits):

```
fix(notification): instrument enqueue path to surface dispatch failures

Adds structured logs around CreateNotificationUseCase.enqueue and replaces
silent try/catch in GeneratePortalTokenUseCase with structured error logs
while preserving fire-and-forget semantics. Adds a worker-registration
liveness log so absent registrations are detectable.

Refs: specs/029-fix-portal-link-notifications/spec.md AC-1.1..1.3
```

---

## 3. Re-run the Bug 1 reproduction with instrumentation in place

```bash
pnpm --filter backend dev
```

Boot logs MUST show `worker.notification_send.registered`. If absent → H2 confirmed.

```bash
curl -X POST http://localhost:3000/v1/appointments/<APPOINTMENT_ID>/portal-token ...
```

Expected log sequence on success (the new instrumentation):

```
[INFO] notification.enqueue_start { notificationId, jobName: 'notification.send', channel: 'EMAIL', templateCode: 'TENANT_PORTAL_LINK' }
[INFO] notification.enqueue_success { notificationId, jobName: 'notification.send' }
[INFO] Processing notification.send job { notificationId, jobId: '<pg-boss UUID>' }
[INFO] worker.notification_send.registered { workerId: '<pg-boss worker UUID>' }   # boot-time, once
```

If the failure surfaces:

```
[ERROR] notification.enqueue_failed { notificationId, jobName: 'notification.send', error: '...' }
```

— that error message names the deep fix.

---

## 4. Implement the deep fix for Bug 1 (commit 2 of the PR)

The exact change depends on which hypothesis fired:

- **If H1 with a specific exception**: address the exception in `queue.ts` / `pgboss-job-queue.ts` / `request-context.ts` as the message indicates.
- **If H2**: wrap each `boss.work(...)` call in `workers.ts` in its own try/catch with `logger.error(...)`, so a single registration failure does not orphan subsequent registrations.

Commit message:

```
fix(notification): <specific deep-fix subject>

<one-paragraph what + why, referencing the hypothesis confirmed in commit 1>

Refs: specs/029-fix-portal-link-notifications/spec.md AC-1.4
```

Re-run the curl from §1 → notification row transitions PENDING → SENT within 30s → `provider_message_id` populated.

**AC-1.5 verification (gating)**: hit a real Resend test inbox if available. If not (purely local), assert the `provider_message_id` is set and the email provider mock recorded a `send` call.

---

## 5. Implement Bug 2 (commit 3 of the PR)

Order (per `plan.md` Phase 2 preview):

1. `packages/shared/src/schemas/responses.ts:236` — `z.boolean().optional()` → `z.boolean()`.
2. `apps/backend/src/modules/appointment/domain/appointment.repository.ts` — add `hasActivePortalToken: boolean` to `AppointmentWithRelations`.
3. `apps/backend/src/modules/appointment/infrastructure/prisma-appointment.repository.ts:124-135` — add the filtered `tenant_portal_tokens` include (snippet in `contracts/appointment-response.contract.md`).
4. `apps/backend/src/modules/appointment/infrastructure/prisma-appointment.repository.ts:162-177` — populate `hasActivePortalToken` in the returned object via `row.tenant_portal_tokens.length > 0`.
5. `apps/backend/src/modules/appointment/application/use-cases/get-appointment.use-case.ts:166` — replace `appointment.activeConfirmationCycleId !== null` with `found.hasActivePortalToken`.
6. `apps/backend/src/modules/tenant-portal/infrastructure/prisma-tenant-portal-token.repository.ts:33-38` (CQ-2) — add `expires_at: { gt: new Date() }` to the `findActiveByAppointmentId` where clause.

Run Prisma generate after step 3 to confirm the relation field name:

```bash
pnpm --filter backend prisma generate
pnpm --filter backend typecheck
```

Write tests per `contracts/appointment-response.contract.md` §Tests required (TC-1 through TC-8) using Testcontainers + Postgres.

Verify performance with `EXPLAIN ANALYZE`:

```sql
EXPLAIN ANALYZE
SELECT a.*, t.id AS token_id
FROM appointments a
LEFT JOIN LATERAL (
  SELECT id
  FROM tenant_portal_tokens
  WHERE appointment_id = a.id AND status = 'ACTIVE' AND expires_at > now()
  LIMIT 1
) t ON TRUE
WHERE a.id = '<UUID>' AND a.deleted_at IS NULL;
```

Expected plan shape (acceptance gate, NOT a millisecond target): index seek on `tenant_portal_tokens (appointment_id)` as the primary lookup, with `status` and `expires_at` predicates filtered using their own separate indexes (`@@index([status])`, `@@index([expires_at])` — schema.prisma:986-988). No full table scan. No material regression vs. the baseline `findById` timing captured in T004. (Wording aligned with `tasks.md T031` per Planejador round-2 ressalva.)

Commit message:

```
fix(appointment): hasActivePortalToken reflects real token state

Replaces the activeConfirmationCycleId proxy with a filtered query on
tenant_portal_tokens (status='ACTIVE' AND expires_at > new Date()).
Tightens the response schema to z.boolean() (non-optional). Patches
findActiveByAppointmentId to apply the same expiry check.

Refs: specs/029-fix-portal-link-notifications/spec.md AC-2.1..2.5
```

---

## 6. Verify Bug 2 end-to-end (no manual refresh)

Boot the web app:

```bash
pnpm --filter web dev
```

Open the appointment detail page in a browser, click **Send Portal Link** with a primary email contact. Observe:

- Toast "Email sent to tenant".
- Network tab shows `POST /portal-token` (201) followed by `GET /v1/appointments/<id>` (200) within <1s — this is the `refetch()` at `AppointmentDetailPage.tsx:133`.
- The `Copy Portal Link` button transitions from disabled → enabled **without a manual page refresh**.
- Click `Copy Portal Link` → clipboard receives a portal URL.

This satisfies AC-2.4.

---

## 7. Implement Bug 3 documentation (commit 4 of the PR)

Per `research.md §R-3`:

1. Edit `docs/fly-deploy-guide.md` Section 2 "Set Secrets" → "Required" → after the TOTP block, add:

   ```bash
   # Portal token AES-256-GCM key (32 bytes, hex encoded)
   # Used by tenant-portal to encrypt raw tokens at rest (feature 028).
   # Generate with: openssl rand -hex 32
   fly secrets set PORTAL_TOKEN_ENC_KEY="$(openssl rand -hex 32)"
   ```

2. Create `docs/runbooks/portal-token-enc-key.md` matching the existing `docs/runbooks/jwt-key-rotation.md` style. Cover purpose, initial provisioning, verification, recovery (Option A: SSH to v250 + `env | grep`; Option B: rotate with downtime), and a stub Rotation section flagged as future work.

Commit message:

```
docs(runbooks): add PORTAL_TOKEN_ENC_KEY provisioning and recovery

Documents the required Fly.io secret introduced in feature 028 and adds
a runbook for incident response when machines fail to boot due to
missing key material.

Refs: specs/029-fix-portal-link-notifications/spec.md AC-3.3
```

**Operator action (NOT in this PR)**:

```bash
# Pedro Alves runs this manually after the PR merges (or before, coordinating with v250):
fly secrets set PORTAL_TOKEN_ENC_KEY="<value matching v250 env>" -a properfy-api
fly secrets list -a properfy-api | grep PORTAL_TOKEN_ENC_KEY
fly status -a properfy-api   # all v251+ machines must reach 'started'
```

---

## 8. Final verification (before opening the PR)

Run from the floor root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter backend test:integration   # if separate target
pnpm build
pnpm --filter backend prisma migrate status   # MUST report no pending migrations
```

All green = PR ready for the Guia → Revisor flow.

---

## 9. Anti-checklist (things that MUST NOT be in the PR)

- ❌ Any Prisma migration file.
- ❌ Any change to `apps/web/` or `apps/pwa/`.
- ❌ Any change to `apps/backend/src/main/env.ts` validation rules.
- ❌ Any pg-boss version bump.
- ❌ Any commit message that includes "Claude" or "AI" trailers.
- ❌ Any silent try/catch added back to the code (Regras A.2 invariant).
- ❌ Any new follow-up label, ticket reference, or scope-deferral note in the PR description for Bug 1.
- ❌ Any `fly secrets set` command executed by the Executor (operator-only).

If you find yourself reaching for any of the above — STOP and escalate to the Arquiteto via the Guia.
