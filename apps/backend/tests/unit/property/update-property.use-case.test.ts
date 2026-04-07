import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdatePropertyUseCase } from '../../../src/modules/property/application/use-cases/update-property.use-case';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import {
  PropertyNotFoundError,
  BranchInactiveError,
} from '../../../src/modules/property/domain/property.errors';
import { BranchNotFoundError } from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

vi.mock('../../../src/shared/infrastructure/queue', () => ({
  sendJob: vi.fn().mockResolvedValue('job-id'),
}));
import { sendJob } from '../../../src/shared/infrastructure/queue';

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

describe('UpdatePropertyUseCase', () => {
  let propertyRepo: IPropertyRepository;
  let branchRepo: IBranchRepository;
  let auditService: AuditService;
  let useCase: UpdatePropertyUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
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
    useCase = new UpdatePropertyUseCase(propertyRepo, branchRepo, auditService);
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

  it('should set geocodingStatus to MANUAL when lat/lng provided', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());

    const result = await useCase.execute({
      propertyId: 'prop-1',
      data: { latitude: -33.87, longitude: 151.21 },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.geocodingStatus).toBe('MANUAL');
    expect(result.latitude).toBe(-33.87);
    expect(result.longitude).toBe(151.21);
    expect(propertyRepo.update).toHaveBeenCalledWith(
      'prop-1',
      'tenant-1',
      expect.objectContaining({
        lat: -33.87,
        lng: 151.21,
        geocodingStatus: 'MANUAL',
      }),
    );
  });

  it('should set geocodingStatus to PENDING when only address changes', async () => {
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

  it('should set MANUAL when both coords and address change are provided', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());

    const result = await useCase.execute({
      propertyId: 'prop-1',
      data: { street: '789 Override St', latitude: -34.0, longitude: 150.0 },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.geocodingStatus).toBe('MANUAL');
    expect(result.latitude).toBe(-34.0);
    expect(result.longitude).toBe(150.0);
    expect(propertyRepo.update).toHaveBeenCalledWith(
      'prop-1',
      'tenant-1',
      expect.objectContaining({ geocodingStatus: 'MANUAL' }),
    );
  });

  it('should not change geocodingStatus when no coords and no address change', async () => {
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
      expect.not.objectContaining({ geocodingStatus: expect.any(String) }),
    );
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

  // H1: Geocoding job on address change
  it('should enqueue geocoding job when address changes', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());

    await useCase.execute({
      propertyId: 'prop-1',
      data: { street: '456 New St' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(sendJob).toHaveBeenCalledWith('property.geocode', { propertyId: 'prop-1' }, { retryLimit: 6, retryBackoff: true });
  });

  it('should NOT enqueue geocoding job when manual coordinates provided', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());

    await useCase.execute({
      propertyId: 'prop-1',
      data: { street: '456 New St', latitude: -34.0, longitude: 150.0 },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(sendJob).not.toHaveBeenCalled();
  });

  it('should NOT enqueue geocoding job when non-address field changes', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());

    await useCase.execute({
      propertyId: 'prop-1',
      data: { notes: 'Just a note' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(sendJob).not.toHaveBeenCalled();
  });

  // H2: Branch validation on update
  it('should validate branch exists when branchId is changed', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(branchRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        propertyId: 'prop-1',
        data: { branchId: 'branch-nonexistent' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(BranchNotFoundError);
  });

  it('should throw BRANCH_INACTIVE when branch is inactive', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(branchRepo.findById).mockResolvedValue({
      isActive: () => false,
      tenantId: 'tenant-1',
    } as any);

    await expect(
      useCase.execute({
        propertyId: 'prop-1',
        data: { branchId: 'branch-inactive' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(BranchInactiveError);
  });

  it('should allow setting branchId to null (removing branch)', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty({ branchId: 'branch-1' }));

    const result = await useCase.execute({
      propertyId: 'prop-1',
      data: { branchId: null },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.branchId).toBeNull();
    expect(branchRepo.findById).not.toHaveBeenCalled();
  });

  // GAP-002: Manual coordinate unlock
  describe('manual coordinate unlock', () => {
    it('should reset MANUAL property to PENDING and enqueue geocode job when both coords cleared', async () => {
      vi.mocked(propertyRepo.findById).mockResolvedValue(
        makeProperty({ geocodingStatus: 'MANUAL', lat: -33.87, lng: 151.21 }),
      );

      const result = await useCase.execute({
        propertyId: 'prop-1',
        data: { latitude: null, longitude: null },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      });

      expect(result.geocodingStatus).toBe('PENDING');
      expect(result.latitude).toBeNull();
      expect(result.longitude).toBeNull();
      expect(propertyRepo.update).toHaveBeenCalledWith(
        'prop-1',
        'tenant-1',
        expect.objectContaining({
          lat: null,
          lng: null,
          geocodingStatus: 'PENDING',
        }),
      );
      expect(sendJob).toHaveBeenCalledWith('property.geocode', { propertyId: 'prop-1' }, { retryLimit: 6, retryBackoff: true });
    });

    it('should NOT reset status when only latitude is cleared (not both)', async () => {
      vi.mocked(propertyRepo.findById).mockResolvedValue(
        makeProperty({ geocodingStatus: 'MANUAL', lat: -33.87, lng: 151.21 }),
      );

      const result = await useCase.execute({
        propertyId: 'prop-1',
        data: { latitude: null },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      });

      // longitude was not in data, so isManualCoordinateUnlock is false
      expect(result.geocodingStatus).toBe('MANUAL');
      expect(sendJob).not.toHaveBeenCalled();
    });

    it('should NOT reset status when coords cleared on non-MANUAL property', async () => {
      vi.mocked(propertyRepo.findById).mockResolvedValue(
        makeProperty({ geocodingStatus: 'SUCCESS', lat: -33.87, lng: 151.21 }),
      );

      const result = await useCase.execute({
        propertyId: 'prop-1',
        data: { latitude: null, longitude: null },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      });

      // Non-MANUAL property: clearing coords sets MANUAL status (existing behavior)
      expect(result.geocodingStatus).toBe('MANUAL');
      expect(sendJob).not.toHaveBeenCalled();
    });
  });

  it('should accept valid active branch on update', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(branchRepo.findById).mockResolvedValue({
      id: 'branch-1',
      isActive: () => true,
      tenantId: 'tenant-1',
    } as any);

    const result = await useCase.execute({
      propertyId: 'prop-1',
      data: { branchId: 'branch-1' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.branchId).toBe('branch-1');
  });
});
