import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeocodePropertyUseCase } from '../../../src/modules/property/application/use-cases/geocode-property.use-case';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { PropertyNotFoundError, PropertyGeocodingManualOverrideError } from '../../../src/modules/property/domain/property.errors';

vi.mock('../../../src/shared/infrastructure/queue', () => ({
  sendJob: vi.fn().mockResolvedValue('job-id'),
}));

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function makeProperty(overrides: Partial<ConstructorParameters<typeof PropertyEntity>[0]> = {}): PropertyEntity {
  return new PropertyEntity({
    id: 'property-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
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

describe('GeocodePropertyUseCase', () => {
  let propertyRepo: IPropertyRepository;
  let useCase: GeocodePropertyUseCase;

  beforeEach(async () => {
    vi.clearAllMocks();
    propertyRepo = {
      findById: vi.fn(),
      findByPropertyCode: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new GeocodePropertyUseCase(propertyRepo);
  });

  it('should set geocoding status to PENDING and enqueue job on success', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    const { sendJob } = await import('../../../src/shared/infrastructure/queue');

    const result = await useCase.execute({
      propertyId: 'property-1',
      actor: makeActor(),
    });

    expect(result.propertyId).toBe('property-1');
    expect(result.geocodingStatus).toBe('PENDING');
    expect(propertyRepo.update).toHaveBeenCalledWith('property-1', 'tenant-1', { geocodingStatus: 'PENDING' });
    expect(sendJob).toHaveBeenCalledWith('property.geocode', { propertyId: 'property-1' });
  });

  it('should throw PropertyNotFoundError when property not found', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        propertyId: 'nonexistent',
        actor: makeActor(),
      }),
    ).rejects.toThrow(PropertyNotFoundError);
  });

  it('should throw PropertyNotFoundError when property is deleted', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(
      makeProperty({ deletedAt: new Date() }),
    );

    await expect(
      useCase.execute({
        propertyId: 'property-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(PropertyNotFoundError);
  });

  it('should throw PropertyGeocodingManualOverrideError when geocodingStatus is MANUAL', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(
      makeProperty({ geocodingStatus: 'MANUAL' }),
    );

    await expect(
      useCase.execute({
        propertyId: 'property-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(PropertyGeocodingManualOverrideError);
  });

  it('should throw ForbiddenError for CL_ADMIN role', async () => {
    await expect(
      useCase.execute({
        propertyId: 'property-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ForbiddenError for INSP role', async () => {
    await expect(
      useCase.execute({
        propertyId: 'property-1',
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should allow OP role', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());

    const result = await useCase.execute({
      propertyId: 'property-1',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.geocodingStatus).toBe('PENDING');
  });
});
