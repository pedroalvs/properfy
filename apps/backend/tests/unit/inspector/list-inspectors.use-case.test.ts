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
    serviceTypesJson: ['service-1'],
    clientEligibilityJson: ['tenant-1'],
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
});
