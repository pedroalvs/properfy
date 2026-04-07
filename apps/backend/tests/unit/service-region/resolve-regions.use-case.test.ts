import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResolveRegionsUseCase } from '../../../src/modules/service-region/application/use-cases/resolve-regions.use-case';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function createMockRepo(): IServiceRegionRepository {
  return {
    findById: vi.fn(),
    findByName: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    findPropertyIdsInInspectorRegions: vi.fn(),
    resolveRegionsForAppointments: vi.fn().mockResolvedValue([]),
    findContainingPoint: vi.fn().mockResolvedValue([]),
    countActiveInspectorsInRegion: vi.fn().mockResolvedValue(0),
    setInspectorRegions: vi.fn(),
    getInspectorRegionIds: vi.fn(),
    getInspectorRegionIdsBatch: vi.fn(),
    delete: vi.fn(),
  };
}

describe('ResolveRegionsUseCase', () => {
  let regionRepo: IServiceRegionRepository;
  let useCase: ResolveRegionsUseCase;

  beforeEach(() => {
    regionRepo = createMockRepo();
    useCase = new ResolveRegionsUseCase(regionRepo);
  });

  it('should resolve regions scoped by tenant', async () => {
    vi.mocked(regionRepo.resolveRegionsForAppointments).mockResolvedValue([
      {
        regionId: 'region-1',
        regionName: 'Sydney CBD',
        color: '#3b82f6',
        matchedAppointmentIds: ['apt-1', 'apt-2'],
      },
    ]);

    const result = await useCase.execute({
      appointmentIds: ['apt-1', 'apt-2', 'apt-3'],
      actor: makeActor(),
    });

    expect(regionRepo.resolveRegionsForAppointments).toHaveBeenCalledWith(
      'tenant-1',
      ['apt-1', 'apt-2', 'apt-3'],
    );
    expect(result.regions).toHaveLength(1);
    expect(result.unmatchedAppointmentIds).toEqual(['apt-3']);
  });

  it('should reject when actor has no tenantId', async () => {
    await expect(
      useCase.execute({
        appointmentIds: ['apt-1'],
        actor: makeActor({ tenantId: null }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject INSP role', async () => {
    await expect(
      useCase.execute({
        appointmentIds: ['apt-1'],
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
