import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateServiceRegionUseCase } from '../../../src/modules/service-region/application/use-cases/update-service-region.use-case';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ServiceRegionNotFoundError, ServiceRegionNameConflictError } from '../../../src/modules/service-region/domain/service-region.errors';
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
    findByName: vi.fn().mockResolvedValue(null),
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

function makeRegion(): ServiceRegionEntity {
  return new ServiceRegionEntity({
    id: 'region-1',
    tenantId: 'tenant-1',
    name: 'Sydney CBD',
    geojson: {},
    color: '#3b82f6',
    status: 'ACTIVE',
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('UpdateServiceRegionUseCase', () => {
  let regionRepo: IServiceRegionRepository;
  let auditService: AuditService;
  let useCase: UpdateServiceRegionUseCase;

  beforeEach(() => {
    regionRepo = createMockRepo();
    auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new UpdateServiceRegionUseCase(regionRepo, auditService, authorizationService);

    const region = makeRegion();
    vi.mocked(regionRepo.findById).mockResolvedValue(region);
  });

  it('should update scoped by tenant', async () => {
    const result = await useCase.execute({
      regionId: 'region-1',
      name: 'New Name',
      actor: makeActor(),
    });

    expect(regionRepo.update).toHaveBeenCalledWith('region-1', 'tenant-1', { name: 'New Name' });
    expect(regionRepo.findById).toHaveBeenCalledWith('region-1', 'tenant-1');
  });

  it('should check name uniqueness when changing name', async () => {
    vi.mocked(regionRepo.findByName).mockResolvedValue(makeRegion());

    await expect(
      useCase.execute({
        regionId: 'region-1',
        name: 'Existing Name',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceRegionNameConflictError);

    expect(regionRepo.findByName).toHaveBeenCalledWith('tenant-1', 'Existing Name');
  });

  it('should not check name uniqueness when name unchanged', async () => {
    await useCase.execute({
      regionId: 'region-1',
      name: 'Sydney CBD',
      actor: makeActor(),
    });

    expect(regionRepo.findByName).not.toHaveBeenCalled();
  });

  it('should throw NotFound when region belongs to another tenant', async () => {
    vi.mocked(regionRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        regionId: 'region-1',
        color: '#ff0000',
        actor: makeActor({ tenantId: 'tenant-2' }),
      }),
    ).rejects.toThrow(ServiceRegionNotFoundError);
  });

  it('should reject when actor has no tenantId', async () => {
    await expect(
      useCase.execute({
        regionId: 'region-1',
        actor: makeActor({ tenantId: null }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject CL_USER role', async () => {
    await expect(
      useCase.execute({
        regionId: 'region-1',
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
