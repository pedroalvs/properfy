import type { AuthContext, BonusRule, PriceRuleStatus } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type {
  IPricingRuleRepository,
  PricingRuleFilters,
  PaginationParams,
} from '../../domain/pricing-rule.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import { TenantNotFoundError } from '../../../tenant/domain/tenant.errors';

export interface ListPricingRulesInput {
  filters: {
    tenantId?: string;
    serviceTypeId?: string;
    branchId?: string;
    status?: PriceRuleStatus;
  };
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ListPricingRulesOutput {
  data: Array<{
    id: string;
    tenantId: string;
    tenantName: string;
    currency: string;
    serviceTypeId: string;
    serviceTypeName: string;
    branchId: string | null;
    priceAmount: number;
    payoutType: string;
    payoutValue: number;
    bonusRuleJson: BonusRule | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export class ListPricingRulesUseCase {
  constructor(
    private readonly pricingRuleRepo: IPricingRuleRepository,
    private readonly tenantRepo: ITenantRepository,
  ) {}

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

    // AM and OP are both cross-tenant (Constitution v1.3.0; CORRECTION-001, which
    // had narrowed this to AM only, is consciously superseded — create/update
    // already treat OP as cross-tenant, so an OP list was silently empty). A
    // global actor with no tenant filter still gets an empty page (the web's
    // tenant-selection gate). CL_ADMIN/CL_USER stay scoped to their JWT tenant.
    const isGlobal = actor.role === 'AM' || actor.role === 'OP';
    const resolvedTenantId = isGlobal ? filters.tenantId : actor.tenantId;

    if (!resolvedTenantId) {
      return { data: [], total: 0, page: pagination.page, pageSize: pagination.pageSize };
    }

    const tenant = await this.tenantRepo.findById(resolvedTenantId);
    if (!tenant) {
      throw new TenantNotFoundError();
    }

    const resolvedFilters: PricingRuleFilters = {
      tenantId: resolvedTenantId,
      serviceTypeId: filters.serviceTypeId,
      branchId: filters.branchId,
      status: filters.status,
    };

    const [rows, total] = await Promise.all([
      this.pricingRuleRepo.findAllWithNames(resolvedFilters, pagination),
      this.pricingRuleRepo.count(resolvedFilters),
    ]);

    return {
      data: rows.map(({ rule: r, tenantName, serviceTypeName }) => ({
        id: r.id,
        tenantId: r.tenantId,
        tenantName,
        currency: r.currency,
        serviceTypeId: r.serviceTypeId,
        serviceTypeName,
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
