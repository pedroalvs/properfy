# QA Manual — Staging Validation

**Created**: 2026-04-18
**Purpose**: Validate the real product in staging before production release. Catch bugs that automated tests and AI review cannot.
**Environment**: staging (Fly.io — properfy)
**Operator**: manual tester with AM credentials + one OP account + one CL_ADMIN account

---

## How to use this file

1. Run tests in the order listed (Section A → B → C).
2. Mark each test `[x]` PASS or `[!]` FAIL as you go.
3. For any `[!]`, create a bug entry in Section D using the template.
4. After a bugfix lands in staging, re-test only the failed item + its regression neighbors.

---

## A. Smoke Tests (run first — 15 min)

Goal: confirm the app loads, auth works, and core navigation is functional. If any smoke test fails, stop and fix before proceeding.

### A1. Auth & Session

- [ ] **A1.1** Navigate to web app URL → login page renders (no blank screen, no console errors)
- [ ] **A1.2** Login as AM with valid credentials → redirects to dashboard
- [ ] **A1.3** Login as OP with valid credentials → redirects to dashboard, sidebar shows OP-scoped menu
- [ ] **A1.4** Login as CL_ADMIN → redirects to dashboard, sidebar shows client menu only
- [ ] **A1.5** Login with invalid password → error message displayed, no redirect
- [ ] **A1.6** Refresh the page after login → session persists (no re-login)
- [ ] **A1.7** Token refresh: wait 15+ min or manually expire token → app silently refreshes without forcing re-login
- [ ] **A1.8** Logout → redirected to login, cannot navigate back to protected routes

### A2. Navigation & Shell

- [ ] **A2.1** Sidebar renders all expected menu items for AM role
- [ ] **A2.2** Click each sidebar item → corresponding page loads without error
- [ ] **A2.3** Page titles render correctly (not "undefined" or blank)
- [ ] **A2.4** Responsive: resize browser to tablet width → sidebar collapses gracefully

### A3. Basic Data Presence

- [ ] **A3.1** Appointments list loads with data (not empty state when data exists)
- [ ] **A3.2** Properties list loads with data
- [ ] **A3.3** Tenants list loads with data (AM only)
- [ ] **A3.4** Inspectors list loads with data
- [ ] **A3.5** Financial entries page loads

---

## B. Critical Path Tests (run second — 60 min)

Goal: walk through the complete business lifecycle end-to-end. These are the flows that matter most for production.

### B1. Tenant & Branch Management

- [ ] **B1.1** AM creates a new tenant with name + legal name → tenant appears in list
- [ ] **B1.2** AM creates a branch under the new tenant → branch appears in tenant detail
- [ ] **B1.3** CL_ADMIN of the new tenant can see their own branches but not other tenants

### B2. Property Management

- [ ] **B2.1** Create a property under the new branch with full address → property appears in list
- [ ] **B2.2** Property geocoding triggers (or manually verify coordinates are stored)
- [ ] **B2.3** Property map page shows the property pin at the correct location

### B3. Appointment Lifecycle (core flow)

- [ ] **B3.1** **Create appointment**: select branch → property → service type → date → time slot → add contact via autocomplete search from registry → save → appointment created in DRAFT
- [ ] **B3.2** **Create with inline contact**: same flow but skip autocomplete, type contact info manually → appointment created with inline contact
- [ ] **B3.3** **Multi-contact**: add 2 contacts (1 from registry, 1 inline), set primary → verify both saved correctly in detail view
- [ ] **B3.4** **Edit appointment**: open the DRAFT appointment → change date and time slot → save → changes reflected
- [ ] **B3.5** **Transition DRAFT → AWAITING_INSPECTOR**: verify appointment moves to marketplace-ready status
- [ ] **B3.6** **Assign inspector (manual)**: from AWAITING_INSPECTOR, assign an inspector → status becomes SCHEDULED
- [ ] **B3.7** **View appointment detail drawer**: click appointment row → drawer opens with all sections (details, contacts, restrictions)
- [ ] **B3.8** **View full detail page**: click "Open full detail" → page loads with tabs (timeline, contacts, financial, notifications)

### B4. Appointment Status Transitions

- [ ] **B4.1** **Cancel**: from SCHEDULED, cancel with reason → status becomes CANCELLED, reason visible in audit
- [ ] **B4.2** **Reject**: from SCHEDULED, reject with reason code → status becomes REJECTED, reason code visible
- [ ] **B4.3** **Reopen**: from CANCELLED, reopen → status returns to DRAFT
- [ ] **B4.4** **DONE transition**: from SCHEDULED, mark as DONE → status changes, `doneMarkedByUserId` set
- [ ] **B4.5** **Cross-check**: as a different OP, perform cross-check on the DONE appointment → `doneCheckedByUserId` set, financial entries created

### B5. Bulk Operations

- [ ] **B5.1** Select 3 appointments → floating bar shows "3 appointments selected"
- [ ] **B5.2** Open Bulk Edit → modal shows 6 field checkboxes
- [ ] **B5.3** Enable "Scheduled Date", enter a future date, submit → verify all 3 updated
- [ ] **B5.4** Bulk edit with a PM contact via autocomplete → PM junction row created for all selected

### B6. Appointment Filters & Search

- [ ] **B6.1** Type in search box → results filter by code/address/tenant
- [ ] **B6.2** Filter by status → only matching appointments shown
- [ ] **B6.3** Filter by date range → only matching appointments shown
- [ ] **B6.4** Scroll down with many results → FilterBar stays sticky at top
- [ ] **B6.5** Clear all filters → full list restored

### B7. Import Flow

- [ ] **B7.1** Navigate to /appointments/import → page loads with upload area
- [ ] **B7.2** Click "Download template" → CSV file downloads with correct headers
- [ ] **B7.3** Upload a valid CSV → preview step shows parsed rows
- [ ] **B7.4** Confirm import → progress step shows results

### B8. Tenant Portal

- [ ] **B8.1** Open the tenant portal link for a SCHEDULED appointment → portal page loads (no auth required)
- [ ] **B8.2** Tenant confirms availability → confirmation status updates to CONFIRMED
- [ ] **B8.3** Tenant marks unavailable with reason → status updates to UNAVAILABLE
- [ ] **B8.4** Portal link for a DONE appointment → shows appropriate message (inspection completed)

### B9. Inspector Execution (PWA)

- [ ] **B9.1** Login as inspector in PWA → schedule page loads
- [ ] **B9.2** View today's appointments → SCHEDULED appointments visible
- [ ] **B9.3** Start inspection → geolocation captured, appointment status updates
- [ ] **B9.4** Finish inspection → upload evidence, mark done → status transitions to DONE
- [ ] **B9.5** Marketplace: view available offers → offer cards render with correct info
- [ ] **B9.6** Accept an offer → appointments transition to SCHEDULED with inspector assigned

### B10. Billing & Financial

- [ ] **B10.1** After cross-check (B4.5): verify TENANT_DEBIT and INSPECTOR_PAYOUT entries created
- [ ] **B10.2** Financial entries list → shows the entries with correct amounts
- [ ] **B10.3** Generate inspector invoice → invoice created with CLOSED status
- [ ] **B10.4** Mark invoice as PAID → status changes, paidByUserId set
- [ ] **B10.5** Batch mark-as-paid with payment reference → all selected invoices updated
- [ ] **B10.6** Reverse a payment → invoice returns to CLOSED, audit trail recorded
- [ ] **B10.7** Refund: create a REFUND entry linked to a TENANT_DEBIT → amount negative, links correct

### B11. Notifications

- [ ] **B11.1** After appointment creation → check notification log for initial notice email
- [ ] **B11.2** After tenant confirmation → check notification log for confirmation email
- [ ] **B11.3** Notification templates page → templates render with variable placeholders
- [ ] **B11.4** Unsubscribe link works (if applicable) → stops future emails for that recipient

### B12. Reports & Audit

- [ ] **B12.1** Request an INSPECTIONS_DONE report → status goes PENDING → PROCESSING → READY
- [ ] **B12.2** Download the READY report → XLSX file opens with correct data columns
- [ ] **B12.3** Audit log page (AM) → shows recent actions with raw PII visible
- [ ] **B12.4** Audit log page (OP) → shows recent actions with partial PII masking (email: `use***@...`)
- [ ] **B12.5** Request a CSV format report → CSV file downloads correctly
- [ ] **B12.6** Scheduled reports list → shows any configured schedules with status

---

## C. Regression & Edge Case Checks (run last — 30 min)

Goal: verify multi-tenant isolation, RBAC boundaries, and edge cases that tend to break under real usage.

### C1. Multi-Tenant Isolation

- [ ] **C1.1** Login as CL_ADMIN of Tenant A → cannot see appointments from Tenant B
- [ ] **C1.2** Login as CL_ADMIN of Tenant A → cannot see properties from Tenant B
- [ ] **C1.3** Login as OP → can see appointments across tenants (cross-tenant view)
- [ ] **C1.4** Direct URL manipulation: as CL_ADMIN, manually navigate to an appointment ID from another tenant → 404 or forbidden (not data leak)

### C2. RBAC Boundaries

- [ ] **C2.1** CL_USER without `reschedule_appointments` permission → cannot change appointment date (verify error message)
- [ ] **C2.2** CL_USER with `reschedule_appointments` → can change date
- [ ] **C2.3** INSP role cannot access admin panel routes → redirected or 403
- [ ] **C2.4** CL_ADMIN cannot access AM-only features (tenant management, audit retention controls)

### C3. Edge Cases

- [ ] **C3.1** Create appointment with only email (no phone) for contact → saves correctly
- [ ] **C3.2** Create appointment with only phone (no email) → saves correctly
- [ ] **C3.3** Empty appointment list with active filters → correct empty state ("no results for filters")
- [ ] **C3.4** Empty appointment list with no data → correct empty state ("no appointments yet")
- [ ] **C3.5** Appointment with restriction (is_home = true, notes) → restriction visible in detail
- [ ] **C3.6** Time slot config: create/edit/delete time slots for a tenant → appointment form reflects changes
- [ ] **C3.7** Service region on map → polygon renders correctly
- [ ] **C3.8** Contact autocomplete: search term with no matches → "No contacts found" message, can still create inline

### C4. Performance & UX

- [ ] **C4.1** Appointment list with 100+ rows → loads in < 3 seconds, pagination works
- [ ] **C4.2** Contact autocomplete → results appear within 500ms of typing
- [ ] **C4.3** Report generation for large dataset → completes without timeout
- [ ] **C4.4** No console errors visible during normal navigation (check DevTools)

---

## D. Bug Capture Log

Use this template for each bug found. Add entries below the template.

### Template

```markdown
### BUG-NNN: [title]

**Severity**: CRITICAL | HIGH | MEDIUM | LOW
**Found in**: [test ID, e.g. B3.1]
**Date**: YYYY-MM-DD
**Tester**: [name]

**Steps to reproduce**:
1. ...
2. ...
3. ...

**Expected**: [what should happen]

**Actual**: [what actually happens]

**Evidence**: [screenshot URL, console error, network trace]

**Hypothesis**: [initial guess at root cause — optional but helpful for the fix]

**Status**: OPEN | FIXING | FIXED | VERIFIED | WONTFIX
**Fix commit**: [hash, once fixed]
```

### Bugs

_(add entries here as they are found)_

---

## E. Execution Order

Run in this exact order for maximum efficiency and early failure detection.

| Phase | Section | Time | Rationale |
|---|---|---|---|
| 1 | **A (Smoke)** | 15 min | If the app doesn't load or auth is broken, nothing else matters. Stop on any failure. |
| 2 | **B3 (Appointment lifecycle)** | 15 min | The core business flow. Tests the most code paths and the highest-value feature. |
| 3 | **B4 (Status transitions)** | 10 min | State machine is the heart of the domain. Depends on B3 data. |
| 4 | **B5-B6 (Bulk + Filters)** | 10 min | Operator daily workflows. High usage frequency. |
| 5 | **B10 (Billing)** | 10 min | Financial correctness is non-negotiable. Depends on B4.5 (cross-check). |
| 6 | **B8-B9 (Portal + PWA)** | 10 min | External-facing flows. Depends on B3 creating SCHEDULED appointments. |
| 7 | **B1-B2, B7, B11-B12** | 10 min | Supporting flows: tenant/property setup, import, notifications, reports. |
| 8 | **C (Regression)** | 30 min | Multi-tenant isolation and RBAC boundaries. Run last because they need diverse test data already created by B-series. |

**Total estimated time: ~2 hours for full pass.**

---

## F. Bugfix Loop Protocol

After QA identifies bugs:

1. **Triage**: assign severity to each bug. CRITICAL and HIGH block release.
2. **Fix**: developer picks bugs from the log, fixes on the staging branch, pushes.
3. **Re-deploy**: staging auto-deploys on push (Fly.io).
4. **Re-test**: tester re-runs ONLY the failed test ID + its immediate neighbors (e.g., if B3.1 failed, re-test B3.1-B3.4).
5. **Mark verified**: update the bug entry status to VERIFIED and add the fix commit hash.
6. **Iterate**: repeat until zero CRITICAL/HIGH bugs remain.
7. **Release**: when the full pass is green (all `[x]`), the build is release-ready.

**Release gate**: all A-series and B-series tests must be `[x]`. C-series MEDIUM/LOW items can be documented as known issues if not blocking.
