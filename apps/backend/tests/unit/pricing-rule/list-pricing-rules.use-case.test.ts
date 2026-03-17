import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListPricingRulesUseCase } from '../../../src/modules/pricing-rule/application/use-cases/list-pricing-rules.use-case';
import type { IPricingRuleRepository } from '../../../src/modules/pricing-rule/domain/pricing-rule.repository';
import type { AuthContext } from '@properfy/shared';
import { PricingRuleEntity } from '../../../src/modules/pricing-rule/domain/pricing-rule.entity';

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
    inspectorId: null,
    ...overrides,
  };
}

describe('ListPricingRulesUseCase', () => {
  let pricingRuleRepo: IPricingRuleRepository;
  let useCase: ListPricingRulesUseCase;

  beforeEach(() => {
    pricingRuleRepo = {
      findById: vi.fn(),
      findByUnique: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    useCase = new ListPricingRulesUseCase(pricingRuleRepo);
  });

  it('should return paginated list for AM', async () => {
    const items = [
      makePricingRule({ id: 'pr-1' }),
      makePricingRule({ id: 'pr-2', branchId: 'branch-1' }),
    ];
    vi.mocked(pricingRuleRepo.findAll).mockResolvedValue(items);
    vi.mocked(pricingRuleRepo.count).mockResolvedValue(2);

    const result = await useCase.execute({
      filters: { tenantId: 'tenant-1' },
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor(),
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
  });

  it('should use actor.tenantId for CL_ADMIN', async () => {
    vi.mocked(pricingRuleRepo.findAll).mockResolvedValue([]);
    vi.mocked(pricingRuleRepo.count).mockResolvedValue(0);

    await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(pricingRuleRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      expect.any(Object),
    );
  });
});
