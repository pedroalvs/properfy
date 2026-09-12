import type { PrismaClient } from '@prisma/client';
import type { PayoutType as PrismaPayoutType, PriceRuleStatus as PrismaPriceRuleStatus, Prisma } from '@prisma/client';
import { PricingRuleEntity } from '../domain/pricing-rule.entity';
import type {
  IPricingRuleRepository,
  PricingRuleFilters,
  PaginationParams,
  PricingRuleListRow,
} from '../domain/pricing-rule.repository';
import type { PayoutType, PriceRuleStatus, BonusRule } from '@properfy/shared';

// Allowlist of sortable fields → DB columns. Passing an arbitrary client string
// straight into Prisma's orderBy throws a runtime error on unknown fields (#608),
// so anything not listed falls back to created_at.
const SORTABLE_COLUMNS: Record<string, string> = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  priceAmount: 'price_amount',
  payoutValue: 'payout_value',
  status: 'status',
  currency: 'currency',
};

function resolveSortColumn(sortBy: string | undefined): string {
  // Index with the coalesced key so an empty string (which the pagination schema
  // accepts) misses the allowlist and falls back — `sortBy && …` would return the
  // empty string itself and produce an invalid `orderBy: { '': … }` (#608).
  return SORTABLE_COLUMNS[sortBy ?? ''] ?? 'created_at';
}

function mapToEntity(row: {
  id: string;
  tenant_id: string;
  currency: string;
  service_type_id: string;
  branch_id: string | null;
  price_amount: unknown;
  payout_type: string;
  payout_value: unknown;
  bonus_rule_json: unknown;
  status: string;
  created_at: Date;
  updated_at: Date;
}): PricingRuleEntity {
  return new PricingRuleEntity({
    id: row.id,
    tenantId: row.tenant_id,
    currency: row.currency,
    serviceTypeId: row.service_type_id,
    branchId: row.branch_id,
    priceAmount: Number(row.price_amount),
    payoutType: row.payout_type as PayoutType,
    payoutValue: Number(row.payout_value),
    bonusRuleJson: (row.bonus_rule_json as BonusRule) ?? null,
    status: row.status as PriceRuleStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaPricingRuleRepository implements IPricingRuleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(
    id: string,
    tenantId: string | null,
  ): Promise<PricingRuleEntity | null> {
    // tenantId is null for cross-tenant roles (AM/OP): find by id alone.
    // CL_ADMIN passes its own tenant, scoping the lookup.
    const where: Record<string, unknown> = { id };
    if (tenantId) where['tenant_id'] = tenantId;
    const row = await this.prisma.servicePriceRule.findFirst({ where });
    return row ? mapToEntity(row) : null;
  }

  async findByUnique(
    tenantId: string,
    serviceTypeId: string,
    branchId: string | null,
  ): Promise<PricingRuleEntity | null> {
    const row = await this.prisma.servicePriceRule.findFirst({
      where: {
        tenant_id: tenantId,
        service_type_id: serviceTypeId,
        branch_id: branchId,
      },
    });
    return row ? mapToEntity(row) : null;
  }

  async findAll(
    filters: PricingRuleFilters,
    pagination: PaginationParams,
  ): Promise<PricingRuleEntity[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.servicePriceRule.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [resolveSortColumn(pagination.sortBy)]: pagination.sortOrder,
      },
    });
    return rows.map(mapToEntity);
  }

  async findAllWithNames(
    filters: PricingRuleFilters,
    pagination: PaginationParams,
  ): Promise<PricingRuleListRow[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.servicePriceRule.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [resolveSortColumn(pagination.sortBy)]: pagination.sortOrder,
      },
      include: {
        tenant: { select: { name: true } },
        service_type: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      rule: mapToEntity(row),
      tenantName: row.tenant.name,
      serviceTypeName: row.service_type.name,
    }));
  }

  async count(filters: PricingRuleFilters): Promise<number> {
    const where = this.buildWhere(filters);
    return this.prisma.servicePriceRule.count({ where });
  }

  async save(rule: PricingRuleEntity): Promise<void> {
    await this.prisma.servicePriceRule.create({
      data: {
        id: rule.id,
        tenant_id: rule.tenantId,
        currency: rule.currency,
        service_type_id: rule.serviceTypeId,
        branch_id: rule.branchId,
        price_amount: rule.priceAmount,
        payout_type: rule.payoutType as PrismaPayoutType,
        payout_value: rule.payoutValue,
        bonus_rule_json: (rule.bonusRuleJson as Prisma.InputJsonValue) ?? undefined,
        status: rule.status as PrismaPriceRuleStatus,
      },
    });
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<{
      priceAmount: number;
      payoutType: PayoutType;
      payoutValue: number;
      bonusRuleJson: BonusRule | null;
      status: PriceRuleStatus;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.priceAmount !== undefined)
      updateData['price_amount'] = data.priceAmount;
    if (data.payoutType !== undefined)
      updateData['payout_type'] = data.payoutType;
    if (data.payoutValue !== undefined)
      updateData['payout_value'] = data.payoutValue;
    if (data.bonusRuleJson !== undefined)
      updateData['bonus_rule_json'] = data.bonusRuleJson;
    if (data.status !== undefined) updateData['status'] = data.status;
    await this.prisma.servicePriceRule.updateMany({
      where: { id, tenant_id: tenantId },
      data: updateData,
    });
  }

  private buildWhere(filters: PricingRuleFilters) {
    const where: Record<string, unknown> = {
      tenant_id: filters.tenantId,
    };
    if (filters.serviceTypeId)
      where['service_type_id'] = filters.serviceTypeId;
    if (filters.branchId) where['branch_id'] = filters.branchId;
    if (filters.status) where['status'] = filters.status;
    return where;
  }
}
