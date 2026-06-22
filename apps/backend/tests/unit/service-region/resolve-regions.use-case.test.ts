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

  it('should reject INSP role', async () => {
    await expect(
      useCase.execute({
        appointmentIds: ['apt-1'],
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
