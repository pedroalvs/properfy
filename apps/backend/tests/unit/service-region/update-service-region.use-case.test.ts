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

  it('should update scoped by tenant derived from entity', async () => {
    await useCase.execute({
      regionId: 'region-1',
      name: 'New Name',
      actor: makeActor(),
    });

    // findById is called with actor.tenantId (tenant-1), then tenantId derived from entity
    expect(regionRepo.findById).toHaveBeenCalledWith('region-1', 'tenant-1');
    expect(regionRepo.update).toHaveBeenCalledWith('region-1', 'tenant-1', { name: 'New Name' });
  });

  it('should allow AM with null JWT tenantId by deriving tenantId from entity', async () => {
    await useCase.execute({
      regionId: 'region-1',
      name: 'Updated by AM',
      actor: makeActor({ tenantId: null }),
    });

    // findById called with null (AM loads unscoped), update uses region.tenantId
    expect(regionRepo.findById).toHaveBeenCalledWith('region-1', null);
    expect(regionRepo.update).toHaveBeenCalledWith('region-1', 'tenant-1', { name: 'Updated by AM' });
  });

  it('propagates the name conflict raised by the DB constraint via the repo (#614)', async () => {
    // The race-prone pre-check is gone; uniqueness is enforced by the unique
    // index, whose violation the repository translates before it reaches here.
    vi.mocked(regionRepo.update).mockRejectedValue(new ServiceRegionNameConflictError());

    await expect(
      useCase.execute({
        regionId: 'region-1',
        name: 'Existing Name',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceRegionNameConflictError);
  });

  it('no longer issues an app-level findByName pre-check on rename (#614)', async () => {
    await useCase.execute({
      regionId: 'region-1',
      name: 'A New Name',
      actor: makeActor(),
    });

    expect(regionRepo.findByName).not.toHaveBeenCalled();
    expect(regionRepo.update).toHaveBeenCalledWith('region-1', 'tenant-1', { name: 'A New Name' });
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

  it('should throw NotFound when region not found for AM with null tenantId', async () => {
    vi.mocked(regionRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        regionId: 'region-1',
        actor: makeActor({ tenantId: null }),
      }),
    ).rejects.toThrow(ServiceRegionNotFoundError);
  });

  it('should reject CL_USER role', async () => {
    await expect(
      useCase.execute({
        regionId: 'region-1',
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('echoes the persisted updatedAt, not a synthetic timestamp (#615)', async () => {
    const persistedUpdatedAt = new Date('2020-01-02T03:04:05.000Z');
    const persisted = new ServiceRegionEntity({
      id: 'region-1',
      tenantId: 'tenant-1',
      name: 'Renamed',
      geojson: {},
      color: '#3b82f6',
      status: 'ACTIVE',
      createdByUserId: 'user-1',
      createdAt: new Date('2019-01-01T00:00:00.000Z'),
      updatedAt: persistedUpdatedAt,
    });
    // First findById is the guard load, second is the re-read after update.
    vi.mocked(regionRepo.findById)
      .mockResolvedValueOnce(makeRegion())
      .mockResolvedValueOnce(persisted);

    const result = await useCase.execute({
      regionId: 'region-1',
      name: 'Renamed',
      actor: makeActor(),
    });

    expect(result.updatedAt).toEqual(persistedUpdatedAt);
  });
});
