import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateBranchUseCase } from '../../../src/modules/tenant/application/use-cases/create-branch.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import {
  TenantNotFoundError,
  TenantInactiveError,
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

describe('CreateBranchUseCase', () => {
  let tenantRepo: ITenantRepository;
  let branchRepo: IBranchRepository;
  let auditService: AuditService;
  let useCase: CreateBranchUseCase;

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
    useCase = new CreateBranchUseCase(tenantRepo, branchRepo, auditService);
  });

  it('should create a branch when actor is AM', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findByName).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      name: 'New Branch',
      actor: makeActor(),
    });

    expect(result.name).toBe('New Branch');
    expect(result.status).toBe('ACTIVE');
    expect(result.tenantId).toBe('tenant-1');
    expect(branchRepo.save).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'branch.created' }),
    );
  });

  it('should allow CL_ADMIN to create branch for own tenant', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findByName).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      name: 'New Branch',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.name).toBe('New Branch');
  });

  it('should reject CL_ADMIN creating branch for other tenant', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New Branch',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-other' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject CL_USER creating a branch (403 AUTH_FORBIDDEN)', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New Branch',
        actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw TENANT_INACTIVE when tenant is not active', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ status: 'PENDING' }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New Branch',
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantInactiveError);
  });

  it('should throw BRANCH_NAME_CONFLICT when name is taken within tenant', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findByName).mockResolvedValue(makeBranch());

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'Main Branch',
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchNameConflictError);
  });

  it('should throw BRANCH_NAME_CONFLICT when name differs only by case (case-insensitive uniqueness)', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    // findByName is case-insensitive and returns the existing "Main Branch"
    vi.mocked(branchRepo.findByName).mockResolvedValue(makeBranch({ name: 'Main Branch' }));

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'main branch',
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchNameConflictError);
  });

  it('should create branch with contactEmail', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findByName).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      name: 'New Branch',
      contactEmail: 'pm@agency.com',
      actor: makeActor(),
    });

    expect(result.contactEmail).toBe('pm@agency.com');
  });

  it('should create branch without contactEmail (defaults to null)', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findByName).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      name: 'New Branch',
      actor: makeActor(),
    });

    expect(result.contactEmail).toBeNull();
  });

  it('should throw TENANT_NOT_FOUND when tenant does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'nonexistent',
        name: 'Branch',
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantNotFoundError);
  });

  describe('permanent geocoding (X02-1)', () => {
    const ADDRESS = {
      street: '1 Main St',
      suburb: 'Suburb',
      city: 'City',
      state: 'NSW',
      postcode: '2000',
      country: 'AU',
    };

    function savedBranch() {
      return vi.mocked(branchRepo.save).mock.calls[0]![0];
    }

    beforeEach(() => {
      vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
      vi.mocked(branchRepo.findByName).mockResolvedValue(null);
    });

    it('1. geocodes in permanent mode and stores coordinates + marker on success', async () => {
      const geocoder = { geocode: vi.fn().mockResolvedValue({ lat: -33.8, lng: 151.2 }) };
      const uc = new CreateBranchUseCase(tenantRepo, branchRepo, auditService, undefined, geocoder as never, makeLogger() as never);

      await uc.execute({ tenantId: 'tenant-1', name: 'B', address: { ...ADDRESS }, actor: makeActor() });

      expect(geocoder.geocode).toHaveBeenCalledWith('1 Main St, Suburb, City, NSW, 2000, AU', { mode: 'permanent' });
      const branch = savedBranch();
      expect(branch.addressJson).toMatchObject({ ...ADDRESS, latitude: -33.8, longitude: 151.2 });
      expect(branch.geocodedPermanentlyAt).toBeInstanceOf(Date);
    });

    it('2. stores no coordinates and a null marker on a null result (warn)', async () => {
      const geocoder = { geocode: vi.fn().mockResolvedValue(null) };
      const logger = makeLogger();
      const uc = new CreateBranchUseCase(tenantRepo, branchRepo, auditService, undefined, geocoder as never, logger as never);

      await uc.execute({ tenantId: 'tenant-1', name: 'B', address: { ...ADDRESS }, actor: makeActor() });

      const branch = savedBranch();
      expect(branch.addressJson).not.toHaveProperty('latitude');
      expect(branch.geocodedPermanentlyAt).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', reason: 'no_results' }),
        'branch.geocode_failed_saved_without_coordinates',
      );
    });

    it('3. stores no coordinates and logs error on an account error', async () => {
      const geocoder = { geocode: vi.fn().mockRejectedValue(new MapboxPermanentGeocodingUnavailableError()) };
      const logger = makeLogger();
      const uc = new CreateBranchUseCase(tenantRepo, branchRepo, auditService, undefined, geocoder as never, logger as never);

      await uc.execute({ tenantId: 'tenant-1', name: 'B', address: { ...ADDRESS }, actor: makeActor() });

      const branch = savedBranch();
      expect(branch.addressJson).not.toHaveProperty('latitude');
      expect(branch.geocodedPermanentlyAt).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', code: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE' }),
        'branch.geocode_permanent_unavailable',
      );
    });

    it('4. times out at 4000ms and saves without coordinates (warn reason=timeout)', async () => {
      vi.useFakeTimers();
      try {
        const geocoder = { geocode: vi.fn().mockReturnValue(new Promise(() => {})) };
        const logger = makeLogger();
        const uc = new CreateBranchUseCase(tenantRepo, branchRepo, auditService, undefined, geocoder as never, logger as never);

        const promise = uc.execute({ tenantId: 'tenant-1', name: 'B', address: { ...ADDRESS }, actor: makeActor() });
        await vi.advanceTimersByTimeAsync(4000);
        await promise;

        const branch = savedBranch();
        expect(branch.geocodedPermanentlyAt).toBeNull();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ reason: 'timeout' }),
          'branch.geocode_failed_saved_without_coordinates',
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('5. ignores a client-supplied latitude/longitude on the address', async () => {
      const geocoder = { geocode: vi.fn().mockResolvedValue({ lat: -33.8, lng: 151.2 }) };
      const uc = new CreateBranchUseCase(tenantRepo, branchRepo, auditService, undefined, geocoder as never, makeLogger() as never);

      await uc.execute({
        tenantId: 'tenant-1',
        name: 'B',
        address: { ...ADDRESS, latitude: 1, longitude: 2 },
        actor: makeActor(),
      });

      // The query is built from the address text, never the client coords, and the
      // stored coords are the permanent geocode's, not the client's.
      expect(geocoder.geocode).toHaveBeenCalledWith('1 Main St, Suburb, City, NSW, 2000, AU', { mode: 'permanent' });
      expect(savedBranch().addressJson).toMatchObject({ latitude: -33.8, longitude: 151.2 });
    });

    it('6. does not call the geocoder when no address is given', async () => {
      const geocoder = { geocode: vi.fn() };
      const uc = new CreateBranchUseCase(tenantRepo, branchRepo, auditService, undefined, geocoder as never, makeLogger() as never);

      await uc.execute({ tenantId: 'tenant-1', name: 'B', actor: makeActor() });

      expect(geocoder.geocode).not.toHaveBeenCalled();
    });

    it('7. saves the address without coordinates when no geocoder is injected', async () => {
      const uc = new CreateBranchUseCase(tenantRepo, branchRepo, auditService);

      await uc.execute({ tenantId: 'tenant-1', name: 'B', address: { ...ADDRESS }, actor: makeActor() });

      const branch = savedBranch();
      expect(branch.addressJson).not.toHaveProperty('latitude');
      expect(branch.geocodedPermanentlyAt).toBeNull();
    });
  });
});
