import type { PricingRuleEntity } from './pricing-rule.entity';

/**
 * Resolves the best pricing rule for a given context.
 * Branch-level rules (specificity=2) take priority over tenant-level rules (specificity=1).
 * Only active rules are considered.
 */
export function resolvePricingRule(
  rules: PricingRuleEntity[],
  branchId?: string | null,
): PricingRuleEntity | null {
  const activeRules = rules.filter((r) => r.isActive());
  if (activeRules.length === 0) return null;

  if (branchId) {
    const branchRule = activeRules.find((r) => r.branchId === branchId);
    if (branchRule) return branchRule;
  }

  // Fallback to tenant-level rule (branchId is null)
  const tenantRule = activeRules.find((r) => r.branchId === null);
  return tenantRule ?? null;
}
