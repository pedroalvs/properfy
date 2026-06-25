import type { AuthContext, PayoutType, PriceRuleStatus, BonusRule } from '@properfy/shared';
import {
  ForbiddenError,
  ValidationError,
} from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IPricingRuleRepository } from '../../domain/pricing-rule.repository';
import type { IServiceTypeRepository } from '../../../service-type/domain/service-type.repository';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import { PricingRuleEntity } from '../../domain/pricing-rule.entity';
import { PricingRuleDuplicateError } from '../../domain/pricing-rule.errors';
import { ServiceTypeNotFoundError } from '../../../service-type/domain/service-type.errors';
import { BranchNotFoundError, TenantNotFoundError } from '../../../tenant/domain/tenant.errors';

export interface CreatePricingRuleInput {
  tenantId?: string;
  serviceTypeId: string;
  branchId?: string;
  priceAmount: number;
  payoutType: PayoutType;
  payoutValue: number;
  bonusRuleJson?: BonusRule;
  status?: PriceRuleStatus;
  actor: AuthContext;
}

export interface CreatePricingRuleOutput {
  id: string;
  tenantId: string;
  currency: string;
  serviceTypeId: string;
  branchId: string | null;
  priceAmount: number;
  payoutType: string;
  payoutValue: number;
  bonusRuleJson: BonusRule | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class CreatePricingRuleUseCase {
  constructor(
    private readonly pricingRuleRepo: IPricingRuleRepository,
    private readonly serviceTypeRepo: IServiceTypeRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(
    input: CreatePricingRuleInput,
  ): Promise<CreatePricingRuleOutput> {
    const { serviceTypeId, priceAmount, payoutType, payoutValue, bonusRuleJson, status, actor } =
      input;

    // RBAC: AM/OP are cross-tenant and supply the target tenantId explicitly
    // (they have no own tenant scope). CL_ADMIN is scoped to its own tenant.
    if (actor.role !== 'AM' && actor.role !== 'OP' && actor.role !== 'CL_ADMIN') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const resolvedTenantId =
      actor.role === 'AM' || actor.role === 'OP'
        ? input.tenantId
        : actor.tenantId;

    if (!resolvedTenantId) {
      throw new ValidationError('tenantId is required');
    }

    const tenant = await this.tenantRepo.findById(resolvedTenantId);
    if (!tenant) {
      throw new TenantNotFoundError();
    }

    // Validate service type exists
    const serviceType = await this.serviceTypeRepo.findById(serviceTypeId);
    if (!serviceType) {
      throw new ServiceTypeNotFoundError();
    }

    // Validate branch belongs to tenant if provided
    const resolvedBranchId = input.branchId ?? null;
    if (resolvedBranchId) {
      const branch = await this.branchRepo.findById(resolvedBranchId, resolvedTenantId);
      if (!branch) {
        throw new BranchNotFoundError();
      }
    }

    // Check uniqueness
    const existing = await this.pricingRuleRepo.findByUnique(
      resolvedTenantId,
      serviceTypeId,
      resolvedBranchId,
    );
    if (existing) {
      throw new PricingRuleDuplicateError();
    }

    const now = new Date();
    const id = crypto.randomUUID();

    // Freeze the tenant's current currency on the rule at creation time.
    // This ensures existing rules keep their original currency even if
    // the tenant's currency changes later.
    const currency = tenant.currency;

    const rule = new PricingRuleEntity({
      id,
      tenantId: resolvedTenantId,
      currency,
      serviceTypeId,
      branchId: resolvedBranchId,
      priceAmount,
      payoutType,
      payoutValue,
      bonusRuleJson: bonusRuleJson ?? null,
      status: status ?? 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    await this.pricingRuleRepo.save(rule);

    this.auditService.log({
      action: 'pricing_rule.created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'PricingRule',
      entityId: id,
      tenantId: resolvedTenantId,
      after: {
        id,
        tenantId: resolvedTenantId,
        currency,
        serviceTypeId,
        branchId: resolvedBranchId,
        priceAmount,
        payoutType,
        payoutValue,
        bonusRuleJson: rule.bonusRuleJson,
        status: rule.status,
      },
    });

    return {
      id: rule.id,
      tenantId: rule.tenantId,
      currency: rule.currency,
      serviceTypeId: rule.serviceTypeId,
      branchId: rule.branchId,
      priceAmount: rule.priceAmount,
      payoutType: rule.payoutType,
      payoutValue: rule.payoutValue,
      bonusRuleJson: rule.bonusRuleJson,
      status: rule.status,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }
}
