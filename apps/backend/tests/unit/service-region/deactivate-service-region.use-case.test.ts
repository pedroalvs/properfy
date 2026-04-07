import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeactivateServiceRegionUseCase } from '../../../src/modules/service-region/application/use-cases/deactivate-service-region.use-case';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import {
  ServiceRegionNotFoundError,
  ServiceRegionAlreadyInactiveError,
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
    useCase = new DeactivateServiceRegionUseCase(regionRepo, auditService);
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

  it('should reject when actor has no tenantId', async () => {
    await expect(
      useCase.execute({
        regionId: 'region-1',
        reason: 'Test',
        actor: makeActor({ tenantId: null }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should emit service_region.deactivated.v1 event after deactivation', async () => {
    const eventBus = new DomainEventBus();
    const emitSpy = vi.spyOn(eventBus, 'emit');
    const useCaseWithEvents = new DeactivateServiceRegionUseCase(regionRepo, auditService, eventBus);

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
    const useCaseNoEvents = new DeactivateServiceRegionUseCase(regionRepo, auditService);

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
});
