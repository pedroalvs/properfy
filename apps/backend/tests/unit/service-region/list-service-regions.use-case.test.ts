import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListServiceRegionsUseCase } from '../../../src/modules/service-region/application/use-cases/list-service-regions.use-case';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
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
    findAll: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
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

function makeRegion(tenantId: string, name: string): ServiceRegionEntity {
  return new ServiceRegionEntity({
    id: crypto.randomUUID(),
    tenantId,
    name,
    geojson: {},
    color: '#3b82f6',
    status: 'ACTIVE',
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('ListServiceRegionsUseCase', () => {
  let regionRepo: IServiceRegionRepository;
  let useCase: ListServiceRegionsUseCase;

  beforeEach(() => {
    regionRepo = createMockRepo();
    const auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new ListServiceRegionsUseCase(regionRepo, authorizationService);
  });

  it('should list regions scoped by tenant', async () => {
    const region = makeRegion('tenant-1', 'Sydney CBD');
    vi.mocked(regionRepo.findAll).mockResolvedValue([region]);
    vi.mocked(regionRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 20, sortOrder: 'asc' },
      actor: makeActor(),
    });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(regionRepo.findAll).toHaveBeenCalledWith(
      'tenant-1',
      {},
      { page: 1, pageSize: 20, sortOrder: 'asc' },
    );
    expect(regionRepo.count).toHaveBeenCalledWith('tenant-1', {});
  });

  // Bug C-B1 (QA 2026-04-20): AM JWTs carry `tenantId: null`, so the
  // previous "tenant context required" guard locked platform-wide roles
  // out of the Service Regions page entirely. The use case now lets AM
  // (and OP) query cross-tenant, and honours `filters.tenantId` when the
  // caller narrows the list from the UI.
  it('allows AM with null tenantId to list cross-tenant', async () => {
    const regionA = makeRegion('tenant-1', 'Sydney CBD');
    const regionB = makeRegion('tenant-2', 'Melbourne CBD');
    vi.mocked(regionRepo.findAll).mockResolvedValue([regionA, regionB]);
    vi.mocked(regionRepo.count).mockResolvedValue(2);

    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 20, sortOrder: 'asc' },
      actor: makeActor({ tenantId: null }),
    });

    expect(result.data).toHaveLength(2);
    expect(regionRepo.findAll).toHaveBeenCalledWith(
      null,
      {},
      { page: 1, pageSize: 20, sortOrder: 'asc' },
    );
  });

  it('narrows AM listing to filters.tenantId when provided', async () => {
    const region = makeRegion('tenant-1', 'Sydney CBD');
    vi.mocked(regionRepo.findAll).mockResolvedValue([region]);
    vi.mocked(regionRepo.count).mockResolvedValue(1);

    await useCase.execute({
      filters: { tenantId: 'tenant-1' },
      pagination: { page: 1, pageSize: 20, sortOrder: 'asc' },
      actor: makeActor({ tenantId: null }),
    });

    expect(regionRepo.findAll).toHaveBeenCalledWith(
      null,
      { tenantId: 'tenant-1' },
      { page: 1, pageSize: 20, sortOrder: 'asc' },
    );
  });

  it('should reject CL_USER role', async () => {
    await expect(
      useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 20, sortOrder: 'asc' },
        actor: makeActor({ role: 'CL_USER' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should allow INSP role', async () => {
    vi.mocked(regionRepo.findAll).mockResolvedValue([]);
    vi.mocked(regionRepo.count).mockResolvedValue(0);

    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 20, sortOrder: 'asc' },
      actor: makeActor({ role: 'INSP' }),
    });

    expect(result.data).toHaveLength(0);
  });
});
