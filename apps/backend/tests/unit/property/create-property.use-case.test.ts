import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreatePropertyUseCase } from '../../../src/modules/property/application/use-cases/create-property.use-case';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import { PropertyCodeConflictError } from '../../../src/modules/property/domain/property.errors';
import { BranchNotFoundError } from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';

function makeProperty(
  overrides: Partial<ConstructorParameters<typeof PropertyEntity>[0]> = {},
): PropertyEntity {
  return new PropertyEntity({
    id: 'prop-1',
    tenantId: 'tenant-1',
    branchId: null,
    propertyCode: 'PROP-001',
    type: 'RESIDENTIAL',
    street: '123 Main St',
    addressLine2: null,
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'AU',
    lat: null,
    lng: null,
    geocodingStatus: 'PENDING',
    notes: null,
    rulesJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeBranch(): BranchEntity {
  return new BranchEntity({
    id: 'branch-1',
    tenantId: 'tenant-1',
    name: 'Main Branch',
    addressJson: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
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

describe('CreatePropertyUseCase', () => {
  let propertyRepo: IPropertyRepository;
  let branchRepo: IBranchRepository;
  let auditService: AuditService;
  let useCase: CreatePropertyUseCase;

  beforeEach(() => {
    propertyRepo = {
      findById: vi.fn(),
      findByPropertyCode: vi.fn(),
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
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new CreatePropertyUseCase(propertyRepo, branchRepo, auditService);
  });

  it('should create property with PENDING geocoding status for AM actor', async () => {
    vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      propertyCode: 'PROP-001',
      type: 'RESIDENTIAL',
      street: '123 Main St',
      suburb: 'Sydney',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      actor: makeActor(),
    });

    expect(result.geocodingStatus).toBe('PENDING');
    expect(result.propertyCode).toBe('PROP-001');
    expect(result.tenantId).toBe('tenant-1');
    expect(result.id).toBeDefined();
    expect(propertyRepo.save).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'property.created' }),
    );
  });

  it('should create property using actor.tenantId for CL_ADMIN', async () => {
    vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);

    const result = await useCase.execute({
      propertyCode: 'PROP-002',
      type: 'COMMERCIAL',
      street: '456 Business Ave',
      suburb: 'Melbourne',
      postcode: '3000',
      state: 'VIC',
      country: 'AU',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-2' }),
    });

    expect(result.tenantId).toBe('tenant-2');
    expect(result.type).toBe('COMMERCIAL');
    expect(propertyRepo.save).toHaveBeenCalled();
  });

  it('should reject INSP role', async () => {
    await expect(
      useCase.execute({
        propertyCode: 'PROP-003',
        type: 'RESIDENTIAL',
        street: '789 Inspector Rd',
        suburb: 'Brisbane',
        postcode: '4000',
        state: 'QLD',
        country: 'AU',
        actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw PROPERTY_CODE_CONFLICT when code exists', async () => {
    vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(
      makeProperty(),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        propertyCode: 'PROP-001',
        type: 'RESIDENTIAL',
        street: '123 Main St',
        suburb: 'Sydney',
        postcode: '2000',
        state: 'NSW',
        country: 'AU',
        actor: makeActor(),
      }),
    ).rejects.toThrow(PropertyCodeConflictError);
  });

  it('should throw BRANCH_NOT_FOUND when branchId is invalid', async () => {
    vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);
    vi.mocked(branchRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'invalid-branch',
        propertyCode: 'PROP-004',
        type: 'RESIDENTIAL',
        street: '123 Main St',
        suburb: 'Sydney',
        postcode: '2000',
        state: 'NSW',
        country: 'AU',
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchNotFoundError);
  });

  it('should throw VALIDATION_ERROR when AM/OP does not provide tenantId', async () => {
    await expect(
      useCase.execute({
        propertyCode: 'PROP-005',
        type: 'RESIDENTIAL',
        street: '123 Main St',
        suburb: 'Sydney',
        postcode: '2000',
        state: 'NSW',
        country: 'AU',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should validate branch and create property with branchId', async () => {
    vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      propertyCode: 'PROP-006',
      type: 'RESIDENTIAL',
      street: '123 Main St',
      suburb: 'Sydney',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      actor: makeActor(),
    });

    expect(result.branchId).toBe('branch-1');
    expect(branchRepo.findById).toHaveBeenCalledWith('branch-1', 'tenant-1');
  });
});
