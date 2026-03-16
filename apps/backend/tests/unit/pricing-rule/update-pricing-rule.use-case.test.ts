import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdatePricingRuleUseCase } from '../../../src/modules/pricing-rule/application/use-cases/update-pricing-rule.use-case';
import type { IPricingRuleRepository } from '../../../src/modules/pricing-rule/domain/pricing-rule.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { PricingRuleEntity } from '../../../src/modules/pricing-rule/domain/pricing-rule.entity';
import { PricingRuleNotFoundError } from '../../../src/modules/pricing-rule/domain/pricing-rule.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makePricingRule(
  overrides: Partial<ConstructorParameters<typeof PricingRuleEntity>[0]> = {},
): PricingRuleEntity {
  return new PricingRuleEntity({
    id: 'pr-1',
    tenantId: 'tenant-1',
    serviceTypeId: 'st-1',
    branchId: null,
    priceAmount: 15000,
    payoutType: 'FIXED',
    payoutValue: 8000,
    bonusRuleJson: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-am-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    ...overrides,
  };
}

describe('UpdatePricingRuleUseCase', () => {
  let pricingRuleRepo: IPricingRuleRepository;
  let auditService: AuditService;
  let useCase: UpdatePricingRuleUseCase;

  beforeEach(() => {
    pricingRuleRepo = {
      findById: vi.fn(),
      findByUnique: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new UpdatePricingRuleUseCase(pricingRuleRepo, auditService);
  });

  it('should update pricing rule for AM', async () => {
    vi.mocked(pricingRuleRepo.findById).mockResolvedValue(makePricingRule());

    const result = await useCase.execute({
      pricingRuleId: 'pr-1',
      tenantId: 'tenant-1',
      data: { priceAmount: 20000, status: 'INACTIVE' },
      actor: makeActor(),
    });

    expect(result.priceAmount).toBe(20000);
    expect(result.status).toBe('INACTIVE');
    expect(pricingRuleRepo.update).toHaveBeenCalledWith('pr-1', 'tenant-1', {
      priceAmount: 20000,
      status: 'INACTIVE',
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pricing_rule.updated',
        before: expect.objectContaining({ priceAmount: 15000 }),
        after: expect.objectContaining({ priceAmount: 20000 }),
      }),
    );
  });

  it('should throw PRICING_RULE_NOT_FOUND when not found', async () => {
    vi.mocked(pricingRuleRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        pricingRuleId: 'nonexistent',
        tenantId: 'tenant-1',
        data: { priceAmount: 20000 },
        actor: makeActor(),
      }),
    ).rejects.toThrow(PricingRuleNotFoundError);
  });

  it('should throw AUTH_FORBIDDEN for CL_USER', async () => {
    await expect(
      useCase.execute({
        pricingRuleId: 'pr-1',
        data: { priceAmount: 20000 },
        actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
