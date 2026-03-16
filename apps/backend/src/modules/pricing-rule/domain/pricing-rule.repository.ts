import type { PricingRuleEntity } from './pricing-rule.entity';

export interface PricingRuleFilters {
  tenantId: string;
  serviceTypeId?: string;
  branchId?: string;
  status?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface IPricingRuleRepository {
  findById(id: string, tenantId: string): Promise<PricingRuleEntity | null>;
  findByUnique(
    tenantId: string,
    serviceTypeId: string,
    branchId: string | null,
  ): Promise<PricingRuleEntity | null>;
  findAll(
    filters: PricingRuleFilters,
    pagination: PaginationParams,
  ): Promise<PricingRuleEntity[]>;
  count(filters: PricingRuleFilters): Promise<number>;
  save(rule: PricingRuleEntity): Promise<void>;
  update(
    id: string,
    tenantId: string,
    data: Partial<{
      priceAmount: number;
      payoutType: string;
      payoutValue: number;
      bonusRuleJson: Record<string, unknown> | null;
      status: string;
    }>,
  ): Promise<void>;
}
