# Implementation Plan: Inspector bonus in ledger and invoice (Q12 addendum)

**Branch**: `070-f08-6-financial-bonus` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/070-f08-6-financial-bonus/spec.md`

## Summary

Approving an inspector reward (F08-1 `inspector-program`) now mints an `INSPECTOR_BONUS` ledger
entry in the same transaction and that bonus rides the inspector's invoice (snapshot, total, PDF);
paying the invoice marks the reward `PAID`, reversing the payment returns it to `APPROVED`, and
voiding is pre-invoice (void the entry) or AM-only post-invoice (negative reversal on the next
invoice). The bonus is the platform↔inspector leg, so it is the **only** financial entry type with
`tenant_id = NULL` and is never visible to an agency. Integration crosses two modules through two
ports wired at the composition root — `IBonusEntryWriter` (inspector-program → billing creates/
voids/reverses the entry) and `IRewardAwardInvoiceSync` (billing → inspector-program links/pays/
reverses the reward) — plus the real `BonusLedgerHook` replacing F08-1's no-op approval hook.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24
**Primary Dependencies**: Fastify 4, Prisma 6 (PostgreSQL/Supabase, PostGIS in CI), Zod 3,
`fastify-type-provider-zod`, pdfkit; React 18 + Vite 5 + TanStack Query 5 (web); same for PWA
**Storage**: PostgreSQL via Prisma. New enum value `INSPECTOR_BONUS`; `financial_entries.tenant_id`
→ nullable + `reward_award_id` (unique FK) + two CHECKs + partial unique reversal index;
`reward_awards.inspector_invoice_id` (FK) + CHECK. Two expand-only migrations (enum alone, then the
rest).
**Testing**: Vitest (unit + route-integration Supertest), testcontainers (`test:integration:db`,
real PostGIS) for the CHECKs/readers/concurrency; RTL (web/pwa); Playwright E2E (web) extends the
F08-3 Rewards flow.
**Target Platform**: Fastify API (Fly.io), web SPA + PWA (Vercel).
**Project Type**: Web application — monorepo (`apps/backend`, `apps/web`, `apps/pwa`,
`packages/shared`).
**Performance Goals**: N/A — per-approval and per-invoice writes; no hot loop. Each new read filter
is an index-backed predicate; no N+1 (the snapshot bonus lines are one extra query per invoice).
**Constraints**: Clean Architecture (cross-module ports, no module imports another's repository);
all new response fields declared in route response schemas (serializer strips/throws otherwise);
new enum value in its own migration (Postgres); reversal idempotency by partial unique index
(`23505` raw, mapped to 409). PR ≤ 150 files (expected ~55).
**Scale/Scope**: ~55 files (backend ~30, shared ~6, web ~10, pwa ~6).

## Constitution Check

*GATE: evaluated before Phase 0 and re-checked after Phase 1.*

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | Two cross-module ports (`IBonusEntryWriter` in inspector-program `domain/`, `IRewardAwardInvoiceSync` in billing `domain/`), each implemented by the other module, wired at `container.ts`. No module imports the other's repository. Same pattern as F08-1 `IRegionGoalUsageChecker` / F08-2 `IOfferEarlyAccessPolicy`. |
| II. Multi-Tenant Safety | **PASS with justified deviation** | `INSPECTOR_BONUS` is the only ledger entry with `tenant_id = NULL` (platform↔inspector leg; no appointment, no agency). A CHECK makes the exception total (`(entry_type='INSPECTOR_BONUS') = (tenant_id IS NULL)`); isolation is enforced by every reader's `tenant_id`/allowlist predicate plus an explicit per-reader isolation test. See Complexity Tracking. `reward_awards` is already platform-scoped (F08-1); `inspector_invoices` is inspector-scoped (spec 032). Audit rows for the invoice-driven hooks use `actorType 'SYSTEM'`. |
| III. Test-Driven Development | PASS | Tests-first for every slice (shared schemas, approve/void use cases, billing readers, invoice sync, CHECKs via testcontainers, isolation via Supertest, web/pwa RTL, E2E). Explicit non-leak test per agency reader (spec SC-004). |
| IV. Contract-First APIs | PASS | Zod schemas in `packages/shared`; `openapi.json` + `api-types.ts` regenerated with `pnpm generate:api` and committed; expand-only contract change (new type, new nullable/added fields). All new fields declared in route response schemas. |
| V. Simplicity & Minimal Impact | PASS | Reuses the existing `reference_entry_id` auto-relation for the reversal (the `REFUND` precedent) instead of a new column; extends the F08-1 no-op hook rather than reopening the use cases' structure; no manual-payment surface (removed by Q12). No refactor of unrelated code. |

**Financial Rules (Domain Invariant) check**: The bonus is a new money movement approved by Q12
(clause 9.4), not a change to the DONE-time debit/payout rules. It is maker-checked by the reward
approval CAS (no self-approval, DV2), audited on approve/void/paid/reversal (03.A5), and idempotent
(unique `reward_award_id`, partial unique reversal index, Idempotency-Key on approve/void). Manual
adjustments stay AM/OP-only; the bonus entry itself refuses every generic billing action
(`BONUS_ENTRY_MANAGED_BY_REWARD`).

## Project Structure

### Documentation (this feature)

```text
specs/070-f08-6-financial-bonus/
├── plan.md              # This file
├── spec.md              # Feature spec (/speckit.specify)
├── research.md          # Phase 0 — decisions + rationale
├── data-model.md        # Phase 1 — entities, migrations, constraints
├── quickstart.md        # Phase 1 — verification recipe
├── contracts/           # Phase 1 — route contract deltas
│   └── api-contracts.md
└── tasks.md             # Phase 2 (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── enums/financial.ts                         # + INSPECTOR_BONUS (not in AGENCY_VISIBLE_ENTRY_TYPES)
├── schemas/
│   ├── billing.ts                             # type filter accepts INSPECTOR_BONUS
│   ├── responses.ts                           # financialEntryResponseSchema.tenantId nullable;
│   │                                          #   invoiceSnapshotLineSchema.kind + BONUS fields
│   └── inspector-program.ts                   # rewardAwardResponseSchema + financialEntryId/invoice/voidedAfterInvoicing
├── permissions/role-matrix.ts                 # + inspector_program.awards.void_invoiced (AM)
└── api-types.ts                               # regenerated (pnpm generate:api)

apps/backend/
├── prisma/schema.prisma                       # enum value + columns/relations
├── prisma/migrations/
│   ├── <ts>_financial_entry_type_inspector_bonus/   # enum value alone
│   └── <ts>_inspector_bonus_ledger/                 # columns, CHECKs, indexes (expand)
└── src/modules/
    ├── billing/
    │   ├── domain/
    │   │   ├── reward-award-invoice-sync.port.ts      # NEW IRewardAwardInvoiceSync
    │   │   ├── financial-entry.entity.ts              # tenantId: string | null
    │   │   ├── financial-entry.repository.ts          # bonus writer methods (IBonusEntryWriter impl surface)
    │   │   └── billing.errors.ts                      # BonusEntryManagedByReward, InvoiceNonPositiveTotal, InvoiceLinesChanged
    │   ├── application/use-cases/
    │   │   ├── list-financial-entries.use-case.ts     # INSP two types; OP includePlatformBonus
    │   │   ├── get-financial-entry.use-case.ts        # INSP two types
    │   │   ├── {void,update,approve,cancel,create-refund}-*.use-case.ts  # guard bonus
    │   │   ├── request-invoice.use-case.ts            # non-positive total 422
    │   │   ├── preview-invoice.use-case.ts            # count bonuses
    │   │   ├── approve-draft-invoice.use-case.ts      # linkToInvoice in freeze tx
    │   │   ├── mark-invoice-paid.use-case.ts          # markPaidForInvoice in tx
    │   │   ├── batch-mark-invoices-paid.use-case.ts   # per-invoice tx
    │   │   └── reverse-invoice-payment.use-case.ts    # revertPaidForInvoice in tx
    │   └── infrastructure/
    │       ├── prisma-financial-entry.repository.ts   # readers + bonus writer + mapper nullable tenant
    │       ├── prisma-inspector-invoice.repository.ts # markPaidInTransaction; freeze calls sync
    │       └── pdfkit-invoice-pdf.generator.ts        # BONUS line
    ├── inspector-program/
    │   ├── domain/
    │   │   ├── bonus-entry-writer.port.ts             # NEW IBonusEntryWriter
    │   │   ├── reward-award-approval.hook.ts          # BonusLedgerHook replaces no-op usage
    │   │   └── reward-award.entity.ts                 # + inspectorInvoiceId; canVoid extends
    │   ├── application/
    │   │   ├── use-cases/approve-reward-award.use-case.ts  # (hook already wired)
    │   │   ├── use-cases/void-reward-award.use-case.ts     # two branches + AM gate
    │   │   ├── use-cases/list-reward-awards.use-case.ts    # invoice/financialEntryId/voidedAfterInvoicing
    │   │   ├── use-cases/get-program-period-summary.use-case.ts  # totals.paid
    │   │   ├── bonus-ledger.hook.ts (or domain/)           # BonusLedgerHook
    │   │   ├── reward-award-invoice-sync.ts               # IRewardAwardInvoiceSync impl
    │   │   └── mappers.ts                                 # toRewardAwardResponse + new fields
    │   └── infrastructure/
    │       └── prisma-reward-award.repository.ts          # inspector_invoice_id reads/writes, reversal source read
    └── main/container.ts                                  # wire both ports + BonusLedgerHook

apps/web/src/features/
├── inspector-program/… (RewardAwardsTable, RewardsTab)   # Invoice column, chips, AM void, dialog
├── financial/… (FinancialTable, InvoiceDetailDrawer, form-options)  # Bonus line/chip
└── (lib/status-colors.ts)                                # --color-fin-type-bonus

apps/pwa/src/features/earnings/
├── hooks/useInspectorEarnings.ts (or useInspectorPayoutHistory) # no fixed type
└── pages/{InvoiceDetailPage,RequestInvoicePage}.tsx      # BONUS line / "approved items"
```

**Structure Decision**: Monorepo web-application layout. Backend changes span `billing` and
`inspector-program` (joined only through the two ports + container wiring), `packages/shared`
(enum/schemas/role-matrix/api-types), `apps/web` and `apps/pwa`. No new module.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `INSPECTOR_BONUS` financial entry has `tenant_id = NULL` (deviates from "every business entity carries `tenant_id`", Principle II) | The bonus is the platform↔inspector leg: it has no appointment and no agency, so there is no tenant to attribute it to. Q12 (clause 9.4) requires it on the inspector's invoice, not any agency's ledger. | Forcing a `tenant_id` would require inventing an agency for a platform expense and would make the bonus reachable by that agency's readers — the exact leak SC-004 forbids. The exception is made **total and safe** by a CHECK (`(entry_type='INSPECTOR_BONUS') = (tenant_id IS NULL)`), by every reader keeping its `tenant_id`/allowlist predicate (the `NULL` falls out), and by an explicit non-leak test per agency reader. Precedent: `INSPECTOR_PAYOUT` is already excluded from agency views; the platform-scoped exception is documented for inspector-subject entities in root `CLAUDE.md` §7.1. |
| OP gains `includePlatformBonus` visibility in the financial list (RBAC widening) | OP approves rewards and must reconcile them against invoices; hiding the bonus from the operational role that manages it is a usability gap (DQ10). | Showing it only on the Rewards tab/invoice was the alternative; rejected because OP already lists financial entries operationally and the bonus is a platform entry OP is entitled to see. Handled with the RBAC-widening checklist: OP sees only `tenant_id IS NULL AND entry_type='INSPECTOR_BONUS'` added to its existing scope, never another agency's rows (tested). |
