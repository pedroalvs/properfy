import type { BonusRule } from '@properfy/shared';
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

/**
 * List read-model: a pricing rule plus the denormalized names of its related
 * service type and (optional) branch, joined in a single query so the client
 * never has to resolve ids against a capped options fetch.
 */
export interface PricingRuleListItem {
  rule: PricingRuleEntity;
  serviceTypeName: string;
  branchName: string | null;
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
  /**
   * Like `findAll`, but joins the related service-type and branch names for the
   * list view (one query). Separate from `findAll` so the entity-returning
   * contract other callers (appointment pricing resolution) rely on is unchanged.
   */
  findAllWithNames(
    filters: PricingRuleFilters,
    pagination: PaginationParams,
  ): Promise<PricingRuleListItem[]>;
  count(filters: PricingRuleFilters): Promise<number>;
  save(rule: PricingRuleEntity): Promise<void>;
  update(
    id: string,
    tenantId: string,
    data: Partial<{
      priceAmount: number;
      payoutType: string;
      payoutValue: number;
      bonusRuleJson: BonusRule | null;
      status: string;
    }>,
  ): Promise<void>;
}
