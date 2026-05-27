# Fix Portal Link Notifications — Bug Fix Spec

**Date:** 2026-05-27
**Feature:** `fix-portal-link-notifications`
**Branch:** `fix/portal-link-notifications`
**Type:** Bug fix (not a new feature)
**Reported by:** QA staging verification (2026-05-27)
**Reporter context:** AppointmentDetailPage "Send Portal Link" button executed in staging, but emails are not delivered to tenants AND the "Copy Portal Link" button stays permanently disabled even after a token is generated.
**Status:** Draft — Crítico round 1 verdict: REPROVADA (1 BLOCKER, 1 MAJOR, 2 MINORs). Round 2/2 refinement applied below; resubmitting to Crítico.

---

## 1. Overview

This is a **post-release bug-fix spec** scoped to defects introduced or surfaced by the 028 release (`tenant-confirmation-cycles + portal token + Copy Portal Link`, commit `d85442e`, 2026-05-26).

Three distinct defects are bundled because they share the same user-visible flow ("operator clicks Send Portal Link → tenant receives email → operator can copy the link"), share the same code-area ownership (tenant-portal + notification + appointment GET response), and were all observed in the same QA pass. They are independent in fix code but related in scope.

### Bugs in scope

| ID | Severity | Symptom | Layer |
|----|----------|---------|-------|
| **B1** | CRITICAL (BLOCKER) | `notification.send` pg-boss jobs are not consumed; notifications stay PENDING forever; emails never reach Resend | Backend — notification dispatch path + worker observability |
| **B2** | MEDIUM | `hasActivePortalToken` always evaluates to a stale/incorrect value, leaving the "Copy Portal Link" button disabled | Backend — `GetAppointmentUseCase` semantic + response wiring |
| **B3** | MEDIUM (ops) | Fly.io machines `v251` crash on boot with `PORTAL_TOKEN_ENC_KEY: Required in non-development environments`; only the older `v250` machine is serving traffic | Ops/infra — Fly.io secret not propagated to new machines |

### Out of scope (explicit)

- No database migrations, no schema column additions, no Prisma model changes.
- No breaking changes to existing API contracts. The `hasActivePortalToken` field already exists in `appointmentResponseSchema` (`packages/shared/src/schemas/responses.ts:236`) and in the use case output type (`get-appointment.use-case.ts:88`) — only its **computation** and **schema optionality** are being corrected.
- No changes to the pg-boss version, no migration to a different queue technology. We address worker behaviour with **observability and instrumentation first**, then a deeper fix only if the root cause warrants it (see §3.B1 fix strategy).
- No changes to the front-end. The front-end already consumes `appointment.hasActivePortalToken` correctly (`apps/web/src/features/appointments/pages/AppointmentDetailPage.tsx:248,254`) AND already calls `refetch()` on POST success (line 133), so once the backend serves the correct boolean, the "Copy Portal Link" button will enable within one network round-trip — **no manual page refresh required**. (Round 2 — resolves Crítico MAJOR: the spec previously implied manual refresh; the FE refetch is the actual mechanism.)

---

## 2. Diagnosis (code-level evidence)

### 2.A — Bug 1: `notification.send` worker not consuming jobs

#### Files inspected

| File | Line | Observation |
|------|------|-------------|
| `apps/backend/src/main/server.ts` | 100–124 | `registerWorkers` is invoked only when `env.ENABLE_JOB_QUEUE === 'true'`. In staging/prod this is forced true by `env.ts:116-117`. |
| `apps/backend/src/main/workers.ts` | 78–82 | `boss.work('notification.send', ...)` is registered with an inner `logger.info('Processing notification.send job')`. |
| `apps/backend/src/shared/infrastructure/queue.ts` | 13–18, 34–46 | Single shared `pg-boss` v9.0.3 instance via `getQueue()`. `sendJob` calls `q.send(name, enrichedData, options)`. In pg-boss v9 the queue is auto-created on first send. |
| `apps/backend/src/shared/infrastructure/pgboss-job-queue.ts` | 5–11 | `PgBossJobQueue.enqueue` maps the call but propagates errors with `await`. |
| `apps/backend/src/modules/notification/application/use-cases/create-notification.use-case.ts` | 62–87 | Persists the notification row (`save`), then `await this.jobQueue.enqueue('notification.send', { notificationId }, { retryLimit: 0 })`. Both steps are awaited, no internal try/catch. |
| `apps/backend/src/modules/tenant-portal/application/use-cases/generate-portal-token.use-case.ts` | 130–143, 145–159 | Two **silent** `try { await createNotificationUseCase.execute(...) } catch { /* fire-and-forget; token is already saved */ }` blocks. Any thrown error from CreateNotificationUseCase (including a failed `jobQueue.enqueue`) is swallowed with **no logger.error, no metrics, no audit**. |

#### What this means

The user-observed symptom is "row exists as PENDING but no `Processing notification.send job` log". There are three possible root causes consistent with this symptom:

1. **Hypothesis H1 (most likely, low diagnostic confidence without prod logs):** `PgBossJobQueue.enqueue` throws inside the `try` block in `generate-portal-token.use-case.ts:131-143` (or `:147-159` for SMS). The row was persisted before the throw, the catch swallows the error with no logging, the endpoint still returns 201. The `notification.send` queue never receives the job, so the worker has nothing to consume.

2. **Hypothesis H2 (less likely given env validation):** `boss.work('notification.send', ...)` registration on `workers.ts:78` failed at startup. Other scheduled workers (`notification.retry-poll`, `tenant-portal.expire-tokens`) appear functional, but they are **scheduled** queues (registered via `boss.schedule()` + `boss.work()`) — their registration path is different. A targeted failure on the `boss.work` for the non-scheduled `notification.send` queue is possible but would surface in `app.log.error` at boot (`server.ts` start sequence) if `await registerWorkers(...)` rejected. Worth confirming in logs.

3. **Hypothesis H3 (latent / not the active root cause):** `boss.send` actually succeeds and the row is enqueued, but a different process owns the worker (split deploy). Today Properfy runs as a **single Fastify process per Fly machine** with both API and workers in-process (see `server.ts:100-124`), so this is not the cause. **Excluded.**

The silent try/catch in `generate-portal-token.use-case.ts` actively **hides whichever of H1/H2 is true**. Any spec fix must remove that observability gap as **prerequisite** — otherwise we can fix the symptom blindly but never confirm the cause.

#### Confidence

- **Reproduction:** HIGH — QA reproduced manually in staging.
- **Root cause identification:** MEDIUM — H1 is the strongest hypothesis from code review, but cannot be confirmed without observable logs from staging. The instrumentation fix (§3.B1) is designed to surface the answer in the first 24h of the next staging deploy.

---

### 2.B — Bug 2: `hasActivePortalToken` returns wrong value

#### Files inspected

| File | Line | Observation |
|------|------|-------------|
| `packages/shared/src/schemas/responses.ts` | 236 | `hasActivePortalToken: z.boolean().optional()` — **optional**. Schema permits the field to be absent. |
| `apps/backend/src/modules/appointment/application/use-cases/get-appointment.use-case.ts` | 88 | `GetAppointmentOutput.hasActivePortalToken: boolean` — **non-optional in the TS type**. |
| `apps/backend/src/modules/appointment/application/use-cases/get-appointment.use-case.ts` | 166 | `hasActivePortalToken: appointment.activeConfirmationCycleId !== null` — **proxy**, introduced by commit `d85442e` on 2026-05-26 (`git blame -L 165,168`). |
| `apps/backend/src/modules/tenant-portal/infrastructure/prisma-tenant-portal-token.repository.ts` | 33–38 | `findActiveByAppointmentId` exists but only checks `status = 'ACTIVE'` — does NOT verify `expires_at > now()`. |
| `apps/backend/prisma/schema.prisma` | 968–989 | `TenantPortalToken` model: `status TenantPortalTokenStatus @default(ACTIVE)`, `expires_at DateTime`. Enum values: `ACTIVE | EXPIRED | REVOKED | SUPERSEDED`. |
| `apps/backend/src/modules/appointment/application/services/confirmation-cycle.service.ts` | 306–320 | `setAppointmentActiveCycle` writes `active_confirmation_cycle_id` on the appointment when a cycle is created. So the proxy IS set in the happy path. |

#### What this means

The proxy `activeConfirmationCycleId !== null` is **semantically incorrect** per the Regras invariant (Group B.1, HIGH confidence): an active confirmation cycle can exist while its associated token has been REVOKED, EXPIRED (status mutated by the `tenant-portal.expire-tokens` worker, see `workers.ts:164-169`), or SUPERSEDED during a cycle rotation. In all these cases the proxy reports `true` while the front-end button would call an endpoint that returns no usable link.

In the opposite direction, the proxy reports `false` when:
- The appointment was created before feature 028 deployed and has not gone through the new cycle flow yet (its `active_confirmation_cycle_id` is `null` for legacy reasons).
- A cycle creation transaction was rolled back due to an unrelated post-mint failure (rare but possible).
- An operator generated a token through a code path that bypasses `ConfirmationCycleService` (the `else` branch on `generate-portal-token.use-case.ts:73-77`, which fires when `cycleService` and `prisma` are not both wired — defensive but reachable in test/dev contexts).

The correct semantic per spec 007 §FR-012 + Regras B.1 is: **`true` if and only if there exists a `tenant_portal_tokens` row for this appointment with `status = 'ACTIVE'` AND `expires_at > NOW()`**.

A second-order observation: the schema field is currently `optional()` (`responses.ts:236`). Optional fields are permitted to be absent from the JSON payload. Once the value is computed correctly we should also tighten the contract to non-optional, so the next regression of this kind would fail Zod serialisation rather than silently return `false`.

#### Confidence

- **Root cause:** HIGH — proven by code reading + git blame + Regras invariant reference.
- **Fix correctness:** HIGH — the repository method `findActiveByAppointmentId` already exists and just needs the `expires_at > now()` check + integration into the appointment detail load path.

---

### 2.C — Bug 3: `PORTAL_TOKEN_ENC_KEY` not configured on Fly.io machines

#### Files inspected

| File | Line | Observation |
|------|------|-------------|
| `apps/backend/src/main/env.ts` | 52–55 | `PORTAL_TOKEN_ENC_KEY: z.string().min(44, ...).optional()` — declared optional in Zod, with min-length validation when present. |
| `apps/backend/src/main/env.ts` | 103–108 | Cross-field check: when `NODE_ENV !== 'development' && NODE_ENV !== 'test'`, this env var is REQUIRED and absence throws `Environment validation failed`. |
| `apps/backend/src/main/server.ts` | 143–145 | `validateEnv()` runs synchronously before `start()`. A throw here terminates the process — Fly.io marks the machine as crashed and retries up to its `max_restart_count`. |

#### What this means

The `v250` machine boots fine because its environment was provisioned with `PORTAL_TOKEN_ENC_KEY` earlier (probably during the 028 deploy preparation). All machines provisioned **after** that point (the `v251` set, including `iad`) inherited the new image but **not** the secret — strongly suggesting the secret was added to **one machine only**, not propagated via `fly secrets set` at the **app level**.

This is an operational issue, not a code defect. The `fail-fast` behaviour on `env.ts:103-108` is correct per Regras Group A invariants (HIGH confidence: secrets MUST be present in non-dev environments — a degraded boot would risk silently storing unencrypted tokens, which violates the 028 security model). We do NOT propose softening the validation.

#### Confidence

- **Root cause:** HIGH — error message in Fly.io machine logs matches the validation error exactly.
- **Fix correctness:** HIGH — `fly secrets set` is the standard remediation; idempotent; verifiable via `fly secrets list`.

---

## 3. Fix strategy

### 3.A — Constraints (apply to every fix)

1. **No DB writes, no schema changes.** All three bugs are fixable in application/infrastructure code only.
2. **No breaking external API changes.** `hasActivePortalToken` becomes non-optional, which IS an **internal contract update** classified as **low-risk strengthening**: it adds a guarantee (the field will always be present) without removing any existing guarantee. All known consumers in the monorepo (`apps/web/src/features/appointments/types/index.ts:71`, `packages/shared/src/api-types.ts:4987`, `apps/pwa`) type the field as optional on the receiving side, so promoting to required only narrows the producer contract and does not break decoders. No external (third-party) consumer exists. (Round 2 — resolves Crítico MINOR-2: makes the contract-update classification explicit instead of hiding it under "no breaking changes".)
3. **TDD required** per project convention (CLAUDE.md §11). Unit tests for use-case-level changes, integration test for the GET appointment endpoint with mixed token states.
4. **All transitions / dispatch points must remain auditable** per CLAUDE.md §5 and Regras Group A. Adding logging cannot remove existing audit entries.
5. **Authorization unchanged.** The actor authorization on `GET /v1/appointments/:id` and on the "Send Portal Link" endpoint remains as today (CL_ADMIN, CL_USER, AM, OP for GET; AM, OP only for portal token generation per `generate-portal-token.use-case.ts:23`).

### 3.B1 — Bug 1 fix

**Strategy: instrument first, observe in staging, then deepen if needed.**

#### Step 1 — Remove the silent swallow in `generate-portal-token.use-case.ts`

Replace each silent `catch {}` block (lines 140–143 and 156–159) with a structured `logger.error` that captures:

- `notificationId` (when the row was persisted before the throw — re-load from the error chain or capture before)
- `appointmentId`, `tenantId`, `channel`, `recipient` (already in local scope)
- The error message + stack
- A stable log code like `tenant_portal.notification_dispatch_failed`

The catch must STILL swallow the rethrow (the fire-and-forget contract is correct per the inline comment "token is already saved — failure must not turn the endpoint into a 500"), but **never silently**. The endpoint continues to return 201.

The `GeneratePortalTokenUseCase` constructor will need a `logger` dependency added — wire from `container.ts` via existing app logger.

#### Step 2 — Add observability inside `CreateNotificationUseCase`

Inject a logger (same logger used elsewhere in the notification module). Around the `await this.jobQueue.enqueue(...)` on line 86, wrap with a `try/catch/throw` pattern that logs:

- On entry: `notification.enqueue_start { notificationId, jobName, channel, templateCode }`
- On success: `notification.enqueue_success { notificationId, jobName }`
- On failure: `notification.enqueue_failed { notificationId, jobName, error }` — then **re-throw** so the caller still observes the failure.

This is the key change. Today an enqueue failure is invisible. After this change it is impossible to miss.

#### Step 3 — Worker-side liveness log in `workers.ts:78–82`

The existing `logger.info('Processing notification.send job', { notificationId, jobId })` fires only when a job is actually picked up — useful but not enough. Add a one-time `logger.info('worker.notification_send.registered', { workerId })` immediately after `await boss.work('notification.send', ...)` returns. Same for all other queues if cleanly factorable (do not over-engineer — `notification.send` is the priority).

This catches H2 (worker failed to register) by giving a positive boot signal.

#### Step 4 — Deploy instrumentation to a staging-equivalent environment, observe, fix in same PR

The above three steps are **independent of which of H1 / H2 is the actual root cause** — both manifest as observable logs within minutes of reproducing the click. The execution sequence inside this single PR is:

1. Land steps 1–3 on the `fix/portal-link-notifications` branch locally.
2. Boot the backend in a near-production configuration (Docker compose with Postgres + pg-boss, `NODE_ENV=staging`-equivalent), exercise the Send Portal Link flow, and inspect logs.
3. Identify which hypothesis fires:
   - **If H1 (enqueue throws):** the new `notification.enqueue_failed` log surfaces the exception. The deep fix lands in **this same PR** (specific change depends on the exception — e.g., adjust `request_id` injection in `queue.ts:40-41`, fix queue-name encoding, correct payload typing, etc.).
   - **If H2 (worker not registered):** the missing `worker.notification_send.registered` log identifies the issue at boot. Likely cause is an exception during `registerWorkers` that aborts the rest of the registrations. Fix: wrap each registration in its own try/catch with error logging so a single registration failure does not orphan subsequent workers. Lands in **this same PR**.
4. After the deep fix lands locally and unit-tests pass, deploy to staging and run AC-1.5 end-to-end. If AC-1.5 passes, the PR is ready for review. **No follow-up PR is permitted for Bug 1's deep fix** — it ships in the same PR or the PR does not ship.

(Round 2 — resolves Crítico BLOCKER: removes the previous "or as a follow-up if it requires non-trivial work" escape hatch. The CRITICAL/BLOCKER label and AC-1.5 jointly define "PR complete"; any branch where Bug 1 is unfinished must escalate to the human via the Guia rather than extend through a follow-up label.)

#### Escalation path if the deep fix is harder than local observation suggests

If, after running step 4 with full observability, the root cause is identified but the fix is genuinely non-trivial (e.g., requires a pg-boss upgrade, a different queue technology, a multi-day refactor), the Arquiteto MUST:

1. Document the finding in `historico`.
2. Update the `status` note with the blocker.
3. Signal the Guia for human review **before** any deviation from this PR's scope. The human decides whether to (a) accept the deeper fix as in-scope and extend the PR, (b) split the deeper fix into a separately scoped feature spec, or (c) accept the instrumentation as a partial mitigation while another path is planned.

The human gate is the only mechanism for changing the PR's scope. No silent rescoping.

#### Why NOT propose a "full refactor" of the dispatch path now

- Bug 1 is reproducible locally with the new instrumentation; the cause should be identifiable within one local debug session.
- A speculative deeper fix risks introducing new regressions in a working area (other queues consume fine).
- The 028 release is fresh; minimal change preserves the ability to bisect cleanly if QA finds another regression in the same area.

### 3.B2 — Bug 2 fix

**Strategy: replace the proxy with the actual token check; surface it through the appointment repository.**

#### Approach: query the token in `findById`, expose on `AppointmentWithRelations`

Modify `apps/backend/src/modules/appointment/infrastructure/prisma-appointment.repository.ts` `findById` (lines 117–178):

1. In the `include` block (already containing `contacts`, `restrictions`, `property`, etc.), add a `tenant_portal_tokens` clause with `where: { status: 'ACTIVE', expires_at: { gt: new Date() } }, select: { id: true }, take: 1`. Prisma supports filtered relations.
2. In the returned `AppointmentWithRelations`, add a new field `hasActivePortalToken: boolean` (true if the included array is non-empty).
3. Update `AppointmentWithRelations` interface in `apps/backend/src/modules/appointment/domain/appointment.repository.ts` accordingly.

#### Updates in `GetAppointmentUseCase`

- Replace line 166: `hasActivePortalToken: appointment.activeConfirmationCycleId !== null` → `hasActivePortalToken: found.hasActivePortalToken`.

#### Updates in `GetPortalLinkUseCase` (Planejador round-1 BLOCKER fix — endpoint consistency)

`GetPortalLinkUseCase.execute` at `apps/backend/src/modules/tenant-portal/application/use-cases/get-portal-link.use-case.ts:44-46` currently early-rejects with `NoActivePortalTokenError` when `appointment.activeConfirmationCycleId` is null. This is the **same cycle proxy** removed from `GetAppointmentUseCase`, and leaving it here creates a semantic inconsistency: with the Bug 2 fix in place, `hasActivePortalToken` can be `true` (real token alive) while the proxy is `null` (legacy / bypassed-cycle data), so the front-end button enables and the very next click returns 409.

**Fix:** delete lines 44–46. The subsequent `findActiveByAppointmentId` call (line 48, patched in CQ-2 to verify `expires_at > now()`) becomes the **sole authority** for "does an active token exist?", aligned with `hasActivePortalToken` from `GetAppointmentUseCase`. No behavior is lost — if no active token exists, the existing line 49-50 `if (!token) throw new NoActivePortalTokenError()` covers it. The audit emission at lines 66-74 remains correct because it only fires after a valid token is obtained.

This change is mandatory in this PR; without it, US2 (Bug 2) is structurally incomplete per Planejador round-1 verdict.

#### Schema tightening

- Change `packages/shared/src/schemas/responses.ts:236` from `z.boolean().optional()` → `z.boolean()`. Regenerate the OpenAPI types via the project's normal regeneration command (TBD — see `tasks.md` for the exact command after Plan generates it).
- Verify no other consumer of `appointmentResponseSchema` is broken — the test mock in `AppointmentDetailPage.test.tsx:89` already sends a real boolean, so the front-end side is safe.

#### Why query in the repo rather than inject `tokenRepo` into the use case

- The repo's existing `findById` already does a multi-table `include`. Adding one more relation is a single additional join in the same query — cheaper than a follow-up round-trip.
- Keeps the use case clean of cross-aggregate repository wiring (would otherwise need both `appointmentRepo` and `tokenRepo` injected, splitting the consistency concern).
- Matches the existing pattern for `propertyAddress`, `inspectorName`, etc., all of which are derived in `findById`.

#### Trade-off considered and rejected

Calling `tokenRepo.findActiveByAppointmentId` from the use case (after also patching that method to verify `expires_at > now()`) was considered. Rejected because:
- Two queries vs one.
- Still requires patching `findActiveByAppointmentId` to verify expiry (current impl is buggy on that front too — see §2.B file inspection).

If the Crítico prefers the use-case-level approach during the gate, the spec can be revised — both are correct.

### 3.B3 — Bug 3 fix

**Strategy: operational, documented; no code change.**

1. Run the following commands against the Fly.io production app (operator action, not Executor):

   ```
   # Generate a 32-byte hex key locally
   PORTAL_TOKEN_ENC_KEY="$(openssl rand -hex 32)"

   # Set on Fly.io (use --stage if you want to defer release until next deploy; omit to apply immediately and trigger a rolling restart)
   fly secrets set PORTAL_TOKEN_ENC_KEY="$PORTAL_TOKEN_ENC_KEY" -a properfy-api

   # Verify
   fly secrets list -a properfy-api | grep PORTAL_TOKEN_ENC_KEY

   # Monitor the next machine restart cycle to ensure v251+ boot cleanly
   fly status -a properfy-api
   fly logs -a properfy-api
   ```

   **Critical:** the value used in production MUST match whatever is currently on `v250`. If it does NOT match, all tokens minted by `v250` become undecryptable after `v251+` machines come online. To avoid this:

   - Option A (preferred): connect to `v250` via `fly ssh console` and read the existing key from its environment (`env | grep PORTAL_TOKEN_ENC_KEY`), then `fly secrets set` that exact value app-wide.
   - Option B: if reading from `v250` is not feasible, plan a coordinated downtime window where you (1) deploy with a new key, (2) accept that all currently-active portal tokens are invalidated and need to be re-sent, (3) communicate to customers if any tokens were live.

2. Add a runbook entry. Likely location: `docs/runbooks/` (create if missing) — file `portal-token-enc-key.md` with:
   - Purpose of the key.
   - How to generate.
   - How to verify on Fly.io.
   - The Option A / Option B recovery flow above.
   - Cross-reference to `apps/backend/src/main/env.ts:103-108`.

3. Document the secret in `docs/` next to the existing infra documentation (location TBD by the Plan agent — `projeto-consolidado/infra-tecnologia-production-ready.md` is the most likely target per CLAUDE.md §14).

No application code changes. No env-var schema relaxation. The fail-fast behaviour is correct and remains.

---

## 4. Acceptance criteria

### General

- Lint, typecheck, unit tests, integration tests, build all green.
- No new ESLint warnings introduced.
- Coverage gates per CLAUDE.md §11: 70% global, 80%+ for `apps/backend/src/modules/notification` and `apps/backend/src/modules/tenant-portal` (existing thresholds).
- No DB migration produced. Running `pnpm --filter backend prisma migrate status` shows no pending changes.

### Bug 1

- AC-1.1 — After a `POST /v1/appointments/:id/portal-token` request with a primary contact that has an email, the staging logs contain (in this order, within 10 seconds): `tenant_portal.token_generated` audit entry, `notification.enqueue_start`, then either `notification.enqueue_success` followed by `Processing notification.send job`, OR `notification.enqueue_failed` with a captured error.
- AC-1.2 — Removing the silent swallows in `generate-portal-token.use-case.ts` does NOT regress the existing contract: the endpoint still returns 201 even when notification dispatch fails. Verified by unit test that asserts `dispatched: true` is returned even when `createNotificationUseCase.execute` throws.
- AC-1.3 — Worker registration log `worker.notification_send.registered` appears once during boot (verified by reading `app.log` during a fresh `pnpm --filter backend dev` boot).
- AC-1.4 — Root cause identified via the new logs (H1 enqueue throw, H2 worker registration failure, or another surfaced cause) AND a corresponding fix landed in **this same PR**. No follow-up PR is permitted to close Bug 1; if local observation reveals a non-trivial cause, the path is the escalation procedure described in §3.B1 Step 4, not a follow-up label. (Round 2 — Crítico BLOCKER fix.)
- AC-1.5 — End-to-end manual check by QA in staging: trigger Send Portal Link → confirm notification row transitions PENDING → SENT within 30 seconds → confirm Resend Inbox shows the provider message ID. AC-1.5 passing is the **gating condition** for "Bug 1 complete". A PR that has not satisfied AC-1.5 is not eligible for merge.

### Bug 2

- AC-2.1 — `GET /v1/appointments/:id` returns `hasActivePortalToken: true` iff a `tenant_portal_tokens` row exists for that appointment with `status = 'ACTIVE' AND expires_at > NOW()`. Returns `false` otherwise (no token, expired token, revoked token, superseded token, all return `false`).
- AC-2.2 — `appointmentResponseSchema.hasActivePortalToken` is non-optional (`z.boolean()`); the field is present in every successful response payload.
- AC-2.3 — Integration test added covering at least: (a) no token, (b) ACTIVE + not-yet-expired, (c) ACTIVE + already-expired (rare race between check and the `expire-tokens` worker — must return `false`), (d) REVOKED, (e) SUPERSEDED.
- AC-2.4 — In staging, a single click on Send Portal Link transitions the "Copy Portal Link" button from disabled to enabled **without manual page refresh**, within one network round-trip of the POST response. The mechanism is the existing FE `refetch()` call on `apps/web/src/features/appointments/pages/AppointmentDetailPage.tsx:133`, which re-issues `GET /v1/appointments/:id` and consumes the (now correctly-populated) `hasActivePortalToken` boolean. (Round 2 — Crítico MAJOR fix: removed the previous "+ page refresh" caveat that implied a UI gap.)
- AC-2.5 — Token-active check uses the Node process clock (`new Date()`) at the API layer for consistency with the existing `tenant-portal.expire-tokens` worker (`apps/backend/src/main/workers.ts:164-169`) and `expireActiveTokens` repository method (`prisma-tenant-portal-token.repository.ts:116-125`). On the millisecond-boundary between expiry and the next worker tick (max 15-minute window), the API returns `hasActivePortalToken: false` for any token where `expires_at <= now_node` — i.e., the API is **at-least-as-strict-as** the worker, never **less-strict**. This is consistent with the existing convention; no DB-side `NOW()` is required. Documented here so future contributors do not interpret the spec wording (`expires_at > NOW()`, lowercase `now()`) as mandating SQL-side time. (Round 2 — Crítico MINOR-2 fix: makes clock authority explicit.)
- AC-2.6 — `GET /v1/appointments/:id/portal-link` returns `200 + portalUrl` iff there exists a `tenant_portal_tokens` row for the appointment with `status = 'ACTIVE' AND expires_at > new Date()`. Returns `409 NoActivePortalTokenError` otherwise. The early `appointment.activeConfirmationCycleId` proxy reject at `get-portal-link.use-case.ts:44-46` is removed; `findActiveByAppointmentId` (post-T028 patch) is the sole authority. Integration test covers: (a) cycle null + token ACTIVE+valid → **200** (the regression case that motivated this AC); (b) cycle non-null + token ACTIVE+valid → 200; (c) cycle non-null + token REVOKED → 409; (d) cycle non-null + no token row → 409. (Round 3 — Planejador BLOCKER fix: aligns the portal-link endpoint with the new `hasActivePortalToken` semantic so the FE never enables a click that the backend then refuses.)

### Bug 3

- AC-3.1 — Output of `fly secrets list -a properfy-api` includes `PORTAL_TOKEN_ENC_KEY` with a non-empty digest.
- AC-3.2 — `fly status -a properfy-api` shows all machines (including the previously-crashing `v251+`) in `started` state.
- AC-3.3 — A runbook document exists at `docs/runbooks/portal-token-enc-key.md` (or equivalent agreed location) describing the recovery and key-rotation procedure.
- AC-3.4 — The key value applied app-wide matches whatever `v250` was using (or, if not feasible, the team has consciously accepted token invalidation and notified affected customers — documented in `historico`).

---

## 5. Risks and known unknowns

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Bug 1 deeper root cause requires more work than the instrumentation pass reveals (e.g., a pg-boss version-specific defect) | Medium | Schedule pressure on the BLOCKER label; PR may need to be held longer | If local observation reveals a non-trivial cause, the Arquiteto follows the §3.B1 Step 4 escalation procedure: document the finding in `historico`, update `status`, signal the Guia for human review **before** any deviation from PR scope. The human decides whether to extend the PR, split into a separate feature spec, or accept a partial mitigation. **No silent follow-up PR is permitted.** (Round 2 — Crítico BLOCKER fix.) |
| `PORTAL_TOKEN_ENC_KEY` cannot be safely read from `v250` for any reason | Low | Existing live portal links break for current tenants | Explicit Option B path in §3.B3. Stakeholder comms required. |
| Adding the `tenant_portal_tokens` filtered include in `findById` changes a hot query plan and regresses appointment-detail latency | Low | Slower detail page load | The `tenant_portal_tokens` table already has the three separate indexes used by the predicate: `@@index([appointment_id])`, `@@index([status])`, `@@index([expires_at])` (`schema.prisma:986-988`). The filtered relation uses `take: 1` + `select: { id: true }` to cap row weight. Re-verify with `EXPLAIN ANALYZE` during implementation (see task in §8 / `tasks.md`) — gate is "uses an index for the appointment_id lookup, no full scan, no material regression vs. baseline" rather than a fixed millisecond threshold. (Round 3 — Planejador correction: previous wording inaccurately implied a composite index.) |
| Removing silent swallows surfaces an existing-but-quiet flood of errors in staging logs | Low | Log noise, alert fatigue | Acceptable: silent failures are worse than noisy ones; the team can downgrade specific noisy errors after they are seen and triaged. |
| The `request_id` injection in `sendJob` (queue.ts:40-41) interferes with pg-boss job validation | Low | Job creation throws inside pg-boss, masked by the catch | Covered by §3.B1 step 2 — exception will be logged, then fixable explicitly. |

---

## 6. Applicable business rules

From the Regras consultation (2026-05-27, full coverage of Groups A, B, C, D — all HIGH confidence; sources: `specs/009-notifications`, `specs/007-tenant-portal`, `prisma/schema.prisma`, `apps/backend/src/main/env.ts`, `specs/DECISIONS.md`):

**Group A — Notification dispatch (Bug 1):**

- **A.1 (HIGH):** `CreateNotificationUseCase` MUST persist the row in PENDING **AND** enqueue the `notification.send` job synchronously and immediately. If the enqueue fails, the entire operation fails — there is no acceptable degraded path. (spec 009 US1 + DECISIONS.md DEC-036.)
- **A.2 (HIGH):** Silent enqueue failure is **forbidden**. Try/catch swallow == row PENDING forever == invariant breach. Every catch in the dispatch chain must log structured error context.
- **A.3 (HIGH):** Sending is always asynchronous via pg-boss in specs 009–018. No synchronous-send code path exists or is permitted.
- **A.4 (HIGH):** Retry policy lives in the application layer: backoff `[15s, 45s, 2m, 5m, 15m]` + jitter, `MAX_RETRY_COUNT = 6` (~25 min total). pg-boss native retry is intentionally OFF (`retryLimit: 0` on enqueue). The `notification.retry-poll` cron job (every 5 min) re-enqueues rows whose `next_retry_at < now()`.
- **A.5 (HIGH):** Idempotency: by `(appointmentId, templateCode)` at the dispatcher level; by `provider_message_id` at the webhook level.

**Group B — Tenant portal token (Bug 2):**

- **B.1 (HIGH):** An "active token" is defined as `status = 'ACTIVE' AND expires_at > now()` on the `tenant_portal_tokens` row (`schema.prisma:968-989`, spec 007 US2 §FR-012).
- **B.2 (HIGH):** `hasActivePortalToken` on the appointment detail response is mandatory per spec 007 US1 (Copy Portal Link button) and per the 028 spec (§3 scope of `specs/028-tenant-confirmation-cycles/spec.md`). The current proxy implementation (`activeConfirmationCycleId !== null`) is **incorrect** per the active-token definition above.

**Group C — Required secrets in staging/production (Bug 3):**

- **C.1 (HIGH):** `env.ts:103-108` fail-fast on missing `PORTAL_TOKEN_ENC_KEY` is **correct** behaviour — must not be softened. A degraded boot would risk silently storing unencrypted tokens, violating the 028 security model.
- **C.2 (HIGH):** Full list of secrets that MUST be present in staging/production (per `env.ts:110-163`): `PORTAL_TOKEN_ENC_KEY`, `TOTP_ENCRYPTION_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `MOBILE_MESSAGE_API_KEY`, `MOBILE_MESSAGE_PASSWORD`, `MOBILE_MESSAGE_SENDER_ID`, `MAPBOX_ACCESS_TOKEN`, `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`, plus `CORS_ORIGIN`. The runbook produced under §3.B3 should cross-reference all of these — Bug 3 is the immediate trigger but the runbook serves the entire secret set.

**Group D — RBAC + Audit:**

- **D.1 (HIGH):** `POST /v1/appointments/:id/portal-token` is authorised **only** for AM or OP (spec 007 FR-001). Already enforced at `generate-portal-token.use-case.ts:23-41`. No change needed.
- **D.2 (HIGH):** Audit is mandatory: `action = 'tenant_portal.token_generated'` (spec 007 FR-006). Already emitted at `generate-portal-token.use-case.ts:79-90`. No change needed.
- **D.3 (HIGH, derived):** The instrumentation added in §3.B1 (structured error logs around enqueue) is **additive observability**, not a new audit channel. It does not replace existing audit log entries or `tenant_portal.dispatch_skipped` audit emission at `generate-portal-token.use-case.ts:98-109`.

(Round 2 — Crítico round 1 left Groups C/D as "truncated/partial"; round 2 closes that gap with the full Regras response received via the maestri channel.)

---

## 7. Clarifications (round 1/5 — closed, zero NEEDS CLARIFICATION remaining)

All five open questions resolved with default proposals. The human-review gate (post-Crítico) is the next opportunity to override any of these — explicit dissent should be flagged there.

1. **CQ-1 (Bug 1 — ship cadence):** RESOLVED → ship instrumentation **and** the deeper fix together in **this single PR**. Bug 1 is a CRITICAL BLOCKER per §1; AC-1.4 and AC-1.5 jointly define the completion gate. **No follow-up PR is permitted for Bug 1's deep fix.** If local observation reveals a cause that genuinely cannot be addressed within this PR's window, the escalation path is §3.B1 Step 4 (`historico` → `status` → Guia → human review), not a follow-up label. **Reason:** the prior "follow-up within the same week" language created a contradiction with the BLOCKER label and AC-1.5 (Crítico BLOCKER finding). Closing the contradiction by making the PR fully accountable for Bug 1.

2. **CQ-2 (Bug 2 — `findActiveByAppointmentId` patch):** RESOLVED → patch both. The method gains an explicit `expires_at: { gt: new Date() }` filter. **Reason:** one-line, fixes a latent semantic bug, matches Regras B.1 invariant; cost of leaving it inconsistent across two call sites in the same fix is higher than fixing it now.

3. **CQ-3 (Bug 3 — runbook location):** RESOLVED → Plan agent inspects `projeto-consolidado/infra-tecnologia-production-ready.md` first. If a secrets/env section exists, extend it. Otherwise, create `docs/runbooks/portal-token-enc-key.md` per default. **Reason:** convention-following; the Plan agent already has the read context to make this decision in one pass.

4. **CQ-4 (Bug 2 — schema tightening):** RESOLVED → tighten `z.boolean().optional()` → `z.boolean()` in this PR. **Reason:** OpenAPI consumers in this monorepo are the front-end (web + pwa). Search confirms `hasActivePortalToken?: boolean` in `apps/web/src/features/appointments/types/index.ts:71` and `packages/shared/src/api-types.ts:4987` — both already type the field as optional on the consumer side, so promoting to non-optional only **adds a guarantee**, never removes one. No external (third-party) consumer is in scope.

5. **CQ-5 (Bug 3 — who runs `fly secrets set`):** RESOLVED → the human operator (Pedro Alves, per `Git user`) runs the command outside the PR. The PR contains only the runbook + documentation. The Executor MUST NOT receive Fly.io production credentials. **Reason:** least-privilege; secret material never enters the PR or chat context; ops actions are explicitly under human control per CLAUDE.md §13 + the role workflow §5b.

---

## 8. Implementation order (preview — final order set by /speckit.tasks)

1. `packages/shared` — tighten `hasActivePortalToken` schema (Bug 2).
2. `apps/backend/src/modules/appointment/domain/appointment.repository.ts` — extend `AppointmentWithRelations` interface (Bug 2).
3. `apps/backend/src/modules/appointment/infrastructure/prisma-appointment.repository.ts` — query token in `findById` (Bug 2).
4. `apps/backend/src/modules/appointment/application/use-cases/get-appointment.use-case.ts` — wire new field (Bug 2).
5. `apps/backend/src/modules/tenant-portal/infrastructure/prisma-tenant-portal-token.repository.ts` — patch `findActiveByAppointmentId` expiry check (Bug 2 follow-up, CQ-2 default YES).
6. `apps/backend/src/modules/notification/application/use-cases/create-notification.use-case.ts` — instrument enqueue (Bug 1).
7. `apps/backend/src/modules/tenant-portal/application/use-cases/generate-portal-token.use-case.ts` — remove silent catch, add logger dep (Bug 1).
8. `apps/backend/src/main/workers.ts` — add registration liveness log (Bug 1).
9. `apps/backend/src/main/container.ts` — wire logger into GeneratePortalTokenUseCase + CreateNotificationUseCase if not already wired.
10. Tests — unit + integration per ACs.
11. `docs/runbooks/portal-token-enc-key.md` or equivalent extension (Bug 3).
12. PR description includes the operational checklist for Bug 3 secret rotation (so the operator-runner has a single source of truth).

---

## 9. Confidence summary

| Component | Diagnostic confidence | Fix-correctness confidence |
|---|---|---|
| Bug 1 — root cause | MEDIUM (need staging observation) | HIGH for the instrumentation; MEDIUM for the (still-pending) deeper fix |
| Bug 2 — root cause + fix | HIGH | HIGH |
| Bug 3 — root cause + fix | HIGH | HIGH (operational, but well-understood) |

---

## 10. Crítico checklist (anticipated)

- ✓ Diagnosis cites file:line evidence per bug.
- ✓ Each fix has a stated business invariant it preserves (Regras references).
- ✓ Acceptance criteria are testable (unit, integration, manual QA).
- ✓ Out-of-scope items are explicit.
- ✓ Risks acknowledged with mitigations; Bug 1 risk no longer carries the follow-up escape hatch.
- ✓ Open questions all resolved with defaults (§7) — zero NEEDS CLARIFICATION remaining.
- ✓ Regras coverage of Groups A–D is complete — all HIGH confidence (§6).
- ✓ Round 1 Crítico findings addressed: BLOCKER closed (no follow-up PR for Bug 1), MAJOR closed (FE auto-refetch via line 133), MINOR-2 closed (clock authority pinned to Node), MINOR-4 closed (schema tightening explicitly classified as low-risk internal contract update).
