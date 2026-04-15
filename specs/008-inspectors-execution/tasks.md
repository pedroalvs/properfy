# Tasks: 008-inspectors-execution (Feedback Round Deltas)

**Input**: `specs/008-inspectors-execution/spec.md`, `plan.md`, `data-model.md`
**Prerequisites**: 021-contacts IMPLEMENTED. 006-appointments IMPLEMENTED. 007-tenant-portal IMPLEMENTED. plan.md rewritten 2026-04-14.
**Tests**: Mandatory — TDD per constitution Principle III.

**Scope**: ONLY the feedback-round deltas (items 1, 2, 3, 5, 6). The core execution flow (start, finish, assets, T-1, idempotency) is already shipped. This file tracks extensions, not the full module.

**010 dependency**: `DraftInspectorInvoiceUseCase` and `PENDING_REVIEW` status do NOT exist in the billing module yet. Tasks that depend on 010 are marked explicitly. They can be implemented as stubs or deferred until 010 delivers.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel
- **[Story]**: Maps to US1, US6, US6a, US6b from spec.md
- **[DEP:010]**: Depends on feature 010 billing module delivering the draft invoice use case

---

## Phase 1: Schema + Shared + Domain Foundation

**Purpose**: Prisma migration (blocked_clients + profile fields), shared schemas, domain entity. MUST complete before any use case work.

**Critical path**: every subsequent phase depends on Phase 1.

### Prisma schema + migration

- [x] T001 [US1] Add `blocked_clients_json` column to Inspector model in `apps/backend/prisma/schema.prisma` — `Json @default("[]")`. Keep `client_eligibility_json` (deprecated, expand phase — no drop).

- [x] T002 [US1] Add inspector profile columns to Prisma schema — `full_name` (varchar 300, nullable), `address` (Json, nullable), `abn` (varchar 20, nullable), `date_of_birth` (Date, nullable), `insurance_file_key` (text, nullable), `insurance_expires_at` (Date, nullable), `police_check_file_key` (text, nullable), `police_check_expires_at` (Date, nullable). Add indexes on `insurance_expires_at` and `police_check_expires_at`. All nullable per OQ-2.

- [x] T003 Generate Prisma migration `add_inspector_profile_blocked_clients`. Include data migration SQL. **Critical**: the current `client_eligibility_json` is NOT a flat array of tenant IDs — it's an array of objects `[{ "tenantId": "uuid", "eligible": true/false }]` (see `ClientEligibilityEntry` in shared). The complement must: (a) extract tenant IDs where `eligible = true` as the "allowed set", (b) compute `blocked_clients_json` = all active tenants NOT in the allowed set. SQL approach:
  ```sql
  UPDATE inspectors SET blocked_clients_json = (
    SELECT COALESCE(jsonb_agg(t.id), '[]'::jsonb)
    FROM tenants t
    WHERE t.status = 'ACTIVE'
      AND t.id::text NOT IN (
        SELECT e->>'tenantId'
        FROM jsonb_array_elements(inspectors.client_eligibility_json) AS e
        WHERE (e->>'eligible')::boolean = true
      )
  )
  WHERE jsonb_array_length(client_eligibility_json) > 0
    AND blocked_clients_json = '[]'::jsonb;
  ```
  For inspectors with empty `client_eligibility_json` (= was eligible for all), leave `blocked_clients_json = '[]'` (= still eligible for all). The `WHERE blocked_clients_json = '[]'` guard makes the migration idempotent. Verify with `npx prisma validate`.

- [x] T004 [P] Write unit test for the blocked-clients complement logic in `apps/backend/tests/unit/inspector/blocked-clients-complement.test.ts` — (a) inspector eligible for tenants [A, B] out of [A, B, C, D] → blocked = [C, D], (b) inspector eligible for all (empty list) → blocked = [] (still eligible for all), (c) inspector eligible for no one → blocked = [A, B, C, D] (all tenants). Minimum 3 cases. This tests the migration logic conceptually (the actual SQL runs in the migration, but the test validates the complement algorithm).

### Shared schemas

- [x] T005 [P] Revise `packages/shared/src/schemas/inspector.ts` — add fields to create/update schemas: `blockedClientsJson` (array of uuid strings), `fullName` (string, optional), `address` (object, optional), `abn` (string, optional, max 20), `dateOfBirth` (date string, optional), `insuranceFileKey` (string, optional), `insuranceExpiresAt` (date string, optional), `policeCheckFileKey` (string, optional), `policeCheckExpiresAt` (date string, optional). Keep existing fields. Export types.

- [x] T006 [P] Create `draftInvoiceSchema` in `packages/shared/src/schemas/inspector-execution.ts` — `{ periodStart: z.string().date(), periodEnd: z.string().date() }` with refine: `periodEnd > periodStart`. Export as `DraftInvoiceInput`.

- [x] T007 [P] Write schema tests in `packages/shared/src/schemas/inspector.test.ts` — blocked_clients valid/invalid, profile fields valid, ABN max length, date format. Minimum 5 new cases.

### Domain entity

- [x] T008 [US1] Revise `apps/backend/src/modules/inspector/domain/inspector.entity.ts` — add `blockedClientsJson: string[]` + all profile fields to `InspectorProps` and `InspectorEntity`. Add `isBlockedForTenant(tenantId: string): boolean` helper (returns `this.blockedClientsJson.includes(tenantId)`). **Also deprecate and rewrite `isEligibleForTenant()`**: the current implementation reads the old `clientEligibilityJson` shape (`entry.tenantId === tenantId && entry.eligible`). Rewrite to: `return !this.isBlockedForTenant(tenantId)` — eligibility is now the inverse of being blocked. Keep the method name for callers but change the implementation. This ensures `GetInspectorUseCase` (line 56) and the `ListInspectorsUseCase` post-filter (line 102) both use the new model without changing their call sites.

- [x] T009 Revise `apps/backend/src/modules/inspector/infrastructure/prisma-inspector.repository.ts` — map new columns in the `mapToEntity` function. Read `blocked_clients_json` alongside legacy `client_eligibility_json`.

**Checkpoint**: `pnpm typecheck && pnpm --filter shared test` green. Migration applies. Entity has new fields.

---

## Phase 2: Backend — Inspector CRUD + Marketplace Eligibility (FR-006a, FR-006b)

**Purpose**: Use cases accept new fields. Marketplace filtering inverted from allow-list to block-list.

- [x] T010 [US1] Revise `apps/backend/src/modules/inspector/application/use-cases/create-inspector.use-case.ts` — accept `blockedClientsJson`, `fullName`, `address`, `abn`, `dateOfBirth`, `insuranceFileKey`, `insuranceExpiresAt`, `policeCheckFileKey`, `policeCheckExpiresAt` in input. Persist to new columns. Audit includes new fields in `after` snapshot.

- [x] T011 [US1] Revise `apps/backend/src/modules/inspector/application/use-cases/update-inspector.use-case.ts` — same new fields in input. Partial update: only provided fields are written. Audit includes `before`/`after` for changed fields.

- [x] T012 [US1] Invert marketplace eligibility logic in **both** the repository and entity consumption paths: **(a) Repository filter** in `prisma-inspector.repository.ts`: the current code post-filters via `i.isEligibleForTenant(tenantId)` (lines ~98-102) and uses a raw Prisma query on `client_eligibility_json` for the marketplace check (lines ~114-119). Replace both with the new model: `!i.isBlockedForTenant(tenantId)` for the post-filter, and `WHERE NOT (blocked_clients_json @> to_jsonb(tenantId::text))` for the raw query. Empty `blocked_clients_json` = eligible for all. **(b) Use case callers**: `GetInspectorUseCase` (line ~56) and `ListInspectorsUseCase` (line ~102) call `isEligibleForTenant()` — these callers don't need changes because T008 rewrites the method to use blocked-clients internally. But verify both paths work after T008.

- [x] T013 Revise inspector route handlers in `apps/backend/src/modules/inspector/interfaces/inspector.routes.ts` — validate new fields via the revised Zod schemas. Pass to use cases. Serialize profile fields in GET response.

- [x] T014 [P] Write integration test for inspector create with profile fields in `apps/backend/tests/integration/inspector/inspector-profile-crud.test.ts` — (a) create with all profile fields → persisted, (b) create with minimal fields (all nullable) → ok, (c) update blocked_clients → persisted, (d) audit includes new fields. Minimum 4 cases.

- [x] T015 Write integration test for marketplace eligibility inversion in `apps/backend/tests/integration/inspector/blocked-clients-marketplace.test.ts` — (a) inspector with empty blocked_clients = eligible for all tenants, (b) inspector blocked from tenant A → not returned for tenant A, returned for tenant B, (c) legacy inspector with only `client_eligibility_json` (pre-migration) → falls back correctly (or fails gracefully). Minimum 3 cases.

**Checkpoint**: inspector CRUD works with new fields. Marketplace uses block-list. All existing inspector tests pass.

---

## Phase 3: Backend — Schedule + Job Details + Draft Invoice (FR-022, FR-023, FR-060)

**Purpose**: Enrich schedule and job-details responses. Wire the draft invoice endpoint.

### Schedule extras (FR-022)

- [x] T016 [US6] Revise `apps/backend/src/modules/inspector-execution/application/use-cases/get-inspector-schedule.use-case.ts` — add `agencyName` to each schedule row. **Source**: the schedule use case calls `findVisibleForInspector()` which returns `AppointmentListItem[]`. Each item already has `tenantName: string` (the agency display name, joined by the repository from `tenants.name`). The fix is to map `agencyName: item.tenantName` into the `ScheduleAppointmentItem` response — no new query needed, just a serialization addition. Also add `agencyName` to the `ScheduleAppointmentItem` interface. **Note**: `keyRequired` is already present in the schedule response (verified in code, line 85) — no change needed for that field, only verify it's still there.

- [x] T017 [P] [US6] Write integration test for schedule extras in `apps/backend/tests/integration/inspector-execution/schedule-extras.test.ts` — (a) schedule response includes `agencyName` per row, (b) `keyRequired = true` row has `keyRequired: true` in response. Minimum 2 cases.

### Job Details enrichment (FR-023)

- [x] T018 [US6a] Revise `apps/backend/src/modules/inspector-execution/application/use-cases/get-appointment-detail.use-case.ts` — build structured `jobDetails` payload with 7 sections:
  - `agency`: `{ id: appointment.tenantId, name: tenant.name }` — read via existing `tenantRepo` or from the `AppointmentWithRelations` enrichment
  - `tenantContacts`: from `appointment.contacts[]` where `role != PROPERTY_MANAGER && role != BROKER`, using snapshot fields (`effectiveName`, `effectiveEmail`, `effectivePhone`), primary first
  - `keys`: `{ keyRequired: appointment.keyRequired, keyLocation: appointment.keyLocation }`
  - `keyLocation`: when `keyLocation` is non-null, include it as text AND generate `mapLinkUrl`: `https://maps.google.com/?q=${encodeURIComponent(keyLocation)}`. This is required per spec FR-023 acceptance scenario 2 — not optional. When `keyLocation` is null, omit both fields.
  - `propertyManager`: from junction row with `role = PROPERTY_MANAGER`. Use **live registry data** via `contact_id` JOIN when `contact_id IS NOT NULL` (inspector needs current PM phone). Fall back to snapshot for legacy rows.
  - `payment`: `{ payoutAmount: appointment.payoutAmount, currency: appointment.currency ?? tenant.currency }` — from the pricing snapshot, NOT the tenant price
  - `inspectionAppLink`: read `settingsJson.inspectionAppLink` from the tenant record. Validate defensively: the value must be an object with `{ url: string, label: string }` — if present and valid, include in response; if absent or malformed, omit the field entirely (not `null`, no crash). Use a simple Zod `.safeParse()` inline to guard against malformed tenant settings.

- [x] T019 [P] [US6a] Write integration test for Job Details sections in `apps/backend/tests/integration/inspector-execution/job-details-enrichment.test.ts` — (a) response has all 7 sections with correct data, (b) tenantContacts uses snapshot fields (primary first), (c) PM uses live registry data when `contact_id` present, (d) `inspectionAppLink` omitted when not configured, (e) `payment` shows payout amount not tenant price. Minimum 5 cases.

### Draft invoice surface (FR-060) — **depends on 010**

- [x] T020 [US6b] [DEP:010] Create `apps/backend/src/modules/billing/application/use-cases/draft-inspector-invoice.use-case.ts` — **This is a 010 use case, placed in the billing domain as part of 008's delivery.** When 010 is later planned/implemented, its tasks.md MUST reference this use case as already-delivered — do NOT re-create it. Aggregates approved `INSPECTOR_PAYOUT` financial entries for the given `(inspectorId, periodStart, periodEnd)`. Creates `InspectorInvoice` with `status = PENDING_REVIEW`. Checks period overlap against existing non-rejected invoices. Emits `inspector_invoice.drafted` audit. Returns the created invoice.
  **NOTE**: Requires `PENDING_REVIEW` to be added to `InspectorInvoiceStatus` enum in Prisma. If 010 has not delivered this yet, this task includes adding the enum value + its migration. If 010 already has it, skip the enum addition.

- [x] T021 [US6b] [DEP:010] Create thin delegation route `POST /v1/inspector/invoices/draft` in `apps/backend/src/modules/inspector-execution/interfaces/inspector-execution.routes.ts` — preHandler: authenticate, RBAC check INSP only, resolve `inspectorId` from JWT. Validate body via `draftInvoiceSchema`. Call `DraftInspectorInvoiceUseCase`. Return `201` with the created invoice summary.

- [x] T022 [US6b] [DEP:010] Wire `DraftInspectorInvoiceUseCase` in DI container — instantiate in billing section, inject into inspector-execution route container.

- [x] T023 [P] [US6b] [DEP:010] Write integration test for draft invoice in `apps/backend/tests/integration/inspector-execution/draft-invoice.test.ts` — (a) happy path: INSP with 3 approved payouts → invoice created in PENDING_REVIEW with correct total, (b) empty period → `INVOICE_EMPTY_PERIOD`, (c) overlapping period → `INVOICE_PERIOD_OVERLAP`, (d) non-INSP → 403, (e) INSP without inspectorId → error. Minimum 5 cases.

**Checkpoint**: schedule shows agency name + keyRequired. Job Details returns 7 sections. Draft invoice creates PENDING_REVIEW row (when 010 is ready) or stubs are in place.

---

## Phase 4: Frontend — Web Admin

**Purpose**: Inspector form with profile fields + blocked-clients dropdown. Can start after Phase 2.

- [x] T024 [P] [US1] Revise `apps/web/src/features/inspectors/components/InspectorFormDrawer.tsx` — add profile form fields: `fullName` (text), `address` (text/structured), `abn` (text, max 20), `dateOfBirth` (date picker). Add document upload section: insurance (file upload via presigned URL + `insuranceExpiresAt` date picker), police check (same pattern + `policeCheckExpiresAt`). All fields optional (OQ-2 unresolved).

- [x] T025 [US1] Revise the blocked-clients section in `InspectorFormDrawer.tsx` — replace the existing client eligibility checkbox list (if any) with a **multi-select dropdown** of tenants. The dropdown fetches tenants via existing `GET /v1/tenants` endpoint. Selected values are the blocked tenants. Empty selection = eligible for all. Submit as `blockedClientsJson: string[]`. **Read from `blockedClientsJson`** (the post-migration field), NOT from the deprecated `clientEligibilityJson`. When editing an existing inspector, the form populates the dropdown from the inspector's `blockedClientsJson` array.

- [x] T026 [P] [US1] Revise `apps/web/src/features/inspectors/components/InspectorDetailSections.tsx` — display new profile data: full name, address, ABN, DOB, insurance doc link + expiry, police check doc link + expiry. Document links open the presigned download URL.

- [x] T027 [P] Remove pencil icon from inspector list rows in `apps/web/src/features/inspectors/pages/InspectorListPage.tsx` — inherited from 014 FR-019b. If list already only has eye (view) action, mark as verified.

**Checkpoint**: Web admin inspector form accepts all new fields. Blocked-clients is a dropdown.

---

## Phase 5: Frontend — PWA

**Purpose**: Schedule extras, Job Details, Draft Invoice, Profile. Can start after Phase 3.

### Schedule (item 2)

- [x] T028 [US6] Revise `apps/pwa/src/features/schedule/components/` — render `agencyName` on each appointment card. Render a key icon (e.g., `mdi-key`) when `keyRequired = true`. Read both fields from the schedule API response.

### Job Details (item 3)

- [x] T029 [US6a] Create Job Details screen at `apps/pwa/src/features/schedule/components/JobDetailsScreen.tsx` (or revise existing placeholder) — render 7 sections from the `GET /v1/inspector/appointments/:id` response:
  - **Agency**: tenant name
  - **Tenant Contacts**: list with name, email (mailto link), phone (tel link). Primary first.
  - **Keys**: "Key required" badge + key location text
  - **Key Location**: address text + "Open in Maps" link (map-link URL from response)
  - **Property Manager**: name, email, phone, company. Uses live registry data (from response).
  - **Payment**: payout amount + currency. NOT the tenant price.
  - **Inspection App Link**: deep-link button with label. Hidden when field absent.

### Draft Invoice (item 5) — depends on 010

- [x] T030 [US6b] [DEP:010] Create Draft Invoice screen at `apps/pwa/src/features/earnings/components/DraftInvoiceScreen.tsx` — period picker (start date + end date), preview of financial entries in the period (call a read endpoint or display totals from the draft response), submit button calling `POST /v1/inspector/invoices/draft`. Show result: invoice created or error message.
  **NOTE**: This screen is only functional when 010's billing use case is implemented. Until then, the submit will return an error. The screen can be built with the API contract defined but non-functional end-to-end.

### Profile (item 6)

- [x] T031 [US1] Create or revise Profile screen at `apps/pwa/src/features/profile/components/ProfileScreen.tsx` — self-service fields: full name, address, ABN, DOB (read-only or editable depending on product decision — for now, display + edit). Insurance and police check document upload (presigned URL flow matching web admin pattern). Expiration dates displayed.

**Checkpoint**: PWA shows agency name + key icon on schedule. Job Details renders 7 sections. Draft Invoice screen exists (functional when 010 is ready). Profile shows new fields.

---

## Phase 6: Verification

- [x] T032 Run `pnpm typecheck` across all workspaces — must pass
- [x] T033 Run `pnpm --filter backend test` — all tests pass (including new tests from T004, T014-T015, T017, T019, T023)
- [x] T034 Run `pnpm --filter web test` — all pass
- [x] T035 Run `pnpm --filter pwa test` — all pass (if test infrastructure exists)
- [x] T036 Verify Prisma migration: `npx prisma validate` clean. Migration applies from scratch on testcontainers.
- [x] T037 Verify `client_eligibility_json` still exists in schema (not dropped — expand phase)
- [x] T038 Verify `blocked_clients_json` has correct data after migration: inspectors that were eligible for all → `[]`, inspectors with specific eligibility → complement computed

**Checkpoint**: Feature 008 deltas complete. All verifications pass.

---

## Residual Notes

### 010 dependency status

`DraftInspectorInvoiceUseCase`, `PENDING_REVIEW` enum value, and `approve-draft` / `reject-draft` endpoints do **NOT exist** in the billing module as of 2026-04-14. Tasks T020-T023 and T030 are tagged `[DEP:010]`.

**Options for implementation order**:
1. **Implement 010 billing deltas first** (recommended if 010 is next in queue) → then 008's draft invoice tasks work end-to-end
2. **Implement 008 T020 as part of 008** (creating the use case + enum in billing) → acceptable if the team treats it as an 008-owned deliverable with billing domain placement
3. **Stub T020** with a `throw new Error('Not implemented — waiting for 010')` → defer to 010 round

The plan recommends option 2: T020 creates the use case in billing's domain, and 010's plan can reference it as already-delivered.

### Open Questions (not resolved in this round)

- **OQ-1**: Per-agency login credentials — PWA MUST NOT surface credential management
- **OQ-2**: Profile field obligation levels — all nullable for now
- **OQ-3**: Document expiration lifecycle — dates stored, no behavioral consequences

### What is NOT in this task list

- Execution flow (start, finish, assets) — unchanged
- T-1 rule — unchanged
- State machine — unchanged
- Contact registry CRUD — 021 done
- Appointment contacts array — 006 done
- Portal dual-write — 007 done
- Column drop on `client_eligibility_json` — expand/contract
- Availability slot booking automation — GAP-003

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Schema)**: No dependencies beyond 021/006/007 being done. **BLOCKS all other phases.**
- **Phase 2 (CRUD)**: Depends on Phase 1. **BLOCKS** Phases 4 (web form needs new fields).
- **Phase 3 (Schedule/Details/Invoice)**: Depends on Phase 1. T020-T023 depend on 010 (or are self-contained if option 2). **BLOCKS** Phase 5 (PWA needs enriched responses).
- **Phase 4 (Web Admin)**: Depends on Phase 2. Independent of Phase 3.
- **Phase 5 (PWA)**: Depends on Phase 3.
- **Phase 6 (Verification)**: Depends on all.

### Critical Path

```
T001-T003 (schema/migration) → T005-T006 (shared schemas) → T008-T009 (entity/repo)
→ T010-T013 (CRUD + marketplace inversion) → T014-T015 (integration tests)
→ T016-T019 (schedule/details) → T020-T023 (draft invoice, DEP:010)
→ T024-T031 (frontend) → T032-T038 (verification)
```

### Parallel Opportunities

**Phase 1**: T004 (complement test), T005 (shared schemas), T006 (draft invoice schema), T007 (schema tests) — all parallelizable after T001-T003.

**Phase 2**: T014 (profile CRUD test), T015 (marketplace test) — parallelizable.

**Phase 3**: T017 (schedule test), T019 (Job Details test) — parallelizable. T023 (draft invoice test) parallelizable with T019 but depends on T020.

**Phase 4+5**: T024/T026/T027 (web) parallelizable. T028/T029/T031 (PWA) parallelizable.
