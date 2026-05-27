# Tenant Confirmation Cycles — Design Spec

**Date:** 2026-05-26
**Feature:** `tenant-confirmation-cycles`
**Branch:** `feature/dashboard-alerts`
**Brainstorming source:** `docs/superpowers/specs/2026-05-26-tenant-confirmation-cycles-design.md`
**Status:** Approved by Pedro on 2026-05-26 (10 decisions locked — 7 initial + 3 from Planejador round 1 debate; see §11)

---

## 1. Overview

`appointment.tenantConfirmationStatus` is a single field on the appointment. It becomes semantically stale in several scenarios:

- **Operator changes scheduled date or time slot** — the tenant confirmed a date/slot that no longer exists, but the field stays `CONFIRMED`.
- **Appointment reopened** (`REJECTED` or `CANCELLED` → `DRAFT`) — confirmation from a previous lifecycle persists incorrectly.
- **Tenant reschedules via portal** — handled correctly today (reset to `PENDING`), but there is no audit trail of why or how many cycles occurred.

Additionally, operators have no way to copy the active portal link from the appointment detail without generating a new token, which revokes the link already sent to the tenant.

This feature introduces a formal `appointment_confirmation_cycles` table as the source of truth for each confirmation lifecycle, a `ConfirmationCycleService` application-layer service that mediates all cycle mutations, and an `AES-256-GCM` encrypted raw token field to enable a "Copy Portal Link" feature without revoking the active token.

---

## 2. Definitions

| Term | Definition |
|---|---|
| **Confirmation cycle** | One attempt to obtain tenant confirmation for a specific (appointment, scheduledDate, timeSlot) snapshot. |
| **Active cycle** | The single non-`SUPERSEDED` cycle for an appointment. At most one exists at any time. |
| **Cycle rotation** | Atomic operation that supersedes the active cycle and creates a new one. |
| **Denormalized cache** | `appointments.tenant_confirmation_status` and `appointments.active_confirmation_cycle_id` columns — read-side mirror of cycle state for query performance. |
| **Raw token** | The 64-character hex string sent in the portal URL. Today only its SHA-256 hash is stored. After this feature, the raw value is also stored encrypted. |

---

## 3. Scope

### In scope
- New table `appointment_confirmation_cycles` (source of truth for cycle history).
- New columns on `appointments`: `active_confirmation_cycle_id` (FK).
- Existing column on `appointments`: `tenant_confirmation_status` becomes a denorm cache, written only by `ConfirmationCycleService`.
- New column on `tenant_portal_tokens`: `raw_token_encrypted` (AES-256-GCM) + `confirmation_cycle_id` FK.
- New application-layer service `ConfirmationCycleService` (per Clean Architecture; see §6) — single entry point for all cycle mutations.
- New endpoint `GET /v1/appointments/:id/portal-link` (AM cross-tenant, OP tenant-scoped) — returns the decrypted active portal URL without minting a new token.
- Existing `GET /v1/appointments/:id` response gains `hasActivePortalToken: boolean` field — frontend pre-click signal for Copy button.
- New shared AES helper `Aes256GcmService` in `shared/infrastructure/crypto/` (extracted from existing `TotpEncryptionService`); tenant-portal consumes it via `ITokenEncrypter` port + adapter (keeps domain pure).
- New env var `PORTAL_TOKEN_ENC_KEY` (separate from `TOTP_ENCRYPTION_KEY` per security principle of key-per-purpose).
- Contract changes to `ITenantPortalTokenRepository` (`save` and `revokeAndSave` accept optional `Prisma.TransactionClient`) and `MintPortalTokenService.mint()` (accepts optional tx; returns `{ rawToken, expiresAt, tokenId }`) — required for atomic token↔cycle FK linkage.
- Frontend rework: separate `Send Portal Link` (email only) from new `Copy Portal Link` button (clipboard only) on appointment detail.
- Cycles apply to **all appointments**, regardless of `serviceType.flowType` (`ROUTINE`, `INGOING`, `OUTGOING`).
- Cycle invalidation triggered by: appointment going back to `DRAFT` via `reopen-for-reschedule`, `execute-status-transition`, or `reject-unconfirmed` worker; AND by tenant reschedule via portal.

**Explicitly NOT in this PR** (per Planejador round 1 finding — unreachable code paths today):
- Auto-rotation on `update-appointment.use-case.ts` date/timeSlot changes. The current editability gate (`isAppointmentEditable` returns true only for `DRAFT`/`AWAITING_INSPECTOR`; `bulk-edit-appointments.use-case.ts:122-138` hardcodes the same) blocks SCHEDULED date/time edits from ever reaching this use case. SCHEDULED date changes always go through `reopen-for-reschedule` → `DRAFT`, where cycle invalidation already happens. The `ConfirmationCycleService.rotateOnDateChange()` method is preserved as **defensive infrastructure** for the day the editability gate is loosened, but no use case calls it in this PR.

### Out of scope
- Backfilling historical cycles for appointments that already exist — cycles start from the first transition after deploy. Pre-existing appointments retain their current `tenant_confirmation_status` value as their initial denormalized cache; no cycle row exists for them until the next eligible mutation.
- Exposing cycle history to the tenant via the portal — they continue to see only current state.
- Configurable `PORTAL_TOKEN_ENC_KEY` rotation — key rotation is an ops concern, tracked separately.
- Restricting cycles to ROUTINE — blocking semantics (cannot schedule without confirmation) remain ROUTINE-only and unchanged. Cycle existence is universal.
- **Cycle-level domain events**: `ConfirmationCycleService` emits audit entries but does NOT emit cross-module domain events (e.g., `CONFIRMATION_CYCLE_ROTATED`). The existing `TENANT_PORTAL_EVENTS.*` and `APPOINTMENT_EVENTS.*` continue firing at the use-case level. Cycle history is observable via the cycles table; cross-module subscribers do not need cycle-event coupling. (If needed later, add per `CLAUDE.md` §15 #6.)
- **Mutating `appointment.status` from cycle operations**: cycle mutations NEVER change `appointment.status`. Per FR-072 (007-tenant-portal), tenant-portal flows touch only tenant-facing fields. Status transitions remain the responsibility of feature 006 via `ExecuteStatusTransitionUseCase`. Cycle invalidation on status reopen is triggered FROM the status-transition use case, not the other way around.

---

## 4. Data Model

### 4.1 New table: `appointment_confirmation_cycles`

```
id                  UUID        PRIMARY KEY
appointment_id      UUID        NOT NULL  REFERENCES appointments(id)
cycle_number        INTEGER     NOT NULL  -- monotonically increasing per appointment
scheduled_date      DATE        NOT NULL  -- snapshot at cycle creation
time_slot           TEXT        NULL      -- snapshot at cycle creation (HH:mm-HH:mm)
status              TEXT        NOT NULL  -- PENDING | CONFIRMED | UNAVAILABLE | SUPERSEDED
confirmation_source TEXT        NULL      -- TENANT_PORTAL | OPERATOR_FORCED | TENANT_RESCHEDULE
confirmed_at        TIMESTAMPTZ NULL
invalidated_at      TIMESTAMPTZ NULL
invalidated_reason  TEXT        NULL      -- DATE_CHANGED | TIME_CHANGED | APPOINTMENT_REOPENED | TENANT_RESCHEDULE
portal_token_id     UUID        NULL      REFERENCES tenant_portal_tokens(id) ON DELETE SET NULL
created_at          TIMESTAMPTZ NOT NULL  DEFAULT now()

UNIQUE (appointment_id, cycle_number)
INDEX (appointment_id, status)
```

**Cycle status transitions:**

```
PENDING     → CONFIRMED    (tenant confirms via portal or operator forces)
PENDING     → UNAVAILABLE  (tenant reports unavailability)
PENDING     → SUPERSEDED   (date/time change or appointment reopened or tenant reschedules)
CONFIRMED   → SUPERSEDED   (date/time change or appointment reopened or tenant reschedules)
UNAVAILABLE → SUPERSEDED   (date/time change or appointment reopened or tenant reschedules)
```

`SUPERSEDED` is terminal. Cycles never reactivate.

`cycle_number` is computed as `MAX(cycle_number) + 1` for the appointment at creation time. **Invariant**: only one cycle per appointment may be in a non-`SUPERSEDED` status at any time. This invariant is enforced at **two layers**:
1. **Application layer** — `ConfirmationCycleService` controls all mutations and uses single Prisma `$transaction` blocks (see §6).
2. **Database layer** — partial unique index `appointment_active_cycle_unique ON appointment_confirmation_cycles (appointment_id) WHERE status != 'SUPERSEDED'` rejects concurrent racing inserts with `P2002`. The service catches `P2002` and retries once via the "link to existing cycle" branch (see `createInitial` behavior table in §6).

This double-layered enforcement was added in Planejador round 1 to close the concurrency gap on the active-cycle invariant.

**Invalidated reasons** (full enum, fixes m1 from Crítico review):

```
DATE_CHANGED          -- operator changed scheduledDate
TIME_CHANGED          -- operator changed timeSlot
APPOINTMENT_REOPENED  -- any path back to DRAFT (reopen, REJECTED→DRAFT, CANCELLED→DRAFT, DONE→DRAFT, reject-unconfirmed worker)
TENANT_RESCHEDULE     -- tenant rescheduled via portal (rotation auto-confirmed)
```

### 4.2 Changes to `appointments`

| Column | Change | Type |
|--------|--------|------|
| `tenant_confirmation_status` | **Kept** — denormalized mirror of the active cycle's status. Source of truth for filters, dashboard queries, inspector PWA T-1 visibility. Direct setters removed from use cases; only `ConfirmationCycleService` writes it. | `TenantConfirmationStatus` (existing enum: `PENDING | CONFIRMED | UNAVAILABLE | NO_RESPONSE`) |
| `active_confirmation_cycle_id` | **New** — nullable FK to `appointment_confirmation_cycles(id)`. NULL when no active cycle exists (appointment not yet `SCHEDULED`, or reopened, or pre-existing appointment that has not yet had its first cycle event). | `UUID NULL` |

**`NO_RESPONSE` semantics:** `NO_RESPONSE` is a terminal denorm-cache value set by the `reject-unconfirmed` worker when it transitions an unconfirmed appointment to `REJECTED`. It is **not** a cycle status — when the worker runs, it (a) supersedes the active cycle, (b) sets the denorm column to `NO_RESPONSE`, (c) sets `active_confirmation_cycle_id = NULL`. The cycle's `status` becomes `SUPERSEDED` with `invalidated_reason = 'APPOINTMENT_REOPENED'` (worker rejection is a flavour of reopen).

### 4.3 Changes to `tenant_portal_tokens`

| Column | Change | Type |
|--------|--------|------|
| `raw_token_encrypted` | **New** — AES-256-GCM encrypted raw token. Format: `base64(iv ‖ authTag ‖ ciphertext)`. Key from env `PORTAL_TOKEN_ENC_KEY`. Nullable for backfill safety; new tokens always set it. | `TEXT NULL` |
| `confirmation_cycle_id` | **New** — nullable FK to `appointment_confirmation_cycles(id)`. Links each minted token to the cycle it was minted for. Used by middleware to detect `SUPERSEDED` cycles (token semantically invalid even when status is `ACTIVE`). | `UUID NULL` |

---

## 5. Invalidation Rules

| Event | Actor | Active cycle | New cycle | Email |
|-------|-------|-------------|-----------|-------|
| Tenant reschedules via portal | TNT (SYS) | `SUPERSEDED` (`TENANT_RESCHEDULE`) | `PENDING` created → immediately `CONFIRMED` (`source = TENANT_RESCHEDULE`) | No |
| `REJECTED`/`CANCELLED` → `DRAFT` via reopen-for-reschedule | OP, AM, SYS, CL_ADMIN | `SUPERSEDED` (`APPOINTMENT_REOPENED`) | None — appointment not yet `SCHEDULED` again | No |
| `REJECTED`/`CANCELLED`/`DONE` → `DRAFT` via execute-status-transition | OP, AM | `SUPERSEDED` (`APPOINTMENT_REOPENED`) | None | No |
| Appointment → `SCHEDULED` (operator mints portal token) | SYS, OP, AM | — (no active cycle exists) | `PENDING` created (cycle 1 or N) | Existing `INSPECTION_NOTICE` handler triggers (unchanged) |
| Reject-unconfirmed worker | SYS | `SUPERSEDED` (`APPOINTMENT_REOPENED`) | None | No |

**Inspector and contact changes do NOT invalidate the confirmation cycle.**

**Direct date/timeSlot changes via `update-appointment` and `bulk-edit`/`bulk-reschedule` are blocked at the editability gate today** (`isAppointmentEditable` returns true only for DRAFT/AWAITING_INSPECTOR; bulk use cases hardcode the same guard). The only path that changes a SCHEDULED appointment's date is `reopen-for-reschedule`, which lands the appointment in DRAFT and triggers the `APPOINTMENT_REOPENED` invalidation row above. The cycle service exposes `rotateOnDateChange()` as defensive infrastructure for future use, but no caller invokes it in this PR.

---

## 6. Application Service: `ConfirmationCycleService`

Lives at `apps/backend/src/modules/appointment/application/services/confirmation-cycle.service.ts`.

**Layer placement** (Planejador round 1 finding): the service belongs in the **application layer**, not the domain layer. It orchestrates Prisma `$transaction` and injects `AuditService` — both are infrastructure concerns per `apps/backend/CLAUDE.md` §4. The domain layer keeps only the pure pieces: `ConfirmationCycleEntity`, `IConfirmationCycleRepository` port, and error classes.

Every service method accepts an optional `tx?: Prisma.TransactionClient`. When provided, the service uses the passed client and does NOT open its own transaction — this lets callers (e.g., `GeneratePortalTokenUseCase`, `reject-unconfirmed` worker) compose multi-write operations atomically with token mint or status update. When `tx` is omitted, the service opens its own `$transaction`.

```typescript
interface ConfirmationCycleService {
  // Defensive infrastructure — no caller in this PR. Reserved for when the
  // editability gate is loosened to allow direct SCHEDULED date/time edits.
  rotateOnDateChange(
    appointmentId: string,
    tenantId: string,
    newDate: Date,
    newTimeSlot: string | null,
    reason: 'DATE_CHANGED' | 'TIME_CHANGED',
    tx?: Prisma.TransactionClient,
  ): Promise<ConfirmationCycle>;

  // Atomically: supersede active cycle, insert new cycle immediately CONFIRMED.
  // No email triggered (tenant just acted on the portal).
  rotateOnTenantReschedule(
    appointmentId: string,
    tenantId: string,
    newDate: Date,
    newTimeSlot: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<ConfirmationCycle>;

  // Atomically: mark active cycle CONFIRMED, update appointment denorm.
  confirm(
    appointmentId: string,
    tenantId: string,
    source: 'TENANT_PORTAL' | 'OPERATOR_FORCED',
    tokenId: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<ConfirmationCycle>;

  // Atomically: mark active cycle UNAVAILABLE, update appointment denorm.
  markUnavailable(appointmentId: string, tenantId: string, tx?: Prisma.TransactionClient): Promise<ConfirmationCycle>;

  // Atomically: supersede active cycle, set appointment denorm to PENDING, clear active_confirmation_cycle_id.
  // Used when appointment goes back to DRAFT (any path).
  invalidateOnReopen(appointmentId: string, tenantId: string, tx?: Prisma.TransactionClient): Promise<void>;

  // Atomically: supersede active cycle (if any), set denorm to NO_RESPONSE, clear active_confirmation_cycle_id.
  // Used only by reject-unconfirmed worker — caller wraps both cycle invalidation + status update in one outer tx.
  invalidateOnReject(appointmentId: string, tenantId: string, tx?: Prisma.TransactionClient): Promise<void>;

  // Insert first PENDING cycle OR link existing cycle to new token.
  // Called by GeneratePortalTokenUseCase inside the outer tx that also runs MintPortalTokenService.
  // See "createInitial behavior table" below for full semantics.
  createInitial(
    appointmentId: string,
    tenantId: string,
    scheduledDate: Date,
    timeSlot: string | null,
    tokenId: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<ConfirmationCycle>;
}
```

**`createInitial` behavior by existing-cycle state** (resolves M1 from Crítico review):

| Existing active cycle | New mint behavior |
|----------------------|-------------------|
| None (`active_confirmation_cycle_id IS NULL`) | Create new PENDING cycle with `cycle_number = MAX + 1`; set token's `confirmation_cycle_id`; set appointment's `active_confirmation_cycle_id`. |
| `PENDING` with matching `(scheduledDate, timeSlot)` | No new cycle. Link the new token to the existing cycle via `confirmation_cycle_id`. Cycle's `portal_token_id` updates to the newest token. |
| `PENDING` with different `(scheduledDate, timeSlot)` | **Programmer error** — `update-appointment` must call `rotateOnDateChange` FIRST to supersede the stale PENDING cycle, then mint creates the new cycle. Service throws `ConfirmationCycleStateError` ("createInitial called with mismatched cycle"). |
| `CONFIRMED` | No new cycle. Operator is re-sending the link to an already-confirmed appointment (legitimate, e.g., resend for tenant convenience). Token links to existing CONFIRMED cycle. Cycle status unchanged. |
| `UNAVAILABLE` | No new cycle. Operator is re-sending link to a tenant who reported unavailability (to give them another chance to rebook). Token links to existing UNAVAILABLE cycle. Cycle status unchanged — only the tenant's next action (confirm via portal, reschedule, or report unavailability again) creates a new cycle event. |

Note: `SUPERSEDED` is never an "existing active cycle" because `active_confirmation_cycle_id` is cleared when a cycle becomes `SUPERSEDED`.

**Atomicity:** every method wraps cycle insert/update + appointment update in a single Prisma `$transaction` when called without `tx`. When called with `tx`, the service participates in the caller's outer transaction. This is the canonical pattern in the codebase (no DB triggers anywhere in the schema).

**Concurrency safety net:** a partial unique index `UNIQUE (appointment_id) WHERE status != 'SUPERSEDED'` on `appointment_confirmation_cycles` prevents two concurrent `createInitial`/`rotate*` calls from creating two active cycles for the same appointment. The service handles `P2002` (Prisma unique-violation) by re-reading the active cycle and retrying once. After the retry, the second caller observes the cycle created by the first and proceeds via the "link to existing cycle" branch (per the `createInitial` behavior table below).

**Audit:** every cycle mutation emits a single audit log entry via the existing shared `AuditService` with `entityType: 'AppointmentConfirmationCycle'`. The composite audit entry already emitted by use cases (e.g., `appointment.rescheduled`) is **kept** — the cycle audit is additive, not replacing.

---

## 7. Portal Token Changes

### 7.1 Encrypted raw token storage

On token generation in `MintPortalTokenService`:
1. Generate raw token (existing `crypto.randomBytes(32).toString('hex')`).
2. Compute SHA-256 hash (existing).
3. Encrypt raw token with `Aes256GcmService` using `PORTAL_TOKEN_ENC_KEY`. Store in `raw_token_encrypted`.
4. Save token row with both `token_hash` and `raw_token_encrypted`.

### 7.2 New endpoint: Copy Portal Link

```
GET /v1/appointments/:id/portal-link
Authorization: AM and OP roles
Tenant scope: AM cross-tenant; OP tenant-scoped (mirrors `generate-portal-token.use-case.ts:38` —
              `const tenantIdForQuery = actor.role === 'AM' ? null : actor.tenantId;`
              per CORRECTION-001 2026-04-13).
Rate limit: existing default
```

**Success response (200):**
```json
{
  "portalUrl": "https://app.properfy.com/tenant-portal/<rawToken>",
  "expiresAt": "2026-05-31T09:00:00Z"
}
```

The actual host comes from `TENANT_PORTAL_BASE_URL`; the path is the canonical `/tenant-portal/:token` route registered in `apps/web/src/app/router.tsx:101`. Full pattern: `${TENANT_PORTAL_BASE_URL}/tenant-portal/${rawToken}`.

**Error responses:**
- `404 NO_ACTIVE_PORTAL_TOKEN` — no `ACTIVE` token (or all are `EXPIRED`/`REVOKED`). UI surfaces tooltip on disabled button.
- `404 APPOINTMENT_NOT_FOUND` — appointment does not exist or out of tenant scope.
- `409 PORTAL_TOKEN_NOT_DECRYPTABLE` — token row exists but `raw_token_encrypted` is `NULL` (pre-existing token minted before this feature). UI surfaces tooltip suggesting "Send Portal Link to generate a fresh link".

**Behaviour:**
- Reads `ACTIVE` token for the appointment via existing `findActiveByAppointmentId`.
- Decrypts `raw_token_encrypted` via `ITokenEncrypter` port (concrete impl backed by shared `Aes256GcmService`).
- Constructs full URL as `${TENANT_PORTAL_BASE_URL}/tenant-portal/${rawToken}` — matches the canonical router path at `apps/web/src/app/router.tsx:101` (`/tenant-portal/:token`) and the existing inline construction in `AppointmentDetailPage.tsx`.
- Does **not** generate a new token. Does **not** revoke anything. Does **not** mark `used_at` (per GAP-003 single-use semantics — the GET endpoint is a pure read and does not consume the token's single-use credit).
- Does **not** record a `tenant_portal_activities` row (the renter has not acted; the operator is the actor).
- Emits one audit entry `tenant_portal.link_copied` with `entityType: 'Appointment'`, `actorType: 'USER'`, `actorId: actor.userId`, metadata `{ tokenId, expiresAt }`.

### 7.3 Token validity with cycles

`portal-token-middleware.ts` gains an additional check after token entity resolution:

- If `tokenEntity.confirmationCycleId` is not null AND that cycle's status is `SUPERSEDED`, respond with `410 PORTAL_TOKEN_REVOKED` (same error code as existing `REVOKED` branch). The link is semantically expired even if the token row's status is technically `ACTIVE`.

This guards against operators using the Copy Link feature to copy a link, then the cycle being superseded before the tenant clicks, and the tenant landing on a stale portal.

---

## 8. Use Case Changes

### `confirm-appointment.use-case.ts` (tenant-portal)
- Replace direct `appointmentRepo.update({ tenantConfirmationStatus: 'CONFIRMED' })` with `ConfirmationCycleService.confirm(appointmentId, tenantId, 'TENANT_PORTAL', tokenId)`.
- All other side effects (restrictions, activity, token used_at, audit, notification handler, domain event) unchanged.

### `reschedule-request.use-case.ts` (tenant-portal)
- Replace inner call to `ReopenForRescheduleUseCase` (which today resets denorm to `PENDING`) with `ConfirmationCycleService.rotateOnTenantReschedule()`.
- `ReopenForRescheduleUseCase` itself remains in place for operator/CL_ADMIN flows; it gets refactored separately (see below).
- All other side effects (date update, restrictions, audit, notification, domain event, auto-mint new token) unchanged.

### `report-unavailability.use-case.ts` (tenant-portal)
- Replace direct `appointmentRepo.update({ tenantConfirmationStatus: 'UNAVAILABLE' })` with `ConfirmationCycleService.markUnavailable()`.
- **Preserves FR-060 late emergency exception**: when token is EXPIRED (`isReadOnly = true`), the use case still allows UNAVAILABLE and flags `urgentMode = true`. The cycle service does NOT block based on token state — token-state guards remain in the use case, not in the cycle service. Cycle status transitions `PENDING → UNAVAILABLE` and `CONFIRMED → UNAVAILABLE` are both legal.
- Other side effects unchanged (urgentMode notifications, audit, activity, domain event).

### `force-manual-confirmation.use-case.ts` (appointment)
- Replace direct `appointmentRepo.update({ tenantConfirmationStatus: 'CONFIRMED' })` with `ConfirmationCycleService.confirm(appointmentId, tenantId, 'OPERATOR_FORCED', null)`.
- Audit entry unchanged.

### `generate-portal-token.use-case.ts` (tenant-portal)
- After `MintPortalTokenService.mint()` returns the new token, call `ConfirmationCycleService.createInitial()` if no active cycle exists for the appointment. The newly created cycle's `portal_token_id` references the new token, and the token's `confirmation_cycle_id` references the cycle (bidirectional FK set in same transaction).
- If an active cycle already exists (e.g., operator re-sending the link without date change), no new cycle is created — the token's `confirmation_cycle_id` is set to the existing active cycle id.
- The token row is created with `raw_token_encrypted` populated.

### `update-appointment.use-case.ts` (appointment) — **NO CHANGE in this PR**

Per Planejador round 1 finding: the use case's editability gate (`appointment.isEditable()` → only DRAFT/AWAITING_INSPECTOR pass) blocks SCHEDULED date/time edits from reaching the cycle layer. `bulk-edit-appointments` and `bulk-reschedule-appointments` enforce the same guard. The only path for changing a SCHEDULED appointment's date is `reopen-for-reschedule`, which already lands in DRAFT and triggers `ConfirmationCycleService.invalidateOnReopen()` via the canonical reopen flow.

This use case is **not modified** in this PR. The `ConfirmationCycleService.rotateOnDateChange()` method exists in the service interface as defensive infrastructure, but no caller invokes it.

### `reopen-for-reschedule.use-case.ts` (appointment)
- Replace direct `appointmentRepo.update({ ..., tenantConfirmationStatus: 'PENDING' })` with two calls in the same transaction:
  1. `ConfirmationCycleService.invalidateOnReopen()` — supersedes active cycle, sets denorm to `PENDING`, clears `active_confirmation_cycle_id`.
  2. `appointmentRepo.update()` for the remaining fields (`status`, `scheduledDate`, `timeSlot`, `inspectorId`, `reason`).
- Token revocation (existing) unchanged.

### `execute-status-transition.use-case.ts` (appointment)
- When target status is `DRAFT` (any source status), call `ConfirmationCycleService.invalidateOnReopen()` after the status transition. Idempotent if no active cycle exists.
- When target status is `SCHEDULED`, **do not** create a cycle here — `createInitial` is called by `GeneratePortalTokenUseCase` after the token is minted. This keeps the cycle ⇔ token linkage atomic at mint time. If a `SCHEDULED` transition happens without a token mint (legacy or edge case), no cycle is created until the first portal-token generation.
- Read path: gating logic `appointment.tenantConfirmationStatus !== 'CONFIRMED'` continues reading the denorm column — unchanged.

### `create-appointment.use-case.ts` (appointment)
- Initial `tenantConfirmationStatus: 'PENDING'` write at appointment creation remains (denorm default).
- No cycle row is created at appointment creation — cycles only exist for appointments that have been `SCHEDULED` and had a token minted.

### `reject-unconfirmed-appointments.use-case.ts` (worker entry)
- **Open an outer `prisma.$transaction(async tx => { ... })`** wrapping both writes (resolves Planejador risk on worker atomicity):
  1. `ConfirmationCycleService.invalidateOnReject(appointmentId, tenantId, tx)` — supersedes the active cycle and sets denorm to `NO_RESPONSE`.
  2. `appointmentRepo.update(tx, appointmentId, tenantId, { status: 'REJECTED', reason, rejectionReasonCode, serviceGroupId: null })` — without `tenantConfirmationStatus` in the payload (the cycle service owns that write).
- Per-appointment errors continue to be caught and reported per the existing loop; one failing appointment's tx rollback does not abort the worker run.

---

## 9. Worker Changes

### `reject-unconfirmed` (09:00 UTC daily, registered in `main/workers.ts`)
- Calls `ConfirmationCycleService.invalidateOnReject()` per appointment before status change. See use case above.

### `dispatch-escalations` (08:00 UTC, D-2)
- No change — reads `appointment.tenant_confirmation_status` (denorm).

### `dispatch-reminders` (08:00 UTC, D-7/D-5/D-3)
- No change — reads `appointment.tenant_confirmation_status` (denorm).

### `expire-tokens` (tenant-portal)
- No change.

---

## 10. Frontend Changes

### Appointment detail — `Send Portal Link` and `Copy Portal Link`

Location: `apps/web/src/features/appointments/pages/AppointmentDetailPage.tsx`, inside the existing action area (`<div className="flex items-center gap-2">` around lines 221–280).

Two buttons (both visible to AM and OP only via existing `isPrivileged` flag):

| Button | API call | Side effects | Toast |
|--------|----------|--------------|-------|
| **Send Portal Link** | `POST /v1/appointments/:id/portal-token` | Mint new token (revokes previous), enqueue `TENANT_PORTAL_LINK` email + SMS to primary contact | Success: `"Email sent to tenant"`. Error: existing error toast. |
| **Copy Portal Link** | `GET /v1/appointments/:id/portal-link` (new) | None server-side. Client copies returned `portalUrl` to clipboard via `navigator.clipboard.writeText`. | Success: `"Link copied"`. `409 PORTAL_TOKEN_NOT_DECRYPTABLE`: tooltip `"Send Portal Link to generate a fresh link"`. |

**Pre-click signal for Copy button** (resolves Planejador UX risk): `GET /v1/appointments/:id` response gains a `hasActivePortalToken: boolean` field derived from `findActiveByAppointmentId IS NOT NULL`. The frontend uses this preloaded signal to render the Copy button in a disabled state with tooltip `"No active portal link — send one first"` when `hasActivePortalToken === false`. The Copy endpoint is fired only when the button is enabled, so 404 NO_ACTIVE_PORTAL_TOKEN becomes a rare race-condition path (token expired between page load and click), handled by the same tooltip text via error toast.

**`Send Portal Link` rework:**
- Remove the existing dialog (`<Dialog>` modal at lines 375–419) and inline clipboard copy on click.
- Replace with a simple success toast (`useSnackbar.showSuccess('Email sent to tenant')`).
- `as never` workaround on the API call remains until openapi-fetch path-param form is adopted project-wide.

Both buttons share the existing visibility predicate (`canSendPortalLink`): `isPrivileged && status not in DONE/CANCELLED/REJECTED`.

### OpenAPI type regeneration
- After backend route registration, regenerate `packages/shared/openapi.json` (existing Fastify auto-generation).
- Run `pnpm --filter @properfy/shared generate:types` to refresh `api-types.ts`.
- Rebuild `@properfy/shared` (`pnpm --filter @properfy/shared build`).

---

## 11. Key Decisions

| # | Decision | Rationale | Locked by Pedro on 2026-05-26 |
|---|----------|-----------|-------------------------------|
| 1 | ~~Date/timeSlot change rotates cycle + auto-resends email~~ **REVERSED (Planejador round 1)**: cycle invalidation flows through `reopen-for-reschedule` only. `update-appointment` is unchanged in this PR — the editability gate blocks SCHEDULED date/time edits from reaching this use case today. `rotateOnDateChange()` ships as defensive infrastructure with no caller. | ✅ |
| 2 | `Send Portal Link` = email only; `Copy Portal Link` = clipboard only | Clean separation. Current combined behaviour is confusing UX. | ✅ |
| 3 | `ConfirmationCycleService.invalidateOnReopen()` is called from BOTH `execute-status-transition` AND `reopen-for-reschedule` | Defensive and uniform; avoids stale cycle leaking via raw state-machine reopens. Idempotent if no active cycle exists. | ✅ |
| 4 | Speckit folder: `specs/028-tenant-confirmation-cycles/` | Canonical structure. Brainstorming doc stays at `docs/superpowers/specs/` as design history. | ✅ |
| 5 | ~~Bulk operations fire one rotation + one email per appointment, no skip flag~~ **MOOT (Planejador round 1)**: bulk date edits are blocked at the editability gate. No bulk rotation path exists in this PR. | ✅ |
| 6 | Denorm sync via Prisma `$transaction` in `ConfirmationCycleService`, no DB triggers | Codebase has zero trigger precedent; explicit transactions are testable and discoverable. Reinforced by partial unique index as DB-level safety net for concurrent createInitial races. | ✅ |
| 7 | Separate env var `PORTAL_TOKEN_ENC_KEY`; extract shared `Aes256GcmService` from `TotpEncryptionService` | Key-per-purpose security principle. Allows independent rotation. Tenant-portal consumes it via `ITokenEncrypter` port + adapter to keep domain layer pure. | ✅ |
| 8 | `ConfirmationCycleService` lives in application layer, not domain (Planejador round 1) | Service orchestrates Prisma `$transaction` and injects `AuditService` — both infrastructure concerns per `apps/backend/CLAUDE.md` §4. Domain keeps only entity, port, errors. | ✅ |
| 9 | `GET /v1/appointments/:id/portal-link` mirrors existing tenant-scope pattern: AM cross-tenant, OP tenant-scoped (Planejador round 1) | Existing `generate-portal-token.use-case.ts:38` precedent (CORRECTION-001 2026-04-13). New endpoint must not diverge. | ✅ |
| 10 | Token↔cycle FK linkage atomicity requires `tx?: Prisma.TransactionClient` plumbing through `ITenantPortalTokenRepository`, `MintPortalTokenService` (must also return `tokenId`), and `GeneratePortalTokenUseCase` (opens outer tx) (Planejador round 1) | Current contracts do not support this; explicit additions needed. Without them, the bidirectional FK promise cannot be kept atomically. | ✅ |

---

## 11a. Audit Retention Integration (resolves M3 from Crítico review)

New entity type `AppointmentConfirmationCycle` must be registered with the audit retention framework (feature 020):

- **Retention category** to be added: `APPOINTMENT_CYCLE_HISTORY` (same retention horizon as `APPOINTMENT_LIFECYCLE` — operational record, no PII beyond what the appointment audit already exposes).
- **Redaction status**: `NONE` by default. Cycle entries contain no PII directly (token IDs, dates, status enums, reason enums).
- **Cold storage**: same policy as `APPOINTMENT_LIFECYCLE`.

A follow-up task is captured in `tasks.md` (T44) to verify `specs/020-audit-retention-pii-redaction/` covers this entity type, and if not, to amend it. This is non-blocking for shipping this feature — entries default to safe-retention until 020 is amended.

---

## 12. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Cycle ↔ denorm drift if `$transaction` is broken in a future refactor | Integration test (Testcontainers) that mutates cycle, then asserts denorm column equals cycle status. Run on every PR via CI. |
| Concurrent `createInitial`/`rotate*` calls create two non-SUPERSEDED cycles for the same appointment | Partial unique index `UNIQUE (appointment_id) WHERE status != 'SUPERSEDED'` is the DB-level safety net. Service handles `P2002` by re-reading the active cycle and retrying once. Integration test (T32b) covers two parallel createInitial calls — only one row created, second observes existing cycle and links token. |
| Existing tokens minted before this feature have `raw_token_encrypted = NULL` and cannot be copied | New endpoint returns `409 PORTAL_TOKEN_NOT_DECRYPTABLE`. UI surfaces tooltip directing operator to "Send Portal Link" to mint a fresh one. Operationally negligible — staging clears DB. |
| Encryption key rotation post-deploy | Out of scope for this feature. Tracked separately under ops/security backlog. |
| `Send Portal Link` rework removes the existing copy-from-dialog flow | Migration UX: existing operators have copy-via-dialog muscle memory. Mitigate via release notes mentioning the split. |
| `executeStatusTransition → SCHEDULED` without subsequent token mint leaves no cycle | Edge case: if someone manually transitions to `SCHEDULED` without dispatching the portal link, no cycle is created until a token is minted. Operationally rare; reject-unconfirmed worker tolerates appointments with no active cycle (no-op). |
| Token mint and cycle creation get out of sync if outer `$transaction` is broken in a future refactor | Integration test (T34 variant) asserts a simulated mid-tx failure rolls back BOTH the token insert and the cycle insert; no orphan token row remains. |

---

## 13. Open Questions for Implementation

None — all clarifications resolved by Pedro on 2026-05-26 (see §11). Plan can proceed to `/speckit.plan`.

---

## 14. Acceptance Criteria

A reviewer / QA marks this feature complete when:

1. **Migration applied** — `specs/028-tenant-confirmation-cycles/data-model.md` migrations run cleanly on staging; rollback path documented.
2. **All listed use cases** route their cycle mutations through `ConfirmationCycleService`. No direct `appointmentRepo.update({ tenantConfirmationStatus: ... })` writes remain anywhere except `create-appointment` (initial default) and the service itself.
3. **Atomicity verified** — integration test demonstrates cycle row + denorm column are written in single transaction; rollback on simulated failure leaves both untouched.
4. **`GET /v1/appointments/:id/portal-link` endpoint** returns the correct URL for an active token; returns 404/409 for the documented edge cases.
5. **Frontend split** — Send Portal Link emits email only with toast; Copy Portal Link copies only with toast; both gated to AM/OP; tooltip on disabled state.
6. **Token middleware** rejects tokens whose cycle is `SUPERSEDED` with `410 PORTAL_TOKEN_REVOKED`.
7. **Worker `reject-unconfirmed`** routes through `ConfirmationCycleService.invalidateOnReject()`; existing tests pass with adjusted expectations (cycle write + denorm write).
8. **`update-appointment` date-change** triggers cycle rotation + token revoke + auto-resend on SCHEDULED appointments; existing unit tests covering date-change updated to assert new side effects.
9. **Coverage** — backend unit + integration coverage on `appointment` and `tenant-portal` modules ≥ 80% per CLAUDE.md §11.
10. **Lint, typecheck, tests, build, Prisma migration dry-run** all green in CI.

---

## 15. Cross-Reference Index

| Concept | Source-of-truth file |
|---------|---------------------|
| Brainstorming history | `docs/superpowers/specs/2026-05-26-tenant-confirmation-cycles-design.md` |
| Tenant portal canonical rules | `specs/007-tenant-portal/spec.md` (FR-001 to FR-072, GAP-001 to GAP-010) |
| Project state machine | `CLAUDE.md` §5; `apps/backend/CLAUDE.md` §8 |
| Service type confirmation rules | `apps/backend/CLAUDE.md` §8: Routine requires confirmation; Ingoing/Outgoing do not |
| RBAC scope (AM/OP cross-tenant) | `CLAUDE.md` §6; Constitution v1.3.0 (memory `project_op_role_constitution_v13`) |
| Prisma schema | `apps/backend/prisma/schema.prisma` (Appointment lines 460–520; TenantPortalToken lines 912–930; TenantConfirmationStatus enum lines 95–100) |
| State machine | `apps/backend/src/modules/appointment/domain/appointment-state-machine.ts` |
| Existing AES helper | `apps/backend/src/modules/auth/infrastructure/totp-encryption.service.ts` |
| Existing token mint | `apps/backend/src/modules/tenant-portal/domain/mint-portal-token.service.ts` |
| Portal URL env var | `apps/backend/src/main/env.ts` line 62 (`TENANT_PORTAL_BASE_URL`) |
| Worker registration | `apps/backend/src/main/workers.ts` lines 212–225 |
| DI container | `apps/backend/src/main/container.ts` |
| Frontend appointment detail | `apps/web/src/features/appointments/pages/AppointmentDetailPage.tsx` lines 221–280, 375–419 |
| Shared types | `packages/shared/src/api-types.ts` (auto-generated) |
