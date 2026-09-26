import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListPricingRulesUseCase } from '../../../src/modules/pricing-rule/application/use-cases/list-pricing-rules.use-case';
import type { IPricingRuleRepository } from '../../../src/modules/pricing-rule/domain/pricing-rule.repository';
import type { AuthContext } from '@properfy/shared';
import { PricingRuleEntity } from '../../../src/modules/pricing-rule/domain/pricing-rule.entity';
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

function makeRow(rule = makePricingRule(), tenantName = 'Tenant 1', serviceTypeName = 'Routine Inspection') {
  return { rule, tenantName, serviceTypeName };
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
      findAllWithNames: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
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

  it('should return paginated list for AM with server-provided display names (#389)', async () => {
    vi.mocked(pricingRuleRepo.findAllWithNames).mockResolvedValue([
      makeRow(makePricingRule({ id: 'pr-1' }), 'Acme Realty', 'Routine Inspection'),
      makeRow(makePricingRule({ id: 'pr-2', branchId: 'branch-1' }), 'Acme Realty', 'Ingoing Inspection'),
    ]);
    vi.mocked(pricingRuleRepo.count).mockResolvedValue(2);

    const result = await useCase.execute({
      filters: { tenantId: 'tenant-1' },
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor(),
    });

    expect(result.data).toHaveLength(2);
    expect(result.data[0]?.currency).toBe('AUD');
    expect(result.data[0]?.tenantName).toBe('Acme Realty');
    expect(result.data[0]?.serviceTypeName).toBe('Routine Inspection');
    expect(result.data[1]?.serviceTypeName).toBe('Ingoing Inspection');
    expect(result.total).toBe(2);
  });

  it('should use actor.tenantId for CL_ADMIN', async () => {
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

  it('OP with a tenant filter queries that tenant — no longer a silently empty list (#395)', async () => {
    vi.mocked(pricingRuleRepo.findAllWithNames).mockResolvedValue([makeRow()]);
    vi.mocked(pricingRuleRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      filters: { tenantId: 'tenant-9' },
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor({ role: 'OP', tenantId: null }),
    });

    expect(pricingRuleRepo.findAllWithNames).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-9' }),
      expect.any(Object),
    );
    expect(result.data).toHaveLength(1);
  });

  it('OP without a tenant filter gets an empty page (web tenant-selection gate)', async () => {
    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor({ role: 'OP', tenantId: null }),
    });

    expect(pricingRuleRepo.findAllWithNames).not.toHaveBeenCalled();
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('CL_ADMIN cannot use filters.tenantId to escape its own tenant (RBAC widening guard)', async () => {
    await useCase.execute({
      filters: { tenantId: 'other-tenant' },
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    // The requested foreign tenant is ignored; the JWT tenant is used instead.
    expect(pricingRuleRepo.findAllWithNames).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      expect.any(Object),
    );
  });

  it('CL_USER cannot use filters.tenantId to escape its own tenant (RBAC widening guard)', async () => {
    await useCase.execute({
      filters: { tenantId: 'other-tenant' },
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
    });

    expect(pricingRuleRepo.findAllWithNames).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      expect.any(Object),
    );
  });
});
