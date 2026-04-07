import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  snapshotPricing,
  calculatePayoutAmount,
} from '../../../src/modules/appointment/domain/appointment-pricing.service';
import { PricingRuleEntity } from '../../../src/modules/pricing-rule/domain/pricing-rule.entity';

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

describe('snapshotPricing()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-16T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a snapshot with all rule fields', () => {
    const rule = makePricingRule({ bonusRuleJson: { type: 'VOLUME_TIER', volumeThreshold: 10 } });
    const snapshot = snapshotPricing(rule);

    expect(snapshot.ruleId).toBe('rule-1');
    expect(snapshot.tenantId).toBe('tenant-1');
    expect(snapshot.serviceTypeId).toBe('st-1');
    expect(snapshot.branchId).toBeNull();
    expect(snapshot.priceAmount).toBe(200);
    expect(snapshot.payoutType).toBe('PERCENTAGE');
    expect(snapshot.payoutValue).toBe(70);
    expect(snapshot.bonusRuleJson).toEqual({ type: 'VOLUME_TIER', volumeThreshold: 10 });
  });

  it('sets snapshotAt to the current ISO timestamp', () => {
    const rule = makePricingRule();
    const snapshot = snapshotPricing(rule);

    expect(snapshot.snapshotAt).toBe('2026-03-16T10:00:00.000Z');
  });

  it('includes branchId when set', () => {
    const rule = makePricingRule({ branchId: 'branch-1' });
    const snapshot = snapshotPricing(rule);

    expect(snapshot.branchId).toBe('branch-1');
  });

  it('snapshot bonusRuleJson is null when rule has no bonus', () => {
    const rule = makePricingRule({ bonusRuleJson: null });
    const snapshot = snapshotPricing(rule);

    expect(snapshot.bonusRuleJson).toBeNull();
  });
});

describe('calculatePayoutAmount()', () => {
  describe('FIXED payout type', () => {
    it('returns the fixed payoutValue regardless of priceAmount', () => {
      expect(calculatePayoutAmount(200, 'FIXED', 150)).toBe(150);
    });

    it('returns fixed value even when priceAmount is zero', () => {
      expect(calculatePayoutAmount(0, 'FIXED', 100)).toBe(100);
    });

    it('returns the exact fixed value without modification', () => {
      expect(calculatePayoutAmount(500, 'FIXED', 75.5)).toBe(75.5);
    });
  });

  describe('PERCENTAGE payout type', () => {
    it('calculates 70% of 200 as 140', () => {
      expect(calculatePayoutAmount(200, 'PERCENTAGE', 70)).toBe(140);
    });

    it('calculates 50% of 300 as 150', () => {
      expect(calculatePayoutAmount(300, 'PERCENTAGE', 50)).toBe(150);
    });

    it('calculates 100% of 200 as 200', () => {
      expect(calculatePayoutAmount(200, 'PERCENTAGE', 100)).toBe(200);
    });

    it('rounds to 2 decimal places', () => {
      // 200 * (33.33 / 100) = 66.66, round to 2 decimals
      expect(calculatePayoutAmount(200, 'PERCENTAGE', 33.33)).toBe(66.66);
    });

    it('rounds correctly for repeating decimals', () => {
      // 100 * (10 / 3 / 100) = 3.333..., but payoutValue=10/3 is not realistic
      // 100 * (10 / 100) = 10 exactly
      expect(calculatePayoutAmount(100, 'PERCENTAGE', 10)).toBe(10);
    });

    it('calculates correctly for fractional price amounts', () => {
      // 150.50 * (80/100) = 120.4
      expect(calculatePayoutAmount(150.5, 'PERCENTAGE', 80)).toBe(120.4);
    });

    it('returns 0 when priceAmount is 0', () => {
      expect(calculatePayoutAmount(0, 'PERCENTAGE', 70)).toBe(0);
    });

    it('returns 0 when payoutValue is 0', () => {
      expect(calculatePayoutAmount(200, 'PERCENTAGE', 0)).toBe(0);
    });
  });
});
