# GAP-002: PricingResolver as a Shared Service -- Design Decision

## Status

**Closed -- no code change needed.** The existing architecture already avoids duplication.

## Context

Marketplace offers compute payout estimates inline. Billing (feature 010) performs similar pricing resolution. The concern was that pricing logic might be duplicated across modules.

## Investigation

### Current architecture

Pricing resolution follows a **snapshot-at-write** pattern with three pure domain functions:

1. **`resolvePricingRule(rules, branchId)`** (`pricing-rule/domain/resolve-pricing-rule.ts`)
   Selects the best pricing rule from a loaded set. Branch-level rules (specificity 2) take priority over tenant-level rules (specificity 1). Only active rules are considered.

2. **`snapshotPricing(rule)`** (`appointment/domain/appointment-pricing.service.ts`)
   Creates an immutable pricing snapshot from the resolved rule at the time of appointment creation.

3. **`calculatePayoutAmount(priceAmount, payoutType, payoutValue)`** (`appointment/domain/appointment-pricing.service.ts`)
   Computes the payout amount from rule parameters. Supports `FIXED` and `PERCENTAGE` payout types.

### How each consumer uses pricing

| Consumer | How pricing is obtained | Re-resolves rules? |
|---|---|---|
| `CreateAppointmentUseCase` | Loads rules from repo, calls all three functions, stores `payoutAmount` and `pricingRuleSnapshotJson` on the appointment | Yes (write-time only) |
| Marketplace (`findPublishedForInspector`) | Reads pre-computed `payout_amount` from appointment table, sums per group | No |
| Billing (`CreateFinancialEntriesOnDone`) | Reads pre-computed `payoutAmount` from appointment entity | No |
| Import worker | Sets `payoutAmount: 0` (pricing resolved separately) | No |

### Finding

There is **no duplication**. The marketplace and billing modules consume the pre-computed `payoutAmount` stored on the appointment entity at creation time. They never re-resolve pricing rules.

The three domain functions are already located in the correct layer:
- `resolvePricingRule` lives in the `pricing-rule` module's domain (it operates on `PricingRuleEntity`)
- `snapshotPricing` and `calculatePayoutAmount` live in the `appointment` module's domain (they produce appointment-specific output)

### Why a `PricingResolverService` is not needed

A `PricingResolverService` that wraps repository access + domain resolution would only add indirection for a single call site (`CreateAppointmentUseCase`). The use case already has `IPricingRuleRepository` injected and calls the pure domain function directly -- this is the canonical Clean Architecture approach.

If a second write-time consumer emerges (e.g., bulk re-pricing, service type change), extracting the service would be justified. Until then, YAGNI applies.

## Regression test

A regression test was added to verify that marketplace payout estimates are consistent with the domain pricing functions:
- `apps/backend/tests/unit/service-group/marketplace-payout-consistency.test.ts`

This test asserts that summing `calculatePayoutAmount` per appointment produces the same result as the marketplace's aggregation logic, for both `FIXED` and `PERCENTAGE` payout types.

## Decision

Keep the current architecture. No extraction needed.
