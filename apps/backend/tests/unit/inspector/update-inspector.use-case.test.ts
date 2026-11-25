import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateInspectorUseCase } from '../../../src/modules/inspector/application/use-cases/update-inspector.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ADDRESS_NOT_VERIFIED_CODE } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import {
  InspectorNotFoundError,
  InspectorEmailConflictError,
  InspectorBaseAddressNotVerifiedError,
} from '../../../src/modules/inspector/domain/inspector.errors';
import { MapboxPermanentGeocodingUnavailableError } from '../../../src/modules/property/domain/geocoding.service';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

function makeInspector(
  overrides: Partial<ConstructorParameters<typeof InspectorEntity>[0]> = {},
): InspectorEntity {
  return new InspectorEntity({
    id: 'inspector-1',
    name: 'John Inspector',
    email: 'john@example.com',
    phone: '+61400000000',
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [{ serviceTypeId: 'service-1', certified: false }],
    blockedClientsJson: [],
    fullName: null,
    address: null,
    baseLat: null,
    baseLng: null,
    baseGeocodedAt: null,
    appInstalledAt: null,
    appLastSeenAt: null,
    pushEnabled: null,
    appVersion: null,
    abn: null,
    dateOfBirth: null,
    insuranceFileKey: null,
    insuranceExpiresAt: null,
    policeCheckFileKey: null,
    policeCheckExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

const BASE_ADDRESS = {
  street: '1 George St',
  suburb: 'Sydney',
  city: 'Sydney',
  state: 'NSW' as const,
  postcode: '2000',
  country: 'AU' as const,
};

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

describe('UpdateInspectorUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let auditService: AuditService;
  let useCase: UpdateInspectorUseCase;

  beforeEach(() => {
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      recordAppState: vi.fn(),
      findByRegionId: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new UpdateInspectorUseCase(inspectorRepo, auditService, authorizationService, undefined);
  });

  it('should update inspector for AM', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());

    const result = await useCase.execute({
      inspectorId: 'inspector-1',
      data: { name: 'Updated Name' },
      actor: makeActor(),
    });

    expect(result.name).toBe('Updated Name');
    expect(inspectorRepo.update).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inspector.updated' }),
    );
  });

  it('should reject CL_ADMIN with AUTH_FORBIDDEN', async () => {
    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        data: { name: 'Test' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw INSPECTOR_NOT_FOUND when not found', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: 'inspector-999',
        data: { name: 'Test' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorNotFoundError);
  });

  // Regression: PATCH must persist `blockedClients` and profile fields. Before
  // this fix the use case silently dropped them, which made it impossible to
  // clear an inspector's blocked-tenant list via the UI and caused the
  // INSPECTOR_INELIGIBLE failure in the marketplace accept flow.
  it('persists blockedClients and profile fields on update', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector({ blockedClientsJson: ['tenant-X'] }));

    await useCase.execute({
      inspectorId: 'inspector-1',
      data: {
        blockedClients: [],
        fullName: 'Mike Inspector',
        abn: '12345678901',
        dateOfBirth: '1990-01-15',
        insuranceFileKey: 'ins-key-1',
        insuranceExpiresAt: '2027-01-01',
        policeCheckFileKey: 'pc-key-1',
        policeCheckExpiresAt: '2027-06-01',
      },
      actor: makeActor(),
    });

    expect(inspectorRepo.update).toHaveBeenCalledWith(
      'inspector-1',
      expect.objectContaining({
        blockedClientsJson: [],
        fullName: 'Mike Inspector',
        abn: '12345678901',
        insuranceFileKey: 'ins-key-1',
        policeCheckFileKey: 'pc-key-1',
      }),
    );
    // Date fields are converted to Date objects.
    const call = vi.mocked(inspectorRepo.update).mock.calls[0]![1];
    expect(call.dateOfBirth).toBeInstanceOf(Date);
    expect(call.insuranceExpiresAt).toBeInstanceOf(Date);
    expect(call.policeCheckExpiresAt).toBeInstanceOf(Date);
  });

  it('clears nullable profile fields when set to null', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({ fullName: 'Old Name', abn: '999', dateOfBirth: new Date('2000-01-01') }),
    );

    await useCase.execute({
      inspectorId: 'inspector-1',
      data: { fullName: null, abn: null, dateOfBirth: null },
      actor: makeActor(),
    });

    expect(inspectorRepo.update).toHaveBeenCalledWith(
      'inspector-1',
      expect.objectContaining({
        fullName: null,
        abn: null,
        dateOfBirth: null,
      }),
    );
  });

  // Regression (WI-10 / #580): an explicit null phone clear must survive into both
  // the audit `after` object and the HTTP response. `?? inspector.phone` silently
  // rewrites null back to the old number.
  it('preserves an explicit null phone clear in audit and response', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector({ phone: '+61400000000' }));

    const result = await useCase.execute({
      inspectorId: 'inspector-1',
      data: { phone: null },
      actor: makeActor(),
    });

    expect(result.phone).toBeNull();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ after: expect.objectContaining({ phone: null }) }),
    );
  });

  it('should throw INSPECTOR_EMAIL_CONFLICT on email change', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(
      makeInspector({ id: 'inspector-2', email: 'existing@example.com' }),
    );

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        data: { email: 'existing@example.com' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorEmailConflictError);
  });

  describe('F01-1 base address geocoding (TASK-F01-1)', () => {
    let geocoder: { geocode: ReturnType<typeof vi.fn> };
    let eventBus: { emit: ReturnType<typeof vi.fn> };
    let geoUseCase: UpdateInspectorUseCase;

    beforeEach(() => {
      geocoder = { geocode: vi.fn().mockResolvedValue({ lat: -33.86, lng: 151.2 }) };
      eventBus = { emit: vi.fn().mockResolvedValue(undefined) };
      geoUseCase = new UpdateInspectorUseCase(
        inspectorRepo,
        auditService,
        new AuthorizationService(auditService),
        undefined,
        undefined,
        geocoder as never,
        eventBus as never,
        { warn: vi.fn(), error: vi.fn() } as never,
      );
    });

    function updateCallData(): Record<string, unknown> {
      return vi.mocked(inspectorRepo.update).mock.calls[0][1] as Record<string, unknown>;
    }

    it('geocodes a new address and writes the new coordinates in one update', async () => {
      vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
      const result = await geoUseCase.execute({
        inspectorId: 'inspector-1',
        data: { address: BASE_ADDRESS },
        actor: makeActor(),
      });
      expect(inspectorRepo.update).toHaveBeenCalledTimes(1);
      const d = updateCallData();
      expect(d.baseLat).toBe(-33.86);
      expect(d.baseLng).toBe(151.2);
      expect(d.baseGeocodedAt).toBeInstanceOf(Date);
      expect(result.baseGeocodeFailed).toBe(false);
    });

    // V-3: only a provider-unavailable failure still saves without coordinates; a
    // rule-A rejection throws a 422 (covered below).
    it('clears the coordinates when the provider is unavailable', async () => {
      geocoder.geocode.mockRejectedValue(new MapboxPermanentGeocodingUnavailableError());
      vi.mocked(inspectorRepo.findById).mockResolvedValue(
        makeInspector({ address: { ...BASE_ADDRESS, street: 'Old St' }, baseLat: 1, baseLng: 2, baseGeocodedAt: new Date() }),
      );
      const result = await geoUseCase.execute({
        inspectorId: 'inspector-1',
        data: { address: BASE_ADDRESS },
        actor: makeActor(),
      });
      const d = updateCallData();
      expect(d.baseLat).toBeNull();
      expect(d.baseLng).toBeNull();
      expect(d.baseGeocodedAt).toBeNull();
      expect(result.baseGeocodeFailed).toBe(true);
    });

    // V-3: a rule-A rejection blocks the update with a 422 before the write.
    it('rejects the update with 422 ADDRESS_NOT_VERIFIED and persists nothing when the new address is unverifiable', async () => {
      geocoder.geocode.mockResolvedValue(null); // no_results → NOT_FOUND
      vi.mocked(inspectorRepo.findById).mockResolvedValue(
        makeInspector({ address: { ...BASE_ADDRESS, street: 'Old St' }, baseLat: 1, baseLng: 2, baseGeocodedAt: new Date() }),
      );
      const err = await geoUseCase
        .execute({ inspectorId: 'inspector-1', data: { address: BASE_ADDRESS }, actor: makeActor() })
        .catch((e) => e);
      expect(err).toBeInstanceOf(InspectorBaseAddressNotVerifiedError);
      expect(err.code).toBe(ADDRESS_NOT_VERIFIED_CODE);
      expect(err.details?.[0]).toMatchObject({ field: 'address', reason: 'NOT_FOUND' });
      expect(inspectorRepo.update).not.toHaveBeenCalled();
    });

    it('does not touch base fields when address is absent', async () => {
      vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector({ baseLat: 1, baseLng: 2 }));
      await geoUseCase.execute({ inspectorId: 'inspector-1', data: { name: 'X' }, actor: makeActor() });
      const d = updateCallData();
      expect(d).not.toHaveProperty('baseLat');
      expect(d).not.toHaveProperty('address');
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('skips geocoding and emits no event when the same address is resent with coordinates', async () => {
      vi.mocked(inspectorRepo.findById).mockResolvedValue(
        makeInspector({ address: BASE_ADDRESS, baseLat: -33.86, baseLng: 151.2, baseGeocodedAt: new Date() }),
      );
      await geoUseCase.execute({
        inspectorId: 'inspector-1',
        data: { address: BASE_ADDRESS },
        actor: makeActor(),
      });
      expect(geocoder.geocode).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it.each([
      ['state case/whitespace', { ...BASE_ADDRESS, state: 'nsw ' as never }],
      ['street case', { ...BASE_ADDRESS, street: '1 GEORGE ST' }],
    ])('treats %s as the same address (no geocode) via isSameGeocodingAddress', async (_label, next) => {
      vi.mocked(inspectorRepo.findById).mockResolvedValue(
        makeInspector({ address: BASE_ADDRESS, baseLat: -33.86, baseLng: 151.2, baseGeocodedAt: new Date() }),
      );
      await geoUseCase.execute({ inspectorId: 'inspector-1', data: { address: next }, actor: makeActor() });
      expect(geocoder.geocode).not.toHaveBeenCalled();
    });

    // V-3/V10: a legacy inspector whose base could not be located (parseable
    // address, null coordinates) must stay editable. A PATCH that resends the SAME
    // base (as the drawer does when only the phone changes) must NOT geocode and
    // must NOT 422 — before the fix this re-geocoded the unlocatable base and threw.
    it('does not geocode or reject when the unchanged base has no coordinates and a non-address field changes (V10)', async () => {
      vi.mocked(inspectorRepo.findById).mockResolvedValue(
        makeInspector({ address: BASE_ADDRESS, baseLat: null, baseLng: null, baseGeocodedAt: null }),
      );
      geocoder.geocode.mockResolvedValue(null); // would reject (NOT_FOUND) if it ran
      const result = await geoUseCase.execute({
        inspectorId: 'inspector-1',
        data: { phone: '+61400000000', address: BASE_ADDRESS },
        actor: makeActor(),
      });
      expect(geocoder.geocode).not.toHaveBeenCalled();
      expect(inspectorRepo.update).toHaveBeenCalledTimes(1);
      expect(result.baseGeocodeFailed).toBe(false);
    });

    // V-3/V10 (CC#3): a legacy stored base that does NOT parse the AU schema (here:
    // no `city`, which is required) but normalizes to the SAME geocoding query must
    // also be treated as unchanged — compared via the X02 helper, not the AU schema.
    // Before the fix the parse gate sent this through the geocoder and 422'd.
    it('does not geocode or reject when the unchanged base is a legacy non-AU-schema shape with the same normalized address (V10)', async () => {
      const legacyNoCity = { street: '1 George St', suburb: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' };
      vi.mocked(inspectorRepo.findById).mockResolvedValue(
        makeInspector({ address: legacyNoCity, baseLat: null, baseLng: null, baseGeocodedAt: null }),
      );
      geocoder.geocode.mockResolvedValue(null); // would reject (NOT_FOUND) if it ran
      const result = await geoUseCase.execute({
        inspectorId: 'inspector-1',
        data: { phone: '+61400000001', address: BASE_ADDRESS },
        actor: makeActor(),
      });
      expect(geocoder.geocode).not.toHaveBeenCalled();
      expect(inspectorRepo.update).toHaveBeenCalledTimes(1);
      expect(result.baseGeocodeFailed).toBe(false);
    });

    it('always geocodes when the current stored address is legacy/unparsable', async () => {
      vi.mocked(inspectorRepo.findById).mockResolvedValue(
        makeInspector({ address: { foo: 1 }, baseLat: 1, baseLng: 2, baseGeocodedAt: new Date() }),
      );
      await geoUseCase.execute({ inspectorId: 'inspector-1', data: { address: BASE_ADDRESS }, actor: makeActor() });
      expect(geocoder.geocode).toHaveBeenCalledTimes(1);
    });

    it('emits BASE_CHANGED after a real change with hadCoordinates/hasCoordinates', async () => {
      vi.mocked(inspectorRepo.findById).mockResolvedValue(
        makeInspector({ address: { ...BASE_ADDRESS, street: 'Old' }, baseLat: 10, baseLng: 20, baseGeocodedAt: new Date() }),
      );
      await geoUseCase.execute({ inspectorId: 'inspector-1', data: { address: BASE_ADDRESS }, actor: makeActor() });
      expect(eventBus.emit).toHaveBeenCalledTimes(1);
      expect(eventBus.emit.mock.calls[0][0].payload).toMatchObject({ hadCoordinates: true, hasCoordinates: true });
    });

    it('audits inspector.updated with address/baseLocated/baseGeocodedAt and no raw coordinates', async () => {
      vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
      await geoUseCase.execute({ inspectorId: 'inspector-1', data: { address: BASE_ADDRESS }, actor: makeActor() });
      const call = vi.mocked(auditService.log).mock.calls.find((c) => c[0].action === 'inspector.updated');
      const after = call![0].after as Record<string, unknown>;
      const before = call![0].before as Record<string, unknown>;
      expect(after.baseLocated).toBe(true);
      expect(after.baseGeocodedAt).toBeInstanceOf(Date);
      expect(after).not.toHaveProperty('baseLat');
      expect(before).toHaveProperty('baseLocated', false);
      expect(before).not.toHaveProperty('baseLng');
    });
  });
});
