# Implementation Plan: 006-appointments (Feedback Round Deltas)

**Branch**: `006-appointments` | **Date**: 2026-04-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feedback Round 2026-04-13 items 3, 4, 7, 8, 10, 12 on top of existing IMPLEMENTED Phase 1.
**Dependency**: Feature 021-contacts (IMPLEMENTED — contact registry, junction + snapshot, pg_trgm search)

> **Scope boundary**: this plan covers ONLY the deltas from the feedback round. The core appointment lifecycle (state machine, cross-check, pricing, import worker) is already implemented and tested. This plan does NOT rewrite the module — it extends it.

## Summary

This plan delivers 6 feedback-round items for the appointment module:

| # | Item | Nature | Backend | Frontend |
|---|---|---|---|---|
| **4** | Multi-contact via 021 registry | Backend schema is ready (021). API contract must change: `contact:` → `contacts:[]` | ✅ Schema + use case revision | ✅ Form + drawer |
| **7** | Bulk edit (6 fields) | New endpoint | ✅ Use case + route | ✅ List checkbox + modal |
| **8** | Scheduled → Rejected | Backend already exists | ❌ None | ✅ Reject button on drawer |
| **10** | Sticky search | No backend change | ❌ None | ✅ FilterBar position + sticky CSS |
| **12** | Import template download | Static file | ❌ None | ✅ Download link + committed template file |
| **3** | Job Details source of truth | Enrich appointment detail response | ✅ Response shape enrichment | ❌ (consumer is 008-PWA) |

**What it does NOT do:**
- No state machine changes (all 14 transitions unchanged)
- No financial flow changes
- No contact registry changes (021 is done)
- No column drop on `appointment_contacts` (expand/contract)
- No `status` or `notes` in bulk edit (deferred — OQ-4)

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 + Fastify (backend), React 18.3 + Vite + Tailwind (web)
**Primary Dependencies**: Prisma ORM, Zod, shared AuditService, feature 021 `IContactRepository` + `appointmentContactsArraySchema`
**Storage**: PostgreSQL (Supabase) — no new tables; `appointment_contacts` junction columns already exist from 021 migration
**Testing**: Vitest (unit), Supertest (integration), Playwright (E2E for frontend items 8, 10, 12)
**Performance Goals**: Bulk edit of 100 rows must complete < 10 s synchronous. All existing p95 targets unchanged.

### Implemented Reality vs Approved Target

| Aspect | Current Code | Target (this plan) |
|---|---|---|
| Create payload `contact:` | Single `contactSchema` object | Array `contacts: appointmentContactsArraySchema` — each entry is `{ contactId }` or `{ inline }` with `role` + `isPrimary` |
| Update payload `contact:` | Single `contactSchema` object (optional) | Optional `contacts:` array with same schema; when present, replaces all junction rows (re-snapshot) |
| Appointment detail response | `contact: { tenantName, primaryEmail, ... }` (single) | `contacts: [{ role, isPrimary, snapshotName, snapshotEmail, snapshotPhone, contactId?, liveContact? }]` (array) |
| Appointment list response | `tenantName` from first contact | Same field (from `effectiveName` accessor — already done in 021) |
| Bulk edit endpoint | Does not exist | `POST /v1/appointments/bulk-edit` — 6 fields, 100 id limit, per-row guardrails |
| Scheduled → Rejected UI | Backend transition exists; no Reject button in drawer | Reject button on scheduled-appointment drawer (frontend only) |
| Sticky search | FilterBar not sticky | FilterBar sticky via CSS (frontend only, inherits 014 FR-019a) |
| Import template | No template file | Static XLSX at `apps/web/public/templates/appointments-import-template.xlsx` + download link |
| Job Details response | Missing PM contact, key details, inspection-app link | Enriched response per FR-080 |

### Modules Impacted

| Module | Impact | Nature |
|---|---|---|
| **`appointment/` (backend)** | Create/update use case revision (contacts array), bulk edit use case + route, detail response enrichment | Significant revision |
| **`packages/shared/`** | `createAppointmentSchema` revision (`contact:` → `contacts:`), `bulkEditAppointmentSchema` new, response types | Schema revision |
| **`apps/web/`** | Appointment form (contacts), list (sticky search, bulk edit UI, pencil removal), drawer (Reject button), import (template download) | Frontend features |
| **`apps/web/public/templates/`** | New static template file | New file |

### Key Architectural Decisions

1. **API contract change is breaking**: `contact:` → `contacts:[]` in the create/update payloads is a breaking change for frontend consumers. Since the web app is the only consumer and is deployed atomically with the backend, this is safe. The legacy `contactSchema` import is deprecated but kept in shared for any external consumer.

2. **Bulk edit is synchronous**: the spec explicitly says "initial implementation runs synchronously per row inside a single transaction per row". No worker, no pg-boss job. If 100 rows × ~50 ms each ≈ 5 s, this is within the 10 s budget. A future round can move to async if needed.

3. **Bulk edit `propertyManagerContactId`**: this field creates or updates an `appointment_contacts` junction row with `role = PROPERTY_MANAGER`. It does NOT replace the entire contacts array — it's an additive upsert of a single PM contact alongside existing contacts. This is different from the create/update replacement semantics.

4. **Job Details enrichment (FR-080)**: the appointment detail response gains additional sections. This is a response shape expansion, not a new endpoint. Feature 008's PWA consumes this expanded shape from `GET /v1/inspector/appointments/:id`.

5. **Backward compat during transition**: `createAppointmentSchema` accepts BOTH the old `contact:` (single object, deprecated) and the new `contacts:[]` (array). The use case detects which format is provided and normalizes to the array path. This prevents a hard break for any in-flight integration during rollout.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| **I. Clean Architecture** | ✅ | Bulk edit use case in `application/`. No domain logic in routes. |
| **II. Multi-Tenant Safety** | ✅ | Bulk edit scopes every row by tenant. `propertyManagerContactId` validated against the appointment's tenant. |
| **III. TDD** | ✅ | Bulk edit needs unit + integration tests. Frontend items need Playwright tests. |
| **IV. Contract-First** | ✅ | `appointmentContactsArraySchema` already exists (021). `bulkEditAppointmentSchema` new in shared. |
| **V. Simplicity** | ✅ | Bulk edit is synchronous (simplest approach). No new worker. Template is a static file. |
| **State Machine** | ✅ | Bulk edit explicitly excludes `status`. Scheduled → Rejected is UI only. |
| **Audit** | ✅ | Bulk edit produces per-row audit records. |

## Project Structure

### Source Code Changes

```text
# BACKEND — revised
apps/backend/src/modules/appointment/
├── application/use-cases/
│   ├── create-appointment.use-case.ts     # contacts array instead of single contact
│   ├── update-appointment.use-case.ts     # contacts array replacement
│   ├── get-appointment.use-case.ts        # enriched detail response (FR-080)
│   ├── list-appointment-contacts.use-case.ts  # reads from junction effective fields
│   └── bulk-edit-appointments.use-case.ts # NEW — FR-066..FR-069a
├── domain/
│   └── appointment.errors.ts              # NEW error codes for bulk edit
└── interfaces/
    └── appointment.routes.ts              # NEW route: POST /v1/appointments/bulk-edit

# SHARED — revised
packages/shared/src/schemas/
├── appointment.ts                         # createAppointmentSchema revision + bulkEditSchema
└── contact.ts                             # Already has appointmentContactsArraySchema (021)

# FRONTEND — revised + new
apps/web/src/features/appointments/
├── components/
│   ├── AppointmentForm.tsx               # contacts array field (select + inline)
│   ├── AppointmentContactTab.tsx         # multi-contact display
│   ├── BulkEditModal.tsx                 # NEW — bulk edit UI
│   └── AppointmentDrawer.tsx             # Reject button for SCHEDULED
├── pages/
│   └── AppointmentListPage.tsx           # sticky FilterBar, bulk edit checkbox selection
└── ...

apps/web/public/templates/
└── appointments-import-template.xlsx      # NEW — static template file
```

## Execution Strategy

### Phase 1 — Backend: Multi-contact API + Detail Enrichment (FR-004a, FR-080)

**Serial — must complete before frontend can consume the new API shape.**

| Step | What | Depends On |
|---|---|---|
| 1.1 | Revise `createAppointmentSchema` in shared: add `contacts: appointmentContactsArraySchema` alongside deprecated `contact:`. Use `.refine()` to accept either but not both. | 021 done |
| 1.2 | Revise `updateAppointmentSchema`: add optional `contacts:` array with replacement semantics | 1.1 |
| 1.3 | Revise `CreateAppointmentUseCase`: detect `contacts` (new) vs `contact` (legacy) in payload. For new path: iterate array, call `IContactRepository` for inline creates, snapshot each, save junction rows. For legacy path: wrap single contact in junction shape (backward compat). | 1.1 |
| 1.4 | Revise `UpdateAppointmentUseCase`: when `contacts` array present, delete old junction rows + insert new (within transaction). Enforce exactly-one-primary. Empty array rejected with `APPOINTMENT_CONTACTS_REQUIRED`. | 1.2 |
| 1.5 | Revise `GetAppointmentUseCase` response: include full `contacts[]` array with snapshot fields + optional live contact data (JOIN to `contacts` table when `contact_id IS NOT NULL`). Include key info, PM section resolved from junction row with `role = PROPERTY_MANAGER`, `inspectionAppLink` from tenant settings (FR-080). | — |
| 1.6 | Revise `ListAppointmentContactsUseCase`: read from junction `effective*` fields (already mostly done by 021, verify correctness) | — |
| 1.7 | Update appointment route handlers for new payload/response shapes | 1.3, 1.4, 1.5 |
| 1.8 | Integration tests: create with `contacts[]`, create with legacy `contact:` (backward compat), update with replacement, detail enrichment, PM live data in response | 1.7 |

**Checkpoint**: `POST /v1/appointments` accepts `contacts:[]` array. Legacy `contact:` still works. `GET /v1/appointments/:id` returns enriched shape with `contacts[]`. All existing appointment tests still pass.

### Phase 2 — Backend: Bulk Edit (FR-066..FR-069a)

**Can run in parallel with Phase 3 frontend items that don't need the bulk-edit API.**

| Step | What | Depends On |
|---|---|---|
| 2.1 | Create `bulkEditAppointmentSchema` in shared package — `{ ids: string[].max(100), changes: partial of allowed fields }` with field whitelist validation | — |
| 2.2 | Add bulk edit error codes to `appointment.errors.ts`: `APPOINTMENT_BULK_FIELD_NOT_ALLOWED`, `APPOINTMENT_BULK_LIMIT_EXCEEDED`, `APPOINTMENT_BULK_BRANCH_CHANGE_NOT_ALLOWED` | — |
| 2.3 | Create `BulkEditAppointmentsUseCase`: validate allowed fields (reject unknown early), iterate rows, per-row: load appointment + verify tenant scope, apply field-specific guardrails (status eligibility, inspector active + not blocked, branch DRAFT-only, service type DRAFT-only with re-price, PM contact from registry), write audit per row. Return `{ updated: count, failed: [{ id, error }] }` | Phase 1 (uses `IContactRepository` for PM contact) |
| 2.4 | Add `POST /v1/appointments/bulk-edit` route: AM/OP only, validate via `bulkEditAppointmentSchema`, call use case | 2.3 |
| 2.5 | Integration tests: happy path (multiple fields), forbidden fields rejected, per-row errors (mixed success/failure), 100 limit, AM/OP only, CL roles → 403, PM contact junction row created with snapshot, tenant scoping | 2.4 |

**Checkpoint**: Bulk edit endpoint works for all 6 allowed fields. PM contact creates junction rows with snapshots. Failed rows don't block successful ones.

### Phase 3 — Frontend: All UI Items

**Can partially parallel with Phase 2. Items 3.2–3.5 have no backend dependency.**

| Step | What | Depends On | Parallel? |
|---|---|---|---|
| 3.1 | Appointment form: replace single contact input with contacts array (autocomplete search via `GET /v1/contacts?search=` + inline create) | Phase 1 (API ready) | — |
| 3.2 | Appointment drawer: add Reject button for `SCHEDULED` status (US9). Wires to `POST /v1/appointments/:id/status-transitions` with `{ targetStatus: 'REJECTED' }` + reason modal. | — (backend exists) | ✅ |
| 3.3 | Appointment list: sticky FilterBar (CSS `position: sticky; top: 0; z-index: 10`) — inherits 014 FR-019a | — | ✅ |
| 3.4 | Appointment list: remove pencil icon — inherits 014 FR-019b | — | ✅ |
| 3.5 | Appointment import: commit template XLSX at `apps/web/public/templates/appointments-import-template.xlsx`, add "Download template" `<a>` next to file upload (US7/FR-065) | — | ✅ |
| 3.6 | Appointment list: bulk edit checkbox selection + BulkEditModal. Fields: `assignedInspectorId` (inspector autocomplete), `scheduledDate` (date picker), `timeSlot` (slot selector), `branchId` (branch dropdown), `serviceTypeId` (service type dropdown), `propertyManagerContactId` (contact autocomplete filtered to PM type). | Phase 2 (API ready) | — |
| 3.7 | Appointment detail drawer: show multi-contact list with roles, primary badge, snapshot vs live indicator | Phase 1 (API ready) | — |

**Checkpoint**: All frontend items render correctly. Reject button wires to existing endpoint. Bulk edit modal submits correctly. Sticky search works. Template downloads.

### Phase 4 — Verification

| Step | What |
|---|---|
| 4.1 | `pnpm typecheck` all workspaces |
| 4.2 | `pnpm lint` all workspaces |
| 4.3 | `pnpm test` all workspaces |
| 4.4 | Verify no new Prisma migration needed (021 migration covers all schema changes) |
| 4.5 | Verify legacy `contact:` field in create payload still works (deprecated compat) |
| 4.6 | Playwright E2E: Reject button, bulk edit flow, sticky search, template download |

## Testing Strategy

### Unit Tests

| Subject | What |
|---|---|
| `BulkEditAppointmentsUseCase` | Allowed field validation, per-row guardrails (status eligibility, inspector checks, branch DRAFT-only), 100 limit, AM/OP RBAC, PM contact snapshot, audit per row |
| `bulkEditAppointmentSchema` (Zod) | Valid payloads, forbidden fields rejected, max ids, empty ids rejected |
| `createAppointmentSchema` (revised) | `contacts:[]` valid, empty rejected, two primaries rejected, legacy `contact:` compat, both `contact` + `contacts` → error |

### Integration Tests (Backend)

| Subject | What |
|---|---|
| Create with `contacts:[]` | `contactId` reference → junction + snapshot, `inline` → registry + junction, exactly-one-primary enforced |
| Create with legacy `contact:` | Backward compat — still creates a single junction row with snapshot |
| Update with `contacts:[]` replacement | Old junction rows deleted, new snapshots captured, portal token survives |
| Bulk edit happy path | 5 rows, `branchId` + `assignedInspectorId` change, per-row audit records |
| Bulk edit per-row guardrails | Inactive inspector → per-row error, DONE appointment → per-row error, rest succeed |
| Bulk edit forbidden fields | `status` in changes → whole request rejected before any row touched |
| Bulk edit PM contact | `propertyManagerContactId` → junction row with `role = PM` + snapshot |
| Bulk edit tenant scoping | OP can only edit own-tenant appointments; cross-tenant ids silently fail |
| Detail enrichment (FR-080) | `contacts[]` array in response, PM live data, key info, `inspectionAppLink` |

### Frontend (Playwright)

| Subject | What |
|---|---|
| Reject button | Click on SCHEDULED appointment drawer → Reject → enter reason → confirm → verify status changed |
| Bulk edit | Select 3 rows → open modal → change inspector → submit → verify updated |
| Sticky search | Scroll list → FilterBar stays at top |
| Import template | Click "Download template" → file downloads |
| Multi-contact form | Create appointment with 2 contacts (1 from autocomplete, 1 inline) → verify both appear in detail |

## Residual Risks & Assumptions

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Breaking API change** (`contact:` → `contacts:[]`) | Medium | Backward compat: both accepted during transition. Atomic deploy. PWA only reads, doesn't create. |
| **Bulk edit perf** on 100 rows | Low | Synchronous. 100 × 50 ms = 5 s. Budget is 10 s. |
| **Contact replacement in update** deletes junction rows | Medium | Portal token survives (bound to `appointment_id`). Tested explicitly. Re-snapshot intentional. |
| **Import worker** still creates legacy-shape contacts | Low | Worker already populates both legacy + snapshot fields (021 Phase 3). Full registry-aware import is 021#GAP-001. |

### Assumptions

1. **021 is done and stable**. Contact registry, junction schema, migration, all handlers updated.
2. **No new Prisma migration**. All schema changes applied by 021.
3. **Frontend items 8, 10, 12 are small** — single component or CSS change each.
4. **Bulk edit is AM/OP only**. CL_USER bulk-edit explicitly deferred.
5. **`inspectionAppLink`** is deferred. No key, schema, or CRUD for this field exists anywhere in the codebase. It will be defined when feature 008 (PWA Job Details) is planned. FR-080's enriched response includes contacts, PM, key info — but NOT `inspectionAppLink` in this round.

### Scope Fences (explicitly NOT in this plan)

| What | Why |
|---|---|
| `inspectionAppLink` in detail response | No implementation exists. Feature 008 will define the tenant-settings key when PWA Job Details is planned |
| Bulk edit `status` / `notes` | OQ-4 — deferred pending product decision |
| Contact import (CSV) | 021#GAP-001 — future round |
| Notification fan-out to all contacts | 006#GAP-011 — deferred |
| Column drop on `appointment_contacts` | Expand/contract — separate migration later |
| PWA Job Details screen rendering | Feature 008 scope — consumes FR-080 output |
| Contact autocomplete shared component | Built inline in appointment form or as 014 pattern — plan-phase decision, not a blocker |
