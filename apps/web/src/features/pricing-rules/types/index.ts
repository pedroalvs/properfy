import type { BonusRule } from '@properfy/shared';

export interface PricingRule {
  id: string;
  tenantId: string;
  currency: string;
  // Server-provided on every pricing-catalog list row (#389). Kept optional
  // because the shared type is also used by tenants/PricingRulesSection, which
  // enriches names client-side; the catalog list relies on PR-2's required
  // server field at runtime.
  tenantName?: string;
  serviceTypeId: string;
  serviceTypeName?: string;
  branchId: string | null;
  branchName?: string | null;
  priceAmount: number;
  payoutType: 'FIXED' | 'PERCENTAGE';
  payoutValue: number;
  bonusRuleJson: BonusRule | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface PricingRuleFormData {
  tenantId: string;
  serviceTypeId: string;
  branchId: string;
  priceAmount: string;
  payoutType: string;
  payoutValue: string;
  status: string;
}

export type PricingRuleFormErrors = Partial<Record<keyof PricingRuleFormData, string>>;

export interface PricingRuleFiltersState {
  tenantId: string;
  serviceTypeId: string;
  branchId: string;
  status: string;
}

export const DEFAULT_FILTERS: PricingRuleFiltersState = {
  tenantId: '',
  serviceTypeId: '',
  branchId: '',
  status: '',
};

export const EMPTY_PRICING_RULE_FORM: PricingRuleFormData = {
  tenantId: '',
  serviceTypeId: '',
  branchId: '',
  priceAmount: '',
  payoutType: '',
  payoutValue: '',
  status: 'ACTIVE',
};
