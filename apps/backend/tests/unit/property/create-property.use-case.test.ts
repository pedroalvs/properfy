import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreatePropertyUseCase } from '../../../src/modules/property/application/use-cases/create-property.use-case';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import { PropertyCodeConflictError, PropertyAddressConflictError } from '../../../src/modules/property/domain/property.errors';
import { BranchNotFoundError } from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import { sendJob } from '../../../src/shared/infrastructure/queue';

vi.mock('../../../src/shared/infrastructure/queue', () => ({
  sendJob: vi.fn().mockResolvedValue('job-id'),
}));

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

function makeBranch(): BranchEntity {
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
      nextPropertyNumber: vi.fn().mockResolvedValue(1),
      findByPropertyCode: vi.fn(),
      findByNormalizedAddress: vi.fn(),
      findManyByNormalizedAddressKeys: vi.fn(),
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
      type: 'HOUSE',
      street: '123 Main St',
      suburb: 'Sydney',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      actor: makeActor(),
    });

    expect(result.geocodingStatus).toBe('PENDING');
    expect(result.propertyCode).toBe('PROP-0001');
    expect(result.tenantId).toBe('tenant-1');
    expect(result.id).toBeDefined();
    expect(propertyRepo.save).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'property.created' }),
    );
  });

  it('should persist and return the new optional detail fields', async () => {
    vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      type: 'APARTMENT',
      street: '9 Beach Rd',
      suburb: 'Manly',
      postcode: '2095',
      state: 'NSW',
      country: 'AU',
      privateAreaM2: 72.5,
      totalAreaM2: 90,
      furnished: true,
      linenProvided: false,
      rentAmount: 3200,
      actor: makeActor(),
    });

    expect(result.privateAreaM2).toBe(72.5);
    expect(result.totalAreaM2).toBe(90);
    expect(result.furnished).toBe(true);
    expect(result.linenProvided).toBe(false);
    expect(result.rentAmount).toBe(3200);
    const saved = vi.mocked(propertyRepo.save).mock.calls[0][0];
    expect(saved.privateAreaM2).toBe(72.5);
    expect(saved.totalAreaM2).toBe(90);
    expect(saved.furnished).toBe(true);
    expect(saved.linenProvided).toBe(false);
    expect(saved.rentAmount).toBe(3200);
  });

  it('should default new detail fields to null when omitted', async () => {
    vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      type: 'HOUSE',
      street: '1 Elm St',
      suburb: 'Sydney',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      actor: makeActor(),
    });

    expect(result.privateAreaM2).toBeNull();
    expect(result.totalAreaM2).toBeNull();
    expect(result.furnished).toBeNull();
    expect(result.linenProvided).toBeNull();
    expect(result.rentAmount).toBeNull();
  });

  it('should create property using actor.tenantId for CL_ADMIN', async () => {
    vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);

    const result = await useCase.execute({
      type: 'APARTMENT',
      street: '456 Business Ave',
      suburb: 'Melbourne',
      postcode: '3000',
      state: 'VIC',
      country: 'AU',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-2' }),
    });

    expect(result.tenantId).toBe('tenant-2');
    expect(result.type).toBe('APARTMENT');
    expect(propertyRepo.save).toHaveBeenCalled();
  });

  it('should create property for OP using explicit tenantId (cross-tenant)', async () => {
    vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      type: 'HOUSE',
      street: '123 Main St',
      suburb: 'Sydney',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      actor: makeActor({ role: 'OP', tenantId: null }),
    });

    expect(result.tenantId).toBe('tenant-1');
    expect(propertyRepo.save).toHaveBeenCalled();
  });

  it('should throw VALIDATION_ERROR when OP omits tenantId', async () => {
    await expect(
      useCase.execute({
          type: 'HOUSE',
        street: '123 Main St',
        suburb: 'Sydney',
        postcode: '2000',
        state: 'NSW',
        country: 'AU',
        actor: makeActor({ role: 'OP', tenantId: null }),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should reject INSP role', async () => {
    await expect(
      useCase.execute({
          type: 'HOUSE',
        street: '789 Inspector Rd',
        suburb: 'Brisbane',
        postcode: '4000',
        state: 'QLD',
        country: 'AU',
        actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  const baseCreateInput = {
    tenantId: 'tenant-1',
    type: 'HOUSE' as const,
    street: '123 Main St',
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'AU',
  };

  it('generates the code from the per-tenant sequential number', async () => {
    vi.mocked(propertyRepo.nextPropertyNumber).mockResolvedValue(42);

    const result = await useCase.execute({ ...baseCreateInput, actor: makeActor() });

    expect(propertyRepo.nextPropertyNumber).toHaveBeenCalledWith('tenant-1');
    expect(result.propertyCode).toBe('PROP-0042');
    const saved = vi.mocked(propertyRepo.save).mock.calls[0][0];
    expect(saved.propertyNumber).toBe(42);
    expect(saved.propertyCode).toBe('PROP-0042');
  });

  it('prefixes the generated code with the tenant appointment code prefix', async () => {
    const tenantRepo = {
      findById: vi.fn().mockResolvedValue(
        new TenantEntity({
          id: 'tenant-1',
          name: 'Test Agency',
          legalName: 'Test Agency Pty Ltd',
          status: 'ACTIVE',
          timezone: 'Australia/Sydney',
          currency: 'AUD',
          settingsJson: {},
          appointmentCodePrefix: 'ABC',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        }),
      ),
    } as unknown as ITenantRepository;
    vi.mocked(propertyRepo.nextPropertyNumber).mockResolvedValue(7);
    const uc = new CreatePropertyUseCase(propertyRepo, branchRepo, auditService, tenantRepo);

    const result = await uc.execute({ ...baseCreateInput, actor: makeActor() });

    expect(result.propertyCode).toBe('ABC-PROP-0007');
  });

  it('nulls apartmentNumber server-side when type is not APARTMENT', async () => {
    const result = await useCase.execute({
      ...baseCreateInput,
      type: 'HOUSE',
      apartmentNumber: 'Apt 9',
      actor: makeActor(),
    });

    expect(result.apartmentNumber).toBeNull();
    const saved = vi.mocked(propertyRepo.save).mock.calls[0][0];
    expect(saved.apartmentNumber).toBeNull();
  });

  it('persists and returns the optional apartmentNumber', async () => {
    const result = await useCase.execute({
      ...baseCreateInput,
      type: 'APARTMENT',
      apartmentNumber: 'Apt 12B',
      actor: makeActor(),
    });

    expect(result.apartmentNumber).toBe('Apt 12B');
    const saved = vi.mocked(propertyRepo.save).mock.calls[0][0];
    expect(saved.apartmentNumber).toBe('Apt 12B');
  });

  it('retries with a fresh number when a concurrent create wins the same code', async () => {
    vi.mocked(propertyRepo.nextPropertyNumber)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(6);
    vi.mocked(propertyRepo.save)
      .mockRejectedValueOnce(new PropertyCodeConflictError())
      .mockResolvedValueOnce(undefined);

    const result = await useCase.execute({ ...baseCreateInput, actor: makeActor() });

    expect(propertyRepo.save).toHaveBeenCalledTimes(2);
    expect(result.propertyCode).toBe('PROP-0006');
  });

  it('throws PROPERTY_CODE_CONFLICT after exhausting generation retries', async () => {
    vi.mocked(propertyRepo.save).mockRejectedValue(new PropertyCodeConflictError());

    await expect(
      useCase.execute({ ...baseCreateInput, actor: makeActor() }),
    ).rejects.toThrow(PropertyCodeConflictError);
    expect(propertyRepo.save).toHaveBeenCalledTimes(3);
  });

  it('should throw PROPERTY_ADDRESS_CONFLICT when an active property with the same address exists (not a 500)', async () => {
    vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);
    vi.mocked(propertyRepo.findByNormalizedAddress).mockResolvedValue(makeProperty());

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
          type: 'HOUSE',
        street: '123 Main St',
        suburb: 'Sydney',
        postcode: '2000',
        state: 'NSW',
        country: 'AU',
        actor: makeActor(),
      }),
    ).rejects.toThrow(PropertyAddressConflictError);
    expect(propertyRepo.save).not.toHaveBeenCalled();
  });

  it('should throw BRANCH_NOT_FOUND when branchId is invalid', async () => {
    vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);
    vi.mocked(branchRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'invalid-branch',
          type: 'HOUSE',
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
          type: 'HOUSE',
        street: '123 Main St',
        suburb: 'Sydney',
        postcode: '2000',
        state: 'NSW',
        country: 'AU',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should enqueue geocoding job after successful creation', async () => {
    vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      type: 'HOUSE',
      street: '123 Main St',
      suburb: 'Sydney',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      actor: makeActor(),
    });

    expect(sendJob).toHaveBeenCalledWith('property.geocode', {
      propertyId: result.id,
    }, { retryLimit: 6, retryBackoff: true });
  });

  it('logs the geocoding enqueue failure instead of swallowing it silently', async () => {
    vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);
    vi.mocked(sendJob).mockRejectedValueOnce(new Error('queue down'));
    const logger = {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
      fatal: vi.fn(), trace: vi.fn(), child: vi.fn(),
    } as any;
    const useCaseWithLogger = new CreatePropertyUseCase(
      propertyRepo, branchRepo, auditService, undefined, undefined, logger,
    );

    const result = await useCaseWithLogger.execute({
      tenantId: 'tenant-1',
      type: 'HOUSE',
      street: '1 Fail St',
      suburb: 'Sydney',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      actor: makeActor(),
    });

    // Creation must still succeed — a queue failure does not fail the request
    expect(result.id).toBeTruthy();
    expect(result.geocodingStatus).toBe('PENDING');

    // Flush the fire-and-forget .catch() microtask
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith(
      { propertyId: result.id, err: expect.any(Error) },
      'property.geocode_enqueue_failed',
    );
  });

  describe('synchronous geocoding (instant)', () => {
    beforeEach(() => {
      // sendJob is a shared module mock; clear call history so "not called" assertions
      // are not polluted by earlier tests in this file.
      vi.mocked(sendJob).mockClear();
    });

    function makeGeocodingService(): { geocode: ReturnType<typeof vi.fn> } {
      return { geocode: vi.fn() };
    }

    function makeLogger() {
      return {
        info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
        fatal: vi.fn(), trace: vi.fn(), child: vi.fn(),
      } as never;
    }

    const baseInput = {
      tenantId: 'tenant-1',
      type: 'HOUSE' as const,
      street: '1 Sync St',
      suburb: 'Sydney',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      actor: makeActor(),
    };

    it('geocodes synchronously and returns SUCCESS with coordinates, without enqueuing a job', async () => {
      vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);
      const geocodingService = makeGeocodingService();
      geocodingService.geocode.mockResolvedValue({ lat: -33.86, lng: 151.2 });
      const uc = new CreatePropertyUseCase(
        propertyRepo, branchRepo, auditService, undefined, undefined, makeLogger(),
        geocodingService as never,
      );

      const result = await uc.execute(baseInput);

      expect(geocodingService.geocode).toHaveBeenCalledWith('1 Sync St, Sydney, NSW, 2000, AU');
      expect(result.geocodingStatus).toBe('SUCCESS');
      expect(result.latitude).toBe(-33.86);
      expect(result.longitude).toBe(151.2);
      // Saved entity already carries the coordinates — no async round-trip needed.
      const saved = vi.mocked(propertyRepo.save).mock.calls[0]![0];
      expect(saved.geocodingStatus).toBe('SUCCESS');
      expect(saved.lat).toBe(-33.86);
      // Happy path must NOT touch the queue.
      expect(sendJob).not.toHaveBeenCalled();
    });

    it('marks FAILED (no async retry) when geocoding finds no match', async () => {
      vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);
      const geocodingService = makeGeocodingService();
      geocodingService.geocode.mockResolvedValue(null);
      const uc = new CreatePropertyUseCase(
        propertyRepo, branchRepo, auditService, undefined, undefined, makeLogger(),
        geocodingService as never,
      );

      const result = await uc.execute(baseInput);

      expect(result.geocodingStatus).toBe('FAILED');
      expect(result.latitude).toBeNull();
      expect(sendJob).not.toHaveBeenCalled();
    });

    it('falls back to PENDING and enqueues an async job when geocoding throws', async () => {
      vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);
      const geocodingService = makeGeocodingService();
      geocodingService.geocode.mockRejectedValue(new Error('mapbox 503'));
      const uc = new CreatePropertyUseCase(
        propertyRepo, branchRepo, auditService, undefined, undefined, makeLogger(),
        geocodingService as never,
      );

      const result = await uc.execute(baseInput);

      expect(result.geocodingStatus).toBe('PENDING');
      expect(sendJob).toHaveBeenCalledWith(
        'property.geocode',
        { propertyId: result.id },
        { retryLimit: 6, retryBackoff: true },
      );
    });

    it('falls back to PENDING and enqueues when geocoding exceeds the timeout', async () => {
      vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);
      const geocodingService = makeGeocodingService();
      // never resolves -> the timeout must win
      geocodingService.geocode.mockReturnValue(new Promise(() => {}));
      const uc = new CreatePropertyUseCase(
        propertyRepo, branchRepo, auditService, undefined, undefined, makeLogger(),
        geocodingService as never, 20,
      );

      const result = await uc.execute(baseInput);

      expect(result.geocodingStatus).toBe('PENDING');
      expect(sendJob).toHaveBeenCalledWith(
        'property.geocode',
        { propertyId: result.id },
        { retryLimit: 6, retryBackoff: true },
      );
    });
  });

  it('should validate branch and create property with branchId', async () => {
    vi.mocked(propertyRepo.findByPropertyCode).mockResolvedValue(null);
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      type: 'HOUSE',
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
