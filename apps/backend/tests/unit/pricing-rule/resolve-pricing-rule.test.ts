import { describe, it, expect } from 'vitest';
import { resolvePricingRule } from '../../../src/modules/pricing-rule/domain/resolve-pricing-rule';
import { PricingRuleEntity } from '../../../src/modules/pricing-rule/domain/pricing-rule.entity';

function makePricingRule(
  overrides: Partial<ConstructorParameters<typeof PricingRuleEntity>[0]> = {},
): PricingRuleEntity {
  return new PricingRuleEntity({
    id: 'pr-1',
    tenantId: 'tenant-1',
    currency: 'AUD',
    serviceTypeId: 'st-1',
    branchId: null,
    priceAmount: 15000,
    payoutType: 'FIXED',
    payoutValue: 8000,
    bonusRuleJson: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('resolvePricingRule', () => {
  it('should return branch-level rule when available', () => {
    const tenantRule = makePricingRule({ id: 'pr-tenant', branchId: null });
    const branchRule = makePricingRule({
      id: 'pr-branch',
      branchId: 'branch-1',
      priceAmount: 20000,
    });

    const result = resolvePricingRule([tenantRule, branchRule], 'branch-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('pr-branch');
    expect(result!.priceAmount).toBe(20000);
  });

  it('should fallback to tenant-level rule when no branch rule matches', () => {
    const tenantRule = makePricingRule({ id: 'pr-tenant', branchId: null });
    const branchRule = makePricingRule({
      id: 'pr-branch',
      branchId: 'branch-2',
    });

    const result = resolvePricingRule([tenantRule, branchRule], 'branch-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('pr-tenant');
  });

  it('should return null when no active rules exist', () => {
    const result = resolvePricingRule([], 'branch-1');
    expect(result).toBeNull();
  });

  it('should skip inactive rules', () => {
    const inactiveRule = makePricingRule({
      id: 'pr-inactive',
      branchId: null,
      status: 'INACTIVE',
    });

    const result = resolvePricingRule([inactiveRule], null);
    expect(result).toBeNull();
  });

  it('should return tenant-level rule when branchId is null', () => {
    const tenantRule = makePricingRule({ id: 'pr-tenant', branchId: null });
    const branchRule = makePricingRule({
      id: 'pr-branch',
      branchId: 'branch-1',
    });

    const result = resolvePricingRule([tenantRule, branchRule], null);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('pr-tenant');
  });
});
