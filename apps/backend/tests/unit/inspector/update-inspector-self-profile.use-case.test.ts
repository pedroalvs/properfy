import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateInspectorSelfProfileUseCase } from '../../../src/modules/inspector/application/use-cases/update-inspector-self-profile.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { InspectorNotFoundError } from '../../../src/modules/inspector/domain/inspector.errors';

const INSPECTOR_ID = '00000000-0000-0000-0000-000000000001';

function makeInspector(
  overrides: Partial<ConstructorParameters<typeof InspectorEntity>[0]> = {},
): InspectorEntity {
  return new InspectorEntity({
    id: INSPECTOR_ID,
    userId: 'user-insp-1',
    name: 'John Inspector',
    email: 'john@example.com',
    phone: '+61412345678',
    status: 'ACTIVE',
    paymentSettingsJson: { bankBsb: '062-000', bankAccount: '12345678' },
    serviceTypesJson: [],
    blockedClientsJson: [],
    fullName: 'John Michael Inspector',
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
    insuranceMetaJson: null,
    policeCheckFileKey: null,
    policeCheckExpiresAt: null,
    policeCheckMetaJson: null,
    photoStorageKey: null,
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

function makeInspActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-insp-1',
    tenantId: null,
    role: 'INSP',
    branchId: null,
    inspectorId: INSPECTOR_ID,
    ...overrides,
  };
}

describe('UpdateInspectorSelfProfileUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let auditService: AuditService;
  let useCase: UpdateInspectorSelfProfileUseCase;

  beforeEach(() => {
    inspectorRepo = {
      findById: vi.fn().mockResolvedValue(makeInspector()),
      findByEmail: vi.fn(),
      findByUserId: vi.fn(),
      linkUserId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      recordAppState: vi.fn(),
      findByRegionId: vi.fn(),
    } as unknown as IInspectorRepository;
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new UpdateInspectorSelfProfileUseCase(inspectorRepo, auditService);
  });

  it('should update phone for INSP self', async () => {
    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      data: { phone: '+61499999999' },
      actor: makeInspActor(),
    });

    expect(result.inspectorId).toBe(INSPECTOR_ID);
    expect(inspectorRepo.update).toHaveBeenCalledWith(INSPECTOR_ID, {
      phone: '+61499999999',
    });
  });

  it('should update fullName for INSP self', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      data: { fullName: 'John M. Inspector' },
      actor: makeInspActor(),
    });

    expect(inspectorRepo.update).toHaveBeenCalledWith(INSPECTOR_ID, {
      fullName: 'John M. Inspector',
    });
  });

  it('should update paymentSettings for INSP self', async () => {
    const newPayment = { bankBsb: '063-000', bankAccount: '87654321' };

    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      data: { paymentSettings: newPayment },
      actor: makeInspActor(),
    });

    expect(inspectorRepo.update).toHaveBeenCalledWith(INSPECTOR_ID, {
      paymentSettingsJson: newPayment,
    });
  });

  it('should update only provided fields (partial update)', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      data: { phone: '+61411111111' },
      actor: makeInspActor(),
    });

    const updateCall = vi.mocked(inspectorRepo.update).mock.calls[0]![1]!;
    expect(updateCall).toHaveProperty('phone');
    expect(updateCall).not.toHaveProperty('fullName');
    expect(updateCall).not.toHaveProperty('paymentSettingsJson');
  });

  it('should allow setting phone to null', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      data: { phone: null },
      actor: makeInspActor(),
    });

    expect(inspectorRepo.update).toHaveBeenCalledWith(INSPECTOR_ID, {
      phone: null,
    });
  });

  // Regression (WI-10 / #568): an explicit null clear must survive into the audit
  // `after` object. `?? inspector.field` silently rewrites null back to the old
  // value, so the audit trail would claim the field was never cleared.
  it('records an explicit null clear in the audit after object', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      data: { phone: null, fullName: null },
      actor: makeInspActor(),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ phone: null, fullName: null }),
      }),
    );
  });

  it('should throw ForbiddenError when non-INSP role tries to self-update', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        data: { phone: '+61400000000' },
        actor: { ...makeInspActor(), role: 'OP' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should throw ForbiddenError when INSP tries to update another inspector', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        data: { phone: '+61400000000' },
        actor: makeInspActor({ inspectorId: 'other-inspector-id' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should throw InspectorNotFoundError when inspector does not exist', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        data: { phone: '+61400000000' },
        actor: makeInspActor(),
      }),
    ).rejects.toBeInstanceOf(InspectorNotFoundError);
  });

  it('should audit the self-profile update', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      data: { phone: '+61499999999' },
      actor: makeInspActor(),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspector.self_profile_updated',
        actorType: 'USER',
        actorId: 'user-insp-1',
        entityType: 'Inspector',
        entityId: INSPECTOR_ID,
      }),
    );
  });

  describe('F01-1 base address (TASK-F01-1)', () => {
    let geocoder: { geocode: ReturnType<typeof vi.fn> };
    let eventBus: { emit: ReturnType<typeof vi.fn> };
    let geoUseCase: UpdateInspectorSelfProfileUseCase;

    beforeEach(() => {
      geocoder = { geocode: vi.fn().mockResolvedValue({ lat: -33.86, lng: 151.2 }) };
      eventBus = { emit: vi.fn().mockResolvedValue(undefined) };
      geoUseCase = new UpdateInspectorSelfProfileUseCase(
        inspectorRepo,
        auditService,
        geocoder as never,
        eventBus as never,
        { warn: vi.fn() } as never,
      );
    });

    it('geocodes the new base, audits without coordinates and emits BASE_CHANGED', async () => {
      const result = await geoUseCase.execute({
        inspectorId: INSPECTOR_ID,
        data: { address: BASE_ADDRESS },
        actor: makeInspActor(),
      });
      const d = vi.mocked(inspectorRepo.update).mock.calls[0][1] as Record<string, unknown>;
      expect(d.baseLat).toBe(-33.86);
      expect(result.baseGeocodeFailed).toBe(false);
      const call = vi.mocked(auditService.log).mock.calls[0][0];
      const after = call.after as Record<string, unknown>;
      expect(after.baseLocated).toBe(true);
      expect(after).not.toHaveProperty('baseLat');
      expect(eventBus.emit).toHaveBeenCalledTimes(1);
    });

    it('rejects another inspector with AUTH_FORBIDDEN', async () => {
      await expect(
        geoUseCase.execute({
          inspectorId: INSPECTOR_ID,
          data: { address: BASE_ADDRESS },
          actor: makeInspActor({ inspectorId: 'other' }),
        }),
      ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
    });

    it('reports baseGeocodeFailed on a geocode failure', async () => {
      geocoder.geocode.mockResolvedValue(null);
      const result = await geoUseCase.execute({
        inspectorId: INSPECTOR_ID,
        data: { address: BASE_ADDRESS },
        actor: makeInspActor(),
      });
      expect(result.baseGeocodeFailed).toBe(true);
    });

    it('leaves the base untouched when only the phone changes', async () => {
      await geoUseCase.execute({
        inspectorId: INSPECTOR_ID,
        data: { phone: '+61499999999' },
        actor: makeInspActor(),
      });
      const d = vi.mocked(inspectorRepo.update).mock.calls[0][1] as Record<string, unknown>;
      expect(d).not.toHaveProperty('address');
      expect(d).not.toHaveProperty('baseLat');
      expect(geocoder.geocode).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });
});
