# 031 — Financial Module Scope Alignment

**Status:** Complete — all 7 PRs implemented (shared → backend → web → PWA), each stacked and green.
**Cross-feature:** `010-billing-ledger` (ledger), `015-permissions-rbac-matrix` (RBAC), `027-pwa-improvements` (PWA), `002-tenants-branches` (tenant settings)
**Out of scope:** Inspector-invoice lifecycle redesign (separate feature). This effort only preserves minimal structural compatibility with inspector invoices.

## Context

The financial accounting core is sound (immutable `financial_entries` ledger; `DONE` →
`TENANT_DEBIT` + `INSPECTOR_PAYOUT`), but the **surfaces and RBAC are misaligned** with the
client scope:

- Web financial is 100% AM/OP-gated — there is **no Agency-facing financial surface**, despite
  the scope granting CL_ADMIN an Agency statement, services rendered, and financial reports.
- `allowClientFinancialView` was a **dead tenant flag** (read nowhere); `clUserPermissions` had
  no financial entry, so "configurable financial access for the sub-user" was unmodelled.
- Backend billing RBAC was **inconsistent** (CL_USER allowed on summary + tenant-invoices,
  blocked on list-entries) and billing's auth middleware never resolved CL_USER flags.
- `TenantInvoice` was an **orphan half-feature** (no file worker, no download/mark-paid, no
  clear owner; 0 web/PWA references).
- PWA earnings had no chart, no date filter, and no History/payment-status view.

Data history / backward-compat are **non-constraints** in every environment (confirmed):
destructive migrations and route removals are acceptable.

## Locked decisions

1. **CL_USER financial access is configurable (tenant-cohort).** Remove `allowClientFinancialView`.
   CL_ADMIN always sees own-Agency financials; CL_USER only when the agency has `view_financials`
   in `clUserPermissions` (applies to the agency's CL_USER cohort, consistent with every other
   CL_USER flag — the `User` model has no per-individual permission column).
2. **Agency extrato = live read-only view over `financial_entries`** (own-tenant). The orphan
   `TenantInvoice` feature is removed (destructive migration).
3. **Agency reports = scoped own-tenant XLSX export** built inside the Agency surface. The AM/OP
   report module is untouched; only its `IXlsxGenerator` port is reused (import-only).
4. **PWA keeps the 4-tab bar.** The Earnings tab opens a segmented Earnings / History screen;
   "User" = the existing Profile tab. Chart is inline SVG (no new dependency).

## Final RBAC (by actor)

| Capability | AM | OP | CL_ADMIN | CL_USER | INSP |
|---|---|---|---|---|---|
| Financial backoffice (view/approve/adjust/refund/void) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Inspector-invoice ops (generate/mark-paid/reverse/reconcile) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `financial.agency_view` (extrato / services rendered / summary) | ✅ | ✅ | ✅ | flag `view_financials` | ❌ |
| `financial.agency_export` (own-tenant XLSX) | ✅ | ✅ | ✅ | flag `view_financials` | ❌ |
| Own earnings + history — INSP self-service (`INSPECTOR_PAYOUT`, own inspector) † | ❌ | ❌ | ❌ | ❌ | ✅ own-only |

† AM/OP do **not** have an "own earnings" surface; they see all payouts (incl. `INSPECTOR_PAYOUT`) via the **backoffice ledger** row above (`financial.view`). This keeps the own-earnings surface INSP-only, consistent with `015-permissions-rbac-matrix`.

CL_ADMIN/CL_USER are always own-tenant scoped and see only Agency-relevant entry types
(`TENANT_DEBIT`, `REFUND`, `MANUAL_ADJUSTMENT`) — never `INSPECTOR_PAYOUT`.

## Surfaces (by actor)

- **AM/OP (web):** existing backoffice — `FinancialEntriesPage`, `InvoicesPage`.
- **CL_ADMIN / CL_USER-with-flag (web):** new read-only Agency financial page — Statement,
  Services rendered, Reports (scoped XLSX). No mutation controls.
- **INSP (PWA):** Earnings tab → Earnings segment (Next payment, Total earnings with Properfy,
  date-range filter, SVG chart) + History segment (payouts with payment status). User = Profile.
- **Removed:** `TenantInvoice` surfaces; `allowClientFinancialView`; deprecated `/v1/invoices/*`
  block + duplicate `PATCH approve` + `/close` `/pay` aliases.

## Delivery batches (PRs)

1. **PR-1 — Shared contract foundation.** `financial.agency_view` +
   `financial.agency_export` matrix actions (`cl_user_flag: view_financials`); `view_financials`
   added to `clUserPermissions` + `CL_USER_PERMISSIONS`; `allowClientFinancialView` removed;
   `clUserPermissions` exposed on `meResponseSchema`; openapi/api-types regenerated.
2. **PR-2 — Backend billing route cleanup.** Remove the deprecated `/v1/invoices/*` block
   (incl. `/close` `/pay` aliases) and the duplicate `PATCH /v1/financial/entries/:id/approve`
   (canonical `POST` kept); migrate the one web caller (`useFinancialBatchApprove`) PATCH→POST;
   regenerate the contract.
3. **PR-3 — Remove orphan tenant-invoice** (backend + shared + destructive migration).
4. **PR-4 (this) — Backend Agency read (extrato + summary) + RBAC unification.** Wire the CL_USER
   permissions resolver into billing auth; inject `AuthorizationService` into the billing
   container; unify route-level role checks onto `assertRoles` + `assertClUserPermission`; open
   the entries + summary reads to CL_ADMIN / flagged CL_USER, scoped own-tenant and excluding
   `INSPECTOR_PAYOUT`; hide `totalPayouts` from agencies in the summary.
5. **PR-5 (this) — Backend Agency scoped XLSX export** (`GET /v1/financial/export`, own-tenant
   statement via report `IXlsxGenerator` reuse). *Services-rendered is delivered as a web tab
   over the existing `entries?type=TENANT_DEBIT` endpoint (PR-6) — each debit is a rendered
   service — rather than a redundant backend endpoint.*
6. **PR-6 (this) — Web Agency financial surface + client-side gating.** Expose `clUserPermissions`
   on `/v1/me`; new read-only `AgencyFinancialPage` (`/my-financial`) with Statement / Services
   rendered tabs + XLSX export; `usePermissions.hasClUserFlag`; role+flag-gated sidebar entry.
7. **PR-7 (this) — PWA earnings/history redesign.** Segmented Earnings / History screen with
   Next payment, Total earnings with Properfy, date filter, inline-SVG chart, and payment-status
   history; draft-invoice CTA preserved; 4-tab bar unchanged.

> **Re-split notes:** (a) the CL_USER-resolver wiring + route-level RBAC-mechanism unification
> moved from PR-2 into PR-4 (the resolver is only consumed by
> `assertClUserPermission('view_financials')`, and any CL read path to `financial_entries` must
> ship with the `INSPECTOR_PAYOUT` exclusion). (b) PR-4 was split: the Agency **read** (extrato +
> summary + RBAC) is PR-4; **services-rendered + scoped export** became PR-5, to isolate the
> RBAC work from the cross-module XLSX coupling. Web/PWA shifted to PR-6/PR-7.

## PR-1 functional requirements (delivered)

- **FR-031-01:** `financial.agency_view` and `financial.agency_export` exist in the role matrix
  with roles `[AM, OP, CL_ADMIN, CL_USER]` and `condition: cl_user_flag`, `conditionKey:
  view_financials`.
- **FR-031-02:** `view_financials` is a valid `clUserPermissions` value and a member of
  `CL_USER_PERMISSIONS` (`ClUserPermission` type).
- **FR-031-03:** `allowClientFinancialView` is removed from the tenant settings schema and all
  generated artifacts; the tenant settings schema still parses stored settings (passthrough).
- **FR-031-04:** `meResponseSchema` optionally carries `clUserPermissions: string[]`.

Backoffice financial actions (`financial.view/approve/manual_adjustment/refund`) remain AM/OP-only.

## PR-2 functional requirements (delivered)

- **FR-031-05:** The deprecated `/v1/invoices/*` routes (`GET /v1/invoices`, `POST
  /v1/invoices/generate`, `GET /v1/invoices/:id`, `POST /v1/invoices/:id/close`, `POST
  /v1/invoices/:id/pay`, `GET /v1/invoices/:id/download`) are removed and resolve to 404. The
  canonical `/v1/billing/invoices/*` routes are unchanged.
- **FR-031-06:** The duplicate `PATCH /v1/financial/entries/:entryId/approve` is removed (404);
  the canonical `POST` variant is the single approve verb. The sole web caller
  (`useFinancialBatchApprove`) uses `POST`.
- **FR-031-07:** No inspector-invoice use-case, entity, or canonical route is changed (the
  removed routes were legacy aliases / a duplicate verb only).

## PR-3 functional requirements (delivered)

- **FR-031-08:** The orphan `TenantInvoice` feature is fully removed — the `tenant_invoices`
  table and `TenantInvoiceStatus` enum are dropped (destructive migration), along with its
  use-cases (generate / list / regenerate), entity, repository, domain errors, shared schemas
  (`generateTenantInvoiceSchema`, `listTenantInvoicesQuerySchema`, `tenantInvoiceResponseSchema`),
  and the `TenantInvoiceStatus` shared enum.
- **FR-031-09:** The tenant-invoice routes (`POST /v1/billing/tenant-invoices/generate`, `GET
  /v1/billing/tenant-invoices`, `POST /v1/billing/tenant-invoices/:id/regenerate`) resolve to
  404. The inspector-invoice regenerate route (`POST /v1/billing/invoices/:id/regenerate`) is
  unchanged.
- **FR-031-10:** The Agency financial statement is served live from `financial_entries`
  (delivered in PR-4); no periodic tenant-invoice generation lifecycle exists.

## PR-4 functional requirements (delivered)

- **FR-031-11:** Billing auth middleware resolves CL_USER permission flags from tenant settings
  (`resolveClUserPermissions` wired), so `assertClUserPermission('view_financials')` is
  enforceable on billing routes (closes the silent-no-op trap).
- **FR-031-12:** `GET /v1/financial/entries` is readable by AM/OP (backoffice), CL_ADMIN (own
  agency), INSP (own payouts) and CL_USER **only** with `view_financials`. For CL roles the read
  is own-tenant and excludes `INSPECTOR_PAYOUT` (via `entryTypeIn`); requesting `INSPECTOR_PAYOUT`
  explicitly is `FORBIDDEN`.
- **FR-031-13:** `GET /v1/financial/entries/summary` is gated to AM/OP/CL_ADMIN/flagged-CL_USER
  (INSP denied); for CL roles `totalPayouts` is hidden (returned as 0) so the platform margin is
  not exposed.
- **FR-031-14:** Route-level RBAC on entries/summary/approve/adjust is unified onto
  `AuthorizationService.assertRoles` (+ `assertClUserPermission`), replacing bespoke inline role
  arrays; denials are audited. Inspector-invoice routes are unchanged.

## PR-5 functional requirements (delivered)

- **FR-031-15:** `GET /v1/financial/export` returns a synchronous own-tenant financial statement
  XLSX (base64 JSON: `{ filename, contentType, contentBase64 }`), gated by `financial.agency_export`
  (AM/OP/CL_ADMIN unconditionally; CL_USER via `view_financials`; INSP denied). CL roles are
  forced to their own tenant; the statement contains only agency-visible entry types (no
  `INSPECTOR_PAYOUT`) and is never silently truncated by a page size.
- **FR-031-16:** The export reuses the report module's `IXlsxGenerator` port (import-only, no
  report-module change), consistent with the existing billing→report coupling.
- **FR-031-17:** "Services rendered" is the `entries?type=TENANT_DEBIT` view (each debit = a
  completed inspection), surfaced as a web tab in PR-6 — no separate backend endpoint.

## PR-6 functional requirements (delivered)

- **FR-031-18:** `GET /v1/me` returns `clUserPermissions` for CL_USER (from tenant settings), so
  the web can mirror server-side gating; the get-me use case loads it via `ITenantRepository`.
- **FR-031-19:** `usePermissions.hasClUserFlag(flag)` evaluates CL_USER flags against
  `user.clUserPermissions` (non-CL_USER roles pass); `useAuth`'s `AuthUser` carries
  `clUserPermissions`.
- **FR-031-20:** New read-only `AgencyFinancialPage` at `/my-financial` (AM/OP/CL_ADMIN/flagged
  CL_USER) with **Statement** and **Services rendered** (TENANT_DEBIT) tabs, own-tenant summary,
  and an **Export** (XLSX) action. No backoffice controls (approve/adjust/refund/edit/batch).
  CL_USER without `view_financials` sees `NoPermissionState`.
- **FR-031-21:** The sidebar shows a CL-facing **Financial** entry (`/my-financial`) gated by
  role + the `view_financials` flag; the AM/OP backoffice entry (`/financial`) is unchanged.

## PR-7 functional requirements (delivered)

- **FR-031-22:** The PWA Earnings tab is a segmented **Earnings / History** screen (4-tab bottom
  bar unchanged; "User" = the Profile tab).
- **FR-031-23:** Earnings segment shows **Next payment** (approved-not-yet-paid payouts),
  **Total earnings with Properfy** (all-time approved), a **date-range filter**, and an
  **inline-SVG chart** of monthly approved earnings (no chart dependency).
- **FR-031-24:** History segment lists the inspector's payouts (all statuses) with
  payment-status chips, filterable by date range.
- **FR-031-25:** The draft-invoice CTA + route are preserved (belong to the separate
  inspector-invoice feature); the orphaned `EarningsSummaryCard` was removed.
