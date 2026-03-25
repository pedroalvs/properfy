import type { AuthContext, PayoutType, PriceRuleStatus } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IPricingRuleRepository } from '../../domain/pricing-rule.repository';
import { PricingRuleNotFoundError } from '../../domain/pricing-rule.errors';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import { TenantNotFoundError } from '../../../tenant/domain/tenant.errors';

export interface UpdatePricingRuleInput {
  pricingRuleId: string;
  tenantId?: string;
  data: {
    priceAmount?: number;
    payoutType?: PayoutType;
    payoutValue?: number;
    bonusRuleJson?: Record<string, unknown> | null;
    status?: PriceRuleStatus;
  };
  actor: AuthContext;
}

export interface UpdatePricingRuleOutput {
  id: string;
  tenantId: string;
  currency: string;
  serviceTypeId: string;
  branchId: string | null;
  priceAmount: number;
  payoutType: string;
  payoutValue: number;
  bonusRuleJson: Record<string, unknown> | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UpdatePricingRuleUseCase {
  constructor(
    private readonly pricingRuleRepo: IPricingRuleRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(
    input: UpdatePricingRuleInput,
  ): Promise<UpdatePricingRuleOutput> {
    const { pricingRuleId, data, actor } = input;

    // RBAC: AM/OP any tenant, CL_ADMIN own tenant, others forbidden
    if (actor.role !== 'AM' && actor.role !== 'OP' && actor.role !== 'CL_ADMIN') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // Resolve tenantId for scoped lookup
    const resolvedTenantId =
      actor.role === 'AM' || actor.role === 'OP'
        ? input.tenantId!
        : actor.tenantId!;

    const rule = await this.pricingRuleRepo.findById(pricingRuleId, resolvedTenantId);
    if (!rule) {
      throw new PricingRuleNotFoundError();
    }

    const tenant = await this.tenantRepo.findById(rule.tenantId);
    if (!tenant) {
      throw new TenantNotFoundError();
    }

    // For CL_ADMIN, verify tenant scope
    if (actor.role === 'CL_ADMIN' && rule.tenantId !== actor.tenantId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const before = {
      priceAmount: rule.priceAmount,
      payoutType: rule.payoutType,
      payoutValue: rule.payoutValue,
      bonusRuleJson: rule.bonusRuleJson,
      status: rule.status,
    };

    const updateData: Record<string, unknown> = {};
    if (data.priceAmount !== undefined) updateData.priceAmount = data.priceAmount;
    if (data.payoutType !== undefined) updateData.payoutType = data.payoutType;
    if (data.payoutValue !== undefined) updateData.payoutValue = data.payoutValue;
    if (data.bonusRuleJson !== undefined) updateData.bonusRuleJson = data.bonusRuleJson;
    if (data.status !== undefined) updateData.status = data.status;

    await this.pricingRuleRepo.update(pricingRuleId, rule.tenantId, updateData);

    const after = {
      priceAmount: (updateData.priceAmount as number) ?? rule.priceAmount,
      payoutType: (updateData.payoutType as string) ?? rule.payoutType,
      payoutValue: (updateData.payoutValue as number) ?? rule.payoutValue,
      bonusRuleJson:
        (updateData.bonusRuleJson as Record<string, unknown> | null) ??
        rule.bonusRuleJson,
      status: (updateData.status as string) ?? rule.status,
    };

    this.auditService.log({
      action: 'pricing_rule.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'PricingRule',
      entityId: pricingRuleId,
      tenantId: rule.tenantId,
      before,
      after,
    });

    return {
      id: rule.id,
      tenantId: rule.tenantId,
      currency: tenant.currency,
      serviceTypeId: rule.serviceTypeId,
      branchId: rule.branchId,
      priceAmount: after.priceAmount,
      payoutType: after.payoutType,
      payoutValue: after.payoutValue,
      bonusRuleJson: after.bonusRuleJson,
      status: after.status,
      createdAt: rule.createdAt,
      updatedAt: new Date(),
    };
  }
}
