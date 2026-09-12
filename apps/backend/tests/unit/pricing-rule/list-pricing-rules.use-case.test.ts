import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListPricingRulesUseCase } from '../../../src/modules/pricing-rule/application/use-cases/list-pricing-rules.use-case';
import type { IPricingRuleRepository } from '../../../src/modules/pricing-rule/domain/pricing-rule.repository';
import type { AuthContext } from '@properfy/shared';
import { PricingRuleEntity } from '../../../src/modules/pricing-rule/domain/pricing-rule.entity';
import type { PricingRuleListItem } from '../../../src/modules/pricing-rule/domain/pricing-rule.repository';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';

function makePricingRule(
  overrides: Partial<ConstructorParameters<typeof PricingRuleEntity>[0]> = {},
): PricingRuleEntity {
  return new PricingRuleEntity({
    id: 'pr-1',
    tenantId: 'tenant-1',
    currency: 'AUD',
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

function listItem(
  rule: PricingRuleEntity,
  serviceTypeName: string,
  branchName: string | null,
): PricingRuleListItem {
  return { rule, serviceTypeName, branchName };
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

function makeTenant() {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Tenant 1',
    legalName: 'Tenant 1 Pty Ltd',
    timezone: 'Australia/Sydney',
    currency: 'USD',
    settingsJson: {},
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

describe('ListPricingRulesUseCase', () => {
  let pricingRuleRepo: IPricingRuleRepository;
  let tenantRepo: ITenantRepository;
  let useCase: ListPricingRulesUseCase;

  beforeEach(() => {
    pricingRuleRepo = {
      findById: vi.fn(),
      findByUnique: vi.fn(),
      findAll: vi.fn(),
      findAllWithNames: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    tenantRepo = {
      findById: vi.fn(),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    useCase = new ListPricingRulesUseCase(pricingRuleRepo, tenantRepo);
  });

  it('should return paginated list for AM with joined service-type and branch names', async () => {
    const items = [
      listItem(makePricingRule({ id: 'pr-1' }), 'Routine Inspection', null),
      listItem(
        makePricingRule({ id: 'pr-2', branchId: 'branch-1' }),
        'Ingoing Inspection',
        'Main Branch',
      ),
    ];
    vi.mocked(pricingRuleRepo.findAllWithNames).mockResolvedValue(items);
    vi.mocked(pricingRuleRepo.count).mockResolvedValue(2);

    const result = await useCase.execute({
      filters: { tenantId: 'tenant-1' },
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor(),
    });

    expect(result.data).toHaveLength(2);
    expect(result.data[0]?.currency).toBe('AUD');
    // WI-9: names are joined server-side, no per-row lookup needed.
    expect(result.data[0]?.serviceTypeName).toBe('Routine Inspection');
    expect(result.data[0]?.branchName).toBeNull();
    expect(result.data[1]?.serviceTypeName).toBe('Ingoing Inspection');
    expect(result.data[1]?.branchName).toBe('Main Branch');
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
  });

  it('should use actor.tenantId for CL_ADMIN', async () => {
    vi.mocked(pricingRuleRepo.findAllWithNames).mockResolvedValue([]);
    vi.mocked(pricingRuleRepo.count).mockResolvedValue(0);

    await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(pricingRuleRepo.findAllWithNames).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      expect.any(Object),
    );
  });
});
