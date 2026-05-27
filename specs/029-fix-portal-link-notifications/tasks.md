# Tasks: Fix Portal Link Notifications

**Input**: Design documents from `specs/029-fix-portal-link-notifications/`
**Prerequisites**: spec.md (APPROVED), plan.md, research.md, data-model.md, contracts/appointment-response.contract.md, quickstart.md

**Tests**: REQUIRED. TDD is mandatory per the Properfy constitution §III (NON-NEGOTIABLE) and spec §3.A.3. Each user story has explicit unit + integration test tasks. Tests are written and red BEFORE the implementation tasks turn them green.

**Organization**: Tasks are grouped by the three bugs as independent user stories (US1 = Bug 1, US2 = Bug 2, US3 = Bug 3). Each story is independently implementable; their order in this file reflects only the recommended execution sequence by priority, not a hard dependency.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependencies on incomplete tasks)
- **[Story]**: which bug this task belongs to (US1, US2, US3) — present only in story phases
- File paths are absolute-from-repo-root (relative to floor at `/Users/pedro/Code/GitHub/.maestri/floors/properfy--fixportal-link-notifications/`)

## Path Conventions

- **Backend**: `apps/backend/src/...`
- **Shared schemas**: `packages/shared/src/...`
- **Docs**: `docs/...`
- **Specs**: `specs/029-fix-portal-link-notifications/...`
- NO touches to `apps/web` / `apps/pwa` / `apps/backend/prisma/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm working environment + branch state. No code changes.

- [ ] T001 Verify branch state: `git status` is clean, `git branch --show-current` prints `fix/portal-link-notifications`, and HEAD includes commit `d85442e` (the 028 feature). If any of these are false, STOP and escalate to the Arquiteto via the Guia.
- [ ] T002 Run `pnpm install` at the floor root to ensure workspace dependencies are current.
- [ ] T003 Run `pnpm --filter backend prisma generate` to produce a current Prisma client (needed for the new filtered include to be type-aware during US2 implementation).
- [ ] T004 Baseline `pnpm lint && pnpm typecheck && pnpm --filter backend test` — capture the output as the "before" state in the PR description. Any pre-existing failure must be reported to the Arquiteto before any code change, NOT silently absorbed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: There are no foundational shared changes — each user story is self-contained. This phase only confirms that the local backend boots with the staging-equivalent env from `quickstart.md §0`.

**⚠️ CRITICAL**: All three user stories may start after Phase 2 completes.

- [ ] T005 Configure local `apps/backend/.env.local` with the env vars listed in `specs/029-fix-portal-link-notifications/quickstart.md §0`. Confirm boot with `pnpm --filter backend dev` produces the log `pg-boss workers registered: ... notification.send ...`.

**Checkpoint**: foundation ready — US1, US2, US3 may proceed in parallel (with the priority-order recommendation below).

---

## Phase 3: User Story 1 — Bug 1: Restore `notification.send` dispatch (Priority: P1, BLOCKER) 🎯 MVP

**Goal**: Restore the end-to-end notification dispatch path so that clicking Send Portal Link results in an email arriving at the tenant (notification row transitions PENDING → SENT, Resend message ID populated). Gate this story on AC-1.5.

**Independent Test**: from `quickstart.md §3` and `§4`. Specifically: a single `POST /v1/appointments/:id/portal-token` against a local server with a real primary email contact produces (a) a notification row that progresses PENDING → SENT within 30s, (b) the structured logs `notification.enqueue_start`, `notification.enqueue_success`, `Processing notification.send job` in order, and (c) a populated `provider_message_id` on the notification row.

### Unit and integration tests for US1 (TDD — write RED first)

- [ ] T006 [P] [US1] Add unit tests for `CreateNotificationUseCase` enqueue instrumentation in `apps/backend/src/modules/notification/application/use-cases/__tests__/create-notification.use-case.test.ts`. Cover: (a) logs `notification.enqueue_start` before calling `jobQueue.enqueue`; (b) logs `notification.enqueue_success` on resolution; (c) logs `notification.enqueue_failed` AND re-throws the original error on rejection; (d) does NOT swallow.
- [ ] T007 [P] [US1] Add unit tests for `GeneratePortalTokenUseCase` logger behavior in `apps/backend/src/modules/tenant-portal/application/use-cases/__tests__/generate-portal-token.use-case.test.ts`. Cover: (a) when `createNotificationUseCase.execute` throws for the EMAIL channel, the use case logs `tenant_portal.notification_dispatch_failed` with the captured error, but still returns `{ dispatched: true, ... }` (fire-and-forget preserved); (b) same for SMS channel; (c) when both channels succeed, no error log fires; (d) the catch must NOT re-throw and must NOT mutate the audit trail.
- [ ] T008 [P] [US1] Add unit test for `registerWorkers` liveness log in `apps/backend/src/main/__tests__/workers.test.ts`: assert that after the registration call, the logger received a `worker.notification_send.registered` info event exactly once.

### Implementation tasks for US1 (TDD — make RED tests GREEN)

- [ ] T009 [US1] Wire `app.log` into `CreateNotificationUseCase`: add a `logger: Logger` constructor parameter in `apps/backend/src/modules/notification/application/use-cases/create-notification.use-case.ts` and add the corresponding wiring in `apps/backend/src/main/container.ts` (existing instantiation around line 615).
- [ ] T010 [US1] Instrument the enqueue path in `apps/backend/src/modules/notification/application/use-cases/create-notification.use-case.ts:86`: wrap the existing `await this.jobQueue.enqueue(...)` in a try/catch that emits `notification.enqueue_start` (info, before the call), `notification.enqueue_success` (info, after resolution), and `notification.enqueue_failed` (error, in the catch block — re-throw the original error so the caller observes it).
- [ ] T011 [US1] Wire `app.log` into `GeneratePortalTokenUseCase`: add a `logger: Logger` constructor parameter in `apps/backend/src/modules/tenant-portal/application/use-cases/generate-portal-token.use-case.ts` and add the corresponding wiring in `apps/backend/src/main/container.ts` (existing instantiation site).
- [ ] T012 [US1] Replace the two silent catches in `apps/backend/src/modules/tenant-portal/application/use-cases/generate-portal-token.use-case.ts:140-143` (EMAIL) and `:156-159` (SMS) with a structured `this.logger.error({ notificationDispatchError, appointmentId, tenantId, channel, recipient }, 'tenant_portal.notification_dispatch_failed')`. Keep the fire-and-forget semantics (do NOT re-throw; endpoint still returns `{ dispatched: true }`).
- [ ] T013 [US1] Add the worker registration liveness log in `apps/backend/src/main/workers.ts:78-82`: immediately after `await boss.work('notification.send', withJobMetrics(...))` returns, emit `logger.info({ workerId: <value from boss.work return if available> }, 'worker.notification_send.registered')`.
- [ ] T014 [US1] Run the local reproduction from `specs/029-fix-portal-link-notifications/quickstart.md §3`. Capture the observed log sequence. If `notification.enqueue_failed` fires → H1 confirmed. If `worker.notification_send.registered` is absent on boot → H2 confirmed. Save the evidence (log excerpts + `pgboss.job` SQL output) to the PR draft description under the heading "Phase 0 evidence — R-1 resolution".

### Deep fix branch for US1 — choose based on T014 evidence

> **Mutually exclusive**: exactly ONE of T015 / T016 is executed, decided by the T014 evidence. The other is closed with a note linking to the T014 finding. Do NOT speculatively execute both. (Planejador round-1 recommendation.)

- [ ] T015 [US1] **IF H1 (silent enqueue throw)** confirmed in T014: implement the specific deep fix named by the error message. Common causes and their targeted fixes:
  - Connection / TLS issue in `apps/backend/src/shared/infrastructure/queue.ts:13-18` → diagnose the actual error (e.g., wrong `sslmode` in `DATABASE_URL`, missing CA in the system trust store on the Fly.io image) and resolve it correctly. **Never** disable TLS verification or set `rejectUnauthorized: false` — Supabase ships properly-issued certs; if validation fails, the root cause is a misconfigured URL or a missing CA bundle, NOT a need to bypass verification.
  - `request_id` injection breaking pg-boss payload schema in `apps/backend/src/shared/infrastructure/queue.ts:40-41` → remove or sanitize the `_requestId` field before `q.send`.
  - Queue-name encoding issue → audit the exact `'notification.send'` literal across `workers.ts:78`, `create-notification.use-case.ts:86`, and `pgboss-job-queue.ts`.
  - Whichever cause: write a regression unit test in the relevant `__tests__/` directory BEFORE the fix, then make it green.
- [ ] T016 [US1] **IF H2 (worker registration not propagating)** confirmed in T014: refactor `apps/backend/src/main/workers.ts:70-234` so each `await boss.work(...)` call sits inside its own try/catch that logs `worker.<name>.registration_failed` with the error and continues to the next registration. Write a regression unit test in `apps/backend/src/main/__tests__/workers.test.ts` BEFORE the fix that injects a failing `boss.work` for an unrelated queue and asserts the `notification.send` registration still completes.

### Integration test for US1 (gating AC-1.5)

- [ ] T017 [US1] Add an integration test in `apps/backend/src/modules/notification/application/use-cases/__tests__/create-notification.integration.test.ts` (Vitest + Testcontainers) that: (a) spins up Postgres + pg-boss; (b) calls `CreateNotificationUseCase.execute` with a real notification fixture; (c) asserts a job appears in `pgboss.job` with `state='created'`; (d) waits for the worker to consume it; (e) asserts the notification row transitions PENDING → SENT (using a mocked Resend provider that resolves with a fake `messageId`).
- [ ] T018 [US1] End-to-end manual QA per AC-1.5 — to be executed by Pedro Alves in staging after the PR opens: trigger Send Portal Link → confirm notification row goes PENDING → SENT within 30s → confirm Resend Webhooks Inbox shows the provider message ID. Document outcome in the PR comments. **This is the merge gate** — PR not eligible to land until AC-1.5 passes.

**Checkpoint US1**: All AC-1.1 through AC-1.5 met. Logs surface every dispatch attempt and outcome; deep fix landed in this PR (no follow-up).

---

## Phase 4: User Story 2 — Bug 2: Correct `hasActivePortalToken` semantic (Priority: P2)

**Goal**: Make `hasActivePortalToken` reflect the actual token state (`status='ACTIVE' AND expires_at > new Date()`), not the cycle proxy. Tighten the response schema. Fix the latent expiry bug in `findActiveByAppointmentId`.

**Independent Test**: from `quickstart.md §6` and the contract test matrix in `contracts/appointment-response.contract.md §Tests required (TC-1..TC-8)`. Specifically: `GET /v1/appointments/:id` returns the correct boolean across all six token-state cases (no token, ACTIVE+valid, ACTIVE+expired, REVOKED, SUPERSEDED, EXPIRED) and the frontend "Copy Portal Link" button enables without manual refresh after a single Send Portal Link click.

### Tests for US2 (TDD — write RED first)

- [ ] T019 [P] [US2] Add integration tests for `PrismaAppointmentRepository.findById` covering `hasActivePortalToken` in `apps/backend/src/modules/appointment/infrastructure/__tests__/prisma-appointment.repository.integration.test.ts`. Implement TC-1 through TC-7 from `contracts/appointment-response.contract.md §Tests required`.
- [ ] T020 [P] [US2] Add unit tests for `GetAppointmentUseCase` that mock `appointmentRepo.findById` and assert `mapToOutput` returns `found.hasActivePortalToken` verbatim in `apps/backend/src/modules/appointment/application/use-cases/__tests__/get-appointment.use-case.test.ts`. The previous proxy logic (`activeConfirmationCycleId !== null`) MUST NOT appear in the output.
- [ ] T021 [P] [US2] Add unit tests for `PrismaTenantPortalTokenRepository.findActiveByAppointmentId` in `apps/backend/src/modules/tenant-portal/infrastructure/__tests__/prisma-tenant-portal-token.repository.integration.test.ts`. Cover: returns null when no ACTIVE token exists; returns null when the only ACTIVE token has `expires_at <= now()`; returns the entity when `expires_at > now()`.
- [ ] T022 [P] [US2] Add an HTTP integration test in `apps/backend/src/modules/appointment/interfaces/__tests__/appointment.routes.integration.test.ts` that hits `GET /v1/appointments/:id` and asserts the JSON payload includes `hasActivePortalToken: <boolean>` (NEVER undefined) for an authenticated OP request. Covers TC-8 (field-presence contract).

### Implementation tasks for US2

- [ ] T023 [US2] Tighten the response schema in `packages/shared/src/schemas/responses.ts:236`: change `hasActivePortalToken: z.boolean().optional()` to `hasActivePortalToken: z.boolean()`.
- [ ] T024 [US2] Extend the `AppointmentWithRelations` interface in `apps/backend/src/modules/appointment/domain/appointment.repository.ts` to include `hasActivePortalToken: boolean`.
- [ ] T025 [US2] Add the filtered `tenant_portal_tokens` include in `apps/backend/src/modules/appointment/infrastructure/prisma-appointment.repository.ts:124-135`. Snippet (verify exact relation field name via the generated Prisma client):
  ```ts
  tenant_portal_tokens: {
    where: { status: 'ACTIVE', expires_at: { gt: new Date() } },
    select: { id: true },
    take: 1,
  },
  ```
- [ ] T026 [US2] Populate `hasActivePortalToken` in the returned `AppointmentWithRelations` in `apps/backend/src/modules/appointment/infrastructure/prisma-appointment.repository.ts:162-177`: derive as `row.tenant_portal_tokens.length > 0`.
- [ ] T027 [US2] Replace the proxy in `apps/backend/src/modules/appointment/application/use-cases/get-appointment.use-case.ts:166`. Before: `hasActivePortalToken: appointment.activeConfirmationCycleId !== null`. After: `hasActivePortalToken: found.hasActivePortalToken`.
- [ ] T028 [US2] Patch the latent expiry bug in `apps/backend/src/modules/tenant-portal/infrastructure/prisma-tenant-portal-token.repository.ts:33-38`: add `expires_at: { gt: new Date() }` to the `findActiveByAppointmentId` where clause (CQ-2 resolution).

### Portal-link endpoint alignment (Planejador round-1 BLOCKER fix — AC-2.6)

- [ ] T029 [P] [US2] Add an integration test in `apps/backend/src/modules/tenant-portal/application/use-cases/__tests__/get-portal-link.use-case.integration.test.ts` covering the four AC-2.6 cases: (a) appointment with `active_confirmation_cycle_id = null` AND `tenant_portal_tokens` ACTIVE+`expires_at>now()` → endpoint returns **200 + portalUrl** (regression case); (b) cycle non-null + token ACTIVE+valid → 200; (c) cycle non-null + token REVOKED → 409 NoActivePortalTokenError; (d) cycle non-null + no token row → 409. Write RED first.
- [ ] T030 [US2] Remove the cycle-proxy early-reject at `apps/backend/src/modules/tenant-portal/application/use-cases/get-portal-link.use-case.ts:44-46` (delete the `if (!appointment.activeConfirmationCycleId) throw new NoActivePortalTokenError();` block). The subsequent `findActiveByAppointmentId` (line 48, patched in T028 to verify `expires_at > now()`) becomes the sole authority. Audit emission at lines 66-74 remains unchanged. Make T029 tests pass.

### Query plan + frontend verification

- [ ] T031 [US2] Verify query plan: run `EXPLAIN ANALYZE` from `quickstart.md §5` against a fixture. Acceptance gate (Planejador round-1 correction): the plan uses an index seek on `tenant_portal_tokens (appointment_id)` (not a full scan), and shows no material regression vs. the baseline timing of the previous `findById` query — NOT a fixed millisecond threshold. Attach EXPLAIN ANALYZE output to the PR.
- [ ] T032 [US2] Manually verify in a local browser session per `quickstart.md §6`: the existing FE refetch at `apps/web/src/features/appointments/pages/AppointmentDetailPage.tsx:133` consumes the corrected backend response and enables the "Copy Portal Link" button without manual refresh. Then click "Copy Portal Link" and confirm it returns 200 + the URL is copied (no 409). Document in PR comments.

**Checkpoint US2**: AC-2.1 through AC-2.6 met. Both the detail field and the portal-link endpoint share the same active-token predicate; UI flow continuous; no inconsistent enable-then-fail scenarios.

---

## Phase 5: User Story 3 — Bug 3: Document `PORTAL_TOKEN_ENC_KEY` runbook (Priority: P3, ops)

**Goal**: Deliver the documentation for the missing Fly.io secret. The actual `fly secrets set` execution is performed by the human operator outside this PR.

**Independent Test**: a fresh contributor reading `docs/fly-deploy-guide.md` is informed that `PORTAL_TOKEN_ENC_KEY` is a required secret, knows how to generate it, knows how to verify it on Fly.io, and on incident has a runbook at `docs/runbooks/portal-token-enc-key.md` with the recovery procedure.

### Documentation tasks for US3 (no code, no tests)

- [ ] T033 [P] [US3] Extend `docs/fly-deploy-guide.md` Section 2 ("Set Secrets" → "Required") with the `PORTAL_TOKEN_ENC_KEY` block immediately after the `TOTP_ENCRYPTION_KEY` entry. Snippet provided in `research.md §R-3 Edit 1`. Use canonical app name `properfy-api`.
- [ ] T034 [P] [US3] Create `docs/runbooks/portal-token-enc-key.md` matching the structure of `docs/runbooks/jwt-key-rotation.md`. Cover: Purpose, Initial provisioning, Verification, Recovery, Rotation (flagged as future work), See also (cross-refs). **The Recovery section MUST explicitly contrast two options**: (a) **Reuse existing key (preferred)** — connect to the surviving machine (`v250`) via `fly ssh console -a properfy-api` and read `env | grep PORTAL_TOKEN_ENC_KEY`, then `fly secrets set` that value app-wide; live portal tokens remain decryptable. (b) **Rotate to a new key (last resort)** — if the existing key cannot be retrieved, run `fly secrets set PORTAL_TOKEN_ENC_KEY="$(openssl rand -hex 32)" -a properfy-api`; this **invalidates all currently-active portal tokens** (existing rows become undecryptable), so the runbook MUST instruct the operator to either `revoke + re-send` all `ACTIVE` tokens via a documented SQL or admin path, or accept token loss with customer communication. (Planejador round-1 correction.)
- [ ] T035 [US3] In the PR description, include the operational checklist for Pedro Alves: the exact `fly secrets set`, `fly secrets list`, and `fly status` commands to run AFTER merge (or coordinated with v250 BEFORE merge to avoid token-decryption gap). Quote AC-3.1, AC-3.2, AC-3.4. App name is `properfy-api`.

**Checkpoint US3**: AC-3.1 through AC-3.4 documented; operator action queued in the PR description.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final sweep, coverage check, build, and handoff verification.

- [ ] T036 Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` from the floor root. All green. Capture output in PR as the "after" state.
- [ ] T037 Verify Prisma migration state: `pnpm --filter backend prisma migrate status` MUST report "Database schema is up to date" with NO pending migration created by this branch.
- [ ] T038 Verify coverage gates: `apps/backend/src/modules/notification` and `apps/backend/src/modules/tenant-portal` both at 80%+ per CLAUDE.md §11.
- [ ] T039 Anti-checklist sweep per `quickstart.md §9`: confirm no Prisma migration, no `apps/web/` or `apps/pwa/` edits, no `env.ts` softening, no pg-boss version bump, no Claude/AI references in commit messages, no silent try/catch reintroduced, no follow-up label for Bug 1, no `fly secrets set` executed by Executor.
- [ ] T040 Update `specs/029-fix-portal-link-notifications/quickstart.md §0` if the local repro recipe needed adjustments (e.g., real env var values discovered during T014).
- [ ] T041 Open the PR with the standard checklist + the Bug 3 operational instructions for Pedro Alves. PR body must reference AC-1.5 as the merge gate and the R-1 evidence captured in T014.
- [ ] T042 Signal the Guia via maestri when all green and the PR URL is ready, so the human can run the AC-1.5 staging verification and the Bug 3 `fly secrets set`.

---

## Dependencies

- Phase 1 (Setup, T001-T004) blocks everything.
- Phase 2 (Foundational, T005) blocks all user stories.
- US1, US2, US3 are independent and may run in parallel after Phase 2.
- Within US1: T006-T008 (tests) before T009-T013 (impl); T014 (repro) before T015/T016 (deep fix, mutually exclusive); T017 (integration test) and T018 (manual QA) gate US1 completion.
- Within US2: T019-T022 (tests) before T023-T028 (impl); T029 (portal-link test) before T030 (portal-link impl); T031 (query plan) and T032 (FE+endpoint smoke) confirm correctness.
- Within US3: T033 and T034 are parallelizable; T035 follows.
- Phase 6 polish runs LAST.

---

## Parallel Execution Examples

**Within US1 — write all tests in parallel before any implementation:**

```text
T006 [P] [US1] Unit tests for CreateNotificationUseCase enqueue instrumentation
T007 [P] [US1] Unit tests for GeneratePortalTokenUseCase logger behavior
T008 [P] [US1] Unit test for registerWorkers liveness log
```

**Within US2 — write all tests in parallel before any implementation:**

```text
T019 [P] [US2] Integration tests for PrismaAppointmentRepository.findById
T020 [P] [US2] Unit tests for GetAppointmentUseCase
T021 [P] [US2] Unit tests for findActiveByAppointmentId
T022 [P] [US2] HTTP integration test for GET /v1/appointments/:id
T029 [P] [US2] Integration test for GetPortalLinkUseCase (AC-2.6 four-case matrix)
```

**Across stories — after foundational complete (T005), all three stories may run concurrently:**

```text
US1 (T006-T018) — Bug 1 dispatch fix
US2 (T019-T032) — Bug 2 semantic fix + portal-link endpoint alignment
US3 (T033-T035) — Bug 3 documentation
```

**Within US3 — both docs edits in parallel:**

```text
T033 [P] [US3] Extend docs/fly-deploy-guide.md §2
T034 [P] [US3] Create docs/runbooks/portal-token-enc-key.md
```

---

## Implementation Strategy

**MVP scope = US1 alone**, because Bug 1 is the BLOCKER (no email reaches the tenant; no portal link is usable end-to-end regardless of Bug 2 or Bug 3). If schedule pressure forces a partial release, US1 + AC-1.5 alone resolves the most visible breakage.

**Recommended full delivery order**: US1 first (P1 / BLOCKER) → US2 (P2, restores Copy Portal Link UX) → US3 (P3, documentation). All three should ship in this single PR per spec §1, but US1 is the irreducible gate (AC-1.5).

**TDD discipline (constitution §III, NON-NEGOTIABLE)**: every test task is written and red BEFORE its corresponding implementation task. Reviewer must see test commits land before the implementation commits in the PR history (or interleaved within the same commit with the test referenced explicitly in the message).

**Escalation**: if any task surfaces a need to violate the constraints in `quickstart.md §9` (anti-checklist) or to introduce a follow-up label for Bug 1 in violation of the BLOCKER fix in spec §3.B1 Step 4, STOP. Use the maestri channel to signal the Arquiteto → Guia → human chain. No silent rescoping.

---

## Counts

- Total tasks: **42**
- US1 (Bug 1): T006-T018 (13 tasks; 3 test, 5 impl, 2 deep-fix-conditional [mutually exclusive], 1 repro, 1 integration test, 1 manual QA)
- US2 (Bug 2): T019-T032 (14 tasks; 5 test, 7 impl, 1 query-plan check, 1 FE+endpoint smoke)
- US3 (Bug 3): T033-T035 (3 tasks; 0 test, 3 doc/ops)
- Setup + Foundational: T001-T005 (5 tasks)
- Polish: T036-T042 (7 tasks)
- Parallel opportunities flagged: 12 tasks marked `[P]`.

## Independent test criteria

- **US1**: AC-1.1 + AC-1.5 (logs + PENDING → SENT + Resend message ID).
- **US2**: AC-2.1 + AC-2.3 + AC-2.4 + AC-2.6 (correct boolean across token states + FE refetch enables button without page refresh + portal-link endpoint returns 200 in the regression case where cycle is null and token is ACTIVE+valid).
- **US3**: AC-3.3 (runbook exists with the explicit Reuse-vs-Rotate documented recovery procedure).

All three stories are independently testable.
