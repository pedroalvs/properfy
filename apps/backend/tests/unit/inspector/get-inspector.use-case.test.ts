import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetInspectorUseCase } from '../../../src/modules/inspector/application/use-cases/get-inspector.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { InspectorNotFoundError } from '../../../src/modules/inspector/domain/inspector.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

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
    address: { street: '1 George St', suburb: 'Sydney', city: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' },
    baseLat: -33.86,
    baseLng: 151.2,
    baseGeocodedAt: new Date('2026-10-30T00:00:00Z'),
    appInstalledAt: new Date('2026-10-30T00:00:00Z'),
    appLastSeenAt: new Date('2026-10-30T00:00:00Z'),
    pushEnabled: true,
    appVersion: '0.1.0',
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

const BASE_KEYS = ['address', 'baseLat', 'baseLng', 'baseGeocodedAt'] as const;
const ADOPTION_KEYS = ['appInstalledAt', 'appLastSeenAt', 'pushEnabled', 'appVersion'] as const;

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

describe('GetInspectorUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let serviceRegionRepo: IServiceRegionRepository;
  let useCase: GetInspectorUseCase;

  beforeEach(() => {
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByUserId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      recordAppState: vi.fn(),
      linkUserId: vi.fn(),
      findByRegionId: vi.fn(),
    };
    serviceRegionRepo = {
      findById: vi.fn(),
      findByName: vi.fn().mockResolvedValue(null),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      findPropertyIdsInInspectorRegions: vi.fn(),
      resolveRegionsForAppointments: vi.fn().mockResolvedValue([]),
      findContainingPoint: vi.fn().mockResolvedValue([]),
      countPublishedGroupsByRegionId: vi.fn().mockResolvedValue(0),
      countActiveInspectorsInRegion: vi.fn().mockResolvedValue(0),
      setInspectorRegions: vi.fn(),
      getInspectorRegionIds: vi.fn().mockResolvedValue(['region-1']),
      getInspectorRegionIdsBatch: vi.fn().mockResolvedValue(new Map()),
      delete: vi.fn(),
    };
    useCase = new GetInspectorUseCase(inspectorRepo, serviceRegionRepo);
  });

  it('should return inspector for AM', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());

    const result = await useCase.execute({
      inspectorId: 'inspector-1',
      actor: makeActor(),
    });

    expect(result.id).toBe('inspector-1');
    expect(result.name).toBe('John Inspector');
  });

  it('should return eligible inspector for CL_ADMIN', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({}),
    );

    const result = await useCase.execute({
      inspectorId: 'inspector-1',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.id).toBe('inspector-1');
  });

  it('should throw INSPECTOR_NOT_FOUND for CL_ADMIN when not eligible', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({ blockedClientsJson: ['tenant-1'] }),
    );

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(InspectorNotFoundError);
  });

  it('should throw INSPECTOR_NOT_FOUND when not found', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: 'inspector-999',
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorNotFoundError);
  });

  it('should return own inspector for INSP', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());

    const result = await useCase.execute({
      inspectorId: 'inspector-1',
      actor: makeActor({ role: 'INSP', inspectorId: 'inspector-1' }),
    });

    expect(result.id).toBe('inspector-1');
  });

  it('should throw ForbiddenError when INSP accesses another inspector', async () => {
    await expect(
      useCase.execute({
        inspectorId: 'other-inspector',
        actor: makeActor({ role: 'INSP', inspectorId: 'inspector-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ForbiddenError when INSP has no inspectorId', async () => {
    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'INSP', inspectorId: null }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  describe('F01-1 field visibility (TASK-F01-1, D7)', () => {
    beforeEach(() => {
      vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    });

    it.each(['AM', 'OP'] as const)('exposes base + adoption to %s', async (role) => {
      const result = await useCase.execute({ inspectorId: 'inspector-1', actor: makeActor({ role }) }) as Record<string, unknown>;
      for (const k of [...BASE_KEYS, ...ADOPTION_KEYS]) expect(result).toHaveProperty(k);
    });

    it('exposes base but not adoption to the inspector itself', async () => {
      const result = await useCase.execute({
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'INSP', inspectorId: 'inspector-1' }),
      }) as Record<string, unknown>;
      for (const k of BASE_KEYS) expect(result).toHaveProperty(k);
      for (const k of ADOPTION_KEYS) expect(result).not.toHaveProperty(k);
    });

    it.each(['CL_ADMIN', 'CL_USER'] as const)('hides base + adoption from %s', async (role) => {
      const result = await useCase.execute({
        inspectorId: 'inspector-1',
        actor: makeActor({ role, tenantId: 'tenant-1' }),
      }) as Record<string, unknown>;
      for (const k of [...BASE_KEYS, ...ADOPTION_KEYS]) expect(result).not.toHaveProperty(k);
      // Non-restricted fields still present.
      expect(result.id).toBe('inspector-1');
    });
  });
});
