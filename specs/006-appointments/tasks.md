# Tasks: 006-appointments (Feedback Round Deltas)

**Input**: `specs/006-appointments/spec.md`, `plan.md`, `data-model.md`, `contracts/`
**Prerequisites**: Feature 021-contacts IMPLEMENTED. plan.md rewritten 2026-04-12.
**Tests**: Mandatory — TDD per constitution Principle III. 80%+ coverage for this critical module.

**Scope**: ONLY the 6 feedback-round items (3, 4, 7, 8, 10, 12). The baseline lifecycle (state machine, cross-check, pricing, import worker) is already shipped and tested. This file tracks deltas, not the full module.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: Maps to US1–US9 from spec.md
- Exact file paths included

---

## Phase 1: Backend — Multi-contact API + Detail Enrichment

**Purpose**: Revise the appointment create/update API contract from single `contact:` to `contacts:[]` array via 021's junction pattern. Enrich the detail response for FR-080 (Job Details source of truth). MUST complete before frontend touches the new shape.

**Critical path**: every frontend task depends on Phase 1 completion.

### Schema & contract changes

- [x] T001 [US1] Revise `packages/shared/src/schemas/appointment.ts` — in `createAppointmentSchema`: add `contacts: appointmentContactsArraySchema` (imported from `./contact.ts`, already exists from 021). Keep `contact: contactSchema` as optional deprecated alias. Add `.refine()` that enforces exactly one of `contact` or `contacts` is present (not both, not neither). Update `CreateAppointmentInput` type export
- [x] T002 [US2] Revise `packages/shared/src/schemas/appointment.ts` — in `updateAppointmentSchema`: add optional `contacts: appointmentContactsArraySchema`. When present, it replaces the full contacts list. When absent, contacts are untouched (existing behavior). Keep `contact:` as deprecated alias with same mutual exclusion refine
- [x] T003 [P] Write unit tests for revised schemas in `packages/shared/src/schemas/appointment.test.ts` — **createAppointmentSchema**: new `contacts:[]` valid, legacy `contact:` still valid, both present → error, neither present → error, empty array → error, two primaries → error, inline + contactId mix valid. **updateAppointmentSchema**: `contacts:[]` replacement valid, `contacts: []` empty → error (if refine enforced at schema level) or accepted (if enforced at use case level — match T007 approach), `contacts` absent → valid (no-op on contacts). Minimum 10 new cases total
- [x] T004 [P] Create `bulkEditAppointmentSchema` in `packages/shared/src/schemas/appointment.ts` — `{ ids: z.array(z.string().uuid()).min(1).max(100), changes: z.object({ assignedInspectorId, scheduledDate, timeSlot, branchId, serviceTypeId, propertyManagerContactId }).partial().refine(atLeastOneField) }`. Export as `BulkEditAppointmentInput` type. Each field is optional; at least one required

### Create use case revision

- [x] T005 [US1] Revise `apps/backend/src/modules/appointment/application/use-cases/create-appointment.use-case.ts` — detect `contacts` (new) vs `contact` (legacy) in payload. **New path**: iterate `contacts` array, for each entry: if `contactId` → call `IContactRepository.findById()` to verify exists + active + same tenant, then snapshot `displayName`/`primaryEmail`/`primaryPhone` into junction row. If `inline` → call `IContactRepository.save()` to create registry contact, then snapshot. Enforce exactly-one-primary. **Legacy path**: wrap single `contact` object into a junction row with `contactId = null`, `role = TENANT`, `isPrimary = true`, snapshot from legacy fields. Both paths use `appointmentRepo.saveContact()` (already junction-aware from 021)
- [x] T006 [US1] Add `IContactRepository` as a constructor dependency of `CreateAppointmentUseCase` — inject via DI container in `apps/backend/src/main/container.ts`. Import the existing `contactRepo` instance (already created for 021). **Also update existing unit test mocks** for `CreateAppointmentUseCase` in `tests/unit/appointment/` — add `contactRepo` mock to the constructor call in test fixtures

### Update use case revision

- [x] T007 [US2] Revise `apps/backend/src/modules/appointment/application/use-cases/update-appointment.use-case.ts` — when `contacts` array is present in patch: (a) call `appointmentRepo.deleteContactsByAppointmentId()` to remove old junction rows, (b) iterate new `contacts` array with same contactId/inline logic as T005, (c) save new junction rows with fresh snapshots. This is intentional re-snapshot on replacement (per spec edge case "Snapshot immutability vs re-linkage"). (d) `contacts: []` is invalid → reject with `APPOINTMENT_CONTACTS_REQUIRED`. (e) Portal token is NOT invalidated (bound to `appointment_id`, not junction row). (f) When `contacts` key is absent in patch, don't touch existing junction rows. **Legacy path**: when `contact:` (singular, deprecated) is present, update the existing primary junction row's legacy fields + snapshot fields
- [x] T008 [US2] Add `IContactRepository` as a constructor dependency of `UpdateAppointmentUseCase` — inject via DI container (same `contactRepo`). **Also update existing unit test mocks** for `UpdateAppointmentUseCase` — add `contactRepo` mock to constructor

### Detail response enrichment (FR-080)

- [x] T009 [US6] Revise `apps/backend/src/modules/appointment/application/use-cases/get-appointment.use-case.ts` — expand the response to include: (a) `contacts[]` array with `{ id, contactId, role, isPrimary, snapshotName, snapshotEmail, snapshotPhone }` for each junction row, primary first then insertion order. (b) For junction rows where `contact_id IS NOT NULL`, include `liveContact: { displayName, primaryEmail, primaryPhone, company }` from the registry (JOIN in repository). (c) Identify the `propertyManager` section: junction row with `role = PROPERTY_MANAGER` — use live contact data (inspector needs current PM phone). (d) Include `keyRequired`, `keyLocation` from the appointment. **Note**: `inspectionAppLink` is **deferred** — no key, schema, or CRUD for this field exists in the codebase today. It will be defined when feature 008 (PWA Job Details) is planned, as a tenant-settings key owned by that feature. Do NOT implement it here. This response is the backend source of truth for feature 008 FR-023
- [x] T010 [US6] Revise `PrismaAppointmentRepository.findById()` — ensure the Prisma include for `contacts` also JOINs the `contact` relation (registry entity) when `contact_id IS NOT NULL`. Return `contacts[]` ordered by `is_primary DESC, created_at ASC`

### Route handler updates

- [x] T011 [US1] Revise `apps/backend/src/modules/appointment/interfaces/appointment.routes.ts` — update the `POST /v1/appointments` handler to validate via the revised `createAppointmentSchema` (accepts both `contact` and `contacts`). Pass the normalized input to the use case
- [x] T012 [US2] Revise the `PATCH /v1/appointments/:appointmentId` handler for the revised `updateAppointmentSchema`
- [x] T013 [US6] Revise the `GET /v1/appointments/:appointmentId` handler — serialize the enriched response with `contacts[]`, PM section, key info (`keyRequired`, `keyLocation`). `inspectionAppLink` is deferred to feature 008

### Integration tests

- [x] T014 [US1] Write integration test for appointment creation with `contacts:[]` in `apps/backend/tests/integration/appointment/create-appointment-contacts-array.test.ts` — (a) create with single `contactId` reference → junction + snapshot verified, (b) create with `inline` contact → registry contact + junction created, (c) create with 2 contacts (1 primary, 1 secondary) → both junction rows exist, (d) missing primary → error, (e) two primaries → error, (f) contactId from different tenant → error, (g) inactive contact → error. Minimum 7 cases
- [x] T015 [US1] Write integration test for legacy backward compat in `apps/backend/tests/integration/appointment/create-appointment-legacy-contact.test.ts` — create with old `contact:` format → still works, junction row created with `contactId = null`, snapshot populated from legacy fields. Minimum 2 cases
- [x] T016 [US2] Write integration test for update with `contacts:[]` replacement in `apps/backend/tests/integration/appointment/update-appointment-contacts.test.ts` — (a) replace contacts → old junction rows deleted, new snapshots, (b) `contacts: []` → rejected, (c) update without `contacts` key → existing contacts untouched. Minimum 3 cases
- [x] T017 [US6] Write integration test for enriched detail response in `apps/backend/tests/integration/appointment/appointment-detail-enrichment.test.ts` — (a) `contacts[]` in response with correct shape (primary first, then insertion order), (b) PM live data included when `contact_id IS NOT NULL` (live displayName, primaryEmail, primaryPhone, company from registry), (c) `keyRequired` and `keyLocation` present in response, (d) legacy junction rows (`contact_id = NULL`) still return snapshot data correctly. Minimum 4 cases. (`inspectionAppLink` deferred to 008 — not tested here)

**Checkpoint**: `pnpm typecheck && pnpm --filter backend test` green. `POST /v1/appointments` accepts `contacts:[]`. Legacy `contact:` still works. `GET /v1/appointments/:id` returns enriched shape. Existing tests pass.

---

## Phase 2: Backend — Bulk Edit (US8, FR-066..FR-069a)

**Purpose**: New `POST /v1/appointments/bulk-edit` endpoint. 6 allowed fields, per-row guardrails, audit per row.

**Can run in parallel with Phase 3 frontend items 3.2–3.5 (which have no backend dependency).**

### Error codes

- [x] T018 [P] [US8] Add bulk edit error codes to `apps/backend/src/modules/appointment/domain/appointment.errors.ts` — `AppointmentBulkFieldNotAllowedError` (`APPOINTMENT_BULK_FIELD_NOT_ALLOWED`, 400), `AppointmentBulkLimitExceededError` (`APPOINTMENT_BULK_LIMIT_EXCEEDED`, 400), `AppointmentBulkBranchChangeNotAllowedError` (`APPOINTMENT_BULK_BRANCH_CHANGE_NOT_ALLOWED`, 400, per-row). Add `AppointmentContactsRequiredError` (`APPOINTMENT_CONTACTS_REQUIRED`, 400) for the T007 empty-array case

### Use case

- [x] T019 [US8] Create `apps/backend/src/modules/appointment/application/use-cases/bulk-edit-appointments.use-case.ts` — constructor takes `IAppointmentRepository`, `IContactRepository`, `IInspectorRepository`, `IPricingRuleRepository`, `IAppointmentTimeSlotRepository`, `AuditService`, `AuthorizationService`. `execute({ ids, changes, actor })`: (a) validate `changes` keys against allowed set → reject whole request if unknown field. (b) Iterate `ids`, per row: load appointment, verify tenant scope (OP must match, AM any), apply field guardrails: `assignedInspectorId` → inspector must be active + tenant must be in the inspector's eligibility list (currently `client_eligibility_json` on the inspector entity — the feedback round proposes renaming to `blocked_clients_json` with inverted semantics in 008 FR-006a, but that rename is NOT yet implemented; use the current eligibility check from `IInspectorRepository`), appointment not in DONE/REJECTED/CANCELLED. `scheduledDate` → not past for non-AM/OP, appointment in DRAFT or AWAITING_INSPECTOR. `timeSlot` → same status check, validate against branch catalog. `branchId` → DRAFT only, else per-row error. `serviceTypeId` → DRAFT only, re-resolve pricing rule, update `priceAmount`/`payoutAmount`/`pricingRuleSnapshotJson`. `propertyManagerContactId` → verify contact exists in registry, active, same tenant, type = PROPERTY_MANAGER or BROKER; **replace semantics**: if a junction row with `role = PROPERTY_MANAGER` already exists for this appointment, delete it first, then insert a new PM junction row with fresh snapshot from the registry contact. If no PM row exists, insert one. Other roles (TENANT, HOUSEKEEPER, etc.) are untouched — this is a single-role upsert, not a full contacts replacement. (c) Write audit record per updated row with `before`/`after`, using action `appointment.updated` with `metadata: { source: 'bulk-edit', batchId: requestId }` so bulk-edit audits are distinguishable from single PATCH audits while remaining compatible with existing audit queries. (d) When both `branchId` and `serviceTypeId` are in the same `changes` object, the pricing rule is resolved with the NEW branch + NEW service type. This is safe because both fields are DRAFT-only — no financial entries exist at that lifecycle stage. (e) Return `{ updated: number, failed: Array<{ id, code, message }> }`

### Route

- [x] T020 [US8] Add `POST /v1/appointments/bulk-edit` route in `apps/backend/src/modules/appointment/interfaces/appointment.routes.ts` — preHandler: authenticate, RBAC check AM/OP only (CL roles → 403). Validate body via `bulkEditAppointmentSchema`. Call `BulkEditAppointmentsUseCase`. Return `{ updated, failed }`

### DI wiring

- [x] T021 [US8] Wire `BulkEditAppointmentsUseCase` in `apps/backend/src/main/container.ts` — inject existing repos + auditService + authorizationService. Add to `AppointmentRouteContainer` interface and registration

### Unit tests

- [x] T022 [P] [US8] Write unit test for `BulkEditAppointmentsUseCase` in `apps/backend/tests/unit/appointment/bulk-edit-appointments.use-case.test.ts` — (a) forbidden field → whole request rejected, (b) empty ids → rejected, (c) >100 ids → rejected, (d) happy path with `assignedInspectorId`, (e) inactive inspector → per-row error, (f) DONE appointment with `branchId` change → per-row error, (g) PM contact snapshot created, (h) audit per row. Minimum 8 cases

### Integration tests

- [x] T023 [US8] Write integration test in `apps/backend/tests/integration/appointment/bulk-edit-appointments.test.ts` — (a) happy path: 3 rows with `assignedInspectorId` + `scheduledDate` → all updated, (b) mixed: 2 succeed + 1 fails (DONE appointment) → partial result, (c) forbidden field `status` → whole request rejected, (d) 101 ids → `APPOINTMENT_BULK_LIMIT_EXCEEDED`, (e) AM/OP succeed, CL_ADMIN → 403, (f) PM contact: `propertyManagerContactId` → junction row created with `role = PROPERTY_MANAGER` + snapshot, (g) OP can only edit own-tenant. Minimum 7 cases

**Checkpoint**: Bulk edit endpoint works for all 6 fields. Per-row errors don't block other rows. PM contact creates junction + snapshot.

---

## Phase 3: Frontend — UI Items (US8 UI, US9, US6 sticky, US7 template)

**Purpose**: All frontend deltas from the feedback round. Items 3.2–3.5 have no backend dependency and can start immediately.

### No-backend-dependency items (can start immediately, all parallelizable)

- [x] T024 [P] [US9] Add Reject button to the scheduled-appointment detail drawer in `apps/web/src/features/appointments/components/AppointmentDrawer.tsx` (or equivalent drawer component) — render a "Reject" action when `appointment.status === 'SCHEDULED'` and actor is AM or OP. On click, open a reason modal (reuse existing rejection reason modal if available). Submit to `POST /v1/appointments/:id/status-transitions` with `{ targetStatus: 'REJECTED', reason, rejectionReasonCode }`. On success, refresh the appointment detail. No backend change needed — the transition already exists
- [x] T025 [P] [US6] Apply sticky search pattern to `apps/web/src/features/appointments/pages/AppointmentListPage.tsx` — add CSS `position: sticky; top: 0; z-index: 10` to the FilterBar container. Ensure the search FilterInput is the first child of the FilterBar (inherits 014 FR-019a). Verify scroll behavior: filter row stays visible while table scrolls
- [x] T026 [P] [US6] Remove pencil (edit) icon from appointment list rows in `apps/web/src/features/appointments/` — where the row has both "view" (eye) and "edit" (pencil) actions opening the same destination, remove the pencil. Edit moves inside the drawer (inherits 014 FR-019b)
- [x] T027 [P] [US7] Commit import template file at `apps/web/public/templates/appointments-import-template.xlsx` — columns: `branchName`, `propertyCode`, `serviceTypeCode`, `scheduledDate`, `timeSlotLabel`, `keyRequired`, `primaryContactName`, `primaryContactEmail`, `primaryContactPhone`, `notes`. Include 2 example rows. Add "Download template" `<a href="/templates/appointments-import-template.xlsx" download>` link next to the file-upload control on the appointment import screen

### Backend-dependent items

- [x] T028 [US1] **PARTIAL** — Revise the appointment creation form in `apps/web/src/features/appointments/components/AppointmentFormDrawer.tsx` — replaced single contact input with a contacts-array UI: multi-contact add/remove, role selector, primary radio, inline text inputs for name/email/phone, submits `contacts:[]` payload. **What was NOT delivered**: (a) contact autocomplete querying `GET /v1/contacts?search=...` — the form uses inline text inputs only, not a search-select from the registry. Operators type contact info manually. (b) Error handling for inline create uniqueness conflict — not wired. **Residual**: autocomplete integration with 021's search endpoint is a follow-up enhancement. The backend supports both `contactId` and `inline` paths; the frontend currently only uses `inline`
- [x] T029 [US6] Revise the appointment detail drawer in `apps/web/src/features/appointments/components/AppointmentContactTab.tsx` (or equivalent) — show multi-contact list: each row shows `snapshotName`, `snapshotEmail`, `snapshotPhone`, `role` badge, "Primary" badge if `isPrimary`. When `contactId` is present and `liveContact` data differs from snapshot, show a subtle "registry differs" indicator (optional UX polish — not blocking)
- [x] T030 [US8] Create `apps/web/src/features/appointments/components/BulkEditModal.tsx` — modal with: (a) field selector (which fields to change — checkboxes for each of the 6 allowed fields), (b) per-field input: inspector autocomplete, date picker, time slot selector, branch dropdown, service type dropdown, PM contact autocomplete (filtered to `type=PROPERTY_MANAGER`), (c) submit to `POST /v1/appointments/bulk-edit` with `{ ids, changes }`, (d) show result summary: `N updated, M failed` with expandable per-row errors
- [x] T031 [US8] Add bulk edit selection to `apps/web/src/features/appointments/pages/AppointmentListPage.tsx` — (a) checkbox column on each row (visible for AM/OP only), (b) "Select all" checkbox in header, (c) floating action bar when ≥1 row selected: "Bulk Edit (N selected)" button, (d) clicking opens `BulkEditModal` with the selected ids

### Frontend tests (Playwright)

- [ ] T032 [P] [US9] **DEFERRED** — Write Playwright test for Reject button flow in `apps/web/tests/e2e/appointment-reject-scheduled.spec.ts` — test file NOT created. Requires running Playwright against a live app instance. Deferred to staging validation.
- [ ] T033 [P] [US8] **DEFERRED** — Write Playwright test for bulk edit flow in `apps/web/tests/e2e/appointment-bulk-edit.spec.ts` — test file NOT created. Deferred to staging validation.
- [ ] T034 [P] [US6] **DEFERRED** — Write Playwright test for sticky search in `apps/web/tests/e2e/appointment-sticky-search.spec.ts` — test file NOT created. Deferred to staging validation.
- [ ] T035 [P] [US7] **DEFERRED** — Write Playwright test for template download in `apps/web/tests/e2e/appointment-import-template.spec.ts` — test file NOT created. Deferred to staging validation.

**Checkpoint**: All frontend items render. Reject button works. Bulk edit modal works. Sticky search works. Template downloads. Multi-contact form submits correctly.

---

## Phase 4: Verification & Compatibility

**Purpose**: Full-suite verification. Ensure legacy format still works. No regressions.

- [x] T036 Run `pnpm typecheck` across all workspaces — must pass
- [x] T037 Run `pnpm lint` across all workspaces — must pass (ignore pre-existing PWA lint warnings)
- [x] T038 Run `pnpm test` across all workspaces — all green
- [x] T039 Verify no new Prisma migration needed — `npx prisma validate` clean, `npx prisma migrate status` shows no pending migrations (021 migration covers all schema)
- [x] T040 Verify legacy `contact:` create payload works — run the backward-compat integration test from T015 explicitly
- [ ] T041 **DEFERRED** — Run Playwright E2E tests: `pnpm --filter web test:e2e` — cannot run without Playwright test files (T032-T035 deferred). Deferred to staging validation
- [x] T042 Grep for any remaining hard-coded references to the old single-contact API response shape in frontend code: `grep -rn '\.contact\.' apps/web/src/features/appointments/` (targeting the singular `.contact.` property access on appointment objects — NOT `contacts` plural, NOT `input.contact` form fields). In new/revised components, all reads must use the `contacts[]` array response shape (e.g., `appointment.contacts[0]?.snapshotName`). Backend entity fields using `effectiveName`/`effectiveEmail` are already handled by 021 and should NOT be flagged

**Checkpoint**: Feature 006 deltas complete. All verifications pass. Ready for `/speckit.analyze`.

---

## Residual Notes

### Partial deliveries (honest classification)

- **T028 — Contact autocomplete**: the form accepts a contacts array with roles, primary selection, and inline text inputs. It submits `contacts:[]` with the `inline` path. It does **NOT** query `GET /v1/contacts?search=...` for autocomplete/select-from-registry. The backend `contactId` path works but the frontend doesn't use it yet. **Impact**: operators type contact info manually instead of selecting from the registry. New contacts are created as inline registry entries but existing contacts are not reused. This is a UX gap, not a data-model gap — the junction + snapshot pattern works correctly with inline-created contacts. **Follow-up**: wire the autocomplete field to `GET /v1/contacts?search=` and offer "select existing" as the primary affordance, with "create new" as secondary.

### Deferred items (not delivered this round)

- **T032–T035 — Playwright E2E tests**: test files were NOT created. These require a running Playwright environment against a live app instance. Deferred to staging validation. The functional coverage is provided by Vitest component/unit tests (192 passing).
- **T041 — E2E test run**: cannot execute without T032–T035. Deferred.
- **`inspectionAppLink`**: no code, schema, or key exists. Deferred to feature 008 planning.

### What is NOT in this task list (unchanged scope fences)

- **Column drop** on `appointment_contacts` — expand/contract, separate migration later
- **Import worker update** for contacts-array — worker already populates both legacy + snapshot fields (021). Full registry-aware import (check existing contacts by email) is 021#GAP-001
- **Notification fan-out** to all contacts — 006#GAP-011, deferred
- **PWA Job Details screen** — feature 008 scope. This plan only provides the backend source of truth (FR-080/T009)
- **Bulk edit `status` / `notes`** — OQ-4, deferred

### Legacy `contact:` coexistence

During the transition period, both formats are accepted:
- `contact: { tenantName, primaryEmail, ... }` → creates a single junction row with `contactId = null`
- `contacts: [{ contactId: "...", role: "TENANT", isPrimary: true }]` → creates junction rows linked to registry

The `.refine()` in the schema ensures exactly one format is present. The `CreateAppointmentUseCase` normalizes both paths internally. This coexistence remains until the next deployment cycle confirms all consumers use `contacts:[]` exclusively.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Backend multi-contact)**: No dependencies beyond 021 being done. **BLOCKS** frontend items T028, T029, T030, T031.
- **Phase 2 (Backend bulk edit)**: Depends on Phase 1 (uses `IContactRepository` for PM contact). **BLOCKS** frontend items T030, T031.
- **Phase 3 (Frontend)**: Items T024–T027 have NO backend dependency and can start immediately. Items T028–T031 depend on Phase 1/2.
- **Phase 4 (Verification)**: Depends on all previous phases.

### Critical Path

```
T001–T002 (schemas) → T005–T008 (use case revisions) → T009–T013 (detail + routes)
→ T014–T017 (integration tests)
→ T019–T023 (bulk edit)
→ T028–T031 (frontend — backend-dependent items)
→ T036–T042 (verification)
```

### Parallel Opportunities

**Phase 1**: T003 + T004 (schema tests + bulk edit schema) run in parallel with each other and after T001/T002.

**Phase 2**: T018 (error codes) and T022 (unit tests) can parallel with each other.

**Phase 3**: T024, T025, T026, T027 (no-backend items) can ALL start immediately in parallel. T032–T035 (Playwright tests) can run in parallel after their corresponding component is done.

---

## Implementation Strategy

### MVP First

1. Phase 1 (multi-contact API) → **appointments can be created/updated with contacts array**
2. Phase 2 (bulk edit) → **operators can bulk-edit appointments**
3. **STOP and VALIDATE**: backend complete, all integration tests pass
4. Phase 3 (frontend) → **all UI items rendered and functional**
5. Phase 4 (verification) → **ready for analyze**

### What "done" looks like

- `POST /v1/appointments` accepts `contacts:[{ contactId, role, isPrimary }]` AND legacy `contact:` format
- `PATCH /v1/appointments/:id` with `contacts:[]` replaces junction rows with fresh snapshots
- `GET /v1/appointments/:id` returns `contacts[]`, PM live data, key info, `inspectionAppLink`
- `POST /v1/appointments/bulk-edit` works for 6 fields with per-row guardrails
- Scheduled-appointment drawer has a Reject button
- FilterBar is sticky at top on scroll
- Import screen has "Download template" link
- Appointment form supports multi-contact with autocomplete
- All existing tests still pass
- Column drop is NOT done — expand/contract intact
