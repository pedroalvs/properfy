# Implementation Plan: 008-inspectors-execution (Feedback Round Deltas)

**Branch**: `008-inspectors-execution` | **Date**: 2026-04-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feedback Round 2026-04-13 items 1, 2, 3, 5, 6 on top of existing IMPLEMENTED Phase 1.
**Dependencies**: Feature 021-contacts (IMPLEMENTED), Feature 006-appointments (IMPLEMENTED — contacts[], junction + snapshot, detail enrichment FR-080), Feature 010-billing-ledger (IMPLEMENTED — `PENDING_REVIEW` status, approve/reject endpoints FR-066/FR-067)

> **Scope boundary**: this plan covers ONLY the deltas from the feedback round. The core execution flow (start, finish, assets, T-1 rule, idempotency) is already implemented and tested. This plan does NOT rewrite the module — it extends it.

## Summary

This plan delivers 5 feedback-round items for the inspector/execution module:

| # | Item | Nature | Backend | Frontend (Web) | Frontend (PWA) |
|---|---|---|---|---|---|
| **1** | Blocked-clients model inversion | Schema migration + logic change | ✅ Migration + use case + marketplace | ✅ Multi-select dropdown | — |
| **6** | Inspector profile fields | Schema migration + CRUD | ✅ Migration + entity + use case | ✅ Profile form | ✅ Profile screen |
| **2** | Schedule date extras | Response enrichment | ✅ agencyName + keyRequired in schedule | — | ✅ Key icon + agency name |
| **3** | Job Details enrichment | Response enrichment + PWA screen | ✅ 7-section jobDetails payload | — | ✅ Job Details screen |
| **5** | Draft invoice initiation | Thin delegation endpoint | ✅ Route in 008, use case in 010 | — | ✅ Earnings > Draft Invoice |
| **9** | Availability slots (PWA) | ALIGNMENT — no new scope | — | — | ⚠️ UI polish only |

**What it does NOT do:**
- No execution flow changes (start, finish, assets all unchanged)
- No T-1 rule changes
- No state machine changes
- No contact registry changes (021 done)
- No appointment CRUD changes (006 done)
- No per-agency credential management (OQ-1 — deferred)
- No expiration lifecycle for insurance/police check (OQ-3 — deferred)
- No mandatory/optional field obligation levels (OQ-2 — all new fields nullable for now)

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 + Fastify (backend), React 18.3 + Vite + Tailwind (web admin), React + Vite + Tailwind (PWA)
**Primary Dependencies**: Prisma ORM, Zod, shared AuditService, feature 021 `IContactRepository`, feature 010 `DraftInspectorInvoiceUseCase` (billing domain)
**Storage**: PostgreSQL (Supabase) — NEW migration for inspector columns + blocked_clients. Supabase Storage for document uploads.
**Testing**: Vitest (unit + integration), Playwright (E2E for PWA)
**Performance Goals**: Schedule p95 < 300ms (unchanged). Draft invoice p95 < 1s.

### Implemented Reality vs Approved Target

| Aspect | Current Code | Target (this plan) |
|---|---|---|
| Client eligibility | `client_eligibility_json` — allow-list of eligible tenants | `blocked_clients_json` — block-list. Empty = fully eligible. Data migration: complement of old list. |
| Inspector profile | `name`, `email`, `phone`, `status` only | Add `full_name`, `address` (jsonb), `abn`, `date_of_birth`, `insurance_file_key`, `insurance_expires_at`, `police_check_file_key`, `police_check_expires_at` |
| Schedule response | Appointment basic fields only | Add `agencyName` (tenant name JOIN) + `keyRequired` per row |
| Job Details response | Thin placeholder (`get-appointment-detail.use-case.ts`) | 7-section `jobDetails` payload: agency, tenantContacts, keys, keyLocation, propertyManager, payment, inspectionAppLink |
| Draft invoice | Does not exist | `POST /v1/inspector/invoices/draft` — thin route delegating to 010's `DraftInspectorInvoiceUseCase` |
| `inspectionAppLink` | No code exists | Define `inspection_app_link` key in `tenant.settings_json`. Read in Job Details. |

### Key Architectural Decisions

1. **Blocked-clients migration**: one-time data migration computes `blocked_clients_json = complement(client_eligibility_json, active_tenant_ids)`. The migration is in SQL inside the Prisma migration file. After migration, `client_eligibility_json` is deprecated but kept during the expand phase (no column drop).

2. **Profile fields all nullable**: OQ-2 (mandatory vs optional) is unresolved. All new fields are nullable. The UI shows them as optional. When OQ-2 resolves, a follow-up adds NOT NULL constraints on whichever fields become mandatory.

3. **Insurance/police check expiration**: OQ-3 (lifecycle consequences) is unresolved. We persist the dates and index them. No behavioral consequences in this round — no blocking, no notifications, no auto-deactivation. The dates are queryable for future "expiring soon" reports.

4. **`inspectionAppLink`**: defined as a key `inspectionAppLink` inside `tenant.settings_json`. No new column on the tenants table. The admin manages it through the existing tenant settings CRUD. The Job Details response reads it via the existing `tenantRepo.findById()` → `settingsJson.inspectionAppLink`. If absent, the field is omitted from the response.

5. **Draft invoice ownership split**: the HTTP route (`POST /v1/inspector/invoices/draft`) lives in 008's interfaces layer. The use case (`DraftInspectorInvoiceUseCase`) lives in 010's application layer. 008's handler is a thin delegation: validate JWT → resolve inspectorId → call billing use case → return result. This split was decided during the spec sanity-check (see 008 FR-060).

6. **Job Details consumes 006's enriched response**: the `GET /v1/inspector/appointments/:id` response already loads appointment + contacts + property + branch via `AppointmentWithRelations`. The enhancement adds structured sections (agency, tenantContacts, keys, PM, payment, inspectionAppLink) by reshaping this existing data — no new repository queries needed except the tenant settings read.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| **I. Clean Architecture** | ✅ | Draft invoice use case in billing domain, not in inspector module. Inspector profile fields on entity, not in routes. |
| **II. Multi-Tenant Safety** | ✅ | Blocked-clients inverts the model but preserves tenant isolation. Marketplace filtering checks `blocked_clients_json` per tenant. |
| **III. TDD** | ✅ | Migration tests, blocked-clients logic tests, Job Details integration tests, draft invoice tests. |
| **IV. Contract-First** | ✅ | Zod schemas for new fields in shared package. Schedule response shape documented. |
| **V. Simplicity** | ✅ | Profile fields are nullable. No expiration lifecycle. No credential manager. Draft invoice is thin delegation. |
| **State Machine** | ✅ | Untouched. |
| **Audit** | ✅ | Inspector create/update audit includes new fields. Draft invoice audited via billing module. |

## Project Structure

### Source Code Changes

```text
# BACKEND — migrations + domain + use cases + routes
apps/backend/prisma/
└── migrations/YYYYMMDDHHMMSS_inspector_profile_blocked_clients/ # NEW migration

apps/backend/src/modules/inspector/
├── domain/
│   └── inspector.entity.ts                    # Add profile + blocked_clients fields
├── application/use-cases/
│   ├── create-inspector.use-case.ts           # Accept new fields
│   ├── update-inspector.use-case.ts           # Accept new fields + blocked_clients
│   └── list-inspectors.use-case.ts            # Filter by blocked_clients (marketplace inversion)
├── infrastructure/
│   └── prisma-inspector.repository.ts         # Map new columns
└── interfaces/
    └── inspector.routes.ts                     # Validate new fields via Zod

apps/backend/src/modules/inspector-execution/
├── application/use-cases/
│   ├── get-inspector-schedule.use-case.ts      # Add agencyName + keyRequired
│   └── get-appointment-detail.use-case.ts      # Add 7-section jobDetails
└── interfaces/
    └── inspector-execution.routes.ts           # Draft invoice thin route

# SHARED
packages/shared/src/schemas/
├── inspector.ts                                # Add profile fields + blockedClients schema
└── inspector-execution.ts                      # Add draftInvoice schema

# FRONTEND (Web Admin)
apps/web/src/features/inspectors/
├── components/
│   ├── InspectorFormDrawer.tsx                 # Profile fields + blocked-clients dropdown
│   └── InspectorDetailSections.tsx             # Display new profile data
└── pages/
    └── InspectorListPage.tsx                   # Pencil removal (014 FR-019b)

# FRONTEND (PWA)
apps/pwa/src/features/
├── schedule/
│   ├── components/
│   │   ├── ScheduleAppointmentCard.tsx         # Agency name + key icon
│   │   └── JobDetailsScreen.tsx                # NEW — 7-section layout
│   └── hooks/
│       └── useInspectorAppointment.ts          # Consume enriched response
├── earnings/
│   └── components/
│       └── DraftInvoiceScreen.tsx              # NEW — period picker + preview + submit
└── profile/
    └── components/
        └── ProfileScreen.tsx                   # Profile fields + document upload
```

## Execution Strategy

### Phase 1 — Schema + Shared + Domain (serial, blocks everything)

| Step | What |
|---|---|
| 1.1 | Add new columns + enums to Prisma schema: `blocked_clients_json`, `full_name`, `address`, `abn`, `date_of_birth`, `insurance_file_key`, `insurance_expires_at`, `police_check_file_key`, `police_check_expires_at` on Inspector model |
| 1.2 | Generate Prisma migration with data migration SQL: compute `blocked_clients_json` from complement of `client_eligibility_json` |
| 1.3 | Update `InspectorEntity` domain class with new fields |
| 1.4 | Update shared Zod schemas for inspector create/update: add profile fields + `blockedClientsJson` |
| 1.5 | Update `PrismaInspectorRepository` mapper |
| 1.6 | Unit tests for blocked-clients complement logic |

**Checkpoint**: migration applies cleanly. Typecheck passes. Entity has new fields.

### Phase 2 — Backend: Inspector CRUD + Marketplace (FR-006a, FR-006b)

| Step | What |
|---|---|
| 2.1 | Revise `CreateInspectorUseCase` + `UpdateInspectorUseCase` to accept and persist new fields |
| 2.2 | Invert marketplace eligibility logic: inspector is eligible when tenant NOT in `blockedClientsJson` (was: tenant IN `clientEligibilityJson`) |
| 2.3 | Revise `ListInspectorsUseCase` — OP filter uses `blockedClientsJson` for tenant scoping |
| 2.4 | Update inspector route handlers for new payload/response shapes |
| 2.5 | Integration tests: create with profile fields, update blocked_clients, marketplace filtering inversion |

**Checkpoint**: inspector CRUD works with new fields. Marketplace uses block-list model.

### Phase 3 — Backend: Schedule + Job Details + Draft Invoice (FR-022, FR-023, FR-060)

| Step | What |
|---|---|
| 3.1 | Revise `GetInspectorScheduleUseCase` — add `agencyName` (tenant name JOIN) + `keyRequired` to each schedule row |
| 3.2 | Revise `GetAppointmentDetailUseCase` — build 7-section `jobDetails` payload: agency (tenant name+id), tenantContacts (snapshot from junction, primary first), keys (keyRequired + keyLocation), keyLocation (address + map link generation), propertyManager (live registry data from junction PM row), payment (payoutAmount + currency from pricing snapshot), inspectionAppLink (from tenant settings_json) |
| 3.3 | Define `inspectionAppLink` key convention in tenant settings: `settingsJson.inspectionAppLink = { url: string, label: string }`. Read via existing `tenantRepo` in the detail use case. |
| 3.4 | Create thin delegation route `POST /v1/inspector/invoices/draft` in inspector-execution routes — validate INSP + inspectorId, parse `{ periodStart, periodEnd }` via Zod, call `DraftInspectorInvoiceUseCase` from billing module, return result |
| 3.5 | Create `DraftInspectorInvoiceUseCase` in `apps/backend/src/modules/billing/application/use-cases/` — aggregate approved INSPECTOR_PAYOUT entries for the period, create InspectorInvoice in PENDING_REVIEW, check overlap, emit audit |
| 3.6 | Wire draft invoice in DI container (billing use case injected into inspector-execution routes) |
| 3.7 | Integration tests: schedule with agencyName/keyRequired, Job Details 7 sections, draft invoice happy path + empty period + overlap |

**Checkpoint**: schedule shows agency name + key icon data. Job Details has full 7-section payload. Draft invoice creates PENDING_REVIEW row.

### Phase 4 — Frontend: Web Admin (Inspector Form + List)

| Step | What |
|---|---|
| 4.1 | Inspector form: add profile fields (full_name, address, abn, dob) + document upload (insurance, police check) + expiration date pickers |
| 4.2 | Inspector form: replace client eligibility checkbox list with blocked-clients multi-select dropdown |
| 4.3 | Inspector detail: display new profile data + document links + expiration dates |
| 4.4 | Inspector list: pencil removal (014 FR-019b) |

### Phase 5 — Frontend: PWA (Schedule + Job Details + Earnings + Profile)

| Step | What |
|---|---|
| 5.1 | Schedule card: render `agencyName` and key icon when `keyRequired = true` |
| 5.2 | Job Details screen: render 7 sections from the enriched response |
| 5.3 | Earnings > Draft Invoice: period picker + preview entries + submit to draft endpoint |
| 5.4 | Profile screen: self-service profile fields + document upload |

### Phase 6 — Verification

| Step | What |
|---|---|
| 6.1 | `pnpm typecheck` all workspaces |
| 6.2 | `pnpm test` all workspaces |
| 6.3 | Prisma validate + migration status clean |
| 6.4 | Verify `client_eligibility_json` deprecated but not dropped |

## Testing Strategy

### Unit Tests
- Blocked-clients complement computation (data migration helper)
- Marketplace eligibility inversion logic
- Job Details section builder (mapping from AppointmentWithRelations to 7 sections)
- Draft invoice period validation + overlap detection
- Inspector entity with new profile fields

### Integration Tests
- Inspector create/update with profile fields + blocked_clients
- Marketplace filtering: inspector blocked from tenant A, eligible for tenant B
- Schedule response includes agencyName + keyRequired
- Job Details: tenant contacts (snapshot), PM (live registry), keys, payment, inspectionAppLink
- Draft invoice: happy path, empty period, overlap, non-INSP forbidden
- Legacy inspector (pre-migration) with empty blocked_clients = eligible for all

### Frontend (Playwright)
- PWA: Schedule shows agency name + key icon
- PWA: Job Details renders all 7 sections
- PWA: Draft Invoice flow end-to-end
- Web: Inspector form with blocked-clients dropdown

## Residual Risks & Assumptions

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Blocked-clients migration on production data** | Medium | Migration is complement-based (eligible → blocked). Test with staging data. Roll back = restore `client_eligibility_json` from backup. |
| **OQ-2 obligation levels still open** | Low | All new fields nullable. No NOT NULL constraints until OQ-2 resolves. |
| **OQ-3 expiration lifecycle still open** | Low | Dates stored + indexed. No behavioral consequences yet. |
| **Draft invoice use case crosses module boundary** | Low | Ownership split is explicit: 008 owns the route, 010 owns the use case. DI injection is clean. |
| **`inspectionAppLink` has no admin UI for setting it** | Medium | The key lives in `tenant.settings_json`. Tenant settings CRUD already exists. A small UI affordance for this specific key may be needed — or operators set it via the generic settings editor. |

### Assumptions

1. **021, 006, 007 are done and stable.** Contact registry, junction pattern, portal dual-write all working.
2. **010 billing module has PENDING_REVIEW status + approve/reject endpoints.** These were specified in the 010 spec update but may not be implemented yet. If not implemented, the draft invoice route returns 501 until 010 delivers. This is a dependency, not a blocker for planning.
3. **All new profile fields are nullable.** OQ-2 unresolved. Schema uses nullable columns with no defaults (except `blocked_clients_json` which defaults to `[]`).
4. **No auto-deactivation on expired documents.** OQ-3 unresolved.
5. **OQ-1 (per-agency credentials) explicitly excluded.** The PWA MUST NOT surface credential management.

### Scope Fences

| What | Why |
|---|---|
| Per-agency login credentials | OQ-1 — deferred |
| Document expiration lifecycle | OQ-3 — deferred |
| Mandatory profile field enforcement | OQ-2 — deferred |
| Column drop on `client_eligibility_json` | Expand/contract — separate migration |
| Availability slot booking automation | GAP-003 — separate feature |
| Geolocation verification at start | GAP-001 — separate feature |
| Contact registry CRUD | Feature 021 — done |
| Appointment creation/update | Feature 006 — done |
| Portal contact semantics | Feature 007 — done |
