import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeletePropertyUseCase } from '../../../src/modules/property/application/use-cases/delete-property.use-case';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { IAppointmentChecker } from '../../../src/modules/tenant/domain/appointment-checker';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import {
  PropertyNotFoundError,
  PropertyAlreadyDeletedError,
  PropertyHasActiveAppointmentsError,
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
    type: 'HOUSE',
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
    inspectorId: null,
    ...overrides,
  };
}

describe('DeletePropertyUseCase', () => {
  let propertyRepo: IPropertyRepository;
  let appointmentChecker: IAppointmentChecker;
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
    appointmentChecker = {
      hasOpenAppointmentsForTenant: vi.fn().mockResolvedValue(false),
      hasOpenAppointmentsForBranch: vi.fn().mockResolvedValue(false),
      hasOpenAppointmentsForProperty: vi.fn().mockResolvedValue(false),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new DeletePropertyUseCase(propertyRepo, appointmentChecker, auditService);
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

  it('should throw PROPERTY_HAS_ACTIVE_APPOINTMENTS when active appointments exist', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(appointmentChecker.hasOpenAppointmentsForProperty).mockResolvedValue(true);

    await expect(
      useCase.execute({
        propertyId: 'prop-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(PropertyHasActiveAppointmentsError);

    expect(appointmentChecker.hasOpenAppointmentsForProperty).toHaveBeenCalledWith('prop-1');
    expect(propertyRepo.update).not.toHaveBeenCalled();
  });

  it('should proceed with deletion when no active appointments', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(appointmentChecker.hasOpenAppointmentsForProperty).mockResolvedValue(false);

    await useCase.execute({
      propertyId: 'prop-1',
      actor: makeActor(),
    });

    expect(appointmentChecker.hasOpenAppointmentsForProperty).toHaveBeenCalledWith('prop-1');
    expect(propertyRepo.update).toHaveBeenCalled();
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

  // Defense-in-depth: the repo's tenant filter is the first gate, but if
  // it ever loosens (or the caller supplies the wrong `tenantId`), the
  // use case must still refuse to delete a row that isn't in the actor's
  // tenant. Previously the scope plumbing used an empty-string sentinel;
  // this regression pins the `null`-based contract explicitly.
  it('should pass the actor tenant scope to findById for CL_ADMIN', async () => {
    propertyRepo.findById.mockResolvedValue(makeProperty({ tenantId: 'tenant-1' }));
    appointmentChecker.hasOpenAppointmentsForProperty.mockResolvedValue(false);

    await useCase.execute({
      propertyId: 'prop-1',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(propertyRepo.findById).toHaveBeenCalledWith('prop-1', 'tenant-1');
  });

  it('should pass null tenant scope to findById for AM (cross-tenant)', async () => {
    propertyRepo.findById.mockResolvedValue(makeProperty({ tenantId: 'tenant-other' }));
    appointmentChecker.hasOpenAppointmentsForProperty.mockResolvedValue(false);

    await useCase.execute({
      propertyId: 'prop-1',
      actor: makeActor({ role: 'AM', tenantId: null }),
    });

    expect(propertyRepo.findById).toHaveBeenCalledWith('prop-1', null);
  });

  it('should reject CL_ADMIN attempting to delete a property in another tenant', async () => {
    // Simulate a loosened repo that surfaces a row from another tenant —
    // use case must still throw based on the post-lookup equality check.
    propertyRepo.findById.mockResolvedValue(makeProperty({ tenantId: 'tenant-other' }));

    await expect(
      useCase.execute({
        propertyId: 'prop-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(propertyRepo.update).not.toHaveBeenCalled();
  });
});
