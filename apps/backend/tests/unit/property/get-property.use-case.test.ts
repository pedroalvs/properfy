import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetPropertyUseCase } from '../../../src/modules/property/application/use-cases/get-property.use-case';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { AuthContext } from '@properfy/shared';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import { PropertyNotFoundError } from '../../../src/modules/property/domain/property.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

import type { PropertyWithBranch } from '../../../src/modules/property/domain/property.repository';

function makePropertyWithBranch(
  overrides: Partial<ConstructorParameters<typeof PropertyEntity>[0]> = {},
  branchName: string | null = null,
): PropertyWithBranch {
  return { property: makeProperty(overrides), branchName };
}

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
    lat: -33.8688,
    lng: 151.2093,
    geocodingStatus: 'SUCCESS',
    notes: null,
    rulesJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
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

describe('GetPropertyUseCase', () => {
  let propertyRepo: IPropertyRepository;
  let useCase: GetPropertyUseCase;

  beforeEach(() => {
    propertyRepo = {
      findById: vi.fn(),
      findByIdWithBranch: vi.fn(),
      findByPropertyCode: vi.fn(),
      findAll: vi.fn(),
      findAllWithBranch: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    useCase = new GetPropertyUseCase(propertyRepo);
  });

  it('should return property for AM', async () => {
    vi.mocked(propertyRepo.findByIdWithBranch).mockResolvedValue(makePropertyWithBranch({}, 'Main Branch'));

    const result = await useCase.execute({
      propertyId: 'prop-1',
      tenantId: 'tenant-1',
      actor: makeActor(),
    });

    expect(result.id).toBe('prop-1');
    expect(result.propertyCode).toBe('PROP-001');
    expect(result.tenantId).toBe('tenant-1');
    expect(result.branchName).toBe('Main Branch');
  });

  it('should return property for CL_ADMIN with matching tenantId', async () => {
    vi.mocked(propertyRepo.findByIdWithBranch).mockResolvedValue(makePropertyWithBranch());

    const result = await useCase.execute({
      propertyId: 'prop-1',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.id).toBe('prop-1');
    expect(result.tenantId).toBe('tenant-1');
  });

  it('should throw PROPERTY_NOT_FOUND when not found', async () => {
    vi.mocked(propertyRepo.findByIdWithBranch).mockResolvedValue(null);

    await expect(
      useCase.execute({
        propertyId: 'nonexistent',
        tenantId: 'tenant-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(PropertyNotFoundError);
  });

  it('should throw PROPERTY_NOT_FOUND for deleted property', async () => {
    vi.mocked(propertyRepo.findByIdWithBranch).mockResolvedValue(
      makePropertyWithBranch({ deletedAt: new Date() }),
    );

    await expect(
      useCase.execute({
        propertyId: 'prop-1',
        tenantId: 'tenant-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(PropertyNotFoundError);
  });

  it('should throw AUTH_FORBIDDEN for CL_ADMIN accessing other tenant property', async () => {
    vi.mocked(propertyRepo.findByIdWithBranch).mockResolvedValue(
      makePropertyWithBranch({ tenantId: 'tenant-2' }),
    );

    await expect(
      useCase.execute({
        propertyId: 'prop-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw AUTH_FORBIDDEN for INSP role', async () => {
    await expect(
      useCase.execute({
        propertyId: 'prop-1',
        actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
