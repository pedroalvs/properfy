import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type {
  IPricingRuleRepository,
  PricingRuleFilters,
  PaginationParams,
} from '../../domain/pricing-rule.repository';

export interface ListPricingRulesInput {
  filters: {
    tenantId?: string;
    serviceTypeId?: string;
    branchId?: string;
    status?: string;
  };
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ListPricingRulesOutput {
  data: Array<{
    id: string;
    tenantId: string;
    serviceTypeId: string;
    branchId: string | null;
    priceAmount: number;
    payoutType: string;
    payoutValue: number;
    bonusRuleJson: Record<string, unknown> | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export class ListPricingRulesUseCase {
  constructor(private readonly pricingRuleRepo: IPricingRuleRepository) {}

  async execute(input: ListPricingRulesInput): Promise<ListPricingRulesOutput> {
    const { filters, pagination, actor } = input;

    // RBAC: AM/OP any tenant, CL_ADMIN/CL_USER own tenant, others forbidden
    if (
      actor.role !== 'AM' &&
      actor.role !== 'OP' &&
      actor.role !== 'CL_ADMIN' &&
      actor.role !== 'CL_USER'
    ) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const isGlobal = actor.role === 'AM' || actor.role === 'OP';
    const resolvedTenantId = isGlobal ? filters.tenantId : actor.tenantId;

    if (!isGlobal && !resolvedTenantId) {
      return { data: [], total: 0, page: pagination.page, pageSize: pagination.pageSize };
    }

    const resolvedFilters: PricingRuleFilters = {
      tenantId: resolvedTenantId,
      serviceTypeId: filters.serviceTypeId,
      branchId: filters.branchId,
      status: filters.status,
    };

    const [data, total] = await Promise.all([
      this.pricingRuleRepo.findAll(resolvedFilters, pagination),
      this.pricingRuleRepo.count(resolvedFilters),
    ]);

    return {
      data: data.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        serviceTypeId: r.serviceTypeId,
        branchId: r.branchId,
        priceAmount: r.priceAmount,
        payoutType: r.payoutType,
        payoutValue: r.payoutValue,
        bonusRuleJson: r.bonusRuleJson,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
