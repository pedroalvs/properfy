import { describe, it, expect } from 'vitest';
import { calculatePayoutAmount } from '../../../src/modules/appointment/domain/appointment-pricing.service';
import { resolvePricingRule } from '../../../src/modules/pricing-rule/domain/resolve-pricing-rule';
import { PricingRuleEntity } from '../../../src/modules/pricing-rule/domain/pricing-rule.entity';

/**
 * GAP-002 regression test: verifies that the marketplace payout estimate
 * (sum of pre-computed appointment payout_amount values) is consistent with
 * the domain pricing functions used at appointment creation time.
 *
 * The marketplace reads pre-computed payout_amount from appointments and sums
 * them per service group. This test asserts that the domain functions produce
 * the same values that would be summed by the marketplace query.
 */

function makePricingRule(
  overrides: Partial<ConstructorParameters<typeof PricingRuleEntity>[0]> = {},
): PricingRuleEntity {
  return new PricingRuleEntity({
    id: 'rule-1',
    tenantId: 'tenant-1',
    currency: 'AUD',
    serviceTypeId: 'st-1',
    branchId: null,
    priceAmount: 200,
    payoutType: 'PERCENTAGE',
    payoutValue: 70,
    bonusRuleJson: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

/**
 * Simulates the marketplace aggregation logic from
 * PrismaServiceGroupRepository.findPublishedForInspector:
 *   const payoutTotal = appts.reduce((sum, a) => {
 *     const val = a.payout_amount != null ? parseFloat(a.payout_amount.toString()) : 0;
 *     return sum + val;
 *   }, 0);
 *   const payoutEstimate = payoutTotal > 0 ? payoutTotal : null;
 */
function simulateMarketplaceAggregation(payoutAmounts: (number | null)[]): number | null {
  const total = payoutAmounts.reduce((sum: number, val) => {
    return sum + (val != null ? parseFloat(val.toString()) : 0);
  }, 0);
  return total > 0 ? total : null;
}

describe('GAP-002: marketplace payout estimate consistency', () => {
  describe('PERCENTAGE payout type', () => {
    it('marketplace sum matches domain calculation for a group of 3 appointments', () => {
      const rules = [makePricingRule({ payoutType: 'PERCENTAGE', payoutValue: 70, priceAmount: 200 })];
      const resolved = resolvePricingRule(rules, null);
      expect(resolved).not.toBeNull();

      const payoutPerAppointment = calculatePayoutAmount(
        resolved!.priceAmount,
        resolved!.payoutType,
        resolved!.payoutValue,
      );

      // Simulate 3 appointments in a service group, each with the same pricing
      const appointmentPayouts = [payoutPerAppointment, payoutPerAppointment, payoutPerAppointment];
      const marketplaceEstimate = simulateMarketplaceAggregation(appointmentPayouts);

      expect(payoutPerAppointment).toBe(140); // 200 * 70% = 140
      expect(marketplaceEstimate).toBe(420); // 140 * 3
    });

    it('handles mixed pricing across appointments in a group', () => {
      const tenantRule = makePricingRule({
        id: 'tenant-rule',
        branchId: null,
        priceAmount: 200,
        payoutType: 'PERCENTAGE',
        payoutValue: 70,
      });
      const branchRule = makePricingRule({
        id: 'branch-rule',
        branchId: 'branch-1',
        priceAmount: 300,
        payoutType: 'PERCENTAGE',
        payoutValue: 60,
      });
      const allRules = [tenantRule, branchRule];

      // Appointment 1: branch-1 pricing
      const rule1 = resolvePricingRule(allRules, 'branch-1');
      const payout1 = calculatePayoutAmount(rule1!.priceAmount, rule1!.payoutType, rule1!.payoutValue);

      // Appointment 2: no branch (tenant fallback)
      const rule2 = resolvePricingRule(allRules, null);
      const payout2 = calculatePayoutAmount(rule2!.priceAmount, rule2!.payoutType, rule2!.payoutValue);

      expect(payout1).toBe(180); // 300 * 60%
      expect(payout2).toBe(140); // 200 * 70%

      const marketplaceEstimate = simulateMarketplaceAggregation([payout1, payout2]);
      expect(marketplaceEstimate).toBe(320); // 180 + 140
    });
  });

  describe('FIXED payout type', () => {
    it('marketplace sum matches domain calculation for fixed payouts', () => {
      const rules = [makePricingRule({ payoutType: 'FIXED', payoutValue: 150, priceAmount: 200 })];
      const resolved = resolvePricingRule(rules, null);
      expect(resolved).not.toBeNull();

      const payoutPerAppointment = calculatePayoutAmount(
        resolved!.priceAmount,
        resolved!.payoutType,
        resolved!.payoutValue,
      );

      const appointmentPayouts = [payoutPerAppointment, payoutPerAppointment];
      const marketplaceEstimate = simulateMarketplaceAggregation(appointmentPayouts);

      expect(payoutPerAppointment).toBe(150);
      expect(marketplaceEstimate).toBe(300); // 150 * 2
    });
  });

  describe('edge cases', () => {
    it('returns null estimate when all appointments have zero payout', () => {
      const rules = [makePricingRule({ payoutType: 'FIXED', payoutValue: 0, priceAmount: 200 })];
      const resolved = resolvePricingRule(rules, null);
      const payout = calculatePayoutAmount(resolved!.priceAmount, resolved!.payoutType, resolved!.payoutValue);

      expect(payout).toBe(0);
      expect(simulateMarketplaceAggregation([payout, payout])).toBeNull();
    });

    it('returns null estimate when all appointments have null payout', () => {
      // Simulates appointments without pricing (e.g., from import with payout=0)
      expect(simulateMarketplaceAggregation([null, null])).toBeNull();
    });

    it('handles mix of priced and unpriced appointments', () => {
      const rules = [makePricingRule({ payoutType: 'FIXED', payoutValue: 100 })];
      const resolved = resolvePricingRule(rules, null);
      const payout = calculatePayoutAmount(resolved!.priceAmount, resolved!.payoutType, resolved!.payoutValue);

      // One appointment priced, one not (null from import)
      const estimate = simulateMarketplaceAggregation([payout, null]);
      expect(estimate).toBe(100);
    });

    it('resolves branch-specific pricing correctly for payout calculation', () => {
      const tenantRule = makePricingRule({
        id: 'tenant-rule',
        branchId: null,
        priceAmount: 100,
        payoutType: 'FIXED',
        payoutValue: 50,
      });
      const branchRule = makePricingRule({
        id: 'branch-rule',
        branchId: 'branch-1',
        priceAmount: 200,
        payoutType: 'FIXED',
        payoutValue: 120,
      });

      // Branch rule takes priority
      const resolved = resolvePricingRule([tenantRule, branchRule], 'branch-1');
      expect(resolved!.id).toBe('branch-rule');
      const payout = calculatePayoutAmount(resolved!.priceAmount, resolved!.payoutType, resolved!.payoutValue);
      expect(payout).toBe(120);

      // Without branch match, falls back to tenant
      const fallback = resolvePricingRule([tenantRule, branchRule], 'branch-other');
      expect(fallback!.id).toBe('tenant-rule');
      const fallbackPayout = calculatePayoutAmount(fallback!.priceAmount, fallback!.payoutType, fallback!.payoutValue);
      expect(fallbackPayout).toBe(50);
    });
  });
});
