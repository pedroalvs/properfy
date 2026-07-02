# 031 — Financial Module Scope Alignment

**Status:** In progress (PR-1 landed: shared contract foundation)
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
| Own earnings + history (`INSPECTOR_PAYOUT`, own inspector) | ✅ | ✅ | ❌ | ❌ | ✅ own-only |

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

1. **PR-1 (this) — Shared contract foundation.** `financial.agency_view` +
   `financial.agency_export` matrix actions (`cl_user_flag: view_financials`); `view_financials`
   added to `clUserPermissions` + `CL_USER_PERMISSIONS`; `allowClientFinancialView` removed;
   `clUserPermissions` exposed on `meResponseSchema`; openapi/api-types regenerated.
2. **PR-2 — Backend billing RBAC unification + route cleanup** (wire CL_USER resolver into
   billing; remove deprecated/duplicate routes).
3. **PR-3 — Remove orphan tenant-invoice** (backend + shared + destructive migration).
4. **PR-4 — Backend Agency financial surface** (extrato / services rendered / scoped export).
5. **PR-5 — Web Agency financial surface + client-side gating** (`/v1/me` flags).
6. **PR-6 — PWA earnings/history redesign** (parallelizable after PR-1).

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
