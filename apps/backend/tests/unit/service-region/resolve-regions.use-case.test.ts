import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResolveRegionsUseCase } from '../../../src/modules/service-region/application/use-cases/resolve-regions.use-case';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';

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
    findContainingPoint: vi.fn(),
    countPublishedGroupsByRegionId: vi.fn().mockResolvedValue(0).mockResolvedValue([]),
    countActiveInspectorsInRegion: vi.fn().mockResolvedValue(0),
    countActiveInspectorsInRegions: vi.fn().mockResolvedValue(new Map()),
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
    const auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new ResolveRegionsUseCase(regionRepo, authorizationService);
  });

  it('should resolve regions for the appointments (cross-tenant, no tenant scoping)', async () => {
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

    expect(regionRepo.resolveRegionsForAppointments).toHaveBeenCalledWith(['apt-1', 'apt-2', 'apt-3']);
    expect(result.regions).toHaveLength(1);
    expect(result.unmatchedAppointmentIds).toEqual(['apt-3']);
  });

  it('should resolve for AM with no JWT tenantId and no body tenantId (no 403)', async () => {
    const result = await useCase.execute({
      appointmentIds: ['apt-1'],
      actor: makeActor({ tenantId: null }),
    });

    expect(regionRepo.resolveRegionsForAppointments).toHaveBeenCalledWith(['apt-1']);
    expect(result.totalAppointments).toBe(1);
  });

  it('should ignore any body-supplied tenantId (no longer used for matching)', async () => {
    await useCase.execute({
      appointmentIds: ['apt-1'],
      tenantId: 'tenant-from-body',
      actor: makeActor({ role: 'OP', tenantId: null }),
    });

    expect(regionRepo.resolveRegionsForAppointments).toHaveBeenCalledWith(['apt-1']);
  });

  it('issues exactly one batched inspector-count call and maps results, absent region → 0 (#731)', async () => {
    vi.mocked(regionRepo.resolveRegionsForAppointments).mockResolvedValue([
      { regionId: 'r1', regionNumber: 1, regionName: 'A', color: '#111', matchedAppointmentIds: ['a1'] },
      { regionId: 'r2', regionNumber: 2, regionName: 'B', color: '#222', matchedAppointmentIds: ['a2'] },
      { regionId: 'r3', regionNumber: 3, regionName: 'C', color: '#333', matchedAppointmentIds: ['a3'] },
    ]);
    vi.mocked(regionRepo.countActiveInspectorsInRegions).mockResolvedValue(
      new Map([['r1', 5], ['r2', 0]]), // r3 deliberately absent → must map to 0
    );

    const result = await useCase.execute({
      appointmentIds: ['a1', 'a2', 'a3'],
      actor: makeActor(),
    });

    expect(regionRepo.countActiveInspectorsInRegions).toHaveBeenCalledTimes(1);
    expect(regionRepo.countActiveInspectorsInRegions).toHaveBeenCalledWith(['r1', 'r2', 'r3']);
    // The per-region N+1 loop must be gone.
    expect(regionRepo.countActiveInspectorsInRegion).not.toHaveBeenCalled();

    const counts = Object.fromEntries(result.regions.map((r) => [r.regionId, r.inspectorCount]));
    expect(counts).toEqual({ r1: 5, r2: 0, r3: 0 });
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
