import type { PrismaClient } from '@prisma/client';
import { PricingRuleEntity } from '../domain/pricing-rule.entity';
import type {
  IPricingRuleRepository,
  PricingRuleFilters,
  PaginationParams,
} from '../domain/pricing-rule.repository';
import type { PayoutType, PriceRuleStatus } from '@properfy/shared';

function mapToEntity(row: {
  id: string;
  tenant_id: string;
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
    serviceTypeId: row.service_type_id,
    branchId: row.branch_id,
    priceAmount: Number(row.price_amount),
    payoutType: row.payout_type as PayoutType,
    payoutValue: Number(row.payout_value),
    bonusRuleJson: (row.bonus_rule_json as Record<string, unknown>) ?? null,
    status: row.status as PriceRuleStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaPricingRuleRepository implements IPricingRuleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(
    id: string,
    tenantId: string,
  ): Promise<PricingRuleEntity | null> {
    const row = await this.prisma.servicePriceRule.findFirst({
      where: { id, tenant_id: tenantId },
    });
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
        [pagination.sortBy ?? 'created_at']: pagination.sortOrder,
      },
    });
    return rows.map(mapToEntity);
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
        service_type_id: rule.serviceTypeId,
        branch_id: rule.branchId,
        price_amount: rule.priceAmount,
        payout_type: rule.payoutType as string,
        payout_value: rule.payoutValue,
        bonus_rule_json: rule.bonusRuleJson ?? undefined,
        status: rule.status as string,
      },
    });
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<{
      priceAmount: number;
      payoutType: string;
      payoutValue: number;
      bonusRuleJson: Record<string, unknown> | null;
      status: string;
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
    await this.prisma.servicePriceRule.update({
      where: { id },
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
