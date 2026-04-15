# Implementation Plan: 007-tenant-portal (Feature 021 Contact Integration Delta)

**Branch**: `007-tenant-portal` | **Date**: 2026-04-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature 021 architectural revision (dual-write semantics for portal contact update) on top of existing IMPLEMENTED Phase 1.
**Dependencies**: Feature 021-contacts (IMPLEMENTED), Feature 006-appointments (IMPLEMENTED — junction + snapshot pattern)

> **Scope boundary**: this plan covers ONLY the delta introduced by the 021 architectural revision. The core portal lifecycle (token generation, confirm, reschedule, unavailability, activities, rate limiting, DST handling) is already implemented and tested. This plan does NOT rewrite the portal — it validates and completes the 021 integration.

## Summary

Feature 007's Phase 1 is already shipped and working. The 021 contact registry introduction created a single new requirement: **FR-053** (dual-write on portal contact update). This dual-write is already **implemented in the code** during the 021 closeout — the `UpdateContactUseCase` now writes to both the appointment snapshot and the contact registry, with conflict handling and audit.

**What this plan actually delivers:**

| Item | Nature | Backend | Frontend |
|---|---|---|---|
| **FR-053 validation** | Verify the dual-write works correctly end-to-end | ✅ Integration tests | — |
| **Portal GET data — effective fields** | `get-portal-data.use-case.ts` still reads legacy fields | ✅ Field rename | — |
| **Token generation — contacts[] source** | Already uses `effective*` accessors | ✅ Verify only | — |
| **Portal frontend — contact display** | Show `effective*` contact data in the renter UI | — | ✅ Minor field rename |

**What is already done (no work needed):**
- Dual-write implementation in `UpdateContactUseCase` (done in 021 closeout)
- `IContactRepository` wired as constructor dependency (done in 021 closeout)
- `ContactEmailAlreadyExistsError` conflict handling (done in 021 closeout)
- `contact.portal_update_skipped_conflict` audit action (done in 021 closeout)
- Token generation uses `effectiveEmail`/`effectivePhone`/`effectiveName` (done in 021)
- Snapshot + registry update via `updateContactSnapshot` + `contactRepo.update` (done in 021)
- All existing portal tests pass (175 unit tests, 8 integration tests — verified)

**What still needs work:**
1. `GetPortalDataUseCase` reads `contact.tenantName`/`contact.primaryEmail` (legacy fields) instead of `effective*` accessors — needs field rename
2. Integration tests for the dual-write path (conflict handling, legacy rows, snapshot immutability on other appointments)
3. Portal frontend contact section — read from effective fields in the API response
4. Verify the portal UPDATE endpoint correctly finds the primary junction row (not just `contact` singular)

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 + Fastify (backend), React 18.3 + Vite (web portal)
**Primary Dependencies**: Prisma ORM, Zod, shared AuditService, feature 021 `IContactRepository` (already wired), feature 006 `IAppointmentRepository` with junction-aware methods
**Storage**: PostgreSQL (Supabase) — no schema changes needed (021 migration covers everything)
**Testing**: Vitest (unit + integration)
**Performance Goals**: Portal GET p95 < 200 ms (unchanged)

### Implemented Reality vs Approved Target

| Aspect | Current Code | Target (this plan) |
|---|---|---|
| `UpdateContactUseCase` dual-write | ✅ Already writes to snapshot + registry with conflict handling | Verify via integration tests |
| `GetPortalDataUseCase` contact fields | ❌ Reads `contact.tenantName`, `contact.primaryEmail`, `contact.secondaryEmail`, `contact.primaryPhone`, `contact.secondaryPhone` (legacy field names) | Use `contact.effectiveName`, `contact.effectiveEmail`, `contact.effectivePhone` |
| `GeneratePortalTokenUseCase` contact fields | ✅ Already uses `contact.effectiveName`, `contact.effectiveEmail`, `contact.effectivePhone` | No change needed |
| Token scoping | ✅ Bound to `appointment_id` — junction row replacement does not invalidate | Verify via test |
| Portal frontend contact display | Reads `contactName`, `contactEmail`, `contactPhone` from API response | Should work after backend field rename — verify |

### What 007 owns vs what 021/006 already provide

| Responsibility | Owner | Status |
|---|---|---|
| Contact registry CRUD | 021 | ✅ Done |
| Junction + snapshot schema | 021 | ✅ Done |
| `IContactRepository` port + Prisma adapter | 021 | ✅ Done |
| `updateContactSnapshot()` on `IAppointmentRepository` | 021 | ✅ Done |
| Dual-write in `UpdateContactUseCase` | 021 (implemented in 007's use case) | ✅ Done |
| Conflict handling + audit | 021 (implemented in 007's use case) | ✅ Done |
| Portal GET response — effective contact fields | **007** | ❌ Needs fix |
| Portal contact update — finding primary junction row | **007** | ✅ Already works (reads `result.contact` which is the first/primary from repo) |
| Integration tests for dual-write path | **007** | ❌ Needs new tests |
| Portal frontend — display correct fields | **007** | ⚠️ Verify after backend fix |

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| **I. Clean Architecture** | ✅ | `UpdateContactUseCase` accesses `IContactRepository` via DI port, not direct Prisma import |
| **II. Multi-Tenant Safety** | ✅ | Contact registry update is scoped to `appointment.tenantId`. Uniqueness check uses `existsByEmail(tenantId, ...)` |
| **III. TDD** | ✅ | Plan includes targeted integration tests for dual-write, conflict, and legacy-row paths |
| **IV. Contract-First** | ✅ | Portal response shape change is a field rename, not a structural change |
| **V. Simplicity** | ✅ | The delta is minimal — most work was already done in 021 |
| **Audit** | ✅ | `contact.portal_update_skipped_conflict` already emitted. `tenant_portal.contact_updated` already emitted. |

## Project Structure

### Source Code Changes

```text
# BACKEND — minimal revisions
apps/backend/src/modules/tenant-portal/
├── application/use-cases/
│   └── get-portal-data.use-case.ts        # Field rename: legacy → effective*
└── (update-contact.use-case.ts)           # No change needed — dual-write already implemented

# TESTS — new integration tests
apps/backend/tests/integration/tenant-portal/
└── portal-contact-dual-write.test.ts      # NEW — FR-053 integration tests

# FRONTEND — verify/fix field reads
apps/web/src/features/tenant-portal/
└── (components reading contact fields)    # Verify effective field names
```

## Execution Strategy

### Phase 1 — Backend: Field Alignment + Integration Tests

**Small and focused. No structural changes — just field renames and test coverage.**

| Step | What | Depends On |
|---|---|---|
| 1.1 | Revise `GetPortalDataUseCase` — replace `contact.tenantName` → `contact.effectiveName`, `contact.primaryEmail` → `contact.effectiveEmail`, `contact.primaryPhone` → `contact.effectivePhone`, `contact.secondaryEmail` → `contact.secondaryEmail` (legacy, no effective accessor). Drop `secondaryPhone` from portal response or keep as legacy fallback. | — |
| 1.2 | Verify `UpdateContactUseCase` dual-write path by reading the code — confirm: (a) writes to snapshot fields, (b) writes to registry when `contact_id IS NOT NULL`, (c) skips registry on email conflict, (d) emits `contact.portal_update_skipped_conflict` audit. No code change expected. | — |
| 1.3 | Write integration test for portal dual-write in `apps/backend/tests/integration/tenant-portal/portal-contact-dual-write.test.ts` — (a) portal update updates snapshot, (b) portal update updates registry when `contact_id` present, (c) email conflict → snapshot updates, registry skipped, audit written, (d) legacy junction row (`contact_id = NULL`) → only snapshot updated, (e) existing appointment for same contact in a different appointment retains OLD snapshot (snapshot immutability). Minimum 5 cases. | 1.1 |
| 1.4 | Verify token behavior: token is bound to `appointment_id`, not junction row. Test: update contact via portal → token still works for subsequent GET. | 1.3 |
| 1.5 | Run existing portal test suite — all 175 unit + 8 integration tests must still pass | 1.1 |

**Checkpoint**: `pnpm typecheck && pnpm --filter backend test` green. Portal GET returns effective contact fields. Dual-write integration tests pass.

### Phase 2 — Frontend: Verify Contact Display

**Trivial — the portal frontend reads from the API response. After the backend fix, verify the response shape matches what the UI expects.**

| Step | What | Depends On |
|---|---|---|
| 2.1 | Verify portal frontend components read `contactName`, `contactEmail`, `contactPhone` from the API response (these are the serialized field names from the use case output). If the field names changed in the backend, update the frontend reads. | Phase 1 |
| 2.2 | Run frontend portal tests | 2.1 |

**Checkpoint**: Portal loads correctly. Renter sees updated contact info.

### Phase 3 — Verification

| Step | What |
|---|---|
| 3.1 | `pnpm typecheck` all workspaces |
| 3.2 | `pnpm --filter backend test` — all pass |
| 3.3 | `pnpm --filter web test` — all pass |
| 3.4 | Verify no new Prisma migration needed |

## Testing Strategy

### Unit Tests (existing — verify pass)

| Subject | Location | Expected |
|---|---|---|
| `UpdateContactUseCase` | `tests/unit/tenant-portal/update-contact.use-case.test.ts` | 10 tests pass (already verified in 021 closeout) |
| Gap tests (domain events, token replay) | `tests/unit/tenant-portal/gap-002-003-004.test.ts` | Pass (mocks already updated in 021) |

### Integration Tests (new)

| Subject | Location | Cases |
|---|---|---|
| Portal dual-write (FR-053) | `tests/integration/tenant-portal/portal-contact-dual-write.test.ts` | (a) snapshot updated, (b) registry updated when contact_id present, (c) email conflict → snapshot updates + registry skipped + audit, (d) legacy row → snapshot only, (e) other appointment snapshot unchanged |
| Token survives contact update | Same or existing portal test file | Token GET after contact update → still works |

### What we're NOT testing (already covered)

- Token generation, confirm, reschedule, unavailability — all already have exhaustive tests from Phase 1
- Contact registry CRUD — tested in 021's integration suite
- Junction + snapshot creation — tested in 006's integration suite

## Residual Risks & Assumptions

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `GetPortalDataUseCase` field rename breaks frontend | Low | The API response serializes with the same key names. If keys change, it's a find-and-replace in the portal React component. |
| `secondaryEmail`/`secondaryPhone` legacy fields in portal response | Low | These are expand-phase legacy fields. Keep them in the response for now. They'll be dropped with the column drop migration. |
| Dual-write already implemented but no integration test | Medium | This plan adds the integration test to close the gap. |

### Assumptions

1. **021 is done and stable**. The dual-write code in `UpdateContactUseCase` is already working (verified by unit tests + 021 typecheck/test pass).
2. **006 junction pattern is stable**. `appointment_contacts` has `contact_id`, `snapshot_*` fields, `effective*` accessors. All working.
3. **No schema changes needed**. 021's migration covers everything. No new Prisma migration for this plan.
4. **Portal frontend is small**. The renter-facing portal is a simple React page. Contact fields are displayed from the API response — a backend field rename propagates automatically if key names are preserved.
5. **Token semantics are unchanged**. Token is bound to `appointment_id`. Junction row changes don't affect tokens. This was verified in spec analysis and 021 implementation.

### Scope Fences

| What | Why |
|---|---|
| Contact registry CRUD endpoints | Feature 021 scope — done |
| Appointment creation with contacts[] | Feature 006 scope — done |
| Notification fan-out to all contacts | 006#GAP-011 — deferred |
| Portal token per secondary contact | Spec explicitly excludes: "Separate per-contact tokens are out of scope" |
| Column drop on `appointment_contacts` | Expand/contract — separate migration |
| Portal redesign / multi-contact display in portal | Not in scope — portal shows primary contact only |
