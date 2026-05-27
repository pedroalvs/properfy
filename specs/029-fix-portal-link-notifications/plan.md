# Implementation Plan: Fix Portal Link Notifications

**Branch**: `fix/portal-link-notifications` | **Date**: 2026-05-27 | **Spec**: `./spec.md`
**Input**: Feature specification at `specs/029-fix-portal-link-notifications/spec.md`
**Note on branch naming**: Per workflow this is a post-release bug-fix spec, not a feature. The branch `fix/...` deviates from Speckit's `NNN-name` convention; the setup script `.specify/scripts/bash/setup-plan.sh` rejects this name. Plan written directly from the template at `.specify/templates/plan-template.md`.

---

## Summary

Land a single PR on `fix/portal-link-notifications` that closes three defects observed by QA in staging on 2026-05-27 against the `028-tenant-confirmation-cycles` release:

1. **Bug 1 (BLOCKER)** — restore `notification.send` job consumption end-to-end. Strategy: add structured observability around `CreateNotificationUseCase.execute` enqueue + remove the silent try/catch in `GeneratePortalTokenUseCase`, deploy + reproduce locally with full logs, then ship the deep fix in the same PR. AC-1.5 (PENDING → SENT + Resend message ID) gates merge.
2. **Bug 2 (MEDIUM)** — replace the `hasActivePortalToken` proxy (`activeConfirmationCycleId !== null`) with a real token check (`status='ACTIVE' AND expires_at > new Date()`) in `PrismaAppointmentRepository.findById`. Tighten the Zod response schema to `z.boolean()` (non-optional). Patch the latent `findActiveByAppointmentId` expiry bug for consistency.
3. **Bug 3 (MEDIUM, ops)** — produce a runbook at `docs/runbooks/portal-token-enc-key.md` (or extend `projeto-consolidado/infra-tecnologia-production-ready.md` if it already has a secrets section). The actual `fly secrets set` is executed by the human operator outside this PR.

No DB writes, no schema changes, no breaking external API changes, no front-end touches.

---

## Technical Context

**Language/Version**: TypeScript 5.x strict + ES2022 ESM on Node.js 20
**Primary Dependencies**: Fastify 4, Prisma 5 (PostgreSQL adapter), Zod 3, `pg-boss` 9.0.3, `@properfy/shared` (workspace).
**Storage**: PostgreSQL (Supabase) — read-only access from this PR; no migrations.
**Testing**: Vitest (unit + integration) with Testcontainers for Postgres + pg-boss; Supertest for HTTP integration. Coverage gates: 70% global, 80%+ for `apps/backend/src/modules/notification` and `apps/backend/src/modules/tenant-portal`.
**Target Platform**: Linux container on Fly.io (`apps/backend`), shared monorepo via pnpm + Turbo.
**Project Type**: Monorepo (web service `apps/backend` + ops doc) — Option 2 (Web application) variant.
**Performance Goals**: `GET /v1/appointments/:id` p95 must not regress (currently <250 ms on Fly.io); new filtered include on `tenant_portal_tokens` adds one indexed lookup — must remain within the same envelope. Verify with EXPLAIN ANALYZE during implementation.
**Constraints**: Bug 1 deep fix MUST land in this PR (no follow-up label; see spec §3.B1 Step 4 and the spec's Round-2 BLOCKER fix). Token-active check uses Node-process clock (`new Date()`), not DB `NOW()`, for consistency with `expire-tokens` worker.
**Scale/Scope**: Bug fix bundle. Three modules touched: `notification`, `tenant-portal`, `appointment`. No new modules. No new entities. One ops runbook.

---

## Constitution Check

Reviewed against `.specify/memory/constitution.md` (Clean Architecture, Multi-Tenant Safety, TDD, RBAC, Audit).

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | ✓ | All edits respect layer boundaries. The new `tenant_portal_tokens` include in `PrismaAppointmentRepository.findById` (infrastructure) is exposed via `AppointmentWithRelations` (domain port returns plain data), consumed by `GetAppointmentUseCase` (application). No domain ↔ infrastructure leakage. Logger injection follows existing DI patterns. |
| II. Multi-Tenant Safety | ✓ | No new repository methods; `findById` already accepts `tenantId` filter (line 121-122). No cross-tenant query path introduced. AM/OP cross-tenant behaviour for GET preserved (existing `tenantId = null` branch for AM/OP/INSP at `get-appointment.use-case.ts:188-191`). |
| III. TDD | ✓ | Each fix lands with tests written first (see Phase 1 contracts). Coverage budget already meets gates; new branches must be unit + integration tested. |
| IV. RBAC + Audit | ✓ | `POST /v1/appointments/:id/portal-token` retains AM/OP-only authorization (`generate-portal-token.use-case.ts:23,39-41`). Existing `tenant_portal.token_generated` and `tenant_portal.dispatch_skipped` audit emissions are preserved (lines 79-90 and 98-109). New `notification.enqueue_failed` log is **observability**, not a new audit channel. |
| V. Idempotency | ✓ | No new write commands. Existing idempotency mechanisms unchanged. |
| VI. Conventional Commits + No AI references | ✓ | Commit message template will follow `fix(notification): ...` and `fix(appointment): ...` style per CLAUDE.md §13. |

**Result**: No constitutional violations. No `Complexity Tracking` section needed. Phase 0 can proceed.

---

## Project Structure

### Documentation (this feature)

```text
specs/029-fix-portal-link-notifications/
├── spec.md              # APPROVED (Crítico round 2/2 + human)
├── plan.md              # THIS FILE
├── research.md          # Phase 0 — root-cause hypotheses + clock-authority + query plan
├── data-model.md        # Phase 1 — minimal (no new entities; documents existing surfaces touched)
├── contracts/           # Phase 1 — appointment-response.contract.md only
├── quickstart.md        # Phase 1 — Executor's reproduction + verification recipe
└── tasks.md             # Phase 2 (created by /speckit.tasks — NOT this command)
```

### Source code (paths in the monorepo)

```text
apps/backend/
├── src/
│   ├── modules/
│   │   ├── notification/
│   │   │   └── application/use-cases/
│   │   │       └── create-notification.use-case.ts        # MODIFY — Bug 1 instrumentation
│   │   ├── tenant-portal/
│   │   │   ├── application/use-cases/
│   │   │   │   ├── generate-portal-token.use-case.ts      # MODIFY — Bug 1 remove silent catch + add logger
│   │   │   │   └── get-portal-link.use-case.ts            # MODIFY — Bug 2 remove activeConfirmationCycleId proxy (Planejador R1 BLOCKER fix)
│   │   │   └── infrastructure/
│   │   │       └── prisma-tenant-portal-token.repository.ts  # MODIFY — Bug 2 patch findActiveByAppointmentId
│   │   └── appointment/
│   │       ├── application/use-cases/
│   │       │   └── get-appointment.use-case.ts             # MODIFY — Bug 2 replace proxy
│   │       ├── domain/
│   │       │   └── appointment.repository.ts               # MODIFY — Bug 2 extend AppointmentWithRelations
│   │       └── infrastructure/
│   │           └── prisma-appointment.repository.ts        # MODIFY — Bug 2 include tenant_portal_tokens
│   └── main/
│       ├── workers.ts                                       # MODIFY — Bug 1 worker registration liveness log
│       └── container.ts                                     # MODIFY — Bug 1 wire logger into CreateNotificationUseCase + GeneratePortalTokenUseCase

packages/shared/
└── src/schemas/responses.ts                                  # MODIFY — Bug 2 z.boolean().optional() → z.boolean()

docs/runbooks/
└── portal-token-enc-key.md                                   # NEW — Bug 3 runbook (location subject to Phase 1 verification of projeto-consolidado/)

# NO front-end edits
# NO Prisma schema or migration edits
# NO new modules
```

**Structure Decision**: Backend monorepo workspace edits. No new directory created beyond `docs/runbooks/` (and that only if `projeto-consolidado/infra-tecnologia-production-ready.md` does NOT already host a secrets section — verified in Phase 1).

---

## Phase 0 — Research (see `research.md`)

Three open research items, all targeted at converting the spec's MEDIUM-confidence diagnostics into HIGH-confidence implementation choices BEFORE code is touched:

1. **R-1: Bug 1 — confirm the active hypothesis (H1 silent enqueue throw vs H2 worker not registered) in a controlled local environment.** Approach: boot the backend locally with `NODE_ENV=staging`-equivalent env + Postgres + pg-boss in Docker compose; reproduce the `Send Portal Link` flow with current code (no instrumentation yet); inspect `pgboss.job` table directly to determine whether a row was created; then apply the instrumentation patch and re-run. Output: `research.md §R-1` documenting which hypothesis fired and the proposed deep fix.

2. **R-2: Bug 2 — verify the Prisma filtered-include is safe.** Approach: Prisma `findFirst` with `include: { tenant_portal_tokens: { where: { status: 'ACTIVE', expires_at: { gt: new Date() } }, select: { id: true }, take: 1 } }`. Validate (a) Prisma supports filtered relations on this client version; (b) the existing **separate** indexes on `tenant_portal_tokens` — `@@index([appointment_id])`, `@@index([status])`, `@@index([expires_at])` (schema.prisma:986-988) — are sufficient for the predicate, with `appointment_id` as the primary lookup; (c) `EXPLAIN ANALYZE` confirms an index seek on `appointment_id` (no full scan) and no material regression vs. the baseline `findById` timing. Output: `research.md §R-2` with the exact Prisma snippet to commit.

3. **R-3: Bug 3 — locate the canonical secrets documentation.** Approach: search `projeto-consolidado/` and `docs/` for any file that documents required environment variables or operational secret rotation. If `projeto-consolidado/infra-tecnologia-production-ready.md` has a "Secrets" or "Environment Variables" section, extend it; otherwise create `docs/runbooks/portal-token-enc-key.md` per CQ-3 default. Output: `research.md §R-3` with the chosen target path and a stub of the content to write.

**Output**: `research.md` resolves the above before Phase 1 produces final artifacts. Any unresolvable item gets escalated via the Guia (per spec §3.B1 Step 4 procedure) — not silently deferred.

---

## Phase 1 — Design & Contracts (see `data-model.md`, `contracts/`, `quickstart.md`)

Prerequisites: `research.md` complete with HIGH confidence on R-1, R-2, R-3.

1. **`data-model.md`** — minimal. No new entities or columns. Documents the existing fields touched:
   - `tenant_portal_tokens (status, expires_at, appointment_id)` — read-only access from `PrismaAppointmentRepository.findById`.
   - `appointments` and the existing `active_confirmation_cycle_id` denormalized cache — left UNTOUCHED (Bug 2 no longer relies on it for `hasActivePortalToken`).
   - `notifications` — read/write unchanged; new structured logs around `enqueue` do not modify schema.

2. **`contracts/appointment-response.contract.md`** — the only contract surface that changes:
   - `appointmentResponseSchema.hasActivePortalToken`: `z.boolean().optional()` → `z.boolean()`.
   - Behavioral contract: the field is `true` iff at least one `tenant_portal_tokens` row exists for the appointment with `status = 'ACTIVE' AND expires_at > new Date()` (Node clock — see AC-2.5 in spec).
   - Backward-compat note: all known monorepo consumers already type the field as optional on the receiving side (verified in spec §3.A.2 round-2 fix); tightening only adds a producer guarantee.
   - No new endpoints, no new request schemas.

3. **`quickstart.md`** — Executor recipe:
   - Step-by-step reproduction of Bug 1 in a local Docker environment.
   - How to run the new Vitest suites and observe the structured logs.
   - Expected log sequence on success (`notification.enqueue_start` → `notification.enqueue_success` → `Processing notification.send job` → notification row `status=SENT` + `provider_message_id` set).
   - How to verify Bug 2 fix with a curl against `GET /v1/appointments/:id` and a test token in each state (no token / ACTIVE / EXPIRED / REVOKED / SUPERSEDED).
   - How to verify the runbook for Bug 3 (read-through review; no execution required by the Executor).

4. **Agent context update** — run `.specify/scripts/bash/update-agent-context.sh claude` after Phase 1 finalizes. Adds the touched-modules / clock-authority notes to `CLAUDE.md` between the agent-context markers. Executed in the floor's working tree.

**Output**: `data-model.md`, `contracts/appointment-response.contract.md`, `quickstart.md`, plus the agent-context update applied to `CLAUDE.md`.

---

## Phase 2 — Tasks (NOT this command)

`/speckit.tasks` produces the dependency-ordered `tasks.md`. Preview ordering (final order set by `/speckit.tasks`):

1. `packages/shared/src/schemas/responses.ts` — schema tightening (single-line) → reverify type generation for `apps/web` + `apps/pwa`.
2. `apps/backend/src/modules/appointment/domain/appointment.repository.ts` — extend `AppointmentWithRelations` interface with `hasActivePortalToken: boolean`.
3. `apps/backend/src/modules/appointment/infrastructure/prisma-appointment.repository.ts` — query token in `findById`.
4. `apps/backend/src/modules/appointment/application/use-cases/get-appointment.use-case.ts` — wire the new field; remove the proxy.
5. `apps/backend/src/modules/tenant-portal/infrastructure/prisma-tenant-portal-token.repository.ts` — patch `findActiveByAppointmentId` to verify `expires_at > new Date()` (CQ-2 default).
6. **`apps/backend/src/modules/tenant-portal/application/use-cases/get-portal-link.use-case.ts` — remove the `activeConfirmationCycleId` early-reject at lines 44-46 so the portal-link endpoint shares the same active-token predicate as `hasActivePortalToken` (Planejador round-1 BLOCKER fix, AC-2.6).**
7. `apps/backend/src/modules/notification/application/use-cases/create-notification.use-case.ts` — wire logger, instrument enqueue.
8. `apps/backend/src/modules/tenant-portal/application/use-cases/generate-portal-token.use-case.ts` — inject logger, replace silent catches with `logger.error(...)`, **keep** fire-and-forget semantics.
9. `apps/backend/src/main/workers.ts` — add `worker.notification_send.registered` startup log.
10. `apps/backend/src/main/container.ts` — wire loggers into both use cases.
11. Unit + integration tests per AC-1.1 to AC-1.5 and AC-2.1 to AC-2.6.
12. Local repro per `quickstart.md` to identify Bug 1's actual cause → land deep fix in this same PR.
13. `docs/fly-deploy-guide.md §2` extension + `docs/runbooks/portal-token-enc-key.md` (Reuse-vs-Rotate explicit per Planejador correction).
14. PR description bundle including AC-3.x operational checklist for the human operator.

---

## Open Items at Plan Time (none expected to remain after Phase 0/1)

| ID | Status | Owner |
|---|---|---|
| R-1 (deep fix for Bug 1) | OPEN — resolved via Phase 0 local repro | Arquiteto, then Executor |
| R-2 (Prisma filtered include) | OPEN — verify in Phase 0 | Arquiteto |
| R-3 (runbook location) | OPEN — verify in Phase 0 | Arquiteto |

Any R-X that does NOT resolve to HIGH confidence by end of Phase 0 triggers the spec §3.B1 Step 4 escalation procedure (NOT a silent deferral, NOT a follow-up label).

---

## Out-of-Scope (re-affirmed from spec §1)

- ❌ DB migrations, schema column adds, new Prisma models.
- ❌ Front-end edits in `apps/web` or `apps/pwa`.
- ❌ pg-boss version upgrade or queue-tech replacement.
- ❌ Soften `env.ts` validation.
- ❌ Follow-up PR pathway for Bug 1's deep fix.

---

## Confidence at Plan Time

| Item | Confidence | After Phase 0 |
|---|---|---|
| Bug 1 instrumentation correctness | HIGH | HIGH |
| Bug 1 deep fix | MEDIUM (cause not yet observed) | HIGH (R-1 resolves) |
| Bug 2 fix | HIGH | HIGH |
| Bug 2 query performance | MEDIUM | HIGH (R-2 resolves) |
| Bug 3 runbook location | MEDIUM (depends on existing docs) | HIGH (R-3 resolves) |

Plan is APPROVED FOR HANDOFF to Planejador after Phase 0 + Phase 1 artifacts land.
