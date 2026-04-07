import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreatePricingRuleUseCase } from '../../../src/modules/pricing-rule/application/use-cases/create-pricing-rule.use-case';
import type { IPricingRuleRepository } from '../../../src/modules/pricing-rule/domain/pricing-rule.repository';
import type { IServiceTypeRepository } from '../../../src/modules/service-type/domain/service-type.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ServiceTypeEntity } from '../../../src/modules/service-type/domain/service-type.entity';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { PricingRuleEntity } from '../../../src/modules/pricing-rule/domain/pricing-rule.entity';
import { PricingRuleDuplicateError } from '../../../src/modules/pricing-rule/domain/pricing-rule.errors';
import { ServiceTypeNotFoundError } from '../../../src/modules/service-type/domain/service-type.errors';
import { BranchNotFoundError } from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makeServiceType(
  overrides: Partial<ConstructorParameters<typeof ServiceTypeEntity>[0]> = {},
): ServiceTypeEntity {
  return new ServiceTypeEntity({
    id: 'st-1',
    code: 'ROUTINE',
    name: 'Routine Inspection',
    flowType: 'ROUTINE',
    requiresTenantConfirmation: true,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeBranch(
  overrides: Partial<ConstructorParameters<typeof BranchEntity>[0]> = {},
): BranchEntity {
  return new BranchEntity({
    id: 'branch-1',
    tenantId: 'tenant-1',
    name: 'Main Branch',
    addressJson: null,
    contactEmail: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makePricingRule(
  overrides: Partial<ConstructorParameters<typeof PricingRuleEntity>[0]> = {},
): PricingRuleEntity {
  return new PricingRuleEntity({
    id: 'pr-1',
    tenantId: 'tenant-1',
    currency: 'USD',
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

function makeTenant(
  overrides: Partial<ConstructorParameters<typeof TenantEntity>[0]> = {},
): TenantEntity {
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
    ...overrides,
  });
}

describe('CreatePricingRuleUseCase', () => {
  let pricingRuleRepo: IPricingRuleRepository;
  let serviceTypeRepo: IServiceTypeRepository;
  let branchRepo: IBranchRepository;
  let tenantRepo: ITenantRepository;
  let auditService: AuditService;
  let useCase: CreatePricingRuleUseCase;

  beforeEach(() => {
    pricingRuleRepo = {
      findById: vi.fn(),
      findByUnique: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    serviceTypeRepo = {
      findById: vi.fn(),
      findByCode: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    branchRepo = {
      findById: vi.fn(),
      findByName: vi.fn(),
      findAll: vi.fn(),
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
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new CreatePricingRuleUseCase(
      pricingRuleRepo,
      serviceTypeRepo,
      branchRepo,
      tenantRepo,
      auditService,
    );
  });

  it('should create pricing rule for AM with tenantId', async () => {
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(pricingRuleRepo.findByUnique).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      serviceTypeId: 'st-1',
      priceAmount: 15000,
      payoutType: 'FIXED',
      payoutValue: 8000,
      actor: makeActor(),
    });

    expect(result.tenantId).toBe('tenant-1');
    expect(result.currency).toBe('USD');
    expect(result.serviceTypeId).toBe('st-1');
    expect(result.priceAmount).toBe(15000);
    expect(result.payoutType).toBe('FIXED');
    expect(result.payoutValue).toBe(8000);
    expect(result.status).toBe('ACTIVE');
    expect(result.branchId).toBeNull();
    expect(pricingRuleRepo.save).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pricing_rule.created' }),
    );
  });

  it('should create pricing rule for CL_ADMIN using own tenantId', async () => {
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(pricingRuleRepo.findByUnique).mockResolvedValue(null);

    const result = await useCase.execute({
      serviceTypeId: 'st-1',
      priceAmount: 12000,
      payoutType: 'PERCENTAGE',
      payoutValue: 60,
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.tenantId).toBe('tenant-1');
    expect(result.currency).toBe('USD');
    expect(result.priceAmount).toBe(12000);
    expect(pricingRuleRepo.save).toHaveBeenCalled();
  });

  it('should reject CL_USER', async () => {
    await expect(
      useCase.execute({
        serviceTypeId: 'st-1',
        priceAmount: 15000,
        payoutType: 'FIXED',
        payoutValue: 8000,
        actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw PRICING_RULE_DUPLICATE when combination exists', async () => {
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(pricingRuleRepo.findByUnique).mockResolvedValue(makePricingRule());

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        serviceTypeId: 'st-1',
        priceAmount: 15000,
        payoutType: 'FIXED',
        payoutValue: 8000,
        actor: makeActor(),
      }),
    ).rejects.toThrow(PricingRuleDuplicateError);
  });

  it('should throw SERVICE_TYPE_NOT_FOUND when service type does not exist', async () => {
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        serviceTypeId: 'nonexistent',
        priceAmount: 15000,
        payoutType: 'FIXED',
        payoutValue: 8000,
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceTypeNotFoundError);
  });

  it('should throw BRANCH_NOT_FOUND when branch is invalid', async () => {
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(branchRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        serviceTypeId: 'st-1',
        branchId: 'invalid-branch',
        priceAmount: 15000,
        payoutType: 'FIXED',
        payoutValue: 8000,
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchNotFoundError);
  });

  it('should throw PRICING_RULE_DUPLICATE for tenant-level rule (no branch) when one already exists', async () => {
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(pricingRuleRepo.findByUnique).mockResolvedValue(
      makePricingRule({ branchId: null }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        serviceTypeId: 'st-1',
        priceAmount: 20000,
        payoutType: 'FIXED',
        payoutValue: 10000,
        actor: makeActor(),
      }),
    ).rejects.toThrow(PricingRuleDuplicateError);

    expect(pricingRuleRepo.findByUnique).toHaveBeenCalledWith(
      'tenant-1',
      'st-1',
      null,
    );
    expect(pricingRuleRepo.save).not.toHaveBeenCalled();
  });

  it('should pass null (not undefined) to findByUnique when branchId is omitted', async () => {
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(pricingRuleRepo.findByUnique).mockResolvedValue(null);

    await useCase.execute({
      tenantId: 'tenant-1',
      serviceTypeId: 'st-1',
      priceAmount: 15000,
      payoutType: 'FIXED',
      payoutValue: 8000,
      actor: makeActor(),
    });

    // Verify that findByUnique receives explicit null, not undefined.
    // Prisma translates null to IS NULL, but undefined would skip the field entirely,
    // which would NOT filter by branch_id and could miss existing duplicates.
    expect(pricingRuleRepo.findByUnique).toHaveBeenCalledWith(
      'tenant-1',
      'st-1',
      null,
    );
  });

  it('should freeze currency from tenant at creation time', async () => {
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(pricingRuleRepo.findByUnique).mockResolvedValue(null);
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ currency: 'BRL' }),
    );

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      serviceTypeId: 'st-1',
      priceAmount: 15000,
      payoutType: 'FIXED',
      payoutValue: 8000,
      actor: makeActor(),
    });

    expect(result.currency).toBe('BRL');

    // Verify the entity saved to the repository includes the frozen currency
    const savedEntity = vi.mocked(pricingRuleRepo.save).mock.calls[0][0];
    expect(savedEntity.currency).toBe('BRL');
  });

  it('should persist currency on the entity independent of tenant', async () => {
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(pricingRuleRepo.findByUnique).mockResolvedValue(null);
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ currency: 'GBP' }),
    );

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      serviceTypeId: 'st-1',
      priceAmount: 10000,
      payoutType: 'PERCENTAGE',
      payoutValue: 60,
      actor: makeActor(),
    });

    // Currency comes from the entity, not from tenant lookup at read time
    expect(result.currency).toBe('GBP');

    // Audit log should include currency
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ currency: 'GBP' }),
      }),
    );
  });
});
