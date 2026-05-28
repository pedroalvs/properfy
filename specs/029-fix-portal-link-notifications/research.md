# Phase 0 Research: Fix Portal Link Notifications

**Date**: 2026-05-27
**Spec**: `./spec.md`
**Plan**: `./plan.md`

This document resolves the three research items raised in `plan.md` Phase 0. Each item resolves to **Decision** (chosen approach) + **Rationale** (why) + **Alternatives considered**.

---

## R-1 — Bug 1: confirm active hypothesis (H1 silent enqueue throw vs H2 worker not registered)

### Decision

**Sequence: instrument first → reproduce locally → identify cause → land deep fix in this same PR.**

The instrumentation patches (spec §3.B1 Steps 1–3) are committed in the first commit of the PR. The deep fix lands as a subsequent commit on the same branch BEFORE the PR is opened for review. There is no follow-up label, no separate ticket.

Phase 0 cannot definitively name H1 vs H2 without observing the system under load. Code review has narrowed the field to those two hypotheses; the act of writing the instrumentation IS the experiment that produces the answer.

### Rationale

- **Code-review evidence already excludes H3 (split deploy)**: `server.ts:100-124` registers workers in the same process that serves API requests; container.ts wires `notificationJobQueue` against the same pg-boss instance via `getQueue()` (queue.ts:6-24). Same process, same `bossPromise` singleton — no split.
- **H1 (silent enqueue throw) has the highest prior**: the `try { ... } catch {}` blocks at `generate-portal-token.use-case.ts:140-143` and `:156-159` are structurally identical to a "silent failure" anti-pattern. Per Regras invariant A.2 (HIGH confidence), this is forbidden regardless of whether it is THE cause — so removing it is non-negotiable independently of the diagnostic outcome. If the cause is H1, the new `notification.enqueue_failed` log will fire on the first reproduction.
- **H2 (worker not registered) has a lower but non-zero prior**: `await registerWorkers(...)` is a single `await` that registers ~21 queues sequentially (workers.ts:70-234). If any registration throws, all subsequent registrations are skipped. The fact that `notification.retry-poll` (workers.ts:84-89), `tenant-portal.expire-tokens` (workers.ts:164-169), and other scheduled queues appear to operate normally suggests they registered successfully. `notification.send` registers at line 78 (before retry-poll at line 84) — IF H2 were true, retry-poll would NOT be running. So H2 is *less* likely on this evidence alone, but cannot be ruled out without a positive `worker.notification_send.registered` boot log.
- **Local reproduction is feasible**: the floor's `apps/backend` ships a `pnpm --filter backend dev` command + the queue runs against the same Postgres. With `NODE_ENV=staging` env vars provisioned locally, the exact production code path executes against a real pg-boss instance. No staging deploy required to identify the cause.

### Concrete reproduction recipe (the Executor will use this)

```bash
# 1. Boot the backend with the new instrumentation in a local Postgres + Docker compose.
# 2. Create a test appointment with a primary contact email (e.g., via the seed script + an SQL fixture).
# 3. Hit POST /v1/appointments/:id/portal-token with an OP-role token.
# 4. Tail the app logs and inspect the new structured events:
#    - notification.enqueue_start    (must fire — proves CreateNotificationUseCase was called)
#    - notification.enqueue_success  (proves the row was persisted AND the job enqueued)
#    - Processing notification.send job  (proves the worker picked it up)
# 5. Inspect pgboss.job table directly:
#    SELECT id, name, state, data, created_on, completed_on FROM pgboss.job WHERE name = 'notification.send' ORDER BY created_on DESC LIMIT 5;
# 6. Inspect notifications table:
#    SELECT id, status, sent_at, failure_reason, provider_name FROM notifications ORDER BY created_at DESC LIMIT 5;
```

If `notification.enqueue_success` fires but `Processing notification.send job` does not → cause is on the worker side (H2-adjacent). If `notification.enqueue_failed` fires → H1 confirmed and the error message names the deep fix.

### Alternatives considered

- **Deploy instrumentation to staging first, observe there, then come back to local for the deep fix.** REJECTED — adds a deploy cycle; the local repro covers the same code path with full debugger access; per spec §3.B1 Step 4 the same-PR constraint is independent of where we observe.
- **Skip instrumentation, just remove the silent catches and re-deploy.** REJECTED — leaves us blind to H2 if H1 is not the cause; the instrumentation cost is small (~6 log lines) and the safety upside is large.
- **Try to confirm H1/H2 from code review alone before committing anything.** REJECTED — Done. Two hypotheses survive; only execution can pick between them.

### Confidence

- **HIGH** that one of H1/H2 fires within the local repro.
- **MEDIUM** which one fires — and that's acceptable because both have clear, narrow fixes (catch the throw, or wrap each `boss.work` in its own try/catch).
- **HIGH** that the deep fix is in-scope for this PR after Phase 0 → Implementation transition.

---

## R-2 — Bug 2: verify the Prisma filtered-include is safe and performant

### Decision

**Use a Prisma filtered relation in `PrismaAppointmentRepository.findById`**:

```typescript
const row = await this.prisma.appointment.findFirst({
  where,
  include: {
    contacts: true,
    restrictions: true,
    property: { select: { /* ... existing ... */ } },
    tenant: { select: { name: true, settings_json: true } },
    branch: { select: { name: true } },
    service_type: { select: { name: true } },
    inspector: { select: { name: true } },
    // NEW — filtered relation, capped to one row, used only for boolean derivation
    tenant_portal_tokens: {
      where: {
        status: 'ACTIVE',
        expires_at: { gt: new Date() },
      },
      select: { id: true },
      take: 1,
    },
  },
});
// ...
return {
  // ... existing fields ...
  hasActivePortalToken: row.tenant_portal_tokens.length > 0,
};
```

### Rationale

- **Prisma 5.22.0 supports filtered relations** (since v4.3 GA). The version in `apps/backend/package.json` is `^5.22.0` for both `@prisma/client` and `prisma` CLI. No client upgrade or schema change required.
- **The `tenant_portal_tokens` table already has the right indexes**: `@@index([appointment_id])` and `@@index([status])` and `@@index([expires_at])` (schema.prisma:986-988). The combination `(appointment_id = ? AND status = 'ACTIVE' AND expires_at > now())` will use `appointment_id` index for the primary lookup; the additional status + expires_at predicates filter a tiny set (at most a few rows per appointment historically — most have at most one active token at a time).
- **`take: 1` + `select: { id: true }`** keeps the row shape minimal (the use case only needs a boolean), avoiding payload bloat. The relation result is `Array<{ id: string }>` and we derive `boolean` via `.length > 0`.
- **Performance**: the existing `findById` already issues 1 query with 6 joins (contacts, restrictions, property, tenant, branch, service_type, inspector). Adding one more filtered include adds a single LEFT JOIN that uses the existing `tenant_portal_tokens (appointment_id)` index as the primary lookup; `status` and `expires_at` are further filtered using their own separate indexes (`@@index([status])`, `@@index([expires_at])` — schema.prisma:986-988). Acceptance gate during implementation (per `EXPLAIN ANALYZE`): the plan shows an index seek on `appointment_id` (no full scan) and no material regression vs. the baseline `findById` timing. Avoid claiming a specific millisecond threshold — the gate is plan shape + absence of regression, not an absolute timing target. (Round 3 — Planejador correction; aligned with `tasks.md T031` wording.)

### The Prisma relation field name

The Prisma model definition (`schema.prisma:968-989`) gives the back-relation field on `Appointment` as inferred by Prisma. To confirm the exact field name on the `Appointment` model (likely `tenant_portal_tokens` since the table is `@@map("tenant_portal_tokens")`), the Executor verifies via `npx prisma format && npx prisma generate` then inspects the generated client TypeScript signature. If the field is autogenerated under a different name (e.g., `TenantPortalToken[]`), the snippet above adjusts accordingly. This is a 1-line check, not a real risk.

### Alternatives considered

- **Inject `ITenantPortalTokenRepository` into `GetAppointmentUseCase` and call `findActiveByAppointmentId` (patched for expires_at)**. REJECTED for the production path because it adds a second round-trip per detail request. Kept as the fallback if `R-2` somehow surfaces an issue with the filtered include. The repository patch IS applied independently per CQ-2 default (the method becomes correct regardless of who calls it).
- **Use `_count` instead of `select { id }` + `take 1`**. CONSIDERED — Prisma's `_count` with a filter is concise. But `_count` returns a number; we want a boolean. `take: 1` + `select: { id: true }` is equally fast and the type signature reads naturally at the call site (`result.tenant_portal_tokens.length > 0`).
- **Raw SQL via `$queryRaw`**. REJECTED — adds typing overhead and bypasses Prisma's relation modeling. Filtered relation is idiomatic.

### Confidence

- **HIGH** for the approach.
- **HIGH** for performance (well-indexed, capped row).
- **HIGH** that the exact relation field name is verifiable by the Executor in one Prisma generate + IDE inspection.

---

## R-3 — Bug 3: locate the canonical secrets documentation

### Decision

**Two complementary edits**:

1. **Extend `docs/fly-deploy-guide.md` Section 2** to include `PORTAL_TOKEN_ENC_KEY` under the "Required" subsection, immediately after `TOTP_ENCRYPTION_KEY` (which already follows the `openssl rand -hex 32` pattern).
2. **Create `docs/runbooks/portal-token-enc-key.md`** matching the existing `docs/runbooks/jwt-key-rotation.md` pattern — covers (a) initial provisioning, (b) verification on Fly.io, (c) recovery if `v250` key is lost, (d) rotation procedure (referenced as a future concern only, no implementation in this PR).

### Rationale

- **`docs/fly-deploy-guide.md` is the canonical first-touch document for Fly.io secrets** (already documents DATABASE_URL, JWT keys, CORS_ORIGIN, TOTP_ENCRYPTION_KEY, Supabase, Resend). Adding PORTAL_TOKEN_ENC_KEY here ensures any future operator setting up a new environment cannot miss it.
- **The runbook directory has parallel files** for each operationally-sensitive surface: `auth-and-sessions.md`, `jwt-key-rotation.md`, `notifications.md`, `queue-and-jobs.md`. Adding `portal-token-enc-key.md` follows that convention and is the file a responder would open at 3am when the next `v252` boot fails.
- **`projeto-consolidado/` does not exist as a documented secrets repository in this floor** (only `agente-consultor-cli.md` and `service-group-exceptions.md` files present). CLAUDE.md §14 references `infra-tecnologia-production-ready.md` but the file is not in the floor. The fly-deploy-guide.md + runbooks layout is the de facto canonical structure for this codebase as it stands today.

### Concrete edits

**Edit 1** — `docs/fly-deploy-guide.md` Section 2, after the TOTP block:

```bash
# Portal token AES-256-GCM key (32 bytes, hex encoded)
# Used by tenant-portal to encrypt raw tokens at rest (feature 028).
# Generate with: openssl rand -hex 32
fly secrets set PORTAL_TOKEN_ENC_KEY="$(openssl rand -hex 32)"
```

**Edit 2** — new file `docs/runbooks/portal-token-enc-key.md`:

```markdown
# Runbook: PORTAL_TOKEN_ENC_KEY

## Purpose
AES-256-GCM key encrypting raw tenant portal tokens at rest. Required by `env.ts:103-108` in non-development environments; absence causes Fastify boot failure.

## Initial provisioning
fly secrets set PORTAL_TOKEN_ENC_KEY="$(openssl rand -hex 32)" -a properfy-api

## Verification
fly secrets list -a properfy-api | grep PORTAL_TOKEN_ENC_KEY
fly status -a properfy-api   # all machines must be in 'started' state

## Recovery if the key is lost between machine generations (e.g., v250 has it, v251+ does not)
... Option A (preferred): connect to v250 and read its existing env var ...
... Option B (last resort): rotate to a new key, accepting that live tokens become undecryptable ...

## Rotation
(Future work — out of scope of this runbook's initial version.)

## See also
- docs/fly-deploy-guide.md §2 — primary provisioning checklist
- apps/backend/src/main/env.ts:103-108 — fail-fast validation
- apps/backend/src/modules/tenant-portal/domain/mint-portal-token.service.ts — consumer
```

(Exact content to be written by the Executor; the snippet above is the design.)

### Alternatives considered

- **Single-document approach (only extend `fly-deploy-guide.md`, no runbook)**. REJECTED — `jwt-key-rotation.md` precedent says key-bearing secrets get their own runbook for incident response. Following the precedent.
- **Create `projeto-consolidado/infra-tecnologia-production-ready.md` to match CLAUDE.md §14**. REJECTED — that would create a parallel canonical location and divide attention. The reality of the floor is `docs/`. CLAUDE.md §14 is aspirational text; the codebase has moved on.

### Confidence

- **HIGH** on the chosen structure and exact edits.

---

## Summary

| Item | Decision | Confidence |
|---|---|---|
| R-1 | Instrument → local repro → deep fix same PR | HIGH (procedure), MEDIUM (which hypothesis fires) |
| R-2 | Prisma filtered include `tenant_portal_tokens` in `findById` | HIGH |
| R-3 | Extend `docs/fly-deploy-guide.md` §2 + new `docs/runbooks/portal-token-enc-key.md` | HIGH |

**All NEEDS CLARIFICATION items from `plan.md` Phase 0 are resolved.** Phase 1 (data-model.md, contracts/, quickstart.md) can proceed.
