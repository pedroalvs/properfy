import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdatePropertyUseCase } from '../../../src/modules/property/application/use-cases/update-property.use-case';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import {
  PropertyNotFoundError,
  PropertyCodeConflictError,
} from '../../../src/modules/property/domain/property.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

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
    ...overrides,
  };
}

describe('UpdatePropertyUseCase', () => {
  let propertyRepo: IPropertyRepository;
  let auditService: AuditService;
  let useCase: UpdatePropertyUseCase;

  beforeEach(() => {
    propertyRepo = {
      findById: vi.fn(),
      findByPropertyCode: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new UpdatePropertyUseCase(propertyRepo, auditService);
  });

  it('should update property successfully', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());

    const result = await useCase.execute({
      propertyId: 'prop-1',
      data: { notes: 'Updated notes' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.notes).toBe('Updated notes');
    expect(propertyRepo.update).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'property.updated' }),
    );
  });

  it('should reset geocodingStatus when address changes', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());

    const result = await useCase.execute({
      propertyId: 'prop-1',
      data: { street: '456 New St' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.geocodingStatus).toBe('PENDING');
    expect(propertyRepo.update).toHaveBeenCalledWith(
      'prop-1',
      'tenant-1',
      expect.objectContaining({ geocodingStatus: 'PENDING' }),
    );
  });

  it('should not reset geocodingStatus when non-address field changes', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());

    const result = await useCase.execute({
      propertyId: 'prop-1',
      data: { notes: 'Just a note' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.geocodingStatus).toBe('SUCCESS');
    expect(propertyRepo.update).toHaveBeenCalledWith(
      'prop-1',
      'tenant-1',
      expect.not.objectContaining({ geocodingStatus: 'PENDING' }),
    );
  });

  it('should throw PROPERTY_NOT_FOUND when property does not exist', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        propertyId: 'nonexistent',
        data: { notes: 'test' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(PropertyNotFoundError);
  });

  it('should throw PROPERTY_CODE_CONFLICT when new code conflicts', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(
      makeProperty({ id: 'prop-2', propertyCode: 'PROP-002' }),
    );

    await expect(
      useCase.execute({
        propertyId: 'prop-1',
        data: { propertyCode: 'PROP-002' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(PropertyCodeConflictError);
  });

  it('should throw AUTH_FORBIDDEN for INSP role', async () => {
    await expect(
      useCase.execute({
        propertyId: 'prop-1',
        data: { notes: 'test' },
        actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
