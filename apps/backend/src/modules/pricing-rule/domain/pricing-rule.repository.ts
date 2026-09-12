import type { BonusRule, PayoutType, PriceRuleStatus } from '@properfy/shared';
import type { PricingRuleEntity } from './pricing-rule.entity';

export interface PricingRuleFilters {
  tenantId: string;
  serviceTypeId?: string;
  branchId?: string;
  status?: PriceRuleStatus;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

/** A list row plus the server-resolved display names for its tenant + service type (#389). */
export interface PricingRuleListRow {
  rule: PricingRuleEntity;
  tenantName: string;
  serviceTypeName: string;
}

export interface IPricingRuleRepository {
  findById(id: string, tenantId: string | null): Promise<PricingRuleEntity | null>;
  findByUnique(
    tenantId: string,
    serviceTypeId: string,
    branchId: string | null,
  ): Promise<PricingRuleEntity | null>;
  findAll(
    filters: PricingRuleFilters,
    pagination: PaginationParams,
  ): Promise<PricingRuleEntity[]>;
  /** Like findAll, but joins tenant + service-type names for list display (#389). */
  findAllWithNames(
    filters: PricingRuleFilters,
    pagination: PaginationParams,
  ): Promise<PricingRuleListRow[]>;
  count(filters: PricingRuleFilters): Promise<number>;
  save(rule: PricingRuleEntity): Promise<void>;
  update(
    id: string,
    tenantId: string,
    data: Partial<{
      priceAmount: number;
      payoutType: PayoutType;
      payoutValue: number;
      bonusRuleJson: BonusRule | null;
      status: PriceRuleStatus;
    }>,
  ): Promise<void>;
}
