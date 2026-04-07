import type { BonusRule } from '@properfy/shared';
import type { PricingRuleEntity } from '../../pricing-rule/domain/pricing-rule.entity';

export interface PricingSnapshot {
  ruleId: string;
  tenantId: string;
  serviceTypeId: string;
  branchId: string | null;
  priceAmount: number;
  payoutType: string;
  payoutValue: number;
  bonusRuleJson: BonusRule | null;
  snapshotAt: string;
}

export function snapshotPricing(rule: PricingRuleEntity): PricingSnapshot {
  return {
    ruleId: rule.id,
    tenantId: rule.tenantId,
    serviceTypeId: rule.serviceTypeId,
    branchId: rule.branchId,
    priceAmount: rule.priceAmount,
    payoutType: rule.payoutType,
    payoutValue: rule.payoutValue,
    bonusRuleJson: rule.bonusRuleJson,
    snapshotAt: new Date().toISOString(),
  };
}

export function calculatePayoutAmount(
  priceAmount: number,
  payoutType: string,
  payoutValue: number,
): number {
  if (payoutType === 'FIXED') return payoutValue;
  // PERCENTAGE
  return Math.round(priceAmount * (payoutValue / 100) * 100) / 100;
}
