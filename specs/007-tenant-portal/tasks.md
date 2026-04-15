# Tasks: 007-tenant-portal (Feature 021 Contact Integration Delta)

**Input**: `specs/007-tenant-portal/spec.md`, `plan.md`
**Prerequisites**: Feature 021-contacts IMPLEMENTED. Feature 006-appointments IMPLEMENTED (junction + snapshot). plan.md rewritten 2026-04-12.
**Tests**: Mandatory — TDD per constitution Principle III.

**Scope**: ONLY the delta from the 021 architectural revision. The core portal lifecycle (token generation, confirm, reschedule, unavailability, activities, rate limiting, DST) is already shipped with exhaustive tests (175 unit + 8 integration). This file tracks the contact integration delta, not the full portal module.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: Maps to US5 (contact update) from spec.md
- Exact file paths included

---

## Phase 1: Backend — Field Alignment + Dual-Write Verification

**Purpose**: Fix the one use case still reading legacy contact fields. Add integration tests for the dual-write path that was implemented in 021 but lacks dedicated test coverage in the portal context.

**Critical path**: Phase 2 depends on Phase 1 completion.

### Field alignment

- [x] T001 [US5] Revise **two use cases** to read effective accessors instead of legacy fields:
  **(a) `get-portal-data.use-case.ts`** (portal GET response): change `contact.tenantName` → `contact.effectiveName`, `contact.primaryEmail` → `contact.effectiveEmail`, `contact.primaryPhone` → `contact.effectivePhone`. Keep serialized key names unchanged (`tenantName`, `primaryEmail`, `primaryPhone`) so the API response shape doesn't break frontend consumers. Keep `contact.secondaryEmail` and `contact.secondaryPhone` as-is (legacy, no effective accessor).
  **(b) `update-contact.use-case.ts`** (portal UPDATE return value, lines ~196-212): the return statement has fallback reads like `contact?.tenantName ?? null` and `contact?.primaryEmail ?? null` for fields the renter did NOT update. Change these fallbacks to: `contact?.effectiveName ?? null`, `contact?.effectiveEmail ?? null`, `contact?.effectivePhone ?? null`. The input-derived branches (`input.contact.primaryEmail !== undefined ? input.contact.primaryEmail : ...`) are correct and don't change — only the else-branch fallback reads need the fix. Keep `secondaryEmail`/`secondaryPhone` fallbacks as-is (legacy).

### Dual-write code verification (no code change expected)

- [x] T002 [US5] **VERIFY ONLY** — Read `apps/backend/src/modules/tenant-portal/application/use-cases/update-contact.use-case.ts` and confirm the following are all present: (a) step 5 writes legacy fields via `appointmentRepo.updateContact()`, (b) step 5b writes snapshot fields via `appointmentRepo.updateContactSnapshot()`, (c) step 5c writes to contact registry via `contactRepo.update()` when `contact.contactId IS NOT NULL`, (d) on `ContactEmailAlreadyExistsError`, the registry write is skipped silently and `contact.portal_update_skipped_conflict` audit is emitted, (e) when `contact_id IS NULL` (legacy row), only steps 5 + 5b execute (no registry write attempted). If any of these are missing → fix. If all present → mark as verified, no code change.

- [x] T003 [US5] **VERIFY ONLY** — Read `apps/backend/src/modules/tenant-portal/application/use-cases/generate-portal-token.use-case.ts` and confirm it already uses `result.contact.effectiveName`, `result.contact.effectiveEmail`, `result.contact.effectivePhone` for notification recipient resolution. This was done in 021 Phase 3 — verify it's still correct. No code change expected.

### Integration tests (NEW)

- [x] T004 [US5] Write route-level test (mock container pattern, matching existing `tenant-portal.routes.test.ts` structure) for portal dual-write in `apps/backend/tests/integration/tenant-portal/portal-contact-dual-write.test.ts`. Cases:
  - (a) **Snapshot updated**: mock `findById` returns appointment with contact that has `contact_id = 'c1'`. Call `updateContact` with new `primaryEmail`. Assert `updateContactSnapshot` was called with new `snapshotEmail`.
  - (b) **Registry updated**: same setup. Assert `contactRepo.update` was called with the new `primaryEmail`.
  - (c) **Email conflict → registry skipped**: mock `contactRepo.existsByEmail` to return `true` (conflict). Call update. Assert `updateContactSnapshot` was still called (snapshot updates). Assert `contactRepo.update` was NOT called. Assert audit `contact.portal_update_skipped_conflict` was emitted.
  - (d) **Legacy row (contact_id = NULL)**: mock `findById` returns contact with `contactId = null`. Call update. Assert `updateContactSnapshot` was called. Assert `contactRepo.update` was NOT called (no registry write for legacy rows).
  - (e) **Token survives contact update**: call `updateContact`, then call the portal GET. Assert GET still returns 200 (token not invalidated by contact change).
  Minimum 5 cases.

- [x] T005 [P] [US5] Write route-level test for snapshot immutability across appointments in `apps/backend/tests/integration/tenant-portal/portal-contact-snapshot-immutability.test.ts` — **Note**: this tests the 021 snapshot immutability invariant in the portal context, not a portal-only flow. The portal only touches appointment A's snapshot; B's snapshot is structurally untouched by design. Setup: two appointments (A and B) linked to the same registry contact. Update contact via portal for appointment A. Assert: (a) appointment A's snapshot is updated, (b) appointment B's snapshot is unchanged (frozen at link time), (c) the registry contact reflects the new value. Minimum 2 cases.

### Existing test suite verification

- [x] T006 Run existing portal unit tests: `pnpm --filter backend test tests/unit/tenant-portal/` — must pass (175 tests). This verifies no regression from T001.

- [x] T007 Run existing portal integration tests: `pnpm --filter backend test tests/integration/tenant-portal/` — must pass (8+ tests). This verifies existing portal flows still work after the field rename.

**Checkpoint**: `pnpm typecheck && pnpm --filter backend test` green. Portal GET returns effective contact data under the same serialized key names. Dual-write integration tests pass. Existing 175 + 8 tests pass.

---

## Phase 2: Frontend — Verify Contact Display

**Purpose**: Confirm the portal frontend React components still render correctly after the backend field alignment. Since T001 preserves the serialized key names (`tenantName`, `primaryEmail`, etc.), zero frontend changes are expected.

- [x] T008 [US5] **VERIFY ONLY** — Read `apps/web/src/features/tenant-portal/components/ContactForm.tsx` and confirm it reads `contact.tenantName`, `contact.primaryEmail`, `contact.secondaryEmail`, `contact.primaryPhone`, `contact.secondaryPhone` from the API response. Since T001 preserves these key names (only the backend source accessor changed, not the serialized key), no frontend code change is expected. If key names DID change → update the component. Mark as verified.

- [x] T009 [US5] **VERIFY ONLY** — Read `apps/web/src/features/tenant-portal/pages/PortalPage.tsx` and verify the portal data response is consumed correctly. Check that the contact section displays `tenantName`, `primaryEmail`, `primaryPhone`. No change expected.

- [x] T010 Run frontend portal tests: `pnpm --filter web test -- src/features/tenant-portal/` — must pass. This verifies the portal UI still renders correctly.

**Checkpoint**: Portal frontend passes all tests. Renter sees correct contact info. Zero frontend changes needed (verified).

---

## Phase 3: Verification

**Purpose**: Full-suite verification across all workspaces.

- [x] T011 Run `pnpm typecheck` across all workspaces — must pass
- [x] T012 Run `pnpm --filter backend test` — all tests pass (including new dual-write tests from T004-T005)
- [x] T013 Run `pnpm --filter web test` — all tests pass
- [x] T014 Verify no new Prisma migration needed — `npx prisma validate` clean. No schema changes in this round (021 migration covers all).
- [x] T015 Grep for remaining legacy field reads in portal use cases: `grep -rn 'contact\.tenantName\|contact\.primaryEmail\|contact\.primaryPhone' apps/backend/src/modules/tenant-portal/application/` — should return zero hits in `get-portal-data.use-case.ts` (only `effective*` accessors). Legacy reads in `update-contact.use-case.ts` are acceptable (they write to legacy columns during expand phase). Non-portal files are out of scope.

**Checkpoint**: Feature 007 contact integration delta complete. All verifications pass.

---

## Residual Notes

### What is NOT in this task list

- **Contact registry CRUD** — feature 021 scope, done
- **Appointment creation with contacts[]** — feature 006 scope, done
- **Dual-write implementation** — already implemented in 021 closeout, only verified here
- **Column drop** on `appointment_contacts` — expand/contract, separate migration later
- **Notification fan-out** to all contacts — 006#GAP-011, deferred
- **Portal token per secondary contact** — explicitly excluded in spec
- **Portal redesign / multi-contact display** — portal shows primary contact only
- **Portal confirm / reschedule / unavailability** — already implemented and tested in Phase 1

### Classification of work

| Task | Nature | Code change? |
|---|---|---|
| T001 | Field rename (legacy → effective accessor) | ✅ Yes — ~5 lines |
| T002 | Code verification (dual-write) | ❌ Read-only verification |
| T003 | Code verification (token gen) | ❌ Read-only verification |
| T004 | New integration test | ✅ Yes — new test file |
| T005 | New integration test | ✅ Yes — new test file |
| T006-T007 | Run existing tests | ❌ Execution only |
| T008-T009 | Frontend verification | ❌ Read-only verification (likely zero changes) |
| T010-T015 | Verification suite | ❌ Execution only |

**Summary**: 2 tasks produce new code (T001 field rename, T004-T005 tests). 3 tasks are read-only verification. 7 tasks are test execution / verification.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Backend)**: No dependencies beyond 021/006 being done. **BLOCKS** Phase 2.
- **Phase 2 (Frontend)**: Depends on Phase 1 (API response shape must be stable).
- **Phase 3 (Verification)**: Depends on all previous phases.

### Critical Path

```
T001 (field rename) → T004-T005 (integration tests) → T006-T007 (existing test verification)
→ T008-T009 (frontend verification) → T011-T015 (full verification)
```

### Parallel Opportunities

- T002 and T003 (code verifications) can run in parallel with T001.
- T004 and T005 (integration tests) can run in parallel with each other.
- T008 and T009 (frontend verifications) can run in parallel.
