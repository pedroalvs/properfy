import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteServiceRegionUseCase } from '../../../src/modules/service-region/application/use-cases/delete-service-region.use-case';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import {
  ServiceRegionNotFoundError,
  ServiceRegionStillActiveError,
  ServiceRegionHasPublishedGroupsError,
} from '../../../src/modules/service-region/domain/service-region.errors';
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

describe('DeleteServiceRegionUseCase', () => {
  let regionRepo: IServiceRegionRepository;
  let auditService: AuditService;
  let useCase: DeleteServiceRegionUseCase;

  beforeEach(() => {
    regionRepo = createMockRepo();
    auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new DeleteServiceRegionUseCase(regionRepo, auditService, authorizationService);
  });

  it('should delete an inactive region scoped by tenant', async () => {
    const region = new ServiceRegionEntity({
      id: 'region-1',
      tenantId: 'tenant-1',
      name: 'Test',
      geojson: {},
      color: '#3b82f6',
      status: 'INACTIVE',
      createdByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(regionRepo.findById).mockResolvedValue(region);

    await useCase.execute({ regionId: 'region-1', actor: makeActor() });

    expect(regionRepo.delete).toHaveBeenCalledWith('region-1', 'tenant-1');
    expect(regionRepo.findById).toHaveBeenCalledWith('region-1', 'tenant-1');
  });

  it('should reject deletion of active region', async () => {
    const region = new ServiceRegionEntity({
      id: 'region-1',
      tenantId: 'tenant-1',
      name: 'Test',
      geojson: {},
      color: '#3b82f6',
      status: 'ACTIVE',
      createdByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(regionRepo.findById).mockResolvedValue(region);

    await expect(
      useCase.execute({ regionId: 'region-1', actor: makeActor() }),
    ).rejects.toThrow(ServiceRegionStillActiveError);
  });

  it('should throw NotFound for cross-tenant access', async () => {
    vi.mocked(regionRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ regionId: 'region-1', actor: makeActor({ tenantId: 'other-tenant' }) }),
    ).rejects.toThrow(ServiceRegionNotFoundError);
  });

  it('should allow AM with null tenantId to delete global region', async () => {
    const region = new ServiceRegionEntity({
      id: 'region-1',
      tenantId: null,
      name: 'Global Region',
      geojson: {},
      color: '#3b82f6',
      status: 'INACTIVE',
      createdByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(regionRepo.findById).mockResolvedValue(region);

    await useCase.execute({ regionId: 'region-1', actor: makeActor({ tenantId: null }) });

    expect(regionRepo.delete).toHaveBeenCalledWith('region-1', null);
  });

  it('should reject deletion of region referenced by published service groups', async () => {
    const region = new ServiceRegionEntity({
      id: 'region-1',
      tenantId: 'tenant-1',
      name: 'Test',
      geojson: {},
      color: '#3b82f6',
      status: 'INACTIVE',
      createdByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(regionRepo.findById).mockResolvedValue(region);
    vi.mocked(regionRepo.countPublishedGroupsByRegionId).mockResolvedValue(2);

    await expect(
      useCase.execute({ regionId: 'region-1', actor: makeActor() }),
    ).rejects.toThrow(ServiceRegionHasPublishedGroupsError);
    expect(regionRepo.delete).not.toHaveBeenCalled();
  });

  it('should log audit event on deletion', async () => {
    const region = new ServiceRegionEntity({
      id: 'region-1',
      tenantId: 'tenant-1',
      name: 'Test',
      geojson: {},
      color: '#3b82f6',
      status: 'INACTIVE',
      createdByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(regionRepo.findById).mockResolvedValue(region);

    await useCase.execute({ regionId: 'region-1', actor: makeActor() });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_region.deleted',
        entityId: 'region-1',
        after: null,
      }),
    );
  });
});
