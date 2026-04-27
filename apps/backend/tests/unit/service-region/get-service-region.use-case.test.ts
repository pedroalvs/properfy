import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetServiceRegionUseCase } from '../../../src/modules/service-region/application/use-cases/get-service-region.use-case';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { ServiceRegionNotFoundError } from '../../../src/modules/service-region/domain/service-region.errors';
import { ServiceRegionEntity } from '../../../src/modules/service-region/domain/service-region.entity';

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
    resolveRegionsForAppointments: vi.fn(),
    findContainingPoint: vi.fn(),
    countPublishedGroupsByRegionId: vi.fn().mockResolvedValue(0),
    countActiveInspectorsInRegion: vi.fn(),
    setInspectorRegions: vi.fn(),
    getInspectorRegionIds: vi.fn(),
    getInspectorRegionIdsBatch: vi.fn(),
    delete: vi.fn(),
  };
}

function makeRegion(tenantId: string): ServiceRegionEntity {
  return new ServiceRegionEntity({
    id: 'region-1',
    tenantId,
    name: 'Sydney CBD',
    geojson: {},
    color: '#3b82f6',
    status: 'ACTIVE',
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('GetServiceRegionUseCase', () => {
  let regionRepo: IServiceRegionRepository;
  let useCase: GetServiceRegionUseCase;

  beforeEach(() => {
    regionRepo = createMockRepo();
    const auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new GetServiceRegionUseCase(regionRepo, authorizationService);
  });

  it('should get a region scoped by tenant', async () => {
    vi.mocked(regionRepo.findById).mockResolvedValue(makeRegion('tenant-1'));

    const result = await useCase.execute({
      regionId: 'region-1',
      actor: makeActor(),
    });

    expect(result.id).toBe('region-1');
    expect(result.name).toBe('Sydney CBD');
    expect(regionRepo.findById).toHaveBeenCalledWith('region-1', 'tenant-1');
  });

  it('should throw NotFound when region belongs to another tenant', async () => {
    vi.mocked(regionRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        regionId: 'region-1',
        actor: makeActor({ tenantId: 'tenant-2' }),
      }),
    ).rejects.toThrow(ServiceRegionNotFoundError);
  });

  // Bug C-B1 (QA 2026-04-20): AM JWTs carry `tenantId: null`. Regions
  // opened from the platform-wide list must be retrievable without a
  // tenant scope in the actor context.
  it('allows AM with null tenantId to fetch a region cross-tenant', async () => {
    const region = new (await import('../../../src/modules/service-region/domain/service-region.entity')).ServiceRegionEntity({
      id: 'region-1',
      tenantId: 'tenant-1',
      name: 'Sydney CBD',
      geojson: {},
      color: '#3b82f6',
      status: 'ACTIVE',
      createdByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(regionRepo.findById).mockResolvedValue(region);

    await useCase.execute({
      regionId: 'region-1',
      actor: makeActor({ tenantId: null }),
    });

    expect(regionRepo.findById).toHaveBeenCalledWith('region-1', null);
  });

  it('should allow OP role', async () => {
    vi.mocked(regionRepo.findById).mockResolvedValue(makeRegion('tenant-1'));

    await expect(
      useCase.execute({
        regionId: 'region-1',
        actor: makeActor({ role: 'OP', tenantId: null }),
      }),
    ).resolves.toBeDefined();
  });

  it('should allow INSP role', async () => {
    vi.mocked(regionRepo.findById).mockResolvedValue(makeRegion('tenant-1'));

    await expect(
      useCase.execute({
        regionId: 'region-1',
        actor: makeActor({ role: 'INSP' }),
      }),
    ).resolves.toBeDefined();
  });

  it('should reject CL_ADMIN role', async () => {
    await expect(
      useCase.execute({
        regionId: 'region-1',
        actor: makeActor({ role: 'CL_ADMIN' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject CL_USER role', async () => {
    await expect(
      useCase.execute({
        regionId: 'region-1',
        actor: makeActor({ role: 'CL_USER' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
