# Implementation Tasks — Tenant Confirmation Cycles

**Feature:** 028-tenant-confirmation-cycles
**Plan:** `specs/028-tenant-confirmation-cycles/plan.md`
**Date:** 2026-05-26

Each task has a clear completion criterion. Tasks are grouped by phase per the plan. Within a phase, tasks may be parallel unless marked `[blocks:]`. Across phases, downstream phases wait for upstream completion.

Notation:
- `[id]` task ID for cross-references.
- `[parallel-with: …]` siblings can run concurrently.
- `[blocks: …]` task IDs blocked by this one.
- `[layer: …]` shared / backend-domain / backend-app / backend-infra / backend-iface / backend-di / backend-test / web / web-test.

---

## Phase 1 — Shared Layer

### T1 — Add cycle enums to `@properfy/shared`
- **Layer:** shared
- **File:** `packages/shared/src/enums.ts` (or analogous existing location)
- **Add:** `CycleStatus`, `CycleConfirmationSource`, `CycleInvalidatedReason` Zod enums + types.
- **Done when:** types are exported and Zod schemas parse all listed values.
- **Blocks:** T2, T3, T7, T11, T12+ (anywhere consuming shared types)

### T2 — Add new response schema and error codes
- **Layer:** shared
- **File:** `packages/shared/src/schemas/*.ts` (place next to existing appointment/tenant-portal schemas)
- **Add:** `GetPortalLinkResponse`, `PortalLinkErrorCode` enum.
- **Done when:** types exported.
- **Parallel-with:** T1
- **Blocks:** T28 (route handler), T36 (frontend)

### T3 — Rebuild `@properfy/shared`
- **Layer:** shared
- **Command:** `pnpm --filter @properfy/shared build`
- **Done when:** `dist/` reflects new exports; downstream typecheck passes.
- **Blocked-by:** T1, T2

---

## Phase 2 — Backend Domain Layer

### T4 — Create `ConfirmationCycleEntity`
- **Layer:** backend-domain
- **File:** `apps/backend/src/modules/appointment/domain/confirmation-cycle.entity.ts`
- **Done when:** entity has constructor + readonly getters + immutable transition methods (`markConfirmed`, `markUnavailable`, `markSuperseded`); compiles.
- **Blocked-by:** T3

### T5 — Create `IConfirmationCycleRepository` port
- **Layer:** backend-domain
- **File:** `apps/backend/src/modules/appointment/domain/confirmation-cycle.repository.ts`
- **Methods:** `save(cycle, tx?)`, `update(cycle, tx?)`, `findActiveByAppointmentId(id, tx?)`, `findById(id, tx?)`, `findMaxCycleNumber(appointmentId, tx?)`.
- **Done when:** interface compiles.
- **Parallel-with:** T4
- **Blocked-by:** T3

### T6 — Create cycle error classes
- **Layer:** backend-domain
- **File:** `apps/backend/src/modules/appointment/domain/confirmation-cycle.errors.ts`
- **Classes:** `ConfirmationCycleNotFoundError`, `ConfirmationCycleAlreadyTerminalError`, `PortalTokenNotDecryptableError`.
- **Done when:** classes extend existing `DomainError` and compile.
- **Parallel-with:** T4, T5

### T6b — Create `ITokenEncrypter` port
- **Layer:** backend-domain (tenant-portal)
- **File:** `apps/backend/src/modules/tenant-portal/domain/token-encrypter.ts`
- **Methods:** `encrypt(plaintext: string): string`, `decrypt(ciphertext: string): string`.
- **Done when:** port compiles. Keeps tenant-portal domain free of `node:crypto`.
- **Parallel-with:** T4, T5, T6

### T7 — Create `ConfirmationCycleService` (**APPLICATION LAYER** — Planejador round 1)
- **Layer:** backend-app (NOT domain — service orchestrates Prisma + AuditService)
- **File:** `apps/backend/src/modules/appointment/application/services/confirmation-cycle.service.ts`
- **Methods:** `createInitial`, `rotateOnDateChange`, `rotateOnTenantReschedule`, `confirm`, `markUnavailable`, `invalidateOnReopen`, `invalidateOnReject`.
- **Every method accepts optional `tx?: Prisma.TransactionClient`.** When provided, participates in caller's outer transaction. When omitted, opens own `prisma.$transaction`.
- **P2002 handling:** on unique-violation from partial unique index, re-read active cycle and retry once via "link to existing" branch.
- **Done when:** every method emits audit log via injected `AuditService`; idempotency holds per plan §3; P2002 retry tested.
- **Blocked-by:** T4, T5, T6
- **Blocks:** T19–T26 (use-case refactors)

---

## Phase 3 — Backend Infrastructure Layer

### T8 — Update Prisma schema
- **Layer:** backend-infra
- **File:** `apps/backend/prisma/schema.prisma`
- **Diff per `data-model.md` §1.**
- **Done when:** `pnpm --filter backend prisma:generate` succeeds with no errors.
- **Parallel-with:** T9
- **Blocked-by:** T3 (shared rebuild)
- **Blocks:** T10, T13

### T9 — Generate migration SQL file
- **Layer:** backend-infra
- **File:** `apps/backend/prisma/migrations/20260526000000_appointment_confirmation_cycles/migration.sql`
- **Content per `data-model.md` §2.**
- **Done when:** file matches data-model SQL exactly; `prisma migrate diff` confirms parity with schema.
- **Blocked-by:** T8

### T9b — Add partial unique index to migration (Planejador round 1)
- **Layer:** backend-infra
- **File:** same migration as T9.
- **SQL:** `CREATE UNIQUE INDEX appointment_active_cycle_unique ON appointment_confirmation_cycles (appointment_id) WHERE status != 'SUPERSEDED';`
- **Done when:** index present in migration file; covered by T32b concurrency test.
- **Blocked-by:** T9

### T10 — Apply migration locally
- **Layer:** backend-infra
- **Command:** `pnpm --filter backend prisma migrate deploy && pnpm --filter backend prisma:generate`
- **Per `feedback_migration_apply_locally.md`.**
- **Done when:** local DB has new table + columns; no migration errors.
- **Blocked-by:** T8, T9

### T11 — Update `AppointmentEntity`
- **Layer:** backend-domain
- **File:** `apps/backend/src/modules/appointment/domain/appointment.entity.ts`
- **Add:** `activeConfirmationCycleId: string | null` readonly prop.
- **Remove direct writers:** ensure no method directly sets `tenantConfirmationStatus` going forward (or comment that only `ConfirmationCycleService` writes it via the repo).
- **Blocked-by:** T8

### T12 — Update `IAppointmentRepository` and Prisma adapter
- **Layer:** backend-infra
- **Files:** `apps/backend/src/modules/appointment/domain/appointment.repository.ts`, `apps/backend/src/modules/appointment/infrastructure/prisma-appointment.repository.ts`
- **Changes:** update payload type accepts `activeConfirmationCycleId`; map new column in `mapToEntity`.
- **Done when:** existing tests still pass; new field round-trips.
- **Blocked-by:** T8, T11

### T13 — Create `PrismaConfirmationCycleRepository`
- **Layer:** backend-infra
- **File:** `apps/backend/src/modules/appointment/infrastructure/prisma-confirmation-cycle.repository.ts`
- **Done when:** implements all port methods; accepts optional `Prisma.TransactionClient`.
- **Blocked-by:** T5, T8

---

## Phase 4 — Shared Crypto Helper

### T14 — Extract `Aes256GcmService`
- **Layer:** backend-shared
- **File:** `apps/backend/src/shared/infrastructure/crypto/aes-256-gcm.service.ts`
- **Pure stateless service** taking a 32-byte key (hex or base64).
- **Methods:** `encrypt(plaintext): string`, `decrypt(ciphertext): string`.
- **Done when:** unit tests cover round-trip + tampered ciphertext rejection.
- **Parallel-with:** T4, T5, T6

### T15 — Refactor `TotpEncryptionService` to delegate
- **Layer:** backend-infra
- **File:** `apps/backend/src/modules/auth/infrastructure/totp-encryption.service.ts`
- **Done when:** existing TOTP tests still pass; service is now a thin wrapper around `Aes256GcmService`.
- **Blocked-by:** T14

### T16 — Add `PORTAL_TOKEN_ENC_KEY` to env schema
- **Layer:** backend-infra
- **File:** `apps/backend/src/main/env.ts`
- **Add:** Zod entry + strict-runtime guard for production/staging.
- **Done when:** env validation passes locally with the new var set; throws when unset in prod-like env.
- **Parallel-with:** T14, T15

---

## Phase 5 — Token Mint Integration

### T17 — Update `MintPortalTokenService` (Planejador round 1 atomicity)
- **Layer:** backend-domain (tenant-portal)
- **File:** `apps/backend/src/modules/tenant-portal/domain/mint-portal-token.service.ts`
- **Changes:**
  - (a) Accept optional `tx?: Prisma.TransactionClient` parameter on `mint()`.
  - (b) Consume `ITokenEncrypter` port via constructor injection (was direct AES coupling); encrypt raw token before passing to repo.
  - (c) Return shape changes from `{ rawToken, expiresAt }` to `{ rawToken, expiresAt, tokenId }`.
- **Done when:** unit tests assert encryption called via port; tokenId returned; tx propagated to repo when provided.
- **Blocked-by:** T6b, T14, T16, T17b

### T17b — Create `AesTokenEncrypterAdapter` (Planejador round 1 — keep domain pure)
- **Layer:** backend-infra (tenant-portal)
- **File:** `apps/backend/src/modules/tenant-portal/infrastructure/aes-token-encrypter.adapter.ts`
- **Implements:** `ITokenEncrypter`. Constructor takes `Aes256GcmService` instance; methods delegate.
- **Done when:** adapter compiles; unit test verifies encrypt/decrypt round-trip.
- **Blocked-by:** T6b, T14

### T18 — Update `ITenantPortalTokenRepository` and Prisma adapter (Planejador round 1 atomicity)
- **Layer:** backend-domain + backend-infra (tenant-portal)
- **Files:**
  - `apps/backend/src/modules/tenant-portal/domain/tenant-portal-token.repository.ts` (interface)
  - `apps/backend/src/modules/tenant-portal/infrastructure/prisma-tenant-portal-token.repository.ts` (impl)
- **Changes:**
  - `save(token, tx?)` and `revokeAndSave(appointmentId, newToken, tx?)` accept optional `Prisma.TransactionClient`. When `tx` provided: use it directly; do NOT open internal `$transaction`. When `tx` omitted: preserve current behavior (open own tx).
  - Both methods persist `raw_token_encrypted` and `confirmation_cycle_id` on insert/save.
  - `findActiveByAppointmentId` returns these fields.
- **Done when:** read-back includes new columns; tx propagation works in both branches; existing tests adjusted.
- **Blocked-by:** T8

---

## Phase 6 — Use Case Refactors

(All blocked by: T7, T8, T11, T12, T13. Can run in parallel after their prereqs are satisfied. Each step ends with unit tests adjusted.)

### T19 — `force-manual-confirmation.use-case.ts`
- Replace direct `appointmentRepo.update({ tenantConfirmationStatus: 'CONFIRMED' })` with `ConfirmationCycleService.confirm(..., 'OPERATOR_FORCED', null)`.
- **Done when:** unit tests assert cycle + denorm written, audit emitted.

### T20 — `confirm-appointment.use-case.ts` (tenant-portal)
- Replace with `ConfirmationCycleService.confirm(..., 'TENANT_PORTAL', tokenId)`.
- **Done when:** unit tests adjusted; idempotency on already-CONFIRMED preserved.

### T21 — `report-unavailability.use-case.ts` (tenant-portal)
- Replace with `ConfirmationCycleService.markUnavailable(...)`.
- **Done when:** unit tests adjusted.

### T22 — `reopen-for-reschedule.use-case.ts`
- Wrap appointment update + `ConfirmationCycleService.invalidateOnReopen` in same `$transaction`.
- Remove `tenantConfirmationStatus: 'PENDING'` from the direct update payload.
- **Done when:** unit tests adjusted; existing `appointment.rescheduled` audit still emitted.

### T23 — `execute-status-transition.use-case.ts`
- On any `→ DRAFT` transition, call `ConfirmationCycleService.invalidateOnReopen()` (idempotent).
- **Done when:** unit tests cover REJECTED→DRAFT, CANCELLED→DRAFT, DONE→DRAFT cases.

### T24 — `reschedule-request.use-case.ts` (tenant-portal)
- Replace inner-call to `ReopenForRescheduleUseCase` denorm reset with `ConfirmationCycleService.rotateOnTenantReschedule(...)`.
- Keep date update, restriction handling, token revocation, audit, notification handler, auto-mint new token.
- **Done when:** unit tests adjusted; portal reschedule produces cycle with `CONFIRMED` status + `TENANT_RESCHEDULE` source.

### T25 — `generate-portal-token.use-case.ts` (tenant-portal) — **OUTER TRANSACTION** (Planejador round 1)
- Open `prisma.$transaction(async tx => { ... })` wrapping:
  1. `MintPortalTokenService.mint(appointment, tenant, tx)` — returns `{ rawToken, expiresAt, tokenId }`.
  2. `ConfirmationCycleService.createInitial(appointmentId, tenantId, scheduledDate, timeSlot, tokenId, tx)` — inserts cycle or links to existing; sets `appointment.active_confirmation_cycle_id`; sets `cycle.portal_token_id`; the token's `confirmation_cycle_id` is already set inside the same tx by the service.
- Bidirectional FK (`token.confirmation_cycle_id` ↔ `cycle.portal_token_id`) is set atomically.
- **Done when:** unit tests cover both branches (no cycle → create; cycle exists → link); integration test asserts rollback on simulated mid-tx failure leaves zero orphan rows.

### T26 — `reject-unconfirmed-appointments.use-case.ts` (worker) — **OUTER TRANSACTION PER APPOINTMENT** (Planejador round 1)
- Per appointment in the iteration loop, open `prisma.$transaction(async tx => { ... })` wrapping:
  1. `ConfirmationCycleService.invalidateOnReject(appointmentId, tenantId, tx)` — supersedes active cycle, sets denorm to NO_RESPONSE.
  2. `appointmentRepo.update(tx, appointmentId, tenantId, { status: 'REJECTED', reason, rejectionReasonCode, serviceGroupId: null })` — WITHOUT `tenantConfirmationStatus` in payload.
- Per-appointment failure (try/catch around the outer tx) rolls back only that appointment; worker continues.
- **Done when:** unit tests adjusted; worker idempotent if no active cycle; rollback isolated per appointment.

### ~~T27~~ — REMOVED (Planejador round 1)
`update-appointment.use-case.ts` is NOT modified. Editability gate blocks SCHEDULED date/time edits today. `ConfirmationCycleService.rotateOnDateChange()` ships as defensive infra but has no caller.

---

## Phase 7 — Backend Interfaces

### T28 — Create `GetPortalLinkUseCase`
- **Layer:** backend-app (tenant-portal)
- **File:** `apps/backend/src/modules/tenant-portal/application/use-cases/get-portal-link.use-case.ts`
- **Tenant scope** (Planejador round 1): `actor.role === 'AM' ? null : actor.tenantId` — mirrors `generate-portal-token.use-case.ts:38`.
- **URL construction**: `${TENANT_PORTAL_BASE_URL}/tenant-portal/${rawToken}` — matches canonical router path.
- **Decryption** via `ITokenEncrypter` port (not direct `Aes256GcmService`).
- **Done when:** happy + 3 error paths covered by unit tests; OP-scope rejection tested.
- **Blocked-by:** T6b, T13, T14, T17b, T18, T2

### T28b — Extend `GetAppointmentUseCase` with `hasActivePortalToken` (Planejador round 1 — UX preload)
- **Layer:** backend-app
- **File:** `apps/backend/src/modules/appointment/application/use-cases/get-appointment.use-case.ts`
- **Add field:** `hasActivePortalToken: boolean` derived from `tokenRepo.findActiveByAppointmentId !== null`.
- **Shared schema:** update appointment response Zod schema in `packages/shared/`.
- **Done when:** frontend can read flag to render disabled Copy button without firing GET.
- **Blocked-by:** T18, T3

### T29 — Register route `GET /v1/appointments/:id/portal-link`
- **Layer:** backend-iface
- **File:** `apps/backend/src/modules/tenant-portal/interfaces/tenant-portal.routes.ts`
- **RBAC:** AM, OP via existing JWT auth.
- **Zod request/response.**
- **Done when:** route serves the use case; OpenAPI auto-generation picks it up.
- **Blocked-by:** T28

### T30 — Update `portal-token-middleware.ts` for SUPERSEDED cycle check
- **Layer:** backend-iface (tenant-portal)
- **Done when:** integration test (T34) shows middleware rejects token whose cycle is `SUPERSEDED` with 410 `PORTAL_TOKEN_REVOKED`.
- **Blocked-by:** T13, T18

---

## Phase 8 — DI Wiring

### T31 — Register all new dependencies in `container.ts`
- **Layer:** backend-di
- **File:** `apps/backend/src/main/container.ts`
- **Register:**
  - `PrismaConfirmationCycleRepository`
  - `ConfirmationCycleService` (application-layer location)
  - `Aes256GcmService` (with `PORTAL_TOKEN_ENC_KEY`)
  - `AesTokenEncrypterAdapter` (wraps `Aes256GcmService`, satisfies `ITokenEncrypter`)
  - `GetPortalLinkUseCase`
- **Wire:** `ConfirmationCycleService` into refactored use cases (T19–T26, excluding deleted T27); `ITokenEncrypter` into `MintPortalTokenService` and `GetPortalLinkUseCase`.
- **Done when:** server boots; existing integration smoke tests green.
- **Blocked-by:** T7, T13, T14, T16, T17, T17b, T28

---

## Phase 9 — Backend Tests

### T32 — `ConfirmationCycleService` unit tests
- **Layer:** backend-test
- **File:** `apps/backend/tests/unit/appointment/confirmation-cycle.service.test.ts`
- **Cover:** each method with mocked Prisma TX; audit emission; idempotency; invariant (one non-SUPERSEDED cycle at a time); P2002 retry-once behavior.
- **Blocked-by:** T7

### T32b — Integration test: concurrent createInitial race (Testcontainers, Planejador round 1)
- **Layer:** backend-test
- **File:** `apps/backend/tests/integration/appointment/confirmation-cycle-concurrency.test.ts`
- **Cover:** two parallel `createInitial` calls for the same appointment → partial unique index rejects loser with P2002 → loser re-reads and links its token to the winner's cycle. Exactly one cycle row exists at end.
- **Blocked-by:** T7, T9b, T13, T31

### T33 — Integration test: cycle/denorm atomicity (Testcontainers)
- **Layer:** backend-test
- **File:** `apps/backend/tests/integration/appointment/confirmation-cycle.integration.test.ts`
- **Cover:** simulated DB failure mid-transaction leaves both rows untouched. Per `feedback_mock_masks_real_bug.md`. Also: outer-tx rollback in T25 (mint+cycle) and T26 (worker) leaves zero orphan rows.
- **Blocked-by:** T7, T13, T31

### T34 — Integration test: `GET /v1/appointments/:id/portal-link`
- **Layer:** backend-test
- **File:** `apps/backend/tests/integration/tenant-portal/get-portal-link.routes.test.ts`
- **Cover:** happy path; no active token → 404; cycle SUPERSEDED → 410 via middleware; null `raw_token_encrypted` → 409; OP tenant-scope enforcement (OP cannot fetch portal link for cross-tenant appointment).
- **Blocked-by:** T28, T29, T30, T31

### ~~T35~~ — REMOVED (Planejador round 1)
`update-appointment` date-change behavior removed from scope (see T27). No integration test needed.

### T36 — Update existing unit tests for refactored use cases
- **Layer:** backend-test
- **Files:** all `tests/unit/{appointment,tenant-portal}/*.test.ts` touched by T19–T26.
- **Done when:** all green with new assertions on cycle + denorm.
- **Blocked-by:** T19–T26

---

## Phase 10 — Frontend

### T37 — Regenerate `@properfy/shared` openapi types
- **Layer:** shared
- **Commands:** start backend in dev → `pnpm --filter @properfy/shared generate:types && pnpm --filter @properfy/shared build`.
- **Done when:** `packages/shared/src/api-types.ts` contains `/v1/appointments/{id}/portal-link` GET.
- **Blocked-by:** T29

### T38 — Frontend: split Send/Copy buttons in `AppointmentDetailPage.tsx`
- **Layer:** web
- **File:** `apps/web/src/features/appointments/pages/AppointmentDetailPage.tsx`
- **Subtasks:**
  - Remove existing Dialog modal (lines 375–419) and inline clipboard for Send.
  - Send shows `useSnackbar.showSuccess('Email sent to tenant')` on success.
  - Add Copy Portal Link button (AM/OP only).
  - **Disabled state driven by `appointment.hasActivePortalToken` preload signal** (Planejador round 1 — no extra network call). Tooltip on disabled: `"No active portal link — send one first"`.
  - When enabled, click calls `GET /v1/appointments/:id/portal-link`; on `409 PORTAL_TOKEN_NOT_DECRYPTABLE` show error toast `"Send Portal Link to generate a fresh link"`.
- **Done when:** lint + typecheck pass; UI smoke test via `pnpm --filter web dev` shows both buttons and disabled-state tooltip without firing the GET.
- **Blocked-by:** T28b, T37

### T39 — Frontend test for Copy Portal Link
- **Layer:** web-test
- **Cover:** clicking copies URL to clipboard; toast appears; disabled state shows tooltip.
- **Blocked-by:** T38

---

## Phase 11 — Verification & Handoff

### T40 — Run full backend verification
- **Commands:** `pnpm --filter backend lint && pnpm --filter backend typecheck && pnpm --filter backend test && pnpm --filter backend build`
- **Done when:** all green per `feedback_verify_completion.md`.
- **Blocked-by:** all backend tasks (T1–T36; T35 removed, T9b/T17b/T28b/T32b added)

### T41 — Run full web verification
- **Commands:** `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build`
- **Done when:** all green.
- **Blocked-by:** T38, T39

### T42 — QA via Docker local stack
- **Per CLAUDE.md §12 + memory `feedback_qa_must_test_in_browser.md`.**
- **Done when:** manual scenario passes (date change on scheduled appointment → tenant gets new email; operator clicks Copy Portal Link → URL pastes; old portal link shows revoked when cycle superseded).
- **Blocked-by:** T40, T41

### T43 — PR description and handoff to Revisor
- **Per role workflow §8.**
- **Body must include:** the 10 locked decisions (was 7, now 10 with Planejador round 1 additions), removal of `update-appointment` net-new from scope, repository contract change (`tx?` plumbing), `MintPortalTokenService` return shape change (now includes `tokenId`), `ITokenEncrypter` port introduction, partial unique index, operator UX migration note.
- **Blocked-by:** T42

### T44 — Verify audit retention coverage for `AppointmentConfirmationCycle` (follow-up, resolves Crítico M3)
- **Layer:** docs / cross-feature
- **Action:** read `specs/020-audit-retention-pii-redaction/` and confirm that `AppointmentConfirmationCycle` entity type is covered by the retention category map. If not present, amend 020 to add a category (suggested: `APPOINTMENT_CYCLE_HISTORY`, same horizon as `APPOINTMENT_LIFECYCLE`, redaction `NONE`).
- **Done when:** either (a) coverage already exists and is documented in `historico` note, or (b) PR opened to amend 020 spec.
- **Non-blocking** for shipping 028 — entries default to safe-retention until 020 is amended.
- **Parallel-with:** any phase after T7

---

## Parallelism Map (Optimistic)

```
T1   T2   T6   T14   T16
 └────┘   │    │     │
   T3 ────┴──> T4,T5 ┘
              │
              T7
              │
   T8 ─── T11,T12,T13  T17  T18  T15
   │      │            │    │    │
   T9     │            │    │    │
   │      │            │    │    │
   T10────┘            │    │    │
                       │    │    │
                T19──T26    │    │
                       │    │    │
                       T27  │    │
                       │    │    │
                       T28──┴────┘
                       │
                       T29
                       │
                       T30  T31
                       │    │
                       T32──┴──T33──T34──T35
                                    │
                                    T36
                                    │
                                    T37
                                    │
                                    T38──T39
                                    │
                                    T40──T41──T42──T43
```

---

## Confidence Per Phase

| Phase | Confidence | Notes |
|-------|-----------|-------|
| Phase 1 (shared) | HIGH | Pure additive types |
| Phase 2 (domain) | HIGH | Patterns established |
| Phase 3 (infra) | HIGH | Migration is straightforward additive DDL |
| Phase 4 (crypto) | HIGH | Helper extraction is trivial; TotpEncryptionService is the canonical reference |
| Phase 5 (token mint) | MEDIUM | Domain service touches infra concerns (encryption); watch dependency direction |
| Phase 6 (use case refactors) | MEDIUM-HIGH | Many small changes, but each follows the same template |
| Phase 7 (interfaces) | HIGH | New endpoint is conventional; middleware change is additive |
| Phase 8 (DI) | HIGH | Mechanical |
| Phase 9 (tests) | MEDIUM | Existing tests change is wide; requires per-file attention |
| Phase 10 (frontend) | HIGH | Single file, well-known patterns |
| Phase 11 (verification) | HIGH | Standard checklist |
