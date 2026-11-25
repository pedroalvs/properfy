import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdatePropertyUseCase } from '../../../src/modules/property/application/use-cases/update-property.use-case';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import {
  PropertyNotFoundError,
  PropertyAddressConflictError,
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
    type: 'HOUSE',
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

function makeGeocodingService(): { geocode: ReturnType<typeof vi.fn> } {
  return { geocode: vi.fn() };
}

describe('UpdatePropertyUseCase', () => {
  let propertyRepo: IPropertyRepository;
  let branchRepo: IBranchRepository;
  let auditService: AuditService;
  let logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };
  let useCase: UpdatePropertyUseCase;

  /** The invariant: no update() call may ever write MANUAL with a null coordinate. */
  function assertNoManualWithNullCoord() {
    for (const call of vi.mocked(propertyRepo.update).mock.calls) {
      const payload = call[2] as { geocodingStatus?: string; lat?: number | null; lng?: number | null };
      if (payload.geocodingStatus === 'MANUAL') {
        expect(payload.lat).not.toBeNull();
        expect(payload.lng).not.toBeNull();
        expect(payload.lat).toBeDefined();
        expect(payload.lng).toBeDefined();
      }
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    propertyRepo = {
      findById: vi.fn(),
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
    useCase = new UpdatePropertyUseCase(propertyRepo, branchRepo, auditService, logger as never);
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

  // R3 (V-1): the X02 "edit swaps the suggestion → PENDING + job" expectation
  // changed. An address edit now geocodes SYNCHRONOUSLY and, when the result
  // passes rule A, stores SUCCESS directly — no async job.
  it('geocodes synchronously and stores SUCCESS (not PENDING) when the new address verifies', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    const geocoder = makeGeocodingService();
    geocoder.geocode.mockResolvedValue({ lat: -33.87, lng: 151.21, placeType: 'address', relevance: 0.95 });
    const uc = new UpdatePropertyUseCase(propertyRepo, branchRepo, auditService, logger as never, geocoder as never);

    const result = await uc.execute({
      propertyId: 'prop-1',
      data: { street: '456 New St' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(geocoder.geocode).toHaveBeenCalledWith('456 New St, Sydney, NSW, 2000, AU', { mode: 'permanent' });
    expect(result.geocodingStatus).toBe('SUCCESS');
    expect(result.latitude).toBe(-33.87);
    expect(propertyRepo.update).toHaveBeenCalledWith(
      'prop-1',
      'tenant-1',
      expect.objectContaining({ geocodingStatus: 'SUCCESS', lat: -33.87, lng: 151.21 }),
    );
    expect(sendJob).not.toHaveBeenCalled();
  });

  it('rejects an address edit with 422 and writes nothing when the new address does not verify (V-1)', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    const geocoder = makeGeocodingService();
    geocoder.geocode.mockResolvedValue({ lat: -33.8, lng: 151.1, placeType: 'locality', relevance: 0.99 });
    const uc = new UpdatePropertyUseCase(propertyRepo, branchRepo, auditService, logger as never, geocoder as never);

    await expect(
      uc.execute({
        propertyId: 'prop-1',
        data: { street: 'Old Coach Rd' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toMatchObject({ code: 'ADDRESS_NOT_VERIFIED', statusCode: 422, details: [{ reason: 'COARSE_RESULT' }] });
    expect(propertyRepo.update).not.toHaveBeenCalled();
    expect(sendJob).not.toHaveBeenCalled();
  });

  it('rejects an address edit with 422 NOT_FOUND when the geocoder returns no match (V-1)', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    const geocoder = makeGeocodingService();
    geocoder.geocode.mockResolvedValue(null);
    const uc = new UpdatePropertyUseCase(propertyRepo, branchRepo, auditService, logger as never, geocoder as never);

    await expect(
      uc.execute({
        propertyId: 'prop-1',
        data: { street: 'Nowhere Rd' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toMatchObject({ code: 'ADDRESS_NOT_VERIFIED', statusCode: 422, details: [{ reason: 'NOT_FOUND' }] });
    expect(propertyRepo.update).not.toHaveBeenCalled();
  });

  it('keeps PENDING and enqueues the job when the geocoder times out on an address edit (V4 provider-down)', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    const geocoder = makeGeocodingService();
    geocoder.geocode.mockReturnValue(new Promise(() => {})); // never resolves → timeout wins
    const uc = new UpdatePropertyUseCase(propertyRepo, branchRepo, auditService, logger as never, geocoder as never, 20);

    const result = await uc.execute({
      propertyId: 'prop-1',
      data: { street: '456 New St' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.geocodingStatus).toBe('PENDING');
    expect(sendJob).toHaveBeenCalledWith('property.geocode', { propertyId: 'prop-1' }, { retryLimit: 6, retryBackoff: true });
  });

  it('does not call the geocoder when a manual coordinate pair is set on an address edit (manual wins)', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    const geocoder = makeGeocodingService();
    const uc = new UpdatePropertyUseCase(propertyRepo, branchRepo, auditService, logger as never, geocoder as never);

    const result = await uc.execute({
      propertyId: 'prop-1',
      data: { street: 'Old Coach Rd', latitude: -33.4521, longitude: 150.6612 },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(geocoder.geocode).not.toHaveBeenCalled();
    expect(result.geocodingStatus).toBe('MANUAL');
    assertNoManualWithNullCoord();
  });

  it('does not call the geocoder when editing only a non-address field on a FAILED record (V-1)', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty({ geocodingStatus: 'FAILED', lat: null, lng: null }));
    const geocoder = makeGeocodingService();
    const uc = new UpdatePropertyUseCase(propertyRepo, branchRepo, auditService, logger as never, geocoder as never);

    const result = await uc.execute({
      propertyId: 'prop-1',
      data: { notes: 'just a note' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(geocoder.geocode).not.toHaveBeenCalled();
    expect(result.notes).toBe('just a note');
    expect(propertyRepo.update).toHaveBeenCalled();
  });

  // V10 (fix): the property form always RE-SENDS the pre-filled address, so
  // "address field present in the body" was true on every screen edit and the
  // old `addressChanged` re-geocoded (and could 422) an UNCHANGED address.
  // `addressChanged` now compares the effective address to the STORED one.
  const SAME_ADDRESS = { street: '123 Main St', suburb: 'Sydney', postcode: '2000', state: 'NSW', country: 'AU' };

  it('V10 (a): identical address re-sent on a FAILED property → 200, no sync geocode, async recovery re-enqueued', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty({ geocodingStatus: 'FAILED', lat: null, lng: null }));
    const geocoder = makeGeocodingService();
    const uc = new UpdatePropertyUseCase(propertyRepo, branchRepo, auditService, logger as never, geocoder as never);

    const result = await uc.execute({ propertyId: 'prop-1', data: { ...SAME_ADDRESS }, actor: makeActor() });

    // The SYNC geocoder is never called (no 422 risk); pre-V-1 async recovery kept.
    expect(geocoder.geocode).not.toHaveBeenCalled();
    expect(result.geocodingStatus).toBe('PENDING');
    expect(sendJob).toHaveBeenCalledWith('property.geocode', { propertyId: 'prop-1' }, { retryLimit: 6, retryBackoff: true });
  });

  it('V10 (b): identical address re-sent on a SUCCESS property → 200, coordinate + marker intact, no geocode', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty()); // SUCCESS with coordinates
    const geocoder = makeGeocodingService();
    const uc = new UpdatePropertyUseCase(propertyRepo, branchRepo, auditService, logger as never, geocoder as never);

    const result = await uc.execute({ propertyId: 'prop-1', data: { ...SAME_ADDRESS, notes: 'edited' }, actor: makeActor() });

    expect(geocoder.geocode).not.toHaveBeenCalled();
    expect(sendJob).not.toHaveBeenCalled();
    expect(result.geocodingStatus).toBe('SUCCESS');
    const payload = vi.mocked(propertyRepo.update).mock.calls[0]![2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('geocodingStatus');
    expect(payload).not.toHaveProperty('lat');
    expect(payload).not.toHaveProperty('lng');
  });

  it('V10 (c): a CHANGED address that fails rule A still rejects with 422 and writes nothing', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    const geocoder = makeGeocodingService();
    geocoder.geocode.mockResolvedValue({ lat: -33.8, lng: 151.1, placeType: 'locality', relevance: 0.99 });
    const uc = new UpdatePropertyUseCase(propertyRepo, branchRepo, auditService, logger as never, geocoder as never);

    await expect(
      uc.execute({ propertyId: 'prop-1', data: { street: '999 Nowhere Rd' }, actor: makeActor() }),
    ).rejects.toMatchObject({ code: 'ADDRESS_NOT_VERIFIED', statusCode: 422, details: [{ reason: 'COARSE_RESULT' }] });
    expect(propertyRepo.update).not.toHaveBeenCalled();
  });

  it('V10 (d): a MANUAL pin re-sent identically stays MANUAL and never geocodes', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty({ geocodingStatus: 'MANUAL', lat: -33.8, lng: 151.1 }));
    const geocoder = makeGeocodingService();
    const uc = new UpdatePropertyUseCase(propertyRepo, branchRepo, auditService, logger as never, geocoder as never);

    const result = await uc.execute({
      propertyId: 'prop-1',
      data: { ...SAME_ADDRESS, latitude: -33.8, longitude: 151.1 },
      actor: makeActor(),
    });

    expect(geocoder.geocode).not.toHaveBeenCalled();
    expect(sendJob).not.toHaveBeenCalled();
    expect(result.geocodingStatus).toBe('MANUAL');
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

  it('should update property for OP cross-tenant (lookup not scoped to null JWT tenant)', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());

    const result = await useCase.execute({
      propertyId: 'prop-1',
      data: { notes: 'Updated by operator' },
      actor: makeActor({ role: 'OP', tenantId: null }),
    });

    expect(result.id).toBe('prop-1');
    // OP has no own tenant: the property lookup must be cross-tenant (null/no
    // scope), never filtered by a null tenant_id which would match nothing.
    expect(propertyRepo.findById).toHaveBeenCalledWith('prop-1', null);
    expect(propertyRepo.update).toHaveBeenCalled();
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

  // No geocoder wired (the default useCase) → the V4 fallback: PENDING + async job.
  it('falls back to PENDING when an address changes and no geocoder is wired', async () => {
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

  it('should throw PROPERTY_ADDRESS_CONFLICT when the new address matches another active property (not a 500)', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(propertyRepo.findByNormalizedAddress).mockResolvedValue(
      makeProperty({ id: 'prop-other', street: '456 New St' }),
    );

    await expect(
      useCase.execute({
        propertyId: 'prop-1',
        data: { street: '456 New St' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(PropertyAddressConflictError);
    expect(propertyRepo.update).not.toHaveBeenCalled();
  });

  it('does not conflict with itself when the address match found is the same property', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    // The lookup can legitimately return this same property (e.g. re-saving
    // the same address with only casing/whitespace differences).
    vi.mocked(propertyRepo.findByNormalizedAddress).mockResolvedValue(makeProperty());

    const result = await useCase.execute({
      propertyId: 'prop-1',
      data: { street: '123 Main St' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.street).toBe('123 Main St');
    expect(propertyRepo.update).toHaveBeenCalled();
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

  it('updates apartmentNumber when property is APARTMENT', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty({ type: 'APARTMENT' }));

    const result = await useCase.execute({
      propertyId: 'prop-1',
      data: { apartmentNumber: 'Apt 5C' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.apartmentNumber).toBe('Apt 5C');
    expect(propertyRepo.update).toHaveBeenCalledWith(
      'prop-1',
      'tenant-1',
      expect.objectContaining({ apartmentNumber: 'Apt 5C' }),
    );
  });

  it('force-nulls apartmentNumber when the effective type is not APARTMENT', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty({ type: 'HOUSE' }));

    const result = await useCase.execute({
      propertyId: 'prop-1',
      data: { apartmentNumber: 'Apt 5C' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.apartmentNumber).toBeNull();
    expect(propertyRepo.update).toHaveBeenCalledWith(
      'prop-1',
      'tenant-1',
      expect.objectContaining({ apartmentNumber: null }),
    );
  });

  it('clears apartmentNumber when type changes from APARTMENT to HOUSE', async () => {
    vi.mocked(propertyRepo.findById).mockResolvedValue(
      makeProperty({ type: 'APARTMENT', apartmentNumber: 'Apt 5C' }),
    );

    const result = await useCase.execute({
      propertyId: 'prop-1',
      data: { type: 'HOUSE' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.apartmentNumber).toBeNull();
    expect(propertyRepo.update).toHaveBeenCalledWith(
      'prop-1',
      'tenant-1',
      expect.objectContaining({ type: 'HOUSE', apartmentNumber: null }),
    );
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

    it('ignores null/null coords on a non-MANUAL property (never MANUAL-without-coord, dec. 16)', async () => {
      vi.mocked(propertyRepo.findById).mockResolvedValue(
        makeProperty({ geocodingStatus: 'SUCCESS', lat: -33.87, lng: 151.21 }),
      );

      const result = await useCase.execute({
        propertyId: 'prop-1',
        data: { latitude: null, longitude: null },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      });

      // null/null on a non-MANUAL property is ignored: status/coords/marker untouched.
      expect(result.geocodingStatus).toBe('SUCCESS');
      expect(propertyRepo.update).toHaveBeenCalledWith(
        'prop-1',
        'tenant-1',
        expect.not.objectContaining({ geocodingStatus: expect.any(String) }),
      );
      expect(logger.debug).toHaveBeenCalledWith(
        { propertyId: 'prop-1', geocodingStatus: 'SUCCESS' },
        'property.update_coordinates_null_ignored',
      );
      expect(sendJob).not.toHaveBeenCalled();
      assertNoManualWithNullCoord();
    });
  });

  describe('coordinate equality & invariant (X02-1)', () => {
    it('ignores coordinates equal to the stored pair: keeps SUCCESS, no lat/lng/status, no job', async () => {
      vi.mocked(propertyRepo.findById).mockResolvedValue(
        makeProperty({ geocodingStatus: 'SUCCESS', lat: -33.8688, lng: 151.2093 }),
      );

      const result = await useCase.execute({
        propertyId: 'prop-1',
        data: { latitude: -33.8688, longitude: 151.2093 },
        actor: makeActor(),
      });

      expect(result.geocodingStatus).toBe('SUCCESS');
      expect(result.latitude).toBe(-33.8688);
      expect(propertyRepo.update).toHaveBeenCalledWith(
        'prop-1',
        'tenant-1',
        expect.not.objectContaining({ geocodingStatus: expect.any(String) }),
      );
      const payload = vi.mocked(propertyRepo.update).mock.calls[0]![2] as Record<string, unknown>;
      expect('lat' in payload).toBe(false);
      expect('lng' in payload).toBe(false);
      // audit after still reflects SUCCESS
      const audit = vi.mocked(auditService.log).mock.calls[0]![0] as { after: { geocodingStatus: string } };
      expect(audit.after.geocodingStatus).toBe('SUCCESS');
      expect(sendJob).not.toHaveBeenCalled();
      assertNoManualWithNullCoord();
    });

    it('treats coordinates equal at 7 decimal places as unchanged', async () => {
      vi.mocked(propertyRepo.findById).mockResolvedValue(
        makeProperty({ geocodingStatus: 'SUCCESS', lat: -33.8688, lng: 151.2093 }),
      );

      const result = await useCase.execute({
        propertyId: 'prop-1',
        data: { latitude: -33.86880004, longitude: 151.20930002 },
        actor: makeActor(),
      });

      expect(result.geocodingStatus).toBe('SUCCESS');
      const payload = vi.mocked(propertyRepo.update).mock.calls[0]![2] as Record<string, unknown>;
      expect('geocodingStatus' in payload).toBe(false);
      expect(sendJob).not.toHaveBeenCalled();
    });

    it('re-geocodes (PENDING + job) when equal coords are sent WITH an address change, without nulling coords', async () => {
      vi.mocked(propertyRepo.findById).mockResolvedValue(
        makeProperty({ geocodingStatus: 'SUCCESS', lat: -33.8688, lng: 151.2093 }),
      );

      const result = await useCase.execute({
        propertyId: 'prop-1',
        data: { latitude: -33.8688, longitude: 151.2093, street: '2 New St' },
        actor: makeActor(),
      });

      expect(result.geocodingStatus).toBe('PENDING');
      const payload = vi.mocked(propertyRepo.update).mock.calls[0]![2] as Record<string, unknown>;
      expect(payload.geocodingStatus).toBe('PENDING');
      expect(payload.geocodedPermanentlyAt).toBeNull();
      expect('lat' in payload).toBe(false); // old coords kept until the worker runs
      expect(sendJob).toHaveBeenCalledWith('property.geocode', { propertyId: 'prop-1' }, { retryLimit: 6, retryBackoff: true });
      assertNoManualWithNullCoord();
    });

    it('re-geocodes on null/null + address change (PENDING + job), never MANUAL-without-coord', async () => {
      vi.mocked(propertyRepo.findById).mockResolvedValue(
        makeProperty({ geocodingStatus: 'SUCCESS', lat: -33.8688, lng: 151.2093 }),
      );

      const result = await useCase.execute({
        propertyId: 'prop-1',
        data: { latitude: null, longitude: null, street: '2 New St' },
        actor: makeActor(),
      });

      expect(result.geocodingStatus).toBe('PENDING');
      const payload = vi.mocked(propertyRepo.update).mock.calls[0]![2] as Record<string, unknown>;
      expect(payload.geocodingStatus).toBe('PENDING');
      expect(payload.geocodedPermanentlyAt).toBeNull();
      expect(payload.geocodingFailureCode).toBeNull();
      expect(sendJob).toHaveBeenCalled();
      assertNoManualWithNullCoord();
    });

    it('ignores an incomplete coordinate pair (one present, other null) on a SUCCESS property', async () => {
      vi.mocked(propertyRepo.findById).mockResolvedValue(
        makeProperty({ geocodingStatus: 'SUCCESS', lat: -33.8688, lng: 151.2093 }),
      );

      const result = await useCase.execute({
        propertyId: 'prop-1',
        data: { latitude: -33.9, longitude: null },
        actor: makeActor(),
      });

      expect(result.geocodingStatus).toBe('SUCCESS');
      const payload = vi.mocked(propertyRepo.update).mock.calls[0]![2] as Record<string, unknown>;
      expect('lat' in payload).toBe(false);
      expect('geocodingStatus' in payload).toBe(false);
      expect(sendJob).not.toHaveBeenCalled();
      assertNoManualWithNullCoord();
    });

    it('ignores null/null on PENDING and FAILED properties too', async () => {
      for (const status of ['PENDING', 'FAILED'] as const) {
        vi.clearAllMocks();
        vi.mocked(propertyRepo.findById).mockResolvedValue(
          makeProperty({ geocodingStatus: status, lat: null, lng: null }),
        );
        const result = await useCase.execute({
          propertyId: 'prop-1',
          data: { latitude: null, longitude: null },
          actor: makeActor(),
        });
        expect(result.geocodingStatus).toBe(status);
        const payload = vi.mocked(propertyRepo.update).mock.calls[0]![2] as Record<string, unknown>;
        expect('geocodingStatus' in payload).toBe(false);
        expect(sendJob).not.toHaveBeenCalled();
        assertNoManualWithNullCoord();
      }
    });

    it('sets MANUAL + clears the marker when a different coordinate pair is provided', async () => {
      vi.mocked(propertyRepo.findById).mockResolvedValue(
        makeProperty({ geocodingStatus: 'SUCCESS', lat: -33.8688, lng: 151.2093 }),
      );

      const result = await useCase.execute({
        propertyId: 'prop-1',
        data: { latitude: -33.9, longitude: 151.3 },
        actor: makeActor(),
      });

      expect(result.geocodingStatus).toBe('MANUAL');
      const payload = vi.mocked(propertyRepo.update).mock.calls[0]![2] as Record<string, unknown>;
      expect(payload).toMatchObject({ lat: -33.9, lng: 151.3, geocodingStatus: 'MANUAL', geocodedPermanentlyAt: null, geocodingFailureCode: null });
      expect(sendJob).not.toHaveBeenCalled();
      assertNoManualWithNullCoord();
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
