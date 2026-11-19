import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListInspectorsUseCase } from '../../../src/modules/inspector/application/use-cases/list-inspectors.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
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

describe('ListInspectorsUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let serviceRegionRepo: IServiceRegionRepository;
  let useCase: ListInspectorsUseCase;

  beforeEach(() => {
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByUserId: vi.fn(),
      findAll: vi.fn().mockResolvedValue([makeInspector()]),
      count: vi.fn().mockResolvedValue(1),
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
      getInspectorRegionIdsBatch: vi.fn().mockResolvedValue(new Map([['inspector-1', ['region-1']]])),
      delete: vi.fn(),
    };
    useCase = new ListInspectorsUseCase(inspectorRepo, serviceRegionRepo);
  });

  it('should return all for AM', async () => {
    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor(),
    });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
  });

  it('should filter by eligibility for CL_ADMIN', async () => {
    await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(inspectorRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      expect.any(Object),
    );
    expect(inspectorRepo.count).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
  });

  it('should return single-item list for INSP own profile', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());

    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor({ role: 'INSP', inspectorId: 'inspector-1' }),
    });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(inspectorRepo.findById).toHaveBeenCalledWith('inspector-1');
  });

  it('should throw ForbiddenError when INSP has no inspectorId', async () => {
    await expect(
      useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
        actor: makeActor({ role: 'INSP', inspectorId: null }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should return empty list for INSP when inspector not found', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor({ role: 'INSP', inspectorId: 'inspector-1' }),
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  describe('F01-1 field visibility + filter (TASK-F01-1)', () => {
    it.each(['AM', 'OP'] as const)('includes address + base + adoption in %s list items (L-F01-07)', async (role) => {
      const result = await useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
        actor: makeActor({ role }),
      });
      const item = result.data[0] as Record<string, unknown>;
      for (const k of [...BASE_KEYS, ...ADOPTION_KEYS]) expect(item).toHaveProperty(k);
    });

    it('includes a legacy raw address object for AM/OP list items', async () => {
      vi.mocked(inspectorRepo.findAll).mockResolvedValue([makeInspector({ address: { foo: 1 }, baseLat: null, baseLng: null, baseGeocodedAt: null })]);
      const result = await useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
        actor: makeActor({ role: 'OP' }),
      });
      expect((result.data[0] as Record<string, unknown>).address).toEqual({ foo: 1 });
    });

    it('strips address, base and adoption from CL_ADMIN/CL_USER list items', async () => {
      for (const role of ['CL_ADMIN', 'CL_USER'] as const) {
        const result = await useCase.execute({
          filters: {},
          pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
          actor: makeActor({ role, tenantId: 'tenant-1' }),
        });
        const item = result.data[0] as Record<string, unknown>;
        for (const k of [...BASE_KEYS, ...ADOPTION_KEYS]) expect(item).not.toHaveProperty(k);
      }
    });

    it('INSP own list item includes base + address but not adoption', async () => {
      vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
      const result = await useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
        actor: makeActor({ role: 'INSP', inspectorId: 'inspector-1' }),
      });
      const item = result.data[0] as Record<string, unknown>;
      for (const k of BASE_KEYS) expect(item).toHaveProperty(k);
      for (const k of ADOPTION_KEYS) expect(item).not.toHaveProperty(k);
    });

    it('passes missingBaseAddress through for AM/OP', async () => {
      await useCase.execute({
        filters: { missingBaseAddress: true },
        pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
        actor: makeActor({ role: 'OP' }),
      });
      expect(inspectorRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ missingBaseAddress: true }),
        expect.any(Object),
      );
    });

    it('ignores missingBaseAddress for CL_* (cannot see base state)', async () => {
      await useCase.execute({
        filters: { missingBaseAddress: true },
        pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      });
      const passed = vi.mocked(inspectorRepo.findAll).mock.calls[0][0];
      expect(passed.missingBaseAddress).toBeUndefined();
    });
  });
});
