import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeactivateServiceRegionUseCase } from '../../../src/modules/service-region/application/use-cases/deactivate-service-region.use-case';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import {
  ServiceRegionNotFoundError,
  ServiceRegionAlreadyInactiveError,
  ServiceRegionHasPublishedGroupsError,
} from '../../../src/modules/service-region/domain/service-region.errors';
import { ServiceRegionEntity } from '../../../src/modules/service-region/domain/service-region.entity';
import { DomainEventBus, SERVICE_REGION_EVENTS } from '../../../src/shared/application/events/domain-event-bus';

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

describe('DeactivateServiceRegionUseCase', () => {
  let regionRepo: IServiceRegionRepository;
  let auditService: AuditService;
  let useCase: DeactivateServiceRegionUseCase;

  beforeEach(() => {
    regionRepo = createMockRepo();
    auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new DeactivateServiceRegionUseCase(regionRepo, auditService, authorizationService);
  });

  it('should deactivate a region scoped by tenant', async () => {
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

    const result = await useCase.execute({
      regionId: 'region-1',
      reason: 'No longer needed',
      actor: makeActor(),
    });

    expect(result.status).toBe('INACTIVE');
    expect(regionRepo.update).toHaveBeenCalledWith('region-1', 'tenant-1', { status: 'INACTIVE' });
    expect(regionRepo.findById).toHaveBeenCalledWith('region-1', 'tenant-1');
  });

  it('should throw when region is already inactive', async () => {
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

    await expect(
      useCase.execute({
        regionId: 'region-1',
        reason: 'Test',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceRegionAlreadyInactiveError);
  });

  it('should throw NotFound for cross-tenant access', async () => {
    vi.mocked(regionRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        regionId: 'region-1',
        reason: 'Test',
        actor: makeActor({ tenantId: 'other-tenant' }),
      }),
    ).rejects.toThrow(ServiceRegionNotFoundError);
  });

  it('AM with null tenantId can deactivate region — derives tenantId from entity (QA-013-HIGH-001)', async () => {
    const region = new ServiceRegionEntity({
      id: 'region-1',
      tenantId: 'tenant-from-db',
      name: 'Test',
      geojson: {},
      color: '#3b82f6',
      status: 'ACTIVE',
      createdByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(regionRepo.findById).mockResolvedValue(region);

    const result = await useCase.execute({
      regionId: 'region-1',
      reason: 'Test',
      actor: makeActor({ role: 'AM', tenantId: null }),
    });

    expect(result.status).toBe('INACTIVE');
    expect(regionRepo.findById).toHaveBeenCalledWith('region-1', null);
    expect(regionRepo.update).toHaveBeenCalledWith('region-1', 'tenant-from-db', { status: 'INACTIVE' });
  });

  it('should emit service_region.deactivated.v1 event after deactivation', async () => {
    const eventBus = new DomainEventBus();
    const emitSpy = vi.spyOn(eventBus, 'emit');
    const useCaseWithEvents = new DeactivateServiceRegionUseCase(regionRepo, auditService, new AuthorizationService(auditService), eventBus);

    const region = new ServiceRegionEntity({
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

    await useCaseWithEvents.execute({
      regionId: 'region-1',
      reason: 'Consolidating regions',
      actor: makeActor(),
    });

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SERVICE_REGION_EVENTS.DEACTIVATED,
        payload: { regionId: 'region-1', tenantId: 'tenant-1', regionName: 'Sydney CBD' },
      }),
    );
  });

  it('should not fail when no event bus is provided', async () => {
    const useCaseNoEvents = new DeactivateServiceRegionUseCase(regionRepo, auditService, new AuthorizationService(auditService));

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

    const result = await useCaseNoEvents.execute({
      regionId: 'region-1',
      reason: 'Test',
      actor: makeActor(),
    });

    expect(result.status).toBe('INACTIVE');
  });

  it('should block deactivation when published service groups reference the region', async () => {
    const region = new ServiceRegionEntity({
      id: 'region-1', tenantId: 'tenant-1', name: 'Guarded', geojson: {},
      color: '#3b82f6', status: 'ACTIVE', createdByUserId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    vi.mocked(regionRepo.findById).mockResolvedValue(region);
    vi.mocked(regionRepo.countPublishedGroupsByRegionId).mockResolvedValue(2);

    await expect(
      useCase.execute({
        regionId: 'region-1',
        reason: 'Test',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceRegionHasPublishedGroupsError);

    expect(regionRepo.update).not.toHaveBeenCalled();
  });

  it('should allow deactivation when no published groups reference the region', async () => {
    const region = new ServiceRegionEntity({
      id: 'region-1', tenantId: 'tenant-1', name: 'Safe', geojson: {},
      color: '#3b82f6', status: 'ACTIVE', createdByUserId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    vi.mocked(regionRepo.findById).mockResolvedValue(region);
    vi.mocked(regionRepo.countPublishedGroupsByRegionId).mockResolvedValue(0);

    const result = await useCase.execute({
      regionId: 'region-1',
      reason: 'No more coverage',
      actor: makeActor(),
    });

    expect(result.status).toBe('INACTIVE');
    expect(regionRepo.update).toHaveBeenCalled();
  });
});
