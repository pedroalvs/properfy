# Implementation Plan: Billing & Ledger

**Branch**: `010-billing-ledger` | **Date**: 2026-04-05 | **Spec**: [spec.md](./spec.md)
**Feature Status**: IMPLEMENTED (Phase 1) — Phase 2/3 gaps tracked in [tasks.md](./tasks.md).

## Summary

Own the platform's financial ledger: append-only `FinancialEntry` rows with a two-person approval rule, automatic entry creation on cross-checked `DONE` appointments, refunds, manual adjustments, and inspector invoices that close billing periods. This module is a ledger, not a payment gateway — it records financial intent and produces invoice documents; payment reconciliation is a manual workflow on top.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.

**Primary Dependencies**

- Backend: Fastify, Prisma, Zod, shared `AuditService`, `IIdempotencyService`, pg-boss (PDF generation worker).
- Storage: `IStorageService` for invoice PDF files in Supabase Storage.
- Cross-module ports: `IAppointmentRepository` (006), `ITenantRepository` (002), `IInspectorRepository` (008).
- Shared constants: `SYSTEM_USER_ID` for auto-generated entries.

**Storage**

- PostgreSQL (Supabase). Tables: `financial_entries`, `inspector_invoices`, plus writes into `audit_logs`.
- Supabase Storage: invoice PDF files, path convention `invoices/<inspectorId>/<invoiceId>.pdf`.

**Testing**

- Unit: Vitest — every use case including the deterministic UUID helper, self-approval guard, refund eligibility, invoice sum math, date-range helpers.
- Integration: Supertest + real Postgres — full happy path from appointment DONE + cross-check → entry creation → approval → invoice generation.
- Concurrency tests: two simultaneous approve requests must yield exactly one success.

**Target Platform**: Backend on Fly.io. Web invoices page consumes the list/detail/download endpoints.
**Project Type**: Monorepo — backend-only module plus shared contracts.
**Performance Goals**: List/read p95 < 300 ms, summary < 500 ms, invoice sync p95 < 1 s (async PDF worker up to several seconds).
**Constraints**: Append-only ledger. Two-person approval. No hard deletes outside migrations. Deterministic UUIDs for auto-generated entries. `Decimal(12,2)` for all amounts.
**Scale/Scope**: Phase 1 target: thousands of entries per tenant per month, biweekly invoice cycles per inspector.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | Standard layering with domain entities, ports, use cases, prisma adapters, routes. |
| II. Multi-Tenant Safety | PASS | Every entry carries `tenant_id`. Cross-module reads validate tenant scope (appointments, inspectors, reference entries). CL roles scoped to own tenant. |
| III. Test-Driven Development | PARTIAL | Unit and integration coverage present for every use case. Concurrency test for approval race is present. Verify 80%+ during review. |
| IV. Contract-First APIs | PASS | Zod schemas in `packages/shared/src/schemas/billing.ts` are authoritative. Human projection in [contracts/](./contracts/). |
| V. Simplicity & Minimal Impact | PASS | One use case per operation. Deterministic UUID helper is a small pure function. Duplicate route paths are tracked as GAP-010 for consolidation. |
| VI. State Machine Sovereignty | PASS (CONSUMER) | This feature DOES NOT write `appointment.status`. It reads cross-check state via the `onDoneHandler` port — a deliberately narrow integration surface. |
| — Financial hard precondition | PASS | `FinancialEntryDoneCheckRequiredError` enforces "no entries before cross-check". Verified in integration tests. |

**Gate result**: PASS for Phase 1 as implemented.

## Project Structure

### Documentation (this feature)

```text
specs/010-billing-ledger/
├── spec.md
├── plan.md
├── data-model.md
├── contracts/
│   ├── README.md
│   ├── financial-entry-endpoints.md
│   └── invoice-endpoints.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/backend/src/modules/billing/
├── domain/
│   ├── financial-entry.entity.ts
│   ├── financial-entry.repository.ts       # port
│   ├── inspector-invoice.entity.ts
│   ├── inspector-invoice.repository.ts     # port
│   └── billing.errors.ts
├── application/
│   └── use-cases/
│       ├── create-financial-entries-on-done.use-case.ts    # system entry point
│       ├── approve-financial-entry.use-case.ts
│       ├── create-manual-adjustment.use-case.ts
│       ├── create-refund.use-case.ts
│       ├── list-financial-entries.use-case.ts
│       ├── get-financial-entry.use-case.ts
│       ├── get-financial-summary.use-case.ts
│       ├── generate-invoice.use-case.ts
│       ├── list-invoices.use-case.ts
│       ├── get-invoice.use-case.ts
│       └── download-invoice.use-case.ts
├── infrastructure/
│   ├── prisma-financial-entry.repository.ts
│   ├── prisma-inspector-invoice.repository.ts
│   └── workers/
│       └── generate-invoice-file.worker.ts   # pg-boss PDF worker
└── interfaces/
    └── billing.routes.ts                     # entries + invoices + summary

packages/shared/src/schemas/billing.ts
```

**Structure Decision**: Single module, with two sub-domains (financial entries and inspector invoices) sharing the module boundary because they share consumers, reporting surfaces, and the same operator audience.

## Cross-Feature Dependencies

- **Feature 002-tenants-branches** — Reads tenant `currency` at entry creation time. Validates tenant active status before accepting adjustments. Future tenant-timezone period boundaries depend on `002#GAP-002`.
- **Feature 004-service-catalog** — Indirect consumer. Pricing rules determine `appointment.priceAmount` and `appointment.payoutAmount`, which become the entry amounts. `004#GAP-002` (pricing currency coupling) affects this module.
- **Feature 006-appointments** — Primary upstream. `ExecuteStatusTransitionUseCase` and `PerformCrossCheckUseCase` invoke `CreateFinancialEntriesOnDoneUseCase` via the `onDoneHandler` port **only after** the two-person cross-check is complete. `006#GAP-002` (DONE→REJECTED compensation) pairs with this module's `010#GAP-002`.
- **Feature 008-inspectors-execution** — Not a direct dependency, but inspector eligibility is checked when manual adjustments reference an inspector.
- **Feature 011-reports-audit** — Consumer of the audit trail. Every financial write produces an audit record.

## Security & Operational Notes

- **Hard precondition for finance**: `FR-001` is non-negotiable. The use case refuses any appointment without `doneCheckedByUserId`. Reviewers must reject any PR that relaxes this check.
- **Two-person approval** (`implementation decision — more restrictive than dossiê`): initiator ≠ approver is enforced universally by `EntrySelfApprovalNotAllowedError`. The dossiê recommends dual approval only for "eventos financeiros e exceções de alto impacto" (refunds, manual adjustments, inspection reopen) — the code applies it to ALL entries as a stricter policy. `SYSTEM_USER_ID` never collides with a real user, so AM/OP can freely approve system-initiated entries.
- **Canonical flow for entry creation**: the approved business flow is `INSP → DONE` then `OP/AM → explicit cross-check` then `onDoneHandler → financial entries`. The code also supports an `implementation shortcut` where cross-check happens inline in the DONE transition (see feature 006 US3 scenario 6). Neither this feature nor reviewers should treat the shortcut as the canonical path.
- **Deterministic UUIDs** (SHA-1 of `appointmentId + entryType`): guarantees idempotency at the DB level. The use case gracefully handles unique-index violations by re-reading the row.
- **Append-only ledger**: `FinancialEntry` rows are never hard-deleted in production. Corrections go through refunds (`REFUND` entry) or adjustments (`MANUAL_ADJUSTMENT` entry).
- **Approved entries are immutable**: repository methods refuse updates to `APPROVED` rows. Operators must create an opposing entry to correct.
- **Decimal precision**: all monetary fields use `Decimal(12,2)`. Never use `float` or `number` without decimal conversion.
- **Currency inheritance at creation**: once set, an entry's currency does not change even if the tenant's currency changes. Historical reconstruction remains accurate.
- **Invoice PDF worker**: failures in `generate-invoice-file.worker.ts` leave the invoice without `file_key`. A retry or regeneration mechanism is tracked as GAP-007.
- **Concurrency safety on approval**: the conditional UPDATE (`WHERE status = PENDING`) guarantees exactly-once approval under load.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Deterministic UUIDs for auto-generated entries | Protects against duplicate inserts when the idempotency cache expires or is evicted. | Random UUIDs would require a more complex unique-index check and retry loop. |
| Conditional UPDATE for approval (not `FOR UPDATE` locking) | Avoids long-held row locks under concurrent approval; still guarantees exactly-once semantics. | Row locking would serialize approvals and hurt throughput in batch approval workflows. |
| Separate `status = PENDING` default vs. auto-approved rows (`implementation decision — more restrictive than dossiê`) | Two-person rule applied universally. The dossiê recommends it only for high-impact events (refunds, adjustments, reopens); the code applies it to all entries as a stricter policy. | Auto-approving system-initiated entries would bypass the two-person invariant even for high-impact cases. |
| `SYSTEM_USER_ID` as initiator on auto-generated entries | Differentiates automated entries from operator-initiated ones in the audit trail and allows any operator to approve them. | Using the cross-checker's id as initiator would create self-approval deadlocks. |
| Duplicate `/v1/invoices/*` and `/v1/billing/invoices/*` routes | Legacy module rename. Both paths coexist to avoid breaking deployed clients during migration. | Forcing a breaking change on the frontend mid-migration would stall the project. Tracked for consolidation (GAP-010). |

Phase 1 deviations above are justified. Phase 2 items introducing new abstractions must add rows here.

## Execution Strategy

### Phase 2 — Gap Closure

#### Wave 1: Quick Wins + High Value (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 1a | GAP-001 — Cancel PENDING entries | T100–T102 | Small use case. |
| 1b | GAP-008 — Mark invoice PAID | T170–T172 | Small, high operator value. |
| 1c | GAP-009 — Summary date range | T180–T182 | Small query extension. |
| 1d | GAP-010 — Consolidate routes | T190–T193 | Deprecation headers. |

#### Wave 2: Financial Operations (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 2a | GAP-002 — Auto DONE→REJECTED compensation | T110–T113 | Pairs with 006#GAP-002 (already done). |
| 2b | GAP-003 — Partial refunds | T120–T123 | Decision + implementation. |
| 2c | GAP-005 — Timezone period boundaries | T140–T142 | Uses tenant settings. |

#### Wave 3: Advanced (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 3a | GAP-004 — Tenant invoice | T130–T133 | New entity + generation. |
| 3b | GAP-006 — Void approved entries | T150–T152 | Decision + implementation. |
| 3c | GAP-007 — Invoice regeneration | T160–T162 | Versioned invoice chain. |

```
Wave 1:  GAP-001 ══╗
         GAP-008 ══╬══ (parallel)
         GAP-009 ══╝
         GAP-010 ══╝

Wave 2:  GAP-002 ══╗
         GAP-003 ══╬══ (parallel)
         GAP-005 ══╝

Wave 3:  GAP-004 ══╗
         GAP-006 ══╬══ (parallel)
         GAP-007 ══╝
```
