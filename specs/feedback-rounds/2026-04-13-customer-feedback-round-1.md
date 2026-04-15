# Customer Feedback Round 1 — 2026-04-13

**Status**: spec-level only (no code). Implementation will be planned in a follow-up `/speckit.plan` pass once the updated specs are approved.
**Created**: 2026-04-13
**Owner**: _unassigned_
**Scope**: 12 feedback items from customer review affecting inspector onboarding, PWA schedule/job-details, appointment contact model, PWA earnings/invoice generation, inspector profile data, appointments bulk edit, state-machine extension, PWA availability, appointments UX, cross-cutting listing UX, and import-data UX.

This document is the single index for the round. Each item is tagged `APPROVED` (direction fixed, ready for planning), `OPEN QUESTION` (decision pending, cannot be implemented yet), or `ALIGNMENT` (spec text didn't match existing behavior or a pre-existing plan — no new scope, only reconciliation).

---

## Index

| # | Title | Class | Affected specs | Status |
|---|---|---|---|---|
| 1 | Inspector — invert client eligibility (non-eligible dropdown) | APPROVED | 008-inspectors-execution | Spec updated |
| 2 | PWA Schedule date — agency name + keys icon | APPROVED | 008-inspectors-execution (US6), 006-appointments (read source) | Spec updated |
| 3 | PWA Job Details — agency/contact/keys/location/PM/payment/app link | APPROVED with 1 open question | 008-inspectors-execution | Spec updated + open question registered |
| 4 | Appointment — multiple tenant contacts | APPROVED | 006-appointments (+ data-model), 007-tenant-portal (inherits) | Spec updated |
| 5 | PWA Earnings — inspector generates invoice and sends to admin | APPROVED | 010-billing-ledger, 008-inspectors-execution | Spec updated |
| 6 | Inspector profile — full name, address, ABN, insurance, police check, DOB, doc expiry | APPROVED with open questions on mandatory vs optional | 008-inspectors-execution (+ data-model) | Spec updated + open questions registered |
| 7 | Appointments — bulk edit of specific fields | APPROVED | 006-appointments | Spec updated with initial field list + guardrails |
| 8 | Appointments — allow Scheduled → Rejected transition | **ALIGNMENT (backend already correct) + APPROVED (frontend affordance)** | 006-appointments (backend state machine already has the transition — verified in code), web frontend (Reject button missing from drawer) | Spec updated + reclassified |
| 9 | PWA availability slots | ALIGNMENT | 008-inspectors-execution (US3 already exists) | Confirmed alignment, no change to scope |
| 10 | Appointments filters — sticky top search | APPROVED | 006-appointments (US6), 014-frontend-app-shell-ux | Spec updated |
| 11 | Listings — remove pencil when duplicated with eye | APPROVED (cross-cutting UX) | 014-frontend-app-shell-ux | Spec updated as a transversal pattern |
| 12 | Import data — downloadable template file | APPROVED | 003-properties, 006-appointments, 014-frontend-app-shell-ux | Spec updated |

---

## Open Questions / Pending Decisions

### OQ-1 — Item 3: per-agency inspector login credentials

The customer asked for a surface to manage **username and password per agency / broker** inside the PWA job details. This was explicitly excluded from the approved scope of this round.

**State**: `OPEN QUESTION — pending decision`
**What is deferred**:
- Whether there is a per-agency credential (distinct from the Properfy inspector account)
- Where those credentials are stored (per-tenant record? per-inspector-tenant mapping?)
- Whether the PWA should surface them at all, or whether this is a manual workaround outside the app
- Security / encryption-at-rest posture for any stored third-party credential
- Whether the agency's portal supports a credential-rotation workflow that Properfy can integrate with

**Why deferred**: no product decision has been taken, and the feature touches credential storage of third-party systems, which is a larger compliance surface than the rest of the round. Needs a dedicated discussion before it enters spec scope.

**Owner**: _unassigned_
**Target review date**: _not set_

### OQ-2 — Item 6: mandatory vs optional inspector profile fields

The round adds these inspector profile fields: `fullName`, `address`, `abn`, `insurance` (file + expiration), `policeCheck` (file + expiration), `dateOfBirth`.

**State**: `OPEN QUESTION — pending decision` on obligation levels.

**What is deferred**:
- Which fields are **mandatory** at onboarding vs **optional** vs **required before first inspection assignment**
- Whether `insurance` and `policeCheck` expiration dates are mandatory (the documents themselves being uploadable doesn't mean expiration tracking is required by the product)
- Whether `dateOfBirth` is mandatory — typically regulatory but depends on jurisdiction

**Why deferred**: obligation levels have compliance and onboarding-UX implications that need a product decision rather than an engineering inference. The spec will reflect the fields as persisted + validated structurally, with a note that obligation levels are TBD.

**Owner**: _unassigned_
**Target review date**: _not set_

### OQ-3 — Item 6: lifecycle of expired documents

Inspector `insurance` and `policeCheck` carry expiration dates and the customer wants "annual expiration" tracked.

**State**: `OPEN QUESTION — pending decision`

**What is deferred**:
- What happens operationally when a document expires: does the inspector become unavailable in the marketplace? Are future appointments blocked? Is there a grace period? A soft warning?
- Who is notified (the inspector alone, the operator, both)?
- How far in advance is the warning sent (7 days? 30? 90?)
- Does an expired `insurance` cause an in-progress inspection to halt mid-flow?

**Why deferred**: this is policy, not pattern — needs a product call. The spec will declare that the dates are persisted and queryable, but the behavioral consequences of expiration are intentionally left open.

**Owner**: _unassigned_
**Target review date**: _not set_

### OQ-4 — Item 7: bulk-edit of `status` and `notes` fields

The feedback round proposed a pragmatic initial set of bulk-editable fields. Two items on that list carry operational risk and are explicitly conditional:

- `status` — bulk status transitions are dangerous because the appointment state machine has per-transition guardrails (reason required, actor role, side effects like financial entries). A bulk operation that bypasses these guardrails would destabilise the ledger and audit trail.
- `notes` / internal notes — benign but needs confirmation about whether bulk append vs bulk overwrite is the intended semantic.

**State**: `OPEN QUESTION — pending decision` on both.

**What is deferred**:
- Whether `status` is included in bulk-edit at all. If yes, **which** transitions (probably only a small safe subset like `DRAFT → AWAITING_INSPECTOR`), and whether the bulk path enforces the same `reason` requirement as the single-appointment path.
- Whether `notes` bulk semantic is append, overwrite, or prompt-per-row. Overwrite silently destroys existing notes and is probably wrong; append is safer but changes the UX.

**Why deferred**: the state-machine impact is operational, not cosmetic. The spec will ship the initial bulk-edit set **without** `status` and **without** `notes` until these two questions are resolved. The other proposed fields (inspector, date/time, branch, service type, agency contact) are included in the approved set.

**Owner**: _unassigned_
**Target review date**: _not set_

---

## Approved decisions that don't need further discussion

These are the decisions the spec update treats as fixed direction. If any of them is actually uncertain, flag it before the next `/speckit.plan` pass.

- **Item 1**: inverted eligibility logic is the new default (opt-out, not opt-in). The UI becomes a multi-select dropdown. The persisted data is a list of **blocked tenant ids** per inspector.
- **Item 2**: the PWA schedule date view displays the agency (tenant) name next to each appointment block, and renders a `key` icon when `appointment.key_required = true`.
- **Item 3**: the PWA job details view adds 7 sections: agency, tenant contact(s), keys, key location (with map link), property manager / broker, payment, inspection-app link. The 8th section (per-agency credentials) is OQ-1. **Architectural revision**: tenant contacts are resolved from `appointment_contacts` junction snapshots; PM/broker contacts are resolved from the live `contacts` registry (feature 021). See `specs/008-inspectors-execution/spec.md` US6a.
- **Item 4**: contacts are promoted to a **per-tenant registry** (feature 021). `appointment_contacts` becomes a junction + snapshot table linking appointments to registry contacts. Multiple contacts per appointment are supported, each with a contextual role and `is_primary` flag. Additional emails/phones live on the `contacts` registry entity, not on the junction. The primary contact retains its role for notifications and tenant portal. See `specs/021-contacts/spec.md` for the registry architecture and `specs/006-appointments/data-model.md` for the revised junction schema.
- **Item 5**: inspectors can initiate invoice creation from the PWA Earnings screen. The generated invoice follows the existing 010 `InspectorInvoice` model and is marked as `PENDING_REVIEW` (new status) until admin confirms. No new external financial integration.
- **Item 6**: fields are added to the inspector profile. Obligation levels → OQ-2. Expiration policy → OQ-3.
- **Item 7**: initial bulk-edit set = `{ assignedInspector, scheduledDate, timeSlot, branch, serviceType, propertyManagerContact }`. Excludes `status` and `notes` pending OQ-4. `propertyManagerContact` now references a `contacts.id` from the tenant's contact registry (feature 021) with `type = PROPERTY_MANAGER`.
- **Item 8**: the `SCHEDULED → REJECTED` transition **already exists** in the backend state machine (`appointment-state-machine.ts` rule at `from: SCHEDULED, to: REJECTED`, allowed actors `OP, SYS`, mandatory reason — verified in code during this spec pass). The customer's report was actually about a **missing frontend affordance** — the `Appointments > Scheduled > Full detail` drawer has no Reject button. The plan-phase work is therefore pure frontend: add the Reject action on the web drawer, wire it to the existing `POST /v1/appointments/:id/status-transitions` endpoint. No backend change. This item is reclassified as **ALIGNMENT (backend) + APPROVED (frontend)**.
- **Item 9**: PWA availability slots is already in 008 US3 — the round only confirms this is production-ready direction, no new scope.
- **Item 10**: appointments list has a search filter as the first item in the filter bar, and that filter + its row stays sticky at the top of the scroll container.
- **Item 11**: wherever a list row has both `view` (eye) and `edit` (pencil) and they open the same drawer/modal, only `view` remains. Edit lives inside the drawer when applicable. This is a transversal UX pattern — feature specs that list it (006, 003, 004, 008) inherit it without per-spec changes other than referencing the 014 pattern.
- **Item 12**: every import-data screen exposes a downloadable template file (XLSX or CSV — matching the same format the importer accepts). The template's columns mirror the importer's expected columns. Location: near the file-upload affordance, labelled "Download template". No change to the importer itself.

---

## What this round is NOT

- Not a refactor of the appointment state machine. Only the single `SCHEDULED → REJECTED` transition is added.
- Not a redesign of the invoice ledger. Only a new "inspector-initiated draft" entry point that creates an existing `InspectorInvoice` in a new status.
- Not a rewrite of the inspector availability system. US3 in 008 already covers it — this round only confirms alignment.
- Not a generic bulk-edit engine. Only the 6 fields in item 7 are in scope for this round.
- Not a third-party credential manager (OQ-1).
- Not an auto-deactivation policy for expired documents (OQ-3).
- Not a CRM. Feature 021 (contacts) is a lightweight per-tenant contact book, not a contact merge/dedup engine, not an activity tracker, not a pipeline manager.

---

## Cross-references

Each affected spec has been updated with a back-reference to this document under its "Feedback Round" section. The convention is:

> **Feedback Round 2026-04-13, item N** — see `specs/feedback-rounds/2026-04-13-customer-feedback-round-1.md` → item N.

Links out:
- `specs/021-contacts/spec.md` — **NEW feature**, items 3, 4, 7 (contact registry architecture)
- `specs/021-contacts/data-model.md` — **NEW**, items 3, 4 (contact entity + relationship model)
- `specs/008-inspectors-execution/spec.md` — items 1, 2, 3, 5 (PWA surface), 6, 9
- `specs/006-appointments/spec.md` — items 2 (source of truth), 3 (source of truth), 4, 7, 8, 10
- `specs/006-appointments/data-model.md` — item 4 (junction + snapshot revision)
- `specs/007-tenant-portal/spec.md` — item 4 (portal contact update dual-write semantics)
- `specs/009-notifications/spec.md` — item 4 (recipient resolution source of truth)
- `specs/008-inspectors-execution/data-model.md` — items 1, 6
- `specs/010-billing-ledger/spec.md` — item 5
- `specs/003-properties/spec.md` — item 12 (property import)
- `specs/014-frontend-app-shell-ux/spec.md` — items 10, 11, 12

---

## Change log

| Date | Change | Author |
|---|---|---|
| 2026-04-13 | Index created during Customer Feedback Round 1 spec-update pass. No code changes. | Engineering |
| 2026-04-12 | Architectural revision: items 3, 4, 7 now reference feature 021-contacts (per-tenant contact registry). Items 3 and 4 cross-references updated. Junction + snapshot model replaces inline contact expansion. Portal dual-write semantics added (007). Notification recipient resolution formalized (009). | Engineering |
