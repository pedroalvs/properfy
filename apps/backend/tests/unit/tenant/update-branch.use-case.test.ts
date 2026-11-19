import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateBranchUseCase } from '../../../src/modules/tenant/application/use-cases/update-branch.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import {
  BranchNotFoundError,
  BranchNameConflictError,
} from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { MapboxPermanentGeocodingUnavailableError } from '../../../src/modules/property/domain/geocoding.service';

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn(), trace: vi.fn(), child: vi.fn() };
}

function makeTenant(
  overrides: Partial<ConstructorParameters<typeof TenantEntity>[0]> = {},
): TenantEntity {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Test Agency',
    legalName: 'Test Agency Pty Ltd',
    status: 'ACTIVE',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    settingsJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
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

describe('UpdateBranchUseCase', () => {
  let tenantRepo: ITenantRepository;
  let branchRepo: IBranchRepository;
  let auditService: AuditService;
  let useCase: UpdateBranchUseCase;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByLegalName: vi.fn(),
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
    useCase = new UpdateBranchUseCase(tenantRepo, branchRepo, auditService);
  });

  it('should allow AM to update branch', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(branchRepo.findByName).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      data: { name: 'Updated Branch', address: { street: '123 Main St' } },
      actor: makeActor(),
    });

    expect(result.name).toBe('Updated Branch');
    expect(result.addressJson).toEqual({ street: '123 Main St' });
    expect(branchRepo.update).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'branch.updated' }),
    );
  });

  it('should allow CL_ADMIN to update own tenant branch (name+address)', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(branchRepo.findByName).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      data: { name: 'Updated' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.name).toBe('Updated');
  });

  it('should reject CL_ADMIN updating other tenant branch', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        data: { name: 'X' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-other' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw BRANCH_NAME_CONFLICT when name is taken', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(branchRepo.findByName).mockResolvedValue(
      makeBranch({ id: 'branch-other', name: 'Taken' }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        data: { name: 'Taken' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchNameConflictError);
  });

  it('should throw BRANCH_NAME_CONFLICT when renaming to a name that differs only by case', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch({ name: 'Alpha' }));
    // findByName is case-insensitive and returns the existing "beta" branch
    vi.mocked(branchRepo.findByName).mockResolvedValue(
      makeBranch({ id: 'branch-other', name: 'beta' }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        data: { name: 'BETA' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchNameConflictError);
  });

  it('should allow renaming to same name with different casing (own branch)', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch({ name: 'Main Branch' }));

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      data: { name: 'main branch' },
      actor: makeActor(),
    });

    // Case-insensitive comparison sees these as the same name, so no uniqueness check needed
    expect(result.name).toBe('main branch');
    expect(branchRepo.findByName).not.toHaveBeenCalled();
  });

  it('should update branch contactEmail', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      data: { contactEmail: 'pm@agency.com' },
      actor: makeActor(),
    });

    expect(result.contactEmail).toBe('pm@agency.com');
    expect(branchRepo.update).toHaveBeenCalledWith('branch-1', 'tenant-1', { contactEmail: 'pm@agency.com' });
  });

  it('should clear branch contactEmail (set to null)', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(
      makeBranch({ contactEmail: 'old@agency.com' }),
    );

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      data: { contactEmail: null },
      actor: makeActor(),
    });

    expect(result.contactEmail).toBeNull();
    expect(branchRepo.update).toHaveBeenCalledWith('branch-1', 'tenant-1', { contactEmail: null });
  });

  it('should throw BRANCH_NOT_FOUND when branch does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'nonexistent',
        data: { name: 'X' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchNotFoundError);
  });

  describe('permanent geocoding (X02-1, dec. 20)', () => {
    const OLD_ADDRESS = {
      street: '1 Main St',
      suburb: 'Parramatta',
      state: 'NSW',
      postcode: '2150',
      country: 'AU',
      latitude: -33.81,
      longitude: 151.0,
    };

    function updatePayload() {
      return vi.mocked(branchRepo.update).mock.calls[0]![2] as Record<string, unknown>;
    }

    beforeEach(() => {
      vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    });

    it('1. geocodes when the address changes', async () => {
      vi.mocked(branchRepo.findById).mockResolvedValue(
        makeBranch({ addressJson: { ...OLD_ADDRESS }, geocodedPermanentlyAt: new Date() }),
      );
      const geocoder = { geocode: vi.fn().mockResolvedValue({ lat: -34.0, lng: 151.5 }) };
      const uc = new UpdateBranchUseCase(tenantRepo, branchRepo, auditService, undefined, geocoder as never, makeLogger() as never);

      await uc.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        data: { address: { street: '99 Other St', suburb: 'Newtown', state: 'NSW', postcode: '2042', country: 'AU' } },
        actor: makeActor(),
      });

      expect(geocoder.geocode).toHaveBeenCalledTimes(1);
      const payload = updatePayload();
      expect(payload.addressJson).toMatchObject({ street: '99 Other St', latitude: -34.0, longitude: 151.5 });
      expect(payload.geocodedPermanentlyAt).toBeInstanceOf(Date);
    });

    it('2. keeps stored coordinates (copied) without calling Mapbox when the address is unchanged and a marker exists', async () => {
      vi.mocked(branchRepo.findById).mockResolvedValue(
        makeBranch({ addressJson: { ...OLD_ADDRESS }, geocodedPermanentlyAt: new Date() }),
      );
      const geocoder = { geocode: vi.fn() };
      const uc = new UpdateBranchUseCase(tenantRepo, branchRepo, auditService, undefined, geocoder as never, makeLogger() as never);

      const sameAddressDifferentCase = {
        street: '1 MAIN ST',
        suburb: 'Parramatta',
        city: 'Parramatta',
        state: 'nsw',
        postcode: '2150',
        country: 'au',
      };
      await uc.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        data: { address: sameAddressDifferentCase },
        actor: makeActor(),
      });

      expect(geocoder.geocode).not.toHaveBeenCalled();
      const payload = updatePayload();
      expect(payload.addressJson).toEqual({ ...sameAddressDifferentCase, latitude: -33.81, longitude: 151.0 });
      expect('geocodedPermanentlyAt' in payload).toBe(false);
    });

    it('3. geocodes when the address is unchanged but the marker is null (legacy)', async () => {
      vi.mocked(branchRepo.findById).mockResolvedValue(
        makeBranch({ addressJson: { ...OLD_ADDRESS }, geocodedPermanentlyAt: null }),
      );
      const geocoder = { geocode: vi.fn().mockResolvedValue({ lat: -33.81, lng: 151.0 }) };
      const uc = new UpdateBranchUseCase(tenantRepo, branchRepo, auditService, undefined, geocoder as never, makeLogger() as never);

      await uc.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        data: { address: { street: '1 Main St', suburb: 'Parramatta', state: 'NSW', postcode: '2150', country: 'AU' } },
        actor: makeActor(),
      });

      expect(geocoder.geocode).toHaveBeenCalledTimes(1);
      expect(updatePayload().geocodedPermanentlyAt).toBeInstanceOf(Date);
    });

    it('4. does not geocode or touch address when only the name changes', async () => {
      vi.mocked(branchRepo.findById).mockResolvedValue(
        makeBranch({ addressJson: { ...OLD_ADDRESS }, geocodedPermanentlyAt: new Date() }),
      );
      vi.mocked(branchRepo.findByName).mockResolvedValue(null);
      const geocoder = { geocode: vi.fn() };
      const uc = new UpdateBranchUseCase(tenantRepo, branchRepo, auditService, undefined, geocoder as never, makeLogger() as never);

      await uc.execute({ tenantId: 'tenant-1', branchId: 'branch-1', data: { name: 'Renamed' }, actor: makeActor() });

      expect(geocoder.geocode).not.toHaveBeenCalled();
      const payload = updatePayload();
      expect('addressJson' in payload).toBe(false);
      expect('geocodedPermanentlyAt' in payload).toBe(false);
    });

    it('5. drops the coordinate and nulls the marker explicitly when a changed address returns null', async () => {
      vi.mocked(branchRepo.findById).mockResolvedValue(
        makeBranch({ addressJson: { ...OLD_ADDRESS }, geocodedPermanentlyAt: new Date() }),
      );
      const geocoder = { geocode: vi.fn().mockResolvedValue(null) };
      const logger = makeLogger();
      const uc = new UpdateBranchUseCase(tenantRepo, branchRepo, auditService, undefined, geocoder as never, logger as never);

      await uc.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        data: { address: { street: '99 Other St', suburb: 'Newtown', state: 'NSW', postcode: '2042', country: 'AU' } },
        actor: makeActor(),
      });

      const payload = updatePayload();
      expect(payload.addressJson).not.toHaveProperty('latitude');
      expect(payload.geocodedPermanentlyAt).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'no_results' }),
        'branch.geocode_failed_saved_without_coordinates',
      );
    });

    it('6. drops the coordinate and nulls the marker on an account error (changed address)', async () => {
      vi.mocked(branchRepo.findById).mockResolvedValue(
        makeBranch({ addressJson: { ...OLD_ADDRESS }, geocodedPermanentlyAt: new Date() }),
      );
      const geocoder = { geocode: vi.fn().mockRejectedValue(new MapboxPermanentGeocodingUnavailableError()) };
      const logger = makeLogger();
      const uc = new UpdateBranchUseCase(tenantRepo, branchRepo, auditService, undefined, geocoder as never, logger as never);

      await uc.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        data: { address: { street: '99 Other St', suburb: 'Newtown', state: 'NSW', postcode: '2042', country: 'AU' } },
        actor: makeActor(),
      });

      const payload = updatePayload();
      expect(payload.addressJson).not.toHaveProperty('latitude');
      expect(payload.geocodedPermanentlyAt).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE' }),
        'branch.geocode_permanent_unavailable',
      );
    });
  });
});
