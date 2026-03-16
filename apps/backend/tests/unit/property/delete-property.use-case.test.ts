import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeletePropertyUseCase } from '../../../src/modules/property/application/use-cases/delete-property.use-case';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import {
  PropertyNotFoundError,
  PropertyAlreadyDeletedError,
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

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-am-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    ...overrides,
  };
}

describe('DeletePropertyUseCase', () => {
  let propertyRepo: IPropertyRepository;
  let auditService: AuditService;
  let useCase: DeletePropertyUseCase;

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
    useCase = new DeletePropertyUseCase(propertyRepo, auditService);
  });

  it('should soft delete property for AM', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());

    await useCase.execute({
      propertyId: 'prop-1',
      actor: makeActor(),
    });

    expect(propertyRepo.update).toHaveBeenCalledWith(
      'prop-1',
      'tenant-1',
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'property.deleted' }),
    );
  });

  it('should soft delete property for CL_ADMIN (own tenant)', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());

    await useCase.execute({
      propertyId: 'prop-1',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(propertyRepo.update).toHaveBeenCalledWith(
      'prop-1',
      'tenant-1',
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    );
  });

  it('should throw PROPERTY_NOT_FOUND when property does not exist', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        propertyId: 'nonexistent',
        actor: makeActor(),
      }),
    ).rejects.toThrow(PropertyNotFoundError);
  });

  it('should throw PROPERTY_ALREADY_DELETED when already deleted', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(
      makeProperty({ deletedAt: new Date() }),
    );

    await expect(
      useCase.execute({
        propertyId: 'prop-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(PropertyAlreadyDeletedError);
  });

  it('should throw AUTH_FORBIDDEN for CL_USER', async () => {
    await expect(
      useCase.execute({
        propertyId: 'prop-1',
        actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw AUTH_FORBIDDEN for INSP', async () => {
    await expect(
      useCase.execute({
        propertyId: 'prop-1',
        actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
