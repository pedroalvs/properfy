# Pricing Rule History — Design Decision

**Feature**: 004-service-catalog / GAP-007
**Date**: 2026-04-06
**Status**: DECIDED

## Decision

**Use audit log replay. No separate history table.**

## Context

Pricing rule updates (`PATCH /v1/pricing-rules/:id`) overwrite the current row in `service_price_rules`. There is no dedicated `service_price_rule_history` table. To answer "what price was charged on date X?" requires reading the audit log.

## Rationale

1. The `AuditService` already stores `before`/`after` JSON snapshots on every pricing rule update (`action: 'pricing_rule.updated'`, `entityType: 'PricingRule'`). The snapshots include `currency`, `priceAmount`, `payoutType`, `payoutValue`, `bonusRuleJson`, and `status`.
2. Pricing rule changes are infrequent — typically a few per month per tenant.
3. A separate history table would duplicate the data already captured by the audit log.
4. Feature 011-reports-audit already provides query access to audit entries, so no new API is needed.
5. The audit log is append-only and immutable, making it the canonical source of truth for all mutations.

## Alternative considered: append-only history table

A `service_price_rule_history` table with columns mirroring the pricing rule plus `valid_from`/`valid_to` would allow direct SQL joins for billing reconciliation without parsing JSON.

**Rejected because:**
- Low query frequency does not justify the schema and write-path complexity.
- The audit log already provides the same data.
- If query performance becomes an issue in the future, a materialized view or history table can be added as an optimization without changing the write path.

## How to answer "what price was charged on date X?"

### Query pattern

Given a pricing rule ID and a target date, find the most recent audit entry at or before that date and read the `after` snapshot.

**Step 1 — Find the effective state at the target date:**

```sql
SELECT
  al.after_json->>'priceAmount'  AS price_amount,
  al.after_json->>'payoutType'   AS payout_type,
  al.after_json->>'payoutValue'  AS payout_value,
  al.after_json->>'currency'     AS currency,
  al.after_json->>'bonusRuleJson' AS bonus_rule_json,
  al.after_json->>'status'       AS status,
  al.created_at                  AS effective_from
FROM audit_logs al
WHERE al.entity_type = 'PricingRule'
  AND al.entity_id   = :rule_id
  AND al.action      IN ('pricing_rule.created', 'pricing_rule.updated')
  AND al.created_at <= :target_date
ORDER BY al.created_at DESC
LIMIT 1;
```

**Step 2 — Interpret the result:**

- If a row is returned, the `after` snapshot reflects the pricing rule state that was effective at `target_date`.
- If no row is returned, the pricing rule did not exist at that date.
- The `pricing_rule.created` entry captures the initial state. Subsequent `pricing_rule.updated` entries capture each change.

### Application-level helper (pseudocode)

```typescript
async function getPricingRuleAtDate(
  ruleId: string,
  targetDate: Date,
  auditLogRepo: IAuditLogRepository,
): Promise<PricingSnapshot | null> {
  const entry = await auditLogRepo.findLatestBefore({
    entityType: 'PricingRule',
    entityId: ruleId,
    actions: ['pricing_rule.created', 'pricing_rule.updated'],
    before: targetDate,
  });

  if (!entry) return null;

  const after = entry.afterJson;
  return {
    priceAmount: after.priceAmount,
    payoutType: after.payoutType,
    payoutValue: after.payoutValue,
    currency: after.currency,
    bonusRuleJson: after.bonusRuleJson,
    status: after.status,
    effectiveFrom: entry.createdAt,
  };
}
```

This function can be implemented as a utility when billing dispute resolution or audit reporting requires it. Until then, the SQL query above can be run directly against the audit log.

## Audit snapshot completeness

The `UpdatePricingRuleUseCase` audit entry now includes the following fields in both `before` and `after` snapshots:

- `currency` (immutable, copied from tenant at rule creation)
- `priceAmount`
- `payoutType`
- `payoutValue`
- `bonusRuleJson`
- `status`

The `CreatePricingRuleUseCase` audit entry includes all entity fields in the `after` snapshot (including `currency`, `serviceTypeId`, `branchId`).

This ensures full traceability of pricing values across the rule's lifetime.
