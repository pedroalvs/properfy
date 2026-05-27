# Implementation Plan — Tenant Confirmation Cycles

**Feature:** 028-tenant-confirmation-cycles
**Spec:** `specs/028-tenant-confirmation-cycles/spec.md`
**Data model:** `specs/028-tenant-confirmation-cycles/data-model.md`
**Date:** 2026-05-26
**Author:** Arquiteto (after impact analysis by 4 explorer agents + 7-question alignment with Pedro)

---

## 1. Strategy

The refactor is a **mediated rewrite of the `tenantConfirmationStatus` write path**. The read path stays identical (denorm column, existing queries, existing T-1 visibility, existing worker logic for reminders/escalations). All confirmation-state mutations are funneled through `ConfirmationCycleService`, which atomically writes both the source-of-truth cycle row and the denorm column inside a Prisma `$transaction`.

`ConfirmationCycleService` lives in the **application layer** (Planejador round 1 correction). The domain layer keeps only `ConfirmationCycleEntity`, `IConfirmationCycleRepository` port, and error classes. The service injects `AuditService` and orchestrates `prisma.$transaction` — both are infrastructure concerns per `apps/backend/CLAUDE.md` §4.

The encrypted raw token + Copy Portal Link endpoint is **additive** — it does not touch any existing write path. Token raw-value encryption is consumed in tenant-portal domain via an `ITokenEncrypter` port; the concrete `Aes256GcmService` adapter lives in `shared/infrastructure/crypto/`. This keeps the tenant-portal domain layer free of `node:crypto` imports.

To achieve **atomic bidirectional FK linkage between `tenant_portal_tokens` and `appointment_confirmation_cycles`**, the following contract changes are required (Planejador round 1):
- `ITenantPortalTokenRepository.save` and `revokeAndSave` accept optional `tx?: Prisma.TransactionClient`.
- `MintPortalTokenService.mint()` accepts optional `tx?` and returns `{ rawToken, expiresAt, tokenId }`.
- `GeneratePortalTokenUseCase` opens an outer `prisma.$transaction` and passes the client to both mint and `ConfirmationCycleService.createInitial`.

The frontend Send/Copy UX rework is **also additive** for the new button and **subtractive** for the existing dialog. The `GET /v1/appointments/:id` response gains a `hasActivePortalToken: boolean` field so the Copy button can render disabled state without firing the new endpoint (pre-click signal).

**No change to `update-appointment.use-case.ts` in this PR** (Planejador round 1): the editability gate (`isEditable()` allows only DRAFT/AWAITING_INSPECTOR; `bulk-edit` hardcodes the same) blocks SCHEDULED date/time edits from reaching that path. SCHEDULED dates always change via `reopen-for-reschedule` → `DRAFT`, which already triggers cycle invalidation.

---

## 2. Implementation Order (Layered, Bottom-Up)

The order respects Clean Architecture: domain → application → infrastructure → interfaces. Each step has a single verifiable outcome.

### Phase 1 — Shared layer (`packages/shared`)

1. **Add enums and types** (`CycleStatus`, `CycleConfirmationSource`, `CycleInvalidatedReason`, `GetPortalLinkResponse`, `PortalLinkErrorCode`).
2. **Rebuild `@properfy/shared`** so backend and web consume the new types.

### Phase 2 — Backend domain layer

3. **Create `ConfirmationCycleEntity`** in `apps/backend/src/modules/appointment/domain/confirmation-cycle.entity.ts`. Pure value object — constructor + readonly getters + `markConfirmed(source, tokenId?)`, `markUnavailable()`, `markSuperseded(reason)` methods that return new instances.
4. **Create `IConfirmationCycleRepository` port** in `apps/backend/src/modules/appointment/domain/confirmation-cycle.repository.ts`. Methods: `save(cycle, tx?)`, `update(cycle, tx?)`, `findActiveByAppointmentId(appointmentId, tx?)`, `findById(id, tx?)`, `findMaxCycleNumber(appointmentId, tx?)`. Every method accepts optional `tx?: Prisma.TransactionClient` for outer-transaction participation.
5. **Create `ITokenEncrypter` port** in `apps/backend/src/modules/tenant-portal/domain/token-encrypter.ts`. Methods: `encrypt(plaintext: string): string`, `decrypt(ciphertext: string): string`. Keeps tenant-portal domain free of `node:crypto`.

### Phase 2.5 — Backend application layer (services) — **Planejador round 1 correction**

6. **Create `ConfirmationCycleService`** at `apps/backend/src/modules/appointment/application/services/confirmation-cycle.service.ts`. Lives in **application layer**, not domain (the service orchestrates Prisma `$transaction` and injects `AuditService` — infrastructure concerns per CLAUDE.md §4).
   - Methods exactly as spec §6.
   - Every method accepts optional `tx?: Prisma.TransactionClient`. When provided, the service participates in the caller's outer transaction. When omitted, the service opens its own `prisma.$transaction`.
   - Inside the transaction (own or caller's): (a) reads the active cycle, (b) writes the new/updated cycle, (c) updates the appointment denorm + `active_confirmation_cycle_id`.
   - On `P2002` (Prisma unique-violation from the partial unique index): re-read the active cycle and retry once via the "link to existing cycle" branch.
   - Emits one audit log via injected `AuditService` per mutation with `entityType: 'AppointmentConfirmationCycle'`.

### Phase 3 — Backend infrastructure layer

7. **Create `PrismaConfirmationCycleRepository`** implementing the port. Accepts optional `Prisma.TransactionClient`; when provided uses it, when omitted uses the injected `PrismaClient`.
8. **Update `prisma-appointment.repository.ts`** — remove `tenantConfirmationStatus` from the `update()` payload type (or document the only remaining caller is `ConfirmationCycleService`). Add `active_confirmation_cycle_id` to map-to-entity and update payloads. Tests follow.
9. **Update Prisma schema** with the new model, columns, enums (see `data-model.md` §1). Run `pnpm --filter backend prisma:generate`.
10. **Generate migration file** `20260526000000_appointment_confirmation_cycles/migration.sql` from `data-model.md` §2 — includes partial unique index for concurrency safety. Apply locally via `prisma migrate deploy` per `feedback_migration_apply_locally.md`.

### Phase 4 — Shared crypto helper

11. **Extract `Aes256GcmService`** from `TotpEncryptionService` into `apps/backend/src/shared/infrastructure/crypto/aes-256-gcm.service.ts`. Pure stateless service — `constructor(key: string)` accepts hex/base64; `encrypt(plaintext: string): string`; `decrypt(ciphertext: string): string`. Key length validation (32 bytes).
12. **Refactor `TotpEncryptionService`** to delegate to `Aes256GcmService`. Verify TOTP tests still green.
13. **Add `PORTAL_TOKEN_ENC_KEY` to env schema** (`apps/backend/src/main/env.ts`) + strict-runtime guard for production.
14. **Create `AesTokenEncrypterAdapter`** at `apps/backend/src/modules/tenant-portal/infrastructure/aes-token-encrypter.adapter.ts`. Implements `ITokenEncrypter`; constructor takes `Aes256GcmService` instance. This keeps tenant-portal domain pure (Planejador round 1).

### Phase 5 — Token mint integration

15. **Update `ITenantPortalTokenRepository`** (`save`, `revokeAndSave`) to accept optional `tx?: Prisma.TransactionClient` (Planejador round 1 — atomicity gap).
16. **Update `PrismaTenantPortalTokenRepository`** — when `tx` provided, use it directly (no internal `$transaction`); when omitted, preserve current behavior (own transaction). Persist `raw_token_encrypted` and `confirmation_cycle_id` in both branches.
17. **Update `MintPortalTokenService.mint()`** — (a) accept optional `tx?` parameter, (b) consume `ITokenEncrypter` port (injected via constructor) to encrypt the raw token, (c) return `{ rawToken, expiresAt, tokenId }` (was `{ rawToken, expiresAt }`). The `tokenId` is required for cycle linkage.

### Phase 6 — Backend application layer (use case refactors)

For each use case below, the pattern is:
- Replace direct `appointmentRepo.update({ tenantConfirmationStatus })` with the matching `ConfirmationCycleService.*` call.
- Add `ConfirmationCycleService` as a constructor dependency.
- For use cases composing multi-write operations (mint + cycle, status update + cycle): open `prisma.$transaction(async tx => ...)` and pass `tx` to both repository methods and the cycle service.
- Adjust audit log expectations in unit tests (now there's a cycle audit + a use-case-level audit).

Order (in same PR group):
18. `force-manual-confirmation.use-case.ts` — simplest, sets to CONFIRMED via service.
19. `confirm-appointment.use-case.ts` (tenant-portal) — sets to CONFIRMED via service.
20. `report-unavailability.use-case.ts` (tenant-portal) — sets to UNAVAILABLE via service. Preserves FR-060 late emergency exception.
21. `reopen-for-reschedule.use-case.ts` — calls `invalidateOnReopen()` before the existing appointment update.
22. `execute-status-transition.use-case.ts` — on any `→ DRAFT` transition, calls `invalidateOnReopen()` (idempotent).
23. `reschedule-request.use-case.ts` (tenant-portal) — calls `rotateOnTenantReschedule()` instead of inner-call to ReopenForReschedule. ReopenForReschedule remains for operator/CL_ADMIN flows.
24. `generate-portal-token.use-case.ts` (tenant-portal) — **opens outer `prisma.$transaction`** wrapping (a) `MintPortalTokenService.mint(tx)` returning `tokenId`, (b) `ConfirmationCycleService.createInitial(..., tokenId, tx)` which inserts the cycle row and sets the appointment denorm. The bidirectional FK (`token.confirmation_cycle_id` ↔ `cycle.portal_token_id`) is set atomically inside this outer tx.
25. `reject-unconfirmed-appointments.use-case.ts` (worker) — **opens outer `prisma.$transaction` per appointment** wrapping (a) `ConfirmationCycleService.invalidateOnReject(..., tx)`, (b) `appointmentRepo.update(tx, ...REJECTED + NO_RESPONSE)`. Per-appointment error caught at the loop level (one failure doesn't abort the worker).

**Note:** `update-appointment.use-case.ts` is NOT modified in this PR (Planejador round 1 finding — see §1 Strategy). The "auto-rotate on SCHEDULED date change" behavior is removed from scope.

### Phase 7 — Backend interfaces layer

26. **Add `GetPortalLinkUseCase`** at `apps/backend/src/modules/tenant-portal/application/use-cases/get-portal-link.use-case.ts`. Tenant scope: `actor.role === 'AM' ? null : actor.tenantId` (mirrors `generate-portal-token.use-case.ts:38`). Resolves active token via repo, validates cycle isn't SUPERSEDED, decrypts raw token via `ITokenEncrypter` port, constructs URL as `${TENANT_PORTAL_BASE_URL}/tenant-portal/${rawToken}`.
27. **Extend `GetAppointmentUseCase`** response with `hasActivePortalToken: boolean` (derived from `tokenRepo.findActiveByAppointmentId` being non-null). Adjust shared schema accordingly.
28. **Register route `GET /v1/appointments/:id/portal-link`** in `tenant-portal.routes.ts`. RBAC: `AM`, `OP`. Validation via Zod. Surface error codes per spec §7.2.
29. **Update `portal-token-middleware.ts`** — after loading token entity, if `tokenEntity.confirmationCycleId` is set, fetch the cycle and reject with `PORTAL_TOKEN_REVOKED` (410) if status is `SUPERSEDED`.

### Phase 8 — Backend DI wiring

30. **`apps/backend/src/main/container.ts`** — register:
   - `PrismaConfirmationCycleRepository`
   - `ConfirmationCycleService` (application-layer location)
   - `Aes256GcmService` (with `PORTAL_TOKEN_ENC_KEY`)
   - `AesTokenEncrypterAdapter` (wraps `Aes256GcmService`, satisfies `ITokenEncrypter`)
   - Wire `ConfirmationCycleService` into every use case touched in Phase 6
   - Wire `ITokenEncrypter` into `MintPortalTokenService` and `GetPortalLinkUseCase`

### Phase 9 — Backend tests

31. **Unit tests** for `ConfirmationCycleService` — cover each method with mocked Prisma TX. Validate audit emission. Cover P2002 retry-once behavior.
32. **Integration tests (Testcontainers)** for the cycle/denorm atomicity invariant (per spec §12).
33. **Integration test (Testcontainers)** for concurrent `createInitial` race — two parallel calls produce exactly one cycle row; the partial unique index rejects the loser, which then links its token to the winner's cycle.
34. **Update unit tests** for all touched use cases in Phase 6. New assertions: cycle written, denorm written, audit emitted, outer-tx rollback when mid-tx failure simulated (T24 and T25).
35. **Integration tests** for new endpoint `GET /v1/appointments/:id/portal-link` — happy path, no-active-token, decryption failure, SUPERSEDED cycle, OP tenant-scope enforcement.
36. **Integration test** for portal middleware rejecting SUPERSEDED cycle tokens.

### Phase 10 — Frontend (`apps/web`)

37. **Regenerate openapi-fetch types** — three sub-steps: (a) restart backend dev to refresh `openapi.json`, (b) `pnpm --filter @properfy/shared generate:types`, (c) `pnpm --filter @properfy/shared build`.
38. **`AppointmentDetailPage.tsx`** — split Send/Copy buttons:
    - Remove the existing `<Dialog>` modal (lines 375–419) and inline clipboard logic for Send button.
    - Send Portal Link: show `useSnackbar.showSuccess('Email sent to tenant')` on success; preserve existing role gating (`canSendPortalLink`).
    - Add **Copy Portal Link** button next to Send. Disabled state driven by `appointment.hasActivePortalToken` preload (no network call to fire). When enabled, calls `GET /v1/appointments/:id/portal-link`.
    - Both buttons share the existing `isPrivileged` AM/OP gate.
39. **Frontend test** (Playwright if existing E2E setup; otherwise component test): Copy Portal Link copies URL on click, shows toast; disabled state shows tooltip from preload signal.

### Phase 11 — Verification

40. **Lint, typecheck, tests, Prisma dry-run** all green. Per `feedback_verify_completion.md`, show evidence.
41. **Local QA via docker-compose** if applicable (per CLAUDE.md §12).
42. **PR description** lists migration (incl. partial unique index), the 10 locked decisions (7 initial + 3 added in Planejador round 1: D8 application-layer placement, D9 tenant scope, D10 token↔cycle atomicity), removal of `update-appointment` net-new from scope, `ITokenEncrypter` port introduction.

---

## 3. Cross-Cutting Concerns

### Transactionality
- **Cycle mutations alone**: `ConfirmationCycleService` opens its own `prisma.$transaction` when called without `tx`. Callers that only mutate the cycle do not need to wrap.
- **Use cases composing multiple writes** open an outer `prisma.$transaction(async tx => ...)` and pass `tx` to ALL repository methods AND the cycle service. Required for:
  - `GeneratePortalTokenUseCase` (mint token → create/link cycle → bidirectional FK)
  - `reject-unconfirmed-appointments.use-case.ts` (invalidate cycle → update appointment status)
  - `reopen-for-reschedule.use-case.ts` (invalidate cycle → update appointment fields → revoke tokens)
- **Pattern**: every service/repository method receives `tx?: Prisma.TransactionClient` and falls back to opening its own transaction when omitted. Codebase precedent: `MintPortalTokenService`'s `tokenRepo.revokeAndSave` is the model — this PR extends the pattern with explicit tx passthrough.
- **Worker per-item isolation**: `reject-unconfirmed` opens one outer tx PER appointment inside the iteration loop. One appointment's failure rolls back its own tx but does not abort the worker run (existing per-item try/catch pattern preserved).

### Audit
- Every cycle mutation emits one audit with `entityType: 'AppointmentConfirmationCycle'`, `entityId: cycle.id`, `before`/`after` snapshots of cycle state.
- Existing use-case-level audits (`appointment.rescheduled`, `tenant_portal.appointment_confirmed`, etc.) are **kept**. The cycle audit is additive — it gives QA a single timeline view of cycle history.

### Idempotency
- `createInitial()` returns existing cycle if one already exists with `PENDING` status and matching (date, timeSlot).
- `invalidateOnReopen()` is a no-op if no active cycle exists.
- `invalidateOnReject()` is a no-op if no active cycle exists (older appointments may have none).
- `confirm()` is idempotent if cycle is already `CONFIRMED`.
- `markUnavailable()` is idempotent if cycle is already `UNAVAILABLE`.

### Error surfaces
- `ConfirmationCycleNotFoundError` (404 / 422 depending on context) — when an operation expects an active cycle but none exists.
- `ConfirmationCycleAlreadyTerminalError` (422) — attempt to mutate `SUPERSEDED` cycle.
- `PortalTokenNotDecryptableError` (409) — token row has null `raw_token_encrypted`.

### Multi-tenancy
- Every service method takes `tenantId` and asserts the appointment belongs to it before any write — defense-in-depth even though appointments are already tenant-scoped at lookup.

---

## 4. Files to Create

| File | Purpose |
|------|---------|
| `apps/backend/src/modules/appointment/domain/confirmation-cycle.entity.ts` | Entity (domain layer) |
| `apps/backend/src/modules/appointment/domain/confirmation-cycle.repository.ts` | Port (domain layer) |
| `apps/backend/src/modules/appointment/domain/confirmation-cycle.errors.ts` | Error classes (domain layer) |
| `apps/backend/src/modules/appointment/application/services/confirmation-cycle.service.ts` | **Application-layer** service (Planejador correction) |
| `apps/backend/src/modules/appointment/infrastructure/prisma-confirmation-cycle.repository.ts` | Adapter |
| `apps/backend/src/shared/infrastructure/crypto/aes-256-gcm.service.ts` | Shared AES helper |
| `apps/backend/src/modules/tenant-portal/domain/token-encrypter.ts` | `ITokenEncrypter` port (keeps tenant-portal domain pure) |
| `apps/backend/src/modules/tenant-portal/infrastructure/aes-token-encrypter.adapter.ts` | Adapter wrapping `Aes256GcmService` |
| `apps/backend/src/modules/tenant-portal/application/use-cases/get-portal-link.use-case.ts` | New endpoint UC |
| `apps/backend/prisma/migrations/20260526000000_appointment_confirmation_cycles/migration.sql` | Migration (incl. partial unique index) |
| `apps/backend/tests/unit/appointment/confirmation-cycle.service.test.ts` | Service unit tests |
| `apps/backend/tests/integration/appointment/confirmation-cycle.integration.test.ts` | Cycle/denorm atomicity |
| `apps/backend/tests/integration/appointment/confirmation-cycle-concurrency.test.ts` | Concurrent createInitial race (partial unique index) |
| `apps/backend/tests/integration/tenant-portal/get-portal-link.routes.test.ts` | Endpoint integration |

## 5. Files to Modify

### Backend
- `apps/backend/prisma/schema.prisma` (new model, columns, enums)
- `apps/backend/src/main/env.ts` (new env var)
- `apps/backend/src/main/container.ts` (DI wiring)
- `apps/backend/src/modules/auth/infrastructure/totp-encryption.service.ts` (delegate to shared helper)
- `apps/backend/src/modules/appointment/domain/appointment.entity.ts` (add `activeConfirmationCycleId`)
- `apps/backend/src/modules/appointment/domain/appointment.repository.ts` (update interface)
- `apps/backend/src/modules/appointment/infrastructure/prisma-appointment.repository.ts` (map new column)
- `apps/backend/src/modules/appointment/application/use-cases/force-manual-confirmation.use-case.ts`
- `apps/backend/src/modules/appointment/application/use-cases/reopen-for-reschedule.use-case.ts` (invalidate cycle in outer tx)
- `apps/backend/src/modules/appointment/application/use-cases/execute-status-transition.use-case.ts` (invalidate on any →DRAFT)
- `apps/backend/src/modules/appointment/application/use-cases/reject-unconfirmed-appointments.use-case.ts` (outer tx wrapping cycle + status)
- `apps/backend/src/modules/appointment/application/use-cases/get-appointment.use-case.ts` (add `hasActivePortalToken` field)
- `apps/backend/src/modules/appointment/application/use-cases/force-manual-confirmation.use-case.ts` (use cycle service)
- `apps/backend/src/modules/tenant-portal/domain/tenant-portal-token.repository.ts` (add `tx?` to save/revokeAndSave)
- `apps/backend/src/modules/tenant-portal/domain/mint-portal-token.service.ts` (accept tx, return tokenId, consume ITokenEncrypter port)
- `apps/backend/src/modules/tenant-portal/application/use-cases/generate-portal-token.use-case.ts` (open outer tx, link mint+cycle atomically)
- `apps/backend/src/modules/tenant-portal/application/use-cases/confirm-appointment.use-case.ts`
- `apps/backend/src/modules/tenant-portal/application/use-cases/report-unavailability.use-case.ts`
- `apps/backend/src/modules/tenant-portal/application/use-cases/reschedule-request.use-case.ts`
- `apps/backend/src/modules/tenant-portal/infrastructure/prisma-tenant-portal-token.repository.ts` (accept tx; persist encrypted + cycle FK)
- `apps/backend/src/modules/tenant-portal/interfaces/portal-token-middleware.ts` (SUPERSEDED check)
- `apps/backend/src/modules/tenant-portal/interfaces/tenant-portal.routes.ts` (new route)
- `apps/backend/src/modules/auth/infrastructure/totp-encryption.service.ts` (delegate to shared `Aes256GcmService`)
- Tests for each above

**NOT modified in this PR** (was originally planned): `update-appointment.use-case.ts`, `bulk-edit-appointments.use-case.ts`, `bulk-reschedule-appointments.use-case.ts` — Planejador round 1 finding (editability gate blocks the path).

### Shared
- `packages/shared/src/enums.ts` (new enums)
- `packages/shared/src/schemas/*.ts` (new response schema)
- `packages/shared/openapi.json` (regenerated from backend)
- `packages/shared/src/api-types.ts` (regenerated)

### Web
- `apps/web/src/features/appointments/pages/AppointmentDetailPage.tsx` (Send/Copy split)

---

## 6. Dependencies & Sequencing Risks

- **Phase 1 must complete before Phase 2** — shared types are imported by domain code.
- **Phase 2 must complete before Phase 6** — use cases depend on the service.
- **Phase 3 step 9 (migration apply) must complete before Phase 6 tests** — application tests need the new schema.
- **Phase 8 (DI) before any use case test** — otherwise container construction fails.
- **Phase 10 step 34 (openapi regen) before frontend code** — types must exist.

These dependencies make most phases sequential; **Phase 4 (AES helper) and Phase 1 (shared) can run in parallel** as a starting batch.

---

## 7. Test Strategy (Per CLAUDE.md §11)

- **TDD**: write failing test → minimal implementation → refactor. Per `feedback_tdd_mandatory.md` write tests alongside implementation, not after.
- **Per `feedback_mock_masks_real_bug.md`**: `ConfirmationCycleService` and the new endpoint MUST be covered by Testcontainers integration tests. Unit tests with mocks are insufficient for the transactional invariant.
- **Coverage target**: 80%+ for `appointment` and `tenant-portal` modules (critical per CLAUDE.md §11).
- **Test data note**: most existing tenant-portal tests construct appointments without cycles; the confirm/unavailability tests will need a fixture helper `createAppointmentWithActiveCycle()` to seed an initial cycle before exercising the flow.

---

## 8. Migration Risk Items (Surface in PR)

1. **Send Portal Link UX change**: existing operators have muscle memory for the copy-from-dialog flow. The PR description must include release-note copy describing the split.
2. **Pre-existing tokens** have `raw_token_encrypted = NULL` and cannot be copied. The endpoint returns 409 with the documented tooltip text directing operators to mint a new one.
3. **Partial unique index** on `appointment_confirmation_cycles` is a new DB-level invariant. Document in PR that any future code path creating a non-SUPERSEDED cycle outside `ConfirmationCycleService` will hit `P2002` — this is intentional and the service handles it via retry-once.
4. **Repository contract change** (`ITenantPortalTokenRepository`) adds optional `tx?` parameter to `save` and `revokeAndSave`. Existing callers compile unchanged; only `GeneratePortalTokenUseCase` exercises the new tx-passthrough path.
5. **`MintPortalTokenService.mint()` return shape change** (now includes `tokenId`). Internal API only — no external consumers. Existing callers must destructure the new field.

---

## 9. Out of Scope (Reaffirmed from Spec)

- Backfill of cycles for historical appointments.
- Cycle history exposure to tenant portal.
- Key rotation tooling.
- Restricting cycles to ROUTINE flow type.

---

## 10. Confidence

**HIGH overall** — Planejador round 1 removed the riskiest scope item (`update-appointment` net-new behavior) and clarified the remaining ambiguities (tx plumbing, layer placement, URL pattern, tenant scope).

**HIGH** for the refactor portion — the pattern is well-established in the codebase (services + Prisma transactions; `MintPortalTokenService` already does an atomic revoke+save).

**HIGH** for the AES helper extraction — `TotpEncryptionService` is a clean wrap-around that delegates trivially.

**HIGH** for the frontend split — patterns (`useSnackbar`, `navigator.clipboard`, `isPrivileged`) are already used elsewhere; only file affected is `AppointmentDetailPage.tsx`.
